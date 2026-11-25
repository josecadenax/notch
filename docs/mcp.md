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

## Setup

1. Get the code and install dependencies (Node 22 or newer):

   ```bash
   git clone https://github.com/josecadenax/notch.git
   cd notch
   npm install
   ```

2. Create a wallet for the agent and fund it (testnet). Use `npm run setup:accounts` and copy only the `AGENT_SECRET` line.
   **Use a dedicated wallet with a small balance.** The MCP server can spend whatever this wallet holds, up to the spend cap per stamp.

3. Find the absolute path of Node, because Claude Desktop does not read your shell profile:

   ```bash
   which node
   ```

4. Edit Claude Desktop's config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

   ```json
   {
     "mcpServers": {
       "notch": {
         "command": "/absolute/path/to/node",
         "args": ["/absolute/path/to/notch/partes/josecadenax/src/mcp-server.js"],
         "env": {
           "AGENT_SECRET": "S...your agent wallet secret..."
         }
       }
     }
   }
   ```

5. Quit and reopen Claude Desktop. Ask: *"Stamp /Users/me/Documents/contract.pdf with Notch"* and then *"Verify that file"*.

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
| "Missing AGENT_SECRET" | The `env` block is missing or the key is empty |
| `PAYEE_MISMATCH` | The API is asking to pay an account other than `EXPECTED_PAYEE`. Do not continue until you know why |
| `INSUFFICIENT_BALANCE` | The agent wallet has less than 0.01 USDC |
| `API_UNREACHABLE` | The API is down or you are offline. Nothing was paid |
| "The file was not found" | Use an absolute path |

## Try it without Claude

```bash
npm run mcp   # starts the server on stdio, waits for an MCP client
```

The tests cover the logic without a network: `npm test`.
