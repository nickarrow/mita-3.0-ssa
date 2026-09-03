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
/**
 * Minimal `FileReader`, so JSZip can read the `Blob`s attachments are stored as.
 *
 * Node has `Blob` but no `FileReader`. JSZip reports `support.blob === true` because it
 * detects whether a Blob can be *constructed*, then reads one through `FileReader`
 * behind a `typeof FileReader !== "undefined"` guard (`jszip/lib/utils.js`). With that
 * guard failing, the Blob is passed through unread and JSZip rejects it as an
 * unsupported type — so the whole ZIP export/import path was untestable in Node. That is
 * how an attachment-duplication bug survived in the one code path that handles user
 * files.
 *
 * Only `readAsArrayBuffer` is implemented, because that is the only method JSZip calls.
 * Deliberately not a general-purpose polyfill: a fuller shim would invite tests to rely
 * on behaviour it does not actually reproduce.
 */
if (typeof globalThis.FileReader === "undefined") {
  class NodeFileReader {
    result: ArrayBuffer | null = null;
    error: unknown = null;
    onload: ((event: { target: NodeFileReader }) => void) | null = null;
    onerror: ((event: { target: NodeFileReader }) => void) | null = null;

    readAsArrayBuffer(blob: Blob): void {
      blob
        .arrayBuffer()
        .then((buffer) => {
          this.result = buffer;
          this.onload?.({ target: this });
        })
        .catch((error: unknown) => {
          this.error = error;
          this.onerror?.({ target: this });
        });
    }
  }
  Object.defineProperty(globalThis, "FileReader", { value: NodeFileReader });
}
