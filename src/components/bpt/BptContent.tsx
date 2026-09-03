/**
 * BptContent - Business Process Template Content Component
 *
 * Renders all BPT data fields in a structured, readable format.
 * This is the shared rendering logic used by both BptSidebar and the Processes page.
 */

import { useId, useState } from "react";
import { Box, Chip, Collapse, Paper, Tooltip, Typography } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import type { BPT } from "../../types";
import { getCapabilityByProcessName } from "../../services/blueprint";
import { parseLine, resolveIndentDepths, type ParsedLine } from "./bptTextParsing";

// ============================================
// Rendering Components
// ============================================

/**
 * Collapsible section wrapper with card-style content container
 */
export function Section({
  title,
  children,
  defaultExpanded = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const contentId = useId();

  return (
    <Box sx={{ mb: 2 }}>
      {/*
        A real <button>, not a clickable Box.
        
        Every BPT section toggle — in the process viewer and in the assessment sidebar —
        was a plain div with onClick: tabIndex -1, no role, no aria-expanded. So none of
        them could be reached or operated by keyboard, and a screen reader was given
        nothing to announce. Sections default to expanded, so the content was readable,
        but collapsing was mouse-only. The Dashboard's disclosure rows already do this
        correctly, which made it an inconsistency as well as a gap.

        `aria-expanded` plus `aria-controls` means the state is announced and the
        controlled region is identified; the global focus-visible ring in the theme
        handles the focus indicator.
      */}
      <Box
        component="button"
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-controls={contentId}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          cursor: "pointer",
          py: 0.5,
          "&:hover": { opacity: 0.8 },
          // Reset the native button chrome; this is a heading row, not a control surface.
          width: "100%",
          background: "none",
          border: "none",
          textAlign: "left",
          font: "inherit",
          color: "inherit",
          px: 0,
        }}
      >
        <Typography
          variant="subtitle2"
          component="span"
          sx={{
            color: "primary.main",
            fontWeight: 600,
            flex: 1,
          }}
        >
          {title}
        </Typography>
        {expanded ? (
          <ExpandLessIcon fontSize="small" aria-hidden="true" />
        ) : (
          <ExpandMoreIcon fontSize="small" aria-hidden="true" />
        )}
      </Box>
      <Collapse in={expanded} id={contentId}>
        <Box
          sx={{
            mt: 1,
            p: 1.5,
            border: 1,
            borderColor: "divider",
            borderRadius: 1,
            backgroundColor: "background.paper",
          }}
        >
          {children}
        </Box>
      </Collapse>
    </Box>
  );
}

/**
 * Render a NOTE callout
 */
function NoteCallout({ content }: { content: string }) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 1.5,
        my: 1.5,
        backgroundColor: "info.50",
        borderLeft: 3,
        borderColor: "info.main",
      }}
    >
      <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
        <InfoOutlinedIcon sx={{ fontSize: 18, color: "info.main", mt: 0.25, flexShrink: 0 }} />
        <Typography variant="body2" sx={{ lineHeight: 1.6 }}>
          {content}
        </Typography>
      </Box>
    </Paper>
  );
}

/**
 * Render formatted text with support for bullets, notes, and nested lists
 */
export function FormattedText({ text }: { text: string }) {
  // Parsed up front rather than line by line, because depth is relative to the
  // other indents in this block and cannot be known from one line alone.
  const parsedLines = text
    .split("\n")
    .map((line, index) => ({ parsed: parseLine(line), index }))
    .filter((entry): entry is { parsed: ParsedLine; index: number } => entry.parsed !== null);

  const depths = resolveIndentDepths(parsedLines.map((entry) => entry.parsed));

  return (
    <>
      {parsedLines.map(({ parsed, index }) => {
        const key = `line-${index}`;
        const pl = (depths.get(parsed.rawIndent) ?? 0) * 1.5;

        if (parsed.type === "note") {
          return <NoteCallout key={key} content={parsed.content} />;
        }

        if (parsed.type === "paragraph") {
          // Prose sits at depth 0 regardless of leading whitespace; see
          // resolveIndentDepths for why indentation on a paragraph is not structure.
          return (
            <Typography key={key} variant="body2" sx={{ lineHeight: 1.6, mb: 1 }}>
              {parsed.content}
            </Typography>
          );
        }

        // Every list type is a marker plus text in a flex row; only the marker glyph
        // and its colour differ. Ordered items use their published marker, which is
        // the part that was previously discarded.
        const marker = parsed.type === "check" ? "✓" : parsed.type === "bullet" ? "•" : "–";
        return (
          <Box key={key} sx={{ display: "flex", gap: 1, pl, mb: 0.5 }}>
            <Typography
              component="span"
              sx={{
                color: parsed.type === "check" ? "success.main" : "text.secondary",
                fontWeight: parsed.type === "check" ? 600 : undefined,
                flexShrink: 0,
                // Ordered markers vary in width ("i." vs "viii."), so reserve a
                // common gutter to keep their text left-aligned.
                minWidth: parsed.type === "ordered" ? "1.75em" : undefined,
              }}
            >
              {parsed.type === "ordered" ? parsed.marker : marker}
            </Typography>
            <Typography variant="body2" sx={{ lineHeight: 1.5 }}>
              {parsed.content}
            </Typography>
          </Box>
        );
      })}
    </>
  );
}

/**
 * Render process steps with alternate path support
 */
export function ProcessSteps({ steps }: { steps: string[] }) {
  // Group steps by sections (main flow + alternate paths)
  const sections: { title: string | null; steps: string[] }[] = [];
  let currentSection: { title: string | null; steps: string[] } = {
    title: null,
    steps: [],
  };

  for (const step of steps) {
    // Check for alternate path header: --- Alternate Path: ... ---
    const altPathMatch = step.match(/^-{3}\s*(.+?)\s*-{3}$/);
    if (altPathMatch) {
      if (currentSection.steps.length > 0) {
        sections.push(currentSection);
      }
      currentSection = { title: altPathMatch[1], steps: [] };
    } else {
      currentSection.steps.push(step);
    }
  }
  if (currentSection.steps.length > 0) {
    sections.push(currentSection);
  }

  return (
    <>
      {sections.map((section, sectionIdx) => (
        <Box key={sectionIdx} sx={{ mb: 2 }}>
          {section.title && (
            <Paper
              elevation={0}
              sx={{
                mt: 2,
                mb: 1,
                py: 0.75,
                px: 1.5,
                backgroundColor: "warning.50",
                borderLeft: 3,
                borderColor: "warning.main",
              }}
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 600, color: "warning.dark" }}>
                {section.title}
              </Typography>
            </Paper>
          )}
          {section.steps.map((step, i) => {
            // Parse step number and content
            const stepMatch = step.match(/^(\d+)\.\s*(.*)$/s);
            const stepNum = stepMatch ? stepMatch[1] : null;
            const stepContent = stepMatch ? stepMatch[2] : step;

            return (
              <Box key={i} sx={{ mb: 1.5 }}>
                <Box sx={{ display: "flex", gap: 1.5, alignItems: "flex-start" }}>
                  {stepNum && (
                    <Box
                      sx={{
                        minWidth: 24,
                        height: 24,
                        borderRadius: "50%",
                        backgroundColor: "primary.main",
                        color: "white",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        flexShrink: 0,
                      }}
                    >
                      {stepNum}
                    </Box>
                  )}
                  <Box sx={{ flex: 1 }}>
                    <FormattedText text={stepContent} />
                  </Box>
                </Box>
              </Box>
            );
          })}
        </Box>
      ))}
    </>
  );
}

/**
 * Render a simple list of strings
 */
export function SimpleList({ items }: { items: string[] }) {
  if (items.length === 0) return null;

  return (
    <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
      {items.map((item, i) => {
        // A single entry can itself contain a nested list — upstream encodes depth with
        // newlines and an indent inside one string, and `shared_data` in particular
        // carries two levels below the entry. Rendering the raw string put all of it in
        // one <li>, where CSS collapsed the newlines into a run-on line: "Provider data
        // store including: - Provider demographics - Provider network - Contract
        // information - Type - Specialty ...". Multi-line entries go through the same
        // parser as `description` so their structure survives.
        const isMultiLine = item.includes("\n");
        return (
          <Box component="li" key={i} sx={{ mb: 0.5 }}>
            {isMultiLine ? (
              <FormattedText text={item} />
            ) : (
              <Typography variant="body2" sx={{ lineHeight: 1.5 }}>
                {item}
              </Typography>
            )}
          </Box>
        );
      })}
    </Box>
  );
}

/**
 * Render process links (predecessor/successor) as chips
 * Chips are clickable if the process exists and onProcessClick is provided
 */
export function ProcessLinks({
  processes,
  direction,
  onProcessClick,
}: {
  processes: string[];
  direction: "predecessor" | "successor";
  onProcessClick?: (capabilityCode: string) => void;
}) {
  if (processes.length === 0) return null;

  const icon =
    direction === "predecessor" ? (
      <ArrowBackIcon sx={{ fontSize: 14 }} />
    ) : (
      <ArrowForwardIcon sx={{ fontSize: 14 }} />
    );

  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
      {processes.map((processName, i) => {
        // Try to find the matching capability
        const capability = getCapabilityByProcessName(processName);
        const isClickable = capability && onProcessClick;
        const isUndefined = !capability;

        const chip = (
          <Chip
            key={i}
            label={processName}
            size="small"
            icon={icon}
            variant="outlined"
            clickable={!!isClickable}
            onClick={isClickable ? () => onProcessClick(capability.code) : undefined}
            sx={{
              height: "auto",
              "& .MuiChip-label": {
                whiteSpace: "normal",
                py: 0.5,
              },
              ...(isClickable && {
                cursor: "pointer",
                "&:hover": {
                  backgroundColor: "primary.light",
                  borderColor: "primary.main",
                },
              }),
              ...(isUndefined && {
                opacity: 0.6,
                fontStyle: "italic",
              }),
            }}
          />
        );

        // Wrap undefined processes in a tooltip
        if (isUndefined) {
          return (
            <Tooltip
              key={i}
              title="This process is referenced but not defined in the MITA 3.0 framework"
              arrow
              placement="top"
            >
              <span>{chip}</span>
            </Tooltip>
          );
        }

        return chip;
      })}
    </Box>
  );
}

/**
 * Render trigger events grouped by type
 */
export function TriggerEvents({ events }: { events: BPT["process_details"]["trigger_events"] }) {
  const hasEnvironment = events.environment_based.length > 0;
  const hasInteraction = events.interaction_based.length > 0;

  if (!hasEnvironment && !hasInteraction) return null;

  return (
    <Box>
      {hasEnvironment && (
        <Box sx={{ mb: 1.5 }}>
          <Typography
            variant="caption"
            sx={{
              fontWeight: 600,
              color: "text.secondary",
              display: "block",
              mb: 0.5,
            }}
          >
            Environment-Based
          </Typography>
          <SimpleList items={events.environment_based} />
        </Box>
      )}
      {hasInteraction && (
        <Box>
          <Typography
            variant="caption"
            sx={{
              fontWeight: 600,
              color: "text.secondary",
              display: "block",
              mb: 0.5,
            }}
          >
            Interaction-Based
          </Typography>
          <SimpleList items={events.interaction_based} />
        </Box>
      )}
    </Box>
  );
}

/**
 * Render diagrams section
 */
export function DiagramsSection({ diagrams }: { diagrams: BPT["process_details"]["diagrams"] }) {
  if (!diagrams || diagrams.length === 0) return null;

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {diagrams.length} diagram{diagrams.length !== 1 ? "s" : ""} available
      </Typography>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {/*
          Diagrams are objects in all 76 BPT records, so they are typed as such
          (`BptDiagram`). This previously probed `typeof diagram === "object"` and
          cast, to support a string form that does not occur in the data.
        */}
        {diagrams.map((diagram, i) => (
          <Paper key={i} elevation={0} sx={{ p: 1, backgroundColor: "grey.50" }}>
            <Typography variant="caption" sx={{ fontWeight: 500 }}>
              {diagram.filename}
            </Typography>
            {diagram.description && (
              <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                {diagram.description}
              </Typography>
            )}
          </Paper>
        ))}
      </Box>
    </Box>
  );
}

/**
 * Render constraints as a callout
 */
export function ConstraintsSection({ constraints }: { constraints: string }) {
  if (!constraints) return null;

  return (
    <Paper
      elevation={0}
      sx={{
        p: 1.5,
        backgroundColor: "warning.50",
        borderLeft: 3,
        borderColor: "warning.main",
      }}
    >
      <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
        <WarningAmberIcon sx={{ fontSize: 18, color: "warning.main", mt: 0.25, flexShrink: 0 }} />
        <Typography variant="body2" sx={{ lineHeight: 1.6 }}>
          {constraints}
        </Typography>
      </Box>
    </Paper>
  );
}

// ============================================
// Main BptContent Component
// ============================================

export interface BptContentProps {
  bpt: BPT;
  /** Whether to show the header with process name and version */
  showHeader?: boolean;
  /** Whether to show the metadata footer */
  showMetadata?: boolean;
  /** Callback when a predecessor/successor process is clicked. Receives the capability code. */
  onProcessClick?: (capabilityCode: string) => void;
}

export function BptContent({
  bpt,
  showHeader = true,
  showMetadata = true,
  onProcessClick,
}: BptContentProps) {
  const { process_details } = bpt;

  // Count items for section headers
  const stepCount = process_details.process_steps.length;
  const resultCount = process_details.results.length;
  const sharedDataCount = process_details.shared_data.length;
  const predecessorCount = process_details.predecessor_processes.length;
  const successorCount = process_details.successor_processes.length;
  const failureCount = process_details.failures.length;
  const measureCount = process_details.performance_measures.length;
  const diagramCount = process_details.diagrams?.length || 0;

  return (
    <Box>
      {/* Header */}
      {showHeader && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            {bpt.process_name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {bpt.business_area} • v{bpt.version} • {bpt.version_date}
          </Typography>
        </Box>
      )}

      {/* Description */}
      <Section title="Description" defaultExpanded={true}>
        <FormattedText text={process_details.description} />
      </Section>

      {/* Predecessor Processes */}
      {predecessorCount > 0 && (
        <Section title="Predecessor Processes" defaultExpanded={true}>
          <ProcessLinks
            processes={process_details.predecessor_processes}
            direction="predecessor"
            onProcessClick={onProcessClick}
          />
        </Section>
      )}

      {/* Trigger Events */}
      {(process_details.trigger_events.environment_based.length > 0 ||
        process_details.trigger_events.interaction_based.length > 0) && (
        <Section title="Trigger Events" defaultExpanded={true}>
          <TriggerEvents events={process_details.trigger_events} />
        </Section>
      )}

      {/* Process Steps */}
      {stepCount > 0 && (
        <Section title="Process Steps" defaultExpanded={true}>
          <ProcessSteps steps={process_details.process_steps} />
        </Section>
      )}

      {/* Results */}
      {resultCount > 0 && (
        <Section title="Results" defaultExpanded={true}>
          <SimpleList items={process_details.results} />
        </Section>
      )}

      {/* Successor Processes */}
      {successorCount > 0 && (
        <Section title="Successor Processes" defaultExpanded={true}>
          <ProcessLinks
            processes={process_details.successor_processes}
            direction="successor"
            onProcessClick={onProcessClick}
          />
        </Section>
      )}

      {/* Shared Data */}
      {sharedDataCount > 0 && (
        <Section title="Shared Data" defaultExpanded={true}>
          <SimpleList items={process_details.shared_data} />
        </Section>
      )}

      {/* Constraints */}
      {process_details.constraints && (
        <Section title="Constraints" defaultExpanded={true}>
          <ConstraintsSection constraints={process_details.constraints} />
        </Section>
      )}

      {/* Potential Failures */}
      {failureCount > 0 && (
        <Section title="Potential Failures" defaultExpanded={true}>
          <SimpleList items={process_details.failures} />
        </Section>
      )}

      {/* Performance Measures */}
      {measureCount > 0 && (
        <Section title="Performance Measures" defaultExpanded={true}>
          <SimpleList items={process_details.performance_measures} />
        </Section>
      )}

      {/* Diagrams */}
      {diagramCount > 0 && (
        <Section title="Diagrams" defaultExpanded={true}>
          <DiagramsSection diagrams={process_details.diagrams} />
        </Section>
      )}

      {/* Metadata footer */}
      {showMetadata && (
        <Box sx={{ mt: 4, pt: 2, borderTop: 1, borderColor: "divider" }}>
          <Typography variant="caption" color="text.secondary">
            Source: {bpt.metadata.source_file}
          </Typography>
          {bpt.metadata.source_page_range && (
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
              Pages: {bpt.metadata.source_page_range}
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
}
