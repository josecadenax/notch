import { HTTPFacilitatorClient } from "@x402/core/server";

// The x402 facilitator verifies the payment and settles it on Stellar. Some facilitators, like the
// hosted OpenZeppelin Channels one, need an API key sent as a Bearer token on every request.

// Options for HTTPFacilitatorClient. Without a key nothing extra is sent (the x402.org test facilitator).
export function facilitatorConfig({ url, apiKey }) {
  const key = apiKey?.trim();
  if (!key) return { url };
  // x402 wants the headers keyed by request path. A flat object would throw, so build it per path.
  const headers = { Authorization: `Bearer ${key}` };
  return { url, createAuthHeaders: async () => ({ verify: headers, settle: headers, supported: headers }) };
}

export function createFacilitator(options) {
  return new HTTPFacilitatorClient(facilitatorConfig(options));
}

// OpenZeppelin Channels rejects calls without a key. Better to stop at startup with a clear message
// than to fail every payment later with a bare 401.
export function missingApiKey({ url, apiKey }) {
  return new URL(url).hostname === "channels.openzeppelin.com" && !apiKey?.trim();
}
