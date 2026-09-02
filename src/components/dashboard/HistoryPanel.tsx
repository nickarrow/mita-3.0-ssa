/**
 * History Panel Component
 *
 * Displays assessment history for a capability, including the current
 * finalized assessment and historical snapshots.
 */

import { Box, Chip, IconButton, Typography } from "@mui/material";
import VisibilityIcon from "@mui/icons-material/Visibility";
import DeleteIcon from "@mui/icons-material/Delete";
import { useCapabilityHistory } from "../../hooks/useHistory";
import { compactChipSx } from "../../theme/sharedStyles";
import { formatDateTime } from "../../utils/dateFormatters";
import { HISTORY_BADGE_WIDTH, HISTORY_DATE_WIDTH, HISTORY_SCORE_WIDTH } from "../../constants/ui";
import type { AssessmentHistory, CapabilityAssessment } from "../../types";

interface HistoryPanelProps {
  capabilityCode: string;
  currentAssessment: CapabilityAssessment | undefined;
  onViewHistory: (entry: AssessmentHistory) => void;
  onDeleteHistory: (entry: AssessmentHistory) => void;
}

export function HistoryPanel({
  capabilityCode,
  currentAssessment,
  onViewHistory,
  onDeleteHistory,
}: HistoryPanelProps) {
  const { history } = useCapabilityHistory(capabilityCode);

  const hasCurrentFinalized =
    currentAssessment?.status === "finalized" && currentAssessment.score !== undefined;
  const hasHistory = history.length > 0;

  if (!hasCurrentFinalized && !hasHistory) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ pl: 5, py: 1 }}>
        No assessments yet
      </Typography>
    );
  }

  return (
    <Box sx={{ pl: { xs: 1, md: 5 }, py: 1, minWidth: 0 }}>
      <Typography
        variant="caption"
        color="text.secondary"
        fontWeight={600}
        sx={{ mb: 1, display: "block" }}
      >
        Assessment History
      </Typography>

      {/* Current finalized assessment */}
      {hasCurrentFinalized && currentAssessment && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            rowGap: 0.5,
            py: 0.5,
            borderBottom: "1px solid",
            borderColor: "divider",
            backgroundColor: "success.50",
            mx: -1,
            px: 1,
            borderRadius: 1,
          }}
        >
          <Box sx={{ width: { xs: "auto", md: HISTORY_BADGE_WIDTH }, mr: { xs: 1, md: 0 } }}>
            <Chip
              label="Current"
              size="small"
              color="success"
              sx={{ ...compactChipSx, fontWeight: 600 }}
            />
          </Box>
          <Typography
            variant="body2"
            sx={{ width: { xs: "auto", md: HISTORY_DATE_WIDTH }, mr: { xs: 1, md: 0 } }}
          >
            {formatDateTime(currentAssessment.finalizedAt || currentAssessment.updatedAt)}
          </Typography>
          <Typography
            variant="body2"
            fontWeight={500}
            sx={{ width: { xs: "auto", md: HISTORY_SCORE_WIDTH }, mr: { xs: 1, md: 0 } }}
          >
            Score: {currentAssessment.score?.toFixed(1)}
          </Typography>
          <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
            {currentAssessment.tags.map((tag) => (
              <Chip key={tag} label={tag} size="small" variant="outlined" sx={compactChipSx} />
            ))}
          </Box>
        </Box>
      )}

      {/* Historical assessments */}
      {history.map((entry: AssessmentHistory) => (
        <Box
          key={entry.id}
          sx={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            rowGap: 0.5,
            py: 0.5,
            borderBottom: "1px solid",
            borderColor: "divider",
          }}
        >
          <Box sx={{ width: { xs: 0, md: HISTORY_BADGE_WIDTH } }} />{" "}
          {/* Spacer for "Current" badge alignment */}
          <Typography
            variant="body2"
            sx={{ width: { xs: "auto", md: HISTORY_DATE_WIDTH }, mr: { xs: 1, md: 0 } }}
          >
            {formatDateTime(entry.snapshotDate)}
          </Typography>
          <Typography
            variant="body2"
            fontWeight={500}
            sx={{ width: { xs: "auto", md: HISTORY_SCORE_WIDTH }, mr: { xs: 1, md: 0 } }}
          >
            {/* A snapshot can legitimately have no score (an imported assessment
                that was finalized without one). Show that rather than a stand-in. */}
            Score: {entry.score !== null ? entry.score.toFixed(1) : "—"}
          </Typography>
          <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
            {entry.tags.map((tag) => (
              <Chip key={tag} label={tag} size="small" variant="outlined" sx={compactChipSx} />
            ))}
          </Box>
          <Box sx={{ display: "flex", gap: 0.5, ml: { xs: 0, md: 2 } }}>
            <IconButton size="small" onClick={() => onViewHistory(entry)} title="View details">
              <VisibilityIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              onClick={() => onDeleteHistory(entry)}
              title="Delete history entry"
              color="error"
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>
      ))}
    </Box>
  );
}
