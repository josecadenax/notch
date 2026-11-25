import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFileRegistry, createMemoryRegistry } from "../src/registry.js";

const record = { hash: "a".repeat(64), tx: "b".repeat(64), ledger: 1, stampedAt: "2026-11-24T00:00:00Z" };

test("memory registry returns what was added and null otherwise", () => {
  const registry = createMemoryRegistry();
  assert.equal(registry.get(record.hash), null);
  registry.add(record);
  assert.deepEqual(registry.get(record.hash), record);
});

test("file registry survives a restart", () => {
  const path = join(mkdtempSync(join(tmpdir(), "notch-")), "nested", "stamps.json");
  createFileRegistry(path).add(record);
  assert.deepEqual(createFileRegistry(path).get(record.hash), record);
});
