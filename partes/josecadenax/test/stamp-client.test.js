import { test } from "node:test";
import assert from "node:assert/strict";
import { Keypair } from "@stellar/stellar-sdk";
import { assertSafeApiUrl, createStampClient, NotchError } from "../src/stamp-client.js";

const HASH = "a".repeat(64);
const payee = Keypair.random().publicKey();
const otherAccount = Keypair.random().publicKey();
const secret = Keypair.random().secret();

// A 402 answer like the real API sends it (v2 header).
function paymentRequired({ payTo = payee, network = "stellar:testnet", amount = "100000" } = {}) {
  const body = {
    x402Version: 2,
    error: "Payment required",
    resource: { url: "https://api.example.com/stamp", description: "", mimeType: "" },
    accepts: [
      {
        scheme: "exact",
        network,
        amount,
        asset: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
        payTo,
        maxTimeoutSeconds: 300,
        extra: { areFeesSponsored: true },
      },
    ],
  };
  const header = Buffer.from(JSON.stringify(body)).toString("base64");
  return new Response('{"error":"Payment required"}', { status: 402, headers: { "payment-required": header } });
}

// Fake network: records every call. `balance` is the agent's USDC.
function fakeFetch({ quote = paymentRequired(), balance = "1.0000000" } = {}) {
  const calls = [];
  const fn = async (url, options) => {
    calls.push({ url: String(url), method: options?.method ?? "GET" });
    if (String(url).includes("/accounts/")) {
      return Response.json({ balances: [{ asset_code: "USDC", balance }] });
    }
    return quote.clone();
  };
  fn.calls = calls;
  return fn;
}

const build = (fetchFn, extra = {}) =>
  createStampClient({ secret, apiUrl: "https://api.example.com", expectedPayee: payee, fetchFn, sleep: async () => {}, ...extra });

test("assertSafeApiUrl: https with a pinned payee is accepted and trailing slashes are removed", () => {
  assert.equal(assertSafeApiUrl("https://api.example.com//", payee), "https://api.example.com");
});

test("assertSafeApiUrl: plain http is refused outside localhost", () => {
  assert.throws(() => assertSafeApiUrl("http://api.example.com", payee), { code: "HTTPS_REQUIRED" });
  assert.throws(() => assertSafeApiUrl("ftp://api.example.com", payee), { code: "HTTPS_REQUIRED" });
});

test("assertSafeApiUrl: localhost may use http and needs no pinned payee", () => {
  assert.equal(assertSafeApiUrl("http://localhost:3001"), "http://localhost:3001");
  assert.equal(assertSafeApiUrl("http://127.0.0.1:3001"), "http://127.0.0.1:3001");
  assert.equal(assertSafeApiUrl("http://[::1]:3001"), "http://[::1]:3001");
});

test("assertSafeApiUrl: an API outside this machine needs a pinned payee", () => {
  assert.throws(() => assertSafeApiUrl("https://api.example.com"), { code: "PAYEE_REQUIRED" });
});

test("assertSafeApiUrl: rejects a malformed URL or payee", () => {
  assert.throws(() => assertSafeApiUrl("not a url", payee), { code: "BAD_URL" });
  assert.throws(() => assertSafeApiUrl("https://api.example.com", "GNOTAKEY"), { code: "BAD_PAYEE" });
});

test("createStampClient: refuses to start without a wallet secret", () => {
  assert.throws(() => createStampClient({ apiUrl: "http://localhost:3001" }), { code: "NO_SECRET" });
});

test("stamp: a fake API that asks to pay another account is refused before checking balance or signing", async () => {
  const fetchFn = fakeFetch({ quote: paymentRequired({ payTo: otherAccount }) });
  await assert.rejects(build(fetchFn).stamp(HASH), { code: "PAYEE_MISMATCH" });
  assert.equal(fetchFn.calls.length, 1, "only the price request was made");
});

test("stamp: refuses a payment request on another network", async () => {
  const fetchFn = fakeFetch({ quote: paymentRequired({ network: "stellar:pubnet" }) });
  await assert.rejects(build(fetchFn).stamp(HASH), { code: "NETWORK_MISMATCH" });
  assert.equal(fetchFn.calls.length, 1);
});

test("stamp: stops before signing when the balance is lower than the price", async () => {
  const fetchFn = fakeFetch({ balance: "0.0010000" });
  await assert.rejects(build(fetchFn).stamp(HASH), { code: "INSUFFICIENT_BALANCE" });
  assert.equal(fetchFn.calls.filter((c) => c.method === "POST").length, 1, "no paid request was sent");
});

test("stamp: gives up when the API never answers and says nothing was paid", async () => {
  let attempts = 0;
  const logs = [];
  const fetchFn = async () => {
    attempts++;
    throw new Error("down");
  };
  await assert.rejects(build(fetchFn, { log: (line) => logs.push(line) }).stamp(HASH), {
    code: "API_UNREACHABLE",
    message: /Nothing was paid/,
  });
  assert.equal(attempts, 3);
  assert.equal(logs.length, 2, "it logged the two retries");
});

test("stamp: an unexpected answer is reported and never retried", async () => {
  let calls = 0;
  const fetchFn = async () => {
    calls++;
    return new Response("boom", { status: 500 });
  };
  await assert.rejects(build(fetchFn).stamp(HASH), { code: "UNEXPECTED_ANSWER" });
  assert.equal(calls, 1);
});

test("stamp: rejects a malformed hash without any request", async () => {
  const fetchFn = fakeFetch();
  await assert.rejects(build(fetchFn).stamp("xyz"), (error) => error instanceof NotchError && error.code === "BAD_HASH");
  assert.equal(fetchFn.calls.length, 0);
});
