import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

const HASH_PATTERN = /^[0-9a-f]{64}$/;

// A document hash is a SHA-256 digest written as 64 lowercase hex characters.
export const isValidHash = (value) => typeof value === "string" && HASH_PATTERN.test(value);

export const sha256Hex = (data) => createHash("sha256").update(data).digest("hex");

// Hashes a file without loading it fully in memory. The file never leaves the machine.
export function sha256File(path) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(path)
      .on("error", reject)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => resolve(hash.digest("hex")));
  });
}
