/**
 * Question Card Component
 *
 * Displays a single assessment question with rating options, notes, and attachments.
 */

import { useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  FormControl,
  FormControlLabel,
  Radio,
  RadioGroup,
  TextField,
  Typography,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import HistoryIcon from "@mui/icons-material/History";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import { useRatings } from "../../hooks/useRatings";
import { AttachmentUpload } from "./AttachmentUpload";
import { compactChipSx } from "../../theme/sharedStyles";
import {
  QUESTION_NUMBER_MIN_WIDTH,
  NOTES_TEXTAREA_ROWS,
  NOTES_AUTOSAVE_DELAY_MS,
} from "../../constants/ui";
import type { CapabilityQuestion, Attachment } from "../../types";

interface AttachmentHandlers {
  getAttachmentsForRating: (ratingId: string) => Attachment[];
  uploadAttachment: (ratingId: string, file: File, description?: string) => Promise<string>;
  deleteAttachment: (attachmentId: string) => Promise<void>;
  downloadAttachment: (attachment: Attachment) => void;
}

interface QuestionCardProps {
  question: CapabilityQuestion;
  questionIndex: number;
  assessmentId: string;
  onDirty: () => void;
  readOnly?: boolean;
  attachmentHandlers: AttachmentHandlers;
}

export function QuestionCard({
  question,
  questionIndex,
  assessmentId,
  onDirty,
  readOnly = false,
  attachmentHandlers,
}: QuestionCardProps) {
  const { getRating, setRatingLevel, setRatingNotes, ensureRating } = useRatings(assessmentId);
  const rating = getRating(questionIndex);

  // Use rating notes as source of truth, local state only for editing
  const [localNotes, setLocalNotes] = useState("");
  const [isEditingNotes, setIsEditingNotes] = useState(false);

  // Derive notes value: use local when editing, otherwise use rating
  const notes = isEditingNotes ? localNotes : rating?.notes || "";

  /**
   * Notes auto-save while typing, like every other input in the app.
   *
   * Saving only on blur meant a reload or a browser Back discarded whatever was
   * typed, with no prompt — and nothing else in the app behaves that way, so there
   * was no reason for a user to expect it. The ref mirrors the latest text so the
   * debounce and the unmount flush can persist it without re-subscribing.
   */
  const pendingNotesRef = useRef<{ value: string; saved: string } | null>(null);
  const debounceRef = useRef<number | undefined>(undefined);
  const saveNotesRef = useRef(setRatingNotes);

  // `useRatings` returns a fresh closure each render, so the ref has to be kept
  // current. Done in an effect rather than during render.
  useEffect(() => {
    saveNotesRef.current = setRatingNotes;
  }, [setRatingNotes]);

  const flushNotesRef = useRef(async () => {
    const pending = pendingNotesRef.current;
    if (!pending || pending.value === pending.saved) return;
    pendingNotesRef.current = { value: pending.value, saved: pending.value };
    await saveNotesRef.current(questionIndex, pending.value);
  });

  useEffect(() => {
    if (readOnly) return;
    const flush = flushNotesRef.current;
    // pagehide covers reload and tab close; visibilitychange covers backgrounding
    // on mobile, where pagehide is unreliable.
    const onHide = () => void flush();
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
      // Unmount covers in-app navigation, including the browser Back button.
      void flush();
    };
  }, [readOnly]);

  // Derive expanded states from data
  const notesExpanded = readOnly ? !!rating?.notes : !!rating?.notes || isEditingNotes;

  // Get attachments for this rating
  const attachments = rating?.id ? attachmentHandlers.getAttachmentsForRating(rating.id) : [];

  /**
   * Attachment panel visibility: null means "follow the data" (open when files
   * exist), true/false is an explicit user choice.
   *
   * A plain boolean OR'd with `attachments.length > 0` could never be collapsed
   * once a file existed, so the "Hide Attachments" button did nothing.
   */
  const [attachmentsOverride, setAttachmentsOverride] = useState<boolean | null>(null);
  const attachmentsExpanded = attachmentsOverride ?? attachments.length > 0;

  const handleLevelChange = async (level: 1 | 2 | 3 | 4 | 5) => {
    if (readOnly) return;
    onDirty();
    // Clicking a level blurs the notes textarea, so handleNotesBlur may fire
    // around the same time. Flush any pending notes edit first, then write only
    // the level, so neither write can clobber the other's field.
    await flushNotes();
    await setRatingLevel(questionIndex, level);
  };

  const handleNotesChange = (value: string) => {
    if (!isEditingNotes) {
      setLocalNotes(rating?.notes || "");
      setIsEditingNotes(true);
    }
    setLocalNotes(value);
    onDirty();

    pendingNotesRef.current = {
      value,
      saved: pendingNotesRef.current?.saved ?? rating?.notes ?? "",
    };

    if (debounceRef.current !== undefined) {
      window.clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(() => {
      void flushNotesRef.current();
    }, NOTES_AUTOSAVE_DELAY_MS);
  };

  /** Persist a pending notes edit immediately. Safe to call redundantly. */
  const flushNotes = async () => {
    if (readOnly) return;
    if (debounceRef.current !== undefined) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = undefined;
    }
    await flushNotesRef.current();
  };

  const handleNotesBlur = async () => {
    if (readOnly) return;
    await flushNotes();
    setIsEditingNotes(false);
  };

  const handleUpload = async (file: File, description?: string) => {
    let ratingId = rating?.id;
    if (!ratingId) {
      // Attaching to an untouched question - create the rating row first
      ratingId = await ensureRating(questionIndex);
    }
    if (ratingId) {
      await attachmentHandlers.uploadAttachment(ratingId, file, description);
    }
    onDirty();
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    await attachmentHandlers.deleteAttachment(attachmentId);
    onDirty();
  };

  // Check if this level was the previous selection (carry-forward hint)
  const isPreviousLevel = (level: number) => {
    return rating?.carriedForward && rating?.previousLevel === level && rating?.level === null;
  };

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
        <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1, mb: 1.5 }}>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ minWidth: QUESTION_NUMBER_MIN_WIDTH }}
          >
            Q{questionIndex + 1}
          </Typography>
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle1" sx={{ lineHeight: 1.3 }}>
              {question.question}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {question.category}
            </Typography>
          </Box>
          {attachments.length > 0 && (
            <Chip
              icon={<AttachFileIcon />}
              label={attachments.length}
              size="small"
              variant="outlined"
              color="default"
            />
          )}
          {rating?.carriedForward && rating?.previousLevel && !rating?.level && (
            <Chip
              icon={<HistoryIcon />}
              label={`Previously: Level ${rating.previousLevel}`}
              size="small"
              variant="outlined"
              color="info"
            />
          )}
          {rating?.level && <CheckCircleIcon color="success" fontSize="small" />}
        </Box>

        <FormControl component="fieldset" sx={{ width: "100%" }}>
          <RadioGroup value={rating?.level?.toString() || ""}>
            {[1, 2, 3, 4, 5].map((level) => (
              <Box
                key={level}
                sx={{
                  py: 1,
                  px: 1.5,
                  mb: 0.5,
                  borderRadius: 1,
                  border: 2,
                  borderColor:
                    rating?.level === level
                      ? "primary.main"
                      : isPreviousLevel(level)
                        ? "info.main"
                        : "divider",
                  borderStyle: isPreviousLevel(level) ? "dashed" : "solid",
                  backgroundColor:
                    rating?.level === level
                      ? "primary.50"
                      : isPreviousLevel(level)
                        ? "info.50"
                        : "transparent",
                  cursor: readOnly ? "default" : "pointer",
                  opacity: readOnly && rating?.level !== level ? 0.6 : 1,
                  position: "relative",
                  ...(!readOnly && {
                    "&:hover": {
                      borderColor: "primary.light",
                      backgroundColor: rating?.level === level ? "primary.50" : "action.hover",
                    },
                  }),
                }}
                onClick={() => handleLevelChange(level as 1 | 2 | 3 | 4 | 5)}
              >
                <FormControlLabel
                  value={level.toString()}
                  control={<Radio size="small" sx={{ py: 0.5 }} disabled={readOnly} />}
                  label={
                    <Typography variant="body2" component="span">
                      <strong>L{level}:</strong>{" "}
                      <span style={{ color: "inherit" }}>
                        {question.levels[`level_${level}` as keyof typeof question.levels]}
                      </span>
                    </Typography>
                  }
                  sx={{ m: 0, alignItems: "flex-start" }}
                />
                {isPreviousLevel(level) && (
                  <Chip
                    label="Previous"
                    size="small"
                    color="info"
                    sx={{
                      position: "absolute",
                      top: 4,
                      right: 8,
                      ...compactChipSx,
                    }}
                  />
                )}
              </Box>
            ))}
          </RadioGroup>
        </FormControl>

        {/* Notes section */}
        <Box sx={{ mt: 1.5 }}>
          {!readOnly && (
            <Button
              size="small"
              onClick={() => {
                if (!isEditingNotes) {
                  setLocalNotes(rating?.notes || "");
                  setIsEditingNotes(true);
                } else {
                  handleNotesBlur();
                }
              }}
              sx={{ mb: 1 }}
            >
              {isEditingNotes ? "Done" : rating?.notes ? "Edit Notes" : "Add Notes"}
            </Button>
          )}
          {notesExpanded &&
            (readOnly ? (
              rating?.notes ? (
                <Box sx={{ p: 1.5, backgroundColor: "grey.50", borderRadius: 1 }}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", mb: 0.5 }}
                  >
                    Notes
                  </Typography>
                  <Typography variant="body2">{rating.notes}</Typography>
                </Box>
              ) : null
            ) : (
              <TextField
                fullWidth
                multiline
                rows={NOTES_TEXTAREA_ROWS}
                placeholder="Add notes or rationale for your rating..."
                value={notes}
                onChange={(e) => handleNotesChange(e.target.value)}
                onBlur={handleNotesBlur}
                size="small"
              />
            ))}
        </Box>

        {/* Attachments section */}
        <Box sx={{ mt: 1.5 }}>
          {!readOnly && (
            <Button
              size="small"
              startIcon={<AttachFileIcon />}
              onClick={() => setAttachmentsOverride(!attachmentsExpanded)}
              aria-expanded={attachmentsExpanded}
              sx={{ mb: 1 }}
            >
              {attachmentsExpanded
                ? "Hide Attachments"
                : attachments.length > 0
                  ? `Show Attachments (${attachments.length})`
                  : "Add Attachments"}
            </Button>
          )}
          {(attachmentsExpanded || (readOnly && attachments.length > 0)) && (
            <AttachmentUpload
              attachments={attachments}
              onUpload={handleUpload}
              onDelete={handleDeleteAttachment}
              onDownload={attachmentHandlers.downloadAttachment}
              disabled={readOnly}
              uploadId={`q${questionIndex}`}
            />
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
