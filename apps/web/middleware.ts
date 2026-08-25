import { NextResponse, type NextRequest } from "next/server";

/**
 * Content-Security-Policy needs a fresh nonce per request (so script-src
 * can be locked to 'self' plus exactly the inline scripts this app itself
 * renders, not 'unsafe-inline'), which next.config.ts's static headers()
 * can't produce — hence a separate middleware. Follows Next's own
 * documented nonce pattern: the nonce is threaded back to the request via
 * an x-nonce header so a Server Component (layout.tsx) can read it and
 * put it on the one inline <script> this app hand-writes; Next's own
 * framework-injected inline scripts (hydration/streaming payloads) pick up
 * the same nonce automatically because it's present in the CSP header.
 */
export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV !== "production";

  const csp = [
    "default-src 'self'",
    // 'wasm-unsafe-eval' is required to compile/instantiate the Stockfish
    // engine's WebAssembly module (packages/engine, public/engine/*.wasm).
    // 'unsafe-eval' is dev-only, for webpack's Fast Refresh.
    `script-src 'self' 'nonce-${nonce}' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""}`,
    // Inline style attributes/tags aren't nonce-friendly the way scripts
    // are (React's style prop, Next's own dev-mode CSS injection) and
    // carry far less exploit value than inline script — 'unsafe-inline'
    // here is a deliberate, narrow trade-off, not an oversight.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    // Skip static assets and image optimization requests — CSP is
    // meaningless on those responses and computing/threading a nonce for
    // them is pure overhead.
    "/((?!_next/static|_next/image|favicon.ico|pieces/|engine/).*)",
  ],
};
