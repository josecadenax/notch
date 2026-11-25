// Creates the testnet accounts Notch needs and appends their keys to an env file:
//   payee   receives the 0.01 USDC paid for each stamp
//   stamper signs the stamp transactions and pays their XLM fee
//   agent   the wallet of the client that pays for stamps (gets 1 USDC of test money)
//
// Usage:
//   npm run setup:accounts                                       all three accounts, into .env
//   npm run setup:accounts -- --server-only --out .env.production
//                                                                 payee and stamper only, for a deployed server
//   npm run setup:accounts -- --agent-only                       only the paying wallet, into .env.agent
//                                                                 (for people who just use the CLI or the MCP server)
import { Keypair, Horizon, TransactionBuilder, Operation, Asset, BASE_FEE } from "@stellar/stellar-sdk";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { HORIZON_URL, NETWORK_PASSPHRASE, USDC, EXPLORER_TX_URL } from "../src/config.js";

const horizon = new Horizon.Server(HORIZON_URL);
const AGENT_USDC = "1";

const args = process.argv.slice(2);
const serverOnly = args.includes("--server-only");
const agentOnly = args.includes("--agent-only");
if (serverOnly && agentOnly) throw new Error("Use --server-only or --agent-only, not both");
const outFile = args.includes("--out") ? args[args.indexOf("--out") + 1] : agentOnly ? ".env.agent" : ".env";
if (!outFile) throw new Error("--out needs a path");

// Never overwrite keys that already exist: losing a secret means losing the money in that wallet.
const existingKeys = agentOnly ? /^AGENT_SECRET=\S/m : /^(PAYEE_PUBLIC|STAMPER_SECRET|AGENT_SECRET)=\S/m;
if (existsSync(outFile) && existingKeys.test(readFileSync(outFile, "utf8"))) {
  console.log(`Accounts already configured in ${outFile}. Delete those lines to start over.`);
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

const payee = agentOnly ? null : await fundedAccount("payee  ", { usdcTrustline: true });
const stamper = agentOnly ? null : await fundedAccount("stamper", { usdcTrustline: false });
let agent = null;
if (!serverOnly) {
  agent = await fundedAccount("agent  ", { usdcTrustline: true });

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
}

const lines = [];
if (payee) lines.push(`PAYEE_PUBLIC=${payee.publicKey()}`);
if (stamper) lines.push(`STAMPER_PUBLIC=${stamper.publicKey()}`, `STAMPER_SECRET=${stamper.secret()}`);
if (agent) lines.push(`AGENT_PUBLIC=${agent.publicKey()}`, `AGENT_SECRET=${agent.secret()}`);
// 0600: only the owner can read the secrets (applies when the file is created).
appendFileSync(outFile, `${lines.join("\n")}\n`, { mode: 0o600 });
console.log(`Keys saved to ${outFile} (never committed).`);
if (agentOnly) {
  console.log(`\nYour paying wallet: ${agent.publicKey()}`);
  console.log(`Next: put the AGENT_SECRET line of ${outFile} in your MCP client settings. See docs/mcp.md.`);
  console.log("Keep this wallet's balance small. Anyone with the secret can spend it.");
}
