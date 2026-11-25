import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyStamp } from "../src/verifier.js";

// A real stamp on Stellar testnet, made by the paid flow (see the README for the payment).
// It hits the network, so it also proves the verifier works against real Horizon data.
const HASH = "a3bf448a896eb3dbe3b37767e34381ad41840615a237197ba23a8bf77267e1c5";
const TX = "980e4423e8a7476d899aed94d7d4220f5071ee45bdaa939a0f7c04a76cfc1bc0";
const STAMPER = "GAJB47WVQCO33RKAS4WT3R5P4GVD2HA62VHKT3IHEAT7AYV3JEBTGCLJ";

test("verifies a real stamp on Stellar testnet", async () => {
  const result = await verifyStamp({ hash: HASH, tx: TX }, { stamperPublic: STAMPER });
  assert.equal(result.valid, true, result.reasons.join("; "));
  assert.equal(result.issuedByNotch, true);
  assert.equal(result.stampedAt, "2026-11-25T04:10:28Z");
});

test("rejects the same transaction with a different document hash", async () => {
  const result = await verifyStamp({ hash: "0".repeat(64), tx: TX }, { stamperPublic: STAMPER });
  assert.equal(result.valid, false);
  assert.match(result.reasons.join(), /does not match/);
});
