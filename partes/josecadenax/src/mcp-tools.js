import { homedir } from "node:os";
import { resolve } from "node:path";
import { sha256File } from "./hash.js";
import { verifyStamp } from "./verifier.js";
import { createStampClient, assertSafeApiUrl, NotchError } from "./stamp-client.js";
import { PUBLIC_API_URL, PUBLIC_PAYEE, PUBLIC_STAMPER } from "./config.js";

// Reads the MCP server settings from environment variables.
// The public deployment is pinned by default (payee and stamper); any other API needs its own pin.
export function readSettings(env = process.env) {
  const apiUrl = (env.NOTCH_API_URL || PUBLIC_API_URL).replace(/\/+$/, "");
  const isPublic = apiUrl === PUBLIC_API_URL;
  return {
    secret: env.AGENT_SECRET,
    apiUrl,
    spendCap: env.SPEND_CAP || "$0.02",
    expectedPayee: env.EXPECTED_PAYEE || (isPublic ? PUBLIC_PAYEE : undefined),
    stamperPublic: env.NOTCH_STAMPER || (isPublic ? PUBLIC_STAMPER : undefined),
  };
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

  async function stampFile({ path }) {
    try {
      client ??= createClient({
        secret: settings.secret,
        apiUrl: settings.apiUrl,
        spendCap: settings.spendCap,
        expectedPayee: settings.expectedPayee,
      });
      const hash = await sha256File(expandPath(path));
      const result = await client.stamp(hash);
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

  return { stampFile, verifyFile };
}

function describeError(error, path) {
  if (error instanceof NotchError) return `${error.message} [${error.code}]`;
  if (error?.code === "ENOENT") return `The file was not found: ${path}`;
  if (error?.code === "EISDIR") return `That path is a folder, not a file: ${path}`;
  return `Unexpected error: ${error?.message ?? error}`;
}
