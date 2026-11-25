import express from "express";
import { isValidHash } from "./hash.js";
import { verifyStamp } from "./verifier.js";
import { PRICE, NETWORK, EXPLORER_TX_URL } from "./config.js";

// Builds the Express app. `payment` is the x402 middleware that charges POST /stamp;
// tests pass nothing and exercise the handlers directly.
export function createApp({ stamper, registry, payment = null, verifyFn = verifyStamp }) {
  const app = express();
  app.use(express.json());

  // Public info: what the API does, what it costs and on which network.
  app.get("/", (_req, res) =>
    res.json({
      name: "Notch",
      network: NETWORK,
      price: PRICE,
      endpoints: {
        "POST /stamp": `body { hash }. Paid with x402 (${PRICE} USDC). Anchors the hash on Stellar.`,
        "GET /stamp/:hash": "Free. Looks up a stamp issued by this server.",
        "GET /verify?hash=&tx=": "Free. Checks on Stellar that a transaction carries the hash.",
      },
    }),
  );

  if (payment) app.use(payment);

  // Reached only after x402 verified the payment. A 4xx or 5xx answer cancels the settlement,
  // so the agent is charged only when the stamp really exists.
  app.post("/stamp", async (req, res) => {
    const hash = req.body?.hash;
    if (!isValidHash(hash)) {
      return res.status(400).json({ error: "hash must be 64 lowercase hex characters (SHA-256)" });
    }
    const existing = registry.get(hash);
    if (existing) return res.status(409).json({ error: "hash already stamped, no charge", stamp: existing });

    try {
      const { tx, ledger, stampedAt } = await stamper.anchor(hash);
      const stamp = { hash, tx, ledger, stampedAt, stamper: stamper.publicKey, explorer: `${EXPLORER_TX_URL}${tx}` };
      registry.add(stamp);
      return res.json(stamp);
    } catch (error) {
      console.error("stamp failed:", error.message);
      return res.status(502).json({ error: "could not anchor the hash on Stellar, no charge" });
    }
  });

  app.get("/stamp/:hash", (req, res) => {
    const stamp = registry.get(req.params.hash);
    return stamp ? res.json(stamp) : res.status(404).json({ error: "no stamp for this hash" });
  });

  app.get("/verify", async (req, res) => {
    const hash = req.query.hash;
    const tx = req.query.tx || registry.get(hash)?.tx;
    try {
      const result = await verifyFn({ hash, tx }, { stamperPublic: stamper.publicKey });
      return res.status(result.valid ? 200 : 422).json(result);
    } catch (error) {
      return res.status(502).json({ error: `could not reach Stellar: ${error.message}` });
    }
  });

  return app;
}
