# Part of josecadenax

Everything in Notch lives here: the paid stamping API, the Stellar anchoring, the verifier and a client agent that pays for stamps.

## What it does

1. An agent produces a deliverable (a report, a contract draft, a dataset) and computes its SHA-256 hash **locally**. The file never leaves the machine.
2. It calls `POST /stamp` with the hash. The API answers `402` and the agent pays 0.01 USDC with x402.
3. Notch writes the hash in the 32-byte memo of a Stellar transaction and returns the transaction id.
4. Anyone can later check, for free, that the transaction carries the hash. The date is the close time of the Stellar ledger.

What is on chain: the hash, the date and the stamper account. What is not: the file, its name, its author and which agent asked for the stamp.

## API

| Endpoint | Cost | What it does |
|---|---|---|
| `GET /` | free | Service info: price, network and endpoints |
| `POST /stamp` body `{ "hash": "<64 hex>" }` | 0.01 USDC (x402) | Anchors the hash and returns `{ hash, tx, ledger, stampedAt, stamper, explorer }` |
| `GET /stamp/:hash` | free | Looks up a stamp issued by this server |
| `GET /verify?hash=&tx=` | free | Checks on Stellar that the transaction carries the hash |

Status codes of `POST /stamp`: `200` stamped, `400` invalid hash, `402` payment required, `409` already stamped, `502` Stellar unreachable. x402 settles the payment only after a successful answer, so `400`, `409` and `502` are never charged.

## How to run it

Needs Node 22 or newer.

```
npm install
npm run setup:accounts     # creates payee, stamper and agent accounts on testnet, saves keys in .env
npm start                  # starts the API on http://localhost:3001
npm run stamp -- file.pdf  # in another terminal: hashes the file, pays and stamps it
npm run verify -- file.pdf <tx>   # checks a file against a stamp transaction, straight on Stellar
npm test                   # 21 tests, including one against real testnet data
```

Accounts:

- **payee**: receives the USDC of each stamp. Only its public key is on the server.
- **stamper**: signs the stamp transactions and pays their XLM fee.
- **agent**: the wallet of the client. It has a spending cap per stamp (`SPEND_CAP`, default `$0.02`).

## Test hashes

A real run on Stellar testnet, for the file hash `a3bf448a896eb3dbe3b37767e34381ad41840615a237197ba23a8bf77267e1c5`:

- Payment of 0.01 USDC (x402): `15ae64c6e6a6bca9ae3775ca4971f0d5f7d6d89dfcd6ec9c2ceadd778e2743bd`
  https://stellar.expert/explorer/testnet/tx/15ae64c6e6a6bca9ae3775ca4971f0d5f7d6d89dfcd6ec9c2ceadd778e2743bd
- Stamp, with the hash in its memo: `980e4423e8a7476d899aed94d7d4220f5071ee45bdaa939a0f7c04a76cfc1bc0`
  https://stellar.expert/explorer/testnet/tx/980e4423e8a7476d899aed94d7d4220f5071ee45bdaa939a0f7c04a76cfc1bc0

## Limits

- A stamp proves a document existed no later than its date. It says nothing about who wrote it.
- The hash is public and permanent. A short or guessable document can be guessed from its hash, so add a random salt to it.
- This is testnet: the network can be reset, and the USDC has no value.
