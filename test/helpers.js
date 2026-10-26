import { readFileSync } from "node:fs";

// Reads a fixture file from test/fixtures, no matter where the tests are run from.
export function fixture(name) {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
}