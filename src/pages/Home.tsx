import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Box, Button, Card, CardContent, Container, Grid, Typography } from "@mui/material";
import SecurityIcon from "@mui/icons-material/Security";
import OfflineBoltIcon from "@mui/icons-material/OfflineBolt";
import StorageIcon from "@mui/icons-material/Storage";
import AssessmentIcon from "@mui/icons-material/Assessment";
import WarningIcon from "@mui/icons-material/Warning";
import { getBusinessAreas, getCapabilities } from "../services/blueprint";
import { usePageTitle } from "../hooks/usePageTitle";

export default function Home() {
  usePageTitle("About");
  const navigate = useNavigate();

  // Derived from the loaded blueprint rather than hardcoded. The previous "75+"
  // was inaccurate and would drift again the next time the blueprint changed.
  const capabilityCount = useMemo(() => getCapabilities().length, []);
  const businessAreaCount = useMemo(() => getBusinessAreas().length, []);

  const features = [
    {
      icon: <SecurityIcon sx={{ fontSize: 40, color: "primary.main" }} />,
      title: "Privacy First",
      description: "All your data stays in your browser. Nothing is transmitted to any server.",
    },
    {
      icon: <OfflineBoltIcon sx={{ fontSize: 40, color: "primary.main" }} />,
      title: "Works Offline",
      description: "After the first load, use the app anytime — even without internet.",
    },
    {
      icon: <StorageIcon sx={{ fontSize: 40, color: "primary.main" }} />,
      title: "Local Storage",
      description: "Your assessments are saved locally and persist across sessions.",
    },
    {
      icon: <AssessmentIcon sx={{ fontSize: 40, color: "primary.main" }} />,
      title: "MITA 3.0 Framework",
      description: "Assess your maturity against the official CMS MITA 3.0 capabilities.",
    },
  ];

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Box sx={{ textAlign: "center", py: 6 }}>
        <Typography variant="h3" component="h1" gutterBottom fontWeight={600}>
          MITA Self-Assessment Tool
        </Typography>
        <Typography variant="h5" color="text.secondary" paragraph>
          Evaluate your Medicaid IT maturity against the MITA 3.0 framework
        </Typography>
        <Typography
          variant="body1"
          color="text.secondary"
          sx={{ maxWidth: 600, mx: "auto", mb: 4 }}
        >
          This tool helps Medicaid agencies assess their current capabilities and identify
          opportunities for improvement across business processes defined in the Medicaid
          Information Technology Architecture (MITA) framework.
        </Typography>

        <Box
          sx={{
            backgroundColor: "primary.light",
            color: "primary.contrastText",
            py: 2,
            px: 3,
            borderRadius: 2,
            maxWidth: 500,
            mx: "auto",
            mb: 4,
          }}
        >
          <Typography variant="body1" fontWeight={500}>
            No accounts required. No data collection. Your assessments never leave your device.
          </Typography>
        </Box>

        <Button
          variant="contained"
          size="large"
          onClick={() => navigate("/dashboard")}
          sx={{ px: 4, py: 1.5 }}
        >
          Get Started
        </Button>
      </Box>

      {/* Data Privacy Warning */}
      <Alert severity="warning" icon={<WarningIcon />} sx={{ mb: 4, maxWidth: 700, mx: "auto" }}>
        <Typography variant="body2">
          <strong>Important:</strong> Your data is stored locally in your browser. Clearing browser
          data will delete your assessments. Use the Import/Export page to create backups regularly.
        </Typography>
      </Alert>

      {/* How It Works */}
      <Box sx={{ mb: 6 }}>
        <Typography variant="h5" component="h2" textAlign="center" gutterBottom>
          How It Works
        </Typography>
        <Grid container spacing={2} sx={{ mt: 2 }}>
          {[
            {
              step: "1",
              title: "Select a Capability",
              desc: `Choose from ${capabilityCount} MITA 3.0 capabilities across ${businessAreaCount} business areas`,
            },
            {
              step: "2",
              title: "Rate Each Question",
              desc: "Assess your maturity level (1-5) for each BCM question",
            },
            {
              step: "3",
              title: "Export Results",
              desc: "Download your assessment as PDF, ZIP, or JSON",
            },
          ].map((item) => (
            <Grid size={{ xs: 12, md: 4 }} key={item.step}>
              <Box sx={{ textAlign: "center", p: 2 }}>
                <Box
                  sx={{
                    width: 48,
                    height: 48,
                    borderRadius: "50%",
                    bgcolor: "primary.main",
                    color: "white",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    mx: "auto",
                    mb: 2,
                    fontSize: 20,
                    fontWeight: "bold",
                  }}
                >
                  {item.step}
                </Box>
                <Typography variant="h6" gutterBottom>
                  {item.title}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {item.desc}
                </Typography>
              </Box>
            </Grid>
          ))}
        </Grid>
      </Box>

      <Grid container spacing={3} sx={{ mb: 6 }}>
        {features.map((feature, index) => (
          <Grid size={{ xs: 12, sm: 6, md: 3 }} key={index}>
            <Card sx={{ height: "100%", textAlign: "center" }}>
              <CardContent>
                <Box sx={{ mb: 2 }}>{feature.icon}</Box>
                <Typography variant="h6" gutterBottom>
                  {feature.title}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {feature.description}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Box
        sx={{
          textAlign: "center",
          py: 4,
          borderTop: 1,
          borderColor: "divider",
        }}
      >
        <Typography variant="body2" color="text.secondary">
          Based on CMS MITA Framework v3.0 (May 2014)
        </Typography>
        <Typography variant="body2" color="text.secondary">
          This is an independent tool and is not affiliated with or endorsed by CMS.
        </Typography>
      </Box>
    </Container>
  );
}
