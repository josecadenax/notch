# Notch MCP server

Lets Claude Desktop (or any MCP client) stamp and verify files against the public Notch API.
It runs **on your computer** as a local process. Claude starts it; nothing is hosted for you.

```
Claude Desktop ──stdio──> notch MCP server (your Mac) ──https + x402──> Notch API (Railway) ──> Stellar
                          hashes the file locally
                          holds the agent wallet
```

Only the SHA-256 of a file leaves your computer, never the file itself.

## Tools

| Tool | Cost | What it does |
|---|---|---|
| `stamp_file(path)` | 0.01 USDC | Hashes the file, pays with x402 and anchors the hash on Stellar. Stamping the same file twice is refused without charge and returns the existing stamp |
| `verify_stamp(path, tx?)` | free | Checks the file against a stamp, directly on Stellar. If `tx` is omitted it is looked up by the file's hash |
| `check_balance()` | free | Shows the paying wallet, its USDC balance, how many stamps it can still pay, the spend cap and the only account it will pay. Never shows the secret |

## Your wallet

Stamps are paid from **your own wallet**, the "paying wallet" or agent wallet. It is a Stellar account that only you hold:

- It is created on your computer and its secret key (`AGENT_SECRET`) never goes to Notch or to any server.
- The MCP server uses it to sign each payment. Anyone who has the secret can spend its balance, so keep it private.
- **Use a dedicated wallet with a small balance**, not a wallet you use for anything else.

Create one (testnet, free) with a single command from the project folder:

```bash
npm run setup:accounts -- --agent-only
```

This creates a new wallet, funds it with test XLM, buys 1 USDC of test money for it (enough for about 100 stamps) and saves its keys in `.env.agent`, readable only by you. It prints the wallet address. It never overwrites an existing `.env.agent`.

To top it up later, send test USDC to the wallet address from <https://faucet.circle.com> (choose Stellar testnet). Ask Claude *"check my Notch balance"* at any time to see how many stamps are left.

> The default `npm run setup:accounts` (without `--agent-only`) is for people who run their own Notch server: it also creates the payee and stamper accounts.

## Setup

1. Get the code and install dependencies (Node 22 or newer):

   ```bash
   git clone https://github.com/josecadenax/notch.git
   cd notch
   npm install
   ```

2. Create your paying wallet, as shown above (`npm run setup:accounts -- --agent-only`). Open `.env.agent` and copy the `AGENT_SECRET=...` value.

3. Find the absolute path of Node, because Claude Desktop does not read your shell profile:

   ```bash
   which node
   ```

4. Edit Claude Desktop's config (`~/Library/Application Support/Claude/claude_desktop_config.json`) and add `notch` inside `mcpServers`:

   ```json
   {
     "mcpServers": {
       "notch": {
         "command": "/absolute/path/to/node",
         "args": ["/absolute/path/to/notch/partes/josecadenax/src/mcp-server.js"],
         "env": {
           "AGENT_SECRET": "S...your wallet secret..."
         }
       }
     }
   }
   ```

5. Quit Claude Desktop completely (Cmd+Q) and open it again. Ask: *"Check my Notch balance"*, then *"Stamp /Users/me/Documents/contract.pdf with Notch"* and *"Verify that file"*.

Use **absolute paths** for files. Claude Desktop does not run in your project folder.

## Settings

All settings are environment variables in the `env` block above.

| Variable | Default | Meaning |
|---|---|---|
| `AGENT_SECRET` | none, required to stamp | Wallet that pays. Never leaves your machine. Not needed to verify |
| `SPEND_CAP` | `$0.02` | Most the server will pay for one stamp. If the API asks for more, nothing is signed |
| `NOTCH_API_URL` | the public Notch API | API to talk to |
| `EXPECTED_PAYEE` | pinned for the public API | Stellar account that must receive the payment. Required for any other API |
| `NOTCH_STAMPER` | pinned for the public API | Stellar account that signs stamps, used to tell whether a stamp was issued by that Notch |

## Safety rules

The server enforces these before it signs anything:

- **Pinned payee.** The API says who to pay. If that account is not `EXPECTED_PAYEE`, the payment is refused, so a fake or hijacked API cannot collect your money. For the public API the payee is already pinned. For any other API you must set it.
- **https required.** Plain `http` is only accepted for `localhost`.
- **Spend cap.** Each stamp is limited to `SPEND_CAP`. x402 refuses to sign above it.
- **Balance check.** Without enough USDC nothing is signed.
- **Pay once.** There are no blind retries after a payment is sent. If something fails midway, the message says whether the balance changed.
- **No duplicates.** Stamping a file that is already stamped is not charged.

What it cannot protect you from: the wallet in `AGENT_SECRET` is only as safe as your computer. Keep its balance small.

## Running against your own server

```json
"env": {
  "AGENT_SECRET": "S...",
  "NOTCH_API_URL": "https://my-notch.example.com",
  "EXPECTED_PAYEE": "G...the payee account of that server...",
  "NOTCH_STAMPER": "G...the stamper account of that server..."
}
```

For local development, `NOTCH_API_URL=http://localhost:3001` needs no `EXPECTED_PAYEE`.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Claude shows the server as failed | `command` is not the absolute path to Node, or the `args` path is wrong. Check Claude's MCP log |
| "Missing AGENT_SECRET" | The `env` block is missing or the key is empty. Create a wallet with `npm run setup:accounts -- --agent-only` |
| `WALLET_NOT_FOUND` | The wallet was never funded. Run `npm run setup:accounts -- --agent-only` or fund the address with test XLM from Friendbot |
| `PAYEE_MISMATCH` | The API is asking to pay an account other than `EXPECTED_PAYEE`. Do not continue until you know why |
| `INSUFFICIENT_BALANCE` | The agent wallet has less than 0.01 USDC |
| `API_UNREACHABLE` | The API is down or you are offline. Nothing was paid |
| "The file was not found" | Use an absolute path |

## Try it without Claude

```bash
npm run mcp   # starts the server on stdio, waits for an MCP client
```

The tests cover the logic without a network: `npm test`.
