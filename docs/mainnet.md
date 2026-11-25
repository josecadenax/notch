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
- A tool to add the USDC trustline is not written yet. A wallet app can do it meanwhile.
- No second Railway service exists yet.

## Accounts and what each one holds

| Account | Role | Needs |
|---|---|---|
| **payee** | Receives the 0.01 USDC of each stamp | XLM for its reserve, a USDC trustline. Its **secret** must be kept offline: it is the only way to withdraw what it earns |
| **stamper** | Signs the stamp transactions and pays their fee (a fraction of a cent) | XLM for its reserve and fees. Its secret lives on the server |
| **agent** | The user's paying wallet | XLM for its reserve, a USDC trustline and some USDC. Its secret stays on the user's machine |

An account must keep a reserve: 1 XLM, plus 0.5 XLM for each trustline. A stamp transaction costs 0.00001 XLM, so the stamper's fees are negligible next to its reserve.

As a first, minimal funding, think in terms of: payee about 2 XLM, stamper about 2 XLM, agent about 2 XLM plus 1 USDC (100 stamps). Check current prices yourself before buying anything.

## Plan, in order

### 1. Prepare (no money moves)

```bash
STELLAR_NETWORK=pubnet npm run setup:accounts -- --keys-only            # payee and stamper into .env.mainnet
STELLAR_NETWORK=pubnet npm run setup:accounts -- --keys-only --agent-only   # your paying wallet into .env.mainnet-agent
```

This generates keys offline and prints the public addresses. **Back up the secrets in a password manager now.** Losing one means losing what is in that account.

Then:

- Create a mainnet facilitator key at <https://channels.openzeppelin.com/gen> (GitHub login). It is shown once.
- Choose a Soroban RPC provider. Public ones with a free tier are listed at <https://developers.stellar.org/docs/data/rpc/providers>. Check their limits.
- Confirm the facilitator supports mainnet, with no payment involved:

  ```bash
  STELLAR_NETWORK=pubnet FACILITATOR_API_KEY=<mainnet key> npm run facilitator:check
  ```

### 2. Fund the accounts (you, with your own wallet or exchange)

Send the XLM to the three public addresses, add the USDC trustline to the payee and the agent, and send USDC to the agent. Notch cannot and should not do this for you. Check the result, read-only:

```bash
STELLAR_NETWORK=pubnet node --env-file=.env.mainnet --env-file-if-exists=.env.mainnet-agent partes/josecadenax/scripts/check-accounts.js
```

### 3. First real stamp, locally

Run the server on your machine with the mainnet settings (the facilitator key, `STELLAR_NETWORK=pubnet`, `NOTCH_ALLOW_MAINNET=1`, the payee and the stamper) and stamp one file with the CLI, setting `SOROBAN_RPC_URL`, `API_URL=http://localhost:...` and the same two network variables. That is one cent. Open both transactions on the public explorer and verify the file with `npm run verify`.

### 4. Deploy

A **second** Railway service, separate from the testnet one, with its own volume. Variables: `STELLAR_NETWORK=pubnet`, `NOTCH_ALLOW_MAINNET=1`, `PAYEE_PUBLIC`, `STAMPER_PUBLIC`, `STAMPER_SECRET`, `FACILITATOR_API_KEY`, `TRUST_PROXY=1`, `REGISTRY_PATH=/data/stamps.json`. Never `PAYEE_SECRET` or `AGENT_SECRET`.

### 5. Open it up

Publish the mainnet API URL and payee so users can pin them (`NOTCH_API_URL`, `EXPECTED_PAYEE`), say clearly what a stamp proves (existence and date, not authorship or legal validity), and start with a low limit of stamps per day until you know how the facilitator behaves.

## Safety habits

- Use a **dedicated** paying wallet with a small balance. The MCP server can spend what it holds, up to the cap per stamp.
- Keep `PAYEE_SECRET` offline. Anything on Railway can leak.
- Do the first runs with cents, not dollars.
