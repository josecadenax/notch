import { test } from "node:test";
import assert from "node:assert/strict";
import { Account, Asset, Keypair, Networks, TransactionBuilder } from "@stellar/stellar-sdk";
import { planTrustline, buildTrustlineTransaction } from "../src/trustline.js";
import { officialDeployment, OFFICIAL, PUBLIC_API_URL, PUBLIC_PAYEE } from "../src/config.js";
import { readSettings, mainnetSetupProblems } from "../src/mcp-tools.js";

const USDC = new Asset("USDC", Keypair.random().publicKey());
const record = ({ xlm = "10.0000000", subentries = 0, trustline = false } = {}) => ({
  subentry_count: subentries,
  balances: [
    ...(trustline ? [{ asset_code: USDC.code, asset_issuer: USDC.issuer, balance: "0.0000000" }] : []),
    { asset_type: "native", balance: xlm },
  ],
});

test("planTrustline: an account that already has it needs nothing", () => {
  assert.deepEqual(planTrustline(record({ trustline: true }), USDC), { action: "exists" });
});

test("planTrustline: an account with enough free XLM adds it", () => {
  const plan = planTrustline(record({ xlm: "2.0000000" }), USDC);
  assert.equal(plan.action, "add");
  assert.equal(plan.free, 1, "2 XLM minus the 1 XLM base reserve");
});

test("planTrustline: it counts the reserve of what the account already holds", () => {
  // 1.5 XLM with one other entry: reserve is 1.5, nothing is free
  assert.equal(planTrustline(record({ xlm: "1.5000000", subentries: 1 }), USDC).action, "insufficient");
  // exactly the base reserve plus the new trustline reserve is just enough
  assert.equal(planTrustline(record({ xlm: "1.5001000" }), USDC).action, "add");
  assert.equal(planTrustline(record({ xlm: "1.4999000" }), USDC).action, "insufficient");
});

test("planTrustline: a trustline for another issuer does not count", () => {
  const other = { subentry_count: 1, balances: [{ asset_code: "USDC", asset_issuer: Keypair.random().publicKey(), balance: "1" }, { asset_type: "native", balance: "5" }] };
  assert.equal(planTrustline(other, USDC).action, "add");
});

test("buildTrustlineTransaction: one changeTrust for the asset, signed for the right network and nothing else", () => {
  const account = new Account(Keypair.random().publicKey(), "100");
  for (const passphrase of [Networks.TESTNET, Networks.PUBLIC]) {
    const tx = buildTrustlineTransaction(account, USDC, passphrase);
    assert.equal(tx.operations.length, 1);
    assert.equal(tx.operations[0].type, "changeTrust");
    assert.equal(tx.operations[0].line.code, "USDC");
    assert.equal(tx.operations[0].line.issuer, USDC.issuer);
    assert.equal(tx.networkPassphrase, passphrase);
  }
});

test("officialDeployment: testnet has one and mainnet has none yet", () => {
  assert.equal(officialDeployment(false).apiUrl, PUBLIC_API_URL);
  assert.equal(officialDeployment(false).payee, PUBLIC_PAYEE);
  assert.deepEqual(officialDeployment(true), { apiUrl: "", payee: "", stamper: "" }, "fill it in when the mainnet API is live");
});

const FILLED = { ...OFFICIAL, mainnet: { apiUrl: "https://notch.example.com", payee: Keypair.random().publicKey(), stamper: Keypair.random().publicKey() } };
const MAINNET_ENV = { STELLAR_NETWORK: "pubnet", AGENT_SECRET: "S", NOTCH_ALLOW_MAINNET: "1", SOROBAN_RPC_URL: "https://rpc.example" };

test("once the official mainnet API is filled in, users of it set neither the API nor the payee", () => {
  const settings = readSettings(MAINNET_ENV, FILLED);
  assert.equal(settings.apiUrl, "https://notch.example.com");
  assert.equal(settings.expectedPayee, FILLED.mainnet.payee);
  assert.equal(settings.stamperPublic, FILLED.mainnet.stamper);
  assert.deepEqual(mainnetSetupProblems(MAINNET_ENV, FILLED), [], "nothing left to ask for");
});

test("someone else's mainnet server gets no pin from the official one, so they must name its payee", () => {
  const env = { ...MAINNET_ENV, NOTCH_API_URL: "https://someone-else.example.com" };
  const settings = readSettings(env, FILLED);
  assert.equal(settings.expectedPayee, undefined);
  assert.deepEqual(mainnetSetupProblems(env, FILLED).map(([name]) => name), ["EXPECTED_PAYEE"]);
});

test("while the mainnet slot is empty nothing is assumed", () => {
  assert.deepEqual(
    mainnetSetupProblems(MAINNET_ENV).map(([name]) => name),
    ["NOTCH_API_URL", "EXPECTED_PAYEE"],
  );
});
