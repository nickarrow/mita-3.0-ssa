/**
 * Capability Progress Bar Component
 *
 * Displays a simple progress bar for individual capability rows.
 * Shows completion percentage with different styles for finalized vs in-progress.
 */

import { Box } from "@mui/material";
import { getInProgressGradient } from "../../theme/sharedStyles";
import { PROGRESS_BAR_HEIGHT_SMALL, PROGRESS_STRIPE_WIDTH } from "../../constants/ui";

interface CapabilityProgressBarProps {
  status: "not_assessed" | "in_progress" | "finalized";
  progress: number; // 0-100 for question completion
}

export function CapabilityProgressBar({ status, progress }: CapabilityProgressBarProps) {
  const isFinalized = status === "finalized";
  const isInProgress = status === "in_progress";
  // Show the real figure. Assuming 100% for anything finalized hid genuinely
  // incomplete assessments, which imported data can produce.
  const displayProgress = Math.max(0, Math.min(100, progress));

  return (
    <Box
      // role="img" rather than "progressbar": this is a static summary in a table
      // cell, not an operation in progress. It also avoids the double announcement
      // that aria-label plus aria-valuenow produced ("30% answered, 30%").
      role="img"
      aria-label={
        status === "not_assessed" ? "Not assessed" : `${displayProgress}% of questions answered`
      }
      sx={{
        height: PROGRESS_BAR_HEIGHT_SMALL,
        borderRadius: 1,
        overflow: "hidden",
        backgroundColor: "grey.200",
      }}
    >
      {displayProgress > 0 && (
        <Box
          sx={{
            width: `${displayProgress}%`,
            height: "100%",
            ...(isFinalized
              ? {
                  backgroundColor: "success.main",
                }
              : isInProgress
                ? {
                    background: getInProgressGradient(PROGRESS_STRIPE_WIDTH.medium),
                  }
                : {
                    backgroundColor: "grey.300",
                  }),
          }}
        />
      )}
    </Box>
  );
}
