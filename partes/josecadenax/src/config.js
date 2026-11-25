import { Asset, Networks } from "@stellar/stellar-sdk";

export const NETWORK = "stellar:testnet";
export const NETWORK_PASSPHRASE = Networks.TESTNET;
export const HORIZON_URL = process.env.HORIZON_URL || "https://horizon-testnet.stellar.org";
export const FACILITATOR_URL = process.env.FACILITATOR_URL || "https://www.x402.org/facilitator";
export const SOROBAN_RPC_URL = "https://soroban-testnet.stellar.org";

export const PORT = Number(process.env.PORT || 3001);
export const API_URL = process.env.API_URL || `http://localhost:${PORT}`;

// Price of one stamp, in USDC.
export const PRICE = "$0.01";

// Testnet USDC (same asset used in the bootcamp sessions).
export const USDC = new Asset("USDC", "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5");

export const EXPLORER_TX_URL = "https://stellar.expert/explorer/testnet/tx/";
