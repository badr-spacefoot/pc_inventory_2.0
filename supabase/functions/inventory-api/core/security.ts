export class HttpInputError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export async function readBoundedBytes(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<Uint8Array> {
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel();
        throw new HttpInputError(
          "Request or response exceeds the size limit.",
          413,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

export function trustedHttpUrl(raw: string, hosts: readonly string[]): URL {
  const url = new URL(raw);
  if (
    url.protocol !== "https:" || url.username || url.password ||
    (url.port && url.port !== "443") ||
    !hosts.some((host) =>
      url.hostname === host || url.hostname.endsWith(`.${host}`)
    )
  ) throw new HttpInputError("External source is not an approved HTTPS host.");
  return url;
}

export async function fetchBoundedText(
  rawUrl: string,
  hosts: readonly string[],
  options: { headers?: HeadersInit; maxBytes?: number; timeoutMs?: number } =
    {},
): Promise<{ response: Response; body: string }> {
  const url = trustedHttpUrl(rawUrl, hosts);
  // Redirects are deliberately rejected: never make a second request before validation.
  const response = await fetch(url, {
    redirect: "manual",
    ...(options.headers ? { headers: options.headers } : {}),
    signal: AbortSignal.timeout(options.timeoutMs ?? 8000),
  });
  if (
    response.status >= 300 && response.status < 400 && response.status !== 304
  ) {
    await response.body?.cancel();
    throw new HttpInputError("External source redirects are not permitted.");
  }
  const bytes = await readBoundedBytes(
    response.body,
    options.maxBytes ?? 2_000_000,
  );
  return { response, body: new TextDecoder().decode(bytes) };
}

export function invoiceMimeMatches(bytes: Uint8Array, mime: string): boolean {
  const ascii = (start: number, end: number) =>
    String.fromCharCode(...bytes.slice(start, end));
  if (mime === "application/pdf") return ascii(0, 5) === "%PDF-";
  if (mime === "image/png") {
    return bytes.length >= 8 &&
      [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b);
  }
  if (mime === "image/jpeg") {
    return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  }
  if (mime === "image/webp") {
    return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
  }
  if (mime === "image/heic" || mime === "image/heif") {
    return ascii(4, 8) === "ftyp" &&
      ["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(ascii(8, 12));
  }
  return false;
}

export function sessionIsCurrent(
  session: { expires_at?: unknown; user_id?: unknown } | null,
  user: { id?: unknown; is_active?: unknown } | null,
  now = Date.now(),
): boolean {
  return Boolean(
    session && user && user.is_active === true &&
      session.user_id === user.id &&
      Number.isFinite(Date.parse(String(session.expires_at))) &&
      Date.parse(String(session.expires_at)) > now,
  );
}

export async function collectKeysetRows<T extends { id: string }>(
  fetchPage: (after: string) => Promise<T[]>,
): Promise<T[]> {
  const rows: T[] = [];
  let after = "";
  while (true) {
    const page = await fetchPage(after);
    if (!page.length) return rows;
    const last = page[page.length - 1]!.id;
    if (last <= after) throw new Error("Inventory pagination did not advance.");
    rows.push(...page);
    after = last;
  }
}

export function publicStorageSignedUrl(
  signedUrl: string,
  internalSupabaseUrl: string,
  publicSupabaseUrl: string,
): string {
  if (!signedUrl || !publicSupabaseUrl) return signedUrl;
  const external = new URL(publicSupabaseUrl);
  if (
    external.protocol !== "https:" || external.username || external.password ||
    external.pathname !== "/" || external.search || external.hash
  ) {
    throw new HttpInputError(
      "SUPABASE_PUBLIC_URL must be a bare HTTPS origin.",
      500,
    );
  }
  const signed = new URL(signedUrl);
  const internal = new URL(internalSupabaseUrl);
  if (
    (signed.origin !== internal.origin && signed.origin !== external.origin) ||
    !signed.pathname.startsWith("/storage/v1/object/sign/")
  ) {
    throw new HttpInputError("Unexpected signed Storage URL.", 500);
  }
  // Only the origin changes: object path and signed query are preserved verbatim by URL parsing.
  return `${external.origin}${signed.pathname}${signed.search}${signed.hash}`;
}
