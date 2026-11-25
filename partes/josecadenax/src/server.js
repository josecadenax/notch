import { paymentMiddlewareFromConfig } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactStellarScheme } from "@x402/stellar/exact/server";
import { createApp } from "./app.js";
import { createStamper } from "./stamper.js";
import { createFileRegistry } from "./registry.js";
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
});

app.listen(PORT, () => console.log(`Notch listening on http://localhost:${PORT} (${PRICE} USDC per stamp)`));
