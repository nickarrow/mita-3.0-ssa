/**
 * Test environment setup.
 *
 * Installs a spec-compliant in-memory IndexedDB so Dexie runs unmodified. The app
 * has no data-access abstraction over Dexie, which is fine precisely because the
 * real thing can be run in Node.
 */

import "fake-indexeddb/auto";
import { webcrypto } from "node:crypto";

// `crypto.randomUUID` is used by the import validator. Node exposes it on
// `webcrypto`, but not always on the global in the versions this may run under.
if (typeof globalThis.crypto === "undefined") {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto });
}
