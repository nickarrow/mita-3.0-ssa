import { createTheme } from "@mui/material/styles";

// Theme adapted from HourKeep - warm, friendly, government-appropriate
const theme = createTheme({
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

export default theme;
