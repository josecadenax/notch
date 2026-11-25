import { test } from "node:test";
import assert from "node:assert/strict";
import { Keypair, Networks } from "@stellar/stellar-sdk";
import { USDC_PUBNET_ADDRESS, USDC_TESTNET_ADDRESS } from "@x402/stellar";
import { networkSettings, mainnetBlocker } from "../src/config.js";
import { createStampClient } from "../src/stamp-client.js";
import { createNotchTools, readSettings } from "../src/mcp-tools.js";

test("networkSettings: testnet is the default and is what runs today", () => {
  const s = networkSettings({});
  assert.equal(s.isMainnet, false);
  assert.equal(s.network, "stellar:testnet");
  assert.equal(s.passphrase, Networks.TESTNET);
  assert.equal(s.horizonUrl, "https://horizon-testnet.stellar.org");
  assert.equal(s.facilitatorUrl, "https://www.x402.org/facilitator");
  assert.equal(s.sorobanRpcUrl, "https://soroban-testnet.stellar.org");
  assert.match(s.explorerTxUrl, /explorer\/testnet\/tx\/$/);
});

test("networkSettings: pubnet switches every setting to mainnet", () => {
  const s = networkSettings({ STELLAR_NETWORK: "pubnet" });
  assert.equal(s.isMainnet, true);
  assert.equal(s.network, "stellar:pubnet");
  assert.equal(s.passphrase, Networks.PUBLIC);
  assert.equal(s.horizonUrl, "https://horizon.stellar.org");
  assert.equal(s.facilitatorUrl, "https://channels.openzeppelin.com/x402");
  assert.equal(s.sorobanRpcUrl, undefined, "there is no public mainnet Soroban RPC to default to");
  assert.match(s.explorerTxUrl, /explorer\/public\/tx\/$/);
});

test("networkSettings: both USDC assets match the contracts @x402/stellar uses", () => {
  assert.equal(networkSettings({}).usdc.contractId(Networks.TESTNET), USDC_TESTNET_ADDRESS);
  assert.equal(networkSettings({ STELLAR_NETWORK: "pubnet" }).usdc.contractId(Networks.PUBLIC), USDC_PUBNET_ADDRESS);
});

test("networkSettings: environment overrides win, and a typo is refused instead of guessed", () => {
  const s = networkSettings({ STELLAR_NETWORK: "PUBNET", SOROBAN_RPC_URL: "https://rpc.example", HORIZON_URL: "https://h.example", FACILITATOR_URL: "https://f.example" });
  assert.equal(s.isMainnet, true, "case does not matter");
  assert.equal(s.sorobanRpcUrl, "https://rpc.example");
  assert.equal(s.horizonUrl, "https://h.example");
  assert.equal(s.facilitatorUrl, "https://f.example");
  assert.throws(() => networkSettings({ STELLAR_NETWORK: "mainnet" }), /must be "testnet" or "pubnet"/);
});

test("mainnetBlocker: real money needs a second explicit yes", () => {
  assert.equal(mainnetBlocker({ isMainnet: false }, {}), null);
  assert.match(mainnetBlocker({ isMainnet: true }, {}), /REAL money/);
  assert.match(mainnetBlocker({ isMainnet: true }, { NOTCH_ALLOW_MAINNET: "yes" }), /REAL money/, "only exactly 1 counts");
  assert.equal(mainnetBlocker({ isMainnet: true }, { NOTCH_ALLOW_MAINNET: "1" }), null);
});

const mainnetClient = (extra = {}) =>
  createStampClient({
    secret: Keypair.random().secret(),
    apiUrl: "https://api.example.com",
    expectedPayee: Keypair.random().publicKey(),
    network: "stellar:pubnet",
    isMainnet: true,
    sorobanRpcUrl: "https://rpc.example",
    env: { NOTCH_ALLOW_MAINNET: "1" },
    ...extra,
  });

test("stamp client on mainnet: refuses to start without the explicit confirmation", () => {
  assert.throws(() => mainnetClient({ env: {} }), { code: "MAINNET_NOT_CONFIRMED" });
});

test("stamp client on mainnet: refuses to start without a Soroban RPC of its own", () => {
  // An empty value, as an unset env var gives on mainnet (undefined would pick the testnet default).
  assert.throws(() => mainnetClient({ sorobanRpcUrl: "" }), { code: "RPC_REQUIRED", message: /SOROBAN_RPC_URL/ });
});

test("stamp client on mainnet: starts when confirmed and given an RPC", () => {
  assert.ok(mainnetClient().address.startsWith("G"));
});

test("stamp client on mainnet: refuses a testnet payment request before signing", async () => {
  const payTo = Keypair.random().publicKey();
  const offer = { x402Version: 2, error: "Payment required", resource: { url: "https://api.example.com/stamp", description: "", mimeType: "" },
    accepts: [{ scheme: "exact", network: "stellar:testnet", amount: "100000", asset: USDC_TESTNET_ADDRESS, payTo, maxTimeoutSeconds: 300, extra: {} }] };
  const header = Buffer.from(JSON.stringify(offer)).toString("base64");
  const calls = [];
  const fetchFn = async (url) => {
    calls.push(String(url));
    return new Response("{}", { status: 402, headers: { "payment-required": header } });
  };
  await assert.rejects(mainnetClient({ expectedPayee: payTo, fetchFn }).stamp("a".repeat(64)), { code: "NETWORK_MISMATCH" });
  assert.equal(calls.length, 1, "nothing but the price request");
});

test("MCP settings on mainnet: no default API and no default pins, you must name them", () => {
  const s = readSettings({ STELLAR_NETWORK: "pubnet", AGENT_SECRET: "S" });
  assert.equal(s.isMainnet, true);
  assert.equal(s.apiUrl, "");
  assert.equal(s.expectedPayee, undefined);
  assert.equal(s.stamperPublic, undefined);
});

test("MCP tools on mainnet: stamping without naming an API says what to set, and sends nothing", async () => {
  const tools = createNotchTools({
    env: { STELLAR_NETWORK: "pubnet", AGENT_SECRET: "S", NOTCH_ALLOW_MAINNET: "1" },
    fetchFn: async () => assert.fail("no request should be made"),
  });
  const result = await tools.checkBalance();
  assert.equal(result.isError, true);
  assert.match(result.text, /NO_API_URL/);
});

test("MCP check_balance: says which network and whether the money is real", async () => {
  const fake = { address: "GWALLET", usdcBalance: async () => 0.5 * 1e7 };
  const test_ = await createNotchTools({ env: { AGENT_SECRET: "S" }, createClient: () => fake }).checkBalance();
  assert.match(test_.text, /Network: testnet \(test money\)/);
  const real = await createNotchTools({
    env: { STELLAR_NETWORK: "pubnet", AGENT_SECRET: "S", NOTCH_API_URL: "https://api.example.com", EXPECTED_PAYEE: Keypair.random().publicKey() },
    createClient: () => fake,
  }).checkBalance();
  assert.match(real.text, /Network: mainnet \(REAL money\)/);
});
