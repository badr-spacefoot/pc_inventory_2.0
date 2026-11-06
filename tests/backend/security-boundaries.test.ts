import { afterEach, describe, expect, it, vi } from "vitest";
import {
  collectKeysetRows,
  fetchBoundedText,
  invoiceMimeMatches,
  publicStorageSignedUrl,
  readBoundedBytes,
  sessionIsCurrent,
  trustedHttpUrl,
} from "../../supabase/functions/inventory-api/core/security";

afterEach(() => vi.unstubAllGlobals());

describe("backend security boundaries", () => {
  it("maps self-hosted signed Storage origins without changing the signed object path or query", () => {
    const url = "http://api-gw:8000/storage/v1/object/sign/device-invoices/a%20b.pdf?token=abc.def&download=a%20b.pdf";
    expect(publicStorageSignedUrl(url, "http://api-gw:8000", "https://parc-api.piqa.fr")).toBe(
      "https://parc-api.piqa.fr/storage/v1/object/sign/device-invoices/a%20b.pdf?token=abc.def&download=a%20b.pdf",
    );
    expect(publicStorageSignedUrl(url, "http://api-gw:8000", "")).toBe(url);
    for (const origin of [
      "http://public.test",
      "https://public.test/path",
      "https://user:pass@public.test",
      "https://public.test?x=1",
    ]) {
      expect(() => publicStorageSignedUrl(url, "http://api-gw:8000", origin)).toThrow();
    }
    expect(() => publicStorageSignedUrl(url, "http://other:8000", "https://parc-api.piqa.fr")).toThrow();
  });
  it("retrieves every device even when a gateway cap is smaller than the requested page size", async () => {
    const rows = Array.from({ length: 1101 }, (_, i) => ({ id: String(i).padStart(5, "0") }));
    const result = await collectKeysetRows(async (after) => rows.filter((row) => row.id > after).slice(0, 97));
    expect(result).toEqual(rows);
    await expect(collectKeysetRows(async () => [{ id: "same" }])).rejects.toThrow("did not advance");
  });
  it("rejects private, credentialed, cleartext and lookalike source URLs before fetching", () => {
    for (const url of [
      "http://intel.com",
      "https://127.0.0.1",
      "https://intel.com.evil.test",
      "https://user:pass@intel.com",
      "https://intel.com:8443",
    ]) {
      expect(() => trustedHttpUrl(url, ["intel.com"])).toThrow();
    }
    expect(trustedHttpUrl("https://www.intel.com/products", ["intel.com"]).hostname).toBe("www.intel.com");
  });

  it("does not follow even an approved host redirect to a private endpoint", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 302, headers: { Location: "http://127.0.0.1" } }));
    vi.stubGlobal("fetch", fetch);
    await expect(fetchBoundedText("https://intel.com/test", ["intel.com"])).rejects.toThrow("redirect");
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ redirect: "manual" });
  });

  it("caps streamed bytes rather than truncating after downloading the response", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(8));
        controller.enqueue(new Uint8Array(8));
      },
      cancel,
    });
    await expect(readBoundedBytes(body, 10)).rejects.toMatchObject({ status: 413 });
    expect(cancel).toHaveBeenCalledOnce();
    expect(await readBoundedBytes(new Response("hello").body, 5)).toEqual(new TextEncoder().encode("hello"));
  });

  it("validates byte signatures instead of trusting upload MIME labels", () => {
    const bytes = new TextEncoder().encode("<script>alert(1)</script>");
    expect(invoiceMimeMatches(bytes, "application/pdf")).toBe(false);
    expect(invoiceMimeMatches(new TextEncoder().encode("%PDF-1.7"), "application/pdf")).toBe(true);
    expect(invoiceMimeMatches(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), "image/png")).toBe(true);
    expect(invoiceMimeMatches(new Uint8Array([255, 216, 255]), "image/jpeg")).toBe(true);
    expect(invoiceMimeMatches(new TextEncoder().encode("RIFF0000WEBP"), "image/webp")).toBe(true);
    expect(invoiceMimeMatches(new TextEncoder().encode("0000ftypheic"), "image/heic")).toBe(true);
    expect(invoiceMimeMatches(new TextEncoder().encode("0000ftypavif"), "image/heic")).toBe(false);
  });

  it("rejects removed, disabled, mismatched and expired server sessions", () => {
    const now = Date.parse("2026-09-15T12:00:00Z");
    const session = { user_id: "a", expires_at: "2026-09-15T13:00:00Z" };
    const user = { id: "a", is_active: true };
    expect(sessionIsCurrent(session, user, now)).toBe(true);
    expect(sessionIsCurrent(null, user, now)).toBe(false);
    expect(sessionIsCurrent(session, null, now)).toBe(false);
    expect(sessionIsCurrent(session, { ...user, is_active: false }, now)).toBe(false);
    expect(sessionIsCurrent(session, { ...user, id: "b" }, now)).toBe(false);
    expect(sessionIsCurrent({ ...session, expires_at: "invalid" }, user, now)).toBe(false);
    expect(sessionIsCurrent({ ...session, expires_at: "2026-09-15T12:00:00Z" }, user, now)).toBe(false);
  });
});
