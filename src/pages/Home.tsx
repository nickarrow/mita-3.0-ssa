import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Box, Button, Card, CardContent, Container, Grid, Typography } from "@mui/material";
import SecurityIcon from "@mui/icons-material/Security";
import OfflineBoltIcon from "@mui/icons-material/OfflineBolt";
import HistoryIcon from "@mui/icons-material/History";
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

  /**
   * Four cards, each saying something the others do not.
   *
   * "Privacy First" and "Local Storage" previously said the same thing in different words
   * ("data stays in your browser" / "saved locally"), which — with the hero panel and the
   * warning — meant the page made the same point four times. They are merged, and the
   * freed slot covers assessment history, a real feature the page never mentioned.
   */
  const features = [
    {
      icon: <SecurityIcon sx={{ fontSize: 40, color: "primary.main" }} />,
      title: "Private by Design",
      description:
        "Assessments are saved in this browser and never sent to a server. No account needed.",
    },
    {
      icon: <OfflineBoltIcon sx={{ fontSize: 40, color: "primary.main" }} />,
      title: "Works Offline",
      description: "After the first load, use the app anytime — even without internet.",
    },
    {
      icon: <HistoryIcon sx={{ fontSize: 40, color: "primary.main" }} />,
      title: "Tracks Your History",
      description:
        "Re-assess a capability later and previous results are kept, so you can see maturity change.",
    },
    {
      icon: <AssessmentIcon sx={{ fontSize: 40, color: "primary.main" }} />,
      title: "MITA 3.0 Framework",
      description: `Assess against all ${capabilityCount} capabilities published by CMS.`,
    },
  ];

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      {/*
        Vertical rhythm is tightened on small screens so the call to action stays reachable
        without scrolling. At 375x667 the desktop spacing pushed the button to y=665 — just
        inside the viewport, but with only the top two pixels showing, which on a phone means
        the primary action is effectively hidden.
      */}
      <Box sx={{ textAlign: "center", py: { xs: 3, md: 6 } }}>
        <Typography
          variant="h3"
          component="h1"
          gutterBottom
          fontWeight={600}
          sx={{ fontSize: { xs: "2rem", sm: "2.5rem", md: "3rem" } }}
        >
          MITA Self-Assessment Tool
        </Typography>
        <Typography
          variant="h5"
          color="text.secondary"
          paragraph
          sx={{ fontSize: { xs: "1.05rem", md: "1.5rem" } }}
        >
          Evaluate your Medicaid IT maturity against the MITA 3.0 framework
        </Typography>
        <Typography
          variant="body1"
          color="text.secondary"
          sx={{ maxWidth: 600, mx: "auto", mb: 2 }}
        >
          This tool helps Medicaid agencies assess their current capabilities and identify
          opportunities for improvement across the business processes defined in the Medicaid
          Information Technology Architecture (MITA) framework.
        </Typography>

        {/*
          The privacy promise as a line of text, not a filled box.
          
          It used to sit in a `primary.light` panel with white text and a 32px radius,
          directly above the button — 5.4x the button's area and more rounded than it. It
          read as the page's primary call to action, so the eye landed on something that
          could not be clicked and the real button became the secondary element. Said
          plainly here, it informs without competing.
        */}
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ maxWidth: 600, mx: "auto", mb: { xs: 3, md: 4 }, fontWeight: 500 }}
        >
          No accounts, no sign-up, no data collection — your assessments stay on this device.
        </Typography>

        <Button
          variant="contained"
          size="large"
          onClick={() => navigate("/dashboard")}
          sx={{ px: 4, py: 1.5 }}
        >
          Get Started
        </Button>
      </Box>

      {/* How It Works */}
      <Box sx={{ mb: 4 }}>
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

      {/*
        Placed after "How It Works" rather than under the call to action.
        
        It is real and stays prominent, but it is guidance for someone who has data, not
        something a first-time visitor needs before clicking Get Started. Above the fold it
        also broke the hero's flow — headline, promise, button, then a warning, then the
        explanation of what the tool does. Here it follows step 3, "Export Results", so the
        advice to keep backups sits next to the feature that provides them.
      */}
      <Alert severity="warning" icon={<WarningIcon />} sx={{ mb: 6, maxWidth: 700, mx: "auto" }}>
        <Typography variant="body2">
          <strong>Keep your own backups.</strong> Assessments live in this browser only. Clearing
          your browser data will delete them, and they do not follow you to another computer. Use
          Import/Export to save a copy.
        </Typography>
      </Alert>

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
