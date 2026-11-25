// Minimal in-memory rate limiter, one counter per client IP and time window.
// It protects the free endpoints, which call Horizon without charging anything.
// One server process is enough for Notch, so no shared store is needed.
export function createRateLimiter({ windowMs = 60_000, max = 60, now = Date.now } = {}) {
  const clients = new Map();

  function prune(t) {
    for (const [ip, entry] of clients) if (t - entry.start >= windowMs) clients.delete(ip);
  }

  return (req, res, next) => {
    const t = now();
    if (clients.size > 1000) prune(t); // keeps memory bounded under many different IPs
    const entry = clients.get(req.ip);
    if (!entry || t - entry.start >= windowMs) {
      clients.set(req.ip, { start: t, count: 1 });
      return next();
    }
    entry.count += 1;
    if (entry.count > max) {
      res.set("Retry-After", String(Math.ceil((windowMs - (t - entry.start)) / 1000)));
      return res.status(429).json({ error: "too many requests, slow down" });
    }
    return next();
  };
}
