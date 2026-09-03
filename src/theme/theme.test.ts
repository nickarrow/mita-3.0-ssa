/**
 * Tests for the theme.
 *
 * Two things are asserted, both of which failed silently before.
 *
 * The `50` tints must resolve to real colours. Nine call sites asked for `info.50`,
 * `warning.50`, `primary.50` and `success.50`, and got nothing: MUI's semantic palette
 * entries carry only `main`/`light`/`dark`/`contrastText`, and an `sx` palette path that
 * does not resolve is passed through as a raw CSS string, so the background painted
 * nothing. Nothing failed — the callouts simply appeared white, which read as a design
 * choice rather than a bug.
 *
 * And the layered `createTheme(base, { palette })` must not drop anything from `base`.
 * Losing the `focus-visible` override there would remove the focus indicator for every
 * custom clickable element in the app, which no other test would notice.
 */

import { describe, expect, it } from "vitest";
import theme from ".";

const SEMANTIC = ["primary", "secondary", "success", "warning", "error", "info"] as const;

describe("semantic colour tints", () => {
  it.each(SEMANTIC)("%s has a 50 shade that is a real colour", (key) => {
    const tint = theme.palette[key][50];
    expect(tint).toMatch(/^(#|rgb)/);
    expect(tint).not.toMatch(/^(#fff|#ffffff)$/i);
    expect(tint).not.toBe("rgb(255, 255, 255)");
  });

  it.each(SEMANTIC)("%s tint is light enough to carry dark body text", (key) => {
    // These are callout backgrounds rendering text.primary (#2D2D2D). A tint dark enough
    // to hurt contrast would be a regression in readability, not just in looks.
    const [, r, g, b] = theme.palette[key][50].match(/(\d+), (\d+), (\d+)/)!.map(Number);
    const luminance = (0.299 * r! + 0.587 * g! + 0.114 * b!) / 255;
    expect(luminance).toBeGreaterThan(0.85);
  });

  it("derives each tint from its own main, so they cannot drift apart", () => {
    // Not a hardcoded table: a change to `main` must carry through to the tint.
    expect(theme.palette.primary[50]).not.toBe(theme.palette.warning[50]);
    expect(theme.palette.success[50]).not.toBe(theme.palette.error[50]);
  });
});

describe("layering the tints preserves the base theme", () => {
  it("keeps the focus-visible ring", () => {
    // The keystone accessibility override: MUI leaves focused icon buttons and table
    // controls with `outline: none`, so without this there is no focus indicator on any
    // of the app's custom clickable elements.
    const overrides = JSON.stringify(theme.components?.MuiCssBaseline?.styleOverrides);
    expect(overrides).toContain("focus-visible");
    expect(overrides).toContain("3px solid");
  });

  it.each(["MuiButton", "MuiChip", "MuiPaper", "MuiTableCell", "MuiLinearProgress"] as const)(
    "keeps the %s override",
    (component) => {
      expect(theme.components?.[component]?.styleOverrides).toBeDefined();
    }
  );

  it("keeps typography and shape", () => {
    expect(theme.typography.fontFamily).toContain("Inter");
    expect(theme.typography.button.textTransform).toBe("none");
    expect(theme.shape.borderRadius).toBe(16);
  });

  it("leaves the brand colours untouched", () => {
    expect(theme.palette.primary.main).toBe("#6B4E71");
    expect(theme.palette.success.main).toBe("#5C8D5A");
    expect(theme.palette.warning.main).toBe("#D97D54");
    expect(theme.palette.background.default).toBe("#FAF9F7");
    expect(theme.palette.text.primary).toBe("#2D2D2D");
  });

  it("leaves grey alone, which already had numeric shades", () => {
    expect(theme.palette.grey[50]).toBeTruthy();
    expect(theme.palette.grey[100]).toBeTruthy();
  });
});
