# Demo guide (3 minutes)

| Time | What to show |
|---|---|
| 0:00 to 0:30 | The problem, in one sentence and one example |
| 0:30 to 2:00 | Live demo on testnet |
| 2:00 to 2:30 | The evidence: a hash open in Stellar Expert |
| 2:30 to 3:00 | What comes next |

## 0:00 Problem

"Agents now deliver reports and contracts. If someone asks whether a document existed before a deadline or was edited later, the only proof is the logs of whoever made it. Notch gives any agent an independent, dated proof for one cent."

## 0:30 Live demo

Before starting: `.env` has the accounts from `npm run setup:accounts`, and the agent has USDC.

Terminal 1, the API:

```
npm start
```

Terminal 2, the agent. Each stamp needs a new document, because a hash is stamped once:

```
echo "Quarterly report, draft $(date +%s)" > report.txt
npm run stamp -- report.txt
```

Say while it runs: the agent hashes locally, asks the price, checks its balance and cap, pays 0.01 USDC with x402, and gets the proof.

Verify the file:

```
npm run verify -- report.txt <tx from the previous output>
```

Change one character and verify again, to show it fails:

```
echo "edited" >> report.txt
npm run verify -- report.txt <same tx>
```

Optional, to show the safety nets: run `npm run stamp -- report.txt` twice with the original file and point out that the second time nothing is charged.

## 2:00 Evidence

Open the stamp transaction in Stellar Expert (the `Stamp:` link in the output). Show the memo: it is the SHA-256 of the file. Open the `Paid:` link: the 0.01 USDC payment from the agent to the payee.

## 2:30 What comes next

- An MCP server, so Claude Desktop or Cursor can stamp files with a small, capped wallet.
- Batching hashes in a Merkle tree to cut the cost per stamp.
- Mainnet, once the testnet limits are covered.

## If something fails

| You see | Do this |
|---|---|
| `Missing AGENT_SECRET` | Run `npm run setup:accounts` |
| `The API did not answer` | Start the API in terminal 1 |
| `Not enough balance` | Run `npm run setup:accounts` again with an empty `.env`, or fund the agent at https://faucet.circle.com |
| `Already stamped` | Use a new file, the hash was stamped before |
| Facilitator or Horizon timeout | Wait a few seconds and try again: nothing is charged on a 502 |
