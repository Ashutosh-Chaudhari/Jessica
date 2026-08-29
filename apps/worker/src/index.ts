import { Hono } from "hono";
import { cors } from "hono/cors";
import type { App } from "./types.ts";
import { requireUser } from "./middleware/auth.ts";
import { withContext } from "./middleware/context.ts";
import { challenges } from "./routes/challenges.ts";
import { user } from "./routes/user.ts";
import { fail } from "./utils/respond.ts";

const app = new Hono<App>();

/**
 * In production the Worker also serves the frontend, so requests are same
 * origin and this does nothing. It exists for `vite dev` on :5173 talking to
 * `wrangler dev` on :8787.
 */
app.use("/api/*", (c, next) =>
  cors({
    origin: c.env.ALLOWED_ORIGIN || "http://localhost:5173",
    allowHeaders: ["authorization", "content-type"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    maxAge: 86400,
  })(c, next),
);

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
