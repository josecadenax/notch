import { x402Client, x402HTTPClient, wrapFetchWithPayment } from "@x402/fetch";
import { createEd25519Signer } from "@x402/stellar";
import { ExactStellarScheme } from "@x402/stellar/exact/client";
import { sha256File } from "./hash.js";
import { API_URL, NETWORK, SOROBAN_RPC_URL, HORIZON_URL, EXPLORER_TX_URL } from "./config.js";

// An agent that stamps a file: hashes it locally, pays with x402 and prints the proof.
// Only the hash leaves the machine, never the file.
// Usage: npm run stamp -- <file>
const SPEND_CAP = process.env.SPEND_CAP || "$0.02"; // most the agent will pay per stamp
const RETRIES = 3; // retries only while the API is unreachable, never after paying
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const file = process.argv[2];
if (!file) {
  console.log("Usage: npm run stamp -- <file>");
  process.exit(1);
}
if (!process.env.AGENT_SECRET) {
  console.log("Missing AGENT_SECRET. Run: npm run setup:accounts");
  process.exit(1);
}

// The agent signs with its own wallet, never with the payee or stamper keys.
const signer = createEd25519Signer(process.env.AGENT_SECRET, NETWORK);
const client = x402Client.fromConfig({
  schemes: [{ network: "stellar:*", client: new ExactStellarScheme(signer, { url: SOROBAN_RPC_URL }) }],
  // Spending cap: if the API asks for more, x402 refuses BEFORE signing anything.
  spendControls: { maxAmountPerPayment: SPEND_CAP },
});
const http = new x402HTTPClient(client);
const payingFetch = wrapFetchWithPayment(fetch, client);

// USDC balance in stroops (7 decimals).
async function usdcBalance() {
  const response = await fetch(`${HORIZON_URL}/accounts/${signer.address}`);
  const balance = (await response.json()).balances.find((b) => b.asset_code === "USDC");
  return balance ? Math.round(Number(balance.balance) * 1e7) : 0;
}

const hash = await sha256File(file);
const request = { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ hash }) };
console.log(`File ${file}\nSHA-256 ${hash}`);

// 1. Ask the price WITHOUT paying. If the API is unreachable, retry with growing waits.
let price;
for (let attempt = 1; ; attempt++) {
  try {
    const response = await fetch(`${API_URL}/stamp`, request);
    if (response.status === 409) {
      console.log("Already stamped, nothing to pay:", (await response.json()).stamp);
      process.exit(0);
    }
    if (response.status !== 402) {
      console.log(`Unexpected answer ${response.status}:`, await response.text());
      process.exit(1);
    }
    price = Number(http.getPaymentRequiredResponse((name) => response.headers.get(name)).accepts[0].amount);
    break;
  } catch {
    if (attempt === RETRIES) {
      console.log(`The API did not answer after ${RETRIES} attempts. Nothing was paid.`);
      process.exit(1);
    }
    console.log(`The API did not answer (attempt ${attempt}/${RETRIES}), retrying in ${attempt}s...`);
    await wait(attempt * 1000);
  }
}

// 2. Before signing: is there enough balance?
const balance = await usdcBalance();
console.log(`Agent ${signer.address}\nPrice ${price / 1e7} USDC, balance ${balance / 1e7} USDC, cap ${SPEND_CAP}`);
if (balance < price) {
  console.log("Not enough balance. Nothing was signed.");
  process.exit(1);
}

// 3. Pay ONCE. If something fails after sending the payment, do not retry blindly: check the balance.
try {
  const response = await payingFetch(`${API_URL}/stamp`, request);
  const body = await response.json();
  if (!response.ok) {
    console.log(`Stamp refused (${response.status}):`, body);
    process.exit(1);
  }
  const settlement = http.getPaymentSettleResponse((name) => response.headers.get(name));
  console.log("Stamp:", body);
  console.log(`Paid:  ${EXPLORER_TX_URL}${settlement.transaction}`);
  console.log(`Stamp: ${body.explorer}`);
} catch (error) {
  if (String(error.message).includes("maxAmountPerPayment")) {
    console.log(`Refused: the API charges more than the cap (${SPEND_CAP}). Nothing was signed or sent.`);
    process.exit(1);
  }
  const after = await usdcBalance();
  console.log(`Payment failed: ${error.message}`);
  console.log(
    after < balance
      ? "The balance went down, so the payment may have settled. Check the wallet before trying again."
      : "The balance did not change: nothing was charged. You can try again.",
  );
  process.exit(1);
}
