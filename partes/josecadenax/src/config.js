import { Asset, Networks } from "@stellar/stellar-sdk";

// Everything that differs between Stellar testnet and mainnet lives here, in one place.
// Testnet is the default. Mainnet (real money) must be asked for with STELLAR_NETWORK=pubnet.
const NETWORKS = {
  testnet: {
    name: "testnet",
    caip2: "stellar:testnet",
    passphrase: Networks.TESTNET,
    horizonUrl: "https://horizon-testnet.stellar.org",
    sorobanRpcUrl: "https://soroban-testnet.stellar.org", // SDF runs a public one for testnet
    facilitatorUrl: "https://www.x402.org/facilitator",
    // Testnet USDC (same asset used in the bootcamp sessions).
    usdcIssuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    explorerTxUrl: "https://stellar.expert/explorer/testnet/tx/",
  },
  pubnet: {
    name: "mainnet",
    caip2: "stellar:pubnet",
    passphrase: Networks.PUBLIC,
    horizonUrl: "https://horizon.stellar.org",
    sorobanRpcUrl: undefined, // SDF runs no public mainnet RPC: bring your own with SOROBAN_RPC_URL
    facilitatorUrl: "https://channels.openzeppelin.com/x402",
    // Circle's USDC. Its contract id matches USDC_PUBNET_ADDRESS in @x402/stellar.
    usdcIssuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    explorerTxUrl: "https://stellar.expert/explorer/public/tx/",
  },
};

// Reads the network settings from an environment. Exported so it can be tested without reloading modules.
export function networkSettings(env = process.env) {
  const key = (env.STELLAR_NETWORK || "testnet").toLowerCase();
  const network = NETWORKS[key];
  if (!network) throw new Error(`STELLAR_NETWORK must be "testnet" or "pubnet", got "${env.STELLAR_NETWORK}"`);
  return {
    isMainnet: key === "pubnet",
    label: network.name,
    network: network.caip2,
    passphrase: network.passphrase,
    horizonUrl: env.HORIZON_URL || network.horizonUrl,
    sorobanRpcUrl: env.SOROBAN_RPC_URL || network.sorobanRpcUrl,
    facilitatorUrl: env.FACILITATOR_URL || network.facilitatorUrl,
    usdc: new Asset("USDC", network.usdcIssuer),
    explorerTxUrl: network.explorerTxUrl,
  };
}

// Mainnet moves real money, so it needs an explicit second "yes" on top of STELLAR_NETWORK=pubnet.
// Returns a message when something is not allowed, or null when it is fine.
export function mainnetBlocker({ isMainnet }, env = process.env) {
  if (isMainnet && env.NOTCH_ALLOW_MAINNET !== "1") {
    return "STELLAR_NETWORK=pubnet uses REAL money. Set NOTCH_ALLOW_MAINNET=1 to confirm you mean it.";
  }
  return null;
}

const settings = networkSettings();
export const IS_MAINNET = settings.isMainnet;
export const NETWORK_LABEL = settings.label;
export const NETWORK = settings.network;
export const NETWORK_PASSPHRASE = settings.passphrase;
export const HORIZON_URL = settings.horizonUrl;
export const FACILITATOR_URL = settings.facilitatorUrl;
export const SOROBAN_RPC_URL = settings.sorobanRpcUrl;
export const USDC = settings.usdc;
export const EXPLORER_TX_URL = settings.explorerTxUrl;

export const PORT = Number(process.env.PORT || 3001);
export const API_URL = process.env.API_URL || `http://localhost:${PORT}`;

// Price of one stamp, in USDC.
export const PRICE = "$0.01";

// The official deployments. Clients pin these public keys so a hijacked or fake API cannot collect
// payments: the payee is who must be paid, the stamper is who must sign the stamp.
export const PUBLIC_API_URL = "https://notch-production-721b582b.up.railway.app";
export const PUBLIC_PAYEE = "GALUWRVBHUOYAC2AZUUEA7QRS2V4CX46OFPLRKAKAIIPSDMRZWL43TQQ";
export const PUBLIC_STAMPER = "GCLUSRU43N2QAIL54A7CYXDRDQ4KGS4DI3RZTF7ORQUZWNV6U3AHYNUS";

export const OFFICIAL = {
  testnet: { apiUrl: PUBLIC_API_URL, payee: PUBLIC_PAYEE, stamper: PUBLIC_STAMPER },
  // Fill these in the day the official mainnet API is live. While they are empty, nothing is assumed
  // on mainnet and the user must name the API and its payee. Once filled, users of the official API
  // need to set neither of them. The values are public keys and a URL, never secrets.
  mainnet: { apiUrl: "", payee: "", stamper: "" },
};

// The official deployment for the current network (empty strings when there is none).
export function officialDeployment(isMainnet, official = OFFICIAL) {
  return isMainnet ? official.mainnet : official.testnet;
}
