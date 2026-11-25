import { paymentMiddlewareFromConfig } from "@x402/express";
import { ExactStellarScheme } from "@x402/stellar/exact/server";
import { createApp } from "./app.js";
import { createStamper } from "./stamper.js";
import { createFileRegistry } from "./registry.js";
import { createRateLimiter } from "./rate-limit.js";
import { createFacilitator, missingApiKey } from "./facilitator.js";
import { PORT, PRICE, NETWORK, NETWORK_LABEL, IS_MAINNET, FACILITATOR_URL, mainnetBlocker } from "./config.js";

const { PAYEE_PUBLIC, STAMPER_SECRET } = process.env;
if (!PAYEE_PUBLIC || !STAMPER_SECRET) {
  console.error("Missing PAYEE_PUBLIC or STAMPER_SECRET. Run: npm run setup:accounts");
  process.exit(1);
}

const blocked = mainnetBlocker({ isMainnet: IS_MAINNET });
if (blocked) {
  console.error(blocked);
  process.exit(1);
}

const { FACILITATOR_API_KEY } = process.env;
if (missingApiKey({ url: FACILITATOR_URL, apiKey: FACILITATOR_API_KEY })) {
  console.error("This facilitator needs FACILITATOR_API_KEY. Create one at https://channels.openzeppelin.com");
  process.exit(1);
}

// x402: without payment, POST /stamp answers 402 with the instructions to pay.
const payment = paymentMiddlewareFromConfig(
  { "POST /stamp": { accepts: { scheme: "exact", price: PRICE, network: NETWORK, payTo: PAYEE_PUBLIC } } },
  createFacilitator({ url: FACILITATOR_URL, apiKey: FACILITATOR_API_KEY }),
  [{ network: NETWORK, server: new ExactStellarScheme() }],
);

const app = createApp({
  stamper: createStamper({ secret: STAMPER_SECRET }),
  registry: createFileRegistry(process.env.REGISTRY_PATH || "partes/josecadenax/data/stamps.json"),
  payment,
  limiter: createRateLimiter({ windowMs: 60_000, max: Number(process.env.RATE_LIMIT_PER_MINUTE || 60) }),
  // Behind Railway there is one proxy: set TRUST_PROXY=1 there so IPs and https are the real ones.
  trustProxy: process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) : false,
});

app.listen(PORT, () => {
  console.log(`Notch listening on http://localhost:${PORT} (${PRICE} USDC per stamp)`);
  console.log(`Network: ${NETWORK_LABEL}${IS_MAINNET ? " (REAL money)" : " (test money)"}, facilitator ${FACILITATOR_URL}`);
});
