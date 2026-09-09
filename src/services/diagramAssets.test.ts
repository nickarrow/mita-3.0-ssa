/**
 * Tests for diagram asset resolution.
 *
 * These assert against the real vendored dataset, because the failure mode they guard is a
 * re-sync rather than a code change. The JSON and the PNGs are separate files that travel
 * together, and the `abef120` sync renamed every image in one go: 76 raster fragments out, 9
 * published figures in. A sync that picked up the JSON but not the images — or the reverse —
 * leaves records citing files that are not there, which the component degrades to a caption
 * rather than a broken image, so nothing would fail loudly. That is what these catch.
 */

import { describe, expect, it } from "vitest";
import { getCapabilities } from "./blueprint";
import { getDiagramFilenames, getDiagramUrl } from "./diagramAssets";

/** Every diagram entry in the dataset, with the code of the record citing it. */
const citedDiagrams = getCapabilities().flatMap((capability) =>
  (capability.bpt.process_details.diagrams ?? []).map((diagram) => ({
    code: capability.code,
    diagram,
  }))
);

describe("the dataset's diagrams", () => {
  it("are the nine figures of Determine Member Eligibility, the only record with any", () => {
    // Every other BPT record ships an empty array. Asserted so a sync that starts populating
    // other records shows up here as a deliberate decision rather than passing unnoticed.
    const codes = [...new Set(citedDiagrams.map((d) => d.code))];
    expect(codes).toEqual(["EE_Determine_Member_Eligibility"]);
    expect(citedDiagrams).toHaveLength(9);
  });

  it("cite one figure per page, not many fragments of one page", () => {
    // The bug this sync fixed: 76 entries all citing page 2, one per raster sliver. Distinct
    // pages equalling total entries is the invariant that state of the data violated.
    const pages = citedDiagrams.map((d) => d.diagram.page_reference);
    expect(new Set(pages).size).toBe(citedDiagrams.length);
  });

  it("give every figure a description that is not boilerplate", () => {
    // The fragments all shared the description "Process diagram from page 2", which is what
    // made 76 of them look plausible. Real figures carry their published title.
    const descriptions = citedDiagrams.map((d) => d.diagram.description);
    for (const description of descriptions) {
      expect(description).toBeTruthy();
    }
    expect(new Set(descriptions).size).toBe(citedDiagrams.length);
  });

  it("number their pages, which the type once declared as strings", () => {
    for (const { code, diagram } of citedDiagrams) {
      expect(typeof diagram.page_reference, `${code} ${diagram.filename}`).toBe("number");
    }
  });
});

describe("getDiagramUrl", () => {
  it("resolves every filename the dataset cites", () => {
    for (const { code, diagram } of citedDiagrams) {
      expect(getDiagramUrl(diagram.filename), `${code} cites ${diagram.filename}`).toBeDefined();
    }
  });

  it("bundles no image that no record cites", () => {
    // An orphan means the JSON moved on and the image did not — the other half of a partial
    // sync, and dead weight in the bundle.
    const cited = new Set(citedDiagrams.map((d) => d.diagram.filename));
    expect(getDiagramFilenames().filter((f) => !cited.has(f))).toEqual([]);
  });

  it("returns undefined for a filename that is not in the dataset", () => {
    expect(getDiagramUrl("EE_Determine_Member_Eligibility_diagram_2_2.png")).toBeUndefined();
    expect(getDiagramUrl("")).toBeUndefined();
  });

  it("keys on basenames that are unique dataset-wide", () => {
    // A diagram entry carries no directory, so two images sharing a basename across business
    // areas would resolve one record's figure to the other's file. Comparing the map's size
    // against the file count is what detects that; the map would have silently absorbed it.
    const filenames = getDiagramFilenames();
    expect(new Set(filenames).size).toBe(filenames.length);
    expect(filenames).toHaveLength(9);
  });
});
