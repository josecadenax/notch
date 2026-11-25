// Read-only check of the Stellar accounts Notch uses, on the configured network. It sends nothing and
// costs nothing: it only reads balances from Horizon. Secrets are never printed.
//
// Usage (testnet or mainnet, depending on STELLAR_NETWORK):
//   node --env-file=.env.mainnet --env-file-if-exists=.env.mainnet-agent partes/josecadenax/scripts/check-accounts.js
//   npm run accounts:check               # reads .env
import { Horizon, Keypair } from "@stellar/stellar-sdk";
import { HORIZON_URL, NETWORK_LABEL, IS_MAINNET, USDC, PRICE } from "../src/config.js";

const horizon = new Horizon.Server(HORIZON_URL);

// An account must keep a reserve: 1 XLM base plus 0.5 XLM for each trustline or other entry.
const reserveOf = (account) => (2 + account.subentry_count) * 0.5;

const agentPublic = process.env.AGENT_PUBLIC || (process.env.AGENT_SECRET ? Keypair.fromSecret(process.env.AGENT_SECRET).publicKey() : undefined);
const roles = [
  { name: "payee", address: process.env.PAYEE_PUBLIC, usdcTrustline: true, minFree: 0 },
  { name: "stamper", address: process.env.STAMPER_PUBLIC, usdcTrustline: false, minFree: 0.5 },
  { name: "agent", address: agentPublic, usdcTrustline: true, minFree: 0, minUsdc: Number(PRICE.replace("$", "")) },
];

console.log(`Network: ${NETWORK_LABEL}${IS_MAINNET ? " (REAL money)" : " (test money)"}\nHorizon: ${HORIZON_URL}\n`);

let problems = 0;
let checked = 0;
for (const role of roles) {
  if (!role.address) continue;
  checked++;
  const issues = [];
  let line;
  try {
    const account = await horizon.loadAccount(role.address);
    const xlm = Number(account.balances.find((b) => b.asset_type === "native").balance);
    const free = xlm - reserveOf(account);
    const usdcLine = account.balances.find((b) => b.asset_code === USDC.code && b.asset_issuer === USDC.issuer);
    const usdc = usdcLine ? Number(usdcLine.balance) : 0;
    line = `exists, ${xlm.toFixed(4)} XLM (${free.toFixed(4)} free above the reserve), USDC ${usdcLine ? usdc.toFixed(4) : "no trustline"}`;
    if (role.usdcTrustline && !usdcLine) issues.push(`no USDC trustline: add it (costs 0.5 XLM of reserve)`);
    if (free < role.minFree) issues.push(`needs at least ${role.minFree} XLM free above the reserve to pay fees`);
    if (role.minUsdc && usdc < role.minUsdc) issues.push(`has less than one stamp of USDC (${role.minUsdc})`);
  } catch (error) {
    if (error.response?.status !== 404) throw error;
    line = "does not exist on the ledger yet";
    issues.push("fund it with XLM to activate it (the first deposit must cover the 1 XLM base reserve)");
  }
  console.log(`${role.name.padEnd(8)} ${role.address}\n         ${line}`);
  for (const issue of issues) console.log(`         PROBLEM: ${issue}`);
  problems += issues.length;
}

if (!checked) {
  console.log("No accounts to check: set PAYEE_PUBLIC, STAMPER_PUBLIC and/or AGENT_PUBLIC (or AGENT_SECRET).");
  process.exit(1);
}
console.log(problems ? `\n${problems} problem(s) found.` : "\nAll good.");
process.exit(problems ? 1 : 0);
