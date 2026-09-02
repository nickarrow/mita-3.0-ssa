/**
 * History View Dialog Component
 *
 * Modal dialog for viewing the details of a historical assessment snapshot.
 */

import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Typography,
} from "@mui/material";
import { getCapabilityByCode } from "../../services/blueprint";
import { formatDate } from "../../utils/dateFormatters";
import { LEVEL_BADGE_MIN_WIDTH } from "../../constants/ui";
import type { AssessmentHistory } from "../../types";

interface HistoryViewDialogProps {
  entry: AssessmentHistory | null;
  open: boolean;
  onClose: () => void;
}

export function HistoryViewDialog({ entry, open, onClose }: HistoryViewDialogProps) {
  if (!entry) return null;

  const capability = getCapabilityByCode(entry.capabilityCode);
  const questions = capability?.bcm.maturity_model.capability_questions || [];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box>
          <Typography variant="overline" color="text.secondary">
            Historical Assessment
          </Typography>
          <Typography variant="h6">{capability?.processName || entry.capabilityCode}</Typography>
        </Box>
      </DialogTitle>
      <DialogContent dividers>
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: "flex", gap: 3, mb: 2 }}>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Date
              </Typography>
              <Typography variant="body2" fontWeight={500}>
                {formatDate(entry.snapshotDate)}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Score
              </Typography>
              <Typography variant="body2" fontWeight={500}>
                {entry.score !== null ? `${entry.score.toFixed(1)} / 5.0` : "Not scored"}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Blueprint Version
              </Typography>
              <Typography variant="body2" fontWeight={500}>
                {entry.blueprintVersion}
              </Typography>
            </Box>
          </Box>
          {entry.tags.length > 0 && (
            <Box>
              <Typography variant="caption" color="text.secondary">
                Tags
              </Typography>
              <Box sx={{ display: "flex", gap: 0.5, mt: 0.5 }}>
                {entry.tags.map((tag) => (
                  <Chip key={tag} label={tag} size="small" />
                ))}
              </Box>
            </Box>
          )}
        </Box>

        <Typography variant="subtitle2" gutterBottom>
          Ratings ({entry.ratings.length} questions answered)
        </Typography>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          {[...entry.ratings]
            .sort((a, b) => a.questionIndex - b.questionIndex)
            .map((rating) => {
              const question = questions[rating.questionIndex];
              return (
                <Paper key={rating.questionIndex} variant="outlined" sx={{ p: 1.5 }}>
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      mb: 0.5,
                    }}
                  >
                    <Typography variant="body2" sx={{ flex: 1, pr: 2 }}>
                      <strong>Q{rating.questionIndex + 1}:</strong>{" "}
                      {question?.question || "Question not found"}
                    </Typography>
                    <Chip
                      label={`Level ${rating.level}`}
                      size="small"
                      color="primary"
                      sx={{ minWidth: LEVEL_BADGE_MIN_WIDTH }}
                    />
                  </Box>
                  {question && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block", mb: 0.5 }}
                    >
                      {question.levels[`level_${rating.level}` as keyof typeof question.levels]}
                    </Typography>
                  )}
                  {rating.notes && (
                    <Box
                      sx={{
                        mt: 1,
                        p: 1,
                        backgroundColor: "grey.50",
                        borderRadius: 1,
                      }}
                    >
                      <Typography variant="caption" color="text.secondary">
                        Notes:
                      </Typography>
                      <Typography variant="body2">{rating.notes}</Typography>
                    </Box>
                  )}
                </Paper>
              );
            })}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
