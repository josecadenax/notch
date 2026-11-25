import { Horizon, Keypair, TransactionBuilder, Operation, Asset, Memo, BASE_FEE } from "@stellar/stellar-sdk";
import { HORIZON_URL, NETWORK_PASSPHRASE } from "./config.js";

// Anchors a document hash in the memo of a Stellar transaction.
// The transaction itself does nothing: it moves 1 stroop (0.0000001 XLM) from the
// stamper account to itself. The proof is the 32-byte hash memo plus the ledger close time.
export function createStamper({ secret, horizonUrl = HORIZON_URL }) {
  const keypair = Keypair.fromSecret(secret);
  const horizon = new Horizon.Server(horizonUrl);

  // One stamp at a time: every transaction needs the next sequence number of the stamper account.
  let queue = Promise.resolve();

  async function submit(hash) {
    const account = await horizon.loadAccount(keypair.publicKey());
    const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE })
      .addOperation(
        Operation.payment({ destination: keypair.publicKey(), asset: Asset.native(), amount: "0.0000001" }),
      )
      .addMemo(Memo.hash(hash))
      .setTimeout(30)
      .build();
    tx.sign(keypair);
    const result = await horizon.submitTransaction(tx);
    // The date of the stamp is the close time of the ledger, not our clock.
    const record = result.created_at ? result : await horizon.transactions().transaction(result.hash).call();
    return { tx: result.hash, ledger: result.ledger, stampedAt: record.created_at };
  }

  return {
    publicKey: keypair.publicKey(),
    anchor(hash) {
      const run = queue.then(() => submit(hash));
      queue = run.catch(() => {});
      return run;
    },
  };
}
