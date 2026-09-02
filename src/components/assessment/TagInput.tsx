/**
 * Tag Input Component
 *
 * Autocomplete input for managing assessment tags with free-form entry.
 */

import { useState } from "react";
import { Autocomplete, Box, Chip, TextField } from "@mui/material";
import { useTags } from "../../hooks/useTags";
import { MAX_TAG_LENGTH, partitionTags } from "../../utils/tags";

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
}

export function TagInput({ tags, onChange }: TagInputProps) {
  const { tags: allTags } = useTags();
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const suggestions = allTags.map((t) => t.name);

  /**
   * Single place where the tag list changes.
   *
   * Every commit path (Enter, blur, picking a suggestion, deleting a chip) routes
   * through here. Validation used to live in a separate handler that MUI's freeSolo
   * `onChange` bypassed, so `isValidTag` never rejected anything.
   *
   * Only the *newly added* entries are validated. Re-validating the whole list on
   * every change silently dropped any previously-stored invalid tag the moment the
   * user deleted an unrelated chip, and blamed a tag they hadn't touched.
   */
  const commitTags = (nextValue: readonly string[]) => {
    const additions = nextValue.filter((candidate) => !tags.includes(candidate));
    const retained = nextValue.filter((candidate) => tags.includes(candidate));

    const { accepted, rejected } = partitionTags(additions);

    setError(
      rejected.length > 0
        ? `"${rejected[0]}" isn't a valid tag. Use up to ${MAX_TAG_LENGTH} letters, numbers, hyphens or underscores.`
        : null
    );

    const next = [...retained];
    for (const tag of accepted) {
      if (!next.includes(tag)) next.push(tag);
    }

    const changed = next.length !== tags.length || next.some((tag, index) => tag !== tags[index]);
    if (changed) {
      onChange(next);
    }

    // Report whether everything offered was accepted, so callers can decide
    // whether to clear the input.
    return rejected.length === 0;
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "Enter" || !inputValue.trim()) return;

    // If the user has arrow-keyed to a suggestion, let MUI commit that instead.
    const hasHighlightedOption = Boolean(
      (event.target as HTMLElement)?.getAttribute("aria-activedescendant")
    );
    if (hasHighlightedOption) return;

    // preventDefault alone is enough to stop freeSolo's own commit. stopPropagation
    // would also block MUI's root keydown handler, breaking suggestion selection.
    event.preventDefault();
    const rejectedValue = inputValue;
    if (commitTags([...tags, inputValue])) {
      setInputValue("");
    } else {
      // Put the text back so the user can correct it instead of retyping. MUI's
      // own freeSolo handling clears the input, so this has to be restored after.
      setTimeout(() => setInputValue(rejectedValue), 0);
    }
  };

  const handleBlur = () => {
    if (inputValue.trim() && commitTags([...tags, inputValue])) {
      setInputValue("");
    }
  };

  const handleInputChange = (value: string) => {
    setInputValue(value);
    // Clear the error as soon as the user starts correcting it.
    if (error) setError(null);
  };

  return (
    <Box>
      <Autocomplete
        multiple
        freeSolo
        size="small"
        options={suggestions}
        value={tags}
        inputValue={inputValue}
        onInputChange={(_, newValue) => handleInputChange(newValue)}
        onChange={(_, newValue) => commitTags(newValue)}
        onBlur={handleBlur}
        renderInput={(params) => (
          <TextField
            {...params}
            placeholder={tags.length === 0 ? "Add tags (e.g., #provider-module)" : ""}
            onKeyDown={handleKeyDown}
            error={Boolean(error)}
            helperText={error ?? undefined}
            inputProps={{ ...params.inputProps, "aria-label": "Assessment tags" }}
          />
        )}
        renderTags={(value, getTagProps) =>
          value.map((option, index) => (
            <Chip {...getTagProps({ index })} key={option} label={option} size="small" />
          ))
        }
      />
    </Box>
  );
}
