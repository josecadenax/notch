import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sha256Hex, sha256File, isValidHash } from "../src/hash.js";

// Known SHA-256 test vector for "abc".
const ABC = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

test("sha256Hex matches the known test vector", () => {
  assert.equal(sha256Hex("abc"), ABC);
});

test("sha256File gives the same hash as hashing the content", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "notch-")), "doc.txt");
  writeFileSync(path, "abc");
  assert.equal(await sha256File(path), ABC);
});

test("isValidHash accepts 64 lowercase hex characters only", () => {
  assert.equal(isValidHash(ABC), true);
  assert.equal(isValidHash(ABC.toUpperCase()), false);
  assert.equal(isValidHash(ABC.slice(1)), false);
  assert.equal(isValidHash(undefined), false);
  assert.equal(isValidHash(`${ABC}0`), false);
});
