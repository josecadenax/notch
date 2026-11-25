import { paymentMiddlewareFromConfig } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactStellarScheme } from "@x402/stellar/exact/server";
import { createApp } from "./app.js";
import { createStamper } from "./stamper.js";
import { createFileRegistry } from "./registry.js";
import { createRateLimiter } from "./rate-limit.js";
import { PORT, PRICE, NETWORK, FACILITATOR_URL } from "./config.js";

const { PAYEE_PUBLIC, STAMPER_SECRET } = process.env;
if (!PAYEE_PUBLIC || !STAMPER_SECRET) {
  console.error("Missing PAYEE_PUBLIC or STAMPER_SECRET. Run: npm run setup:accounts");
  process.exit(1);
}

// x402: without payment, POST /stamp answers 402 with the instructions to pay.
const payment = paymentMiddlewareFromConfig(
  { "POST /stamp": { accepts: { scheme: "exact", price: PRICE, network: NETWORK, payTo: PAYEE_PUBLIC } } },
  new HTTPFacilitatorClient({ url: FACILITATOR_URL }),
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

app.listen(PORT, () => console.log(`Notch listening on http://localhost:${PORT} (${PRICE} USDC per stamp)`));
