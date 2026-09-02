/**
 * Stub for jsPDF's optional HTML-rendering dependencies.
 *
 * jsPDF dynamically imports `html2canvas`, `dompurify` and `canvg` to support its
 * `.html()` renderer. This app builds PDFs entirely through jsPDF's programmatic
 * text and table APIs and never calls `.html()`, so bundling those libraries adds
 * roughly 380 KB (about 105 KB gzipped) of code that can never run.
 *
 * They are aliased to this module in vite.config.ts. Aliasing rather than marking
 * them external matters: `external` would leave bare `import("html2canvas")`
 * specifiers in the browser bundle that cannot resolve at runtime. This stub
 * resolves cleanly and fails loudly with an actionable message if the HTML path
 * is ever reached, instead of producing a cryptic module-resolution error.
 *
 * If PDF-from-HTML rendering is ever needed, remove the aliases in
 * vite.config.ts so the real packages are bundled again.
 */

function unsupported(): never {
  throw new Error(
    "jsPDF's .html() renderer is not available in this build. " +
      "html2canvas, dompurify and canvg are intentionally excluded because this app " +
      "generates PDFs programmatically. Remove the aliases in vite.config.ts to enable it."
  );
}

export default unsupported;

// Named exports each library is imported by, so the alias satisfies jsPDF's
// destructuring without it having to actually run.
export const sanitize = unsupported;
export const Canvg = unsupported;
export const presets = {};
