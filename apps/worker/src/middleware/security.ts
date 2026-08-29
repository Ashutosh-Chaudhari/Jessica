import type { MiddlewareHandler } from "hono";
import type { App } from "../types.ts";

/**
 * Security response headers for everything this Worker serves.
 *
 * Cloudflare adds none of these for you. The app has authentication, a delete
 * button and microphone access, so their absence is not theoretical:
 *
 *  - frame-ancestors / X-Frame-Options stop the site being framed, which is
 *    what makes clickjacking a real risk on a page with "Delete my account".
 *  - Permissions-Policy denies the microphone to everyone except this origin,
 *    and denies camera, geolocation and payment outright - the app has no use
 *    for them, so nothing embedded should be able to ask.
 *  - CSP keeps script execution to same-origin files. It costs nothing here
 *    because the app has no inline scripts: the theme initialiser lives in
 *    /theme-init.js precisely so this can stay strict.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // Tailwind ships a static stylesheet, but Google Fonts serves CSS from its
  // own origin and React may set style attributes on elements it renders.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  // Supabase for auth and data; the API is same origin.
  "connect-src 'self' https://*.supabase.co",
  // MediaRecorder hands back blob: URLs for the captured audio.
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const HEADERS: Record<string, string> = {
  "content-security-policy": CSP,
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "microphone=(self), camera=(), geolocation=(), payment=(), usb=()",
  // Two years, subdomains included. Cloudflare terminates TLS, so this is safe
  // to assert; the site has never been served over plain HTTP.
  "strict-transport-security": "max-age=63072000; includeSubDomains",
};

export const securityHeaders: MiddlewareHandler<App> = async (c, next) => {
  await next();
  for (const [name, value] of Object.entries(HEADERS)) {
    c.header(name, value);
  }
};
