# Demo guide (5 minutes)

The judging criteria weigh the live demo at 35%, Stellar integration at 20%, errors and security at 15%, use case at 15% and pitch plus README at 15%. The timing below follows that weight.

The demo runs against the **public API** (deployed on Railway, Stellar testnet), so the audience sees a real service, not a localhost.

| Time | What to show | Criterion |
|---|---|---|
| 0:00 to 0:45 | Problem and use case: who needs it and why pay per use | Use case |
| 0:45 to 2:00 | Live demo from the terminal: 402, payment, 200, verification | Live demo |
| 2:00 to 3:00 | The same from Claude Desktop (MCP): "stamp this file" | Live demo |
| 3:00 to 3:45 | Errors: cap exceeded, duplicate, tampered file | Errors and security |
| 3:45 to 4:30 | Evidence: both transactions in Stellar Expert | Stellar integration |
| 4:30 to 5:00 | What comes next and the repo | Pitch and README |

## Before you start (5 minutes before)

- **The public API is up:**

  ```
  curl -s https://notch-production-721b582b.up.railway.app/ | head -c 80
  ```

  It must print `{"name":"Notch","network":"stellar:testnet"...`.
- **The agent wallet has USDC.** In Claude Desktop ask *"check my Notch balance"*. Each stamp costs 0.01. Below 0.05 USDC, top it up at https://faucet.circle.com (Stellar testnet) to the wallet address it shows.
- **Claude Desktop shows `notch-testnet`** with three tools (`stamp_file`, `verify_stamp`, `check_balance`). If not, quit it with Cmd+Q and open it again. Setup is in [mcp.md](mcp.md).
- Terminal in the repo folder, font size large, with the API pointed at the public server:

  ```
  export API_URL=https://notch-production-721b582b.up.railway.app
  ```

  `npm run stamp` then pays only the Notch payee account, which is pinned by default for this URL.
- Prepare two tabs: the repo README and Stellar Expert.
- **Record a backup video the day before, with everything working.** If the demo fails, the backup counts with a penalty, which is far better than a blank screen.

## 0:00 Problem and use case

"Agents now deliver reports and contracts. If someone asks whether a document existed before a deadline or was edited later, the only proof is the logs of whoever made it."

"An agent has no account, no credit card and no contract with a timestamp provider. What it can do is pay one cent per call. That is why Notch charges with x402: no sign-up, no API key, no subscription. The agent pays only for the stamps it gets."

## 0:45 Live demo (terminal)

Each stamp needs a new document, because a hash is stamped once.

```
echo "Quarterly report, draft $(date +%s)" > report.txt
```

Show that the API asks for payment first:

```
curl -i -X POST $API_URL/stamp -H 'content-type: application/json' \
  -d "{\"hash\":\"$(shasum -a 256 report.txt | cut -d' ' -f1)\"}" | head -1
```

It answers `402 Payment Required`. Now the agent pays and gets the stamp:

```
npm run stamp -- report.txt
```

Say while it runs: it hashes locally (the file never leaves), asks the price, checks the payee, the balance and the cap, pays 0.01 USDC with x402, and gets the proof. Copy the `tx` of the stamp, then verify:

```
npm run verify -- report.txt <stamp tx>
```

## 2:00 The same from Claude Desktop (MCP)

"An agent is usually an AI assistant, so Notch also works as a tool for Claude."

Create a new file and give Claude its absolute path:

```
echo "Contract draft $(date +%s)" > contract.txt && echo "$PWD/contract.txt"
```

In Claude Desktop:

1. *"Stamp this file with Notch: /full/path/contract.txt"* (allow the tool when asked)
2. *"Verify that file"*

Say: "My wallet pays, on my machine. The server never sees my key, and my agent only pays the account it trusts."

## 3:00 Errors (all of these were run against real testnet)

Spending cap. The agent refuses before signing anything:

```
echo "Second report $(date +%s)" > report2.txt
SPEND_CAP='$0.005' npm run stamp -- report2.txt
```

Expected: `The API charges more than the cap ($0.005). Nothing was signed or sent.`

Duplicate. The same file again, with no charge:

```
npm run stamp -- report.txt
```

Expected: `Already stamped, nothing was charged`, and the balance does not move.

Tampered file. Change one character and verify again, in the terminal or by asking Claude to verify the file:

```
echo "edited" >> report.txt
npm run verify -- report.txt <stamp tx>
```

Expected: `INVALID: the memo does not match this hash`.

Fake API. Optional, strong for the security criterion:

```
API_URL=https://evil.example.com npm run stamp -- report2.txt
```

Expected: `For an API outside this machine, set EXPECTED_PAYEE...`. The agent refuses to talk to a server it was not told to trust, and if a trusted URL ever asked to be paid to another account it would stop before signing.

Mention without running, they are in the tests and in [architecture.md](architecture.md): insufficient balance (the agent stops before signing), Stellar unreachable (the API answers 502 and x402 does not settle, so the agent is not charged) and an invalid payment (the API answers 402 again).

## 3:45 Evidence

Open the `Stamp:` link: the memo is the SHA-256 of the file and the date is the ledger close time. Open the `Paid:` link: 0.01 USDC from the agent to the payee. Both are in Stellar Expert, no need to trust Notch.

## 4:30 What comes next

- **Mainnet.** Each user uses their own funded wallet, with the spending cap and the pinned payee the client already enforces. Later, the limit could also be enforced by the account itself, for example with smart accounts, so a leaked key cannot spend more than a policy allows. That is an option, not a requirement.
- Batching hashes in a Merkle tree to cut the cost per stamp.

Be clear about where it stands today: Stellar testnet, and the paying wallet belongs to the user (Notch never creates or holds it).

Close with the repo: README that runs from a clean clone, 57 tests in green, a CI badge and a live API.

## If something fails

| You see | Do this |
|---|---|
| `Missing AGENT_SECRET` | Create your wallet with `npm run setup:accounts -- --agent-only` and put its `AGENT_SECRET` in `.env` |
| `The API did not answer` | Check the public URL. If Railway is down, run `npm start` in a second terminal and use `API_URL=http://localhost:3001` |
| `PAYEE_MISMATCH` | Stop. The API asked to pay an account other than the expected one. Do not continue until you know why |
| `INSUFFICIENT_BALANCE` | Top up the wallet at https://faucet.circle.com (Stellar testnet) |
| `Already stamped` | Use a new file, the hash was stamped before |
| `notch-testnet` is missing in Claude Desktop | Quit it with Cmd+Q and reopen. Check `~/Library/Logs/Claude/mcp-server-notch-testnet.log` |
| Facilitator or Horizon timeout | Wait a few seconds and try again: a 502 is never charged |
| Anything else live | Switch to the backup video and keep talking over it |
