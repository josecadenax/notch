import { test } from "node:test";
import assert from "node:assert/strict";
import { createRateLimiter } from "../src/rate-limit.js";
import { createApp } from "../src/app.js";
import { createMemoryRegistry } from "../src/registry.js";

// Runs the limiter against a fake request/response and says what happened.
function hit(limiter, ip = "1.1.1.1") {
  let outcome = "next";
  const res = {
    headers: {},
    set(name, value) { this.headers[name] = value; return this; },
    status(code) { outcome = code; return this; },
    json() { return this; },
  };
  limiter({ ip }, res, () => {});
  return { outcome, headers: res.headers };
}

test("lets requests through until the limit and then answers 429", () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 3, now: () => 0 });
  assert.equal(hit(limiter).outcome, "next");
  assert.equal(hit(limiter).outcome, "next");
  assert.equal(hit(limiter).outcome, "next");
  assert.equal(hit(limiter).outcome, 429);
});

test("tells the client how long to wait", () => {
  let time = 0;
  const limiter = createRateLimiter({ windowMs: 10_000, max: 1, now: () => time });
  hit(limiter);
  time = 4000;
  assert.equal(hit(limiter).headers["Retry-After"], "6");
});

test("counts each IP on its own", () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 1, now: () => 0 });
  assert.equal(hit(limiter, "1.1.1.1").outcome, "next");
  assert.equal(hit(limiter, "2.2.2.2").outcome, "next");
  assert.equal(hit(limiter, "1.1.1.1").outcome, 429);
});

test("starts a fresh window after the time passes", () => {
  let time = 0;
  const limiter = createRateLimiter({ windowMs: 1000, max: 1, now: () => time });
  hit(limiter);
  assert.equal(hit(limiter).outcome, 429);
  time = 1000;
  assert.equal(hit(limiter).outcome, "next");
});

test("the free endpoints are limited and POST /stamp is not", async () => {
  const stamper = { publicKey: "GSTAMPER", anchor: async () => ({ tx: "d".repeat(64), ledger: 1, stampedAt: "2026-11-25T00:00:00Z" }) };
  const app = createApp({
    stamper,
    registry: createMemoryRegistry(),
    verifyFn: async () => ({ valid: true, reasons: [] }),
    limiter: createRateLimiter({ windowMs: 60_000, max: 2 }),
  });
  const server = app.listen(0);
  const base = `http://localhost:${server.address().port}`;
  const statuses = [];
  for (let i = 0; i < 4; i++) statuses.push((await fetch(`${base}/verify?hash=${"a".repeat(64)}&tx=${"b".repeat(64)}`)).status);
  assert.deepEqual(statuses, [200, 200, 429, 429]);
  const stamp = await fetch(`${base}/stamp`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ hash: "c".repeat(64) }) });
  assert.equal(stamp.status, 200);
  server.close();
});
