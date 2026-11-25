import { TransactionBuilder, Operation, BASE_FEE } from "@stellar/stellar-sdk";

// An account can only hold USDC after it adds a "trustline" to the USDC issuer. It costs a tiny fee
// and locks 0.5 XLM of the account's balance as a reserve (it comes back if the trustline is removed).

const TRUSTLINE_RESERVE = 0.5;
const FEE_XLM = Number(BASE_FEE) / 1e7;

// Decides what to do for an account, from the record Horizon returns for it. Pure, so it can be tested.
export function planTrustline(record, asset) {
  const has = record.balances.some((b) => b.asset_code === asset.code && b.asset_issuer === asset.issuer);
  if (has) return { action: "exists" };
  const xlm = Number(record.balances.find((b) => b.asset_type === "native").balance);
  const free = xlm - (2 + record.subentry_count) * 0.5;
  const needed = TRUSTLINE_RESERVE + FEE_XLM;
  if (free < needed) return { action: "insufficient", free, needed };
  return { action: "add", free, needed };
}

// The transaction that adds the trustline.
export function buildTrustlineTransaction(account, asset, networkPassphrase) {
  return new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase })
    .addOperation(Operation.changeTrust({ asset }))
    .setTimeout(60)
    .build();
}
