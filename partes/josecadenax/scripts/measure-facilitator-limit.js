// Measures how many stamps one facilitator API key supports before its fee limit is reached.
// It stamps random hashes one after another against a LOCAL Notch server until a payment fails
// (for example FEE_LIMIT_EXCEEDED) or the maximum is reached, then reports the fees consumed.
//
// Each stamp costs the agent 0.01 USDC. Run it on testnet only, against a local server:
//   terminal 1:  FACILITATOR_URL=... FACILITATOR_API_KEY=... PORT=3002 npm start
//   terminal 2:  API_URL=http://localhost:3002 node --env-file=.env partes/josecadenax/scripts/measure-facilitator-limit.js 50
import { randomBytes } from "node:crypto";
import { createStampClient } from "../src/stamp-client.js";
import { API_URL, HORIZON_URL } from "../src/config.js";

const max = Number(process.argv[2] || 50);
const host = new URL(API_URL).hostname;
if (!["localhost", "127.0.0.1", "[::1]"].includes(host)) {
  console.log(`Refusing to run against ${host}. Point API_URL to a local server so the public API is not filled with test stamps.`);
  process.exit(1);
}
if (!process.env.AGENT_SECRET) {
  console.log("Missing AGENT_SECRET.");
  process.exit(1);
}

const client = createStampClient({ secret: process.env.AGENT_SECRET, apiUrl: API_URL, retries: 1 });
console.log(`Measuring against ${API_URL}, up to ${max} stamps (0.01 USDC each).\n`);

const paid = [];
let stopped = null;
for (let n = 1; n <= max; n++) {
  const started = Date.now();
  try {
    const result = await client.stamp(randomBytes(32).toString("hex"));
    if (result.status !== "stamped") throw new Error(`unexpected result ${result.status}`);
    paid.push({ n, paymentTx: result.paymentTx });
    console.log(`#${n} ok (${((Date.now() - started) / 1000).toFixed(1)}s) ledger ${result.stamp.ledger}`);
  } catch (error) {
    stopped = { n, code: error.code ?? "ERROR", message: String(error.message).slice(0, 300) };
    console.log(`#${n} FAILED (${stopped.code}): ${stopped.message}`);
    break;
  }
}

// Fees the facilitator paid for each settlement, read from Stellar.
let totalFee = 0;
const feeAccounts = new Set();
for (const { paymentTx } of paid) {
  const record = await (await fetch(`${HORIZON_URL}/transactions/${paymentTx}`)).json();
  totalFee += Number(record.fee_charged);
  feeAccounts.add(record.fee_account);
}

console.log("\n--- Result");
console.log(`Paid stamps: ${paid.length}`);
console.log(`Stopped: ${stopped ? `at #${stopped.n} with ${stopped.code}` : `no limit reached after ${max} stamps`}`);
if (paid.length) {
  console.log(`Fees consumed: ${totalFee} stroops (${(totalFee / 1e7).toFixed(5)} XLM), average ${Math.round(totalFee / paid.length)} per stamp`);
  console.log(`Fee accounts used: ${feeAccounts.size}`);
}
