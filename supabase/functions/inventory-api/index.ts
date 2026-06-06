import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Json = Record<string, unknown>;

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const adminPassword = Deno.env.get("ADMIN_PASSWORD") ?? "";
const adminSessionSecret = Deno.env.get("ADMIN_SESSION_SECRET") ?? "";
const collectionAccessToken = Deno.env.get("COLLECTION_ACCESS_TOKEN") ?? "";
const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? "*").split(",").map((origin) => origin.trim());
const ebayBrowseApiToken = Deno.env.get("EBAY_BROWSE_API_TOKEN") ?? "";
const keepaApiKey = Deno.env.get("KEEPA_API_KEY") ?? "";
const enrichmentCacheDays = Number(Deno.env.get("ENRICHMENT_CACHE_DAYS") ?? 30);

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") ?? "";
  const allowOrigin = allowedOrigins.includes("*") || allowedOrigins.includes(origin) ? origin || "*" : allowedOrigins[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-collection-access-token",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Vary": "Origin",
  };
}

function json(request: Request, body: Json, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json" },
  });
}

function badRequest(request: Request, message: string, status = 400) {
  return json(request, { error: message }, status);
}

function requireEnv(request: Request) {
  const missing = [
    ["SUPABASE_URL", supabaseUrl],
    ["SUPABASE_SERVICE_ROLE_KEY", serviceRoleKey],
    ["ADMIN_PASSWORD", adminPassword],
    ["ADMIN_SESSION_SECRET", adminSessionSecret],
    ["COLLECTION_ACCESS_TOKEN", collectionAccessToken],
  ].filter(([, value]) => !value);
  if (missing.length > 0) {
    return badRequest(request, `Variables serveur manquantes: ${missing.map(([key]) => key).join(", ")}`, 500);
  }
  return null;
}

function safeString(value: unknown, max = 255) {
  if (value === null || value === undefined) return "";
  return String(value).trim().slice(0, max);
}

function safeNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function firstPresent(body: Json, ...keys: string[]) {
  for (const key of keys) {
    const value = safeString(body[key]);
    if (value) return value;
  }
  return "";
}

function titleCase(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\b\p{L}/gu, (char) => char.toUpperCase());
}

function parseGigabytes(value: unknown) {
  if (typeof value === "number") return value;
  const text = safeString(value).replace(",", ".");
  const match = text.match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

function normalizeMac(value: unknown) {
  const mac = safeString(value, 160).replaceAll(":", "-").toUpperCase();
  return mac || null;
}

function normalizeScanPayload(body: Json): Json {
  return {
    hostname: firstPresent(body, "hostname", "pcName"),
    osName: firstPresent(body, "osName", "osType"),
    osVersion: firstPresent(body, "osVersion", "os"),
    manufacturer: firstPresent(body, "manufacturer"),
    model: firstPresent(body, "model"),
    serialNumber: firstPresent(body, "serialNumber", "serial"),
    cpu: firstPresent(body, "cpu"),
    ramTotalGb: safeNumber(body.ramTotalGb) ?? parseGigabytes(body.ram),
    storageTotalGb: safeNumber(body.storageTotalGb),
    storageFreeGb: safeNumber(body.storageFreeGb),
    macAddress: normalizeMac(body.macAddress ?? body.mac),
    localIp: firstPresent(body, "localIp", "ip"),
    windowsUser: firstPresent(body, "windowsUser", "user"),
    collectedAt: firstPresent(body, "collectedAt", "timestamp") || new Date().toISOString(),
    scriptVersion: firstPresent(body, "scriptVersion"),
  };
}

async function sha256(input: string) {
  const bytes = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmac(input: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(adminSessionSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input));
  return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function createAdminToken() {
  const payload = btoa(JSON.stringify({ role: "admin", exp: Date.now() + 12 * 60 * 60 * 1000 }));
  return `${payload}.${await hmac(payload)}`;
}

async function isAdmin(request: Request) {
  try {
    const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const [payload, signature] = token.split(".");
    if (!payload || !signature) return false;
    if ((await hmac(payload)) !== signature) return false;
    const parsed = JSON.parse(atob(payload));
    return parsed.role === "admin" && Number(parsed.exp) > Date.now();
  } catch {
    return false;
  }
}

async function getOrCreateByName(table: "teams" | "establishments", name: string) {
  const cleanName = safeString(name, 120);
  const { data: existing } = await supabase.from(table).select("id").ilike("name", cleanName).maybeSingle();
  if (existing?.id) return existing.id;
  const { data, error } = await supabase.from(table).insert({ name: cleanName }).select("id").single();
  if (error) throw error;
  return data.id;
}

async function audit(action: string, entityType: string, entityId: string | null, details: Json = {}) {
  await supabase.from("audit_logs").insert({ action, entity_type: entityType, entity_id: entityId, details });
}

async function consumeCollectionAccessToken(token: string) {
  if (!token) return null;
  if (token === collectionAccessToken) return "legacy-static-token";
  const tokenHash = await sha256(token);
  const { data, error } = await supabase.rpc("consume_collection_access_token", { p_token_hash: tokenHash });
  if (error) throw error;
  return safeString(data);
}

async function upsertUserProfile(body: Json) {
  const teamId = await getOrCreateByName("teams", firstPresent(body, "team"));
  const establishmentId = await getOrCreateByName("establishments", firstPresent(body, "establishment", "site"));
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
        service: firstPresent(body, "service") || "Non renseigne",
        comment: firstPresent(body, "comment", "notes", "Notes").slice(0, 1000),
      },
      { onConflict: "email" },
    )
    .select("id,team_id,establishment_id")
    .single();

  if (userError) throw userError;
  return user;
}

async function handleAdminLogin(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (safeString(body.password, 500) !== adminPassword) return badRequest(request, "Mot de passe incorrect.", 401);
  return json(request, { token: await createAdminToken() });
}

async function handleProfile(request: Request) {
  const accessToken = request.headers.get("x-collection-access-token") ?? "";
  const body = await request.json().catch(() => ({}));
  const required = ["firstName", "lastName", "email", "team", "establishment", "service"];
  for (const field of required) {
    if (!safeString(body[field])) return badRequest(request, `Champ requis: ${field}`);
  }
  const accessTokenId = await consumeCollectionAccessToken(accessToken);
  if (!accessTokenId) return badRequest(request, "Token de collecte invalide, expire, revoque ou epuise.", 401);

  const email = safeString(body.email, 255).toLowerCase();
  const user = await upsertUserProfile(body);

  const token = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
  const tokenHash = await sha256(token);
  await supabase.from("collection_tokens").insert({
    user_id: user.id,
    token_hash: tokenHash,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });
  await audit("collection_profile_created", "user", user.id, { email, access_token_id: accessTokenId });
  return json(request, { collectionToken: token });
}

function dedupePayload(body: Json, userId: string) {
  const serial = safeString(body.serialNumber, 160);
  const hostname = safeString(body.hostname, 160);
  const mac = safeString(body.macAddress, 160);
  const model = safeString(body.model, 160);
  const establishmentId = safeString(body.establishmentId, 160);
  if (serial) return { dedupe_key: `serial:${serial.toLowerCase()}` };
  if (hostname && mac) return { dedupe_key: `host_mac:${hostname.toLowerCase()}:${mac.toLowerCase()}` };
  return { dedupe_key: `user_model_site:${userId}:${model.toLowerCase()}:${establishmentId}` };
}

function hardwareAgeScore(body: Json) {
  const ram = Number(body.ramTotalGb || 0);
  const free = Number(body.storageFreeGb || 0);
  const os = safeString(body.osVersion).toLowerCase();
  let score = 20;
  if (ram > 0 && ram < 8) score += 25;
  if (ram >= 8 && ram < 16) score += 10;
  if (free > 0 && free < 20) score += 20;
  if (os.includes("windows 10")) score += 20;
  if (os.includes("windows 7") || os.includes("windows 8")) score += 45;
  return Math.min(score, 100);
}

function inferCpuGeneration(cpuName: string) {
  const cpu = cpuName.toLowerCase();
  const intel = cpu.match(/i[3579]-?(\d{4,5})/i);
  if (intel) {
    const digits = intel[1];
    const generation = digits.length === 5 ? Number(digits.slice(0, 2)) : Number(digits.slice(0, 1));
    return `${generation}e gen Intel`;
  }
  const amd = cpu.match(/ryzen\s+[3579]\s+(\d{4})/i);
  if (amd) return `Ryzen ${amd[1][0]}000`;
  if (cpu.includes("core ultra")) return "Intel Core Ultra";
  return "";
}

function inferCpuReleaseYear(cpuName: string) {
  const cpu = cpuName.toLowerCase();
  const intel = cpu.match(/i[3579]-?(\d{4,5})/i);
  if (intel) {
    const digits = intel[1];
    const generation = digits.length === 5 ? Number(digits.slice(0, 2)) : Number(digits.slice(0, 1));
    const byGeneration: Record<number, number> = {
      2: 2011,
      3: 2012,
      4: 2013,
      5: 2015,
      6: 2015,
      7: 2016,
      8: 2017,
      9: 2018,
      10: 2019,
      11: 2020,
      12: 2021,
      13: 2022,
      14: 2023,
    };
    return byGeneration[generation] ?? null;
  }
  const amd = cpu.match(/ryzen\s+[3579]\s+(\d{4})/i);
  if (amd) {
    const family = Number(amd[1][0]);
    const byFamily: Record<number, number> = { 1: 2017, 2: 2018, 3: 2019, 4: 2020, 5: 2021, 6: 2022, 7: 2023, 8: 2024 };
    return byFamily[family] ?? null;
  }
  if (cpu.includes("core ultra")) return 2023;
  return null;
}

function estimateCpuScore(cpuName: string) {
  const cpu = cpuName.toLowerCase();
  const year = inferCpuReleaseYear(cpuName) ?? 2018;
  let score = 3500 + Math.max(0, year - 2016) * 1350;
  if (cpu.includes("celeron") || cpu.includes("pentium")) score *= 0.45;
  if (cpu.includes("i3") || cpu.includes("ryzen 3")) score *= 0.68;
  if (cpu.includes("i7") || cpu.includes("ryzen 7")) score *= 1.25;
  if (cpu.includes("i9") || cpu.includes("ryzen 9")) score *= 1.55;
  if (cpu.includes("u")) score *= 0.82;
  if (cpu.includes("h")) score *= 1.12;
  if (cpu.includes("ultra")) score *= 1.25;
  return Math.round(Math.max(1000, Math.min(score, 36000)));
}

function inferModelReleaseYear(model: string, cpuYear: number | null) {
  const text = model.toLowerCase();
  const explicitYear = text.match(/\b(20[1-2][0-9])\b/);
  if (explicitYear) return Number(explicitYear[1]);
  if (text.includes("5645") || text.includes("5640")) return 2024;
  if (text.includes("5435")) return 2023;
  if (text.includes("5515")) return 2021;
  if (text.includes("x1504") || text.includes("e1404")) return 2023;
  if (text.includes("x415")) return 2021;
  return cpuYear;
}

function estimateLaunchPrice(model: string, ramGb: number | null) {
  const text = model.toLowerCase();
  let price = 750;
  if (text.includes("inspiron 16")) price = 900;
  if (text.includes("vivobook")) price = 650;
  if (text.includes("aspire")) price = 700;
  if (text.includes("thinkpad") || text.includes("latitude")) price = 1100;
  if ((ramGb ?? 0) >= 16) price += 120;
  if ((ramGb ?? 0) >= 32) price += 260;
  return price;
}

function recommendationFor(cpuScore: number, obsolescenceIndex: number, marketAvg: number | null) {
  if (cpuScore < 6500 || obsolescenceIndex >= 75 || (marketAvg !== null && marketAvg < 180)) return "replace";
  if (cpuScore < 10000 || obsolescenceIndex >= 50 || (marketAvg !== null && marketAvg < 300)) return "watch";
  return "keep";
}

function priceStats(prices: number[]) {
  if (prices.length === 0) return { min: null, avg: null, max: null };
  const sorted = prices.slice().sort((a, b) => a - b);
  const total = sorted.reduce((sum, price) => sum + price, 0);
  return {
    min: sorted[0],
    avg: Math.round((total / sorted.length) * 100) / 100,
    max: sorted[sorted.length - 1],
  };
}

async function fetchEbayPrices(query: string) {
  if (!ebayBrowseApiToken) return [];
  const url = new URL("https://api.ebay.com/buy/browse/v1/item_summary/search");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "10");
  url.searchParams.set("filter", "buyingOptions:{FIXED_PRICE}");
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${ebayBrowseApiToken}`,
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_FR",
    },
  });
  if (!response.ok) return [];
  const data = await response.json();
  return (data.itemSummaries ?? []).map((item: Json) => ({
    source: "ebay",
    search_query: query,
    price: safeNumber((item.price as Json | undefined)?.value),
    currency: safeString((item.price as Json | undefined)?.currency, 8) || "EUR",
    condition: safeString(item.condition, 120),
    listing_url: safeString(item.itemWebUrl, 1000),
  })).filter((item: Json) => item.price);
}

async function fetchKeepaPricePlaceholder(_query: string) {
  if (!keepaApiKey) return [];
  return [];
}

async function enrichOneDevice(device: Json, force: boolean) {
  if (!force && device.last_enriched_at) {
    const ageMs = Date.now() - new Date(safeString(device.last_enriched_at)).getTime();
    if (ageMs < enrichmentCacheDays * 86400000) return { skipped: true, deviceId: device.id };
  }

  const cpuName = safeString(device.cpu || device.enrichment_cpu_name, 260);
  const model = safeString(device.model, 160);
  const manufacturer = safeString(device.manufacturer, 160);
  const cpuReleaseYear = inferCpuReleaseYear(cpuName);
  const cpuScore = estimateCpuScore(cpuName);
  const modelReleaseYear = inferModelReleaseYear(model, cpuReleaseYear);
  const launchPrice = estimateLaunchPrice(model, safeNumber(device.ram_total_gb));
  const query = [manufacturer, model, cpuName.split("@")[0]].filter(Boolean).join(" ");
  const marketRows = [...await fetchEbayPrices(query), ...await fetchKeepaPricePlaceholder(query)];
  const prices = marketRows.map((row: Json) => safeNumber(row.price)).filter((price): price is number => price !== null && price > 0);
  const newPrices = marketRows
    .filter((row: Json) => safeString(row.condition).toLowerCase().includes("new") || safeString(row.condition).toLowerCase().includes("neuf"))
    .map((row: Json) => safeNumber(row.price))
    .filter((price): price is number => price !== null && price > 0);
  const stats = priceStats(prices);
  const newStats = priceStats(newPrices);
  const currentYear = new Date().getFullYear();
  const age = modelReleaseYear ? Math.max(0, currentYear - modelReleaseYear) : 4;
  const performanceIndex = Math.max(0, Math.min(100, Math.round((cpuScore / 18000) * 100)));
  const obsolescenceIndex = Math.max(0, Math.min(100, Math.round(age * 12 + (100 - performanceIndex) * 0.45)));
  const recommendation = recommendationFor(cpuScore, obsolescenceIndex, stats.avg);
  const confidenceScore = Math.min(100, 35 + (cpuReleaseYear ? 15 : 0) + (modelReleaseYear ? 10 : 0) + Math.min(prices.length * 8, 40));
  const marketSource = marketRows.length ? [...new Set(marketRows.map((row: Json) => safeString(row.source)))].join(",") : "local-heuristic";

  const enrichment = {
    device_id: safeString(device.id),
    cpu_name: cpuName,
    cpu_score: cpuScore,
    cpu_generation: inferCpuGeneration(cpuName),
    cpu_release_year: cpuReleaseYear,
    model_release_year: modelReleaseYear,
    estimated_launch_price: launchPrice,
    current_new_price: newStats.avg,
    current_market_price_min: stats.min,
    current_market_price_avg: stats.avg,
    current_market_price_max: stats.max,
    market_source: marketSource,
    performance_index: performanceIndex,
    obsolescence_index: obsolescenceIndex,
    recommendation,
    confidence_score: confidenceScore,
    last_enriched_at: new Date().toISOString(),
    raw_data: {
      query,
      provider_counts: {
        ebay: marketRows.filter((row: Json) => row.source === "ebay").length,
        keepa: marketRows.filter((row: Json) => row.source === "keepa").length,
      },
    },
  };

  const { error } = await supabase.from("hardware_enrichment").upsert(enrichment, { onConflict: "device_id" });
  if (error) throw error;

  if (marketRows.length > 0) {
    const { error: historyError } = await supabase.from("market_price_history").insert(
      marketRows.map((row: Json) => ({ ...row, device_id: safeString(device.id), collected_at: new Date().toISOString() })),
    );
    if (historyError) throw historyError;
  }

  return { skipped: false, deviceId: device.id, recommendation };
}

async function persistScan(request: Request, user: { id: string; team_id: string; establishment_id: string }, rawBody: Json, tokenId?: string) {
  const body = normalizeScanPayload(rawBody);
  if (!safeString(body.hostname)) return badRequest(request, "hostname requis.");
  if (!safeString(body.model)) return badRequest(request, "model requis.");

  const dedupe = dedupePayload({ ...body, establishmentId: user.establishment_id }, user.id);
  const collectedAt = safeString(body.collectedAt) || new Date().toISOString();
  const { data: previousDevice } = await supabase.from("device_inventory_view").select("*").eq("dedupe_key", dedupe.dedupe_key).maybeSingle();
  const deviceValues = {
    assigned_user_id: user.id,
    team_id: user.team_id,
    establishment_id: user.establishment_id,
    hostname: safeString(body.hostname, 160),
    os_name: safeString(body.osName, 80),
    os_version: safeString(body.osVersion, 160),
    manufacturer: safeString(body.manufacturer, 160),
    model: safeString(body.model, 160),
    serial_number: safeString(body.serialNumber, 160) || null,
    cpu: safeString(body.cpu, 260),
    ram_total_gb: safeNumber(body.ramTotalGb),
    storage_total_gb: safeNumber(body.storageTotalGb),
    storage_free_gb: safeNumber(body.storageFreeGb),
    mac_address: normalizeMac(body.macAddress),
    local_ip: safeString(body.localIp, 80),
    windows_user: safeString(body.windowsUser, 160),
    script_version: safeString(body.scriptVersion, 40),
    last_seen_at: collectedAt,
    hardware_age_score: hardwareAgeScore(body),
    ...dedupe,
  };

  const { data: device, error: deviceError } = await supabase
    .from("devices")
    .upsert(deviceValues, { onConflict: "dedupe_key" })
    .select("id")
    .single();
  if (deviceError) throw deviceError;

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
    serial_number: deviceValues.serial_number,
    cpu: deviceValues.cpu,
    ram_total_gb: deviceValues.ram_total_gb,
    storage_total_gb: deviceValues.storage_total_gb,
    storage_free_gb: deviceValues.storage_free_gb,
    mac_address: deviceValues.mac_address,
    local_ip: deviceValues.local_ip,
    windows_user: deviceValues.windows_user,
    script_version: deviceValues.script_version,
    hardware_age_score: deviceValues.hardware_age_score,
  });
  if (scanError) throw scanError;

  if (tokenId) {
    await supabase.from("collection_tokens").update({ used_at: new Date().toISOString() }).eq("id", tokenId);
  }
  await audit(previousDevice ? "device_scan_updated" : "device_scan_created", "device", device.id, {
    hostname: deviceValues.hostname,
    dedupe_key: dedupe.dedupe_key,
    previous_first_name: previousDevice?.first_name ?? "",
    previous_last_name: previousDevice?.last_name ?? "",
    previous_team: previousDevice?.team_name ?? "",
    previous_establishment: previousDevice?.establishment_name ?? "",
  });
  return json(request, { ok: true, deviceId: device.id });
}

async function handleScan(request: Request) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return badRequest(request, "Token script manquant.", 401);

  const tokenHash = await sha256(token);
  const { data: tokenRow, error: tokenError } = await supabase
    .from("collection_tokens")
    .select("id,user_id,expires_at,used_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (tokenError) throw tokenError;
  if (!tokenRow || new Date(tokenRow.expires_at).getTime() < Date.now()) return badRequest(request, "Token script invalide ou expire.", 401);

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
    if (!safeString(body[field])) return badRequest(request, `Champ requis: ${field}`);
  }
  const accessTokenId = await consumeCollectionAccessToken(accessToken);
  if (!accessTokenId) return badRequest(request, "Token de collecte invalide, expire, revoque ou epuise.", 401);
  if (!safeString(body.email)) {
    body.email = `${safeString(body.firstName).toLowerCase()}.${safeString(body.lastName).toLowerCase()}@legacy.local`;
  }
  const user = await upsertUserProfile(body);
  return await persistScan(request, user, body);
}

async function handleAdminListAccessTokens(request: Request) {
  if (!(await isAdmin(request))) return badRequest(request, "Session admin invalide.", 401);
  const { data, error } = await supabase
    .from("collection_access_tokens")
    .select("id,label,token_prefix,expires_at,max_uses,use_count,last_used_at,revoked_at,created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return json(request, { tokens: data ?? [] });
}

async function handleAdminCreateAccessToken(request: Request) {
  if (!(await isAdmin(request))) return badRequest(request, "Session admin invalide.", 401);
  const body = await request.json().catch(() => ({}));
  const label = safeString(body.label, 120);
  const durationHours = Math.max(1, Math.min(Number(body.durationHours || 24), 8760));
  const requestedMaxUses = body.maxUses === null || body.maxUses === "" ? null : Number(body.maxUses);
  const maxUses = requestedMaxUses === null ? null : Math.max(1, Math.min(requestedMaxUses, 10000));
  if (!label) return badRequest(request, "Libelle requis.");
  if (!Number.isFinite(durationHours)) return badRequest(request, "Duree invalide.");
  if (requestedMaxUses !== null && !Number.isFinite(requestedMaxUses)) return badRequest(request, "Nombre d'utilisations invalide.");

  const rawToken = `sfit_${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
  const tokenHash = await sha256(rawToken);
  const expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString();
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
  await audit("collection_access_token_created", "collection_access_token", data.id, {
    label,
    expires_at: expiresAt,
    max_uses: maxUses,
  });
  return json(request, { token: rawToken, record: data }, 201);
}

async function handleAdminRevokeAccessToken(request: Request, id: string) {
  if (!(await isAdmin(request))) return badRequest(request, "Session admin invalide.", 401);
  const { data, error } = await supabase
    .from("collection_access_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .select("id,label,revoked_at")
    .single();
  if (error) throw error;
  await audit("collection_access_token_revoked", "collection_access_token", id, { label: data.label });
  return json(request, { token: data });
}

async function handleAdminDevices(request: Request) {
  if (!(await isAdmin(request))) return badRequest(request, "Session admin invalide.", 401);
  const { data, error } = await supabase.from("device_inventory_view").select("*").order("last_seen_at", { ascending: false });
  if (error) throw error;
  return json(request, { devices: data });
}

async function handleAdminOrganization(request: Request) {
  if (!(await isAdmin(request))) return badRequest(request, "Session admin invalide.", 401);
  const [{ data: teams, error: teamsError }, { data: establishments, error: establishmentsError }, { data: devices, error: devicesError }] =
    await Promise.all([
      supabase.from("teams").select("id,name,description,color,active,created_at").order("name"),
      supabase
        .from("establishments")
        .select("id,name,address,postal_code,city,country,latitude,longitude,active,created_at")
        .order("name"),
      supabase.from("devices").select("team_id,establishment_id"),
    ]);
  if (teamsError) throw teamsError;
  if (establishmentsError) throw establishmentsError;
  if (devicesError) throw devicesError;

  const teamCounts = new Map<string, number>();
  const establishmentCounts = new Map<string, number>();
  for (const device of devices ?? []) {
    if (device.team_id) teamCounts.set(device.team_id, (teamCounts.get(device.team_id) ?? 0) + 1);
    if (device.establishment_id) {
      establishmentCounts.set(device.establishment_id, (establishmentCounts.get(device.establishment_id) ?? 0) + 1);
    }
  }

  return json(request, {
    teams: (teams ?? []).map((team) => ({ ...team, device_count: teamCounts.get(team.id) ?? 0 })),
    establishments: (establishments ?? []).map((site) => ({
      ...site,
      device_count: establishmentCounts.get(site.id) ?? 0,
    })),
  });
}

async function handleAdminSaveTeam(request: Request, id?: string) {
  if (!(await isAdmin(request))) return badRequest(request, "Session admin invalide.", 401);
  const body = await request.json().catch(() => ({}));
  const name = safeString(body.name, 120);
  const color = safeString(body.color, 7) || "#16735f";
  if (!name) return badRequest(request, "Nom de l'equipe requis.");
  if (!/^#[0-9a-f]{6}$/i.test(color)) return badRequest(request, "Couleur invalide.");
  const values = {
    name,
    description: safeString(body.description, 500) || null,
    color,
    active: body.active !== false,
  };
  const query = id
    ? supabase.from("teams").update(values).eq("id", id)
    : supabase.from("teams").insert(values);
  const { data, error } = await query.select("id,name,description,color,active,created_at").single();
  if (error) {
    if (error.code === "23505") return badRequest(request, "Une equipe porte deja ce nom.", 409);
    throw error;
  }
  await audit(id ? "team_updated" : "team_created", "team", data.id, values);
  return json(request, { team: data }, id ? 200 : 201);
}

async function handleAdminSaveEstablishment(request: Request, id?: string) {
  if (!(await isAdmin(request))) return badRequest(request, "Session admin invalide.", 401);
  const body = await request.json().catch(() => ({}));
  const name = safeString(body.name, 120);
  const latitude = body.latitude === "" || body.latitude === null || body.latitude === undefined ? null : safeNumber(body.latitude);
  const longitude = body.longitude === "" || body.longitude === null || body.longitude === undefined ? null : safeNumber(body.longitude);
  if (!name) return badRequest(request, "Nom de l'etablissement requis.");
  if (latitude !== null && (latitude < -90 || latitude > 90)) return badRequest(request, "Latitude invalide.");
  if (longitude !== null && (longitude < -180 || longitude > 180)) return badRequest(request, "Longitude invalide.");
  const values = {
    name,
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
  const { data, error } = await query
    .select("id,name,address,postal_code,city,country,latitude,longitude,active,created_at")
    .single();
  if (error) {
    if (error.code === "23505") return badRequest(request, "Un etablissement porte deja ce nom.", 409);
    throw error;
  }
  await audit(id ? "establishment_updated" : "establishment_created", "establishment", data.id, values);
  return json(request, { establishment: data }, id ? 200 : 201);
}

async function handleAdminDeviceDetail(request: Request, id: string) {
  if (!(await isAdmin(request))) return badRequest(request, "Session admin invalide.", 401);
  const { data: device, error: deviceError } = await supabase.from("device_inventory_view").select("*").eq("id", id).single();
  if (deviceError) throw deviceError;
  const { data: scans, error: scansError } = await supabase
    .from("device_scans")
    .select("id,collected_at,os_name,os_version,script_version,payload")
    .eq("device_id", id)
    .order("collected_at", { ascending: false })
    .limit(20);
  if (scansError) throw scansError;
  const { data: priceHistory, error: priceHistoryError } = await supabase
    .from("market_price_history")
    .select("source,search_query,price,currency,condition,listing_url,collected_at")
    .eq("device_id", id)
    .order("collected_at", { ascending: false })
    .limit(20);
  if (priceHistoryError) throw priceHistoryError;
  return json(request, { device, scans, priceHistory });
}

async function handleAdminEnrich(request: Request) {
  if (!(await isAdmin(request))) return badRequest(request, "Session admin invalide.", 401);
  const body = await request.json().catch(() => ({}));
  const force = Boolean(body.force);
  const limit = Math.max(1, Math.min(Number(body.limit || 25), 100));
  const deviceId = safeString(body.deviceId);
  let query = supabase.from("device_inventory_view").select("*").order("last_enriched_at", { ascending: true, nullsFirst: true }).limit(limit);
  if (deviceId) query = query.eq("id", deviceId);
  const { data: devices, error } = await query;
  if (error) throw error;

  const results = [];
  for (const device of devices ?? []) {
    results.push(await enrichOneDevice(device, force));
  }
  const enriched = results.filter((result) => !result.skipped).length;
  const skipped = results.length - enriched;
  await audit("hardware_enrichment_run", "device", deviceId || null, { enriched, skipped, force, limit });
  return json(request, { ok: true, enriched, skipped, results });
}

async function handleAdminDeviceStatus(request: Request, id: string) {
  if (!(await isAdmin(request))) return badRequest(request, "Session admin invalide.", 401);
  const body = await request.json().catch(() => ({}));
  const status = safeString(body.status, 40);
  const allowed = ["active", "replace", "stock", "lost", "retired"];
  if (!allowed.includes(status)) return badRequest(request, "Statut invalide.");
  const { data: device, error } = await supabase.from("devices").update({ status }).eq("id", id).select("id,status").single();
  if (error) throw error;
  await audit("device_status_updated", "device", id, { status });
  return json(request, { device });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  const envError = requireEnv(request);
  if (envError) return envError;

  const url = new URL(request.url);
  const path = url.pathname.replace(/\/inventory-api$/, "") || url.pathname;

  try {
    if (request.method === "POST" && path.endsWith("/auth/admin")) return await handleAdminLogin(request);
    if (request.method === "POST" && path.endsWith("/collect/profile")) return await handleProfile(request);
    if (request.method === "POST" && path.endsWith("/collect/scan")) return await handleScan(request);
    if (request.method === "POST" && path.endsWith("/collect/legacy-scan")) return await handleLegacyScan(request);
    if (request.method === "GET" && path.endsWith("/admin/devices")) return await handleAdminDevices(request);
    if (request.method === "GET" && path.endsWith("/admin/organization")) return await handleAdminOrganization(request);
    if (request.method === "POST" && path.endsWith("/admin/teams")) return await handleAdminSaveTeam(request);
    const teamMatch = path.match(/\/admin\/teams\/([0-9a-f-]+)$/i);
    if (request.method === "POST" && teamMatch) return await handleAdminSaveTeam(request, teamMatch[1]);
    if (request.method === "POST" && path.endsWith("/admin/establishments")) return await handleAdminSaveEstablishment(request);
    const establishmentMatch = path.match(/\/admin\/establishments\/([0-9a-f-]+)$/i);
    if (request.method === "POST" && establishmentMatch) {
      return await handleAdminSaveEstablishment(request, establishmentMatch[1]);
    }
    if (request.method === "POST" && path.endsWith("/admin/enrich")) return await handleAdminEnrich(request);
    if (request.method === "GET" && path.endsWith("/admin/access-tokens")) return await handleAdminListAccessTokens(request);
    if (request.method === "POST" && path.endsWith("/admin/access-tokens")) return await handleAdminCreateAccessToken(request);
    const revokeTokenMatch = path.match(/\/admin\/access-tokens\/([0-9a-f-]+)\/revoke/i);
    if (request.method === "POST" && revokeTokenMatch) return await handleAdminRevokeAccessToken(request, revokeTokenMatch[1]);
    const statusMatch = path.match(/\/admin\/devices\/([0-9a-f-]+)\/status/i);
    if (request.method === "POST" && statusMatch) return await handleAdminDeviceStatus(request, statusMatch[1]);
    const detailMatch = path.match(/\/admin\/devices\/([0-9a-f-]+)/i);
    if (request.method === "GET" && detailMatch) return await handleAdminDeviceDetail(request, detailMatch[1]);
    return badRequest(request, "Route inconnue.", 404);
  } catch (error) {
    console.error(error);
    return badRequest(request, "Erreur serveur.", 500);
  }
});
