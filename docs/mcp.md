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

Stamps are paid from **your own wallet**, the "paying wallet" or agent wallet. It is a Stellar account that only you hold, and Notch never creates, holds or sees it:

- Its secret key (`AGENT_SECRET`) never goes to Notch or to any server.
- The MCP server signs each payment on its own, without a confirmation window, so it needs the secret key itself. A wallet app that keeps the key inside it (Freighter, for example) cannot sign for it.
- Anyone who can read the secret can spend the balance, and it sits in plain text in Claude Desktop's config. **Use a dedicated account with a small balance**, never your main wallet.

### On mainnet: bring your own

Use an account you already control and have funded. There is nothing to create, only to configure:

1. **Pick the account.** It has to be one whose secret key you can export. A good choice is a new secondary account in your wallet (in Freighter, add an account), funded with a small amount. Export its secret key only when you are about to paste it into the config.
2. **Make sure it is ready.** It needs XLM for its reserve (1 XLM, plus 0.5 XLM for the USDC trustline), the USDC trustline and some USDC. If it already holds USDC it is ready.
3. **Put the secret in `AGENT_SECRET`** (see [Mainnet](#mainnet)).
4. **Check it, read-only, with its public address only** (no secret needed):

   ```bash
   STELLAR_NETWORK=pubnet AGENT_PUBLIC=G...your address... node partes/josecadenax/scripts/check-accounts.js
   ```

5. Ask Claude *"check my Notch balance"* to see the wallet, its balance and how many stamps it can pay.

If you have no account to bring, `STELLAR_NETWORK=pubnet npm run setup:accounts -- --keys-only --agent-only` makes a new key offline, with nothing on the network. You fund it yourself and must back up its secret.

### On testnet: create a test wallet

Testnet money is free, so here Notch can create and fund the wallet for you, from the project folder:

```bash
npm run setup:accounts -- --agent-only
```

This creates a new wallet, funds it with test XLM, buys 1 USDC of test money for it (enough for about 100 stamps) and saves its keys in `.env.agent`, readable only by you. It prints the wallet address. It never overwrites an existing `.env.agent`.

To top it up later, send test USDC to the wallet address from <https://faucet.circle.com> (choose Stellar testnet). Ask Claude *"check my Notch balance"* at any time to see how many stamps are left.

> The default `npm run setup:accounts` (without `--agent-only`) is for people who run their own Notch server: it also creates the payee and stamper accounts.

## Setup

The server is published on npm as [`notch-mcp`](https://www.npmjs.com/package/notch-mcp), so there is nothing to clone. You need Node 22 or newer.

1. Get your paying wallet, as shown above. On mainnet, bring your own account. On testnet, the wallet is created from the project folder (see [On testnet](#on-testnet-create-a-test-wallet)): open `.env.agent` and copy the `AGENT_SECRET=...` value.

2. Find the absolute path of `npx`, because Claude Desktop does not read your shell profile:

   ```bash
   which npx
   ```

3. Edit Claude Desktop's config (`~/Library/Application Support/Claude/claude_desktop_config.json`) and add `notch-testnet` inside `mcpServers`:

   ```json
   {
     "mcpServers": {
       "notch-testnet": {
         "command": "/absolute/path/to/npx",
         "args": ["-y", "notch-mcp"],
         "env": {
           "AGENT_SECRET": "S...your wallet secret..."
         }
       }
     }
   }
   ```

4. Quit Claude Desktop completely (Cmd+Q) and open it again. Ask: *"Check my Notch balance"*, then *"Stamp /Users/me/Documents/contract.pdf with Notch"* and *"Verify that file"*.

Use **absolute paths** for files. Claude Desktop does not run in your project folder.

### Running from a clone instead

If you prefer to run the code from a clone (to read or change it), use `node` and the path of the script:

```bash
git clone https://github.com/josecadenax/notch.git
cd notch
npm install
```

```json
"command": "/absolute/path/to/node",
"args": ["/absolute/path/to/notch/partes/josecadenax/src/mcp-server.js"]
```

### Testnet and mainnet side by side

Give each network its own entry (`notch-testnet`, `notch-mainnet`), each with its own wallet, and keep only one in the config at a time. With both present Claude sees two almost identical tools and may pick the wrong one, and the mainnet one spends real money.

## Mainnet

Everything above uses testnet and test money. Mainnet uses **real money**, so it is never on by accident: you have to ask for it, name everything it needs, and there are no defaults to fall back on. The full plan is in [mainnet.md](mainnet.md).

Add a `notch-mainnet` entry. `AGENT_SECRET` is the account you bring, as explained in [Your wallet](#on-mainnet-bring-your-own). The official mainnet API and its payee are pinned by default, so for them you only need these four:

```json
"notch-mainnet": {
  "command": "/absolute/path/to/npx",
  "args": ["-y", "notch-mcp"],
  "env": {
    "AGENT_SECRET": "S...the secret of a dedicated wallet with a small balance...",
    "STELLAR_NETWORK": "pubnet",
    "NOTCH_ALLOW_MAINNET": "1",
    "SOROBAN_RPC_URL": "https://...an RPC from your provider..."
  }
}
```

To use another mainnet server, also set `NOTCH_API_URL` and `EXPECTED_PAYEE`.

| Setting | What it is |
|---|---|
| `STELLAR_NETWORK=pubnet` | Use mainnet |
| `NOTCH_ALLOW_MAINNET=1` | A second, explicit "yes, real money" |
| `NOTCH_API_URL` | The Notch API to use. Pinned to the official mainnet API by default |
| `EXPECTED_PAYEE` | The only account you will pay, so a fake API cannot charge you. Pinned for the official API |
| `SOROBAN_RPC_URL` | A Soroban RPC from a provider. Stellar runs none for mainnet. See [what it is used for](mainnet.md#the-soroban-rpc-what-it-is-and-what-users-must-do) |

You do not have to remember this list. If something is missing, Notch tells you **all of it at once**, with the block to paste:

- when Claude Desktop starts the server, in its log (`~/Library/Logs/Claude/mcp-server-notch-mainnet.log`), and
- in the answer to any tool. For example, asking *"check my Notch balance"* answers with what is missing and says to quit Claude Desktop (Cmd+Q) and open it again. Claude will explain it to you.

Once everything is set, `check_balance` shows `Network: mainnet (REAL money)`, your wallet, its balance and the only account it will pay. Start with cents.

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
| "Missing AGENT_SECRET" | The `env` block is missing or the key is empty. On testnet create a wallet with `npm run setup:accounts -- --agent-only`. On mainnet put the secret of the account you bring |
| `WALLET_NOT_FOUND` | The wallet was never funded. On testnet run `npm run setup:accounts -- --agent-only`. On mainnet send XLM to its address first |
| `PAYEE_MISMATCH` | The API is asking to pay an account other than `EXPECTED_PAYEE`. Do not continue until you know why |
| `INSUFFICIENT_BALANCE` | The agent wallet has less than 0.01 USDC |
| `API_UNREACHABLE` | The API is down or you are offline. Nothing was paid |
| "The file was not found" | Use an absolute path |

## Try it without Claude

```bash
npm run mcp   # starts the server on stdio, waits for an MCP client
```

The tests cover the logic without a network: `npm test`.
