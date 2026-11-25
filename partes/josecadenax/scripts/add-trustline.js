// Adds the USDC trustline to an account, so it can receive or hold USDC.
// It only does that one thing: it never moves USDC or XLM to anyone. It costs a fee of 0.00001 XLM and
// locks 0.5 XLM of the account's balance as a reserve.
//
// By default it only SHOWS what it would do. Add --yes to really send the transaction.
// The secret is read from an environment variable, never typed on the command line (it would stay in your history).
//
// Usage:
//   node --env-file=.env.mainnet partes/josecadenax/scripts/add-trustline.js PAYEE_SECRET
//   node --env-file=.env.mainnet partes/josecadenax/scripts/add-trustline.js PAYEE_SECRET --yes
//   (mainnet also needs STELLAR_NETWORK=pubnet and NOTCH_ALLOW_MAINNET=1)
import { Horizon, Keypair } from "@stellar/stellar-sdk";
import { HORIZON_URL, NETWORK_LABEL, IS_MAINNET, NETWORK_PASSPHRASE, USDC, EXPLORER_TX_URL, mainnetBlocker } from "../src/config.js";
import { planTrustline, buildTrustlineTransaction } from "../src/trustline.js";

const [variable, ...flags] = process.argv.slice(2);
const confirmed = flags.includes("--yes");
if (!variable || variable.startsWith("--") || !process.env[variable]) {
  console.log("Usage: add-trustline.js <NAME_OF_THE_ENV_VARIABLE_WITH_THE_SECRET> [--yes]");
  console.log(`The variable ${variable ? `"${variable}" is empty or missing` : "name is required"}. Example: PAYEE_SECRET or AGENT_SECRET.`);
  process.exit(1);
}
const blocked = mainnetBlocker({ isMainnet: IS_MAINNET });
if (blocked) {
  console.log(blocked);
  process.exit(1);
}

const keypair = Keypair.fromSecret(process.env[variable]);
const horizon = new Horizon.Server(HORIZON_URL);
console.log(`Network: ${NETWORK_LABEL}${IS_MAINNET ? " (REAL money)" : " (test money)"}`);
console.log(`Account: ${keypair.publicKey()}  (from ${variable})`);
console.log(`Asset:   ${USDC.code} issued by ${USDC.issuer}`);

let record;
try {
  record = await horizon.loadAccount(keypair.publicKey());
} catch (error) {
  if (error.response?.status !== 404) throw error;
  console.log("This account does not exist on the ledger yet. Fund it with XLM first.");
  process.exit(1);
}

const plan = planTrustline(record, USDC);
if (plan.action === "exists") {
  console.log("The trustline is already there. Nothing to do.");
  process.exit(0);
}
if (plan.action === "insufficient") {
  console.log(`Not enough free XLM: it needs ${plan.needed.toFixed(5)} XLM above the reserve and has ${plan.free.toFixed(5)}.`);
  process.exit(1);
}

console.log(`\nIt would add the trustline. Cost: a 0.00001 XLM fee, and 0.5 XLM becomes reserve (you have ${plan.free.toFixed(4)} XLM free).`);
if (!confirmed) {
  console.log("Nothing was sent. Run again with --yes to do it.");
  process.exit(0);
}

const transaction = buildTrustlineTransaction(record, USDC, NETWORK_PASSPHRASE);
transaction.sign(keypair);
const result = await horizon.submitTransaction(transaction);
console.log(`Done: ${EXPLORER_TX_URL}${result.hash}`);
