import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import cpuBenchmarkSeed from "./cpu_benchmarks.json" with { type: "json" };
import {
  firstPresent,
  normalizeMac,
  normalizeScanPayload,
  safeExternalUrl,
  safeNumber,
  safeString,
  titleCase,
  validateEmail,
} from "./core/input.ts";
import { canPerformAction, normalizedRole } from "./core/permissions.ts";
import { createResponseHelpers } from "./core/responses.ts";
import type {
  Action,
  AdminSession,
  DeviceHistoryRow,
  Json,
} from "./core/types.ts";
import {
  canonicalCpuText,
  canonicalizeCpuBenchmarkSourceUrl,
  estimateCpuScore,
  inferCpuGeneration,
  inferCpuReleaseYear,
  inferModelReleaseYear,
  normalizeCpuName,
  parsePassMarkFirstSeen,
} from "./domain/cpu.ts";
import {
  bookValueEstimate,
  cpuTier,
  depreciationFactor,
  detectDeviceCategory,
  estimateLaunchPrice,
  filterMarketRowsByPrice,
  isExcludedMarketListing,
  priceStats,
  recommendationForPriority,
  replacementCostEstimate,
  replacementPriority,
  resolveMarketPriceStats,
  roundCurrency,
  valuationConfidenceLabel,
  valuationMethod,
} from "./domain/valuation.ts";
import {
  buildMarketSearchQueries,
  manufacturerPriceForDevice,
  marketListingMatchesDevice,
} from "./domain/market-search.ts";
import {
  AmdReleaseAdapter,
  AppleReleaseAdapter,
  IntelReleaseAdapter,
  QualcommReleaseAdapter,
} from "./domain/cpu-release/adapters/index.ts";
import { BoundedCpuReleaseHttpClient } from "./domain/cpu-release/http-client.ts";
import { CpuReleaseRepository } from "./domain/cpu-release/repository.ts";
import { resolveCpuRelease } from "./domain/cpu-release/resolver.ts";
import {
  shouldSynchronizeCpuRelease,
  synchronizeCpuReleaseCatalog,
} from "./domain/cpu-release/sync.ts";
import { releaseYear } from "./domain/cpu-release/date-parser.ts";
import type {
  CpuReleaseCatalogRow,
  CpuReleaseResolution,
  CpuReleaseSyncOptions,
  CpuVendor,
} from "./domain/cpu-release/types.ts";
import type { CpuReleaseAliasRow } from "./domain/cpu-release/resolver.ts";
import { hasCpuReleaseSyncToken } from "./domain/cpu-release/authorization.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const adminPassword = Deno.env.get("ADMIN_PASSWORD") ?? "";
const adminSessionSecret = Deno.env.get("ADMIN_SESSION_SECRET") ?? "";
const collectionAccessToken = Deno.env.get("COLLECTION_ACCESS_TOKEN") ?? "";
const cpuReleaseSyncToken = Deno.env.get("CPU_RELEASE_SYNC_TOKEN") ?? "";
const invoiceStorageBucket = Deno.env.get("INVOICE_STORAGE_BUCKET") ??
  "device-invoices";

const maxInvoiceFileBytes = 10 * 1024 * 1024;

const allowedInvoiceMimeTypes = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const defaultAllowedOrigins =
  "https://badr-spacefoot.github.io,http://localhost:8080,http://127.0.0.1:8080";

const allowedOrigins =
  (Deno.env.get("ALLOWED_ORIGINS") ?? defaultAllowedOrigins).split(",").map((
    origin,
  ) => origin.trim());

const allowLegacyAdminLogin = ["1", "true", "yes"].includes(
  (Deno.env.get("ALLOW_LEGACY_ADMIN_LOGIN") ?? "").trim().toLowerCase(),
);
const allowedEmailDomains = (Deno.env.get("ALLOWED_EMAIL_DOMAINS") ?? "")
  .split(",")
  .map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
  .filter(Boolean);
const ebayBrowseApiToken = Deno.env.get("EBAY_BROWSE_API_TOKEN") ?? "";
const ebayClientId = Deno.env.get("EBAY_CLIENT_ID") ?? "";
const ebayClientSecret = Deno.env.get("EBAY_CLIENT_SECRET") ?? "";
const ebayOAuthScope = Deno.env.get("EBAY_OAUTH_SCOPE") ??
  "https://api.ebay.com/oauth/api_scope";
const ebayMarketplaceId = Deno.env.get("EBAY_MARKETPLACE_ID") ?? "EBAY_FR";
let ebayGeneratedToken = "";
let ebayGeneratedTokenExpiresAt = 0;
const googleMapsApiKey = Deno.env.get("GOOGLE_MAPS_API_KEY") ?? "";
const enrichmentCacheDays = Number(Deno.env.get("ENRICHMENT_CACHE_DAYS") ?? 90);
const defaultCpuBenchmarkSourceUrls =
  (Deno.env.get("CPU_BENCHMARK_SOURCE_URLS") ||
    "https://www.cpubenchmark.net/cpu-list/,https://raw.githubusercontent.com/badr-spacefoot/pc_inventory_2.0/main/data/cpu_benchmarks.csv")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
const cpuBenchmarkSyncToken = Deno.env.get("CPU_BENCHMARK_SYNC_TOKEN") ?? "";
const organizationPalette = [
  "#3b6ea8",
  "#21867a",
  "#4f8a52",
  "#b88325",
  "#b86632",
  "#b45c75",
  "#7b61a8",
  "#4e68b0",
  "#2f8898",
  "#7a963f",
  "#64748b",
  "#b15f9a",
];

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});
const { corsHeaders, json, badRequest } = createResponseHelpers(allowedOrigins);

function requireEnv(request: Request) {
  const missing = [
    ["SUPABASE_URL", supabaseUrl],
    ["SUPABASE_SERVICE_ROLE_KEY", serviceRoleKey],
    ["ADMIN_PASSWORD", adminPassword],
    ["ADMIN_SESSION_SECRET", adminSessionSecret],
    ["COLLECTION_ACCESS_TOKEN", collectionAccessToken],
  ].filter(([, value]) => !value);
  if (missing.length > 0) {
    return badRequest(
      request,
      `Variables serveur manquantes: ${missing.map(([key]) => key).join(", ")}`,
      500,
    );
  }
  return null;
}

function emailValidationError(email: string) {
  return validateEmail(email, allowedEmailDomains);
}

async function nextOrganizationColor(table: "teams" | "establishments") {
  const { count } = await supabase.from(table).select("id", {
    count: "exact",
    head: true,
  });
  return organizationPalette[(count ?? 0) % organizationPalette.length];
}

async function sha256(input: string) {
  const bytes = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

async function validateCollectionAccessTokenValue(token: string) {
  const plainToken = safeString(token, 500);
  if (!plainToken) return null;
  if (plainToken.startsWith("invite_")) {
    return await validateCollectionInviteValue(plainToken.slice(7));
  }
  if (collectionAccessToken && plainToken === collectionAccessToken) {
    return {
      id: "legacy-static-token",
      label: "Legacy collection token",
      token_prefix: "legacy",
      expires_at: null,
      max_uses: null,
      use_count: 0,
      last_used_at: null,
      invalid_reason: "",
    };
  }

  const tokenHash = await sha256(plainToken);
  const { data, error } = await supabase
    .from("collection_access_tokens")
    .select(
      "id,label,token_prefix,expires_at,max_uses,use_count,last_used_at,revoked_at",
    )
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const expiresAt = safeString(data.expires_at);
  const maxUses = data.max_uses === null || data.max_uses === undefined
    ? null
    : Number(data.max_uses);
  const useCount = Number(data.use_count ?? 0);
  let invalidReason = "";
  if (data.revoked_at) invalidReason = "revoked";
  else if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
    invalidReason = "expired";
  } else if (maxUses !== null && useCount >= maxUses) {
    invalidReason = "exhausted";
  }

  return { ...data, invalid_reason: invalidReason };
}

async function validateCollectionInviteValue(code: string) {
  const inviteCode = safeString(code, 120);
  if (!inviteCode) return null;
  const { data, error } = await supabase
    .from("collection_invites")
    .select(
      "id,label,invite_code,expires_at,max_uses,use_count,last_used_at,revoked_at,payload",
    )
    .eq("invite_code", inviteCode)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const expiresAt = safeString(data.expires_at);
  const maxUses = data.max_uses === null || data.max_uses === undefined
    ? null
    : Number(data.max_uses);
  const useCount = Number(data.use_count ?? 0);
  let invalidReason = "";
  if (data.revoked_at) invalidReason = "revoked";
  else if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
    invalidReason = "expired";
  } else if (maxUses !== null && useCount >= maxUses) {
    invalidReason = "exhausted";
  }
  return {
    id: safeString(data.id),
    label: safeString(data.label) || "Invitation de collecte",
    token_prefix: `invite_${safeString(data.invite_code, 6)}`,
    expires_at: data.expires_at ?? null,
    max_uses: data.max_uses ?? null,
    use_count: data.use_count ?? null,
    last_used_at: data.last_used_at ?? null,
    invalid_reason: invalidReason,
    invite_code: safeString(data.invite_code),
    payload: (data.payload && typeof data.payload === "object")
      ? data.payload
      : {},
  };
}

async function hmac(input: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(adminSessionSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(signature)).map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

function base64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll(
    "/",
    "_",
  ).replaceAll("=", "");
}

async function pbkdf2Hash(
  password: string,
  salt = base64Url(crypto.getRandomValues(new Uint8Array(16))),
  iterations = 210000,
) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const saltBytes = Uint8Array.from(
    atob(salt.replaceAll("-", "+").replaceAll("_", "/")),
    (char) => char.charCodeAt(0),
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations },
    keyMaterial,
    256,
  );
  return `pbkdf2_sha256$${iterations}$${salt}$${
    base64Url(new Uint8Array(bits))
  }`;
}

async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, iterations, salt, hash] = storedHash.split("$");
  if (algorithm !== "pbkdf2_sha256" || !iterations || !salt || !hash) {
    return false;
  }
  return await pbkdf2Hash(password, salt, Number(iterations)) === storedHash;
}

async function createAdminToken(user: AdminSession) {
  const payload = btoa(
    JSON.stringify({ ...user, exp: Date.now() + 12 * 60 * 60 * 1000 }),
  );
  return `${payload}.${await hmac(payload)}`;
}

async function getAdminSession(request: Request): Promise<AdminSession | null> {
  try {
    const token = (request.headers.get("authorization") ?? "").replace(
      /^Bearer\s+/i,
      "",
    );
    const [payload, signature] = token.split(".");
    if (!payload || !signature) return null;
    if ((await hmac(payload)) !== signature) return null;
    const parsed = JSON.parse(atob(payload));
    if (Number(parsed.exp) <= Date.now()) return null;
    if (parsed.role === "admin") {
      return {
        id: "legacy-admin",
        username: "legacy-admin",
        displayName: "Legacy Admin",
        role: "ADMIN",
        legacy: true,
      };
    }
    return {
      id: safeString(parsed.id) || "legacy-admin",
      username: safeString(parsed.username) || "admin",
      displayName: safeString(parsed.displayName) ||
        safeString(parsed.username) || "Admin",
      role: normalizedRole(parsed.role),
      legacy: Boolean(parsed.legacy),
    };
  } catch {
    return null;
  }
}

async function isAdmin(request: Request, action: Action = "VIEW_DASHBOARD") {
  return canPerformAction(await getAdminSession(request), action);
}

async function requireAction(request: Request, action: Action) {
  const session = await getAdminSession(request);
  if (!session) {
    return {
      response: badRequest(request, "Session admin invalide.", 401),
      session: null,
    };
  }
  if (!canPerformAction(session, action)) {
    return {
      response: badRequest(request, "Action non autorisee pour ce role.", 403),
      session,
    };
  }
  return { response: null, session };
}

async function getOrCreateByName(
  table: "teams" | "establishments",
  name: string,
) {
  const cleanName = safeString(name, 120);
  const { data: existing } = await supabase.from(table).select("id").ilike(
    "name",
    cleanName,
  ).maybeSingle();
  if (existing?.id) return existing.id;
  const { data, error } = await supabase.from(table).insert({
    name: cleanName,
    color: await nextOrganizationColor(table),
  }).select("id").single();
  if (error) throw error;
  return data.id;
}

async function findActiveByName(
  table: "teams" | "establishments",
  name: string,
) {
  const cleanName = safeString(name, 120);
  if (!cleanName || cleanName === "__other__") return null;
  const { data, error } = await supabase
    .from(table)
    .select("id,name,active")
    .ilike("name", cleanName)
    .eq("active", true)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

async function audit(
  action: string,
  entityType: string,
  entityId: string | null,
  details: Json = {},
) {
  await supabase.from("audit_logs").insert({
    action,
    entity_type: entityType,
    entity_id: entityId,
    details,
  });
}

async function notify(
  type: string,
  title: string,
  message: string,
  options: Json = {},
) {
  await supabase.from("notifications").insert({
    type,
    title,
    message,
    severity: safeString(options.severity, 20) || "INFO",
    target_role: safeString(options.targetRole, 40) || "ADMIN",
    target_user_id: safeString(options.targetUserId) || null,
    related_entity_type: safeString(options.relatedEntityType, 80) || null,
    related_entity_id: safeString(options.relatedEntityId) || null,
  });
}

function publicAdminUser(user: Json) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    email: user.email,
    role: user.role,
    isActive: user.is_active,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
    lastLoginAt: user.last_login_at,
  };
}

const deviceHistoryFields: Array<{ field: string; eventType: string }> = [
  { field: "hostname", eventType: "DEVICE_UPDATED" },
  { field: "os_name", eventType: "OS_CHANGED" },
  { field: "os_version", eventType: "OS_CHANGED" },
  { field: "manufacturer", eventType: "HARDWARE_CHANGED" },
  { field: "model", eventType: "HARDWARE_CHANGED" },
  { field: "model_number", eventType: "HARDWARE_CHANGED" },
  { field: "service_tag", eventType: "HARDWARE_CHANGED" },
  { field: "serial_number", eventType: "HARDWARE_CHANGED" },
  { field: "cpu", eventType: "HARDWARE_CHANGED" },
  { field: "gpu", eventType: "HARDWARE_CHANGED" },
  { field: "ram_total_gb", eventType: "HARDWARE_CHANGED" },
  { field: "storage_total_gb", eventType: "HARDWARE_CHANGED" },
  { field: "storage_type", eventType: "HARDWARE_CHANGED" },
  { field: "windows_user", eventType: "USER_REASSIGNED" },
];

function historyValue(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

async function appendDeviceHistory(rows: Json[]) {
  if (rows.length === 0) return;
  const { error } = await supabase.from("device_history").insert(rows);
  if (error) throw error;
}

function collectorApiUrl(request: Request) {
  const url = new URL(request.url);
  url.search = "";
  url.hash = "";
  url.pathname = url.pathname
    .replace(/\/collect\/invite\/[^/]+\/prefill$/i, "")
    .replace(/\/collect\/prefill$/i, "");
  return url.toString().replace(/\/$/, "");
}

function collectorLaunchUrl(request: Request, prefillCode: string) {
  const params = new URLSearchParams({
    prefillCode,
    apiUrl: collectorApiUrl(request),
  });
  return `spacefoot-collector://collect?${params.toString()}`;
}

function eventSource(value: string) {
  const normalized = safeString(value, 80).toUpperCase().replace(
    /[^A-Z0-9_]+/g,
    "_",
  );
  if (["MANUAL_ADMIN", "COLLECTOR", "IMPORT", "SYSTEM"].includes(normalized)) {
    return normalized;
  }
  if (normalized === "MANUAL") return "MANUAL_ADMIN";
  return normalized || "SYSTEM";
}

async function closeOpenAssignmentPeriod(
  deviceId: string,
  endedAt: string,
  unassignedBy: string,
  reason = "",
) {
  const { error } = await supabase
    .from("device_assignment_periods")
    .update({
      ended_at: endedAt,
      unassigned_by: unassignedBy,
      reason: reason || null,
    })
    .eq("device_id", deviceId)
    .is("ended_at", null);
  if (error) throw error;
}

async function openAssignmentPeriod(
  deviceId: string,
  userId: string | null,
  teamId: string | null,
  establishmentId: string | null,
  startedAt: string,
  assignedBy: string,
  source: string,
  reason = "",
) {
  if (!userId) return;
  const [
    { data: user, error: userError },
    { data: team, error: teamError },
    { data: site, error: siteError },
  ] = await Promise.all([
    supabase.from("users").select("first_name,last_name,email").eq("id", userId)
      .maybeSingle(),
    teamId
      ? supabase.from("teams").select("name").eq("id", teamId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    establishmentId
      ? supabase.from("establishments").select("name").eq("id", establishmentId)
        .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (userError) throw userError;
  if (teamError) throw teamError;
  if (siteError) throw siteError;
  if (!user) return;
  const userName = [user.first_name, user.last_name].map((value) =>
    safeString(value)
  ).filter(Boolean).join(" ");
  const { error } = await supabase.from("device_assignment_periods").insert({
    device_id: deviceId,
    user_id: userId,
    user_name: userName || safeString(user.email),
    user_email: safeString(user.email) || null,
    team_id: teamId,
    team_name: safeString(team?.name) || null,
    establishment_id: establishmentId,
    establishment_name: safeString(site?.name) || null,
    started_at: startedAt,
    assigned_by: assignedBy,
    source: eventSource(source),
    reason: reason || null,
  });
  if (error) throw error;
}

function changedDeviceHistory(
  deviceId: string,
  previous: Json | null,
  current: Json,
  source: string,
  changedAt: string,
): DeviceHistoryRow[] {
  if (!previous) {
    return [{
      device_id: deviceId,
      event_type: "DEVICE_CREATED",
      new_value: historyValue(current.hostname),
      changed_by: source === "admin" ? "admin" : "collector",
      source,
      changed_at: changedAt,
    }];
  }
  const changes: DeviceHistoryRow[] = deviceHistoryFields.flatMap(
    ({ field, eventType }) => {
      const oldValue = historyValue(previous[field]);
      const newValue = historyValue(current[field]);
      if (oldValue === newValue) return [];
      return [{
        device_id: deviceId,
        event_type: source.toUpperCase() === "IMPORT"
          ? "IMPORT_UPDATE"
          : eventType,
        field_name: field,
        old_value: oldValue,
        new_value: newValue,
        changed_by: source === "admin" ? "admin" : "collector",
        source,
        changed_at: changedAt,
      }];
    },
  );
  const osChanged =
    historyValue(previous.os_version) !== historyValue(current.os_version);
  const userChanged =
    historyValue(previous.windows_user) !== historyValue(current.windows_user);
  if (osChanged && userChanged) {
    changes.push({
      device_id: deviceId,
      event_type: "DEVICE_RESET",
      changed_by: "collector",
      source,
      notes:
        "OS and local user changed in the same collection; reset or reinstall may have occurred.",
      changed_at: changedAt,
    });
  }
  return changes;
}

async function consumeCollectionAccessToken(token: string) {
  if (!token) return null;
  if (token.startsWith("invite_")) {
    return await consumeCollectionInvite(token.slice(7));
  }
  if (token === collectionAccessToken) return "legacy-static-token";
  const tokenHash = await sha256(token);
  const { data, error } = await supabase.rpc(
    "consume_collection_access_token",
    { p_token_hash: tokenHash },
  );
  if (error) throw error;
  return safeString(data);
}

async function consumeCollectionInvite(code: string) {
  const inviteCode = safeString(code, 120);
  if (!inviteCode) return null;
  const { data, error } = await supabase
    .from("collection_invites")
    .select("id,expires_at,max_uses,use_count,revoked_at")
    .eq("invite_code", inviteCode)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const maxUses = data.max_uses === null || data.max_uses === undefined
    ? null
    : Number(data.max_uses);
  const useCount = Number(data.use_count ?? 0);
  if (data.revoked_at) return null;
  if (new Date(safeString(data.expires_at)).getTime() <= Date.now()) {
    return null;
  }
  if (maxUses !== null && useCount >= maxUses) return null;
  const { error: updateError } = await supabase
    .from("collection_invites")
    .update({ use_count: useCount + 1, last_used_at: new Date().toISOString() })
    .eq("id", data.id);
  if (updateError) throw updateError;
  return `invite:${data.id}`;
}

async function upsertUserProfile(body: Json) {
  const teamId = await findActiveByName("teams", firstPresent(body, "team"));
  const establishmentId = await findActiveByName(
    "establishments",
    firstPresent(body, "establishment", "site"),
  );
  const email = firstPresent(body, "email").toLowerCase();

  const { data: user, error: userError } = await supabase
    .from("users")
    .upsert(
      {
        first_name: titleCase(firstPresent(body, "firstName")),
        last_name: firstPresent(body, "lastName").toUpperCase(),
        email,
        team_id: teamId,
        establishment_id: establishmentId,
        service: firstPresent(body, "service") || "Deprecated",
        comment: firstPresent(body, "comment", "notes", "Notes").slice(0, 1000),
      },
      { onConflict: "email" },
    )
    .select("id,first_name,last_name,email,team_id,establishment_id")
    .single();

  if (userError) throw userError;
  return user;
}

async function createPendingChange(
  type: "TEAM" | "ESTABLISHMENT",
  proposedValue: string,
  body: Json,
  userId: string,
) {
  const cleanValue = safeString(proposedValue, 180);
  if (!cleanValue) return null;
  const proposedByUser = [
    titleCase(firstPresent(body, "firstName")),
    firstPresent(body, "lastName").toUpperCase(),
  ]
    .filter(Boolean)
    .join(" ");
  const proposedByEmail = firstPresent(body, "email").toLowerCase();
  const { data, error } = await supabase
    .from("pending_changes")
    .insert({
      type,
      proposed_value: cleanValue,
      proposed_by_user: proposedByUser || null,
      proposed_by_email: proposedByEmail || null,
      status: "PENDING",
      admin_notes: `Profil collecte: ${userId}`,
    })
    .select("id,type,proposed_value")
    .single();
  if (error) throw error;
  await notify(
    type === "TEAM" ? "PENDING_TEAM_PROPOSAL" : "PENDING_LOCATION_PROPOSAL",
    type === "TEAM"
      ? "Nouvelle proposition equipe"
      : "Nouvelle proposition etablissement",
    `${
      proposedByUser || proposedByEmail || "Un utilisateur"
    } propose "${cleanValue}".`,
    {
      severity: "INFO",
      targetRole: "ADMIN",
      relatedEntityType: "pending_change",
      relatedEntityId: data.id,
    },
  );
  await audit("pending_change_created", "pending_change", data.id, {
    type,
    proposed_value: cleanValue,
    user_id: userId,
  });
  return data;
}

async function handleAdminLogin(request: Request) {
  const body = await request.json().catch(() => ({}));
  const username = safeString(body.username, 80).toLowerCase();
  const password = safeString(body.password, 500);
  if (!password) return badRequest(request, "Mot de passe requis.", 400);

  if (username) {
    const { data: user, error } = await supabase
      .from("admin_users")
      .select(
        "id,username,display_name,email,role,password_hash,is_active,last_login_at",
      )
      .eq("username", username)
      .maybeSingle();
    if (error) throw error;
    if (user) {
      if (!user.is_active) return badRequest(request, "Compte desactive.", 403);
      if (
        !(await verifyPassword(password, safeString(user.password_hash, 1000)))
      ) {
        return badRequest(request, "Identifiants incorrects.", 401);
      }
      await supabase.from("admin_users").update({
        last_login_at: new Date().toISOString(),
      }).eq("id", user.id);
      const session: AdminSession = {
        id: safeString(user.id),
        username: safeString(user.username),
        displayName: safeString(user.display_name),
        role: normalizedRole(user.role),
      };
      return json(request, {
        token: await createAdminToken(session),
        user: session,
      });
    }

    const { count, error: countError } = await supabase.from("admin_users")
      .select("id", { count: "exact", head: true });
    if (countError) throw countError;
    if ((count ?? 0) === 0 && password === adminPassword) {
      const displayName = safeString(body.displayName, 120) || "Administrateur";
      const email = safeString(body.email, 255).toLowerCase() || null;
      if (email) {
        const emailError = emailValidationError(email);
        if (emailError) return badRequest(request, emailError);
      }
      const passwordHash = await pbkdf2Hash(password);
      const { data: created, error: createError } = await supabase
        .from("admin_users")
        .insert({
          username,
          display_name: displayName,
          email,
          role: "ADMIN",
          password_hash: passwordHash,
        })
        .select("id,username,display_name,role")
        .single();
      if (createError) throw createError;
      await audit("admin_user_bootstrapped", "admin_user", created.id, {
        username,
      });
      await notify(
        "ADMIN_ACTION_COMPLETED",
        "Premier administrateur cree",
        `Le compte admin ${username} a ete initialise.`,
        {
          severity: "SUCCESS",
          targetRole: "ADMIN",
          relatedEntityType: "admin_user",
          relatedEntityId: created.id,
        },
      );
      const session: AdminSession = {
        id: safeString(created.id),
        username: safeString(created.username),
        displayName: safeString(created.display_name),
        role: "ADMIN",
      };
      return json(request, {
        token: await createAdminToken(session),
        user: session,
      }, 201);
    }
  }

  if (!username && allowLegacyAdminLogin && password === adminPassword) {
    const session: AdminSession = {
      id: "legacy-admin",
      username: "legacy-admin",
      displayName: "Legacy Admin",
      role: "ADMIN",
      legacy: true,
    };
    return json(request, {
      token: await createAdminToken(session),
      user: session,
    });
  }

  return badRequest(request, "Identifiants incorrects.", 401);
}

async function handleProfile(request: Request) {
  const accessToken = request.headers.get("x-collection-access-token") ?? "";
  const body = await request.json().catch(() => ({}));
  const required = ["firstName", "lastName", "email"];
  for (const field of required) {
    if (!safeString(body[field])) {
      return badRequest(request, `Champ requis: ${field}`);
    }
  }
  const team = firstPresent(body, "team");
  const establishment = firstPresent(body, "establishment", "site");
  const proposedTeam = firstPresent(body, "proposedTeam", "proposed_team");
  const proposedEstablishment = firstPresent(
    body,
    "proposedEstablishment",
    "proposed_establishment",
    "proposedLocation",
  );
  if (!team && !proposedTeam) {
    return badRequest(
      request,
      "Équipe requise ou proposition d'équipe requise.",
    );
  }
  if (!establishment && !proposedEstablishment) {
    return badRequest(
      request,
      "Établissement requis ou proposition d'établissement requise.",
    );
  }
  const emailError = emailValidationError(
    safeString(body.email, 255).toLowerCase(),
  );
  if (emailError) return badRequest(request, emailError);
  const accessTokenId = await consumeCollectionAccessToken(accessToken);
  if (!accessTokenId) {
    return badRequest(
      request,
      "Token de collecte invalide, expiré, révoqué ou épuisé.",
      401,
    );
  }

  const email = safeString(body.email, 255).toLowerCase();
  const user = await upsertUserProfile(body);
  const pendingChanges = [];
  if (proposedTeam) {
    pendingChanges.push(
      await createPendingChange(
        "TEAM",
        proposedTeam,
        body,
        safeString(user.id),
      ),
    );
  }
  if (proposedEstablishment) {
    pendingChanges.push(
      await createPendingChange(
        "ESTABLISHMENT",
        proposedEstablishment,
        body,
        safeString(user.id),
      ),
    );
  }

  const token = crypto.randomUUID().replaceAll("-", "") +
    crypto.randomUUID().replaceAll("-", "");
  const tokenHash = await sha256(token);
  await supabase.from("collection_tokens").insert({
    user_id: user.id,
    token_hash: tokenHash,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });
  await audit("collection_profile_created", "user", user.id, {
    email,
    access_token_id: accessTokenId,
    pending_changes: pendingChanges.filter(Boolean).map((item) =>
      (item as Json).id
    ),
  });
  return json(request, {
    collectionToken: token,
    pendingChanges: pendingChanges.filter(Boolean),
  });
}

function prefillPayload(body: Json) {
  const team = firstPresent(body, "team", "teamName");
  const establishment = firstPresent(
    body,
    "establishment",
    "location",
    "locationName",
    "site",
  );
  return {
    apiUrl: safeString(body.apiUrl, 500),
    firstName: safeString(body.firstName, 120),
    lastName: safeString(body.lastName, 120),
    email: safeString(body.email, 255).toLowerCase(),
    team,
    establishment,
    proposedTeam: firstPresent(body, "proposedTeam", "proposed_team"),
    proposedEstablishment: firstPresent(
      body,
      "proposedEstablishment",
      "proposed_establishment",
      "proposedLocation",
    ),
    comment: safeString(body.comment, 1000),
    language: safeString(body.language, 10),
    theme: safeString(body.theme, 20),
  };
}

function mergePrefillPayload(base: Json, override: Json) {
  const merged = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value !== "" && value !== null && value !== undefined) {
      merged[key] = value;
    }
  }
  return merged;
}

async function cleanupExpiredCollectionPrefills() {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase.from("collection_prefills").delete().lt(
    "expires_at",
    cutoff,
  );

  if (error) console.warn("Expired prefill cleanup failed", error.message);
}

async function handleCreateCollectionPrefill(request: Request) {
  const accessToken = request.headers.get("x-collection-access-token") ?? "";
  const token = await validateCollectionAccessTokenValue(accessToken);
  if (!token || safeString(token.invalid_reason)) {
    return badRequest(
      request,
      "Token temporaire invalide, expiré, révoqué ou épuisé.",
      401,
    );
  }
  await cleanupExpiredCollectionPrefills();

  const body = await request.json().catch(() => ({}));
  const payload = prefillPayload(body);
  if (payload.email) {
    const emailError = emailValidationError(payload.email);
    if (emailError) return badRequest(request, emailError);
  }
  const ttlMinutes = Math.max(
    5,
    Math.min(Number(body.ttlMinutes || 1440), 1440),
  );
  const prefillCode = base64Url(crypto.getRandomValues(new Uint8Array(9)));
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();
  const { error } = await supabase.from("collection_prefills").insert({
    prefill_code: prefillCode,
    collection_access_token: safeString(accessToken, 500),
    payload,
    expires_at: expiresAt,
  });
  if (error) throw error;
  return json(request, {
    prefillCode,
    expiresAt,
    apiUrl: collectorApiUrl(request),

    launchUrl: collectorLaunchUrl(request, prefillCode),
  }, 201);
}

async function handleGetCollectionPrefill(request: Request, code: string) {
  const prefillCode = safeString(code, 80);
  if (!prefillCode) {
    return badRequest(request, "Code de pré-remplissage requis.", 400);
  }
  const { data, error } = await supabase
    .from("collection_prefills")
    .select("id,prefill_code,collection_access_token,payload,expires_at")
    .eq("prefill_code", prefillCode)
    .maybeSingle();
  if (error) throw error;
  if (!data || new Date(safeString(data.expires_at)).getTime() <= Date.now()) {
    return badRequest(
      request,
      "Code de pré-remplissage invalide ou expiré.",
      404,
    );
  }
  await supabase.from("collection_prefills").update({
    used_at: new Date().toISOString(),
  }).eq("id", data.id);
  return json(request, {
    prefillCode: data.prefill_code,
    accessToken: data.collection_access_token,
    expiresAt: data.expires_at,

    apiUrl: collectorApiUrl(request),
    ...((data.payload && typeof data.payload === "object")
      ? (data.payload as Json)
      : {}),
  });
}

async function handleGetCollectionInvite(request: Request, code: string) {
  const invite = await validateCollectionInviteValue(code);
  if (!invite) {
    return badRequest(request, "Invitation de collecte introuvable.", 404);
  }
  const invalidReason = safeString(invite.invalid_reason, 40);
  if (invalidReason) {
    const labels: Record<string, string> = {
      revoked: "Invitation de collecte révoquée.",
      expired: "Invitation de collecte expiree.",
      exhausted: "Invitation de collecte déjà utilisée.",
    };
    return badRequest(
      request,
      labels[invalidReason] || "Invitation de collecte invalide.",
      401,
    );
  }
  return json(request, {
    inviteCode: safeString(invite.invite_code),
    label: safeString(invite.label),
    expiresAt: invite.expires_at ?? null,
    maxUses: invite.max_uses ?? null,
    useCount: invite.use_count ?? null,
    ...((invite.payload && typeof invite.payload === "object")
      ? (invite.payload as Json)
      : {}),
  });
}

async function handleCreateInvitePrefill(request: Request, code: string) {
  const invite = await validateCollectionInviteValue(code);
  if (!invite || safeString(invite.invalid_reason)) {
    return badRequest(
      request,
      "Invitation de collecte invalide, expirée ou révoquée.",
      401,
    );
  }
  await cleanupExpiredCollectionPrefills();

  const body = await request.json().catch(() => ({}));
  const payload = mergePrefillPayload(
    (invite.payload && typeof invite.payload === "object")
      ? (invite.payload as Json)
      : {},
    prefillPayload(body),
  );
  if (safeString(payload.email)) {
    const emailError = emailValidationError(
      safeString(payload.email).toLowerCase(),
    );
    if (emailError) return badRequest(request, emailError);
  }
  const ttlMinutes = Math.max(
    5,
    Math.min(Number(body.ttlMinutes || 1440), 1440),
  );
  const prefillCode = base64Url(crypto.getRandomValues(new Uint8Array(9)));
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();
  const { error } = await supabase.from("collection_prefills").insert({
    prefill_code: prefillCode,
    collection_access_token: `invite_${safeString(invite.invite_code, 120)}`,
    payload,
    expires_at: expiresAt,
  });
  if (error) throw error;
  return json(request, {
    prefillCode,
    expiresAt,
    inviteCode: safeString(invite.invite_code),
    apiUrl: collectorApiUrl(request),

    launchUrl: collectorLaunchUrl(request, prefillCode),
  }, 201);
}

async function handleValidateCollectionAccessToken(request: Request) {
  const accessToken = request.headers.get("x-collection-access-token") ?? "";
  const token = await validateCollectionAccessTokenValue(accessToken);
  if (!token) return badRequest(request, "Token de collecte invalide.", 401);
  const invalidReason = safeString(token.invalid_reason, 40);
  if (invalidReason) {
    const labels: Record<string, string> = {
      revoked: "Token de collecte révoqué.",
      expired: "Token de collecte expire.",
      exhausted: "Token de collecte épuisé.",
    };
    return badRequest(
      request,
      labels[invalidReason] || "Token de collecte invalide.",
      401,
    );
  }
  return json(request, {
    valid: true,
    id: safeString(token.id),
    label: safeString(token.label) || "Token de collecte",
    tokenPrefix: safeString(token.token_prefix),
    expiresAt: token.expires_at ?? null,
    maxUses: token.max_uses ?? null,
    useCount: token.use_count ?? null,
    lastUsedAt: token.last_used_at ?? null,
  });
}

function dedupePayload(body: Json, userId: string) {
  const serial = safeString(body.serialNumber, 160);
  const hostname = safeString(body.hostname, 160);
  const mac = safeString(body.macAddress, 160);
  const model = safeString(body.model, 160);
  const establishmentId = safeString(body.establishmentId, 160);
  if (serial) return { dedupe_key: `serial:${serial.toLowerCase()}` };
  if (hostname && mac) {
    return {
      dedupe_key: `host_mac:${hostname.toLowerCase()}:${mac.toLowerCase()}`,
    };
  }
  return {
    dedupe_key:
      `user_model_site:${userId}:${model.toLowerCase()}:${establishmentId}`,
  };
}

function hardwareAgeScore(body: Json) {
  const ram = Number(body.ramTotalGb || 0);
  const free = Number(body.storageFreeGb || 0);
  const os = safeString(body.osVersion).toLowerCase();
  let score = 20;
  if (ram > 0 && ram < 8) score += 35;
  if (ram >= 8 && ram < 16) score += 20;
  if (ram >= 16) score -= 8;
  if (free > 0 && free < 20) score += 20;
  if (os.includes("windows 10")) score += 20;
  if (os.includes("windows 7") || os.includes("windows 8")) score += 45;
  return Math.max(0, Math.min(score, 100));
}

type CpuBenchmark = {
  cpu_name: string;
  cpu_mark_score: number;
  release_year: number | null;
  generation: string;
  category: string;
  source?: string;

  source_url?: string | null;
};

type CpuReleaseReference = {
  releaseYear: number | null;

  generation?: string;

  category?: string;

  source: string;

  confidence: string;

  releasePeriod?: string;

  searchUrl?: string;
};

let cpuReleaseCatalogCache: {
  expiresAt: number;
  rows: CpuReleaseCatalogRow[];
  aliases: CpuReleaseAliasRow[];
} | null = null;

function clearCpuReleaseCatalogCache() {
  cpuReleaseCatalogCache = null;
}

async function catalogCpuRelease(
  cpuName: string,
): Promise<CpuReleaseResolution | null> {
  if (!cpuName) return null;
  if (
    !cpuReleaseCatalogCache || cpuReleaseCatalogCache.expiresAt <= Date.now()
  ) {
    const catalog = await new CpuReleaseRepository(supabase).catalog();
    cpuReleaseCatalogCache = {
      expiresAt: Date.now() + 5 * 60_000,
      rows: catalog.rows,
      aliases: catalog.aliases,
    };
  }
  return resolveCpuRelease(
    cpuName,
    cpuReleaseCatalogCache.rows,
    cpuReleaseCatalogCache.aliases,
  );
}

function cpuReleaseEnrichmentFields(resolution: CpuReleaseResolution) {
  return {
    cpu_release_catalog_id: resolution.catalogId,
    cpu_release_year: releaseYear(resolution.period),
    cpu_release_period_start: resolution.period.periodStart,
    cpu_release_period_end: resolution.period.periodEnd,
    cpu_release_precision: resolution.period.precision,
    cpu_release_event_type: resolution.eventType,
    cpu_release_display: resolution.period.displayValue,
    cpu_release_source_type: resolution.sourceType,
    cpu_release_source_url: resolution.sourceUrl,
    cpu_release_match_scope: resolution.matchScope,
    cpu_release_match_method: resolution.matchMethod,
    cpu_release_confidence: resolution.confidence,
    cpu_release_is_official: resolution.isOfficial,
    cpu_release_last_verified_at: resolution.lastVerifiedAt,
  };
}

function nonOfficialCpuReleaseFields(
  cpuReleaseYear: number | null,
  benchmark: CpuBenchmark | null,
) {
  if (!cpuReleaseYear) return {};
  const source = safeString(benchmark?.source, 120) || "cpu-family-heuristic";
  const observed = source === "passmark-first-seen";
  return {
    cpu_release_catalog_id: null,
    cpu_release_year: cpuReleaseYear,
    cpu_release_period_start: `${cpuReleaseYear}-01-01`,
    cpu_release_period_end: `${cpuReleaseYear}-12-31`,
    cpu_release_precision: "year",
    cpu_release_event_type: "unknown",
    cpu_release_display: String(cpuReleaseYear),
    cpu_release_source_type: observed ? "passmark-observed" : "heuristic",
    cpu_release_source_url: safeExternalUrl(benchmark?.source_url) || null,
    cpu_release_match_scope: null,
    cpu_release_match_method: "heuristic",
    cpu_release_confidence: observed ? 45 : 30,
    cpu_release_is_official: false,
    cpu_release_last_verified_at: null,
  };
}

async function backfillCpuReleaseEnrichment(): Promise<number> {
  const repository = new CpuReleaseRepository(supabase);
  const catalog = await repository.catalog();
  const { data: devices, error } = await supabase.from("device_inventory_view")
    .select("id,cpu,enrichment_cpu_name")
    .limit(1000);
  if (error) throw error;
  const rows = (devices ?? []).flatMap((device) => {
    const cpuName = safeString(device.cpu || device.enrichment_cpu_name, 260);
    const resolution = resolveCpuRelease(
      cpuName,
      catalog.rows,
      catalog.aliases,
    );
    return resolution
      ? [{
        device_id: safeString(device.id),
        ...cpuReleaseEnrichmentFields(resolution),
      }]
      : [];
  });
  if (rows.length > 0) {
    const { error: upsertError } = await supabase.from("hardware_enrichment")
      .upsert(rows, {
        onConflict: "device_id",
      });
    if (upsertError) throw upsertError;
  }
  clearCpuReleaseCatalogCache();
  return rows.length;
}

async function lookupCpuBenchmark(cpuName: string) {
  const normalized = normalizeCpuName(cpuName);
  if (!normalized) return { benchmark: null, match: "none" };
  const reference = knownCpuReleaseReference(cpuName);

  const { data: imported } = await supabase
    .from("cpu_benchmarks")
    .select(
      "cpu_name,cpu_mark_score,release_year,generation,category,source,source_url",
    )
    .eq("normalized_name", normalized)
    .maybeSingle();
  if (imported) {
    const importedBenchmark = imported as CpuBenchmark;
    if (reference?.releaseYear) {
      return {
        benchmark: {
          ...importedBenchmark,
          release_year: reference.releaseYear,
          generation: reference.generation || importedBenchmark.generation ||
            inferCpuGeneration(cpuName),
          category: reference.category || importedBenchmark.category,
          source: importedBenchmark.source || reference.source,
        },
        match: "reference-imported",
      };
    }
    return { benchmark: importedBenchmark, match: "imported-exact" };
  }

  const seed = (cpuBenchmarkSeed as CpuBenchmark[]).find((item) =>
    normalizeCpuName(item.cpu_name) === normalized
  );
  if (seed) {
    return {
      benchmark: { ...seed, source: "bundled-cpu-seed" },
      match: "seed-exact",
    };
  }

  if (reference?.releaseYear) {
    return {
      benchmark: {
        cpu_name: safeString(cpuName, 260),
        cpu_mark_score: estimateCpuScore(cpuName),
        release_year: reference.releaseYear,
        generation: reference.generation || inferCpuGeneration(cpuName),
        category: reference.category || "mobile",
        source: reference.source,
      },
      match: "reference",
    };
  }

  const modelToken = normalized.match(
    /(?:i[3579]\s*\d{4,5}[a-z]*|core\s*ultra\s*[579]\s*\d{3}[a-z]*|core\s*[357]\s*\d{3}[a-z]*|ryzen\s*ai\s*[3579]\s*\d{3}|ryzen\s*[3579]\s*\d{4}[a-z]*|snapdragon\s*x(?:\s*plus)?\s*x1[pem]?\s*\d{5}|x1[pem]?\s*\d{5}|apple\s*m[1-4](?:\s*(?:pro|max|ultra))?)/,
  )?.[0];
  if (modelToken) {
    const candidate = (cpuBenchmarkSeed as CpuBenchmark[]).find((item) =>
      normalizeCpuName(item.cpu_name).includes(modelToken)
    );
    if (candidate) {
      return {
        benchmark: { ...candidate, source: "bundled-cpu-seed" },
        match: "seed-model",
      };
    }
  }
  return { benchmark: null, match: "estimated" };
}

function cpuVendor(cpuName: string) {
  const cpu = cpuName.toLowerCase();
  if (/\b(intel|core|xeon|pentium|celeron)\b/.test(cpu)) return "intel";
  if (/\b(amd|ryzen|athlon|epyc|threadripper)\b/.test(cpu)) return "amd";
  if (/\b(snapdragon|qualcomm|oryon)\b/.test(cpu)) return "qualcomm";
  if (/\bapple\s+m[1-4]\b/.test(cpu)) return "apple";
  return "unknown";
}

function officialCpuSearchUrl(cpuName: string, vendor: string) {
  const query = encodeURIComponent(cpuName);
  if (vendor === "intel") {
    return `https://www.intel.fr/content/www/fr/fr/search.html#q=${query}&cf-tabfilter=Products`;
  }
  if (vendor === "amd") return `https://www.amd.com/en/search?keyword=${query}`;
  if (vendor === "qualcomm") {
    return `https://www.qualcomm.com/search?query=${query}`;
  }
  return "";
}

function knownOfficialCpuReleaseDate(cpuName: string) {
  const cpu = cpuName.toLowerCase().replace(/\(r\)|\(tm\)|[®™]/g, " ").replace(
    /\s+/g,
    " ",
  );
  if (/\bcore\s+ultra\s+[579]\s+2\d{2}v\b/.test(cpu)) {
    return {
      releaseYear: 2024,
      source: "official-intel-core-ultra-200v",
      confidence: "official-family",
    };
  }
  if (/\bcore\s+ultra\s+[579]\s+1\d{2}[hup]\b/.test(cpu)) {
    return {
      releaseYear: 2023,
      source: "official-intel-core-ultra-series-1",
      confidence: "official-family",
    };
  }
  if (/\bcore\s+[357]\s+1\d{2}[hup]?\b/.test(cpu)) {
    return {
      releaseYear: 2023,
      source: "official-intel-core-series-1",
      confidence: "official-family",
    };
  }
  if (/\bryzen\s+ai\s+[3579]\s+(3[0-5]\d|4\d{2})\b/.test(cpu)) {
    return {
      releaseYear: 2025,
      source: "official-amd-ryzen-ai-family",
      confidence: "official-family",
    };
  }
  if (/\bryzen\s+ai\s+[3579]\s+3[6-9]\d\b/.test(cpu)) {
    return {
      releaseYear: 2024,
      source: "official-amd-ryzen-ai-300-family",
      confidence: "official-family",
    };
  }
  if (/\bsnapdragon(?:\s+x\s+plus)?.*\bx1p/i.test(cpu)) {
    return {
      releaseYear: 2024,
      source: "official-qualcomm-snapdragon-x-plus",
      confidence: "official-family",
    };
  }
  if (/\bsnapdragon\s+x\b|\bx1-?\d{5}\b/i.test(cpu)) {
    return {
      releaseYear: 2025,
      source: "official-qualcomm-snapdragon-x",
      confidence: "official-family",
    };
  }
  return null;
}

function knownCpuReleaseReference(cpuName: string): CpuReleaseReference | null {
  const cpu = canonicalCpuText(cpuName);
  const exactRules: Array<[RegExp, CpuReleaseReference]> = [
    [/\bryzen\s+5\s+4500u\b/, {
      releaseYear: 2020,
      releasePeriod: "2020-01-06",
      generation: "Ryzen 4000",
      category: "mobile",
      source: "official-amd-product-spec",
      confidence: "official-model",
      searchUrl:
        "https://www.amd.com/en/support/downloads/drivers.html/processors/ryzen/ryzen-4000-series/amd-ryzen-5-4500u.html",
    }],
    [/\bryzen\s+5\s+7520u\b/, {
      releaseYear: 2022,
      generation: "Ryzen 7000",
      category: "mobile",
      source: "official-amd-product-spec",
      confidence: "official-model",
    }],
    [/\bapple\s+m1\s+pro\b/, {
      releaseYear: 2021,
      generation: "Apple M1 Pro",
      category: "mobile",
      source: "official-apple-newsroom",
      confidence: "official-model",
    }],
    [/\bapple\s+m1\s+max\b/, {
      releaseYear: 2021,
      generation: "Apple M1 Max",
      category: "mobile",
      source: "official-apple-newsroom",
      confidence: "official-model",
    }],
    [/\bcore\s+7\s+150u\b/, {
      releaseYear: 2024,
      generation: "Intel Core Series 1",
      category: "mobile",
      source: "official-intel-core-series-1",
      confidence: "official-model",
    }],
    [/\bcore\s+i7[-\s]?1165g7\b/, {
      releaseYear: 2020,
      releasePeriod: "Q3 2020",
      generation: "11th Gen Intel",
      category: "mobile",
      source: "official-intel-ark",
      confidence: "official-model",
      searchUrl:
        "https://www.intel.com/content/www/us/en/products/sku/208921/intel-core-i71165g7-processor-12m-cache-up-to-4-70-ghz-with-ipu/specifications.html",
    }],
  ];

  const exactRule = exactRules.find(([pattern]) => pattern.test(cpu));
  if (exactRule) return exactRule[1];

  if (/\bcore\s+ultra\s+[579]\s+2\d{2}v\b/.test(cpu)) {
    return {
      releaseYear: 2024,
      generation: "Intel Core Ultra 200V",
      category: "mobile",
      source: "official-intel-core-ultra-200v",
      confidence: "official-family",
    };
  }
  if (/\bcore\s+ultra\s+[579]\s+1\d{2}[hup]\b/.test(cpu)) {
    return {
      releaseYear: 2023,
      generation: "Intel Core Ultra Series 1",
      category: "mobile",
      source: "official-intel-core-ultra-series-1",
      confidence: "official-family",
    };
  }
  if (/\bcore\s+[357]\s+1\d{2}[hup]?\b/.test(cpu)) {
    return {
      releaseYear: 2024,
      generation: "Intel Core Series 1",
      category: "mobile",
      source: "official-intel-core-series-1",
      confidence: "official-family",
    };
  }
  if (/\bryzen\s+ai\s+[3579]\s+4\d{2}\b/.test(cpu)) {
    return {
      releaseYear: 2026,
      generation: "AMD Ryzen AI 400",
      category: "mobile",
      source: "amd-ryzen-ai-400-family-rule",
      confidence: "family-rule",
    };
  }
  if (/\bryzen\s+ai\s+[3579]\s+3[0-5]\d\b/.test(cpu)) {
    return {
      releaseYear: 2025,
      generation: "AMD Ryzen AI 300",
      category: "mobile",
      source: "official-amd-ryzen-ai-family",
      confidence: "official-family",
    };
  }
  if (/\bryzen\s+ai\s+[3579]\s+3[6-9]\d\b/.test(cpu)) {
    return {
      releaseYear: 2024,
      generation: "AMD Ryzen AI 300",
      category: "mobile",
      source: "official-amd-ryzen-ai-300-family",
      confidence: "official-family",
    };
  }
  if (/\bsnapdragon(?:\s+x\s+plus)?.*\bx1p/i.test(cpu)) {
    return {
      releaseYear: 2024,
      generation: "Qualcomm Snapdragon X",
      category: "mobile",
      source: "official-qualcomm-snapdragon-x-plus",
      confidence: "official-family",
    };
  }
  if (/\bsnapdragon\s+x\b|\bx1-?\d{5}\b/i.test(cpu)) {
    return {
      releaseYear: 2025,
      generation: "Qualcomm Snapdragon X",
      category: "mobile",
      source: "official-qualcomm-snapdragon-x",
      confidence: "official-family",
    };
  }

  return null;
}

function parseLaunchYearFromOfficialText(text: string) {
  const normalized = text.replace(/\s+/g, " ");
  const patterns = [
    /(?:Launch Date|Date de lancement)\s*(Q[1-4]\s*['’]?\s*(?:20)?\d{2})/i,
    /(?:Launch Date|Date de lancement)\s*([A-Za-z]+\s+\d{1,2},\s+20\d{2})/i,
    /(?:Launch Date|Date de lancement)\s*(20\d{2})/i,
    /\bQ[1-4]\s*['’]\s*(\d{2})\b/i,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match) continue;
    const value = match[1] || match[0];
    const fullYear = String(value).match(/20\d{2}/)?.[0];
    if (fullYear) return Number(fullYear);
    const shortYear = String(value).match(/['’]\s*(\d{2})/)?.[1];
    if (shortYear) return Number(`20${shortYear}`);
  }
  return null;
}

async function fetchCpuReferenceText(url: string) {
  if (!url) return "";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "accept": "text/html,application/xhtml+xml",
        "accept-language": "en-US,en;q=0.9,fr;q=0.8",
        "user-agent":
          "SpacefootInventory/1.0 (+https://badr-spacefoot.github.io/pc_inventory_2.0/)",
      },
    });
    if (!response.ok) return "";
    return (await response.text()).slice(0, 500_000).replace(
      /<script[\s\S]*?<\/script>/gi,
      " ",
    ).replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

function passMarkCpuDetailUrl(sourceUrl: string) {
  const canonicalUrl = canonicalizeCpuBenchmarkSourceUrl(sourceUrl);
  if (!canonicalUrl) return "";
  try {
    const url = new URL(canonicalUrl);
    if (
      !/(^|\.)cpubenchmark\.net$/i.test(url.hostname) ||
      !/\/cpu\.php$/i.test(url.pathname) ||
      !url.searchParams.has("id")
    ) return "";
    return url.toString();
  } catch {
    return "";
  }
}

async function lookupCpuReleaseDate(
  cpuName: string,
  benchmarkSourceUrl = "",
): Promise<CpuReleaseReference> {
  const cleanCpu = safeString(cpuName, 260);
  const vendor = cpuVendor(cleanCpu);
  const searchUrl = officialCpuSearchUrl(cleanCpu, vendor);
  const catalogRelease = await catalogCpuRelease(cleanCpu);
  const catalogReleaseYear = catalogRelease
    ? releaseYear(catalogRelease.period)
    : null;
  if (catalogRelease?.isOfficial && catalogReleaseYear) {
    return {
      releaseYear: catalogReleaseYear,
      releasePeriod: catalogRelease.period.displayValue,
      generation: inferCpuGeneration(cleanCpu) || undefined,
      category: "mobile",
      source: `official-${catalogRelease.sourceVendor}-catalog`,
      confidence: catalogRelease.matchScope === "part_number"
        ? "official-part-number"
        : "official-exact-name",
      searchUrl: catalogRelease.sourceUrl ?? searchUrl,
    };
  }
  const knownReference = knownCpuReleaseReference(cleanCpu);
  const knownOfficial = knownReference?.source.startsWith("official-")
    ? knownReference
    : knownOfficialCpuReleaseDate(cleanCpu);
  if (knownOfficial) return { searchUrl, ...knownOfficial };
  const passMarkUrl = passMarkCpuDetailUrl(benchmarkSourceUrl);
  const passMarkFirstSeen = parsePassMarkFirstSeen(
    await fetchCpuReferenceText(passMarkUrl),
  );
  if (passMarkFirstSeen) {
    return {
      releaseYear: passMarkFirstSeen.year,
      releasePeriod: passMarkFirstSeen.label,
      generation: inferCpuGeneration(cleanCpu) || undefined,
      category: "mobile",
      source: "passmark-first-seen",
      confidence: "observed",
      searchUrl: passMarkUrl,
    };
  }
  const officialText = await fetchCpuReferenceText(searchUrl);
  const officialYear = parseLaunchYearFromOfficialText(officialText);
  if (officialYear) {
    return {
      releaseYear: officialYear,
      generation: inferCpuGeneration(cleanCpu) || undefined,
      category: "mobile",
      source: vendor === "intel"
        ? "official-intel-ark-search"
        : vendor === "amd"
        ? "official-amd-product-search"
        : "official-product-search",
      confidence: "official-search",
      searchUrl,
    };
  }
  if (knownReference) return { searchUrl, ...knownReference };
  const fallbackYear = inferCpuReleaseYear(cleanCpu);
  return {
    releaseYear: fallbackYear,
    generation: inferCpuGeneration(cleanCpu) || undefined,
    category: fallbackYear ? "mobile" : undefined,
    source: fallbackYear ? `${vendor}-family-rule` : "unknown",
    confidence: fallbackYear ? "family-rule" : "none",
    searchUrl,
  };
}

async function getEbayBrowseToken() {
  const now = Date.now();
  if (ebayGeneratedToken && ebayGeneratedTokenExpiresAt > now + 60_000) {
    return ebayGeneratedToken;
  }
  if (ebayClientId && ebayClientSecret) {
    const credentials = btoa(`${ebayClientId}:${ebayClientSecret}`);
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      scope: ebayOAuthScope,
    });
    const response = await fetch(
      "https://api.ebay.com/identity/v1/oauth2/token",
      {
        method: "POST",
        signal: AbortSignal.timeout(5000),
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      },
    ).catch(() => null);
    if (response?.ok) {
      const data = await response.json();
      ebayGeneratedToken = safeString(data.access_token, 5000);
      const expiresIn = safeNumber(data.expires_in) ?? 7200;
      ebayGeneratedTokenExpiresAt = now + Math.max(60, expiresIn - 120) * 1000;
      if (ebayGeneratedToken) return ebayGeneratedToken;
    }
  }
  return ebayBrowseApiToken;
}

type MarketFetchResult = {
  rows: Json[];
  status: string;
  statusCode?: number;
  error?: string;
  query?: string;
  attemptedQueries?: string[];
};

async function fetchEbayPriceResult(
  query: string,
  device: Json,
): Promise<MarketFetchResult> {
  const browseToken = await getEbayBrowseToken();

  if (!browseToken) return { rows: [], status: "missing_token", query };
  const url = new URL("https://api.ebay.com/buy/browse/v1/item_summary/search");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "10");
  url.searchParams.set("filter", "buyingOptions:{FIXED_PRICE}");
  const response = await fetch(url, {
    signal: AbortSignal.timeout(5000),
    headers: {
      Authorization: `Bearer ${browseToken}`,
      "X-EBAY-C-MARKETPLACE-ID": ebayMarketplaceId,
    },
  }).catch((error) => ({ error }));
  if (!response || "error" in response) {
    return {
      rows: [],
      status: "network_error",
      error: safeString(response?.error?.message, 300),
      query,
    };
  }
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    return {
      rows: [],
      status: `http_${response.status}`,
      statusCode: response.status,
      error: safeString(errorText, 500),
      query,
    };
  }
  const data = await response.json();
  const rows = [];
  for (const item of data.itemSummaries ?? []) {
    const title = safeString(item.title, 300);
    if (isExcludedMarketListing(title)) continue;
    if (!marketListingMatchesDevice(title, device)) continue;
    const price = safeNumber((item.price as Json | undefined)?.value);
    if (!price) continue;
    rows.push({
      source: "ebay",
      search_query: query,
      price,
      currency: safeString((item.price as Json | undefined)?.currency, 8) ||
        "EUR",
      condition: safeString(item.condition, 120),
      listing_url: safeString(item.itemWebUrl, 1000),
    });
  }

  return {
    rows,
    status: rows.length ? "ok" : "empty",
    statusCode: response.status,
    query,
  };
}

async function fetchEbayMarketPricesForDevice(
  device: Json,
): Promise<MarketFetchResult> {
  const attemptedQueries = buildMarketSearchQueries(device);
  if (attemptedQueries.length === 0) {
    return { rows: [], status: "empty", attemptedQueries };
  }
  let lastResult: MarketFetchResult = {
    rows: [],
    status: "empty",
    attemptedQueries,
  };
  for (const query of attemptedQueries) {
    const result = await fetchEbayPriceResult(query, device);
    lastResult = { ...result, attemptedQueries };
    if (result.rows.length > 0 || result.status !== "empty") return lastResult;
  }
  return lastResult;
}

async function enrichOneDevice(
  device: Json,
  options: { force: boolean; useExternal: boolean },
) {
  if (!options.force && device.last_enriched_at) {
    const ageMs = Date.now() -
      new Date(safeString(device.last_enriched_at)).getTime();
    if (ageMs < enrichmentCacheDays * 86400000) {
      return { skipped: true, deviceId: device.id };
    }
  }

  const cpuName = safeString(device.cpu || device.enrichment_cpu_name, 260);
  const model = safeString(device.model, 160);
  const manufacturer = safeString(device.manufacturer, 160);
  if (!cpuName && !model && !manufacturer) {
    const failed = {
      device_id: safeString(device.id),
      enrichment_status: "failed",
      enrichment_source: "insufficient-data",
      notes: "Manufacturer, model and CPU are missing.",
      last_enriched_at: new Date().toISOString(),
    };
    await supabase.from("hardware_enrichment").upsert(failed, {
      onConflict: "device_id",
    });
    return { skipped: false, failed: true, deviceId: device.id };
  }

  const cpuLookup = await lookupCpuBenchmark(cpuName);
  const benchmark = cpuLookup.benchmark;
  const officialCpuRelease = await catalogCpuRelease(cpuName);
  const officialCpuReleaseYear = officialCpuRelease
    ? releaseYear(officialCpuRelease.period)
    : null;
  const cpuReleaseYear = officialCpuReleaseYear ?? benchmark?.release_year ??
    inferCpuReleaseYear(cpuName);
  const cpuScore = benchmark?.cpu_mark_score ?? estimateCpuScore(cpuName);
  const modelRelease = inferModelReleaseYear(model, cpuReleaseYear);
  const modelReleaseYear = modelRelease.year;
  const category = detectDeviceCategory(device, benchmark?.category);
  const estimatedRuleLaunchPrice = estimateLaunchPrice(device, category);
  const manufacturerPrice = manufacturerPriceForDevice(device);
  const manufacturerListPrice = safeNumber(manufacturerPrice?.list_price);
  const manufacturerCurrentNewPrice = safeNumber(
    manufacturerPrice?.current_new_price,
  );
  const manufacturerPriceIsExact =
    safeString(manufacturerPrice?.spec_match) === "exact";
  const manufacturerPriceMatchesConfiguration = Boolean(
    manufacturerListPrice &&
      ["exact", "configuration"].includes(
        safeString(manufacturerPrice?.spec_match),
      ),
  );
  const launchPrice = manufacturerPriceMatchesConfiguration &&
      manufacturerListPrice
    ? manufacturerListPrice
    : estimatedRuleLaunchPrice;
  const marketQueries = buildMarketSearchQueries(device);
  const query = marketQueries[0] ||
    [manufacturer, model, cpuName.split("@")[0]].filter(Boolean).join(" ");
  const cachedMarketObservationCount = Math.max(
    0,
    Math.round(safeNumber(device.market_observation_count) ?? 0),
  );
  const hasCachedMarket = !options.useExternal &&
    cachedMarketObservationCount > 0;
  const marketResult: MarketFetchResult = options.useExternal
    ? await fetchEbayMarketPricesForDevice(device)
    : {
      rows: [],
      status: hasCachedMarket ? "cached" : "disabled",
      query,
      attemptedQueries: marketQueries,
    };
  const marketRows = filterMarketRowsByPrice(
    marketResult.rows,
    launchPrice,
    category,
  );
  const prices = marketRows.map((row: Json) => safeNumber(row.price)).filter((
    price: number | null,
  ): price is number => price !== null && price > 0);
  const newPrices = marketRows
    .filter((row: Json) =>
      safeString(row.condition).toLowerCase().includes("new") ||
      safeString(row.condition).toLowerCase().includes("neuf")
    )
    .map((row: Json) => safeNumber(row.price))
    .filter((price: number | null): price is number =>
      price !== null && price > 0
    );
  const freshStats = priceStats(prices);
  const stats = resolveMarketPriceStats(
    device,
    freshStats,
    options.useExternal,
  );
  const newStats = priceStats(newPrices);
  const currentYear = new Date().getFullYear();
  const age = modelReleaseYear
    ? Math.max(0, currentYear - modelReleaseYear)
    : 0;
  const depreciationValue = roundCurrency(
    launchPrice * depreciationFactor(age),
  );
  const marketObservationCount = stats.count;

  const cachedResaleValue = safeNumber(
    device.resale_value ?? device.estimated_current_value,
  );
  const resaleValue = hasCachedMarket && cachedResaleValue !== null
    ? roundCurrency(cachedResaleValue)
    : stats.median === null
    ? depreciationValue
    : roundCurrency(stats.median * 0.75 + depreciationValue * 0.25);

  const marketPriceMin = stats.min;
  const marketPriceAvg = stats.avg;
  const marketPriceMax = stats.max;
  const cachedCurrentNewPrice = device.current_new_price === null ||
      device.current_new_price === undefined
    ? null
    : safeNumber(device.current_new_price);
  const currentNewPrice = manufacturerCurrentNewPrice ??
    (options.useExternal ? newStats.avg : cachedCurrentNewPrice);

  const replacementCost = replacementCostEstimate(
    launchPrice,
    category,
    cpuScore,
  );

  const bookValue = bookValueEstimate(launchPrice, age);
  const performanceIndex = Math.max(
    0,
    Math.min(100, Math.round((cpuScore / 18000) * 100)),
  );
  const priority = replacementPriority(
    device,
    age,
    cpuScore,
    resaleValue,
    category,
  );
  const recommendation = recommendationForPriority(priority.score);
  const hasModelEvidence = ["model-year", "known-model"].includes(
    modelRelease.match,
  );

  const method = manufacturerPriceIsExact
    ? "manufacturer_msrp"
    : valuationMethod(
      marketObservationCount,
      hasModelEvidence,
      Boolean(benchmark),
      cpuReleaseYear,
    );

  const confidenceScore = manufacturerPriceIsExact
    ? 94
    : marketObservationCount >= 5
    ? Math.min(100, 88 + Math.min(marketObservationCount, 12))
    : marketObservationCount >= 3
    ? 82
    : benchmark && ["model-year", "known-model"].includes(modelRelease.match)
    ? 78
    : cpuReleaseYear && category
    ? 62
    : manufacturer || category
    ? 42
    : 25;
  const confidenceLabel = valuationConfidenceLabel(method, confidenceScore);

  const valuationReasons = [
    `method:${method}`,
    `confidence:${confidenceLabel}`,
    `market_observations:${marketObservationCount}`,
    `age:${age}`,
    `category:${category}`,
    `cpu_score:${cpuScore}`,
    `model_match:${modelRelease.match}`,
    manufacturerPrice
      ? `manufacturer_price:${manufacturerPrice.spec_match}`
      : "",
  ].filter(Boolean);

  const sources = [
    officialCpuRelease?.sourceType || "",
    benchmark?.source || (cpuName ? "cpu-generation-estimate" : ""),
    "category-price-rules",
    "age-depreciation",
    marketObservationCount > 0 ? "ebay-optional" : "",
    manufacturerPrice ? `${manufacturerPrice.source}-product-page` : "",
  ].filter(Boolean);
  const enrichmentStatus =
    ["manufacturer_msrp", "market_verified", "market_blended", "model_matched"]
        .includes(method)
      ? "completed"
      : "partial";
  const noteParts = [
    manufacturerPriceMatchesConfiguration
      ? `Launch/MSRP price sourced from ${manufacturerPrice?.source} with matched model configuration.`
      : `Launch price estimated from ${category} and ${
        cpuTier(cpuName)
      } CPU rules.`,
    `Resale value uses ${
      marketObservationCount >= 3
        ? "external market median blended with depreciation"
        : `${age}-year depreciation estimate`
    }.`,

    `Replacement cost is estimated separately from resale value.`,

    `Book value uses a 4-year straight-line depreciation model.`,
    ...priority.reasons,
  ];

  const enrichment = {
    device_id: safeString(device.id),
    cpu_name: cpuName,
    cpu_score: cpuScore,
    cpu_benchmark_score: cpuScore,

    cpu_benchmark_source_url: benchmark?.source_url || null,
    cpu_generation: benchmark?.generation || inferCpuGeneration(cpuName),
    cpu_release_year: cpuReleaseYear,
    ...(officialCpuRelease
      ? cpuReleaseEnrichmentFields(officialCpuRelease)
      : nonOfficialCpuReleaseFields(cpuReleaseYear, benchmark)),
    model_release_year: modelReleaseYear,
    release_year: modelReleaseYear,
    estimated_launch_price: launchPrice,
    current_new_price: currentNewPrice,
    current_market_price_min: marketObservationCount > 0
      ? marketPriceMin
      : null,
    current_market_price_avg: marketObservationCount > 0
      ? marketPriceAvg
      : null,
    current_market_price_max: marketObservationCount > 0
      ? marketPriceMax
      : null,
    estimated_current_value: resaleValue,
    resale_value: resaleValue,

    replacement_cost: replacementCost,

    book_value: bookValue,

    valuation_method: method,

    valuation_confidence_label: confidenceLabel,

    valuation_reasons: valuationReasons,

    market_observation_count: marketObservationCount,

    market_source: marketObservationCount > 0 ? "ebay" : null,
    enrichment_source: sources.join(","),
    performance_index: performanceIndex,
    obsolescence_index: priority.score,
    replacement_priority: priority.score,
    recommendation,
    confidence_score: confidenceScore,
    price_confidence_score: confidenceScore,
    enrichment_status: enrichmentStatus,
    device_category: category,
    notes: noteParts.join(" "),
    last_enriched_at: new Date().toISOString(),
    raw_data: {
      query: marketResult.query ?? query,
      attempted_queries: marketResult.attemptedQueries ?? marketQueries,
      manufacturer_price: manufacturerPrice,
      estimated_rule_launch_price: estimatedRuleLaunchPrice,
      age,
      depreciation_factor: depreciationFactor(age),
      resale_value: resaleValue,
      replacement_cost: replacementCost,
      book_value: bookValue,
      valuation_method: method,
      valuation_confidence_label: confidenceLabel,
      market_observation_count: marketObservationCount,

      cpu_match: cpuLookup.match,
      model_match: modelRelease.match,
      provider_status: {
        ebay: {
          status: marketResult.status,
          status_code: marketResult.statusCode ?? null,
          error: marketResult.error ?? null,
          query: marketResult.query ?? query,
          attempted_queries: marketResult.attemptedQueries ?? marketQueries,
        },
      },
      provider_counts: {
        ebay: options.useExternal
          ? marketRows.filter((row: Json) => row.source === "ebay").length
          : cachedMarketObservationCount,
      },
    },
  };

  const { error } = await supabase.from("hardware_enrichment").upsert(
    enrichment,
    { onConflict: "device_id" },
  );
  if (error) throw error;

  if (marketRows.length > 0) {
    const { error: historyError } = await supabase.from("market_price_history")
      .insert(
        marketRows.map((row: Json) => ({
          ...row,
          device_id: safeString(device.id),
          collected_at: new Date().toISOString(),
        })),
      );
    if (historyError) throw historyError;
  }

  return {
    skipped: false,
    deviceId: device.id,
    recommendation,
    priority: priority.score,
    status: enrichmentStatus,
    marketObservationCount,
    providerCounts: {
      ebay: options.useExternal
        ? marketRows.filter((row: Json) => row.source === "ebay").length
        : cachedMarketObservationCount,
    },
    providerStatus: {
      ebay: {
        status: marketResult.status,
        statusCode: marketResult.statusCode ?? null,
        error: marketResult.error ?? null,
        query: marketResult.query ?? query,
        attemptedQueries: marketResult.attemptedQueries ?? marketQueries,
      },
    },
    query: marketResult.query ?? query,
  };
}

async function persistScan(
  request: Request,
  user: {
    id: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    team_id: string;
    establishment_id: string;
  },
  rawBody: Json,
  tokenId?: string,
) {
  const body = normalizeScanPayload(rawBody);
  if (!safeString(body.hostname)) {
    return badRequest(request, "hostname requis.");
  }
  if (!safeString(body.model)) return badRequest(request, "model requis.");

  const dedupe = dedupePayload({
    ...body,
    establishmentId: user.establishment_id,
  }, user.id);
  const collectedAt = safeString(body.collectedAt) || new Date().toISOString();
  const [
    { data: previousDevice, error: previousDeviceError },
    { data: previousAssignment, error: previousAssignmentError },
  ] = await Promise.all([
    supabase.from("device_inventory_view").select("*").eq(
      "dedupe_key",
      dedupe.dedupe_key,
    ).maybeSingle(),
    supabase.from("devices").select("assigned_user_id,team_id,establishment_id")
      .eq("dedupe_key", dedupe.dedupe_key).maybeSingle(),
  ]);
  if (previousDeviceError) throw previousDeviceError;
  if (previousAssignmentError) throw previousAssignmentError;
  const eventSource = safeString(rawBody.importedFrom) ? "IMPORT" : "COLLECTOR";
  const updateAssignmentFromScan = eventSource === "COLLECTOR";
  const previousStatus = safeString(previousDevice?.status);
  const reactivatesStock = updateAssignmentFromScan &&
    previousStatus === "stock";
  const clearsAssignment = previousStatus === "retired";
  const deviceValues = {
    assigned_user_id: clearsAssignment
      ? null
      : updateAssignmentFromScan
      ? user.id
      : previousAssignment?.assigned_user_id ?? user.id,
    team_id: clearsAssignment
      ? null
      : updateAssignmentFromScan
      ? user.team_id
      : previousAssignment?.team_id ?? user.team_id,
    establishment_id: updateAssignmentFromScan
      ? user.establishment_id
      : previousAssignment?.establishment_id ?? user.establishment_id,
    hostname: safeString(body.hostname, 160),
    os_name: safeString(body.osName, 80),
    os_version: safeString(body.osVersion, 160),
    manufacturer: safeString(body.manufacturer, 160),
    model: safeString(body.model, 160),
    model_number: safeString(body.modelNumber, 160) || null,
    service_tag: safeString(body.serviceTag, 160) || null,
    hardware_identity:
      (body.hardwareIdentity && typeof body.hardwareIdentity === "object")
        ? body.hardwareIdentity
        : {},
    serial_number: safeString(body.serialNumber, 160) || null,
    cpu: safeString(body.cpu, 260),
    gpu: safeString(body.gpu, 260) || null,
    ram_total_gb: safeNumber(body.ramTotalGb),
    storage_total_gb: safeNumber(body.storageTotalGb),
    storage_free_gb: safeNumber(body.storageFreeGb),
    storage_type: safeString(body.storageType, 40) || null,
    mac_address: normalizeMac(body.macAddress),
    local_ip: safeString(body.localIp, 80),
    windows_user: safeString(body.windowsUser, 160),
    script_version: safeString(body.scriptVersion, 40),
    last_seen_at: collectedAt,
    hardware_age_score: hardwareAgeScore(body),
    ...(reactivatesStock ? { status: "active" } : {}),
    ...dedupe,
  };

  const { data: device, error: deviceError } = await supabase
    .from("devices")
    .upsert(deviceValues, { onConflict: "dedupe_key" })
    .select("id")
    .single();
  if (deviceError) throw deviceError;
  const userAssignmentChanged = Boolean(previousAssignment) &&
    historyValue(previousAssignment?.assigned_user_id) !==
      historyValue(deviceValues.assigned_user_id);
  const assignmentContextChanged = Boolean(previousAssignment) &&
    (
      historyValue(previousAssignment?.team_id) !==
        historyValue(deviceValues.team_id) ||
      historyValue(previousAssignment?.establishment_id) !==
        historyValue(deviceValues.establishment_id)
    );
  if (updateAssignmentFromScan && userAssignmentChanged) {
    await closeOpenAssignmentPeriod(
      device.id,
      collectedAt,
      "collector",
      "Device assignment updated by collector scan.",
    );
    await openAssignmentPeriod(
      device.id,
      deviceValues.assigned_user_id,
      deviceValues.team_id,
      deviceValues.establishment_id,
      collectedAt,
      "collector",
      "COLLECTOR",
      "Device assignment updated by collector scan.",
    );
  } else if (
    updateAssignmentFromScan && assignmentContextChanged &&
    deviceValues.assigned_user_id
  ) {
    await updateOpenAssignmentPeriodContext(
      device.id,
      deviceValues.team_id,
      deviceValues.establishment_id,
      "Assignment context updated by collector scan.",
    );
  } else if (
    updateAssignmentFromScan && !previousAssignment &&
    deviceValues.assigned_user_id
  ) {
    await openAssignmentPeriod(
      device.id,
      deviceValues.assigned_user_id,
      deviceValues.team_id,
      deviceValues.establishment_id,
      collectedAt,
      "collector",
      "COLLECTOR",
      "Device assigned by first collector scan.",
    );
  }

  const { error: scanError } = await supabase.from("device_scans").insert({
    device_id: device.id,
    user_id: user.id,
    collected_at: collectedAt,
    payload: rawBody,
    hostname: deviceValues.hostname,
    os_name: deviceValues.os_name,
    os_version: deviceValues.os_version,
    manufacturer: deviceValues.manufacturer,
    model: deviceValues.model,
    model_number: deviceValues.model_number,
    service_tag: deviceValues.service_tag,
    hardware_identity: deviceValues.hardware_identity,
    serial_number: deviceValues.serial_number,
    cpu: deviceValues.cpu,
    gpu: deviceValues.gpu,
    ram_total_gb: deviceValues.ram_total_gb,
    storage_total_gb: deviceValues.storage_total_gb,
    storage_free_gb: deviceValues.storage_free_gb,
    storage_type: deviceValues.storage_type,
    mac_address: deviceValues.mac_address,
    local_ip: deviceValues.local_ip,
    windows_user: deviceValues.windows_user,
    script_version: deviceValues.script_version,
    hardware_age_score: deviceValues.hardware_age_score,
  });
  if (scanError) throw scanError;
  const historyRows = changedDeviceHistory(
    device.id,
    previousDevice,
    deviceValues,
    eventSource,
    collectedAt,
  );
  if (reactivatesStock) {
    historyRows.push({
      device_id: device.id,
      event_type: "STATUS_CHANGED",
      field_name: "status",
      old_value: "stock",
      new_value: "active",
      changed_by: "collector",
      source: "COLLECTOR",
      notes: "Stock device reactivated by collector scan with a user profile.",
      changed_at: collectedAt,
      related_user_id: deviceValues.assigned_user_id,
      related_team_id: deviceValues.team_id,
      related_establishment_id: deviceValues.establishment_id,
    });
  }
  await appendDeviceHistory(historyRows);
  if (!previousDevice) {
    const userName =
      [safeString(user.first_name), safeString(user.last_name)].filter(Boolean)
        .join(" ") || safeString(user.email) || "utilisateur non renseigne";
    const deviceLabel =
      [safeString(deviceValues.manufacturer), safeString(deviceValues.model)]
        .filter(Boolean).join(" ") ||
      safeString(deviceValues.hostname) || "machine";

    await notify(
      "COLLECTOR_SUBMISSION_RECEIVED",
      "Nouvelle machine collectee",
      `${deviceLabel} (${deviceValues.hostname}) a ete ajoutee au parc pour ${userName}.`,
      {
        severity: "SUCCESS",
        targetRole: "ADMIN",
        relatedEntityType: "device",
        relatedEntityId: device.id,
      },
    );
  } else if (
    historyRows.some((row) =>
      [
        "OS_CHANGED",
        "HARDWARE_CHANGED",
        "USER_REASSIGNED",
        "DEVICE_RESET",
        "IMPORT_UPDATE",
        "STATUS_CHANGED",
      ].includes(safeString(row.event_type))
    )
  ) {
    await notify(
      "COLLECTOR_SUBMISSION_RECEIVED",
      "Machine mise à jour",
      `${deviceValues.hostname} a remonté des changements matériels ou système.`,
      {
        severity: "INFO",
        targetRole: "ADMIN",
        relatedEntityType: "device",
        relatedEntityId: device.id,
      },
    );
  }

  if (tokenId) {
    await supabase.from("collection_tokens").update({
      used_at: new Date().toISOString(),
    }).eq("id", tokenId);
  }
  await audit(
    previousDevice ? "device_scan_updated" : "device_scan_created",
    "device",
    device.id,
    {
      hostname: deviceValues.hostname,
      dedupe_key: dedupe.dedupe_key,
      previous_first_name: previousDevice?.first_name ?? "",
      previous_last_name: previousDevice?.last_name ?? "",
      previous_team: previousDevice?.team_name ?? "",
      previous_establishment: previousDevice?.establishment_name ?? "",
    },
  );
  return json(request, { ok: true, deviceId: device.id });
}

async function handleScan(request: Request) {
  const token = (request.headers.get("authorization") ?? "").replace(
    /^Bearer\s+/i,
    "",
  );
  if (!token) return badRequest(request, "Token script manquant.", 401);

  const tokenHash = await sha256(token);
  const { data: tokenRow, error: tokenError } = await supabase
    .from("collection_tokens")
    .select("id,user_id,expires_at,used_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (tokenError) throw tokenError;
  if (!tokenRow || new Date(tokenRow.expires_at).getTime() < Date.now()) {
    return badRequest(request, "Token script invalide ou expire.", 401);
  }

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id,team_id,establishment_id")
    .eq("id", tokenRow.user_id)
    .single();
  if (userError) throw userError;

  const body = await request.json().catch(() => ({}));
  return await persistScan(request, user, body, tokenRow.id);
}

async function handleLegacyScan(request: Request) {
  const accessToken = request.headers.get("x-collection-access-token") ?? "";
  const body = await request.json().catch(() => ({}));
  const required = ["firstName", "lastName", "team", "site"];
  for (const field of required) {
    if (!safeString(body[field])) {
      return badRequest(request, `Champ requis: ${field}`);
    }
  }
  const accessTokenId = await consumeCollectionAccessToken(accessToken);
  if (!accessTokenId) {
    return badRequest(
      request,
      "Token de collecte invalide, expiré, révoqué ou épuisé.",
      401,
    );
  }
  if (!safeString(body.email)) {
    body.email = `${safeString(body.firstName).toLowerCase()}.${
      safeString(body.lastName).toLowerCase()
    }@legacy.local`;
  }
  const emailError = emailValidationError(
    safeString(body.email, 255).toLowerCase(),
  );
  if (emailError) return badRequest(request, emailError);
  const user = await upsertUserProfile(body);
  return await persistScan(request, user, body);
}

async function handleAdminListUsers(request: Request) {
  const auth = await requireAction(request, "USER_MANAGE");
  if (auth.response) return auth.response;
  const { data, error } = await supabase
    .from("admin_users")
    .select(
      "id,username,display_name,email,role,is_active,created_at,updated_at,last_login_at",
    )
    .order("created_at", { ascending: false });
  if (error) throw error;
  return json(request, { users: (data ?? []).map(publicAdminUser) });
}

async function handleAdminSaveUser(request: Request, id?: string) {
  const auth = await requireAction(request, "USER_MANAGE");
  if (auth.response) return auth.response;
  const body = await request.json().catch(() => ({}));
  const username = safeString(body.username, 80).toLowerCase();
  const displayName = safeString(body.displayName, 120);
  const email = safeString(body.email, 255).toLowerCase() || null;
  const role = normalizedRole(body.role);
  const password = safeString(body.password, 500);
  if (!username) return badRequest(request, "Identifiant requis.");
  if (!displayName) return badRequest(request, "Nom affiche requis.");
  if (!id && !password) {
    return badRequest(
      request,
      "Mot de passe requis pour créer un utilisateur.",
    );
  }
  if (password && password.length < 10) {
    return badRequest(
      request,
      "Mot de passe trop court: 10 caracteres minimum.",
    );
  }
  if (email) {
    const emailError = emailValidationError(email);
    if (emailError) return badRequest(request, emailError);
  }
  const values: Json = {
    username,
    display_name: displayName,
    email,
    role,
    is_active: body.isActive !== false,
    updated_at: new Date().toISOString(),
  };
  if (password) values.password_hash = await pbkdf2Hash(password);
  const query = id
    ? supabase.from("admin_users").update(values).eq("id", id)
    : supabase.from("admin_users").insert(values);
  const { data, error } = await query
    .select(
      "id,username,display_name,email,role,is_active,created_at,updated_at,last_login_at",
    )
    .single();
  if (error) {
    if (error.code === "23505") {
      return badRequest(
        request,
        "Un compte utilise déjà cet identifiant ou email.",
        409,
      );
    }
    throw error;
  }
  await audit(
    id ? "admin_user_updated" : "admin_user_created",
    "admin_user",
    data.id,
    {
      username,
      role,
      password_reset: Boolean(password && id),
      actor: auth.session?.username,
    },
  );
  await notify(
    "ADMIN_ACTION_COMPLETED",
    id ? "Compte admin mis a jour" : "Compte admin cree",
    `${username} (${role})`,
    {
      severity: "SUCCESS",
      targetRole: "ADMIN",
      relatedEntityType: "admin_user",
      relatedEntityId: data.id,
    },
  );
  return json(request, { user: publicAdminUser(data) }, id ? 200 : 201);
}

async function handleAdminDeleteUser(request: Request, id: string) {
  const auth = await requireAction(request, "USER_MANAGE");
  if (auth.response) return auth.response;
  if (id === auth.session?.id) {
    return badRequest(
      request,
      "Impossible de supprimer votre propre compte.",
      409,
    );
  }
  const { data: user, error: findError } = await supabase
    .from("admin_users")
    .select("id,username")
    .eq("id", id)
    .maybeSingle();
  if (findError) throw findError;
  if (!user) return badRequest(request, "Compte introuvable.", 404);
  const { error } = await supabase.from("admin_users").delete().eq("id", id);
  if (error) throw error;
  await audit("admin_user_deleted", "admin_user", id, {
    username: user.username,
    actor: auth.session?.username,
  });
  await notify(
    "ADMIN_ACTION_COMPLETED",
    "Compte admin supprime",
    `${user.username} a ete supprime.`,
    {
      severity: "WARNING",
      targetRole: "ADMIN",
      relatedEntityType: "admin_user",
      relatedEntityId: id,
    },
  );
  return json(request, { deleted: true });
}

async function handleAdminListNotifications(request: Request) {
  const auth = await requireAction(request, "NOTIFICATION_VIEW");
  if (auth.response) return auth.response;
  let query = supabase
    .from("notifications")
    .select(
      "id,type,title,message,severity,target_role,target_user_id,related_entity_type,related_entity_id,is_read,created_at,read_at",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (auth.session?.role !== "ADMIN") {
    query = query.or(
      `target_role.eq.ALL,target_role.eq.${auth.session?.role},target_user_id.eq.${auth.session?.id}`,
    );
  }
  const { data, error } = await query;
  if (error) throw error;
  const notifications = data ?? [];
  const deviceIds = Array.from(
    new Set(
      notifications
        .filter((item) =>
          safeString(item.related_entity_type).toLowerCase() === "device"
        )
        .map((item) => safeString(item.related_entity_id))
        .filter(Boolean),
    ),
  );
  let devicesById: Record<string, Json> = {};

  if (deviceIds.length > 0) {
    const { data: devices, error: devicesError } = await supabase
      .from("device_inventory_view")
      .select(
        "id,hostname,manufacturer,model,model_number,serial_number,first_name,last_name,email,team_name,team_abbreviation,establishment_name,establishment_abbreviation,status",
      )
      .in("id", deviceIds);
    if (devicesError) throw devicesError;
    devicesById = Object.fromEntries(
      (devices ?? []).map((device) => [safeString(device.id), device]),
    );
  }

  const enriched = notifications.map((item) => ({
    ...item,
    device: safeString(item.related_entity_type).toLowerCase() === "device"
      ? devicesById[safeString(item.related_entity_id)] ?? null
      : null,
  }));

  return json(request, {
    notifications: enriched,
    unread: enriched.filter((item) => !item.is_read).length,
  });
}

async function handleAdminMarkNotification(request: Request, id?: string) {
  const auth = await requireAction(request, "NOTIFICATION_VIEW");
  if (auth.response) return auth.response;
  const now = new Date().toISOString();
  let query = supabase.from("notifications").update({
    is_read: true,
    read_at: now,
  });
  query = id ? query.eq("id", id) : query.eq("is_read", false);
  if (auth.session?.role !== "ADMIN") {
    query = query.or(
      `target_role.eq.ALL,target_role.eq.${auth.session?.role},target_user_id.eq.${auth.session?.id}`,
    );
  }
  const { error } = await query;
  if (error) throw error;
  return json(request, { ok: true });
}

async function handleAdminListAccessTokens(request: Request) {
  if (!(await isAdmin(request, "TOKEN_MANAGE"))) {
    return badRequest(request, "Action non autorisee pour ce role.", 403);
  }
  const { data, error } = await supabase
    .from("collection_access_tokens")
    .select(
      "id,label,token_prefix,expires_at,max_uses,use_count,last_used_at,revoked_at,created_at",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return json(request, { tokens: data ?? [] });
}

async function handleAdminCreateAccessToken(request: Request) {
  if (!(await isAdmin(request, "TOKEN_MANAGE"))) {
    return badRequest(request, "Action non autorisee pour ce role.", 403);
  }
  const body = await request.json().catch(() => ({}));
  const label = safeString(body.label, 120);
  const durationHours = Math.max(
    1,
    Math.min(Number(body.durationHours || 24), 8760),
  );
  const requestedMaxUses = body.maxUses === null || body.maxUses === ""
    ? null
    : Number(body.maxUses);
  const maxUses = requestedMaxUses === null
    ? null
    : Math.max(1, Math.min(requestedMaxUses, 10000));
  if (!label) return badRequest(request, "Libellé requis.");
  if (!Number.isFinite(durationHours)) {
    return badRequest(request, "Durée invalide.");
  }
  if (requestedMaxUses !== null && !Number.isFinite(requestedMaxUses)) {
    return badRequest(request, "Nombre d'utilisations invalide.");
  }

  const rawToken = `sfit_${crypto.randomUUID().replaceAll("-", "")}${
    crypto.randomUUID().replaceAll("-", "")
  }`;
  const tokenHash = await sha256(rawToken);
  const expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000)
    .toISOString();
  const { data, error } = await supabase
    .from("collection_access_tokens")
    .insert({
      label,
      token_hash: tokenHash,
      token_prefix: rawToken.slice(0, 13),
      expires_at: expiresAt,
      max_uses: maxUses,
    })
    .select("id,label,token_prefix,expires_at,max_uses,use_count,created_at")
    .single();
  if (error) throw error;
  await audit(
    "collection_access_token_created",
    "collection_access_token",
    data.id,
    {
      label,
      expires_at: expiresAt,
      max_uses: maxUses,
    },
  );
  return json(request, { token: rawToken, record: data }, 201);
}

function invitePublicUrl(request: Request, inviteCode: string) {
  const origin = request.headers.get("origin") ||
    "https://badr-spacefoot.github.io";
  try {
    const url = new URL(origin);
    url.pathname = url.hostname.includes("github.io")
      ? "/pc_inventory_2.0/"
      : "/";
    url.searchParams.set("invite", inviteCode);
    return url.toString();
  } catch {
    return `https://badr-spacefoot.github.io/pc_inventory_2.0/?invite=${
      encodeURIComponent(inviteCode)
    }`;
  }
}

async function handleAdminListCollectionInvites(request: Request) {
  if (!(await isAdmin(request, "TOKEN_MANAGE"))) {
    return badRequest(request, "Action non autorisee pour ce role.", 403);
  }
  const { data, error } = await supabase
    .from("collection_invites")
    .select(
      "id,label,invite_code,payload,expires_at,max_uses,use_count,last_used_at,revoked_at,created_at",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return json(request, {
    invites: (data ?? []).map((invite) => ({
      ...invite,
      invite_url: invitePublicUrl(request, safeString(invite.invite_code)),
    })),
  });
}

async function handleAdminCreateCollectionInvite(request: Request) {
  const auth = await requireAction(request, "TOKEN_MANAGE");
  if (auth.response) return auth.response;
  const body = await request.json().catch(() => ({}));
  const label = safeString(body.label, 120);
  const durationHours = Math.max(
    1,
    Math.min(Number(body.durationHours || 168), 8760),
  );
  const requestedMaxUses = body.maxUses === null || body.maxUses === ""
    ? null
    : Number(body.maxUses);
  const maxUses = requestedMaxUses === null
    ? null
    : Math.max(1, Math.min(requestedMaxUses, 10000));
  if (!label) return badRequest(request, "Libellé requis.");
  if (!Number.isFinite(durationHours)) {
    return badRequest(request, "Durée invalide.");
  }
  if (requestedMaxUses !== null && !Number.isFinite(requestedMaxUses)) {
    return badRequest(request, "Nombre d'utilisations invalide.");
  }
  const payload = prefillPayload(body);
  if (payload.email) {
    const emailError = emailValidationError(payload.email);
    if (emailError) return badRequest(request, emailError);
  }
  const inviteCode = `inv_${
    base64Url(crypto.getRandomValues(new Uint8Array(15)))
  }`;
  const expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000)
    .toISOString();
  const { data, error } = await supabase
    .from("collection_invites")
    .insert({
      label,
      invite_code: inviteCode,
      payload,
      expires_at: expiresAt,
      max_uses: maxUses,
      created_by: auth.session?.username || null,
    })
    .select(
      "id,label,invite_code,payload,expires_at,max_uses,use_count,last_used_at,revoked_at,created_at",
    )
    .single();
  if (error) throw error;
  await audit("collection_invite_created", "collection_invite", data.id, {
    label,
    expires_at: expiresAt,
    max_uses: maxUses,
    actor: auth.session?.username,
  });
  const inviteUrl = invitePublicUrl(request, inviteCode);
  return json(request, {
    invite: {
      ...data,
      inviteCode,
      inviteUrl,
      invite_url: inviteUrl,
    },
  }, 201);
}

async function handleAdminRevokeCollectionInvite(request: Request, id: string) {
  if (!(await isAdmin(request, "TOKEN_MANAGE"))) {
    return badRequest(request, "Action non autorisee pour ce role.", 403);
  }
  const { data, error } = await supabase
    .from("collection_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .select("id,label,revoked_at")
    .single();
  if (error) throw error;
  await audit("collection_invite_revoked", "collection_invite", id, {
    label: data.label,
  });
  await notify(
    "TOKEN_REVOKED",
    "Invitation revoquee",
    `L'invitation ${data.label} a ete revoquee.`,
    {
      severity: "WARNING",
      targetRole: "ADMIN",
      relatedEntityType: "collection_invite",
      relatedEntityId: id,
    },
  );
  return json(request, { invite: data });
}

async function handleAdminDeleteCollectionInvite(request: Request, id: string) {
  if (!(await isAdmin(request, "TOKEN_MANAGE"))) {
    return badRequest(request, "Action non autorisee pour ce role.", 403);
  }
  const { data: invite, error: findError } = await supabase
    .from("collection_invites")
    .select("id,label")
    .eq("id", id)
    .maybeSingle();
  if (findError) throw findError;
  if (!invite) return badRequest(request, "Invitation introuvable.", 404);
  const { error } = await supabase.from("collection_invites").delete().eq(
    "id",
    id,
  );
  if (error) throw error;
  await audit("collection_invite_deleted", "collection_invite", id, {
    label: invite.label,
  });
  await notify(
    "TOKEN_DELETED",
    "Invitation supprimee",
    `L'invitation ${invite.label} a ete supprimee.`,
    {
      severity: "WARNING",
      targetRole: "ADMIN",
      relatedEntityType: "collection_invite",
      relatedEntityId: id,
    },
  );
  return json(request, { deleted: true });
}

async function handleAdminRevokeAccessToken(request: Request, id: string) {
  if (!(await isAdmin(request, "TOKEN_MANAGE"))) {
    return badRequest(request, "Action non autorisee pour ce role.", 403);
  }
  const { data, error } = await supabase
    .from("collection_access_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .select("id,label,revoked_at")
    .single();
  if (error) throw error;
  await audit(
    "collection_access_token_revoked",
    "collection_access_token",
    id,
    { label: data.label },
  );
  await notify(
    "TOKEN_REVOKED",
    "Token revoque",
    `Le token ${data.label} a ete revoque.`,
    {
      severity: "WARNING",
      targetRole: "ADMIN",
      relatedEntityType: "collection_access_token",
      relatedEntityId: id,
    },
  );
  return json(request, { token: data });
}

async function handleAdminDeleteAccessToken(request: Request, id: string) {
  if (!(await isAdmin(request, "TOKEN_MANAGE"))) {
    return badRequest(request, "Action non autorisee pour ce role.", 403);
  }
  const { data: token, error: findError } = await supabase
    .from("collection_access_tokens")
    .select("id,label")
    .eq("id", id)
    .maybeSingle();
  if (findError) throw findError;
  if (!token) return badRequest(request, "Token introuvable.", 404);
  const { error } = await supabase.from("collection_access_tokens").delete().eq(
    "id",
    id,
  );
  if (error) throw error;
  await audit(
    "collection_access_token_deleted",
    "collection_access_token",
    id,
    { label: token.label },
  );
  await notify(
    "TOKEN_DELETED",
    "Token supprime",
    `Le token ${token.label} a ete supprime.`,
    {
      severity: "WARNING",
      targetRole: "ADMIN",
      relatedEntityType: "collection_access_token",
      relatedEntityId: id,
    },
  );
  return json(request, { deleted: true });
}

async function handleAdminDevices(request: Request) {
  if (!(await isAdmin(request, "DEVICE_VIEW"))) {
    return badRequest(request, "Action non autorisee pour ce role.", 403);
  }
  const { data, error } = await supabase.from("device_inventory_view").select(
    "*",
  ).order("last_seen_at", { ascending: false });
  if (error) throw error;
  return json(request, { devices: data });
}

function normalizeMacKey(value: unknown) {
  return safeString(value, 80).toLowerCase().replace(/[^a-f0-9]/g, "");
}

function normalizeHostname(value: unknown) {
  return safeString(value, 255).toUpperCase();
}

function legacyHistoryEventType(action: string) {
  const normalized = safeString(action, 40).toUpperCase();
  if (normalized === "CREATION") return "DEVICE_CREATED";
  if (
    normalized === "MISE_A_JOUR" || normalized === "MISE À JOUR" ||
    normalized === "MISE_À_JOUR"
  ) return "IMPORT_UPDATE";
  return "IMPORT_UPDATE";
}

async function handleAdminImportLegacyHistory(request: Request) {
  const auth = await requireAction(request, "VIEW_HISTORY");
  if (auth.response) return auth.response;
  const body = await request.json().catch(() => ({}));
  const rows = Array.isArray(body.rows) ? body.rows as Json[] : [];
  if (rows.length === 0) {
    return badRequest(request, "Aucune ligne historique à importer.");
  }
  if (rows.length > 1000) {
    return badRequest(request, "Import limité à 1000 lignes par appel.");
  }

  const { data: devices, error: devicesError } = await supabase
    .from("devices")
    .select("id,hostname,mac_address");
  if (devicesError) throw devicesError;

  const byMac = new Map<string, Json>();
  const byHostname = new Map<string, Json>();
  for (const device of devices ?? []) {
    const mac = normalizeMacKey(device.mac_address);
    const hostname = normalizeHostname(device.hostname);
    if (mac) byMac.set(mac, device);
    if (hostname) byHostname.set(hostname, device);
  }

  const historyRows: Json[] = [];
  const unmatched: Json[] = [];
  const skippedDuplicates: Json[] = [];

  for (const row of rows) {
    const mac = normalizeMacKey(row.mac);
    const hostname = normalizeHostname(row.hostname);
    const device = (mac ? byMac.get(mac) : null) ||
      (hostname ? byHostname.get(hostname) : null);
    if (!device) {
      unmatched.push({
        hostname,
        mac: safeString(row.mac),
        timestamp: safeString(row.timestamp),
        action: safeString(row.action),
      });
      continue;
    }
    const deviceId = safeString(device.id);
    if (!deviceId) {
      unmatched.push({
        hostname,
        mac: safeString(row.mac),
        timestamp: safeString(row.timestamp),
        action: safeString(row.action),
      });
      continue;
    }
    const changedAt = safeString(row.timestamp) || new Date().toISOString();
    const { data: existing, error: existingError } = await supabase
      .from("device_history")
      .select("id")
      .eq("device_id", deviceId)
      .eq("source", "IMPORT")
      .eq("field_name", "legacy_google_sheets_history")
      .eq("changed_at", changedAt)
      .limit(1)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      skippedDuplicates.push({
        hostname,
        mac: safeString(row.mac),
        timestamp: changedAt,
      });
      continue;
    }

    const previous = {
      firstName: safeString(row.previousFirstName, 120),
      lastName: safeString(row.previousLastName, 120),
      team: safeString(row.previousTeam, 120),
      establishment: safeString(row.previousEstablishment, 180),
    };
    const current = {
      firstName: safeString(row.firstName, 120),
      lastName: safeString(row.lastName, 120),
      team: safeString(row.team, 120),
      establishment: safeString(row.establishment, 180),
      osUser: safeString(row.osUser, 120),
      osType: safeString(row.osType, 80),
      hostname,
      mac: safeString(row.mac, 80),
    };

    historyRows.push({
      device_id: deviceId,
      event_type: legacyHistoryEventType(safeString(row.action)),
      field_name: "legacy_google_sheets_history",
      old_value: historyValue(previous),
      new_value: historyValue(current),
      changed_by: auth.session?.username || "admin",
      source: "IMPORT",
      notes: `Import historique Google Sheets: ${
        safeString(row.action) || "historique"
      }`,
      changed_at: changedAt,
    });
  }

  await appendDeviceHistory(historyRows);
  await audit("legacy_history_imported", "device_history", null, {
    imported: historyRows.length,
    unmatched: unmatched.length,
    skippedDuplicates: skippedDuplicates.length,
  });
  return json(request, {
    imported: historyRows.length,
    unmatched,
    skippedDuplicates: skippedDuplicates.length,
  });
}

async function handlePublicOrganization(request: Request) {
  const [
    { data: teams, error: teamsError },
    { data: establishments, error: establishmentsError },
  ] = await Promise.all([
    supabase
      .from("teams")
      .select("id,name,abbreviation,description,color,sort_index")
      .eq("active", true)
      .order("sort_index", { nullsFirst: false })
      .order("name"),
    supabase
      .from("establishments")
      .select(
        "id,name,abbreviation,establishment_type,discipline,color,city,country,sort_index",
      )
      .eq("active", true)
      .order("sort_index", { nullsFirst: false })
      .order("name"),
  ]);
  if (teamsError) throw teamsError;
  if (establishmentsError) throw establishmentsError;
  return json(request, {
    teams: teams ?? [],
    establishments: establishments ?? [],
  });
}

async function handleAdminOrganization(request: Request) {
  if (!(await isAdmin(request, "VIEW_DASHBOARD"))) {
    return badRequest(request, "Action non autorisee pour ce role.", 403);
  }
  const [
    { data: teams, error: teamsError },
    { data: establishments, error: establishmentsError },
    { data: devices, error: devicesError },
    { data: users, error: usersError },
  ] = await Promise.all([
    supabase.from("teams").select(
      "id,name,abbreviation,description,color,active,sort_index,created_at",
    ).order("sort_index", { nullsFirst: false }).order("name"),
    supabase
      .from("establishments")
      .select(
        "id,name,abbreviation,establishment_type,discipline,color,address,postal_code,city,country,latitude,longitude,active,sort_index,created_at",
      )
      .order("sort_index", { nullsFirst: false })
      .order("name"),
    supabase.from("device_inventory_view").select(
      "first_name,last_name,email,team_name,establishment_name,status",
    ),
    supabase.from("users").select(
      "id,first_name,last_name,email,service,team_id,establishment_id",
    ).order("last_name"),
  ]);
  if (teamsError) throw teamsError;
  if (establishmentsError) throw establishmentsError;
  if (devicesError) throw devicesError;
  if (usersError) throw usersError;

  type OrganizationCounter = {
    total: number;
    assigned: number;
    stock: number;
    unassigned: number;
    userIds: Set<string>;
  };
  const teamCounts = new Map<string, OrganizationCounter>();
  const establishmentCounts = new Map<string, OrganizationCounter>();
  const teamIdsByName = new Map(
    (teams ?? []).map((
      team,
    ) => [safeString(team.name).toLowerCase(), safeString(team.id)]),
  );
  const establishmentIdsByName = new Map(
    (establishments ?? []).map((
      site,
    ) => [safeString(site.name).toLowerCase(), safeString(site.id)]),
  );
  const incrementOrganizationCount = (
    counts: Map<string, OrganizationCounter>,
    id: string | null,
    status: string,
    assignedUserId: string,
  ) => {
    if (!id) return;
    const current = counts.get(id) ?? {
      total: 0,
      assigned: 0,
      stock: 0,
      unassigned: 0,
      userIds: new Set<string>(),
    };
    current.total += 1;
    if (status === "stock") {
      current.stock += 1;
    } else if (assignedUserId) {
      current.assigned += 1;
      current.userIds.add(assignedUserId);
    } else {
      current.unassigned += 1;
    }
    counts.set(id, current);
  };
  for (const device of devices ?? []) {
    const status = safeString(device.status);
    if (["retired", "lost"].includes(status)) continue;
    const resolvedUserKey = (safeString(device.email)
      ? `email:${safeString(device.email).toLowerCase()}`
      : "") ||
      ([safeString(device.first_name), safeString(device.last_name)].filter(
          Boolean,
        ).join(" ")
        ? `name:${
          [safeString(device.first_name), safeString(device.last_name)]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
        }`
        : "");
    const teamId = teamIdsByName.get(
      safeString(device.team_name).toLowerCase(),
    ) || "";
    const establishmentId = establishmentIdsByName.get(
      safeString(device.establishment_name).toLowerCase(),
    ) ||
      "";
    incrementOrganizationCount(
      teamCounts,
      teamId,
      status,
      resolvedUserKey,
    );
    incrementOrganizationCount(
      establishmentCounts,
      establishmentId,
      status,
      resolvedUserKey,
    );
  }

  return json(request, {
    teams: (teams ?? []).map((team) => ({
      ...team,
      device_count: teamCounts.get(team.id)?.total ?? 0,
      assigned_device_count: teamCounts.get(team.id)?.assigned ?? 0,
      stock_device_count: teamCounts.get(team.id)?.stock ?? 0,
      unassigned_device_count: teamCounts.get(team.id)?.unassigned ?? 0,
      user_count: teamCounts.get(team.id)?.userIds.size ?? 0,
      active_user_count: teamCounts.get(team.id)?.userIds.size ?? 0,
    })),
    establishments: (establishments ?? []).map((site) => ({
      ...site,
      device_count: establishmentCounts.get(site.id)?.total ?? 0,
      assigned_device_count: establishmentCounts.get(site.id)?.assigned ?? 0,
      stock_device_count: establishmentCounts.get(site.id)?.stock ?? 0,
      unassigned_device_count: establishmentCounts.get(site.id)?.unassigned ??
        0,
      user_count: establishmentCounts.get(site.id)?.userIds.size ?? 0,
      active_user_count: establishmentCounts.get(site.id)?.userIds.size ?? 0,
    })),
    users: users ?? [],
    map_provider: googleMapsApiKey ? "google" : "openstreetmap",
  });
}

async function handleAdminPendingChanges(request: Request) {
  if (!(await isAdmin(request, "PENDING_CHANGE_APPROVE"))) {
    return badRequest(request, "Action non autorisee pour ce role.", 403);
  }
  const status = safeString(new URL(request.url).searchParams.get("status"), 40)
    .toUpperCase() || "PENDING";
  let query = supabase
    .from("pending_changes")
    .select(
      "id,type,proposed_value,proposed_by_user,proposed_by_email,related_device_id,status,admin_decision_by,admin_decision_at,admin_notes,linked_entity_id,created_at",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (status !== "ALL") query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw error;
  return json(request, { pendingChanges: data ?? [] });
}

async function handleAdminDecidePendingChange(request: Request, id: string) {
  const auth = await requireAction(request, "PENDING_CHANGE_APPROVE");
  if (auth.response) return auth.response;
  const body = await request.json().catch(() => ({}));
  const decision = safeString(body.decision, 40).toUpperCase();
  const proposedValue = safeString(body.proposedValue, 180);
  const linkedEntityId = safeString(body.linkedEntityId) || null;
  const adminNotes = safeString(body.adminNotes, 1000) || null;
  if (!["APPROVE", "REJECT", "MODIFY"].includes(decision)) {
    return badRequest(request, "Decision invalide.");
  }

  const { data: pending, error: pendingError } = await supabase
    .from("pending_changes")
    .select("id,type,proposed_value,status")
    .eq("id", id)
    .maybeSingle();
  if (pendingError) throw pendingError;
  if (!pending) return badRequest(request, "Proposition introuvable.", 404);
  if (pending.status !== "PENDING") {
    return badRequest(request, "Cette proposition a deja ete traitee.", 409);
  }

  let newStatus = "REJECTED";
  let entityId = linkedEntityId;
  const type = safeString(pending.type);
  const finalValue = proposedValue || safeString(pending.proposed_value, 180);
  if (decision === "APPROVE" || decision === "MODIFY") {
    if (!entityId) {
      if (!finalValue) {
        return badRequest(request, "Valeur a approuver requise.");
      }
      if (type === "TEAM") {
        entityId = await getOrCreateByName("teams", finalValue);
      } else if (type === "ESTABLISHMENT" || type === "LOCATION") {
        entityId = await getOrCreateByName("establishments", finalValue);
      } else {
        return badRequest(request, "Type de proposition non pris en charge.");
      }
    }
    newStatus = decision === "MODIFY" ? "MODIFIED" : "APPROVED";
  }

  const { data, error } = await supabase
    .from("pending_changes")
    .update({
      proposed_value: finalValue,
      status: newStatus,
      admin_decision_by: auth.session?.legacy ? null : auth.session?.id,
      admin_decision_at: new Date().toISOString(),
      admin_notes: adminNotes,
      linked_entity_id: entityId,
    })
    .eq("id", id)
    .select("id,type,proposed_value,status,linked_entity_id,admin_decision_at")
    .single();
  if (error) throw error;
  await audit("pending_change_decided", "pending_change", id, {
    decision,
    status: newStatus,
    linked_entity_id: entityId,
    proposed_value: finalValue,
  });
  await notify(
    "ADMIN_ACTION_COMPLETED",
    "Proposition traitee",
    `La proposition "${finalValue}" est maintenant ${newStatus}.`,
    {
      severity: newStatus === "REJECTED" ? "WARNING" : "SUCCESS",
      targetRole: "ADMIN",
      relatedEntityType: "pending_change",
      relatedEntityId: id,
    },
  );
  return json(request, { pendingChange: data });
}

async function handleAdminReorderOrganization(request: Request) {
  if (
    !(await isAdmin(request, "TEAM_MANAGE")) &&
    !(await isAdmin(request, "LOCATION_MANAGE"))
  ) return badRequest(request, "Action non autorisee pour ce role.", 403);
  const body = await request.json().catch(() => ({}));
  const entityType = safeString(body.entityType);
  const ids = Array.isArray(body.ids)
    ? body.ids.map((id: unknown) => safeString(id)).filter(Boolean).slice(
      0,
      500,
    )
    : [];
  if (
    !["team", "establishment"].includes(entityType) || ids.length === 0 ||
    new Set(ids).size !== ids.length
  ) {
    return badRequest(request, "Ordre invalide.");
  }
  const table = entityType === "team" ? "teams" : "establishments";
  const updates = ids.map((id: string, sortIndex: number) =>
    supabase.from(table).update({ sort_index: sortIndex }).eq("id", id).select(
      "id",
    ).maybeSingle()
  );
  const results = await Promise.all(updates);
  const failure = results.find((result) => result.error || !result.data);
  if (failure?.error) throw failure.error;
  if (failure) {
    return badRequest(request, "Un element a reordonner est introuvable.", 404);
  }
  await audit(`${entityType}_order_updated`, entityType, null, { ids });
  return json(request, { ok: true });
}

async function handleAdminSaveTeam(request: Request, id?: string) {
  if (!(await isAdmin(request, "TEAM_MANAGE"))) {
    return badRequest(request, "Action non autorisee pour ce role.", 403);
  }
  const body = await request.json().catch(() => ({}));
  const name = safeString(body.name, 120);
  const abbreviation = safeString(body.abbreviation, 24).toUpperCase() || null;
  const color = safeString(body.color, 7) ||
    await nextOrganizationColor("teams");
  if (!name) return badRequest(request, "Nom de l'équipe requis.");
  if (!/^#[0-9a-f]{6}$/i.test(color)) {
    return badRequest(request, "Couleur invalide.");
  }
  const values = {
    name,
    abbreviation,
    description: safeString(body.description, 500) || null,
    color,
    active: body.active !== false,
  };
  const duplicateAbbreviation = abbreviation
    ? await supabase.from("teams").select("id,name").ilike(
      "abbreviation",
      abbreviation,
    ).neq("id", id || "00000000-0000-0000-0000-000000000000").maybeSingle()
    : { data: null };
  const query = id
    ? supabase.from("teams").update(values).eq("id", id)
    : supabase.from("teams").insert(values);
  const { data, error } = await query.select(
    "id,name,abbreviation,description,color,active,created_at",
  ).single();
  if (error) {
    if (error.code === "23505") {
      return badRequest(request, "Une équipe porte déjà ce nom.", 409);
    }
    throw error;
  }
  await audit(id ? "team_updated" : "team_created", "team", data.id, values);
  return json(request, {
    team: data,
    duplicateAbbreviation: duplicateAbbreviation.data ?? null,
  }, id ? 200 : 201);
}

async function handleAdminDeleteTeam(request: Request, id: string) {
  if (!(await isAdmin(request, "TEAM_MANAGE"))) {
    return badRequest(request, "Action non autorisee pour ce role.", 403);
  }
  const [
    { count: deviceCount, error: deviceError },
    { count: userCount, error: userError },
  ] = await Promise.all([
    supabase.from("devices").select("id", { count: "exact", head: true }).eq(
      "team_id",
      id,
    ),
    supabase.from("users").select("id", { count: "exact", head: true }).eq(
      "team_id",
      id,
    ),
  ]);
  if (deviceError) throw deviceError;
  if (userError) throw userError;
  if ((deviceCount ?? 0) > 0 || (userCount ?? 0) > 0) {
    await notify(
      "LOCATION_TEAM_DELETE_BLOCKED",
      "Suppression equipe bloquee",
      `Une equipe liee a ${deviceCount ?? 0} machine(s) et ${
        userCount ?? 0
      } utilisateur(s) ne peut pas etre supprimee.`,
      {
        severity: "WARNING",
        targetRole: "ADMIN",
        relatedEntityType: "team",
        relatedEntityId: id,
      },
    );
    return json(request, {
      error: `Cette equipe ne peut pas etre supprimee: ${
        deviceCount ?? 0
      } machine(s) et ${userCount ?? 0} utilisateur(s) y sont lies.`,
      code: "ENTITY_IN_USE",
      entityType: "team",
      references: {
        devices: deviceCount ?? 0,
        users: userCount ?? 0,
        teams: 0,
      },
    }, 409);
  }
  const { data, error } = await supabase.from("teams").delete().eq("id", id)
    .select("id,name").maybeSingle();
  if (error) throw error;
  if (!data) return badRequest(request, "Équipe introuvable.", 404);
  await audit("team_deleted", "team", id, { name: data.name });
  return json(request, { deleted: true });
}

async function handleAdminSaveEstablishment(request: Request, id?: string) {
  if (!(await isAdmin(request, "LOCATION_MANAGE"))) {
    return badRequest(request, "Action non autorisee pour ce role.", 403);
  }
  const body = await request.json().catch(() => ({}));
  const name = safeString(body.name, 120);
  const abbreviation = safeString(body.abbreviation, 24).toUpperCase() || null;
  const establishmentType = safeString(body.establishmentType, 40) || "office";
  const discipline = safeString(body.discipline, 40) || "general";
  const color = safeString(body.color, 7) ||
    await nextOrganizationColor("establishments");
  const allowedTypes = [
    "warehouse",
    "store",
    "headquarters",
    "research",
    "accounting",
    "office",
    "remote",
    "other",
  ];
  const allowedDisciplines = [
    "general",
    "bike",
    "racket",
    "football",
    "golf",
    "lifestyle",
    "running",
    "office",
    "warehouse",
    "headquarters",
    "remote",
    "other",
  ];
  const latitude = body.latitude === "" || body.latitude === null ||
      body.latitude === undefined
    ? null
    : safeNumber(body.latitude);
  const longitude = body.longitude === "" || body.longitude === null ||
      body.longitude === undefined
    ? null
    : safeNumber(body.longitude);
  if (!name) return badRequest(request, "Nom de l'établissement requis.");
  if (!allowedTypes.includes(establishmentType)) {
    return badRequest(request, "Type d'établissement invalide.");
  }
  if (!allowedDisciplines.includes(discipline)) {
    return badRequest(request, "Discipline invalide.");
  }
  if (!/^#[0-9a-f]{6}$/i.test(color)) {
    return badRequest(request, "Couleur invalide.");
  }
  if (latitude !== null && (latitude < -90 || latitude > 90)) {
    return badRequest(request, "Latitude invalide.");
  }
  if (longitude !== null && (longitude < -180 || longitude > 180)) {
    return badRequest(request, "Longitude invalide.");
  }
  const values = {
    name,
    abbreviation,
    establishment_type: establishmentType,
    discipline,
    color,
    address: safeString(body.address, 240) || null,
    postal_code: safeString(body.postalCode, 20) || null,
    city: safeString(body.city, 120) || null,
    country: safeString(body.country, 120) || "France",
    latitude,
    longitude,
    active: body.active !== false,
  };
  const query = id
    ? supabase.from("establishments").update(values).eq("id", id)
    : supabase.from("establishments").insert(values);
  const duplicateAbbreviation = abbreviation
    ? await supabase.from("establishments").select("id,name").ilike(
      "abbreviation",
      abbreviation,
    ).neq("id", id || "00000000-0000-0000-0000-000000000000").maybeSingle()
    : { data: null };
  const { data, error } = await query
    .select(
      "id,name,abbreviation,establishment_type,discipline,color,address,postal_code,city,country,latitude,longitude,active,created_at",
    )
    .single();
  if (error) {
    if (error.code === "23505") {
      return badRequest(request, "Un établissement porte déjà ce nom.", 409);
    }
    throw error;
  }
  await audit(
    id ? "establishment_updated" : "establishment_created",
    "establishment",
    data.id,
    values,
  );
  return json(request, {
    establishment: data,
    duplicateAbbreviation: duplicateAbbreviation.data ?? null,
  }, id ? 200 : 201);
}

async function handleAdminDeleteEstablishment(request: Request, id: string) {
  if (!(await isAdmin(request, "LOCATION_MANAGE"))) {
    return badRequest(request, "Action non autorisee pour ce role.", 403);
  }
  const [
    { count: deviceCount, error: deviceError },
    { count: userCount, error: userError },
  ] = await Promise.all([
    supabase.from("devices").select("id", { count: "exact", head: true }).eq(
      "establishment_id",
      id,
    ),
    supabase.from("users").select("id", { count: "exact", head: true }).eq(
      "establishment_id",
      id,
    ),
  ]);
  if (deviceError) throw deviceError;
  if (userError) throw userError;
  if ((deviceCount ?? 0) > 0 || (userCount ?? 0) > 0) {
    await notify(
      "LOCATION_TEAM_DELETE_BLOCKED",
      "Suppression etablissement bloquee",
      `Un etablissement lie a ${deviceCount ?? 0} machine(s) et ${
        userCount ?? 0
      } utilisateur(s) ne peut pas etre supprime.`,
      {
        severity: "WARNING",
        targetRole: "ADMIN",
        relatedEntityType: "establishment",
        relatedEntityId: id,
      },
    );
    return json(request, {
      error: `Cet etablissement ne peut pas etre supprime: ${
        deviceCount ?? 0
      } machine(s) et ${userCount ?? 0} utilisateur(s) y sont lies.`,
      code: "ENTITY_IN_USE",
      entityType: "establishment",
      references: {
        devices: deviceCount ?? 0,
        users: userCount ?? 0,
        teams: 0,
      },
    }, 409);
  }
  const { data, error } = await supabase.from("establishments").delete().eq(
    "id",
    id,
  ).select("id,name").maybeSingle();
  if (error) throw error;
  if (!data) return badRequest(request, "Établissement introuvable.", 404);
  await audit("establishment_deleted", "establishment", id, {
    name: data.name,
  });
  return json(request, { deleted: true });
}

function googleAddressComponent(
  components: Json[],
  type: string,
  short = false,
) {
  const component = components.find((item) =>
    Array.isArray(item.types) && item.types.includes(type)
  );
  return safeString(short ? component?.shortText : component?.longText);
}

async function handleAdminAddressAutocomplete(request: Request) {
  if (!(await isAdmin(request, "LOCATION_MANAGE"))) {
    return badRequest(request, "Action non autorisee pour ce role.", 403);
  }
  if (!googleMapsApiKey) {
    return badRequest(request, "Google Places n'est pas configure.", 503);
  }
  const url = new URL(request.url);
  const input = safeString(url.searchParams.get("q"), 220);
  const countryCode = safeString(url.searchParams.get("country"), 2)
    .toLowerCase();
  const languageCode = safeString(url.searchParams.get("language"), 5) || "fr";
  if (input.length < 3) return json(request, { suggestions: [] });

  const payload: Json = {
    input,
    languageCode,
    includeQueryPredictions: false,
  };
  if (/^[a-z]{2}$/.test(countryCode)) {
    payload.includedRegionCodes = [countryCode];
  }

  const response = await fetch(
    "https://places.googleapis.com/v1/places:autocomplete",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": googleMapsApiKey,
        "X-Goog-FieldMask":
          "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text",
      },
      body: JSON.stringify(payload),
    },
  );
  if (!response.ok) {
    console.error(
      "Google autocomplete error",
      response.status,
      await response.text(),
    );
    return badRequest(request, "Recherche d'adresse indisponible.", 502);
  }
  const data = await response.json();
  const suggestions = (Array.isArray(data.suggestions) ? data.suggestions : [])
    .map((item: Json) => {
      const prediction = item.placePrediction as Json | undefined;
      const text = prediction?.text as Json | undefined;
      return {
        placeId: safeString(prediction?.placeId),
        label: safeString(text?.text),
      };
    })
    .filter((item: Json) => item.placeId && item.label);
  return json(request, { suggestions });
}

async function handleAdminAddressDetails(request: Request) {
  if (!(await isAdmin(request, "LOCATION_MANAGE"))) {
    return badRequest(request, "Action non autorisee pour ce role.", 403);
  }
  if (!googleMapsApiKey) {
    return badRequest(request, "Google Places n'est pas configure.", 503);
  }
  const url = new URL(request.url);
  const placeId = safeString(url.searchParams.get("placeId"), 300);
  const languageCode = safeString(url.searchParams.get("language"), 5) || "fr";
  if (!placeId) return badRequest(request, "Place ID requis.");

  const response = await fetch(
    `https://places.googleapis.com/v1/places/${
      encodeURIComponent(placeId)
    }?languageCode=${encodeURIComponent(languageCode)}`,
    {
      headers: {
        "X-Goog-Api-Key": googleMapsApiKey,
        "X-Goog-FieldMask": "formattedAddress,addressComponents,location",
      },
    },
  );
  if (!response.ok) {
    console.error(
      "Google place details error",
      response.status,
      await response.text(),
    );
    return badRequest(request, "Details de l'adresse indisponibles.", 502);
  }
  const data = await response.json();
  const components = Array.isArray(data.addressComponents)
    ? data.addressComponents
    : [];
  const location = (data.location ?? {}) as Json;
  const streetNumber = googleAddressComponent(components, "street_number");
  const route = googleAddressComponent(components, "route");
  const city = googleAddressComponent(components, "locality") ||
    googleAddressComponent(components, "postal_town") ||
    googleAddressComponent(components, "administrative_area_level_2");
  return json(request, {
    address: [streetNumber, route].filter(Boolean).join(" ") ||
      safeString(data.formattedAddress),
    postalCode: googleAddressComponent(components, "postal_code"),
    city,
    country: googleAddressComponent(components, "country"),
    countryCode: googleAddressComponent(components, "country", true)
      .toLowerCase(),
    latitude: safeNumber(location.latitude),
    longitude: safeNumber(location.longitude),
    formattedAddress: safeString(data.formattedAddress),
  });
}

async function handleAdminDeviceDetail(request: Request, id: string) {
  if (!(await isAdmin(request, "DEVICE_VIEW"))) {
    return badRequest(request, "Action non autorisee pour ce role.", 403);
  }
  const [
    { data: device, error: deviceError },
    { data: assignment, error: assignmentError },
  ] = await Promise.all([
    supabase.from("device_inventory_view").select("*").eq("id", id).single(),
    supabase.from("devices").select("assigned_user_id,team_id,establishment_id")
      .eq("id", id).single(),
  ]);
  if (deviceError) throw deviceError;
  if (assignmentError) throw assignmentError;
  const { data: scans, error: scansError } = await supabase
    .from("device_scans")
    .select("id,collected_at,os_name,os_version,script_version,payload")
    .eq("device_id", id)
    .order("collected_at", { ascending: false })
    .limit(20);
  if (scansError) throw scansError;
  const { data: priceHistory, error: priceHistoryError } = await supabase
    .from("market_price_history")
    .select(
      "source,search_query,price,currency,condition,listing_url,collected_at",
    )
    .eq("device_id", id)
    .order("collected_at", { ascending: false })
    .limit(20);
  if (priceHistoryError) throw priceHistoryError;

  const { data: invoices, error: invoicesError } = await supabase
    .from("device_invoices")
    .select(
      "id,invoice_type,invoice_number,supplier,invoice_date,purchase_price,currency,warranty_start_date,warranty_end_date,warranty_provider,warranty_duration_months,file_name,file_url,file_path,file_mime_type,file_size_bytes,notes,created_by,created_at,updated_at",
    )
    .eq("device_id", id)
    .order("invoice_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(50);

  if (invoicesError) throw invoicesError;
  const signedInvoices = await signInvoiceRows(invoices ?? []);
  const { data: history, error: historyError } = await supabase
    .from("device_history")
    .select(
      "id,event_type,field_name,old_value,new_value,changed_by,source,notes,changed_at,related_user_id,related_team_id,related_establishment_id",
    )
    .eq("device_id", id)
    .order("changed_at", { ascending: false })
    .limit(200);
  if (historyError) throw historyError;
  const { data: assignmentPeriods, error: periodsError } = await supabase
    .from("device_assignment_periods")
    .select(
      "id,user_id,user_name,user_email,team_id,team_name,establishment_id,establishment_name,started_at,ended_at,assigned_by,unassigned_by,source,reason",
    )
    .eq("device_id", id)
    .order("started_at", { ascending: false })
    .limit(100);
  if (periodsError) throw periodsError;
  return json(request, {
    device: {
      ...device,
      ...assignment,
      assignmentPeriods: assignmentPeriods ?? [],
      invoices: signedInvoices,
    },
    scans,
    priceHistory,
    invoices: signedInvoices,
    history: history ?? [],
  });
}

async function handleAdminDeleteDevice(request: Request, id: string) {
  const auth = await requireAction(request, "DEVICE_DELETE");

  if (auth.response) return auth.response;

  const { data: device, error: deviceError } = await supabase
    .from("devices")
    .select("id,hostname,serial_number,service_tag,manufacturer,model,status")
    .eq("id", id)
    .maybeSingle();

  if (deviceError) throw deviceError;

  if (!device) return badRequest(request, "Machine introuvable.", 404);

  const { error } = await supabase.from("devices").delete().eq("id", id);

  if (error) throw error;

  await audit("device_deleted", "device", id, {
    hostname: device.hostname,

    serial_number: device.serial_number,

    service_tag: device.service_tag,

    manufacturer: device.manufacturer,

    model: device.model,

    status: device.status,

    actor: auth.session?.username || "admin",
  });

  await notify(
    "ADMIN_ACTION_COMPLETED",
    "Machine supprimee",
    `${safeString(device.hostname) || "Une machine"} a ete supprimee du parc.`,
    {
      severity: "WARNING",

      targetRole: "ADMIN",

      relatedEntityType: "device",
    },
  );

  return json(request, { deleted: true, id });
}

async function recordExists(
  table: "teams" | "establishments" | "users" | "devices",
  id: string | null,
) {
  if (!id) return true;
  const { data, error } = await supabase.from(table).select("id").eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function handleAdminDeviceAssignment(request: Request, id: string) {
  const auth = await requireAction(request, "DEVICE_EDIT");
  if (auth.response) return auth.response;
  const body = await request.json().catch(() => ({}));
  const teamId = safeString(body.teamId) || null;
  const establishmentId = safeString(body.establishmentId) || null;
  let assignedUserId = safeString(body.assignedUserId) || null;
  const ownerFirstName = titleCase(safeString(body.ownerFirstName, 120));
  const ownerLastName = safeString(body.ownerLastName, 120).toUpperCase();
  const ownerEmail = safeString(body.ownerEmail, 255).toLowerCase();
  const ownerChanged = Boolean(ownerFirstName || ownerLastName || ownerEmail);
  if (ownerEmail) {
    const emailError = emailValidationError(ownerEmail);
    if (emailError) return badRequest(request, emailError);
  }
  const [teamValid, establishmentValid, userValid] = await Promise.all([
    recordExists("teams", teamId),
    recordExists("establishments", establishmentId),
    recordExists("users", assignedUserId),
  ]);
  if (!teamValid) {
    return badRequest(request, "?quipe s?lectionn?e introuvable.", 404);
  }
  if (!establishmentValid) {
    return badRequest(request, "?tablissement s?lectionn? introuvable.", 404);
  }
  if (!userValid) {
    return badRequest(request, "Utilisateur s?lectionn? introuvable.", 404);
  }

  const [
    { data: currentDevice, error: currentError },
    { data: currentAssignment, error: currentAssignmentError },
    { data: targetTeam },
    { data: targetSite },
  ] = await Promise.all([
    supabase.from("device_inventory_view").select(
      "hostname,team_name,establishment_name,first_name,last_name,email,service,comment",
    ).eq("id", id).single(),
    supabase.from("devices").select("assigned_user_id,team_id,establishment_id")
      .eq("id", id).single(),
    teamId
      ? supabase.from("teams").select("name").eq("id", teamId).maybeSingle()
      : Promise.resolve({ data: null }),
    establishmentId
      ? supabase.from("establishments").select("name").eq("id", establishmentId)
        .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (currentError) throw currentError;
  if (currentAssignmentError) throw currentAssignmentError;

  if (ownerChanged) {
    if (!ownerEmail && !assignedUserId) {
      return badRequest(
        request,
        "Email propriétaire requis pour créer ou modifier un propriétaire.",
      );
    }
    if (assignedUserId) {
      if (ownerEmail) {
        const { data: duplicateUser, error: duplicateError } = await supabase
          .from("users")
          .select("id")
          .eq("email", ownerEmail)
          .neq("id", assignedUserId)
          .maybeSingle();
        if (duplicateError) throw duplicateError;
        if (duplicateUser) {
          return badRequest(
            request,
            "Un autre utilisateur utilise d?j? cet email.",
            409,
          );
        }
      }
      const userValues: Json = {
        first_name: ownerFirstName || currentDevice.first_name || "Utilisateur",
        last_name: ownerLastName || currentDevice.last_name || "INCONNU",
        email: ownerEmail || currentDevice.email,
        team_id: teamId,
        establishment_id: establishmentId,
        service: safeString(currentDevice.service) || "Manual",
        updated_at: new Date().toISOString(),
      };
      const { error: updateUserError } = await supabase.from("users").update(
        userValues,
      ).eq("id", assignedUserId);
      if (updateUserError) throw updateUserError;
    } else if (ownerEmail) {
      const { data: ownerUser, error: ownerError } = await supabase
        .from("users")
        .upsert(
          {
            first_name: ownerFirstName || "Utilisateur",
            last_name: ownerLastName || "INCONNU",
            email: ownerEmail,
            team_id: teamId,
            establishment_id: establishmentId,
            service: safeString(currentDevice.service) || "Manual",
          },
          { onConflict: "email" },
        )
        .select("id")
        .single();
      if (ownerError) throw ownerError;
      assignedUserId = safeString(ownerUser.id);
    }
  }

  const { data: targetUser, error: targetUserError } = assignedUserId
    ? await supabase.from("users").select("first_name,last_name,email").eq(
      "id",
      assignedUserId,
    ).maybeSingle()
    : { data: null, error: null };
  if (targetUserError) throw targetUserError;

  const values = {
    team_id: teamId,
    establishment_id: establishmentId,
    assigned_user_id: assignedUserId,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from("devices").update(values).eq(
    "id",
    id,
  ).select("id").maybeSingle();
  if (error) throw error;
  if (!data) return badRequest(request, "Machine introuvable.", 404);
  const changedAt = new Date().toISOString();
  const assignmentChanged =
    historyValue(currentAssignment?.assigned_user_id) !==
      historyValue(assignedUserId) ||
    historyValue(currentAssignment?.team_id) !== historyValue(teamId) ||
    historyValue(currentAssignment?.establishment_id) !==
      historyValue(establishmentId);
  const userAssignmentChanged =
    historyValue(currentAssignment?.assigned_user_id) !==
      historyValue(assignedUserId);
  const assignmentContextChanged =
    historyValue(currentAssignment?.team_id) !== historyValue(teamId) ||
    historyValue(currentAssignment?.establishment_id) !==
      historyValue(establishmentId);
  if (assignmentChanged) {
    if (userAssignmentChanged) {
      await closeOpenAssignmentPeriod(
        id,
        changedAt,
        auth.session?.username || "admin",
        "Device assignment changed.",
      );
      await openAssignmentPeriod(
        id,
        assignedUserId,
        teamId,
        establishmentId,
        changedAt,
        auth.session?.username || "admin",
        "MANUAL_ADMIN",
        "Device assigned by admin.",
      );
    } else if (assignmentContextChanged && assignedUserId) {
      await updateOpenAssignmentPeriodContext(
        id,
        teamId,
        establishmentId,
        "Assignment context updated by admin.",
      );
    }
  }
  const oldUser =
    [currentDevice.first_name, currentDevice.last_name].filter(Boolean).join(
      " ",
    ) || currentDevice.email || null;
  const newUser = targetUser
    ? [targetUser.first_name, targetUser.last_name].filter(Boolean).join(" ") ||
      targetUser.email
    : null;
  const historyRows = [
    ["team_id", "TEAM_CHANGED", currentDevice.team_name, targetTeam?.name],
    [
      "establishment_id",
      "LOCATION_CHANGED",
      currentDevice.establishment_name,
      targetSite?.name,
    ],
    [
      "assigned_user_id",
      oldUser ? "USER_REASSIGNED" : "USER_ASSIGNED",
      oldUser,
      newUser,
    ],
    ["owner_email", "USER_REASSIGNED", currentDevice.email, targetUser?.email],
  ].flatMap(([fieldName, eventType, oldValue, newValue]) =>
    historyValue(oldValue) === historyValue(newValue) ? [] : [{
      device_id: id,
      event_type: eventType,
      field_name: fieldName,
      old_value: historyValue(oldValue),
      new_value: historyValue(newValue),
      changed_by: "admin",
      source: "MANUAL_ADMIN",
      changed_at: changedAt,
      related_user_id:
        fieldName === "assigned_user_id" || fieldName === "owner_email"
          ? assignedUserId
          : null,
      related_team_id: teamId,
      related_establishment_id: establishmentId,
    }]
  );
  await appendDeviceHistory(historyRows);
  if (historyRows.length > 0) {
    await notify(
      "DEVICE_REASSIGNED",
      "Affectation machine modifiée",
      `La machine ${
        safeString(currentDevice.hostname) || id
      } a changé d'affectation.`,
      {
        severity: "INFO",
        targetRole: "ADMIN",
        relatedEntityType: "device",
        relatedEntityId: id,
      },
    );
  }
  await audit("device_assignment_updated", "device", id, values);
  return json(request, { device: data });
}

async function handleAdminBulkReassign(request: Request) {
  if (!(await isAdmin(request, "DEVICE_EDIT"))) {
    return badRequest(request, "Action non autorisee pour ce role.", 403);
  }
  const body = await request.json().catch(() => ({}));
  const entityType = safeString(body.entityType);
  const sourceId = safeString(body.sourceId);
  const targetId = safeString(body.targetId);
  if (
    !["team", "establishment"].includes(entityType) || !sourceId || !targetId ||
    sourceId === targetId
  ) {
    return badRequest(request, "Réaffectation invalide.");
  }
  const table = entityType === "team" ? "teams" : "establishments";
  const column = entityType === "team" ? "team_id" : "establishment_id";
  if (!(await recordExists(table, targetId))) {
    return badRequest(request, "Destination introuvable.", 404);
  }

  const [
    { data: linkedDevices, error: linkedError },
    { data: source },
    { data: target },
  ] = await Promise.all([
    supabase.from("devices").select("id").eq(column, sourceId),
    supabase.from(table).select("name").eq("id", sourceId).maybeSingle(),
    supabase.from(table).select("name").eq("id", targetId).maybeSingle(),
  ]);
  if (linkedError) throw linkedError;
  const [
    { data: devices, error: deviceError },
    { data: users, error: userError },
  ] = await Promise.all([
    supabase.from("devices").update({
      [column]: targetId,
      updated_at: new Date().toISOString(),
    }).eq(column, sourceId).select("id"),
    supabase.from("users").update({
      [column]: targetId,
      updated_at: new Date().toISOString(),
    }).eq(column, sourceId).select("id"),
  ]);
  if (deviceError) throw deviceError;
  if (userError) throw userError;
  await appendDeviceHistory((linkedDevices ?? []).map((device) => ({
    device_id: device.id,
    event_type: entityType === "team" ? "TEAM_CHANGED" : "LOCATION_CHANGED",
    field_name: column,
    old_value: historyValue(source?.name),
    new_value: historyValue(target?.name),
    changed_by: "admin",
    source: "bulk-reassignment",
    changed_at: new Date().toISOString(),
  })));
  await audit(`${entityType}_references_reassigned`, entityType, sourceId, {
    target_id: targetId,
    device_count: devices?.length ?? 0,
    user_count: users?.length ?? 0,
  });
  return json(request, {
    devices: devices?.length ?? 0,
    users: users?.length ?? 0,
  });
}

async function handleAdminDeviceHistoryNote(request: Request, id: string) {
  if (!(await isAdmin(request, "VIEW_HISTORY"))) {
    return badRequest(request, "Action non autorisee pour ce role.", 403);
  }
  const body = await request.json().catch(() => ({}));
  const notes = safeString(body.notes, 2000);
  if (!notes) return badRequest(request, "Note requise.");
  const { data: device, error: deviceError } = await supabase.from("devices")
    .select("id").eq("id", id).maybeSingle();
  if (deviceError) throw deviceError;
  if (!device) return badRequest(request, "Machine introuvable.", 404);
  await appendDeviceHistory([{
    device_id: id,
    event_type: "MANUAL_EDIT",
    changed_by: "admin",
    source: "manual-note",
    notes,
    changed_at: new Date().toISOString(),
  }]);
  return json(request, { ok: true });
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      values.push(value.trim());
      value = "";
    } else {
      value += char;
    }
  }
  values.push(value.trim());
  return values;
}

type CpuBenchmarkSyncRow = {
  cpu_name: string;
  normalized_name: string;
  cpu_mark_score: number;
  release_year: number | null;
  generation: string | null;
  category: string | null;
  source: string;
  source_url: string | null;
  updated_at: string;
};

function parseBenchmarkScore(value: unknown) {
  const raw = safeString(value, 80).replace(/[^\d.]/g, "");
  const score = Number(raw);
  return Number.isFinite(score) && score > 0 ? Math.round(score) : 0;
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function benchmarkHeaderKey(header: string) {
  const key = header.toLowerCase().replace(/^\uFEFF/, "").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(
      /^_|_$/g,
      "",
    );
  const aliases: Record<string, string> = {
    cpu: "cpu_name",
    cpu_name: "cpu_name",
    name: "cpu_name",
    processor: "cpu_name",
    processor_name: "cpu_name",
    model: "cpu_name",
    cpu_mark: "cpu_mark_score",
    cpumark: "cpu_mark_score",
    cpu_mark_score: "cpu_mark_score",
    passmark: "cpu_mark_score",
    passmark_score: "cpu_mark_score",
    score: "cpu_mark_score",
    benchmark: "cpu_mark_score",
    release_year: "release_year",
    year: "release_year",
    generation: "generation",
    cpu_generation: "generation",
    category: "category",
    type: "category",
    source_url: "source_url",
    source_page: "source_url",
    benchmark_url: "source_url",
    url: "source_url",
  };
  return aliases[key] || key;
}

function cpuBenchmarkSourceName(url: string) {
  if (/cpubenchmark\.net|passmark/i.test(url)) return "passmark-cpu-mark";
  try {
    return `cpu-benchmark-source:${new URL(url).hostname}`;
  } catch {
    return "cpu-benchmark-source";
  }
}

function absoluteCpuBenchmarkUrl(href: string, baseUrl: string) {
  const value = decodeHtmlEntities(href);
  return canonicalizeCpuBenchmarkSourceUrl(value, baseUrl) ||
    safeExternalUrl(baseUrl) || null;
}

function cpuBenchmarkLookupQueries(cpuName: unknown) {
  const raw = safeString(cpuName, 260);
  if (!raw) return [];
  const cleaned = raw
    .replace(/\(r\)|\(tm\)|\u00ae|\u2122/gi, " ")
    .replace(/\b\d{1,2}(?:st|nd|rd|th)\s+gen\s+/gi, "")
    .replace(
      /\s+(?:with|w\/)\s+radeon(?:\s+vega)?(?:\s+\d+m)?(?:\s+mobile)?(?:\s+gfx|\s+graphics)?\b.*$/i,
      "",
    )
    .replace(/\s*@\s*[\d.]+\s*ghz\b.*$/i, "")
    .replace(/\s+\b(cpu|processor)\b\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(new Set([cleaned, raw].filter(Boolean)));
}

function passMarkLookupUrl(cpuName: string) {
  return `https://www.cpubenchmark.net/cpu_lookup.php?cpu=${
    encodeURIComponent(cpuName).replace(/%20/g, "+")
  }`;
}

function cpuBenchmarkNormalizedMatches(
  candidateName: string,
  wantedName: string,
) {
  if (!candidateName || !wantedName) return false;
  if (candidateName === wantedName) return true;
  if (!wantedName.startsWith("apple m")) return false;
  if (!candidateName.startsWith(`${wantedName} `)) return false;
  for (const tier of ["pro", "max", "ultra"]) {
    if (
      !wantedName.includes(` ${tier}`) &&
      new RegExp(`\\b${tier}\\b`).test(candidateName)
    ) return false;
  }
  return /\b(?:\d+\s+core|core\s+\d+|\d+\s+mhz|\d+\s+ghz)\b/.test(
    candidateName.slice(wantedName.length),
  );
}

function matchingCpuBenchmarkWantedName(
  candidateName: string,
  wantedNames?: Set<string>,
) {
  if (!wantedNames) return candidateName;
  for (const wantedName of wantedNames) {
    if (cpuBenchmarkNormalizedMatches(candidateName, wantedName)) {
      return wantedName;
    }
  }
  return "";
}

function cpuBenchmarkRowFromValues(
  values: Json,
  source: string,
  now: string,
  fallbackSourceUrl = "",
): CpuBenchmarkSyncRow | null {
  const cpuName = safeString(values.cpu_name, 260);
  const score = parseBenchmarkScore(values.cpu_mark_score);
  const normalizedName = normalizeCpuName(cpuName);
  if (!cpuName || !normalizedName || !score) return null;
  const releaseYear = safeNumber(values.release_year) ??
    inferCpuReleaseYear(cpuName);
  return {
    cpu_name: cpuName,
    normalized_name: normalizedName,
    cpu_mark_score: score,
    release_year: releaseYear,
    generation: safeString(values.generation, 120) ||
      inferCpuGeneration(cpuName) || null,
    category: safeString(values.category, 80) || null,
    source,
    source_url: safeExternalUrl(values.source_url) ||
      safeExternalUrl(fallbackSourceUrl) || null,
    updated_at: now,
  };
}

function parseCpuBenchmarkCsv(
  csv: string,
  source: string,
  now: string,
  sourceUrl = "",
  wantedNames?: Set<string>,
) {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) =>
    line.trim()
  );
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map(benchmarkHeaderKey);
  if (!headers.includes("cpu_name") || !headers.includes("cpu_mark_score")) {
    return [];
  }
  const rows: CpuBenchmarkSyncRow[] = [];
  for (let index = 1; index < lines.length; index += 1) {
    const values = parseCsvLine(lines[index]);
    const row = cpuBenchmarkRowFromValues(
      Object.fromEntries(
        headers.map((header, column) => [header, values[column] ?? ""]),
      ),
      source,
      now,
      sourceUrl,
    );
    if (row && wantedNames && !wantedNames.has(row.normalized_name)) continue;
    if (row) rows.push(row);
  }
  return rows;
}

function parsePassMarkCpuHtml(
  html: string,
  source: string,
  now: string,
  sourceUrl: string,
  wantedNames?: Set<string>,
) {
  const rows: CpuBenchmarkSyncRow[] = [];
  const seen = new Set<string>();
  const rowFragments = [
    ...html.split(/<tr\b/i),
    ...html.split(/<li\b/i),
  ];
  for (const fragment of rowFragments) {
    if (!/cpu(?:_lookup)?\.php\?cpu=/i.test(fragment)) continue;
    const linkMatch = fragment.match(
      /<a[^>]+href=["']([^"']*cpu(?:_lookup)?\.php\?cpu=[^"']+)["'][^>]*>([\s\S]*?)<\/a>/i,
    );
    if (!linkMatch) continue;
    const productName = fragment.match(
      /<span[^>]+class=["'][^"']*prdname[^"']*["'][^>]*>([\s\S]*?)<\/span>/i,
    );
    const cpuName = decodeHtmlEntities(productName?.[1] || linkMatch[2] || "");
    const normalizedName = normalizeCpuName(cpuName);
    const matchedWantedName = matchingCpuBenchmarkWantedName(
      normalizedName,
      wantedNames,
    );
    if (!normalizedName || !matchedWantedName || seen.has(matchedWantedName)) {
      continue;
    }
    const afterLink = fragment.slice(
      (linkMatch.index ?? 0) + linkMatch[0].length,
    );
    const scoreMatch = fragment.match(
      /class=["'][^"']*mark-neww[^"']*["'][^>]*>\s*([\d,]+)\s*</i,
    ) ||
      fragment.match(/class=["'][^"']*count[^"']*["'][^>]*>\s*([\d,]+)\s*</i) ||
      afterLink.match(/<td[^>]*>\s*([\d,]+)\s*<\/td>/i) ||
      fragment.match(/cpu(?:mark|_mark)[^>]*>\s*([\d,]+)\s*</i);
    const cpuSourceUrl = absoluteCpuBenchmarkUrl(linkMatch[1] || "", sourceUrl);
    const row = cpuBenchmarkRowFromValues(
      {
        cpu_name: cpuName,
        cpu_mark_score: scoreMatch?.[1],
        source_url: cpuSourceUrl,
      },
      source,
      now,
      sourceUrl,
    );
    if (!row) continue;
    row.normalized_name = matchedWantedName;
    seen.add(row.normalized_name);
    rows.push(row);
  }
  return rows;
}

async function fetchCpuBenchmarkRowsFromSource(
  url: string,
  now: string,
  wantedNames?: Set<string>,
) {
  const source = cpuBenchmarkSourceName(url);
  const response = await fetch(url, {
    headers: {
      "Accept": "text/csv,text/plain,text/html;q=0.9,*/*;q=0.8",
      "User-Agent": "Spacefoot IT Inventory CPU benchmark sync",
    },
  });
  if (!response.ok) throw new Error(`${source} HTTP ${response.status}`);
  const text = await response.text();
  const htmlRows = /cpu(?:_lookup)?\.php\?cpu=|CPU Mark/i.test(text)
    ? parsePassMarkCpuHtml(text, source, now, url, wantedNames)
    : [];
  if (htmlRows.length > 0) return htmlRows;
  return parseCpuBenchmarkCsv(text, source, now, url, wantedNames);
}

async function fetchPassMarkLookupRow(
  cpuName: string,
  normalizedName: string,
  now: string,
) {
  const wanted = new Set([normalizedName]);
  for (const query of cpuBenchmarkLookupQueries(cpuName)) {
    const url = passMarkLookupUrl(query);
    const rows = await fetchCpuBenchmarkRowsFromSource(url, now, wanted);
    const row = rows.find((item) => item.normalized_name === normalizedName);
    if (row) return { row, url, fetched: rows.length };
  }
  return null;
}

function isCpuBenchmarkSyncRequest(request: Request) {
  const provided = safeString(
    request.headers.get("x-cpu-benchmark-sync-token"),
    512,
  );
  return Boolean(
    cpuBenchmarkSyncToken && provided && provided === cpuBenchmarkSyncToken,
  );
}

async function authorizeCpuBenchmarkSync(request: Request) {
  if (isCpuBenchmarkSyncRequest(request)) return null;
  if (!(await isAdmin(request, "DEVICE_EDIT"))) {
    return badRequest(request, "Action non autorisee pour ce role.", 403);
  }
  return null;
}

async function handleAdminImportCpuBenchmarks(request: Request) {
  if (!(await isAdmin(request, "DEVICE_EDIT"))) {
    return badRequest(request, "Action non autorisee pour ce role.", 403);
  }
  const body = await request.json().catch(() => ({}));
  const csv = typeof body.csv === "string" ? body.csv.slice(0, 2_000_000) : "";
  if (!csv.trim()) return badRequest(request, "Fichier CSV requis.");
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter((
    line: string,
  ) => line.trim());
  if (lines.length < 2) {
    return badRequest(request, "Le CSV ne contient aucune donnee.");
  }
  const headers = parseCsvLine(lines[0]).map(benchmarkHeaderKey);
  const required = ["cpu_name", "cpu_mark_score"];
  if (required.some((header) => !headers.includes(header))) {
    return badRequest(request, "Colonnes requises: cpu_name,cpu_mark_score.");
  }

  const rows = [];
  const rejected: Array<{ line: number; reason: string }> = [];
  for (let index = 1; index < lines.length; index += 1) {
    const values = parseCsvLine(lines[index]);
    const row = Object.fromEntries(
      headers.map((header, column) => [header, values[column] ?? ""]),
    );
    const cpuName = safeString(row.cpu_name, 260);
    const score = Number(row.cpu_mark_score);
    if (!cpuName || !Number.isFinite(score) || score <= 0) {
      rejected.push({ line: index + 1, reason: "CPU ou score invalide" });
      continue;
    }
    rows.push({
      cpu_name: cpuName,
      normalized_name: normalizeCpuName(cpuName),
      cpu_mark_score: Math.round(score),
      release_year: safeNumber(row.release_year),
      generation: safeString(
        row.generation || row.cpu_generation || row["g\u00e9n\u00e9ration"],
        120,
      ) || inferCpuGeneration(cpuName) || null,
      category: safeString(row.category, 80) || null,
      source: "admin-csv-import",

      source_url: safeExternalUrl(row.source_url) || null,
      updated_at: new Date().toISOString(),
    });
  }
  if (rows.length === 0) return badRequest(request, "Aucune ligne CPU valide.");
  const { error } = await supabase.from("cpu_benchmarks").upsert(rows, {
    onConflict: "normalized_name",
  });
  if (error) throw error;
  await audit("cpu_benchmarks_imported", "cpu_benchmark", null, {
    imported: rows.length,
    rejected: rejected.length,
  });
  return json(request, {
    imported: rows.length,
    rejected: rejected.length,
    errors: rejected.slice(0, 20),
  });
}

async function handleAdminSyncCpuBenchmarks(request: Request) {
  const authorizationError = await authorizeCpuBenchmarkSync(request);
  if (authorizationError) return authorizationError;

  const body = await request.json().catch(() => ({}));
  const limit = Math.max(1, Math.min(Number(body.limit || 250), 1000));
  const recalculate = body.recalculate !== false;
  const recalculateLimit = Math.max(
    1,
    Math.min(Number(body.recalculateLimit || 100), 500),
  );
  const force = Boolean(body.force);
  const sourceUrls =
    (Array.isArray(body.urls) ? body.urls : defaultCpuBenchmarkSourceUrls)
      .map((url: unknown) => safeString(url, 500))
      .filter((url: string) => /^https?:\/\//i.test(url));

  if (sourceUrls.length === 0) {
    return badRequest(request, "Aucune source CPU benchmark configuree.");
  }

  const { data: devices, error: devicesError } = await supabase
    .from("device_inventory_view")
    .select(
      "id,cpu,enrichment_cpu_name,cpu_score,cpu_benchmark_score,cpu_generation,last_enriched_at",
    )
    .limit(2500);
  if (devicesError) throw devicesError;

  const candidates = new Map<string, Json>();
  for (const device of devices ?? []) {
    const cpuName = safeString(device.cpu || device.enrichment_cpu_name, 260);
    const normalizedName = normalizeCpuName(cpuName);
    if (!cpuName || !normalizedName || candidates.has(normalizedName)) continue;
    candidates.set(normalizedName, { ...device, cpuName, normalizedName });
    if (candidates.size >= limit) break;
  }

  if (candidates.size === 0) {
    return json(request, {
      scanned: 0,
      matched: 0,
      imported: 0,
      updated: 0,
      skipped: 0,
      recalculated: 0,
      sources: [],
    });
  }

  const { data: existingRows, error: existingError } = await supabase
    .from("cpu_benchmarks")
    .select(
      "cpu_name,normalized_name,cpu_mark_score,release_year,generation,category,source,source_url",
    )
    .in("normalized_name", [...candidates.keys()]);
  if (existingError) throw existingError;

  const existingByName = new Map(
    (existingRows ?? []).map((row) => [safeString(row.normalized_name), row]),
  );
  const sourceRows = new Map<string, CpuBenchmarkSyncRow>();
  const sourceResults: Json[] = [];
  const now = new Date().toISOString();
  const wantedNames = new Set(candidates.keys());

  for (const url of sourceUrls) {
    try {
      const fetchedRows = await fetchCpuBenchmarkRowsFromSource(
        url,
        now,
        wantedNames,
      );
      let matched = 0;
      for (const row of fetchedRows) {
        if (!candidates.has(row.normalized_name)) continue;
        matched += 1;
        if (!sourceRows.has(row.normalized_name)) {
          sourceRows.set(row.normalized_name, row);
        }
      }
      sourceResults.push({
        url,
        status: "ok",
        fetched: fetchedRows.length,
        matched,
      });
    } catch (error) {
      sourceResults.push({
        url,
        status: "failed",
        error: safeString(
          error instanceof Error ? error.message : String(error),
          300,
        ),
      });
    }
  }

  let lookupFetched = 0;
  let lookupMatched = 0;
  let lookupFailed = 0;
  const lookupLimit = Math.max(
    1,
    Math.min(Number(body.lookupLimit || candidates.size), 50),
  );
  const lookupCandidates = [...candidates.entries()]
    .filter(([normalizedName]) => {
      const current = sourceRows.get(normalizedName);
      return !current || current.source !== "passmark-cpu-mark";
    })
    .slice(0, lookupLimit);
  const lookupConcurrency = 4;
  for (
    let offset = 0;
    offset < lookupCandidates.length;
    offset += lookupConcurrency
  ) {
    const batch = lookupCandidates.slice(offset, offset + lookupConcurrency);
    const resolved = await Promise.all(
      batch.map(async ([normalizedName, candidate]) => {
        try {
          const found = await fetchPassMarkLookupRow(
            safeString(candidate.cpuName, 260),
            normalizedName,
            now,
          );
          return { normalizedName, found, failed: false };
        } catch {
          return { normalizedName, found: null, failed: true };
        }
      }),
    );
    for (const result of resolved) {
      if (result.failed) {
        lookupFailed += 1;
        continue;
      }
      if (!result.found) continue;
      lookupFetched += result.found.fetched;
      lookupMatched += 1;
      sourceRows.set(result.normalizedName, result.found.row);
    }
  }
  if (lookupCandidates.length > 0) {
    sourceResults.push({
      url: "https://www.cpubenchmark.net/cpu_lookup.php",
      status: lookupFailed === lookupCandidates.length ? "failed" : "ok",
      lookups: lookupCandidates.length,
      fetched: lookupFetched,
      matched: lookupMatched,
      failed: lookupFailed,
    });
  }

  const rows: CpuBenchmarkSyncRow[] = [];
  const rowsToRecalculate = new Set<string>();
  const resultRows: Json[] = [];
  let skipped = 0;

  for (const [normalizedName, candidate] of candidates.entries()) {
    const incoming = sourceRows.get(normalizedName);
    const existing = existingByName.get(normalizedName);
    const candidateCpuName = safeString(candidate.cpuName, 260);
    if (!incoming) {
      skipped += 1;
      resultRows.push({ cpuName: candidateCpuName, status: "missing" });
      continue;
    }

    const existingSource = safeString(existing?.source, 120);
    const incomingSource = safeString(incoming.source, 120);
    const hasTrustedExisting =
      ["admin-csv-import", "passmark-cpu-mark"].includes(existingSource) ||
      existingSource.startsWith("cpu-benchmark-source:");
    const sameScore =
      Number(existing?.cpu_mark_score || 0) === incoming.cpu_mark_score;
    const existingSourceUrl = safeExternalUrl(existing?.source_url);
    const incomingSourceUrl = safeExternalUrl(incoming.source_url);
    const upgradesSource = incomingSource === "passmark-cpu-mark" &&
      existingSource !== "passmark-cpu-mark";
    const changesSourceUrl = Boolean(
      incomingSourceUrl && incomingSourceUrl !== existingSourceUrl,
    );
    if (
      !force && hasTrustedExisting && sameScore && existing?.release_year &&
      (!incomingSourceUrl || existingSourceUrl) && !upgradesSource &&
      !changesSourceUrl
    ) {
      skipped += 1;
      resultRows.push({
        cpuName: candidateCpuName,
        score: incoming.cpu_mark_score,
        source: existing.source,
        sourceUrl: existing.source_url,
        status: "kept",
      });
      continue;
    }

    const nextReleaseYear = incoming.release_year ??
      safeNumber(existing?.release_year) ??
      inferCpuReleaseYear(candidateCpuName);
    const nextGeneration = incoming.generation ||
      safeString(existing?.generation, 120) ||
      inferCpuGeneration(candidateCpuName) || null;
    const nextCategory = incoming.category ||
      safeString(existing?.category, 80) || null;
    const materiallyChanged = !existing ||
      Number(existing?.cpu_mark_score || 0) !== incoming.cpu_mark_score ||
      Number(existing?.release_year || 0) !== Number(nextReleaseYear || 0) ||
      safeString(existing?.generation, 120) !==
        safeString(nextGeneration, 120) ||
      safeString(existing?.category, 80) !== safeString(nextCategory, 80) ||
      upgradesSource ||
      changesSourceUrl;

    rows.push({
      ...incoming,
      cpu_name: safeString(
        incoming.cpu_name || existing?.cpu_name || candidateCpuName,
        260,
      ),
      release_year: nextReleaseYear,
      generation: nextGeneration,
      category: nextCategory,
      source_url: incomingSourceUrl || existingSourceUrl || null,
      updated_at: now,
    });
    if (materiallyChanged) rowsToRecalculate.add(normalizedName);
    resultRows.push({
      cpuName: candidateCpuName,
      score: incoming.cpu_mark_score,
      source: incoming.source,
      sourceUrl: incoming.source_url,
      status: existing ? "updated" : "imported",
    });
  }

  if (rows.length > 0) {
    const { error } = await supabase.from("cpu_benchmarks").upsert(rows, {
      onConflict: "normalized_name",
    });
    if (error) throw error;
  }

  let recalculated = 0;
  if (recalculate && rowsToRecalculate.size > 0) {
    const devicesToRecalculate = (devices ?? []).filter((device) => {
      const cpuName = safeString(device.cpu || device.enrichment_cpu_name, 260);
      return rowsToRecalculate.has(normalizeCpuName(cpuName));
    }).slice(0, recalculateLimit);
    const recalculation = await enrichDeviceRows(devicesToRecalculate, {
      force: true,
      useExternal: false,
    });
    recalculated = recalculation.enriched;
  }

  await audit("cpu_benchmarks_synced", "cpu_benchmark", null, {
    scanned: candidates.size,
    imported: resultRows.filter((row) => row.status === "imported").length,
    updated: resultRows.filter((row) => row.status === "updated").length,
    skipped,
    recalculated,
    sources: sourceResults,
  });

  return json(request, {
    ok: sourceResults.some((source) => source.status === "ok"),
    scanned: candidates.size,
    matched: sourceRows.size,
    imported: resultRows.filter((row) => row.status === "imported").length,
    updated: resultRows.filter((row) => row.status === "updated").length,
    skipped,
    recalculated,
    sources: sourceResults,
    rows: resultRows.slice(0, 80),
  });
}

function cpuReleaseAdapters() {
  const client = new BoundedCpuReleaseHttpClient(
    "SpacefootInventory/1.0 (+https://badr-spacefoot.github.io/pc_inventory_2.0/)",
  );
  return [
    new IntelReleaseAdapter(client),
    new AmdReleaseAdapter(client),
    new AppleReleaseAdapter(client),
    new QualcommReleaseAdapter(client),
  ];
}

async function canSynchronizeCpuReleases(request: Request): Promise<boolean> {
  if (hasCpuReleaseSyncToken(request.headers, cpuReleaseSyncToken)) return true;
  return await isAdmin(request, "DEVICE_EDIT");
}

function cpuReleaseSyncOptions(body: Json): CpuReleaseSyncOptions {
  return {
    unresolvedOnly: body.unresolvedOnly !== false,
    staleOnly: Boolean(body.staleOnly),
    limit: Math.max(1, Math.min(Number(body.limit || 80), 200)),
    force: Boolean(body.force),
    staleDays: Math.max(1, Math.min(Number(body.staleDays || 30), 365)),
  };
}

function requestedCpuVendor(value: unknown): CpuVendor | undefined {
  const vendor = safeString(value, 20).toLowerCase();
  return ["intel", "amd", "apple", "qualcomm"].includes(vendor)
    ? vendor as CpuVendor
    : undefined;
}

function requestedCpuVendors(body: Json): CpuVendor[] {
  const values = Array.isArray(body.vendors) ? body.vendors : [body.vendor];
  return [
    ...new Set(
      values.map(requestedCpuVendor).filter((vendor): vendor is CpuVendor =>
        Boolean(vendor)
      ),
    ),
  ];
}

async function synchronizeObservedCpuReleases(body: Json) {
  const repository = new CpuReleaseRepository(supabase);
  const options = cpuReleaseSyncOptions(body);
  const requestedNames = Array.isArray(body.cpuNames)
    ? body.cpuNames.map((value) => safeString(value, 240)).filter(Boolean)
      .slice(0, 200)
    : [];
  const observedCpuNames = requestedNames.length > 0
    ? [...new Set(requestedNames)]
    : await repository.observedCpuNames(1000);
  const existingCatalog = await repository.catalog();
  const cpuNames = observedCpuNames.filter((cpuName) => {
    const resolution = resolveCpuRelease(
      cpuName,
      existingCatalog.rows,
      existingCatalog.aliases,
    );
    return shouldSynchronizeCpuRelease(resolution, options);
  }).slice(0, options.limit);
  const results = await synchronizeCpuReleaseCatalog({
    repository,
    adapters: cpuReleaseAdapters(),
    cpuNames,
    options,
    vendors: requestedCpuVendors(body),
  });
  clearCpuReleaseCatalogCache();
  const backfilled = body.recalculateDevices === false
    ? 0
    : await backfillCpuReleaseEnrichment();
  return { cpuNames, options, results, backfilled };
}

async function handleCpuReleaseSync(request: Request) {
  if (!(await canSynchronizeCpuReleases(request))) {
    return badRequest(
      request,
      "CPU release synchronization is not authorized.",
      403,
    );
  }
  const body = await request.json().catch(() => ({})) as Json;
  const sync = await synchronizeObservedCpuReleases(body);
  await audit("cpu_release_catalog_synchronized", "cpu_release_catalog", null, {
    requested: sync.cpuNames.length,
    backfilled: sync.backfilled,
    results: sync.results,
  });
  return json(request, {
    ok: sync.results.every((result) => result.status !== "failed"),
    requested: sync.cpuNames.length,
    backfilled: sync.backfilled,
    options: sync.options,
    results: sync.results,
  });
}

async function handleCpuReleaseStatus(request: Request) {
  if (!(await canSynchronizeCpuReleases(request))) {
    return badRequest(
      request,
      "CPU release synchronization status is not authorized.",
      403,
    );
  }
  const repository = new CpuReleaseRepository(supabase);
  const [{ rows, aliases }, runs, observedCpuNames] = await Promise.all([
    repository.catalog(),
    repository.latestRuns(16),
    repository.observedCpuNames(1000),
  ]);
  const now = Date.now();
  const unresolvedCpuNames = observedCpuNames.filter((cpuName) =>
    !resolveCpuRelease(cpuName, rows, aliases)
  );
  const successfulByVendor = Object.fromEntries(
    ["intel", "amd", "apple", "qualcomm"].map((vendor) => [
      vendor,
      runs.find((run) =>
        safeString(run.vendor) === vendor &&
        safeString(run.status) === "completed"
      ) ?? null,
    ]),
  );
  return json(request, {
    catalogCount: rows.length,
    officialCount: rows.filter((row) => row.is_official).length,
    exactCount: rows.filter((row) => row.match_scope !== "family").length,
    familyCount: rows.filter((row) => row.match_scope === "family").length,
    unresolvedCount: unresolvedCpuNames.length,
    unresolvedCpuNames: unresolvedCpuNames.slice(0, 100),
    staleCount: rows.filter((row) =>
      now - new Date(row.last_verified_at).getTime() > 30 * 86_400_000
    ).length,
    byVendor: Object.fromEntries(
      ["intel", "amd", "apple", "qualcomm"].map((vendor) => [
        vendor,
        rows.filter((row) =>
          row.vendor === vendor
        ).length,
      ]),
    ),
    byPrecision: Object.fromEntries(
      ["day", "month", "quarter", "half_year", "year", "unknown"].map((
        precision,
      ) => [
        precision,
        rows.filter((row) => row.release_precision === precision).length,
      ]),
    ),
    lastSuccessfulByVendor: successfulByVendor,
    recentFailures: runs.filter((run) =>
      ["failed", "partial"].includes(safeString(run.status))
    ).slice(0, 10),
    runs,
  });
}

async function handleAdminRefreshCpuReleaseDates(request: Request) {
  if (!(await isAdmin(request, "DEVICE_EDIT"))) {
    return badRequest(request, "Action non autorisee pour ce role.", 403);
  }
  const body = await request.json().catch(() => ({}));
  const limit = Math.max(1, Math.min(Number(body.limit || 60), 200));
  const force = Boolean(body.force);

  const catalogSync = await synchronizeObservedCpuReleases({
    ...body,
    limit,
    force,
  });

  const { data: devices, error: devicesError } = await supabase
    .from("device_inventory_view")
    .select(
      "cpu,enrichment_cpu_name,cpu_score,cpu_benchmark_score,cpu_generation",
    )
    .limit(1000);
  if (devicesError) throw devicesError;

  const candidates = new Map<string, Json>();
  for (const device of devices ?? []) {
    const cpuName = safeString(device.cpu || device.enrichment_cpu_name, 260);
    const normalizedName = normalizeCpuName(cpuName);
    if (!cpuName || !normalizedName || candidates.has(normalizedName)) continue;
    candidates.set(normalizedName, { ...device, cpuName, normalizedName });
    if (candidates.size >= limit) break;
  }

  if (candidates.size === 0) {
    return json(request, { scanned: 0, updated: 0, skipped: 0, rows: [] });
  }

  const { data: existingRows, error: existingError } = await supabase
    .from("cpu_benchmarks")
    .select(
      "cpu_name,normalized_name,cpu_mark_score,release_year,generation,category,source,source_url",
    )
    .in("normalized_name", [...candidates.keys()]);
  if (existingError) throw existingError;

  const existingByName = new Map(
    (existingRows ?? []).map((row) => [safeString(row.normalized_name), row]),
  );
  const now = new Date().toISOString();
  const rows = [];
  const resultRows = [];
  let skipped = 0;

  for (const [normalizedName, candidate] of candidates.entries()) {
    const candidateCpuName = safeString(candidate.cpuName, 260);
    const existing = existingByName.get(normalizedName);
    const existingSource = safeString(existing?.source, 120);
    const existingSourceUrl = safeExternalUrl(existing?.source_url);
    const reference = knownCpuReleaseReference(candidateCpuName);
    const referenceGeneration = reference?.generation ||
      inferCpuGeneration(candidateCpuName);
    const existingGeneration = safeString(existing?.generation, 120);
    const existingNeedsCorrection = Boolean(
      reference?.releaseYear &&
        Number(existing?.release_year) !== reference.releaseYear,
    ) ||
      Boolean(
        referenceGeneration &&
          (!existingGeneration || existingGeneration === "1th Gen Intel" ||
            (reference?.generation &&
              existingGeneration !== referenceGeneration)),
      );
    if (
      !force && !existingNeedsCorrection && existing?.release_year &&
      (existingSource.startsWith("official-") ||
        existingSource === "admin-csv-import")
    ) {
      skipped += 1;
      resultRows.push({
        cpuName: candidateCpuName,
        releaseYear: existing.release_year,
        source: existingSource,
        status: "kept",
      });
      continue;
    }

    const lookup = await lookupCpuReleaseDate(
      candidateCpuName,
      existingSourceUrl,
    );
    if (!lookup.releaseYear) {
      skipped += 1;
      resultRows.push({
        cpuName: candidateCpuName,
        releaseYear: null,
        source: lookup.source,
        status: "missing",
      });
      continue;
    }

    const cpuScore = Number(
      existing?.cpu_mark_score || candidate.cpu_benchmark_score ||
        candidate.cpu_score || estimateCpuScore(candidateCpuName),
    );
    const generation = safeString(
      lookup.generation || referenceGeneration || candidate.cpu_generation ||
        existing?.generation,
      120,
    ) || null;
    const category = safeString(
      lookup.category || reference?.category || existing?.category,
      80,
    ) || null;
    rows.push({
      cpu_name: safeString(existing?.cpu_name || candidateCpuName, 260),
      normalized_name: normalizedName,
      cpu_mark_score: Math.round(Math.max(800, cpuScore)),
      release_year: lookup.releaseYear,
      generation,
      category,
      // Benchmark provenance and release-date provenance are separate. The
      // latter lives in cpu_release_catalog / hardware_enrichment.
      source: existingSource || "cpu-score-estimate",
      source_url: existingSourceUrl || null,
      updated_at: now,
    });
    resultRows.push({
      cpuName: candidateCpuName,
      releaseYear: lookup.releaseYear,
      source: lookup.source,
      confidence: lookup.confidence,
      releasePeriod: lookup.releasePeriod || String(lookup.releaseYear),
      status: "updated",
    });
  }

  if (rows.length > 0) {
    const { error } = await supabase.from("cpu_benchmarks").upsert(rows, {
      onConflict: "normalized_name",
    });
    if (error) throw error;
  }

  await audit("cpu_release_dates_refreshed", "cpu_benchmark", null, {
    scanned: candidates.size,
    updated: rows.length,
    skipped,
  });

  return json(request, {
    scanned: candidates.size,
    updated: rows.length,
    skipped,
    official: resultRows.filter((row) =>
      safeString(row.source).startsWith("official-")
    ).length,
    observed: resultRows.filter((row) =>
      safeString(row.source) === "passmark-first-seen"
    ).length,
    fallback: resultRows.filter((row) =>
      safeString(row.source).includes("family-rule")
    ).length,
    rows: resultRows,
    catalogSync: catalogSync.results,
  });
}

async function handleAdminCpuBenchmarkStats(request: Request) {
  if (!(await isAdmin(request, "VIEW_DASHBOARD"))) {
    return badRequest(request, "Action non autorisee pour ce role.", 403);
  }
  const { count, error } = await supabase.from("cpu_benchmarks").select("id", {
    count: "exact",
    head: true,
  });
  if (error) throw error;
  return json(request, {
    importedCount: count ?? 0,
    bundledCount: (cpuBenchmarkSeed as CpuBenchmark[]).length,
  });
}

function summarizeEnrichmentResults(results: Json[]) {
  const enriched =
    results.filter((result) => !result.skipped && !result.failed).length;
  const failed = results.filter((result) => result.failed).length;
  const skipped = results.filter((result) => result.skipped).length;
  const ebayResultCount = results.reduce(
    (sum, result) =>
      sum + Number((result.providerCounts as Json | undefined)?.ebay || 0),
    0,
  );
  const statuses = new Set<string>();
  for (const result of results) {
    const ebayStatus =
      ((result.providerStatus as Json | undefined)?.ebay as Json | undefined)
        ?.status;
    if (ebayStatus) statuses.add(safeString(ebayStatus, 80));
  }
  return {
    enriched,
    failed,
    skipped,
    processed: results.length,
    ebayResultCount,
    providerStatuses: { ebay: Array.from(statuses) },
  };
}

async function enrichDeviceRows(
  devices: Json[],
  options: { force: boolean; useExternal: boolean },
) {
  const results: Json[] = [];
  for (const device of devices ?? []) {
    try {
      results.push(await enrichOneDevice(device, options));
    } catch (error) {
      console.error("Device enrichment failed", device.id, error);
      const errorMessage = error instanceof Error
        ? error.message
        : error && typeof error === "object" && "message" in error
        ? safeString((error as { message?: unknown }).message, 1000)
        : safeString(error, 1000) || "Unknown enrichment error";
      await supabase.from("hardware_enrichment").upsert({
        device_id: safeString(device.id),
        enrichment_status: "failed",
        enrichment_source: "enrichment-service",
        notes: errorMessage,
        last_enriched_at: new Date().toISOString(),
      }, { onConflict: "device_id" });
      results.push({ skipped: false, failed: true, deviceId: device.id });
    }
  }
  return { results, ...summarizeEnrichmentResults(results) };
}

function serializeEnrichmentJob(job: Json | null) {
  if (!job) return null;
  const total = Number(job.total_count || 0);
  const processed = Number(job.processed_count || 0);
  return {
    id: safeString(job.id),
    status: safeString(job.status),
    mode: safeString(job.mode),
    force: Boolean(job.force),
    useExternal: Boolean(job.use_external),
    totalCount: total,
    processedCount: processed,
    enrichedCount: Number(job.enriched_count || 0),
    skippedCount: Number(job.skipped_count || 0),
    failedCount: Number(job.failed_count || 0),
    ebayResultCount: Number(job.ebay_result_count || 0),
    providerStatuses: job.provider_statuses || {},
    lastError: safeString(job.last_error, 1000),
    createdAt: safeString(job.created_at),
    updatedAt: safeString(job.updated_at),
    finishedAt: safeString(job.finished_at),
    progress: total > 0 ? Math.min(1, processed / total) : 0,
  };
}

async function getActiveEnrichmentJob() {
  const activeSince = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("enrichment_jobs")
    .select("*")
    .in("status", ["queued", "running"])
    .gte("updated_at", activeSince)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function handleActiveEnrichmentJob(request: Request) {
  if (!(await isAdmin(request, "DEVICE_EDIT"))) {
    return badRequest(request, "Action non autorisee pour ce role.", 403);
  }
  return json(request, {
    job: serializeEnrichmentJob(await getActiveEnrichmentJob()),
  });
}

async function handleStartEnrichmentJob(request: Request) {
  const { response, session } = await requireAction(request, "DEVICE_EDIT");
  if (response) return response;

  const body = await request.json().catch(() => ({}));
  const mode = safeString(body.mode, 40) || "refresh";
  const force = Boolean(body.force ?? true) || mode === "recalculate";
  const useExternal = Boolean(body.useExternal ?? true) &&
    mode !== "recalculate";
  const active = await getActiveEnrichmentJob();
  if (active) {
    return json(request, {
      job: serializeEnrichmentJob(active),
      resumed: true,
    });
  }

  const { count, error: countError } = await supabase
    .from("device_inventory_view")
    .select("id", { count: "exact", head: true });
  if (countError) throw countError;

  const { data, error } = await supabase
    .from("enrichment_jobs")
    .insert({
      status: "running",
      mode,
      force,
      use_external: useExternal,
      total_count: count ?? 0,
      actor_label: session?.displayName || session?.username || "admin",
    })
    .select("*")
    .single();
  if (error) throw error;

  await audit("hardware_enrichment_job_started", "device", null, {
    jobId: data.id,
    mode,
    force,
    useExternal,
    totalCount: count ?? 0,
  });
  return json(request, { job: serializeEnrichmentJob(data), resumed: false });
}

async function handleProcessEnrichmentJob(request: Request) {
  if (!(await isAdmin(request, "DEVICE_EDIT"))) {
    return badRequest(request, "Action non autorisee pour ce role.", 403);
  }

  const body = await request.json().catch(() => ({}));
  const jobId = safeString(body.jobId);
  const limit = Math.max(1, Math.min(Number(body.limit || 10), 25));
  if (!jobId) return badRequest(request, "Job enrichissement manquant.");

  const { data: job, error: jobError } = await supabase
    .from("enrichment_jobs")
    .select("*")
    .eq("id", jobId)
    .single();
  if (jobError) throw jobError;
  if (!job) return badRequest(request, "Job enrichissement introuvable.", 404);

  const status = safeString(job.status);
  if (!["queued", "running"].includes(status)) {
    return json(request, { job: serializeEnrichmentJob(job), results: [] });
  }

  const totalCount = Number(job.total_count || 0);
  const processedBefore = Number(job.processed_count || 0);
  if (processedBefore >= totalCount) {
    const { data: completed, error } = await supabase
      .from("enrichment_jobs")
      .update({
        status: "completed",
        updated_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
      })
      .eq("id", jobId)
      .select("*")
      .single();
    if (error) throw error;
    return json(request, {
      job: serializeEnrichmentJob(completed),
      results: [],
    });
  }

  const { data: devices, error } = await supabase
    .from("device_inventory_view")
    .select("*")
    .order("last_enriched_at", { ascending: true, nullsFirst: true })
    .limit(Math.min(limit, totalCount - processedBefore));
  if (error) throw error;

  const batch = await enrichDeviceRows(devices ?? [], {
    force: Boolean(job.force),
    useExternal: Boolean(job.use_external),
  });
  const processedCount = processedBefore + batch.processed;
  const completed = processedCount >= totalCount || batch.processed === 0;
  const previousProviderStatuses =
    job.provider_statuses && typeof job.provider_statuses === "object"
      ? job.provider_statuses as Json
      : {};
  const previousEbayStatuses = Array.isArray(previousProviderStatuses.ebay)
    ? previousProviderStatuses.ebay.map((status) => safeString(status, 80))
      .filter(Boolean)
    : [];
  const batchEbayStatuses = Array.isArray((batch.providerStatuses as Json).ebay)
    ? ((batch.providerStatuses as Json).ebay as unknown[]).map((status) =>
      safeString(status, 80)
    ).filter(Boolean)
    : [];
  const updateValues = {
    status: completed ? "completed" : "running",
    processed_count: processedCount,
    enriched_count: Number(job.enriched_count || 0) + batch.enriched,
    skipped_count: Number(job.skipped_count || 0) + batch.skipped,
    failed_count: Number(job.failed_count || 0) + batch.failed,
    ebay_result_count: Number(job.ebay_result_count || 0) +
      batch.ebayResultCount,
    provider_statuses: {
      ...previousProviderStatuses,
      ebay: Array.from(
        new Set([...previousEbayStatuses, ...batchEbayStatuses]),
      ),
    },
    updated_at: new Date().toISOString(),
    finished_at: completed ? new Date().toISOString() : null,
  };
  const { data: updated, error: updateError } = await supabase
    .from("enrichment_jobs")
    .update(updateValues)
    .eq("id", jobId)
    .select("*")
    .single();
  if (updateError) throw updateError;

  if (completed) {
    await audit("hardware_enrichment_job_completed", "device", null, {
      jobId,
      processed: processedCount,
      enriched: updateValues.enriched_count,
      failed: updateValues.failed_count,
      skipped: updateValues.skipped_count,
    });
  }

  return json(request, {
    job: serializeEnrichmentJob(updated),
    results: batch.results,
  });
}

async function handleAdminEnrich(request: Request) {
  if (!(await isAdmin(request, "DEVICE_EDIT"))) {
    return badRequest(request, "Action non autorisee pour ce role.", 403);
  }
  const body = await request.json().catch(() => ({}));
  const mode = safeString(body.mode, 40) || "refresh";
  const force = Boolean(body.force) || mode === "recalculate";
  const useExternal = Boolean(body.useExternal) && mode !== "recalculate";
  const limit = Math.max(1, Math.min(Number(body.limit || 25), 100));
  const deviceId = safeString(body.deviceId);
  let query = supabase.from("device_inventory_view").select("*").order(
    "last_enriched_at",
    { ascending: true, nullsFirst: true },
  ).limit(limit);
  if (deviceId) query = query.eq("id", deviceId);
  const { data: devices, error } = await query;
  if (error) throw error;

  const results: Json[] = [];
  for (const device of devices ?? []) {
    try {
      results.push(await enrichOneDevice(device, { force, useExternal }));
    } catch (error) {
      console.error("Device enrichment failed", device.id, error);
      await supabase.from("hardware_enrichment").upsert({
        device_id: safeString(device.id),
        enrichment_status: "failed",
        enrichment_source: "enrichment-service",
        notes: safeString(
          error instanceof Error ? error.message : "Unknown enrichment error",
          1000,
        ),
        last_enriched_at: new Date().toISOString(),
      }, { onConflict: "device_id" });
      results.push({ skipped: false, failed: true, deviceId: device.id });
    }
  }
  const enriched =
    results.filter((result) => !result.skipped && !result.failed).length;
  const failed = results.filter((result) => result.failed).length;
  const skipped = results.filter((result) => result.skipped).length;
  const processed = results.length;
  const hasMore = !deviceId && processed === limit;
  await audit("hardware_enrichment_run", "device", deviceId || null, {
    enriched,
    failed,
    skipped,
    processed,
    hasMore,
    force,
    useExternal,
    mode,
    limit,
  });
  return json(request, {
    ok: failed === 0,
    enriched,
    failed,
    skipped,
    processed,
    hasMore,
    results,
  });
}

function invoiceDateValue(value: unknown) {
  const text = safeString(value, 10);

  if (!text) return null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";

  const time = new Date(`${text}T00:00:00Z`).getTime();

  return Number.isFinite(time) ? text : "";
}

const allowedInvoiceTypes = new Set([
  "purchase",
  "warranty_extension",
  "repair",
  "accessory",
  "other",
]);

function invoiceTypeLabel(type: unknown) {
  const value = safeString(type, 40) || "purchase";
  if (value === "warranty_extension") return "Extension garantie";
  if (value === "repair") return "Reparation";
  if (value === "accessory") return "Accessoire";
  if (value === "other") return "Autre facture";
  return "Facture achat";
}

function invoiceSummary(invoice: Json) {
  return [
    invoiceTypeLabel(invoice.invoice_type),

    safeString(invoice.supplier),

    safeString(invoice.invoice_number)
      ? `#${safeString(invoice.invoice_number)}`
      : "",

    safeString(invoice.purchase_price)
      ? `${safeString(invoice.purchase_price)} ${
        safeString(invoice.currency) || "EUR"
      }`
      : "",

    safeString(invoice.warranty_end_date)
      ? `fin garantie ${safeString(invoice.warranty_end_date)}`
      : "",

    safeString(invoice.invoice_date),
  ].filter(Boolean).join(" - ") || "Facture";
}

async function syncLatestInvoiceValuation(deviceId: string) {
  const { data: invoice, error: invoiceError } = await supabase
    .from("device_invoices")
    .select(
      "id,invoice_type,invoice_date,purchase_price,currency,supplier,invoice_number",
    )
    .eq("device_id", deviceId)
    .eq("invoice_type", "purchase")
    .not("purchase_price", "is", null)
    .order("invoice_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (invoiceError) throw invoiceError;

  const purchasePrice = safeNumber(invoice?.purchase_price);

  if (!invoice || purchasePrice === null || purchasePrice <= 0) return;

  const invoiceYear = safeString(invoice.invoice_date)
    ? new Date(`${safeString(invoice.invoice_date)}T00:00:00Z`).getUTCFullYear()
    : new Date().getUTCFullYear();

  const age = Math.max(0, new Date().getUTCFullYear() - invoiceYear);

  const { data: existing, error: existingError } = await supabase
    .from("hardware_enrichment")
    .select(
      "raw_data,valuation_reasons,notes,confidence_score,price_confidence_score",
    )
    .eq("device_id", deviceId)
    .maybeSingle();

  if (existingError) throw existingError;

  const existingReasons = Array.isArray(existing?.valuation_reasons)
    ? existing?.valuation_reasons
    : [];

  const valuationReasons = [
    "method:invoice_backed",

    "confidence:A",

    `invoice:${safeString(invoice.id)}`,

    `purchase_price:${purchasePrice}`,

    ...existingReasons.filter((reason) =>
      !String(reason).startsWith("method:") &&
      !String(reason).startsWith("confidence:") &&
      !String(reason).startsWith("invoice:") &&
      !String(reason).startsWith("purchase_price:")
    ),
  ];

  const rawData = existing?.raw_data && typeof existing.raw_data === "object" &&
      !Array.isArray(existing.raw_data)
    ? (existing.raw_data as Json)
    : {};

  const note =
    "Actual purchase price backed by invoice. Book value uses a 4-year straight-line depreciation model. Launch/MSRP price is kept separate.";
  const existingNotes = safeString(existing?.notes, 1000);

  const values: Json = {
    device_id: deviceId,

    book_value: bookValueEstimate(purchasePrice, age),

    valuation_method: "invoice_backed",

    valuation_confidence_label: "A",

    valuation_reasons: valuationReasons,

    confidence_score: 100,

    price_confidence_score: 100,

    enrichment_status: "completed",

    enrichment_source: "invoice",

    notes: existingNotes.includes(note)
      ? existingNotes
      : (existingNotes ? `${existingNotes} ${note}` : note),

    last_enriched_at: new Date().toISOString(),

    raw_data: {
      ...rawData,

      invoice: {
        id: safeString(invoice.id),

        invoice_date: safeString(invoice.invoice_date),

        purchase_price: purchasePrice,

        currency: safeString(invoice.currency) || "EUR",

        supplier: safeString(invoice.supplier),

        invoice_number: safeString(invoice.invoice_number),
      },
    },
  };

  const { error } = await supabase.from("hardware_enrichment").upsert(values, {
    onConflict: "device_id",
  });

  if (error) throw error;
}

async function updateOpenAssignmentPeriodContext(
  deviceId: string,
  teamId: string | null,
  establishmentId: string | null,
  reason = "",
) {
  const [{ data: team, error: teamError }, { data: site, error: siteError }] =
    await Promise.all([
      teamId
        ? supabase.from("teams").select("name").eq("id", teamId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),

      establishmentId
        ? supabase.from("establishments").select("name").eq(
          "id",
          establishmentId,
        ).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

  if (teamError) throw teamError;

  if (siteError) throw siteError;

  const { error } = await supabase
    .from("device_assignment_periods")
    .update({
      team_id: teamId,

      team_name: safeString(team?.name) || null,

      establishment_id: establishmentId,

      establishment_name: safeString(site?.name) || null,

      ...(reason ? { reason } : {}),
    })
    .eq("device_id", deviceId)
    .is("ended_at", null);

  if (error) throw error;
}

function sanitizeInvoiceFileName(name: string) {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 160);
  return cleaned || "invoice-file";
}

function decodeBase64File(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return new Uint8Array();
  const base64 = raw.includes(",") ? raw.split(",").pop() || "" : raw;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function createSignedInvoiceUrl(path: unknown) {
  const filePath = safeString(path, 2000);
  if (!filePath) return "";
  const { data, error } = await supabase.storage.from(invoiceStorageBucket)
    .createSignedUrl(filePath, 60 * 60);
  if (error) return "";
  return data?.signedUrl || "";
}

async function signInvoiceRows(invoices: Json[] = []) {
  return await Promise.all((invoices ?? []).map(async (invoice) => ({
    ...invoice,
    file_url: safeString(invoice.file_path, 2000)
      ? await createSignedInvoiceUrl(invoice.file_path)
      : invoice.file_url,
  })));
}

async function uploadInvoiceFile(deviceId: string, body: Json) {
  if (!body.fileDataBase64) return {};
  const bytes = decodeBase64File(body.fileDataBase64);
  const declaredSize = safeNumber(body.fileSizeBytes ?? body.file_size_bytes);
  if (!bytes.length) return {};
  if (
    bytes.byteLength > maxInvoiceFileBytes ||
    (declaredSize !== null && declaredSize > maxInvoiceFileBytes)
  ) {
    throw new Error("Fichier facture trop volumineux. Maximum 10 Mo.");
  }
  const mimeType = safeString(body.fileMimeType ?? body.file_mime_type, 120) ||
    "application/octet-stream";
  if (!allowedInvoiceMimeTypes.has(mimeType)) {
    throw new Error(
      "Format de facture non autorise. Utilisez PDF, PNG, JPG, WEBP ou HEIC.",
    );
  }
  const fileName = sanitizeInvoiceFileName(
    safeString(body.fileName ?? body.file_name, 255),
  );
  const filePath = `${deviceId}/${crypto.randomUUID()}-${fileName}`;
  const { error } = await supabase.storage.from(invoiceStorageBucket).upload(
    filePath,
    bytes,
    {
      contentType: mimeType,
      upsert: false,
    },
  );
  if (error) throw error;
  return {
    file_name: fileName,
    file_path: filePath,
    file_mime_type: mimeType,
    file_size_bytes: bytes.byteLength,
  };
}

async function handleAdminDeviceInvoice(request: Request, id: string) {
  const auth = await requireAction(request, "DEVICE_EDIT");

  if (auth.response) return auth.response;

  if (!(await recordExists("devices", id))) {
    return badRequest(request, "Machine introuvable.", 404);
  }

  const body = await request.json().catch(() => ({}));

  const invoiceType = safeString(body.invoiceType ?? body.invoice_type, 40) ||
    "purchase";

  if (!allowedInvoiceTypes.has(invoiceType)) {
    return badRequest(request, "Type de facture invalide.");
  }

  const invoiceDate = invoiceDateValue(body.invoiceDate ?? body.invoice_date);

  if (invoiceDate === "") {
    return badRequest(
      request,
      "Date de facture invalide. Format attendu: YYYY-MM-DD.",
    );
  }

  const warrantyStartDate = invoiceDateValue(
    body.warrantyStartDate ?? body.warranty_start_date,
  );

  if (warrantyStartDate === "") {
    return badRequest(
      request,
      "Date de debut de garantie invalide. Format attendu: YYYY-MM-DD.",
    );
  }

  const warrantyEndDate = invoiceDateValue(
    body.warrantyEndDate ?? body.warranty_end_date,
  );

  if (warrantyEndDate === "") {
    return badRequest(
      request,
      "Date de fin de garantie invalide. Format attendu: YYYY-MM-DD.",
    );
  }

  if (
    warrantyStartDate && warrantyEndDate && warrantyEndDate < warrantyStartDate
  ) {
    return badRequest(
      request,
      "La fin de garantie doit etre posterieure au debut.",
    );
  }

  const warrantyDurationMonths = safeNumber(
    body.warrantyDurationMonths ?? body.warranty_duration_months,
  );

  if (
    warrantyDurationMonths !== null &&
    (!Number.isInteger(warrantyDurationMonths) || warrantyDurationMonths < 0)
  ) {
    return badRequest(request, "Duree de garantie invalide.");
  }

  const purchasePrice = safeNumber(body.purchasePrice ?? body.purchase_price);

  if (purchasePrice !== null && purchasePrice < 0) {
    return badRequest(request, "Montant de facture invalide.");
  }

  const currency = (safeString(body.currency, 3) || "EUR").toUpperCase();

  if (!/^[A-Z]{3}$/.test(currency)) {
    return badRequest(request, "Devise invalide.");
  }

  const fileUrl = safeString(body.fileUrl ?? body.file_url, 2000);

  if (fileUrl && !/^https?:\/\//i.test(fileUrl)) {
    return badRequest(
      request,
      "Lien facture invalide. Utilisez une URL http ou https.",
    );
  }

  let uploadedFile: Json = {};
  try {
    uploadedFile = await uploadInvoiceFile(id, body);
  } catch (error) {
    return badRequest(
      request,
      error instanceof Error ? error.message : "Upload de facture impossible.",
      400,
    );
  }

  const values: Json = {
    device_id: id,

    invoice_type: invoiceType,

    invoice_number:
      safeString(body.invoiceNumber ?? body.invoice_number, 120) || null,

    supplier: safeString(body.supplier, 160) || null,

    invoice_date: invoiceDate,

    purchase_price: purchasePrice,

    currency,

    warranty_start_date: warrantyStartDate,

    warranty_end_date: warrantyEndDate,

    warranty_provider:
      safeString(body.warrantyProvider ?? body.warranty_provider, 160) || null,

    warranty_duration_months: warrantyDurationMonths,

    file_name: uploadedFile.file_name ||
      safeString(body.fileName ?? body.file_name, 255) || null,

    file_url: fileUrl || null,

    file_path: uploadedFile.file_path || null,

    file_mime_type: uploadedFile.file_mime_type || null,

    file_size_bytes: uploadedFile.file_size_bytes || null,

    notes: safeString(body.notes, 1000) || null,

    created_by: auth.session?.username || "admin",
  };

  if (
    !values.invoice_number && !values.supplier && !values.invoice_date &&
    purchasePrice === null && !values.warranty_provider &&
    !values.warranty_start_date && !values.warranty_end_date &&
    warrantyDurationMonths === null && !values.file_url && !values.file_path &&
    !values.notes
  ) {
    return badRequest(
      request,
      "Renseignez au moins une information de facture.",
    );
  }

  const { data, error } = await supabase.from("device_invoices").insert(values)
    .select("*").single();

  if (error) throw error;

  await syncLatestInvoiceValuation(id);

  await appendDeviceHistory([{
    device_id: id,

    event_type: "INVOICE_ADDED",

    field_name: "invoice",

    old_value: null,

    new_value: invoiceSummary(data),

    changed_by: auth.session?.username || "admin",

    source: "MANUAL_ADMIN",

    notes: safeString(values.notes),

    changed_at: new Date().toISOString(),
  }]);

  await audit("device_invoice_added", "device", id, {
    invoice_id: data.id,
    invoice_type: invoiceType,
    purchase_price: purchasePrice,
    currency,
  });

  const signedInvoice = (await signInvoiceRows([data]))[0];

  return json(request, { invoice: signedInvoice });
}

async function handleAdminDeleteDeviceInvoice(
  request: Request,
  deviceId: string,
  invoiceId: string,
) {
  const auth = await requireAction(request, "DEVICE_EDIT");

  if (auth.response) return auth.response;

  const { data: invoice, error: readError } = await supabase
    .from("device_invoices")
    .select("*")
    .eq("id", invoiceId)
    .eq("device_id", deviceId)
    .maybeSingle();

  if (readError) throw readError;

  if (!invoice) return badRequest(request, "Facture introuvable.", 404);

  const { error } = await supabase.from("device_invoices").delete().eq(
    "id",
    invoiceId,
  ).eq("device_id", deviceId);

  if (error) throw error;

  if (invoice.file_path) {
    await supabase.storage.from(invoiceStorageBucket).remove([
      safeString(invoice.file_path, 2000),
    ]);
  }

  await syncLatestInvoiceValuation(deviceId);

  await appendDeviceHistory([{
    device_id: deviceId,

    event_type: "INVOICE_DELETED",

    field_name: "invoice",

    old_value: invoiceSummary(invoice),

    new_value: null,

    changed_by: auth.session?.username || "admin",

    source: "MANUAL_ADMIN",

    notes: "Invoice metadata removed.",

    changed_at: new Date().toISOString(),
  }]);

  await audit("device_invoice_deleted", "device", deviceId, {
    invoice_id: invoiceId,
  });

  return json(request, { ok: true });
}

async function handleAdminDeviceStatus(request: Request, id: string) {
  const auth = await requireAction(request, "DEVICE_EDIT");
  if (auth.response) return auth.response;
  const body = await request.json().catch(() => ({}));
  const status = safeString(body.status, 40);
  const note = safeString(body.note, 2000);
  const allowed = ["active", "replace", "stock", "lost", "retired"];
  if (!allowed.includes(status)) return badRequest(request, "Statut invalide.");
  if (status === "retired" && !note) {
    return badRequest(request, "Note de sortie du parc requise.");
  }
  const { data: previous, error: previousError } = await supabase
    .from("devices")
    .select("status,assigned_user_id,team_id,establishment_id,hostname")
    .eq("id", id)
    .single();
  if (previousError) throw previousError;
  const values: Json = { status };
  if (status === "retired" || status === "stock") {
    values.assigned_user_id = null;
    values.team_id = null;
  }
  const { data: device, error } = await supabase.from("devices").update(values)
    .eq("id", id).select("id,status").single();
  if (error) throw error;
  const changedAt = new Date().toISOString();
  if (previous.status !== status) {
    const eventType = status === "retired"
      ? "DEVICE_RETIRED"
      : previous.status === "retired"
      ? "DEVICE_REACTIVATED"
      : "STATUS_CHANGED";
    await appendDeviceHistory([{
      device_id: id,
      event_type: eventType,
      field_name: "status",
      old_value: previous.status,
      new_value: status,
      changed_by: auth.session?.username || "admin",
      source: "MANUAL_ADMIN",
      notes: note || null,
      changed_at: changedAt,
      related_user_id: safeString(previous.assigned_user_id) || null,
      related_team_id: safeString(previous.team_id) || null,
      related_establishment_id: safeString(previous.establishment_id) || null,
    }]);
    if (status === "retired" || status === "stock") {
      await closeOpenAssignmentPeriod(
        id,
        changedAt,
        auth.session?.username || "admin",
        note ||
          (status === "stock" ? "Device moved to stock." : "Device retired."),
      );
      if (previous.assigned_user_id) {
        await appendDeviceHistory([{
          device_id: id,
          event_type: "USER_REMOVED",
          field_name: "assigned_user_id",
          old_value: historyValue(previous.assigned_user_id),
          new_value: null,
          changed_by: auth.session?.username || "admin",
          source: "MANUAL_ADMIN",
          notes: note || (status === "stock" ? "Moved to stock." : null),
          changed_at: changedAt,
          related_user_id: safeString(previous.assigned_user_id),
          related_team_id: safeString(previous.team_id) || null,
          related_establishment_id: safeString(previous.establishment_id) ||
            null,
        }]);
      }
    }
    if (status === "retired") {
      await notify(
        "DEVICE_RETIRED",
        "notification.deviceRetired.title",
        "notification.deviceRetired.message",
        {
          severity: "WARNING",
          targetRole: "ADMIN",
          relatedEntityType: "device",
          relatedEntityId: id,
        },
      );
    } else if (previous.status === "retired") {
      await notify(
        "DEVICE_REACTIVATED",
        "notification.deviceReactivated.title",
        "notification.deviceReactivated.message",
        {
          severity: "SUCCESS",
          targetRole: "ADMIN",
          relatedEntityType: "device",
          relatedEntityId: id,
        },
      );
    }
  }
  await audit("device_status_updated", "device", id, {
    status,
    note: note || null,
  });
  return json(request, { device });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(request) });
  }
  const envError = requireEnv(request);
  if (envError) return envError;

  const url = new URL(request.url);
  const path = url.pathname.replace(/\/inventory-api$/, "") || url.pathname;

  try {
    if (request.method === "POST" && path.endsWith("/auth/admin")) {
      return await handleAdminLogin(request);
    }
    if (
      request.method === "GET" && path.endsWith("/organization") &&
      !path.includes("/admin/")
    ) {
      return await handlePublicOrganization(request);
    }
    if (
      request.method === "POST" &&
      path.endsWith("/collect/access-token/validate")
    ) return await handleValidateCollectionAccessToken(request);
    if (request.method === "POST" && path.endsWith("/collect/prefill")) {
      return await handleCreateCollectionPrefill(request);
    }
    const prefillMatch = path.match(/\/collect\/prefill\/([A-Za-z0-9_-]+)$/);
    if (request.method === "GET" && prefillMatch) {
      return await handleGetCollectionPrefill(request, prefillMatch[1]);
    }
    const invitePrefillMatch = path.match(
      /\/collect\/invite\/([A-Za-z0-9_-]+)\/prefill$/,
    );
    if (request.method === "POST" && invitePrefillMatch) {
      return await handleCreateInvitePrefill(request, invitePrefillMatch[1]);
    }
    const inviteMatch = path.match(/\/collect\/invite\/([A-Za-z0-9_-]+)$/);
    if (request.method === "GET" && inviteMatch) {
      return await handleGetCollectionInvite(request, inviteMatch[1]);
    }
    if (request.method === "POST" && path.endsWith("/collect/profile")) {
      return await handleProfile(request);
    }
    if (request.method === "POST" && path.endsWith("/collect/scan")) {
      return await handleScan(request);
    }
    if (request.method === "POST" && path.endsWith("/collect/legacy-scan")) {
      return await handleLegacyScan(request);
    }
    if (request.method === "GET" && path.endsWith("/admin/devices")) {
      return await handleAdminDevices(request);
    }
    if (
      request.method === "POST" && path.endsWith("/admin/legacy-history/import")
    ) return await handleAdminImportLegacyHistory(request);
    if (request.method === "GET" && path.endsWith("/admin/organization")) {
      return await handleAdminOrganization(request);
    }
    if (request.method === "GET" && path.endsWith("/admin/users")) {
      return await handleAdminListUsers(request);
    }
    if (request.method === "POST" && path.endsWith("/admin/users")) {
      return await handleAdminSaveUser(request);
    }
    const adminUserMatch = path.match(/\/admin\/users\/([0-9a-f-]+)$/i);
    if (request.method === "POST" && adminUserMatch) {
      return await handleAdminSaveUser(request, adminUserMatch[1]);
    }
    if (request.method === "DELETE" && adminUserMatch) {
      return await handleAdminDeleteUser(request, adminUserMatch[1]);
    }
    if (request.method === "GET" && path.endsWith("/admin/notifications")) {
      return await handleAdminListNotifications(request);
    }
    if (
      request.method === "POST" &&
      path.endsWith("/admin/notifications/read-all")
    ) return await handleAdminMarkNotification(request);
    const notificationReadMatch = path.match(
      /\/admin\/notifications\/([0-9a-f-]+)\/read$/i,
    );
    if (request.method === "POST" && notificationReadMatch) {
      return await handleAdminMarkNotification(
        request,
        notificationReadMatch[1],
      );
    }
    if (request.method === "GET" && path.endsWith("/admin/pending-changes")) {
      return await handleAdminPendingChanges(request);
    }
    const pendingChangeMatch = path.match(
      /\/admin\/pending-changes\/([0-9a-f-]+)\/decision$/i,
    );
    if (request.method === "POST" && pendingChangeMatch) {
      return await handleAdminDecidePendingChange(
        request,
        pendingChangeMatch[1],
      );
    }
    if (
      request.method === "POST" && path.endsWith("/admin/organization/reassign")
    ) return await handleAdminBulkReassign(request);
    if (
      request.method === "POST" && path.endsWith("/admin/organization/reorder")
    ) return await handleAdminReorderOrganization(request);
    if (
      request.method === "GET" && path.endsWith("/admin/address/autocomplete")
    ) return await handleAdminAddressAutocomplete(request);
    if (request.method === "GET" && path.endsWith("/admin/address/details")) {
      return await handleAdminAddressDetails(request);
    }
    if (request.method === "POST" && path.endsWith("/admin/teams")) {
      return await handleAdminSaveTeam(request);
    }
    const teamMatch = path.match(/\/admin\/teams\/([0-9a-f-]+)$/i);
    if (request.method === "POST" && teamMatch) {
      return await handleAdminSaveTeam(request, teamMatch[1]);
    }
    if (request.method === "DELETE" && teamMatch) {
      return await handleAdminDeleteTeam(request, teamMatch[1]);
    }
    if (request.method === "POST" && path.endsWith("/admin/establishments")) {
      return await handleAdminSaveEstablishment(request);
    }
    const establishmentMatch = path.match(
      /\/admin\/establishments\/([0-9a-f-]+)$/i,
    );
    if (request.method === "POST" && establishmentMatch) {
      return await handleAdminSaveEstablishment(request, establishmentMatch[1]);
    }
    if (request.method === "DELETE" && establishmentMatch) {
      return await handleAdminDeleteEstablishment(
        request,
        establishmentMatch[1],
      );
    }
    if (
      request.method === "GET" && path.endsWith("/admin/enrichment-jobs/active")
    ) return await handleActiveEnrichmentJob(request);
    if (request.method === "POST" && path.endsWith("/admin/enrichment-jobs")) {
      return await handleStartEnrichmentJob(request);
    }
    if (
      request.method === "POST" &&
      path.endsWith("/admin/enrichment-jobs/process")
    ) return await handleProcessEnrichmentJob(request);
    if (request.method === "POST" && path.endsWith("/admin/enrich")) {
      return await handleAdminEnrich(request);
    }
    if (request.method === "GET" && path.endsWith("/admin/cpu-benchmarks")) {
      return await handleAdminCpuBenchmarkStats(request);
    }
    if (
      request.method === "POST" && path.endsWith("/admin/cpu-benchmarks/sync")
    ) return await handleAdminSyncCpuBenchmarks(request);
    if (
      request.method === "POST" && path.endsWith("/admin/cpu-benchmarks/import")
    ) return await handleAdminImportCpuBenchmarks(request);
    if (
      request.method === "POST" &&
      path.endsWith("/admin/cpu-benchmarks/refresh-release-dates")
    ) return await handleAdminRefreshCpuReleaseDates(request);
    if (
      request.method === "POST" &&
      path.endsWith("/admin/cpu-releases/sync")
    ) return await handleCpuReleaseSync(request);
    if (
      request.method === "GET" &&
      path.endsWith("/admin/cpu-releases/status")
    ) return await handleCpuReleaseStatus(request);
    if (request.method === "GET" && path.endsWith("/admin/access-tokens")) {
      return await handleAdminListAccessTokens(request);
    }
    if (request.method === "POST" && path.endsWith("/admin/access-tokens")) {
      return await handleAdminCreateAccessToken(request);
    }
    if (
      request.method === "GET" && path.endsWith("/admin/collection-invites")
    ) return await handleAdminListCollectionInvites(request);
    if (
      request.method === "POST" && path.endsWith("/admin/collection-invites")
    ) return await handleAdminCreateCollectionInvite(request);
    const revokeInviteMatch = path.match(
      /\/admin\/collection-invites\/([0-9a-f-]+)\/revoke/i,
    );
    if (request.method === "POST" && revokeInviteMatch) {
      return await handleAdminRevokeCollectionInvite(
        request,
        revokeInviteMatch[1],
      );
    }
    const deleteInviteMatch = path.match(
      /\/admin\/collection-invites\/([0-9a-f-]+)$/i,
    );
    if (request.method === "DELETE" && deleteInviteMatch) {
      return await handleAdminDeleteCollectionInvite(
        request,
        deleteInviteMatch[1],
      );
    }
    const revokeTokenMatch = path.match(
      /\/admin\/access-tokens\/([0-9a-f-]+)\/revoke/i,
    );
    if (request.method === "POST" && revokeTokenMatch) {
      return await handleAdminRevokeAccessToken(request, revokeTokenMatch[1]);
    }
    const deleteTokenMatch = path.match(
      /\/admin\/access-tokens\/([0-9a-f-]+)$/i,
    );
    if (request.method === "DELETE" && deleteTokenMatch) {
      return await handleAdminDeleteAccessToken(request, deleteTokenMatch[1]);
    }
    const statusMatch = path.match(/\/admin\/devices\/([0-9a-f-]+)\/status/i);
    if (request.method === "POST" && statusMatch) {
      return await handleAdminDeviceStatus(request, statusMatch[1]);
    }
    const assignmentMatch = path.match(
      /\/admin\/devices\/([0-9a-f-]+)\/assignment/i,
    );
    if (request.method === "POST" && assignmentMatch) {
      return await handleAdminDeviceAssignment(request, assignmentMatch[1]);
    }
    const historyNoteMatch = path.match(
      /\/admin\/devices\/([0-9a-f-]+)\/history-note/i,
    );
    if (request.method === "POST" && historyNoteMatch) {
      return await handleAdminDeviceHistoryNote(request, historyNoteMatch[1]);
    }
    const invoiceMatch = path.match(
      /\/admin\/devices\/([0-9a-f-]+)\/invoices$/i,
    );
    if (request.method === "POST" && invoiceMatch) {
      return await handleAdminDeviceInvoice(request, invoiceMatch[1]);
    }

    const deleteInvoiceMatch = path.match(
      /\/admin\/devices\/([0-9a-f-]+)\/invoices\/([0-9a-f-]+)$/i,
    );
    if (request.method === "DELETE" && deleteInvoiceMatch) {
      return await handleAdminDeleteDeviceInvoice(
        request,
        deleteInvoiceMatch[1],
        deleteInvoiceMatch[2],
      );
    }

    const detailMatch = path.match(/\/admin\/devices\/([0-9a-f-]+)$/i);
    if (request.method === "DELETE" && detailMatch) {
      return await handleAdminDeleteDevice(request, detailMatch[1]);
    }

    if (request.method === "GET" && detailMatch) {
      return await handleAdminDeviceDetail(request, detailMatch[1]);
    }
    return badRequest(request, "Route inconnue.", 404);
  } catch (error) {
    console.error(error);
    return badRequest(request, "Erreur serveur.", 500);
  }
});
