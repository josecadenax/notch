# Going to mainnet

Mainnet moves **real money**. Notch runs on testnet by default and nothing here changes that: mainnet is something you ask for twice.

```
STELLAR_NETWORK=pubnet      # which network
NOTCH_ALLOW_MAINNET=1       # "yes, I mean real money"
```

Without both, the server, the CLI and the MCP server refuse to run on mainnet.

## What the code already does

| Piece | On mainnet |
|---|---|
| Network, passphrase, Horizon, USDC, explorer | Switch together with `STELLAR_NETWORK`. The USDC asset is checked in tests against the contract `@x402/stellar` uses |
| Facilitator | Defaults to `https://channels.openzeppelin.com/x402` and the server refuses to start without `FACILITATOR_API_KEY` |
| Soroban RPC | The paying client needs `SOROBAN_RPC_URL`. SDF runs no public one for mainnet, so there is no default and the client refuses to start without it |
| API and payee pins | No default. You must set `NOTCH_API_URL` and `EXPECTED_PAYEE`. The testnet public API is never used by mistake |
| Payment network | The client refuses any request that is not `stellar:pubnet` before signing |
| Accounts | `setup:accounts` will not create or fund accounts on mainnet (no Friendbot). `--keys-only` makes keys offline |
| Messages | `check_balance` and the server say which network they are on and whether the money is real |

## What is NOT done or not verified

- The OpenZeppelin **mainnet** facilitator has not been tried. Whether it lists `exact` on `stellar:pubnet` can be checked for free once you have a mainnet key (step 1).
- Its daily fee limit on mainnet, terms and any SLA are unknown. Ask OpenZeppelin.
- No second Railway service exists yet, and the official mainnet API and payee are not filled in (`OFFICIAL.mainnet` in `src/config.js`), so users must name them for now.

## The Soroban RPC: what it is and what users must do

The paying client prepares the USDC transfer before it signs, and for that it asks a **Soroban RPC**. On every payment it makes three requests:

| # | Request | Why |
|---|---|---|
| 1 | `getLatestLedger`: what is the current ledger? | To know until which ledger the payment authorization is valid (300 seconds is about 60 ledgers) |
| 2 | `simulateTransaction`: would this transfer work? | The client builds a USDC `transfer` from the payer to the payee and checks that the balance and the trustline are there, and what authorization it needs |
| 3 | `simulateTransaction` again, now signed | To confirm the transfer is still valid once the authorization is signed |

A fourth request, to estimate how long a ledger takes, goes to Horizon, which is public.

What the RPC does **not** do: it does not send the payment (the facilitator submits it), it never sees the secret key (the authorization is signed locally) and simulating spends nothing. If the balance or the trustline is missing, the simulation fails before anything is signed, which is a safety net.

What the provider can see: the payer and payee addresses, the amount and the signed authorization. Not the secret key and not your files (only a hash goes to Notch, and not to the RPC). On mainnet, pick a provider you trust.

**On testnet users do nothing:** SDF runs a free public RPC and Notch uses it. **On mainnet Stellar runs none**, so each user who pays must:

1. Choose a provider with a free tier from <https://developers.stellar.org/docs/data/rpc/providers> and check its limits.
2. Sign up and get an access URL.
3. Put it in `SOROBAN_RPC_URL`, in the `env` block of the Notch server in Claude Desktop (see [mcp.md](mcp.md#mainnet)).

Three requests per payment is very little, so a free tier is enough for normal use. The real friction is the sign-up with a third party, not the cost. Options to remove it later: a small Notch service that forwards only these requests (you would pay for the usage and have to control abuse), or nothing at all. A provider key must never be hard-coded in this public repository.

How a user finds out they have to do this: if anything is missing the MCP server says so, all at once, in its log and in the answer to any tool call (see [mcp.md](mcp.md#mainnet)).

## Accounts and what each one holds

| Account | Role | Needs |
|---|---|---|
| **payee** | Receives the 0.01 USDC of each stamp | XLM for its reserve, a USDC trustline. Its **secret** must be kept offline: it is the only way to withdraw what it earns |
| **stamper** | Signs the stamp transactions and pays their fee (a fraction of a cent) | XLM for its reserve and fees. Its secret lives on the server |
| **agent** | The user's paying wallet. A dedicated account the user **brings**, not one Notch creates | XLM for its reserve, a USDC trustline and some USDC. Its secret stays on the user's machine |

An account must keep a reserve: 1 XLM, plus 0.5 XLM for each trustline. A stamp transaction costs 0.00001 XLM, so the stamper's fees are negligible next to its reserve.

As a first, minimal funding, think in terms of: payee about 2 XLM, stamper about 2 XLM, agent about 2 XLM plus 1 USDC (100 stamps). Check current prices yourself before buying anything.

## Plan, in order

### 1. Prepare (no money moves)

Decide where the **payee** lives. It is the account that receives the money, and the server only needs its public address.

- **A wallet you already have, such as Freighter (recommended).** The secret stays in the wallet and never goes into a file or onto a server. Switch Freighter to mainnet, copy the address of an account and use it as `PAYEE_PUBLIC`. Add the USDC asset from Freighter (that creates the trustline) and withdraw from Freighter when you want. Then you only generate the stamper and the agent:

  ```bash
  STELLAR_NETWORK=pubnet npm run setup:accounts -- --keys-only --stamper-only   # stamper into .env.mainnet-stamper
  ```

- **A new account made here.** It also saves `PAYEE_SECRET` in a file, which you must keep offline:

  ```bash
  STELLAR_NETWORK=pubnet npm run setup:accounts -- --keys-only                  # payee and stamper into .env.mainnet
  ```

The **paying wallet (agent)** is not made here: each user brings their own, as [mcp.md](mcp.md#on-mainnet-bring-your-own) explains. This is also what you do for your own stamps: use an account you control and have funded, ideally a dedicated one.

Use a dedicated account for the stamper too, never your main wallet. The stamper's secret lives on the server and the agent's in Claude Desktop's config, so each should hold only what you can afford to lose.

This generates keys offline and prints the public addresses. **Back up the secrets in a password manager now.** Losing one means losing what is in that account.

Then:

- Create a mainnet facilitator key at <https://channels.openzeppelin.com/gen> (GitHub login). It is shown once.
- Choose a Soroban RPC provider. Public ones with a free tier are listed at <https://developers.stellar.org/docs/data/rpc/providers>. Check their limits.
- Confirm the facilitator supports mainnet, with no payment involved:

  ```bash
  STELLAR_NETWORK=pubnet FACILITATOR_API_KEY=<mainnet key> npm run facilitator:check
  ```

### 2. Fund the accounts and add the trustlines

You send the XLM yourself (from your wallet or exchange) to the public addresses of the payee and the stamper. The agent is the account you bring: if it is not ready yet, fund it too. Each account needs its 1 XLM base reserve to exist, plus 0.5 XLM for each trustline. Notch cannot and should not move your money.

Then the USDC trustline, on the payee and on the agent when they do not have it. If the payee is a Freighter account, add the USDC asset from Freighter instead. An agent account that already holds USDC needs nothing. The script only shows what it would do unless you add `--yes`, and it reads the secret from a variable, never from the command line:

```bash
export STELLAR_NETWORK=pubnet NOTCH_ALLOW_MAINNET=1
node --env-file=.env.mainnet partes/josecadenax/scripts/add-trustline.js PAYEE_SECRET          # shows the plan
node --env-file=.env.mainnet partes/josecadenax/scripts/add-trustline.js PAYEE_SECRET --yes    # does it
```

For an agent that needs it, run the same script with `--env-file` pointing to the file where you keep its `AGENT_SECRET`, and `AGENT_SECRET` as the variable name.

Finally make sure the agent holds some USDC. Check everything, read-only. The agent only needs its **public** address here:

```bash
STELLAR_NETWORK=pubnet AGENT_PUBLIC=G...your agent address... node --env-file=.env.mainnet partes/josecadenax/scripts/check-accounts.js
```

It must say `All good.` before you go on.

### 3. First real stamp, locally

Run the server on your machine with the mainnet settings (the facilitator key, `STELLAR_NETWORK=pubnet`, `NOTCH_ALLOW_MAINNET=1`, the payee and the stamper) and stamp one file with the CLI, setting `SOROBAN_RPC_URL`, `API_URL=http://localhost:...` and the same two network variables. That is one cent. Open both transactions on the public explorer and verify the file with `npm run verify`.

### 4. Deploy

Deploy from a branch, not from `main`, until the mainnet code is merged. A **second** Railway service, separate from the testnet one, with its own volume. Variables: `STELLAR_NETWORK=pubnet`, `NOTCH_ALLOW_MAINNET=1`, `PAYEE_PUBLIC`, `STAMPER_PUBLIC`, `STAMPER_SECRET`, `FACILITATOR_API_KEY`, `TRUST_PROXY=1`, `REGISTRY_PATH=/data/stamps.json`. Never `PAYEE_SECRET` or `AGENT_SECRET`.

### 5. Make the official deployment official

Once the mainnet API is live, fill in `OFFICIAL.mainnet` in `src/config.js` with its public URL, the payee and the stamper (public keys only). From then on users of that API set neither `NOTCH_API_URL` nor `EXPECTED_PAYEE`: the client pins them by default, as it does on testnet. Publish the same payee in the README so anyone can compare it with Stellar Expert.

### 6. Open it up

Publish the mainnet API URL and payee so users can pin them (`NOTCH_API_URL`, `EXPECTED_PAYEE`), say clearly what a stamp proves (existence and date, not authorship or legal validity), and start with a low limit of stamps per day until you know how the facilitator behaves.

## Safety habits

- Use a **dedicated** paying wallet with a small balance. The MCP server can spend what it holds, up to the cap per stamp.
- Keep `PAYEE_SECRET` offline. Anything on Railway can leak.
- Do the first runs with cents, not dollars.
