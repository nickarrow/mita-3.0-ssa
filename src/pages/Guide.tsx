/**
 * Guide page - How to use the MITA 3.0 SS-A Tool
 */

import { useNavigate } from "react-router-dom";
import {
  Box,
  Container,
  Typography,
  Paper,
  Button,
  Alert,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Grid,
} from "@mui/material";
import DashboardIcon from "@mui/icons-material/Dashboard";
import AssessmentIcon from "@mui/icons-material/Assessment";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import SaveIcon from "@mui/icons-material/Save";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import WarningIcon from "@mui/icons-material/Warning";
import InfoIcon from "@mui/icons-material/Info";
import GitHubIcon from "@mui/icons-material/GitHub";
import { usePageTitle } from "../hooks/usePageTitle";

export default function Guide() {
  usePageTitle("Guide");
  const navigate = useNavigate();

  const steps = [
    {
      icon: <DashboardIcon color="primary" />,
      title: "Start from the Dashboard",
      description:
        'The Dashboard lists every MITA 3.0 capability grouped by business area. Expand an area, then click "Start" on the capability you want to assess. If you already have one in progress, use the "•••" menu and choose "Resume".',
    },
    {
      icon: <AssessmentIcon color="primary" />,
      title: "Select a Capability to Assess",
      description:
        "Each capability has a set of questions from the Business Capability Model (BCM). The left sidebar shows process details from the Business Process Template (BPT) for context.",
    },
    {
      icon: <CheckCircleIcon color="primary" />,
      title: "Rate Each Question (Levels 1-5)",
      description:
        "For each question, select the maturity level that best describes your current state. Level 1 is Initial, Level 5 is Optimized. Read the level descriptions carefully to make accurate assessments.",
    },
    {
      icon: <AttachFileIcon color="primary" />,
      title: "Add Notes and Attachments",
      description:
        "Document your rationale with notes and attach supporting evidence (PDFs, documents, images). This helps justify your ratings and provides context for future reviews.",
    },
    {
      icon: <SaveIcon color="primary" />,
      title: "Finalize Your Assessment",
      description:
        'Once all questions are answered, click "Finalize Assessment" to lock in your ratings. You can edit finalized assessments later if needed — previous versions are saved to history.',
    },
    {
      icon: <FileDownloadIcon color="primary" />,
      title: "Export Your Results",
      description:
        "Use the Import/Export page to download your assessments as a ZIP backup (includes attachments), PDF report (for stakeholders), or JSON data file.",
    },
  ];

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Guide
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Learn how to use the MITA 3.0 State Self-Assessment Tool to evaluate your Medicaid IT
        maturity.
      </Typography>

      {/* How to Use This Tool */}
      <Paper sx={{ p: 3, mb: 4 }}>
        <Typography variant="h5" component="h2" gutterBottom>
          How to Use This Tool
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Follow these six steps to complete your MITA 3.0 maturity assessment:
        </Typography>

        <List>
          {steps.map((step, index) => (
            <Box key={index}>
              <ListItem alignItems="flex-start" sx={{ py: 2 }}>
                <ListItemIcon sx={{ mt: 0.5 }}>
                  <Box
                    sx={{
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      bgcolor: "primary.main",
                      color: "white",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: "bold",
                      fontSize: 14,
                    }}
                  >
                    {index + 1}
                  </Box>
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        mb: 0.5,
                      }}
                    >
                      {step.icon}
                      <Typography variant="subtitle1" fontWeight={500}>
                        {step.title}
                      </Typography>
                    </Box>
                  }
                  secondary={step.description}
                  secondaryTypographyProps={{ variant: "body2" }}
                />
              </ListItem>
              {index < steps.length - 1 && <Divider variant="inset" component="li" />}
            </Box>
          ))}
        </List>

        <Box sx={{ mt: 3, display: "flex", gap: 2 }}>
          <Button variant="contained" onClick={() => navigate("/dashboard")}>
            Go to Dashboard
          </Button>
          <Button variant="outlined" onClick={() => navigate("/import-export")}>
            Import/Export
          </Button>
        </Box>
      </Paper>

      <Grid container spacing={3}>
        {/* Understanding Your Data */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 3, height: "100%" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
              <WarningIcon color="warning" />
              <Typography variant="h6" component="h2">
                Understanding Your Data
              </Typography>
            </Box>

            <Alert severity="warning" sx={{ mb: 2 }}>
              Your data is stored locally in your browser. Clearing browser data will delete your
              assessments.
            </Alert>

            <Typography variant="body2" paragraph>
              This tool stores all assessment data in your browser's local storage (IndexedDB). Your
              data never leaves your device — nothing is sent to any server.
            </Typography>

            <Typography variant="body2" paragraph>
              <strong>Important:</strong> To protect your work, regularly export backups using the
              Import/Export page. We recommend downloading a ZIP backup after each assessment
              session.
            </Typography>

            <Typography variant="body2">
              If you need to use the tool on a different device or browser, export your data and
              import it on the new device.
            </Typography>
          </Paper>
        </Grid>

        {/* About MITA 3.0 */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 3, height: "100%" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
              <InfoIcon color="info" />
              <Typography variant="h6" component="h2">
                About MITA 3.0
              </Typography>
            </Box>

            <Typography variant="body2" paragraph>
              The Medicaid Information Technology Architecture (MITA) is a CMS initiative to
              establish national guidelines for technologies and processes that support improved
              program administration for Medicaid.
            </Typography>

            <Typography variant="body2" paragraph>
              MITA 3.0 uses the Business Capability Model (BCM) to define maturity levels across
              five levels:
            </Typography>

            <List dense>
              <ListItem>
                <ListItemText primary="Level 1: Initial" secondary="Ad hoc, manual processes" />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary="Level 2: Developing"
                  secondary="Repeatable but inconsistent"
                />
              </ListItem>
              <ListItem>
                <ListItemText primary="Level 3: Defined" secondary="Standardized processes" />
              </ListItem>
              <ListItem>
                <ListItemText primary="Level 4: Managed" secondary="Measured and controlled" />
              </ListItem>
              <ListItem>
                <ListItemText primary="Level 5: Optimized" secondary="Continuous improvement" />
              </ListItem>
            </List>
          </Paper>
        </Grid>

        {/* Open Source */}
        <Grid size={12}>
          <Paper sx={{ p: 3 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
              <GitHubIcon />
              <Typography variant="h6" component="h2">
                Open Source
              </Typography>
            </Box>

            <Typography variant="body2" paragraph>
              This tool is open source and built with React, TypeScript, and Material UI. The
              assessment data is based on the official CMS MITA 3.0 framework documentation.
            </Typography>

            <Typography variant="body2" color="text.secondary">
              This is an independent tool and is not affiliated with or endorsed by CMS.
            </Typography>
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
}
