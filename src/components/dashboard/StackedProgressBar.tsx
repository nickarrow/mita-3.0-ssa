/**
 * Stacked Progress Bar Component
 *
 * Displays a horizontal bar showing finalized, in-progress, and not-started counts.
 * Used for business area summary rows in the dashboard.
 */

import { Box } from "@mui/material";
import { getInProgressGradient } from "../../theme/sharedStyles";
import { PROGRESS_BAR_HEIGHT_LARGE, PROGRESS_STRIPE_WIDTH } from "../../constants/ui";

interface StackedProgressBarProps {
  finalized: number;
  inProgress: number;
  total: number;
}

export function StackedProgressBar({ finalized, inProgress, total }: StackedProgressBarProps) {
  const notStarted = total - finalized - inProgress;
  const finalizedPercent = total > 0 ? (finalized / total) * 100 : 0;
  const inProgressPercent = total > 0 ? (inProgress / total) * 100 : 0;
  const notStartedPercent = total > 0 ? (notStarted / total) * 100 : 0;

  // The segment counts are rendered as visual text only, which conveys nothing
  // about what they represent. A single summary label describes the whole bar.
  const summary = `${finalized} finalized, ${inProgress} in progress, ${notStarted} not assessed, of ${total} capabilities`;

  return (
    <Box
      role="img"
      aria-label={summary}
      sx={{
        display: "flex",
        height: PROGRESS_BAR_HEIGHT_LARGE,
        borderRadius: 1,
        overflow: "hidden",
        backgroundColor: "grey.200",
        fontSize: "0.75rem",
        fontWeight: 500,
      }}
    >
      {finalized > 0 && (
        <Box
          sx={{
            width: `${finalizedPercent}%`,
            backgroundColor: "success.main",
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: finalized > 0 ? 20 : 0,
          }}
        >
          {finalized}
        </Box>
      )}
      {inProgress > 0 && (
        <Box
          sx={{
            width: `${inProgressPercent}%`,
            background: getInProgressGradient(PROGRESS_STRIPE_WIDTH.large),
            color: "#1b5e20",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: inProgress > 0 ? 20 : 0,
          }}
        >
          {inProgress}
        </Box>
      )}
      {notStarted > 0 && (
        <Box
          sx={{
            width: `${notStartedPercent}%`,
            backgroundColor: "grey.300",
            color: "grey.600",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: notStarted > 0 ? 20 : 0,
          }}
        >
          {notStarted}
        </Box>
      )}
    </Box>
  );
}
