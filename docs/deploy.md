# Deploying Notch on Railway

Notch is one Node process with a small file (the registry of stamps). It needs three things from a host: a persistent volume, a single instance that never sleeps, and environment variables for the secrets.

## Secrets: what goes where

| Variable | What it is | Where it lives |
|---|---|---|
| `STAMPER_SECRET` | Signs the stamp transactions and pays their XLM fee | Railway variables only |
| `STAMPER_PUBLIC` | Public key of the stamper | Railway variables (not secret) |
| `PAYEE_PUBLIC` | Account that receives the USDC. Public key only | Railway variables (not secret) |
| `REGISTRY_PATH` | Where the registry file is saved: `/data/stamps.json` | Railway variables |
| `TRUST_PROXY` | `1`, because Railway puts one proxy in front of the app | Railway variables |
| `AGENT_SECRET` | The wallet of the client that pays for stamps | **Never on the server.** Only on the machine of whoever stamps |

`PORT` is set by Railway, do not add it. Nothing in this table is ever committed: `.env` and `.env.*` are ignored by git.

## 1. Create the production keys

On your machine, in the repo folder:

```
npm run setup:accounts -- --server-only --out .env.production
```

This creates two new testnet accounts, a payee (with a USDC trustline) and a stamper, and saves their keys in `.env.production`. Use different accounts from your local ones: two servers must never share a stamper, because they would fight over the same sequence numbers.

## 2. Create the project in Railway

Labels in Railway can change slightly, the steps are the same.

1. New Project, then **Deploy from GitHub repo**, and pick `josecadenax/notch`.
2. In the service **Settings**, set the source branch to the one you want to deploy (`feat/mcp-and-deploy` while testing, `main` once merged).
3. In **Variables**, open the Raw Editor and paste the content of `.env.production`, plus:

```
TRUST_PROXY=1
REGISTRY_PATH=/data/stamps.json
```

4. Add a **Volume** to the service and mount it at `/data`. Without it, the registry is lost on every redeploy.
5. Keep **1 replica**. The stamper serializes its transactions inside one process.
6. In **Settings, Networking**, generate a public domain. That URL is your API.

Railway detects Node from `package.json` (`engines` asks for 22 or newer) and runs `npm start`.

## 3. Check it works

Replace `$URL` with your Railway URL:

```
curl $URL/
curl -i -X POST $URL/stamp -H 'content-type: application/json' \
  -d '{"hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}' | head -1
```

The second one must answer `402 Payment Required`. Then stamp a real file with the local agent pointed at the server:

```
echo "deploy check $(date +%s)" > check.txt
API_URL=$URL npm run stamp -- check.txt
```

You should see the payment and the stamp. Open both links in Stellar Expert: the payment goes to your new `PAYEE_PUBLIC` and the stamp is signed by your new `STAMPER_PUBLIC`.

## Operating it

- **Limits:** `GET /verify` and `GET /stamp/:hash` allow 60 requests per minute per IP (`RATE_LIMIT_PER_MINUTE` changes it). `POST /stamp` is limited by the payment itself.
- **Funds:** the stamper pays 0.00001 XLM per stamp and starts with 10,000 XLM from Friendbot, enough for a very long time on testnet.
- **If a key leaks:** testnet money has no value, but rotate anyway. Run step 1 again with a new file, replace the variables and redeploy.
- **Testnet resets:** the network can be reset. After a reset, run step 1 again.
