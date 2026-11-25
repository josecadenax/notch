// Creates the three testnet accounts Notch needs and appends their keys to .env:
//   payee   receives the 0.01 USDC paid for each stamp
//   stamper signs the stamp transactions and pays their XLM fee
//   agent   the wallet of the client that pays for stamps (gets 1 USDC of test money)
import { Keypair, Horizon, TransactionBuilder, Operation, Asset, BASE_FEE } from "@stellar/stellar-sdk";
import { appendFileSync } from "node:fs";
import { HORIZON_URL, NETWORK_PASSPHRASE, USDC, EXPLORER_TX_URL } from "../src/config.js";

const horizon = new Horizon.Server(HORIZON_URL);
const AGENT_USDC = "1";

if (process.env.PAYEE_PUBLIC || process.env.STAMPER_SECRET || process.env.AGENT_SECRET) {
  console.log("Accounts already configured in .env. Delete those lines to start over.");
  process.exit(0);
}

async function fundedAccount(label, { usdcTrustline }) {
  const keypair = Keypair.random();
  const friendbot = await fetch(`https://friendbot.stellar.org?addr=${keypair.publicKey()}`);
  if (!friendbot.ok) throw new Error(`Friendbot failed for ${label}: ${friendbot.status}`);
  if (usdcTrustline) {
    const account = await horizon.loadAccount(keypair.publicKey());
    const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE })
      .addOperation(Operation.changeTrust({ asset: USDC }))
      .setTimeout(60)
      .build();
    tx.sign(keypair);
    await horizon.submitTransaction(tx);
  }
  console.log(`${label}: ${keypair.publicKey()}`);
  return keypair;
}

const payee = await fundedAccount("payee  ", { usdcTrustline: true });
const stamper = await fundedAccount("stamper", { usdcTrustline: false });
const agent = await fundedAccount("agent  ", { usdcTrustline: true });

// The agent buys test USDC with its own test XLM (path payment XLM -> USDC).
const paths = await horizon.strictReceivePaths([Asset.native()], USDC, AGENT_USDC).call();
if (!paths.records.length) {
  throw new Error("No XLM to USDC path right now. Get USDC at https://faucet.circle.com (Stellar testnet).");
}
const best = paths.records[0];
const account = await horizon.loadAccount(agent.publicKey());
const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE })
  .addOperation(
    Operation.pathPaymentStrictReceive({
      sendAsset: Asset.native(),
      sendMax: (Number(best.source_amount) * 1.05).toFixed(7),
      destination: agent.publicKey(),
      destAsset: USDC,
      destAmount: AGENT_USDC,
      path: best.path.map((p) => (p.asset_type === "native" ? Asset.native() : new Asset(p.asset_code, p.asset_issuer))),
    }),
  )
  .setTimeout(60)
  .build();
tx.sign(agent);
const result = await horizon.submitTransaction(tx);
console.log(`agent funded with ${AGENT_USDC} USDC: ${EXPLORER_TX_URL}${result.hash}`);

appendFileSync(
  ".env",
  [
    `PAYEE_PUBLIC=${payee.publicKey()}`,
    `STAMPER_PUBLIC=${stamper.publicKey()}`,
    `STAMPER_SECRET=${stamper.secret()}`,
    `AGENT_PUBLIC=${agent.publicKey()}`,
    `AGENT_SECRET=${agent.secret()}`,
    "",
  ].join("\n"),
);
console.log("Keys saved to .env (never committed).");
