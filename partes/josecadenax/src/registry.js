import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";

// Remembers which hashes were stamped so a hash is never charged twice.
// The truth is on Stellar: this file is only an index and can be rebuilt from the chain.
export function createFileRegistry(path) {
  const stamps = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  return {
    get: (hash) => stamps[hash] ?? null,
    add(record) {
      stamps[record.hash] = record;
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(`${path}.tmp`, JSON.stringify(stamps, null, 2));
      renameSync(`${path}.tmp`, path); // atomic replace, no half-written file
    },
  };
}

export function createMemoryRegistry() {
  const stamps = new Map();
  return {
    get: (hash) => stamps.get(hash) ?? null,
    add: (record) => void stamps.set(record.hash, record),
  };
}
