import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { createMemoryRegistry } from "../src/registry.js";

const HASH = "c".repeat(64);
const TX = "d".repeat(64);

// Starts the app on a random port with a fake stamper, so no network is needed.
async function start({ anchor, verifyFn } = {}) {
  const calls = [];
  const stamper = {
    publicKey: "GSTAMPER",
    anchor: anchor ?? (async (hash) => (calls.push(hash), { tx: TX, ledger: 7, stampedAt: "2026-11-25T00:00:00Z" })),
  };
  const server = createApp({ stamper, registry: createMemoryRegistry(), verifyFn }).listen(0);
  const base = `http://localhost:${server.address().port}`;
  const post = (body) =>
    fetch(`${base}/stamp`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { base, post, calls, close: () => server.close() };
}

test("POST /stamp anchors a valid hash and returns the proof", async () => {
  const api = await start();
  const response = await api.post({ hash: HASH });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.hash, HASH);
  assert.equal(body.tx, TX);
  assert.match(body.explorer, /stellar\.expert.*\/tx\/d{64}$/);
  assert.deepEqual(api.calls, [HASH]);
  api.close();
});

test("POST /stamp rejects an invalid hash with 400 and anchors nothing", async () => {
  const api = await start();
  assert.equal((await api.post({ hash: "not-a-hash" })).status, 400);
  assert.equal((await api.post({})).status, 400);
  assert.deepEqual(api.calls, []);
  api.close();
});

test("POST /stamp answers 409 for an already stamped hash, so x402 does not charge", async () => {
  const api = await start();
  await api.post({ hash: HASH });
  const again = await api.post({ hash: HASH });
  assert.equal(again.status, 409);
  assert.equal((await again.json()).stamp.tx, TX);
  assert.equal(api.calls.length, 1);
  api.close();
});

test("POST /stamp answers 502 and stores nothing when Stellar fails", async () => {
  const api = await start({ anchor: async () => { throw new Error("horizon down"); } });
  assert.equal((await api.post({ hash: HASH })).status, 502);
  assert.equal((await fetch(`${api.base}/stamp/${HASH}`)).status, 404);
  api.close();
});

test("GET /stamp/:hash returns a known stamp and 404 otherwise", async () => {
  const api = await start();
  await api.post({ hash: HASH });
  assert.equal((await fetch(`${api.base}/stamp/${HASH}`)).status, 200);
  assert.equal((await fetch(`${api.base}/stamp/${"e".repeat(64)}`)).status, 404);
  api.close();
});

test("GET /verify uses the stored transaction and maps the result to a status", async () => {
  const seen = [];
  const verifyFn = async (input) => (seen.push(input), { valid: input.hash === HASH, reasons: [] });
  const api = await start({ verifyFn });
  await api.post({ hash: HASH });
  assert.equal((await fetch(`${api.base}/verify?hash=${HASH}`)).status, 200);
  assert.deepEqual(seen[0], { hash: HASH, tx: TX });
  assert.equal((await fetch(`${api.base}/verify?hash=${"e".repeat(64)}&tx=${TX}`)).status, 422);
  api.close();
});

test("GET / describes the service", async () => {
  const api = await start();
  const body = await (await fetch(`${api.base}/`)).json();
  assert.equal(body.name, "Notch");
  assert.equal(body.price, "$0.01");
  api.close();
});
