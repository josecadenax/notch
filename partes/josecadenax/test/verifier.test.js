import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyStamp } from "../src/verifier.js";

const HASH = "a3bf448a896eb3dbe3b37767e34381ad41840615a237197ba23a8bf77267e1c5";
const TX = "9".repeat(64);
const STAMPER = "GSTAMPER";

// A fake Horizon: answers the transaction lookup with the given record.
const horizonReturning = (record, status = 200) => async () => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => record,
});
const memoOf = (hash) => Buffer.from(hash, "hex").toString("base64");
const goodRecord = {
  successful: true,
  memo_type: "hash",
  memo: memoOf(HASH),
  created_at: "2026-11-25T04:10:28Z",
  ledger: 5911237,
  source_account: STAMPER,
};

test("accepts a successful transaction whose memo is the hash", async () => {
  const result = await verifyStamp({ hash: HASH, tx: TX }, { fetchFn: horizonReturning(goodRecord), stamperPublic: STAMPER });
  assert.equal(result.valid, true);
  assert.equal(result.stampedAt, "2026-11-25T04:10:28Z");
  assert.equal(result.issuedByNotch, true);
});

test("flags a valid memo written by an account that is not the stamper", async () => {
  const record = { ...goodRecord, source_account: "GSOMEONEELSE" };
  const result = await verifyStamp({ hash: HASH, tx: TX }, { fetchFn: horizonReturning(record), stamperPublic: STAMPER });
  assert.equal(result.valid, true);
  assert.equal(result.issuedByNotch, false);
});

test("rejects a memo that belongs to a different hash", async () => {
  const record = { ...goodRecord, memo: memoOf("0".repeat(64)) };
  const result = await verifyStamp({ hash: HASH, tx: TX }, { fetchFn: horizonReturning(record) });
  assert.equal(result.valid, false);
  assert.match(result.reasons.join(), /does not match/);
});

test("rejects a transaction that does not use a hash memo", async () => {
  const record = { ...goodRecord, memo_type: "text", memo: "hello" };
  const result = await verifyStamp({ hash: HASH, tx: TX }, { fetchFn: horizonReturning(record) });
  assert.equal(result.valid, false);
  assert.match(result.reasons.join(), /not a hash memo/);
});

test("rejects a transaction that did not succeed", async () => {
  const record = { ...goodRecord, successful: false };
  const result = await verifyStamp({ hash: HASH, tx: TX }, { fetchFn: horizonReturning(record) });
  assert.equal(result.valid, false);
  assert.match(result.reasons.join(), /did not succeed/);
});

test("rejects a transaction that does not exist", async () => {
  const result = await verifyStamp({ hash: HASH, tx: TX }, { fetchFn: horizonReturning({}, 404) });
  assert.equal(result.valid, false);
  assert.match(result.reasons.join(), /not found/);
});

test("rejects malformed inputs without calling the network", async () => {
  const fetchFn = async () => assert.fail("must not call Horizon");
  assert.equal((await verifyStamp({ hash: "nope", tx: TX }, { fetchFn })).valid, false);
  assert.equal((await verifyStamp({ hash: HASH, tx: "nope" }, { fetchFn })).valid, false);
  assert.equal((await verifyStamp({ hash: HASH }, { fetchFn })).valid, false);
});
