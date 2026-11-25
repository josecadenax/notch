import { sha256File } from "./hash.js";
import { API_URL, PUBLIC_API_URL, PUBLIC_PAYEE, IS_MAINNET } from "./config.js";
import { createStampClient, NotchError } from "./stamp-client.js";

// An agent that stamps a file: hashes it locally, pays with x402 and prints the proof.
// Only the hash leaves the machine, never the file.
// Usage: npm run stamp -- <file>
const SPEND_CAP = process.env.SPEND_CAP || "$0.02"; // most the agent will pay per stamp

const file = process.argv[2];
if (!file) {
  console.log("Usage: npm run stamp -- <file>");
  process.exit(1);
}
if (!process.env.AGENT_SECRET) {
  console.log("Missing AGENT_SECRET. Run: npm run setup:accounts");
  process.exit(1);
}

// Pay only the account we expect. For the public deployment it is pinned by default.
const expectedPayee = process.env.EXPECTED_PAYEE || (!IS_MAINNET && API_URL === PUBLIC_API_URL ? PUBLIC_PAYEE : undefined);

try {
  const client = createStampClient({
    secret: process.env.AGENT_SECRET,
    apiUrl: API_URL,
    spendCap: SPEND_CAP,
    expectedPayee,
    log: console.log,
  });
  const hash = await sha256File(file);
  console.log(`File ${file}\nSHA-256 ${hash}`);

  const result = await client.stamp(hash);
  if (result.status === "already_stamped") {
    console.log("Already stamped, nothing was charged. Existing stamp:", result.stamp);
  } else {
    console.log("Stamp:", result.stamp);
    console.log(`Paid:  ${result.paymentUrl}`);
    console.log(`Stamp: ${result.stamp.explorer}`);
  }
} catch (error) {
  if (!(error instanceof NotchError)) throw error;
  console.log(error.message);
  process.exit(1);
}
