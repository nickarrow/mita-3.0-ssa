/**
 * Not Found Page
 *
 * Catch-all for unmatched routes. Without this, an unmatched URL matched no route
 * at all, so the Layout never mounted and the user got a completely blank page
 * with no header and no way to navigate back.
 */

import { useLocation, useNavigate } from "react-router-dom";
import { Box, Button, Container, Typography } from "@mui/material";
import { usePageTitle } from "../hooks/usePageTitle";

export default function NotFound() {
  usePageTitle("Page not found");
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <Container maxWidth="sm" sx={{ py: 8 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Page not found
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 1 }}>
        There is nothing at <code>{location.pathname}</code>.
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 4 }}>
        The link may be out of date, or the address may have been mistyped.
      </Typography>
      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
        <Button variant="contained" onClick={() => navigate("/dashboard")}>
          Go to Dashboard
        </Button>
        <Button variant="outlined" onClick={() => navigate("/guide")}>
          Read the Guide
        </Button>
      </Box>
    </Container>
  );
}
