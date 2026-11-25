# Choosing the x402 facilitator

The facilitator verifies the payment an agent signed and settles it on Stellar. Notch charges only after the stamp exists: it verifies, stamps, and then settles.

| | Test facilitator (default) | OpenZeppelin Channels |
|---|---|---|
| URL | `https://www.x402.org/facilitator` | testnet: `https://channels.openzeppelin.com/x402/testnet`<br>mainnet: `https://channels.openzeppelin.com/x402` |
| API key | not needed | required (Bearer token) |
| Networks | testnet | testnet and mainnet (`stellar:pubnet`) |
| Fees | sponsored | sponsored |
| Cost | free | free, under a fair-use policy (see below) |

Notch reads two settings, both optional:

| Variable | Meaning |
|---|---|
| `FACILITATOR_URL` | Facilitator to use. Empty means the test facilitator |
| `FACILITATOR_API_KEY` | Sent as `Authorization: Bearer <key>` on verify, settle and supported. Never logged |

If `FACILITATOR_URL` points to `channels.openzeppelin.com` and there is no key, the server refuses to start with a clear message instead of failing every payment with a bare 401.

## Try the OpenZeppelin facilitator on testnet

1. Create a testnet key at <https://channels.openzeppelin.com/testnet/gen>. It needs no account. The key cannot be shown again, so save it right away.
2. Put it in your local `.env` (never commit it):

   ```
   FACILITATOR_URL=https://channels.openzeppelin.com/x402/testnet
   FACILITATOR_API_KEY=<your key>
   ```

3. Check that the facilitator answers and supports what Notch needs. It sends no payment and costs nothing:

   ```bash
   npm run facilitator:check
   ```

   Expected: `OK: it supports "exact" on stellar:testnet.`

4. Start the API and stamp a file as usual (`npm start`, then `npm run stamp -- file.txt`). The payment now goes through OpenZeppelin.

To test it on Railway, set the same two variables there. Do not do this on the public deployment before the demo.

## Measure the daily limit

The hosted service is free but caps how many network fees each API key can consume. What the OpenZeppelin guide says:

- The limit is measured in stroops of fees, per key.
- It resets 24 hours after the key's first transaction.
- Going over answers `FEE_LIMIT_EXCEEDED` until the reset.
- If all its channel accounts are busy it answers `POOL_CAPACITY`: retry after a short delay.
- **The numeric limit is not published.**

So the real capacity of one key is unknown until measured. On testnet, with the facilitator pointed at the OpenZeppelin testnet URL, stamp new files one after another until the first `FEE_LIMIT_EXCEEDED`, and note how many stamps fit. Each test stamp costs 0.01 test USDC. Write the number down: it tells you how many stamps per day one key supports.

### Measured result (25 Nov 2026, testnet)

One fresh key, stamping random hashes against a local Notch server with `partes/josecadenax/scripts/measure-facilitator-limit.js`:

| Measure | Result |
|---|---|
| Stamps paid in one run | **51** (50 in the run plus 1 earlier test), all successful |
| Limit reached | **No**. The limit is higher than what was consumed |
| Fee per settlement | **11,698 stroops** (about 0.0012 XLM), the same on every stamp |
| Fees consumed by the 50 stamps | 584,900 stroops (about 0.058 XLM) |
| Time per stamp, end to end | about **10 seconds** |

So one key supports **at least 51 stamps per day**. The real ceiling is still unknown. Every extra 100 stamps cost 1 test USDC and about 17 minutes, so the practical way to learn it is to ask OpenZeppelin for the number. If the cap were 1 XLM of fees, a key would cover about 850 stamps a day.

Run it again with:

```bash
FACILITATOR_URL=... FACILITATOR_API_KEY=... PORT=3002 npm start
API_URL=http://localhost:3002 node --env-file=.env partes/josecadenax/scripts/measure-facilitator-limit.js 50
```

The script refuses to run against anything but a local server.

If one key is not enough, the options are to ask OpenZeppelin for more capacity, to use several keys, or to self-host the facilitator plugin, which their guide recommends for higher throughput.

## For mainnet

Mainnet needs a mainnet key (created at <https://channels.openzeppelin.com/gen>, which may ask for a GitHub login), the mainnet URL above, and the network set to `stellar:pubnet`. The pages read did not state any SLA, terms or audit status, so ask OpenZeppelin before relying on it with real money.
