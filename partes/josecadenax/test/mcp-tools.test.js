import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createNotchTools, readSettings } from "../src/mcp-tools.js";
import { NotchError } from "../src/stamp-client.js";
import { sha256Hex } from "../src/hash.js";
import { PUBLIC_API_URL, PUBLIC_PAYEE, PUBLIC_STAMPER } from "../src/config.js";

const dir = mkdtempSync(join(tmpdir(), "notch-mcp-"));
const file = join(dir, "contract.txt");
writeFileSync(file, "the contract");
const HASH = sha256Hex("the contract");
const TX = "b".repeat(64);
const stamp = { hash: HASH, tx: TX, ledger: 42, stampedAt: "2026-11-25T10:00:00Z", explorer: `https://explorer/${TX}` };

test("readSettings: the public API is pinned by default", () => {
  const settings = readSettings({ AGENT_SECRET: "S" });
  assert.equal(settings.apiUrl, PUBLIC_API_URL);
  assert.equal(settings.expectedPayee, PUBLIC_PAYEE);
  assert.equal(settings.stamperPublic, PUBLIC_STAMPER);
  assert.equal(settings.spendCap, "$0.02");
});

test("readSettings: another API gets no default pin, so it must bring its own", () => {
  const settings = readSettings({ NOTCH_API_URL: "https://other.example.com/", SPEND_CAP: "$0.05" });
  assert.equal(settings.apiUrl, "https://other.example.com");
  assert.equal(settings.expectedPayee, undefined);
  assert.equal(settings.stamperPublic, undefined);
  assert.equal(settings.spendCap, "$0.05");
});

test("stamp_file: reports the proof and that only the hash left the computer", async () => {
  let hashed;
  const tools = createNotchTools({
    env: { AGENT_SECRET: "S" },
    createClient: () => ({
      stamp: async (hash) => {
        hashed = hash;
        return { status: "stamped", stamp, paymentUrl: "https://explorer/pay", price: 0.01 };
      },
    }),
  });
  const result = await tools.stampFile({ path: file });
  assert.equal(result.isError, false);
  assert.equal(hashed, HASH);
  assert.match(result.text, /Only the SHA-256 left this computer/);
  assert.match(result.text, new RegExp(TX));
  assert.match(result.text, /0\.01 USDC/);
});

test("stamp_file: an already stamped file says nothing was charged", async () => {
  const tools = createNotchTools({
    env: { AGENT_SECRET: "S" },
    createClient: () => ({ stamp: async () => ({ status: "already_stamped", stamp }) }),
  });
  const result = await tools.stampFile({ path: file });
  assert.equal(result.isError, false);
  assert.match(result.text, /already stamped\. Nothing was charged/);
  assert.match(result.text, new RegExp(TX));
});

test("stamp_file: safety refusals come back as errors with their code", async () => {
  const tools = createNotchTools({
    env: { AGENT_SECRET: "S" },
    createClient: () => ({
      stamp: async () => {
        throw new NotchError("PAYEE_MISMATCH", "wrong account. Nothing was signed.");
      },
    }),
  });
  const result = await tools.stampFile({ path: file });
  assert.equal(result.isError, true);
  assert.match(result.text, /\[PAYEE_MISMATCH\]/);
});

test("stamp_file: without AGENT_SECRET the real client explains what is missing", async () => {
  const tools = createNotchTools({ env: {} });
  const result = await tools.stampFile({ path: file });
  assert.equal(result.isError, true);
  assert.match(result.text, /AGENT_SECRET/);
});

test("stamp_file: refuses a custom API that has no pinned payee, before any request", async () => {
  const tools = createNotchTools({
    env: { AGENT_SECRET: "S", NOTCH_API_URL: "https://other.example.com" },
    fetchFn: async () => assert.fail("no request should be made"),
  });
  const result = await tools.stampFile({ path: file });
  assert.equal(result.isError, true);
  assert.match(result.text, /PAYEE_REQUIRED/);
});

test("stamp_file: a missing file is a clear error", async () => {
  const tools = createNotchTools({ env: { AGENT_SECRET: "S" }, createClient: () => ({ stamp: async () => assert.fail() }) });
  const result = await tools.stampFile({ path: join(dir, "missing.txt") });
  assert.equal(result.isError, true);
  assert.match(result.text, /The file was not found/);
});

test("verify_stamp: valid proof with the transaction given", async () => {
  let received;
  const tools = createNotchTools({
    env: {},
    verifyFn: async (input, options) => {
      received = { input, options };
      return { valid: true, reasons: [], stampedAt: stamp.stampedAt, ledger: 42, issuedByNotch: true };
    },
  });
  const result = await tools.verifyFile({ path: file, tx: TX });
  assert.equal(result.isError, false);
  assert.match(result.text, /^VALID/);
  assert.deepEqual(received.input, { hash: HASH, tx: TX });
  assert.equal(received.options.stamperPublic, PUBLIC_STAMPER);
});

test("verify_stamp: a changed file is reported as invalid", async () => {
  const tools = createNotchTools({
    env: {},
    verifyFn: async () => ({ valid: false, reasons: ["the memo does not match this hash"] }),
  });
  const result = await tools.verifyFile({ path: file, tx: TX });
  assert.match(result.text, /^INVALID: the memo does not match this hash/);
});

test("verify_stamp: warns when the stamp was not written by Notch's stamper", async () => {
  const tools = createNotchTools({
    env: {},
    verifyFn: async () => ({ valid: true, reasons: [], stampedAt: stamp.stampedAt, ledger: 42, issuedByNotch: false }),
  });
  const result = await tools.verifyFile({ path: file, tx: TX });
  assert.match(result.text, /not written by Notch's stamper/);
});

test("verify_stamp: without a transaction it looks the stamp up by hash, then checks it on Stellar", async () => {
  const urls = [];
  const tools = createNotchTools({
    env: {},
    fetchFn: async (url) => {
      urls.push(url);
      return Response.json(stamp);
    },
    verifyFn: async ({ tx }) => ({ valid: tx === TX, reasons: [], stampedAt: stamp.stampedAt, ledger: 42, issuedByNotch: true }),
  });
  const result = await tools.verifyFile({ path: file });
  assert.deepEqual(urls, [`${PUBLIC_API_URL}/stamp/${HASH}`]);
  assert.match(result.text, /^VALID/);
});

test("verify_stamp: a file the server never stamped is reported, not treated as an error", async () => {
  const tools = createNotchTools({ env: {}, fetchFn: async () => new Response("{}", { status: 404 }) });
  const result = await tools.verifyFile({ path: file });
  assert.equal(result.isError, false);
  assert.match(result.text, /No stamp was found/);
});

test("check_balance: shows wallet, balance, stamps left and the payee it is pinned to, never a secret", async () => {
  const tools = createNotchTools({
    env: { AGENT_SECRET: "SECRET-SHOULD-NOT-APPEAR" },
    createClient: () => ({ address: "GWALLET", usdcBalance: async () => 0.93 * 1e7 }),
  });
  const result = await tools.checkBalance();
  assert.equal(result.isError, false);
  assert.match(result.text, /Paying wallet: GWALLET/);
  assert.match(result.text, /Balance: 0\.93 USDC \(about 93 stamps/);
  assert.match(result.text, new RegExp(`Only pays to: ${PUBLIC_PAYEE}`));
  assert.doesNotMatch(result.text, /SECRET-SHOULD-NOT-APPEAR/);
  assert.doesNotMatch(result.text, /faucet/, "no top-up hint while there is balance");
});

test("check_balance: with too little balance it says how to top up", async () => {
  const tools = createNotchTools({
    env: { AGENT_SECRET: "S" },
    createClient: () => ({ address: "GWALLET", usdcBalance: async () => 0 }),
  });
  const result = await tools.checkBalance();
  assert.match(result.text, /Not enough for a stamp/);
  assert.match(result.text, /faucet\.circle\.com/);
  assert.match(result.text, /GWALLET/);
});

test("check_balance: without AGENT_SECRET it explains what is missing", async () => {
  const result = await createNotchTools({ env: {} }).checkBalance();
  assert.equal(result.isError, true);
  assert.match(result.text, /AGENT_SECRET/);
});

test("check_balance: a wallet that does not exist yet is reported clearly", async () => {
  const tools = createNotchTools({
    env: { AGENT_SECRET: "S" },
    createClient: () => ({
      address: "GWALLET",
      usdcBalance: async () => {
        throw new NotchError("WALLET_NOT_FOUND", "does not exist on the network yet");
      },
    }),
  });
  const result = await tools.checkBalance();
  assert.equal(result.isError, true);
  assert.match(result.text, /WALLET_NOT_FOUND/);
});
