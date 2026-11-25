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

// `log` records how each settlement ended. A failed settlement used to leave only a bare 402 with an empty
// body for the client, so this keeps the reason (and how long it took) on the server. The API key is never logged.
export function createFacilitator({ log, ...options }) {
  const client = new HTTPFacilitatorClient(facilitatorConfig(options));
  if (!log) return client;
  const settle = client.settle.bind(client);
  client.settle = async (...args) => {
    const started = Date.now();
    const took = () => `${Date.now() - started}ms`;
    try {
      const result = await settle(...args);
      if (result.success) log(`settle ok in ${took()}: ${result.transaction}`);
      else log(`settle REFUSED in ${took()}: ${result.errorReason || "no reason"} ${result.errorMessage || ""}`.trim());
      return result;
    } catch (error) {
      log(`settle FAILED in ${took()}: ${error.message}`);
      throw error;
    }
  };
  return client;
}

// OpenZeppelin Channels rejects calls without a key. Better to stop at startup with a clear message
// than to fail every payment later with a bare 401.
export function missingApiKey({ url, apiKey }) {
  return new URL(url).hostname === "channels.openzeppelin.com" && !apiKey?.trim();
}
