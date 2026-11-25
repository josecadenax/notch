import { homedir } from "node:os";
import { resolve } from "node:path";
import { sha256File } from "./hash.js";
import { verifyStamp } from "./verifier.js";
import { createStampClient, assertSafeApiUrl, NotchError } from "./stamp-client.js";
import { PUBLIC_API_URL, PUBLIC_PAYEE, PUBLIC_STAMPER, PRICE, networkSettings } from "./config.js";

// Reads the MCP server settings from environment variables.
// The public testnet deployment is pinned by default (payee and stamper); any other API needs its own pin.
// On mainnet there is no default API: you must name it and its payee.
export function readSettings(env = process.env) {
  const { isMainnet, label } = networkSettings(env);
  const apiUrl = (env.NOTCH_API_URL || (isMainnet ? "" : PUBLIC_API_URL)).replace(/\/+$/, "");
  const isPublic = !isMainnet && apiUrl === PUBLIC_API_URL;
  return {
    network: label,
    isMainnet,
    secret: env.AGENT_SECRET,
    apiUrl,
    spendCap: env.SPEND_CAP || "$0.02",
    expectedPayee: env.EXPECTED_PAYEE || (isPublic ? PUBLIC_PAYEE : undefined),
    stamperPublic: env.NOTCH_STAMPER || (isPublic ? PUBLIC_STAMPER : undefined),
  };
}

// Everything a mainnet user still has to set, all at once, so they edit the config and restart Claude
// Desktop one time instead of discovering the missing pieces one error at a time.
// Testnet needs nothing beyond AGENT_SECRET, which the stamp client already explains.
export function mainnetSetupProblems(env = process.env) {
  const { isMainnet, sorobanRpcUrl } = networkSettings(env);
  if (!isMainnet) return [];
  const missing = [];
  if (!env.AGENT_SECRET) missing.push(["AGENT_SECRET", "the secret key of the wallet that pays (a dedicated wallet with a small balance)"]);
  if (env.NOTCH_ALLOW_MAINNET !== "1") missing.push(["NOTCH_ALLOW_MAINNET", 'set it to "1" to confirm you are using REAL money']);
  if (!env.NOTCH_API_URL) missing.push(["NOTCH_API_URL", "the Notch API you want to use. There is no default on mainnet"]);
  if (!env.EXPECTED_PAYEE) missing.push(["EXPECTED_PAYEE", "the Stellar account that must receive the payment, so a fake API cannot charge you"]);
  if (!sorobanRpcUrl) missing.push(["SOROBAN_RPC_URL", "a Soroban RPC from a provider (Stellar runs none for mainnet): the paying client asks it to simulate the payment"]);
  return missing;
}

export function mainnetSetupMessage(missing) {
  const values = Object.fromEntries(missing.map(([name]) => [name, name === "NOTCH_ALLOW_MAINNET" ? "1" : "..."]));
  return [
    "Notch is not fully set up for mainnet (real money). Missing:",
    ...missing.map(([name, why]) => `- ${name}: ${why}`),
    "",
    'Add them inside "env" of the notch server in Claude Desktop\'s config, then quit Claude Desktop (Cmd+Q) and open it again:',
    JSON.stringify({ STELLAR_NETWORK: "pubnet", ...values }, null, 2),
    "See docs/mcp.md, section Mainnet.",
  ].join("\n");
}

const expandPath = (path) => resolve(path.startsWith("~/") ? path.replace("~", homedir()) : path);
const ok = (text) => ({ text, isError: false });
const fail = (text) => ({ text, isError: true });

function describeStamp(stamp) {
  return [
    `Stamped at: ${stamp.stampedAt} (ledger ${stamp.ledger})`,
    `Stamp transaction: ${stamp.tx}`,
    `Explorer: ${stamp.explorer}`,
  ];
}

// The logic of the two MCP tools. Dependencies are injectable so it can be tested without a network.
export function createNotchTools({
  env = process.env,
  createClient = createStampClient,
  verifyFn = verifyStamp,
  fetchFn = fetch,
} = {}) {
  const settings = readSettings(env);
  let client;
  const getClient = () => {
    const missing = mainnetSetupProblems(env);
    if (missing.length) throw new NotchError("SETUP_INCOMPLETE", mainnetSetupMessage(missing));
    if (!settings.apiUrl) {
      throw new NotchError("NO_API_URL", "Set NOTCH_API_URL: there is no default API on mainnet.");
    }
    return (client ??= createClient({
      secret: settings.secret,
      apiUrl: settings.apiUrl,
      spendCap: settings.spendCap,
      expectedPayee: settings.expectedPayee,
      env,
      isMainnet: settings.isMainnet,
    }));
  };

  async function stampFile({ path }) {
    try {
      const paying = getClient();
      const hash = await sha256File(expandPath(path));
      const result = await paying.stamp(hash);
      if (result.status === "already_stamped") {
        return ok(
          [
            "This file was already stamped. Nothing was charged.",
            `SHA-256: ${hash}`,
            ...describeStamp(result.stamp),
          ].join("\n"),
        );
      }
      return ok(
        [
          "Stamped. Only the SHA-256 left this computer, never the file.",
          `SHA-256: ${hash}`,
          ...describeStamp(result.stamp),
          `Paid: ${result.price} USDC (${result.paymentUrl})`,
          `To verify later, keep the stamp transaction: ${result.stamp.tx}`,
        ].join("\n"),
      );
    } catch (error) {
      return fail(describeError(error, path));
    }
  }

  // Tells the user which wallet pays, how much it holds and what protects it. Never shows the secret.
  async function checkBalance() {
    try {
      const paying = getClient();
      const usdc = (await paying.usdcBalance()) / 1e7;
      const price = Number(PRICE.replace("$", ""));
      const lines = [
        `Network: ${settings.network}${settings.isMainnet ? " (REAL money)" : " (test money)"}`,
        `Paying wallet: ${paying.address}`,
        `Balance: ${usdc} USDC (about ${Math.floor(usdc / price)} stamps at ${price} USDC each)`,
        `Spend cap per stamp: ${settings.spendCap}`,
        `API: ${settings.apiUrl}`,
        settings.expectedPayee ? `Only pays to: ${settings.expectedPayee}` : "Only pays to: any account (local API)",
      ];
      if (usdc < price) {
        lines.push(
          settings.isMainnet
            ? `Not enough for a stamp. Send USDC (and a little XLM for the reserve) to ${paying.address}.`
            : `Not enough for a stamp. On testnet, get free USDC at https://faucet.circle.com (Stellar testnet) and send it to ${paying.address}.`,
        );
      }
      return ok(lines.join("\n"));
    } catch (error) {
      return fail(describeError(error));
    }
  }

  async function verifyFile({ path, tx }) {
    try {
      const hash = await sha256File(expandPath(path));
      let transaction = tx;
      if (!transaction) {
        // No transaction given: ask the API which stamp it issued for this hash.
        // The API is only a directory; the proof itself is checked on Stellar below.
        const base = assertSafeApiUrl(settings.apiUrl, settings.expectedPayee);
        const response = await fetchFn(`${base}/stamp/${hash}`);
        if (response.status === 404) {
          return ok(`No stamp was found for this file (SHA-256 ${hash}). It was not stamped by this Notch server, or it changed since.`);
        }
        if (!response.ok) return fail(`The API answered ${response.status} while looking up the stamp.`);
        transaction = (await response.json()).tx;
      }
      const result = await verifyFn({ hash, tx: transaction }, { stamperPublic: settings.stamperPublic });
      if (!result.valid) return ok(`INVALID: ${result.reasons.join("; ")}\nSHA-256: ${hash}`);
      const lines = [
        `VALID: this file existed no later than ${result.stampedAt} (ledger ${result.ledger}).`,
        `SHA-256: ${hash}`,
        `Checked directly on Stellar, transaction ${transaction}.`,
      ];
      if (result.issuedByNotch === false) {
        lines.push("Warning: the memo matches, but the transaction was not written by Notch's stamper account.");
      }
      return ok(lines.join("\n"));
    } catch (error) {
      return fail(describeError(error, path));
    }
  }

  return { stampFile, verifyFile, checkBalance };
}

function describeError(error, path) {
  if (error instanceof NotchError) return `${error.message} [${error.code}]`;
  if (error?.code === "ENOENT") return `The file was not found: ${path}`;
  if (error?.code === "EISDIR") return `That path is a folder, not a file: ${path}`;
  return `Unexpected error: ${error?.message ?? error}`;
}
