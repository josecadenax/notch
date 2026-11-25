import { StrKey } from "@stellar/stellar-sdk";
import { x402Client, x402HTTPClient, wrapFetchWithPayment } from "@x402/fetch";
import { createEd25519Signer } from "@x402/stellar";
import { ExactStellarScheme } from "@x402/stellar/exact/client";
import { isValidHash } from "./hash.js";
import { NETWORK, IS_MAINNET, SOROBAN_RPC_URL, HORIZON_URL, EXPLORER_TX_URL, mainnetBlocker } from "./config.js";

// Reusable client for the paid stamp flow. It never prints or exits: callers (the CLI and the
// MCP server) decide how to show results. Failures are NotchError with a stable `code`.
export class NotchError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "NotchError";
    this.code = code;
  }
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

// Decides whether this client may talk to `apiUrl`. Returns the URL without trailing slash.
// - Only http(s), and https unless the API runs on this same machine.
// - Outside this machine the payee must be pinned, otherwise a fake API could name its own account.
export function assertSafeApiUrl(apiUrl, expectedPayee) {
  let url;
  try {
    url = new URL(apiUrl);
  } catch {
    throw new NotchError("BAD_URL", `The API URL is not valid: ${apiUrl}`);
  }
  const loopback = LOOPBACK_HOSTS.has(url.hostname);
  if (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) {
    throw new NotchError("HTTPS_REQUIRED", "The API URL must use https (plain http is only allowed on localhost).");
  }
  if (expectedPayee && !StrKey.isValidEd25519PublicKey(expectedPayee)) {
    throw new NotchError("BAD_PAYEE", "EXPECTED_PAYEE is not a valid Stellar public key.");
  }
  if (!loopback && !expectedPayee) {
    throw new NotchError(
      "PAYEE_REQUIRED",
      "For an API outside this machine, set EXPECTED_PAYEE to the Stellar account that must receive the payment.",
    );
  }
  return apiUrl.replace(/\/+$/, "");
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createStampClient({
  secret,
  apiUrl,
  spendCap = "$0.02", // most the client will pay per stamp
  expectedPayee, // the account that must receive the payment (checked BEFORE signing)
  retries = 3, // retries only while the API is unreachable, never after paying
  fetchFn = fetch,
  horizonUrl = HORIZON_URL,
  sorobanRpcUrl = SOROBAN_RPC_URL,
  network = NETWORK,
  isMainnet = IS_MAINNET,
  env = process.env,
  log = () => {},
  sleep = wait,
}) {
  if (!secret) throw new NotchError("NO_SECRET", "Missing AGENT_SECRET (the wallet that pays for stamps).");
  // Real money needs an explicit yes, and a Soroban RPC of your own (SDF runs none for mainnet).
  const blocked = mainnetBlocker({ isMainnet }, env);
  if (blocked) throw new NotchError("MAINNET_NOT_CONFIRMED", blocked);
  if (isMainnet && !sorobanRpcUrl) {
    throw new NotchError("RPC_REQUIRED", "Mainnet needs SOROBAN_RPC_URL: SDF runs no public Soroban RPC for mainnet. See docs/mainnet.md.");
  }
  const base = assertSafeApiUrl(apiUrl, expectedPayee);

  // The agent signs with its own wallet, never with the payee or stamper keys.
  const signer = createEd25519Signer(secret, network);
  const client = x402Client.fromConfig({
    schemes: [{ network: "stellar:*", client: new ExactStellarScheme(signer, { url: sorobanRpcUrl }) }],
    // Spending cap: if the API asks for more, x402 refuses BEFORE signing anything.
    spendControls: { maxAmountPerPayment: spendCap },
  });
  const http = new x402HTTPClient(client);
  const payingFetch = wrapFetchWithPayment(fetchFn, client);

  // USDC balance in stroops (7 decimals).
  async function usdcBalance() {
    const response = await fetchFn(`${horizonUrl}/accounts/${signer.address}`);
    if (response.status === 404) {
      throw new NotchError("WALLET_NOT_FOUND", `The wallet ${signer.address} does not exist on the network yet. Fund it first (see docs/mcp.md).`);
    }
    const balance = (await response.json()).balances.find((b) => b.asset_code === "USDC");
    return balance ? Math.round(Number(balance.balance) * 1e7) : 0;
  }

  // Asks the price WITHOUT paying. If the API is unreachable, retries with growing waits.
  async function quote(request) {
    let response;
    for (let attempt = 1; ; attempt++) {
      try {
        response = await fetchFn(`${base}/stamp`, request);
        break;
      } catch {
        if (attempt === retries) {
          throw new NotchError("API_UNREACHABLE", `The API did not answer after ${retries} attempts. Nothing was paid.`);
        }
        log(`The API did not answer (attempt ${attempt}/${retries}), retrying in ${attempt}s...`);
        await sleep(attempt * 1000);
      }
    }
    if (response.status !== 402) {
      throw new NotchError("UNEXPECTED_ANSWER", `Unexpected answer ${response.status}: ${await response.text()}`);
    }
    try {
      return http.getPaymentRequiredResponse((name) => response.headers.get(name)).accepts[0];
    } catch {
      throw new NotchError("BAD_QUOTE", "The API sent a payment request that could not be read. Nothing was signed.");
    }
  }

  // Stamps a hash: quote, check, pay ONCE, return the proof.
  async function stamp(hash) {
    if (!isValidHash(hash)) throw new NotchError("BAD_HASH", "hash must be 64 lowercase hex characters");
    const request = { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ hash }) };

    // 1. Quote, then check who would be paid before anything is signed.
    const offer = await quote(request);
    if (offer.network !== network) {
      throw new NotchError("NETWORK_MISMATCH", `The API asks for payment on ${offer.network}, expected ${network}. Nothing was signed.`);
    }
    if (expectedPayee && offer.payTo !== expectedPayee) {
      throw new NotchError(
        "PAYEE_MISMATCH",
        `The API asks to pay ${offer.payTo}, not the expected account. Nothing was signed.`,
      );
    }
    const price = Number(offer.amount);

    // 2. Before signing: is there enough balance?
    const balance = await usdcBalance();
    log(`Agent ${signer.address}\nPrice ${price / 1e7} USDC, balance ${balance / 1e7} USDC, cap ${spendCap}`);
    if (balance < price) {
      throw new NotchError("INSUFFICIENT_BALANCE", "Not enough USDC balance. Nothing was signed.");
    }

    // 3. Pay ONCE. If something fails after sending the payment, do not retry blindly: check the balance.
    let response;
    let body;
    try {
      response = await payingFetch(`${base}/stamp`, request);
      body = await response.json();
    } catch (error) {
      if (String(error.message).includes("maxAmountPerPayment")) {
        throw new NotchError("OVER_CAP", `The API charges more than the cap (${spendCap}). Nothing was signed or sent.`);
      }
      const after = await usdcBalance();
      throw new NotchError(
        after < balance ? "PAYMENT_UNCERTAIN" : "PAYMENT_FAILED",
        after < balance
          ? `Payment failed (${error.message}). The balance went down, so the payment may have settled. Check the wallet before trying again.`
          : `Payment failed (${error.message}). The balance did not change: nothing was charged. You can try again.`,
      );
    }

    if (response.status === 409) {
      // x402 answers 402 before the API checks the hash, so the client signs first. The API then
      // refuses with 409 and the payment is never settled: nothing is charged.
      return { status: "already_stamped", stamp: body.stamp };
    }
    if (!response.ok) {
      throw new NotchError("REFUSED", `Stamp refused (${response.status}): ${JSON.stringify(body)}`);
    }
    const settlement = http.getPaymentSettleResponse((name) => response.headers.get(name));
    return {
      status: "stamped",
      stamp: body,
      paymentTx: settlement.transaction,
      paymentUrl: `${EXPLORER_TX_URL}${settlement.transaction}`,
      price: price / 1e7,
    };
  }

  return { address: signer.address, usdcBalance, stamp };
}
