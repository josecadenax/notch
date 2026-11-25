import { HORIZON_URL } from "./config.js";
import { isValidHash } from "./hash.js";

// Checks on Stellar that transaction `tx` carries `hash` in its memo.
// Returns { valid, reasons, stampedAt, ledger, issuedByNotch }.
export async function verifyStamp({ hash, tx }, { horizonUrl = HORIZON_URL, stamperPublic, fetchFn = fetch } = {}) {
  if (!isValidHash(hash)) return { valid: false, reasons: ["hash must be 64 lowercase hex characters"] };
  if (!/^[0-9a-f]{64}$/.test(tx || "")) return { valid: false, reasons: ["tx must be a 64 character transaction hash"] };

  const response = await fetchFn(`${horizonUrl}/transactions/${tx}`);
  if (response.status === 404) return { valid: false, reasons: ["transaction not found on the network"] };
  if (!response.ok) throw new Error(`Horizon answered ${response.status}`);
  const record = await response.json();

  const reasons = [];
  if (!record.successful) reasons.push("the transaction did not succeed");
  if (record.memo_type !== "hash") reasons.push(`the memo is not a hash memo (${record.memo_type})`);
  else if (Buffer.from(record.memo, "base64").toString("hex") !== hash) reasons.push("the memo does not match this hash");

  return {
    valid: reasons.length === 0,
    reasons,
    stampedAt: record.created_at,
    ledger: record.ledger,
    // Anyone can write a hash memo; this tells whether Notch's stamper account wrote this one.
    issuedByNotch: stamperPublic ? record.source_account === stamperPublic : undefined,
  };
}
