// Checks that the configured x402 facilitator answers and supports what Notch needs.
// It sends no payment and costs nothing. Settings (env): FACILITATOR_URL, FACILITATOR_API_KEY.
//
// Usage: npm run facilitator:check
import { createFacilitator, missingApiKey } from "../src/facilitator.js";
import { FACILITATOR_URL, NETWORK } from "../src/config.js";

const apiKey = process.env.FACILITATOR_API_KEY;
console.log(`Facilitator ${FACILITATOR_URL}`);
console.log(`API key ${apiKey ? "set" : "not set"}`);
if (missingApiKey({ url: FACILITATOR_URL, apiKey })) {
  console.log("This facilitator needs FACILITATOR_API_KEY. Create one at https://channels.openzeppelin.com (testnet: /testnet/gen).");
  process.exit(1);
}

try {
  const supported = await createFacilitator({ url: FACILITATOR_URL, apiKey }).getSupported();
  const kinds = supported.kinds.map((kind) => `${kind.scheme} on ${kind.network}`);
  console.log(`Supported: ${kinds.join(", ") || "nothing"}`);
  if (!supported.kinds.some((kind) => kind.network === NETWORK && kind.scheme === "exact")) {
    console.log(`It does not list "exact" on ${NETWORK}. Notch would not be able to charge here.`);
    process.exit(1);
  }
  console.log(`OK: it supports "exact" on ${NETWORK}.`);
} catch (error) {
  console.log(`The facilitator did not answer as expected: ${error.message}`);
  process.exit(1);
}
