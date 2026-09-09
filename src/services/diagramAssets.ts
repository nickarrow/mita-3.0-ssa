/**
 * Resolve a BPT diagram's `filename` to a bundled asset URL.
 *
 * The vendored dataset ships the figures as PNGs beside the JSON, under
 * `src/data/bpt/<business_area>/images/`. Nothing imported them, so Vite emitted none of
 * them and the Diagrams section could only ever list filenames as text. This glob is what
 * puts them in the bundle; it mirrors how `blueprint.ts` pulls in the JSON.
 *
 * `eager` because the map has to be a plain lookup at render time — the alternative is a
 * promise per image and a loading state in the component, for nine files on one page. The
 * cost is nine `<link>`-able asset URLs in the module graph, not nine inlined images: at
 * 59-114 KB each they are well over Vite's 4 KB inline threshold, so each stays a separate
 * request the browser can cache and lazy-load.
 */
const diagramModules = import.meta.glob<string>("../data/bpt/**/images/*.png", {
  eager: true,
  import: "default",
  query: "?url",
});

/**
 * Basename -> asset URL.
 *
 * Keyed on the basename because that is all a diagram entry carries. `filename` in the JSON
 * is bare (`EE_..._diagram_page02.png`) with no directory, so the data model already assumes
 * basenames are unique across the whole dataset. `diagramAssets.test.ts` asserts that, since
 * a collision here would silently resolve one record's figure to another's image rather than
 * fail — the kind of wrong that looks right.
 */
const assetsByFilename: Map<string, string> = new Map(
  Object.entries(diagramModules).map(([path, url]) => [path.split("/").pop() as string, url])
);

/** Asset URL for a diagram filename, or `undefined` if the dataset has no such image. */
export function getDiagramUrl(filename: string): string | undefined {
  return assetsByFilename.get(filename);
}

/**
 * Every diagram basename the bundle can serve.
 *
 * Exported for the test that pairs these against the filenames the BPT records cite. The two
 * halves of the dataset are synced together but are separate files, so they can drift — the
 * 2026-09-09 `abef120` sync renamed all of them at once, which is exactly the shape of change
 * that leaves a record pointing at an image that no longer exists.
 */
export function getDiagramFilenames(): string[] {
  return [...assetsByFilename.keys()].sort();
}
