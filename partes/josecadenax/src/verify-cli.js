import { sha256File } from "./hash.js";
import { verifyStamp } from "./verifier.js";

// Checks a file against a stamp transaction, straight on Stellar (no Notch server needed).
// Usage: npm run verify -- <file> <tx>
const [file, tx] = process.argv.slice(2);
if (!file || !tx) {
  console.log("Usage: npm run verify -- <file> <tx>");
  process.exit(1);
}
const hash = await sha256File(file);
console.log(`File ${file}\nSHA-256 ${hash}`);
const result = await verifyStamp({ hash, tx }, { stamperPublic: process.env.STAMPER_PUBLIC });
if (result.valid) {
  console.log(`VALID: this file existed no later than ${result.stampedAt} (ledger ${result.ledger})`);
} else {
  console.log(`INVALID: ${result.reasons.join("; ")}`);
  process.exit(1);
}
