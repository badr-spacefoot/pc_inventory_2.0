import type { Json } from "./types.ts";

export interface ResponseHelpers {
  corsHeaders(request: Request): Record<string, string>;
  json(request: Request, body: Json, status?: number): Response;
  badRequest(request: Request, message: string, status?: number): Response;
}

export function createResponseHelpers(
  allowedOrigins: readonly string[],
): ResponseHelpers {
  function corsHeaders(request: Request): Record<string, string> {
    const origin = request.headers.get("origin") ?? "";
    const allowOrigin =
      allowedOrigins.includes("*") || allowedOrigins.includes(origin)
        ? origin || "*"
        : (allowedOrigins[0] ?? "*");
    return {
      "Access-Control-Allow-Origin": allowOrigin,
      "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type, x-collection-access-token, x-cpu-benchmark-sync-token",
      "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
      Vary: "Origin",
    };
  }

  function json(request: Request, body: Json, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders(request), "Content-Type": "application/json" },
    });
  }

  function badRequest(
    request: Request,
    message: string,
    status = 400,
  ): Response {
    return json(request, { error: message }, status);
  }

  return { corsHeaders, json, badRequest };
}
