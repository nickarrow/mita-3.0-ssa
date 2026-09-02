/**
 * Processes Page - Business Process Viewer
 *
 * Master-detail layout for browsing all MITA 3.0 Business Process Templates.
 * Left panel: collapsible tree of business areas and processes
 * Right panel: selected BPT content
 */

import { useMemo, useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box,
  Collapse,
  Container,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { visuallyHidden } from "@mui/utils";
import MenuIcon from "@mui/icons-material/Menu";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import { getBusinessAreas, getCapabilityByCode } from "../services/blueprint";
import { BptContent } from "../components/bpt";
import { HEADER_HEIGHT } from "../constants/ui";
import { usePageTitle } from "../hooks/usePageTitle";

// Width of the navigation panel
const NAV_PANEL_WIDTH = 320;
const NAV_PANEL_WIDTH_MOBILE = 280;

export default function Processes() {
  usePageTitle("Business Processes");
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const businessAreas = useMemo(() => getBusinessAreas(), []);

  // Track expanded business areas
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(() => {
    // Initialize with the selected capability's business area if present
    if (code) {
      const cap = getCapabilityByCode(code);
      if (cap) {
        return new Set([cap.businessArea]);
      }
    }
    return new Set();
  });

  // Mobile drawer state
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Refs for scrolling selected item into view
  const selectedItemRef = useRef<HTMLDivElement>(null);
  const navScrollContainerRef = useRef<HTMLDivElement>(null);
  const contentScrollContainerRef = useRef<HTMLDivElement>(null);

  // Get selected capability
  const selectedCapability = useMemo(() => {
    if (!code) return null;
    return getCapabilityByCode(code);
  }, [code]);

  // Expand the business area when navigating to a new capability
  // This is done during render (not in an effect) to avoid cascading renders
  if (selectedCapability && !expandedAreas.has(selectedCapability.businessArea)) {
    setExpandedAreas((prev) => new Set([...prev, selectedCapability.businessArea]));
  }

  // Scroll selected item into view when selection changes
  // Also scroll content to top
  useEffect(() => {
    // Scroll content to top
    if (contentScrollContainerRef.current) {
      contentScrollContainerRef.current.scrollTop = 0;
    }

    // Scroll sidebar to show selected item
    if (selectedItemRef.current) {
      // Small delay to ensure the collapse animation has completed
      const timeoutId = setTimeout(() => {
        selectedItemRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [code]);

  const toggleArea = (areaName: string) => {
    setExpandedAreas((prev) => {
      const next = new Set(prev);
      if (next.has(areaName)) {
        next.delete(areaName);
      } else {
        next.add(areaName);
      }
      return next;
    });
  };

  const handleSelectProcess = (capabilityCode: string) => {
    navigate(`/processes/${capabilityCode}`);
    if (isMobile) {
      setMobileNavOpen(false);
    }
  };

  // Navigation panel content
  const navContent = (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <Box sx={{ p: 2, borderBottom: 1, borderColor: "divider" }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Business Processes
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {businessAreas.reduce((sum, area) => sum + area.capabilities.length, 0)} processes in{" "}
          {businessAreas.length} areas
        </Typography>
      </Box>

      {/* Tree navigation */}
      <Box ref={navScrollContainerRef} sx={{ flex: 1, overflow: "auto" }}>
        <List dense disablePadding>
          {businessAreas.map((area) => {
            const isExpanded = expandedAreas.has(area.name);
            const hasSelectedChild = selectedCapability?.businessArea === area.name;

            return (
              <Box key={area.name}>
                {/* Business area header */}
                <ListItemButton
                  onClick={() => toggleArea(area.name)}
                  sx={{
                    py: 0.75,
                    backgroundColor: hasSelectedChild ? "action.selected" : "transparent",
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    {isExpanded ? (
                      <FolderOpenIcon fontSize="small" color="primary" />
                    ) : (
                      <FolderOutlinedIcon fontSize="small" />
                    )}
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <>
                        {area.name}
                        <Typography
                          component="span"
                          variant="caption"
                          color="text.secondary"
                          sx={{ ml: 1 }}
                        >
                          ({area.capabilities.length})
                        </Typography>
                      </>
                    }
                    primaryTypographyProps={{
                      variant: "body2",
                      fontWeight: 600,
                    }}
                  />
                  {isExpanded ? (
                    <KeyboardArrowDownIcon fontSize="small" />
                  ) : (
                    <KeyboardArrowRightIcon fontSize="small" />
                  )}
                </ListItemButton>

                {/* Capability list */}
                <Collapse in={isExpanded}>
                  <List dense disablePadding>
                    {area.capabilities.map((cap) => {
                      const isSelected = code === cap.code;

                      return (
                        <ListItemButton
                          key={cap.code}
                          ref={isSelected ? selectedItemRef : null}
                          onClick={() => handleSelectProcess(cap.code)}
                          selected={isSelected}
                          sx={{
                            pl: 4,
                            py: 0.75,
                            "&.Mui-selected": {
                              backgroundColor: "primary.main",
                              color: "primary.contrastText",
                              "&:hover": {
                                backgroundColor: "primary.dark",
                              },
                              "& .MuiListItemIcon-root": {
                                color: "primary.contrastText",
                              },
                            },
                          }}
                        >
                          <ListItemIcon sx={{ minWidth: 32 }}>
                            <DescriptionOutlinedIcon
                              fontSize="small"
                              color={isSelected ? "inherit" : "action"}
                            />
                          </ListItemIcon>
                          <ListItemText
                            primary={cap.processName}
                            primaryTypographyProps={{
                              variant: "body2",
                              fontWeight: isSelected ? 600 : 400,
                            }}
                          />
                        </ListItemButton>
                      );
                    })}
                  </List>
                </Collapse>
              </Box>
            );
          })}
        </List>
      </Box>
    </Box>
  );

  // Empty state when no process is selected
  const emptyState = (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        p: 4,
        textAlign: "center",
      }}
    >
      <DescriptionOutlinedIcon sx={{ fontSize: 64, color: "text.disabled", mb: 2 }} />
      <Typography variant="h6" color="text.secondary" gutterBottom>
        Select a Process
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 400 }}>
        Choose a business process from the list on the left to view its details, including
        description, process steps, trigger events, and more.
      </Typography>
    </Box>
  );

  return (
    <Box sx={{ display: "flex", height: `calc(100vh - ${HEADER_HEIGHT}px)` }}>
      {/*
        The visible page heading lives inside the nav panel, which is a drawer on
        mobile and therefore absent from the document. This gives the page exactly
        one h1 at every viewport without duplicating visible text.
      */}
      <Typography variant="h1" component="h1" sx={visuallyHidden}>
        Business Processes
      </Typography>
      {/* Navigation panel - desktop */}
      {!isMobile && (
        <Paper
          elevation={0}
          sx={{
            width: NAV_PANEL_WIDTH,
            flexShrink: 0,
            borderRight: 1,
            borderColor: "divider",
            height: "100%",
            overflow: "hidden",
          }}
        >
          {navContent}
        </Paper>
      )}

      {/* Navigation drawer - mobile */}
      {isMobile && (
        <Drawer
          anchor="left"
          open={mobileNavOpen}
          onClose={() => setMobileNavOpen(false)}
          sx={{
            "& .MuiDrawer-paper": {
              width: NAV_PANEL_WIDTH_MOBILE,
              top: HEADER_HEIGHT,
              height: `calc(100% - ${HEADER_HEIGHT}px)`,
            },
          }}
        >
          {navContent}
        </Drawer>
      )}

      {/* Main content area */}
      <Box sx={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>
        {/* Mobile header with menu button */}
        {isMobile && (
          <Box
            sx={{
              p: 1.5,
              borderBottom: 1,
              borderColor: "divider",
              display: "flex",
              alignItems: "center",
              gap: 1,
            }}
          >
            <IconButton
              onClick={() => setMobileNavOpen(true)}
              size="small"
              aria-label="Open process list"
            >
              <MenuIcon />
            </IconButton>
            <Typography variant="body2" color="text.secondary">
              {selectedCapability
                ? `${selectedCapability.businessArea} / ${selectedCapability.processName}`
                : "Select a process"}
            </Typography>
          </Box>
        )}

        {/* Content */}
        <Box ref={contentScrollContainerRef} sx={{ flex: 1, overflow: "auto" }}>
          {selectedCapability ? (
            <Container maxWidth="md" sx={{ py: 3 }}>
              <BptContent
                bpt={selectedCapability.bpt}
                showHeader={true}
                showMetadata={true}
                onProcessClick={(code) => navigate(`/processes/${code}`)}
              />
            </Container>
          ) : (
            emptyState
          )}
        </Box>
      </Box>
    </Box>
  );
}
