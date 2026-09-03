import { createTheme, lighten } from "@mui/material/styles";

/**
 * A very pale tint of each semantic colour, for callout and highlight backgrounds.
 *
 * Nine call sites already asked for `info.50`, `warning.50`, `primary.50` and
 * `success.50` — and got nothing. MUI's semantic palette entries carry only
 * `main`/`light`/`dark`/`contrastText`, and an `sx` palette path that does not resolve is
 * passed through as a raw string, so those backgrounds silently painted no colour at all.
 * Measured in the browser: the Constraints callout computed to `rgb(255, 255, 255)` while
 * its 3px left border resolved correctly, which is why the bug read as a styling choice.
 *
 * Defined once here rather than replaced with `alpha()` at each call site, so the theme
 * stays the single source of truth and the existing usage becomes correct rather than
 * having to change.
 */
declare module "@mui/material/styles" {
  interface PaletteColor {
    50: string;
  }
  interface SimplePaletteColorOptions {
    50?: string;
  }
}

// Theme adapted from HourKeep - warm, friendly, government-appropriate
const base = createTheme({
  palette: {
    primary: {
      main: "#6B4E71", // Muted purple
      light: "#8B6E91",
      dark: "#4B2E51",
      contrastText: "#FFFFFF",
    },
    secondary: {
      main: "#D4A574", // Warm tan/gold
      light: "#E4C5A4",
      dark: "#B48554",
    },
    success: {
      main: "#5C8D5A", // Earthy green
      light: "#7DAD7B",
      dark: "#3D6D3B",
    },
    warning: {
      main: "#D97D54", // Warm orange
      light: "#E49D74",
      dark: "#B95D34",
    },
    error: {
      main: "#C85A54", // Warm red
    },
    background: {
      default: "#FAF9F7", // Warm off-white
      paper: "#FFFFFF",
    },
    text: {
      primary: "#2D2D2D", // Warm black
      secondary: "#6B6B6B",
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: {
      fontWeight: 700,
      letterSpacing: "-0.02em",
    },
    h2: {
      fontWeight: 700,
      letterSpacing: "-0.02em",
    },
    h3: {
      fontWeight: 700,
      letterSpacing: "-0.02em",
    },
    h4: {
      fontWeight: 700,
      letterSpacing: "-0.02em",
    },
    h5: {
      fontWeight: 700,
      letterSpacing: "-0.02em",
    },
    h6: {
      fontWeight: 600,
      letterSpacing: "-0.01em",
    },
    button: {
      fontWeight: 600,
      textTransform: "none", // Less shouty buttons
    },
  },
  shape: {
    borderRadius: 16, // More rounded, friendly
  },
  components: {
    /**
     * Visible focus indicator for keyboard users.
     *
     * MUI's defaults leave focused icon buttons and table controls with
     * `outline: none` and only a faint background tint, which is not a reliable
     * focus indicator. This applies a consistent, high-contrast ring to anything
     * reached by keyboard, without affecting mouse clicks (`:focus-visible`).
     */
    MuiCssBaseline: {
      styleOverrides: {
        "*:focus-visible": {
          outline: "3px solid #4B2E51",
          outlineOffset: "2px",
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          padding: "10px 24px",
        },
        contained: {
          boxShadow: "none",
          "&:hover": {
            boxShadow: "0 2px 8px rgba(107, 78, 113, 0.25)",
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none", // Remove MUI's default gradient
        },
        elevation1: {
          boxShadow: "0 2px 8px rgba(107, 78, 113, 0.08)",
        },
        elevation2: {
          boxShadow: "0 4px 16px rgba(107, 78, 113, 0.12)",
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: "0 2px 8px rgba(107, 78, 113, 0.08)",
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 20, // Pill-shaped
          fontWeight: 600,
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          height: 8,
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          boxShadow: "0 1px 3px rgba(107, 78, 113, 0.12)",
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          borderRight: "1px solid rgba(107, 78, 113, 0.08)",
        },
      },
    },
    MuiAccordion: {
      styleOverrides: {
        root: {
          boxShadow: "none",
          "&:before": {
            display: "none",
          },
          "&.Mui-expanded": {
            margin: 0,
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          fontWeight: 600,
        },
      },
    },
  },
});

/**
 * Layer the tint shades on, derived from each colour's own `main`.
 *
 * Derived rather than hardcoded so a change to `main` carries through instead of leaving
 * a tint that no longer belongs to it. `info` is included because the theme does not
 * define it and therefore inherits MUI's default — the tint has to come from whatever
 * `main` actually ends up being, which only the built palette knows.
 *
 * 0.92 is close to MUI's own `50` steps: readable dark text on top, while still clearly
 * a tint rather than white.
 */
const TINT = 0.92;

const theme = createTheme(base, {
  palette: {
    primary: { 50: lighten(base.palette.primary.main, TINT) },
    secondary: { 50: lighten(base.palette.secondary.main, TINT) },
    success: { 50: lighten(base.palette.success.main, TINT) },
    warning: { 50: lighten(base.palette.warning.main, TINT) },
    error: { 50: lighten(base.palette.error.main, TINT) },
    info: { 50: lighten(base.palette.info.main, TINT) },
  },
});

export default theme;
