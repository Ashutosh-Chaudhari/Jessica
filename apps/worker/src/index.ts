import { Hono } from "hono";
import { cors } from "hono/cors";
import type { App } from "./types.ts";
import { requireUser } from "./middleware/auth.ts";
import { withContext } from "./middleware/context.ts";
import { securityHeaders } from "./middleware/security.ts";
import { challenges } from "./routes/challenges.ts";
import { user } from "./routes/user.ts";
import { fail } from "./utils/respond.ts";

const app = new Hono<App>();

/**
 * Plain HTTP reaches workers.dev, and an Authorization header sent that way
 * travels in cleartext. HSTS only protects a browser that has already been
 * here over HTTPS, so the first visit needs an actual redirect.
 *
 * 308 rather than 301: it preserves the method and body, so a POST that
 * arrives over HTTP is retried correctly instead of silently becoming a GET.
 */
app.use("*", async (c, next) => {
  const url = new URL(c.req.url);
  if (url.protocol === "http:") {
    url.protocol = "https:";
    return c.redirect(url.toString(), 308);
  }
  return next();
});

// Applies to everything this Worker returns. Static assets are covered by
// apps/web/public/_headers instead, because a _headers file does not apply to
// Worker-generated responses and routing every asset through the Worker would
// turn free asset serving into billed invocations.
app.use("*", securityHeaders);

/**
 * CORS is opt-in and exists only for split local development - `vite dev` on
 * :5173 talking to `wrangler dev` on :8787. In production the Worker serves
 * the frontend itself, so every request is same origin and needs no CORS at
 * all.
 *
 * Crucially it is OFF unless ALLOWED_ORIGIN is set. A deployed API that echoes
 * Access-Control-Allow-Origin for localhost would let anyone's dev server make
 * credentialed calls against real accounts.
 */
app.use("/api/*", async (c, next) => {
  const origin = c.env.ALLOWED_ORIGIN;
  if (!origin) return next();
  return cors({
    origin,
    allowHeaders: ["authorization", "content-type"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    maxAge: 86400,
  })(c, next);
});

app.get("/api/health", (c) => c.json({ ok: true, service: "jessica-worker" }));

// Everything below this line requires a Supabase session (spec section 53).
app.use("/api/*", withContext);
app.use("/api/*", requireUser);

app.route("/api/challenges", challenges);
app.route("/api", user);

app.onError((error, c) => fail(c, "internal", error));

// Unknown /api paths return JSON, not the SPA shell.
app.notFound((c) =>
  c.req.path.startsWith("/api/") ? fail(c, "not_found") : c.env.ASSETS.fetch(c.req.raw),
);

export default app;
