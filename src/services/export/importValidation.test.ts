/**
 * Tests for the import validator.
 *
 * This is the app's only trust boundary: imported files are the one way foreign
 * data enters the database. Every case here corresponds to something a real file
 * did during the audit, or to a boundary that must keep working.
 */

import { describe, expect, it } from "vitest";
import { validateImportPayload } from "./importValidation";
import { buildExportPayload, firstCapability, questionCountFor } from "../../test/helpers";

describe("validateImportPayload", () => {
  describe("rejects unusable files outright", () => {
    it.each([
      ["null", null],
      ["a string", "not an export"],
      ["an array", []],
      ["a number", 42],
    ])("rejects %s", (_label, input) => {
      const result = validateImportPayload(input);
      expect(result.data).toBeUndefined();
      expect(result.errors).not.toHaveLength(0);
    });

    it("rejects a file with no export version", () => {
      const payload = buildExportPayload();
      delete payload.exportVersion;
      const result = validateImportPayload(payload);
      expect(result.data).toBeUndefined();
      expect(result.errors[0]).toMatch(/export version/i);
    });

    it("rejects an unsupported export version, naming it", () => {
      const result = validateImportPayload(buildExportPayload({ exportVersion: "2.0" }));
      expect(result.data).toBeUndefined();
      expect(result.errors[0]).toContain("2.0");
    });

    it("rejects a file with no data section", () => {
      const payload = buildExportPayload();
      delete payload.data;
      expect(validateImportPayload(payload).data).toBeUndefined();
    });

    it("rejects a file whose assessments are not a list", () => {
      const payload = buildExportPayload();
      (payload.data as Record<string, unknown>).assessments = "nope";
      expect(validateImportPayload(payload).data).toBeUndefined();
    });

    it("produces a human-readable message, not an exception string", () => {
      const result = validateImportPayload({ exportVersion: "1.0" });
      // Regression guard: users were shown "data.data.tags is not iterable".
      expect(result.errors.join(" ")).not.toMatch(/undefined|iterable|TypeError|Cannot read/);
    });
  });

  describe("treats optional collections as absent, not fatal", () => {
    it.each(["tags", "history", "attachments"])("accepts a file with no %s", (key) => {
      const payload = buildExportPayload();
      delete (payload.data as Record<string, unknown>)[key];

      const result = validateImportPayload(payload);

      expect(result.errors).toEqual([]);
      expect(result.data).toBeDefined();
    });
  });

  describe("score range", () => {
    it.each([1, 2.5, 5])("accepts a score of %s", (score) => {
      const result = validateImportPayload(buildExportPayload({ assessments: [{ score }] }));
      expect(result.data!.data.assessments[0]!.score).toBe(score);
    });

    it.each([0, 6, 42, -1])("discards an out-of-range score of %s", (score) => {
      const result = validateImportPayload(buildExportPayload({ assessments: [{ score }] }));
      expect(result.data!.data.assessments[0]!.score).toBeUndefined();
      expect(result.warnings.join(" ")).toMatch(/score/i);
    });

    it("describes a wrongly-typed score as a type problem, not a range problem", () => {
      // "4" is inside 1-5, so calling it out-of-range would be actively misleading.
      const result = validateImportPayload(buildExportPayload({ assessments: [{ score: "4" }] }));
      expect(result.data!.data.assessments[0]!.score).toBeUndefined();
      expect(result.warnings.join(" ")).toMatch(/not a number/i);
    });
  });

  describe("maturity level range", () => {
    it.each([1, 3, 5])("accepts a level of %s", (level) => {
      const result = validateImportPayload(buildExportPayload({ ratings: [{ level }] }));
      expect(result.data!.data.ratings[0]!.level).toBe(level);
    });

    it.each([0, 6, 99, -1, 2.5])("clears an invalid level of %s", (level) => {
      const result = validateImportPayload(buildExportPayload({ ratings: [{ level }] }));
      expect(result.data!.data.ratings[0]!.level).toBeNull();
      expect(result.warnings.join(" ")).toMatch(/level/i);
    });

    it("keeps an explicitly unanswered question unanswered without warning", () => {
      const result = validateImportPayload(buildExportPayload({ ratings: [{ level: null }] }));
      expect(result.data!.data.ratings[0]!.level).toBeNull();
      expect(result.warnings).toEqual([]);
    });
  });

  describe("question index bounds", () => {
    it("drops an answer for a question the capability does not have", () => {
      const capability = firstCapability();
      const count = questionCountFor(capability.code);

      const result = validateImportPayload(
        buildExportPayload({ ratings: [{ questionIndex: count }] })
      );

      expect(result.data!.data.ratings).toHaveLength(0);
      expect(result.warnings.join(" ")).toContain(String(count));
    });

    it("accepts the last real question index", () => {
      const count = questionCountFor(firstCapability().code);
      const result = validateImportPayload(
        buildExportPayload({ ratings: [{ questionIndex: count - 1 }] })
      );
      expect(result.data!.data.ratings).toHaveLength(1);
    });

    it("still bounds indices for a capability this build does not know", () => {
      // An unknown code means the real question count is unavailable, which
      // previously disabled the bounds check entirely and let 999999999 through.
      const result = validateImportPayload(
        buildExportPayload({
          assessments: [{ capabilityCode: "ZZ_Not_A_Real_Capability" }],
          ratings: [{ questionIndex: 999999999 }],
        })
      );

      expect(result.data!.data.ratings).toHaveLength(0);
    });

    it("warns that an unknown capability will not be visible", () => {
      const result = validateImportPayload(
        buildExportPayload({ assessments: [{ capabilityCode: "ZZ_Not_A_Real_Capability" }] })
      );
      expect(result.warnings.join(" ")).toContain("ZZ_Not_A_Real_Capability");
    });
  });

  describe("structural ambiguity", () => {
    it("keeps only one of two assessments sharing an id", () => {
      const result = validateImportPayload(
        buildExportPayload({ assessments: [{ id: "dupe" }, { id: "dupe" }] })
      );
      expect(result.data!.data.assessments).toHaveLength(1);
      expect(result.warnings.join(" ")).toMatch(/id/i);
    });

    it("keeps only one of two assessments for the same capability", () => {
      // Two rows for one capability made the merge overwrite the first with the
      // second and snapshot it as history, inventing a data point from one file.
      const result = validateImportPayload(
        buildExportPayload({ assessments: [{ id: "a" }, { id: "b" }] })
      );
      expect(result.data!.data.assessments).toHaveLength(1);
      expect(result.warnings.join(" ")).toMatch(/more than one assessment/i);
    });

    it("reports answers that reference a missing assessment", () => {
      // Silently dropping these produced a finalized assessment whose score was
      // backed by no answers at all, reported as an unqualified success.
      const result = validateImportPayload(
        buildExportPayload({ ratings: [{ capabilityAssessmentId: "does-not-exist" }] })
      );

      expect(result.data!.data.ratings).toHaveLength(0);
      expect(result.warnings.join(" ")).toMatch(/not present in this file/i);
    });

    it("flags a scored assessment that arrives with no valid answers", () => {
      const result = validateImportPayload(
        buildExportPayload({
          assessments: [{ score: 4.4 }],
          ratings: [{ capabilityAssessmentId: "orphan" }],
        })
      );
      expect(result.warnings.join(" ")).toMatch(/cannot be verified/i);
    });
  });

  describe("status", () => {
    it.each(["finalized", "in_progress"])("accepts the status %s", (status) => {
      const result = validateImportPayload(buildExportPayload({ assessments: [{ status }] }));
      expect(result.data!.data.assessments[0]!.status).toBe(status);
    });

    it("coerces an unrecognized status to in progress and says so", () => {
      const result = validateImportPayload(
        buildExportPayload({ assessments: [{ status: "banana" }] })
      );
      expect(result.data!.data.assessments[0]!.status).toBe("in_progress");
      expect(result.warnings.join(" ")).toMatch(/banana/);
    });
  });

  describe("tags", () => {
    const tag = (name: string, usageCount = 1) => ({
      id: "tag-1",
      name,
      usageCount,
      lastUsed: "2026-01-01T00:00:00.000Z",
    });

    it("normalizes case so imported tags cannot duplicate existing ones", () => {
      const result = validateImportPayload(buildExportPayload({ tags: [tag("#Provider")] }));
      expect(result.data!.data.tags[0]!.name).toBe("#provider");
    });

    it("rejects a structurally invalid tag", () => {
      const result = validateImportPayload(
        buildExportPayload({ tags: [tag("<script>alert(1)</script>")] })
      );
      expect(result.data!.data.tags).toHaveLength(0);
      expect(result.warnings.join(" ")).toMatch(/not a valid tag/i);
    });

    it("rejects an over-long tag", () => {
      const result = validateImportPayload(buildExportPayload({ tags: [tag("z".repeat(300))] }));
      expect(result.data!.data.tags).toHaveLength(0);
    });

    it("does not trust an imported usage count", () => {
      // A crafted count pinned a tag to the top of every suggestion list.
      const result = validateImportPayload(buildExportPayload({ tags: [tag("#real", 999999)] }));
      expect(result.data!.data.tags[0]!.usageCount).toBe(0);
    });
  });

  /**
   * Tags on an assessment are a separate path from the tag vocabulary above, and they
   * were not held to the same rules. The vocabulary was normalized while the assessment's
   * own list was only filtered for non-empty strings — so an import could write
   * `Provider` onto an assessment while the vocabulary stored `#provider`. The dashboard
   * filter offers vocabulary entries and matches against the assessment's list by string
   * equality, so selecting a tag could return nothing.
   */
  describe("tags carried on an assessment", () => {
    const tagsOn = (tags: unknown) =>
      validateImportPayload(buildExportPayload({ assessments: [{ tags }] })).data!.data
        .assessments[0]!.tags;

    it("lowercases, so the dashboard filter can match its own chips", () => {
      expect(tagsOn(["#Provider"])).toEqual(["#provider"]);
    });

    it("adds the leading hash the vocabulary stores", () => {
      expect(tagsOn(["provider"])).toEqual(["#provider"]);
    });

    it("drops structurally invalid entries instead of rendering them as chips", () => {
      expect(tagsOn(["#ok", "#!!bad tag!!", "  "])).toEqual(["#ok"]);
    });

    it("drops an over-long entry", () => {
      expect(tagsOn([`#${"z".repeat(300)}`])).toEqual([]);
    });

    it("collapses entries that differ only by case", () => {
      expect(tagsOn(["#Wave1", "#wave1", "wave1"])).toEqual(["#wave1"]);
    });

    it("applies the same rules to a history snapshot's tags", () => {
      const result = validateImportPayload(
        buildExportPayload({
          history: [
            {
              id: "h-1",
              capabilityCode: firstCapability().code,
              snapshotDate: "2026-01-01T00:00:00.000Z",
              tags: ["#Provider", "#!!bad!!"],
              score: 3,
              ratings: [{ questionIndex: 0, level: 3, notes: "", attachmentIds: [] }],
              blueprintVersion: "3.0",
            },
          ],
        })
      );
      expect(result.data!.data.history[0]!.tags).toEqual(["#provider"]);
    });
  });

  describe("history entries", () => {
    const entry = (overrides: Record<string, unknown> = {}) => ({
      id: "history-1",
      capabilityCode: firstCapability().code,
      snapshotDate: "2026-01-01T00:00:00.000Z",
      tags: [],
      score: 3,
      ratings: [{ questionIndex: 0, level: 3, notes: "", attachmentIds: [] }],
      blueprintVersion: "3.0",
      ...overrides,
    });

    it("accepts a well-formed entry", () => {
      const result = validateImportPayload(buildExportPayload({ history: [entry()] }));
      expect(result.data!.data.history).toHaveLength(1);
    });

    it("skips an entry whose answers are not a list", () => {
      const result = validateImportPayload(
        buildExportPayload({ history: [entry({ ratings: null })] })
      );
      expect(result.data!.data.history).toHaveLength(0);
      expect(result.warnings.join(" ")).toMatch(/answers/i);
    });

    it("skips a scored entry whose answers are all invalid", () => {
      const result = validateImportPayload(
        buildExportPayload({
          history: [entry({ ratings: [{ questionIndex: 0, level: 99 }] })],
        })
      );
      expect(result.data!.data.history).toHaveLength(0);
    });

    it.each([0, 6])("skips an entry with an out-of-range score of %s", (score) => {
      const result = validateImportPayload(buildExportPayload({ history: [entry({ score })] }));
      expect(result.data!.data.history).toHaveLength(0);
    });

    it("preserves an entry that legitimately has no score", () => {
      const result = validateImportPayload(
        buildExportPayload({ history: [entry({ score: null })] })
      );
      expect(result.data!.data.history[0]!.score).toBeNull();
    });

    it("accepts a history-only file", () => {
      const payload = buildExportPayload({ history: [entry()] });
      (payload.data as Record<string, unknown>).assessments = [];
      (payload.data as Record<string, unknown>).ratings = [];

      const result = validateImportPayload(payload);

      expect(result.errors).toEqual([]);
      expect(result.data!.data.history).toHaveLength(1);
    });
  });

  describe("hostile input", () => {
    it("strips unexpected fields rather than passing them through", () => {
      const result = validateImportPayload(
        buildExportPayload({ assessments: [{ evil: { nested: "payload" } }] })
      );
      expect(result.data!.data.assessments[0]).not.toHaveProperty("evil");
    });

    it("survives deeply nested input without stack overflow", () => {
      let nested: Record<string, unknown> = { end: true };
      for (let i = 0; i < 2000; i += 1) nested = { nested };

      expect(() => validateImportPayload(nested)).not.toThrow();
    });

    it("rebuilds scopeDetails field by field", () => {
      const payload = buildExportPayload();
      payload.scopeDetails = { businessArea: 42, capabilityCode: "CM_X", injected: "bad" };

      const result = validateImportPayload(payload);

      expect(result.data!.scopeDetails).toEqual({
        businessArea: undefined,
        capabilityCode: "CM_X",
        capabilityName: undefined,
      });
    });
  });
});
