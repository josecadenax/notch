# Demo guide (5 minutes)

The judging criteria weigh the live demo at 35%, Stellar integration at 20%, errors and security at 15%, use case at 15% and pitch plus README at 15%. The timing below follows that weight.

| Time | What to show | Criterion |
|---|---|---|
| 0:00 to 0:45 | Problem and use case: who needs it and why pay per use | Use case |
| 0:45 to 2:45 | Live demo: 402, payment, 200, verification | Live demo |
| 2:45 to 3:45 | Errors: cap exceeded, duplicate, tampered file | Errors and security |
| 3:45 to 4:30 | Evidence: both transactions in Stellar Expert | Stellar integration |
| 4:30 to 5:00 | What comes next and the repo | Pitch and README |

## Before you start (5 minutes before)

- `.env` has the accounts from `npm run setup:accounts`, and the agent has USDC (each stamp costs 0.01).
- Check the agent balance: every `npm run stamp` prints it. Below 0.05 USDC, top it up before the demo.
- Terminal 1 runs `npm start`. Terminal 2 is in the repo folder. Font size large.
- Prepare two tabs: the repo README and Stellar Expert.
- **Record a backup video the day before, with everything working.** If the demo fails, the backup counts with a penalty, which is far better than a blank screen.

## 0:00 Problem and use case

"Agents now deliver reports and contracts. If someone asks whether a document existed before a deadline or was edited later, the only proof is the logs of whoever made it."

"An agent has no account, no credit card and no contract with a timestamp provider. What it can do is pay one cent per call. That is why Notch charges with x402: no sign-up, no API key, no subscription. The agent pays only for the stamps it gets."

## 0:45 Live demo

Each stamp needs a new document, because a hash is stamped once.

```
echo "Quarterly report, draft $(date +%s)" > report.txt
```

Show that the API asks for payment first:

```
curl -i -X POST localhost:3001/stamp -H 'content-type: application/json' \
  -d "{\"hash\":\"$(shasum -a 256 report.txt | cut -d' ' -f1)\"}" | head -1
```

It answers `402 Payment Required`. Now the agent pays and gets the stamp:

```
npm run stamp -- report.txt
```

Say while it runs: it hashes locally (the file never leaves), asks the price, checks balance and cap, pays 0.01 USDC with x402, and gets the proof. Copy the `tx` of the stamp, then verify:

```
npm run verify -- report.txt <stamp tx>
```

## 2:45 Errors (all of these were run against real testnet)

Spending cap. The agent refuses before signing anything:

```
echo "Second report $(date +%s)" > report2.txt
SPEND_CAP='$0.005' npm run stamp -- report2.txt
```

Expected: `Refused: the API charges more than the cap ($0.005). Nothing was signed or sent.`

Duplicate. The same file again, with no charge:

```
npm run stamp -- report.txt
```

Expected: `Already stamped, nothing was charged`, and the balance does not move.

Tampered file. Change one character and verify again:

```
echo "edited" >> report.txt
npm run verify -- report.txt <stamp tx>
```

Expected: `INVALID: the memo does not match this hash`.

Mention without running, they are in the tests and in `docs/architecture.md`: insufficient balance (the agent stops before signing), Stellar unreachable (the API answers 502 and x402 does not settle, so the agent is not charged) and an invalid payment (the API answers 402 again).

## 3:45 Evidence

Open the `Stamp:` link: the memo is the SHA-256 of the file and the date is the ledger close time. Open the `Paid:` link: 0.01 USDC from the agent to the payee. Both are in Stellar Expert, no need to trust Notch.

## 4:30 What comes next

- An MCP server, so Claude Desktop or Cursor can stamp files with a small, capped wallet.
- Batching hashes in a Merkle tree to cut the cost per stamp.
- Mainnet, once the testnet limits are covered.

Close with the repo: README that runs from a clean clone, 21 tests in green and a CI badge.

## If something fails

| You see | Do this |
|---|---|
| `Missing AGENT_SECRET` | Run `npm run setup:accounts` |
| `The API did not answer` | Start the API in terminal 1 |
| `Not enough balance` | Run `npm run setup:accounts` with an empty `.env`, or fund the agent at https://faucet.circle.com |
| `Already stamped` | Use a new file, the hash was stamped before |
| Facilitator or Horizon timeout | Wait a few seconds and try again: a 502 is never charged |
| Anything else live | Switch to the backup video and keep talking over it |
