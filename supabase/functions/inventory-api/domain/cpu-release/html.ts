const entities: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

export function decodeHtml(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, entity: string) => {
    const key = entity.toLowerCase();
    if (key.startsWith("#x")) {
      return String.fromCodePoint(Number.parseInt(key.slice(2), 16));
    }
    if (key.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(key.slice(1), 10));
    }
    return entities[key] ?? `&${entity};`;
  });
}

export function htmlToText(html: string): string {
  return decodeHtml(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, "\n"),
  )
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

export function extractTitle(html: string): string | null {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return title ? decodeHtml(title).replace(/\s+/g, " ").trim() : null;
}

export function extractMetaContent(
  html: string,
  names: readonly string[],
): string | null {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const first = new RegExp(
      `<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "i",
    ).exec(html)?.[1];
    const reversed = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${escaped}["'][^>]*>`,
      "i",
    ).exec(html)?.[1];
    const value = first ?? reversed;
    if (value) return decodeHtml(value).trim();
  }
  return null;
}

export function extractLinks(
  html: string,
  baseUrl: string,
): Array<{ url: string; text: string }> {
  const links = [];
  for (
    const match of html.matchAll(
      /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    )
  ) {
    try {
      const url = new URL(decodeHtml(match[1] ?? ""), baseUrl).toString();
      const text = htmlToText(match[2] ?? "")
        .replace(/\s+/g, " ")
        .trim();
      links.push({ url, text });
    } catch {
      // Ignore malformed links from third-party page furniture.
    }
  }
  return links;
}

export function findLabelValue(
  html: string,
  labels: readonly RegExp[],
): string | null {
  const lines = htmlToText(html).split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const label = labels.find((pattern) => pattern.test(line));
    if (!label) continue;

    const inline = line
      .replace(label, "")
      .replace(/^\s*[:\-]\s*/, "")
      .trim();
    if (inline) return inline;
    for (let offset = 1; offset <= 3; offset += 1) {
      const candidate = lines[index + offset]?.trim();
      if (candidate) return candidate;
    }
  }
  return null;
}

export function textContainsIdentity(
  html: string,
  aliases: readonly string[],
): boolean {
  const compactText = htmlToText(html)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  return aliases.some((alias) => {
    const compactAlias = alias.toLowerCase().replace(/[^a-z0-9]+/g, "");
    return compactAlias.length >= 3 && compactText.includes(compactAlias);
  });
}
