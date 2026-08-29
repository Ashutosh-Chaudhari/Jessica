// Run: npm test   (node --test, no framework)
import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_RETRY_WAIT_MS, ProviderError, withRetry } from "./core.ts";
import { retryDelayFrom } from "./gemini.ts";

test("retryDelayFrom reads google.rpc.RetryInfo out of a real 429 body", () => {
  const body = JSON.stringify({
    error: {
      code: 429,
      details: [
        { "@type": "type.googleapis.com/google.rpc.Help", links: [] },
        { "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaValue: "20" }] },
        { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "1.662301283s" },
      ],
    },
  });
  assert.equal(retryDelayFrom(body), 1662);
  assert.equal(retryDelayFrom(JSON.stringify({ error: { details: [{ "@type": "x/RetryInfo", retryDelay: "40s" }] } })), 40000);

  // Anything unparseable is "no hint", never a crash or a NaN wait.
  assert.equal(retryDelayFrom("not json"), undefined);
  assert.equal(retryDelayFrom("{}"), undefined);
  assert.equal(retryDelayFrom(JSON.stringify({ error: { details: [] } })), undefined);
  assert.equal(retryDelayFrom(JSON.stringify({ error: { details: [{ "@type": "x/RetryInfo" }] } })), undefined);
});

test("a retry hint longer than we are willing to wait makes the error non-retryable", () => {
  assert.equal(new ProviderError("gemini", 429, "slow down", 1_500).retryable, true);
  assert.equal(new ProviderError("gemini", 429, "slow down", 40_000).retryable, false);
  assert.equal(new ProviderError("gemini", 429, "no hint given").retryable, true);
  assert.equal(new ProviderError("gemini", 400, "bad request").retryable, false);
  assert.equal(new ProviderError("gemini", 500, "server error").retryable, true);
  assert.equal(new ProviderError("gemini", 0, "network").retryable, true);
});

test("withRetry waits the hinted time, not its own guess", async () => {
  let calls = 0;
  const started = Date.now();
  const result = await withRetry(async () => {
    calls += 1;
    if (calls === 1) throw new ProviderError("gemini", 429, "slow down", 250);
    return "second time lucky";
  });
  const waited = Date.now() - started;

  assert.equal(result, "second time lucky");
  assert.equal(calls, 2);
  // The hint was 250ms; the built-in guess would have been 400ms.
  assert.ok(waited >= 200 && waited < 400, `waited ${waited}ms`);
});

test("withRetry does not burn a second call on a hopeless error", async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(async () => {
      calls += 1;
      throw new ProviderError("gemini", 429, "come back later", 40_000);
    }),
    /come back later/,
  );
  assert.equal(calls, 1, "a 40s hint means fall back now, not wait");
});

test("withRetry caps a hint it would otherwise honour", () => {
  // Guards the constant itself: raising it silently would let a request hang.
  assert.ok(MAX_RETRY_WAIT_MS <= 5_000, `MAX_RETRY_WAIT_MS is ${MAX_RETRY_WAIT_MS}`);
});
