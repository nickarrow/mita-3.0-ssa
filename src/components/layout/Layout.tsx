import { useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import {
  AppBar,
  Box,
  Button,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import DashboardIcon from "@mui/icons-material/Dashboard";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import ImportExportIcon from "@mui/icons-material/ImportExport";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { APP_SHORT_NAME } from "../../constants/app";

const navItems = [
  { label: "Dashboard", path: "/dashboard", icon: <DashboardIcon /> },
  { label: "Processes", path: "/processes", icon: <AccountTreeIcon /> },
  {
    label: "Import/Export",
    path: "/import-export",
    icon: <ImportExportIcon />,
  },
  { label: "Guide", path: "/guide", icon: <InfoOutlinedIcon /> },
];

export default function Layout() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleNavClick = (path: string) => {
    navigate(path);
    if (isMobile) {
      setMobileOpen(false);
    }
  };

  // Check if a nav item is active (handles nested routes like /processes/:code)
  const isNavActive = (path: string) => {
    if (path === "/processes") {
      return location.pathname.startsWith("/processes");
    }
    return location.pathname === path;
  };

  // Mobile drawer content
  const mobileDrawer = (
    <Box component="nav" aria-label="Main navigation" sx={{ width: 240 }}>
      <Toolbar>
        <Typography variant="h6" noWrap component="div" sx={{ fontWeight: 600 }}>
          {APP_SHORT_NAME}
        </Typography>
      </Toolbar>
      <List>
        {navItems.map((item) => (
          <ListItem key={item.path} disablePadding>
            <ListItemButton
              selected={isNavActive(item.path)}
              onClick={() => handleNavClick(item.path)}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      {/*
        Skip link: the first tab stop, letting keyboard users bypass the nav.
        Positioned off-screen until focused.
      */}
      <Box
        component="a"
        href="#main-content"
        sx={{
          // fixed, not absolute: with no positioned ancestor, `absolute` resolves
          // against the document, so on a scrolled page the link focused
          // off-screen instead of appearing at the top of the viewport.
          position: "fixed",
          left: 8,
          top: -64,
          zIndex: (t) => t.zIndex.appBar + 1,
          px: 2,
          py: 1,
          borderRadius: 1,
          backgroundColor: "background.paper",
          color: "primary.main",
          fontWeight: 600,
          textDecoration: "none",
          "&:focus": { top: 8 },
        }}
      >
        Skip to main content
      </Box>

      <AppBar position="fixed">
        <Toolbar>
          {/* Mobile menu button */}
          {isMobile && (
            <IconButton
              color="inherit"
              aria-label="open drawer"
              edge="start"
              onClick={handleDrawerToggle}
              sx={{ mr: 2 }}
            >
              <MenuIcon />
            </IconButton>
          )}

          {/*
            Rendered as a real button so it is focusable and announced. As a
            plain clickable <div> it was invisible to keyboard and screen-reader
            users despite being the route home.
          */}
          <Typography
            variant="h6"
            noWrap
            component="button"
            aria-label={`${APP_SHORT_NAME} — go to home page`}
            sx={{
              fontWeight: 600,
              cursor: "pointer",
              mr: 4,
              background: "none",
              border: "none",
              color: "inherit",
              font: "inherit",
              p: 0,
            }}
            onClick={() => navigate("/")}
          >
            {APP_SHORT_NAME}
          </Typography>

          {/* Desktop navigation - right aligned */}
          {!isMobile && (
            <Box
              component="nav"
              aria-label="Main navigation"
              sx={{ display: "flex", gap: 1, ml: "auto" }}
            >
              {navItems.map((item) => (
                <Button
                  key={item.path}
                  color="inherit"
                  startIcon={item.icon}
                  onClick={() => handleNavClick(item.path)}
                  sx={{
                    backgroundColor: isNavActive(item.path)
                      ? "rgba(255,255,255,0.15)"
                      : "transparent",
                    "&:hover": {
                      backgroundColor: "rgba(255,255,255,0.25)",
                    },
                  }}
                >
                  {item.label}
                </Button>
              ))}
            </Box>
          )}
        </Toolbar>
      </AppBar>

      {/* Mobile drawer */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={handleDrawerToggle}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: "block", md: "none" },
          "& .MuiDrawer-paper": { boxSizing: "border-box", width: 240 },
        }}
      >
        {mobileDrawer}
      </Drawer>

      {/* Main content */}
      <Box
        component="main"
        id="main-content"
        sx={{
          flexGrow: 1,
          mt: "64px",
          backgroundColor: "background.default",
          minHeight: "calc(100vh - 64px)",
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
}
