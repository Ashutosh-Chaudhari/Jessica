// Run: npm test   (node --test, no framework)
//
// Drives the real Hono app in process. No network and no credentials: every
// case here is answered before the context middleware builds a repository, so
// the env below only has to exist, not work.
import { test } from "node:test";
import assert from "node:assert/strict";
import app from "./index.ts";
import { challenges } from "./routes/challenges.ts";

const env = { ASSETS: { fetch: async () => new Response("spa") } };
const ctx = { waitUntil: () => {}, passThroughOnException: () => {} };

const hit = (url: string, init?: RequestInit) =>
  app.fetch(new Request(url, init), env as never, ctx as never);

test("plain HTTP is redirected to HTTPS, not back to itself", async () => {
  const response = await hit("http://jessica.example/api/health");
  assert.equal(response.status, 308);
  // The whole point of the redirect. A Location that still says http: is an
  // infinite loop, which is indistinguishable from the API being down.
  assert.equal(response.headers.get("location"), "https://jessica.example/api/health");
});

test("the method survives the redirect, so a POST is not silently a GET", async () => {
  const response = await hit("http://jessica.example/api/challenges/start", { method: "POST" });
  assert.equal(response.status, 308);
});

for (const host of ["localhost:8787", "127.0.0.1:8787", "[::1]:8787"]) {
  test(`http://${host} is served, not redirected`, async () => {
    // `wrangler dev` serves plain HTTP and rewrites an https Location back to
    // http, so redirecting the loopback hosts makes the local API unreachable.
    const response = await hit(`http://${host}/api/health`);
    assert.equal(response.status, 200, "loopback must not be redirected");
    assert.deepEqual(await response.json(), { ok: true, service: "jessica-worker" });
  });
}

test("HTTPS is served without a redirect", async () => {
  const response = await hit("https://jessica.example/api/health");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("strict-transport-security"), "max-age=63072000; includeSubDomains");
});

test("the challenges router exposes exactly the intended paths", () => {
  // A typo in a path would otherwise surface as an indistinguishable 401:
  // requireUser runs before routing resolves, so an unknown /api/* path and a
  // real one both answer "unauthorized" without a token.
  const registered = challenges.routes
    .filter((route) => route.method !== "ALL")
    .map((route) => `${route.method} ${route.path}`)
    .sort();

  assert.deepEqual(registered, [
    "GET /current",
    "POST /:id/retry",
    "POST /:id/skip",
    "POST /:id/started",
    "POST /:id/submit",
    "POST /start",
  ]);
});
