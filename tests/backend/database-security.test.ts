import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const db = new PGlite();
const migration = readFileSync("supabase/migrations/20261106171331_audit_security_data_integrity.sql", "utf8");
const adminId = "00000000-0000-4000-8000-000000000001";
const deviceId = "00000000-0000-4000-8000-000000000002";

async function scalar(sql: string, params: unknown[] = []) {
  const result = await db.query<Record<string, unknown>>(sql, params);
  return Object.values(result.rows[0] ?? {})[0];
}

beforeAll(async () => {
  await db.exec(
    "create role anon; create role authenticated; create role service_role; create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);",
  );
  const baseline = readFileSync("supabase/schema.sql", "utf8")
    .split("-- AUDIT_SECURITY_DATA_INTEGRITY")[0]!
    .replace(/create extension if not exists pgcrypto;/i, "");
  await db.exec(baseline);
  await db.exec(migration);
}, 30000);
beforeEach(async () => {
  await db.exec("begin");
});
afterEach(async () => {
  await db.exec("rollback");
});
afterAll(async () => {
  await db.close();
});

async function seedAdmin() {
  await db.query(
    "insert into admin_users(id,username,display_name,password_hash,role) values($1,'test-admin','Test Admin','hash-v1','ADMIN')",
    [adminId],
  );
}
async function seedDevice() {
  await db.query("insert into devices(id,dedupe_key,hostname) values($1,'test-serial','TEST')", [deviceId]);
}

describe("device repair status migration", () => {
  it("adds the repair status to existing inventories and allows PCs to return to active", async () => {
    await db.exec(`alter table devices drop constraint devices_status_check,
      add constraint devices_status_check check (status in ('active', 'replace', 'stock', 'lost', 'retired'))`);
    await seedDevice();
    await db.exec(readFileSync("supabase/migrations/20261104120000_device_in_repair_status.sql", "utf8"));

    expect(await scalar("update devices set status='in_repair' where id=$1 returning status", [deviceId])).toBe(
      "in_repair",
    );
    expect(await scalar("update devices set status='active' where id=$1 returning status", [deviceId])).toBe("active");
    await expect(db.query("update devices set status='unsupported' where id=$1", [deviceId])).rejects.toThrow(
      /devices_status_check/,
    );
  });
});

describe("actual PostgreSQL security migration", () => {
  it("keeps a concurrently requeued file when an older cleanup snapshot finishes", async () => {
    await seedDevice();
    await db.query("insert into device_invoices(device_id,file_path) values($1,'test/race.pdf')", [deviceId]);
    const version = await scalar(
      "insert into invoice_cleanup_queue(file_path) values('test/race.pdf') returning version",
    );
    // A cleanup read saw the invoice still linked. Deletion requeues while that worker is active.
    await db.exec("delete from device_invoices");
    await db.query("delete from invoice_cleanup_queue where file_path='test/race.pdf' and version=$1", [version]);
    expect(await scalar("select count(*)::int from invoice_cleanup_queue")).toBe(1);
    expect(await scalar("select version from invoice_cleanup_queue")).not.toBe(version);
  });
  it("rejects duplicate invoice request IDs per device", async () => {
    await seedDevice();
    await db.query("insert into device_invoices(device_id,request_id) values($1,$2)", [deviceId, adminId]);
    await db.exec("savepoint duplicate_invoice");
    await expect(
      db.query("insert into device_invoices(device_id,request_id) values($1,$2)", [deviceId, adminId]),
    ).rejects.toThrow();
    await db.exec("rollback to savepoint duplicate_invoice");
    expect(await scalar("select count(*)::int from device_invoices")).toBe(1);
    expect(await scalar("select count(*)::int from device_history where event_type='INVOICE_ADDED'")).toBe(1);
  });
  it("accepts an account invitation atomically without returning the password hash", async () => {
    await db.exec(
      "insert into admin_user_invites(token_hash,token_prefix,username,display_name,email,role,expires_at) values('hash','prefix','invite-user','Test','invite@example.test','MANAGER',now()+interval '1 day')",
    );
    const account = await scalar("select accept_admin_invitation('hash','password-hash')");
    expect(account).toMatchObject({ username: "invite-user", role: "MANAGER" });
    expect(account).not.toHaveProperty("password_hash");
    expect(await scalar("select accepted_at is not null from admin_user_invites")).toBe(true);
    expect(await scalar("select count(*)::int from admin_users")).toBe(1);
    await expect(db.query("select accept_admin_invitation('hash','another-hash')")).rejects.toThrow("unavailable");
  });

  it("leaves an invitation unaccepted if account creation conflicts", async () => {
    await seedAdmin();
    await db.exec(
      "insert into admin_user_invites(token_hash,token_prefix,username,display_name,email,role,expires_at) values('hash','prefix','test-admin','Test','invite@example.test','ADMIN',now()+interval '1 day'); savepoint conflict;",
    );
    await expect(db.query("select accept_admin_invitation('hash','password-hash')")).rejects.toThrow();
    await db.exec("rollback to savepoint conflict");
    expect(await scalar("select accepted_at is null from admin_user_invites")).toBe(true);
    expect(await scalar("select count(*)::int from admin_users")).toBe(1);
  });

  it("rolls a sensitive mutation back if its transactional audit cannot be stored", async () => {
    await db.exec(
      "alter table audit_logs add constraint test_audit_failure check(action<>'db_insert'); savepoint audit_failure;",
    );
    await expect(seedDevice()).rejects.toThrow();
    await db.exec("rollback to savepoint audit_failure");
    expect(await scalar("select count(*)::int from devices")).toBe(0);
  });
  it.each(["password_hash='hash-v2'", "role='VIEWER'", "is_active=false"])(
    "revokes all sessions when %s",
    async (change) => {
      await seedAdmin();
      await db.query("select create_admin_session($1,'hash-v1',now()+interval '1 hour')", [adminId]);
      expect(await scalar("select count(*)::int from admin_sessions")).toBe(1);
      await db.exec(`update admin_users set ${change}`);
      expect(await scalar("select count(*)::int from admin_sessions")).toBe(0);
    },
  );

  it("deleting a user cascades sessions, while logout can remove just one session", async () => {
    await seedAdmin();
    const sid = await scalar("select create_admin_session($1,'hash-v1',now()+interval '1 hour')", [adminId]);
    await db.query("select create_admin_session($1,'hash-v1',now()+interval '1 hour')", [adminId]);
    await db.query("delete from admin_sessions where id=$1", [sid]);
    expect(await scalar("select count(*)::int from admin_sessions")).toBe(1);
    await db.exec("delete from admin_users");
    expect(await scalar("select count(*)::int from admin_sessions")).toBe(0);
  });

  it("rejects session minting with a stale password verification", async () => {
    await seedAdmin();
    await expect(
      db.query("select create_admin_session($1,'old-hash',now()+interval '1 hour')", [adminId]),
    ).rejects.toThrow("credentials changed");
  });

  it("persists bounded attempts and resets expired windows", async () => {
    expect(await scalar("select take_login_attempt('test',2,900)")).toBe(true);
    expect(await scalar("select take_login_attempt('test',2,900)")).toBe(true);
    expect(await scalar("select take_login_attempt('test',2,900)")).toBe(false);
    await db.exec("update login_attempt_windows set window_start=now()-interval '16 minutes'");
    expect(await scalar("select take_login_attempt('test',2,900)")).toBe(true);
  });

  it("consumes a one-use invite once and never consumes a revoked invite", async () => {
    await db.exec(
      "insert into collection_invites(invite_code,label,expires_at,max_uses) values('test','test',now()+interval '1 day',1)",
    );
    expect(await scalar("select consume_collection_invite('test')")).toBeTypeOf("string");
    expect(await scalar("select consume_collection_invite('test')")).toBeNull();
    await db.exec("update collection_invites set use_count=0,revoked_at=now()");
    expect(await scalar("select consume_collection_invite('test')")).toBeNull();
  });

  it("claims distinct work and rejects stale lease completions", async () => {
    await seedDevice();
    await db.exec("insert into devices(dedupe_key,hostname) values('second','SECOND')");
    const job = await scalar("insert into enrichment_jobs default values returning id");
    await db.query("select initialize_enrichment_job($1)", [job]);
    const a = (
      await db.query<{ device_id: string; claim_id: string }>("select * from claim_enrichment_items($1,1)", [job])
    ).rows[0]!;
    const b = (
      await db.query<{ device_id: string; claim_id: string }>("select * from claim_enrichment_items($1,1)", [job])
    ).rows[0]!;
    expect(a.device_id).not.toBe(b.device_id);
    await db.query("update enrichment_job_items set lease_until=now()-interval '1 minute' where device_id=$1", [
      a.device_id,
    ]);
    const retry = (await db.query<{ claim_id: string }>("select * from claim_enrichment_items($1,1)", [job])).rows[0]!;
    await db.query("select finish_enrichment_item($1,$2,$3,'{\"skipped\":true}')", [job, a.device_id, a.claim_id]);
    expect(await scalar("select processed_count from enrichment_jobs")).toBe(0);
    await db.query("select finish_enrichment_item($1,$2,$3,'{\"skipped\":true}')", [job, a.device_id, retry.claim_id]);
    await db.query("select finish_enrichment_item($1,$2,$3,'{\"failed\":true}')", [job, b.device_id, b.claim_id]);
    expect(
      (await db.query("select status,processed_count,skipped_count,failed_count from enrichment_jobs")).rows[0],
    ).toEqual({ status: "completed", processed_count: 2, skipped_count: 1, failed_count: 1 });
    expect((await db.query("select * from claim_enrichment_items($1,10)", [job])).rows).toHaveLength(0);
  });

  it("atomically invalidates deleted invoice provenance and queues files on cascading device delete", async () => {
    await seedDevice();
    await db.query(
      "insert into hardware_enrichment(device_id,valuation_method,book_value,valuation_confidence_label) values($1,'invoice_backed',1000,'A')",
      [deviceId],
    );
    await db.query(
      "insert into device_invoices(device_id,purchase_price,file_path) values($1,1000,'test/document.pdf')",
      [deviceId],
    );
    await db.exec(
      "update hardware_enrichment set valuation_method='invoice_backed',book_value=1000,valuation_confidence_label='A'",
    );
    await db.exec("delete from device_invoices");
    expect(
      (
        await db.query(
          "select book_value,valuation_method,valuation_confidence_label,enrichment_status from hardware_enrichment",
        )
      ).rows[0],
    ).toEqual({
      book_value: null,
      valuation_method: "fallback_estimate",
      valuation_confidence_label: "D",
      enrichment_status: "pending",
    });
    await db.query("insert into device_invoices(device_id,file_path) values($1,'test/second.pdf')", [deviceId]);
    await db.exec("delete from devices");
    expect(await scalar("select count(*)::int from invoice_cleanup_queue")).toBe(2);
    expect(await scalar("select count(*)::int from audit_logs where details->>'transactional'='true'")).toBeGreaterThan(
      0,
    );
  });

  it("revokes unnecessary API role privileges including TRUNCATE and function execution", async () => {
    expect(await scalar("select has_table_privilege('anon','enrichment_jobs','TRUNCATE')")).toBe(false);
    expect(await scalar("select has_table_privilege('authenticated','admin_sessions','SELECT')")).toBe(false);
    expect(await scalar("select has_function_privilege('anon','consume_collection_invite(text)','EXECUTE')")).toBe(
      false,
    );
    expect(
      await scalar("select has_function_privilege('service_role','consume_collection_invite(text)','EXECUTE')"),
    ).toBe(true);
  });
});
