/**
 * PDF Export Service for MITA 3.0
 *
 * Generates comprehensive professional PDF reports using jsPDF.
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { ExportData, ExportOptions } from "./types";
import { getCapabilityByCode } from "../blueprint";
import { PAGE, MARGIN, CONTENT_WIDTH, COLORS, getMaturityLevelName } from "./pdfStyles";
import { PDF_DESCRIPTION_MAX_LENGTH } from "../../constants/export";

const PAGE_WIDTH = PAGE.WIDTH;
const PAGE_HEIGHT = PAGE.HEIGHT;
const MARGIN_LEFT = MARGIN.LEFT;
const MARGIN_RIGHT = MARGIN.RIGHT;
const MARGIN_TOP = MARGIN.TOP;
const MARGIN_BOTTOM = MARGIN.BOTTOM;

type JsPDFWithAutoTable = jsPDF & { lastAutoTable: { finalY: number } };

/**
 * Generates a comprehensive PDF report from export data
 */
export async function generatePdfReport(data: ExportData, options: ExportOptions): Promise<Blob> {
  const doc = new jsPDF() as JsPDFWithAutoTable;
  const stateName = options.stateName ?? "State";

  // Generate cover page
  generateCoverPage(doc, data, stateName);

  // Generate executive summary
  doc.addPage();
  generateExecutiveSummary(doc, data);

  // Generate business area details
  const finalizedAssessments = data.data.assessments.filter((a) => a.status === "finalized");

  // Group assessments by business area
  const assessmentsByArea = new Map<string, typeof finalizedAssessments>();
  for (const assessment of finalizedAssessments) {
    const existing = assessmentsByArea.get(assessment.businessArea);
    if (existing) {
      existing.push(assessment);
    } else {
      assessmentsByArea.set(assessment.businessArea, [assessment]);
    }
  }

  // Generate detailed section for each business area
  for (const [businessArea, areaAssessments] of assessmentsByArea) {
    doc.addPage();
    generateBusinessAreaSection(doc, businessArea, areaAssessments, data);
  }

  // Add page numbers and footer
  addPageNumbersAndFooter(doc, stateName);

  return doc.output("blob");
}

/**
 * Generates the cover page
 */
function generateCoverPage(doc: JsPDFWithAutoTable, data: ExportData, stateName: string): void {
  const centerX = PAGE_WIDTH / 2;

  // Header bar
  doc.setFillColor(...COLORS.primary);
  doc.rect(0, 0, PAGE_WIDTH, 60, "F");

  // Title
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(32);
  doc.setFont("helvetica", "bold");
  doc.text("MITA 3.0", centerX, 28, { align: "center" });
  doc.setFontSize(14);
  doc.setFont("helvetica", "normal");
  doc.text("Maturity Assessment Report", centerX, 42, { align: "center" });

  // State name
  doc.setTextColor(...COLORS.secondary);
  doc.setFontSize(28);
  doc.setFont("helvetica", "bold");
  doc.text(stateName, centerX, 90, { align: "center" });

  // Subtitle
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.darkGray);
  doc.text("State Medicaid Agency Self-Assessment", centerX, 100, {
    align: "center",
  });

  // Divider line
  doc.setDrawColor(...COLORS.mediumGray);
  doc.setLineWidth(0.5);
  doc.line(centerX - 50, 110, centerX + 50, 110);

  // Overall score section
  const finalizedAssessments = data.data.assessments.filter((a) => a.status === "finalized");
  const scores = finalizedAssessments
    .map((a) => a.score)
    .filter((s): s is number => s !== undefined);

  const yScoreSection = 130;

  if (scores.length > 0) {
    const overallScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const maturityLevel = getMaturityLevelName(overallScore);

    // Score circle
    doc.setFillColor(...COLORS.primary);
    doc.circle(centerX, yScoreSection + 20, 25, "F");

    doc.setTextColor(...COLORS.white);
    doc.setFontSize(28);
    doc.setFont("helvetica", "bold");
    doc.text(overallScore.toFixed(1), centerX, yScoreSection + 25, {
      align: "center",
    });

    // Label below score
    doc.setTextColor(...COLORS.secondary);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Overall Maturity Score", centerX, yScoreSection + 55, {
      align: "center",
    });

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLORS.darkGray);
    doc.text(`Maturity Level: ${maturityLevel}`, centerX, yScoreSection + 63, {
      align: "center",
    });
  } else {
    doc.setTextColor(...COLORS.darkGray);
    doc.setFontSize(12);
    doc.setFont("helvetica", "italic");
    doc.text("No finalized assessments", centerX, yScoreSection + 25, {
      align: "center",
    });
  }

  // Stats cards row
  const yStats = 210;
  const cardWidth = 50;
  const cardHeight = 35;
  const cardSpacing = 8;
  const totalWidth = cardWidth * 3 + cardSpacing * 2;
  const startX = centerX - totalWidth / 2;

  const statsData = [
    {
      value: finalizedAssessments.length.toString(),
      label: "Finalized",
      color: COLORS.accent,
    },
    {
      value: data.data.assessments.filter((a) => a.status === "in_progress").length.toString(),
      label: "In Progress",
      color: COLORS.primary,
    },
    {
      value: data.metadata.totalAttachments.toString(),
      label: data.metadata.totalAttachments === 1 ? "Attachment" : "Attachments",
      color: COLORS.darkGray,
    },
  ];

  statsData.forEach((stat, index) => {
    const cardX = startX + index * (cardWidth + cardSpacing);

    doc.setFillColor(...COLORS.lightGray);
    doc.roundedRect(cardX, yStats, cardWidth, cardHeight, 3, 3, "F");

    doc.setTextColor(...stat.color);
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text(stat.value, cardX + cardWidth / 2, yStats + 15, {
      align: "center",
    });

    doc.setTextColor(...COLORS.darkGray);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(stat.label, cardX + cardWidth / 2, yStats + 26, {
      align: "center",
    });
  });

  // Export date at bottom
  const exportDate = new Date(data.exportDate).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  doc.setDrawColor(...COLORS.mediumGray);
  doc.line(MARGIN_LEFT, PAGE_HEIGHT - 35, PAGE_WIDTH - MARGIN_RIGHT, PAGE_HEIGHT - 35);

  doc.setFontSize(9);
  doc.setTextColor(...COLORS.darkGray);
  doc.text(`Report Generated: ${exportDate}`, centerX, PAGE_HEIGHT - 25, {
    align: "center",
  });

  doc.setFontSize(8);
  doc.text("MITA 3.0 State Self-Assessment Tool", centerX, PAGE_HEIGHT - 18, {
    align: "center",
  });
}

/**
 * Generates the executive summary section
 */
function generateExecutiveSummary(doc: JsPDFWithAutoTable, data: ExportData): number {
  let yPos = MARGIN_TOP;

  yPos = addSectionHeader(doc, "Executive Summary", yPos);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.secondary);

  const introText =
    "This report presents the results of the MITA 3.0 maturity self-assessment. " +
    "Each capability has been evaluated using the Business Capability Model (BCM) " +
    "with maturity levels ranging from 1 (Initial) to 5 (Optimized).";

  const splitIntro = doc.splitTextToSize(introText, CONTENT_WIDTH);
  doc.text(splitIntro, MARGIN_LEFT, yPos);
  yPos += splitIntro.length * 5 + 10;

  // Business area scores table
  const finalizedAssessments = data.data.assessments.filter((a) => a.status === "finalized");

  const areaScores = new Map<string, { scores: number[]; capabilities: string[] }>();
  for (const assessment of finalizedAssessments) {
    if (assessment.score !== undefined) {
      const existing = areaScores.get(assessment.businessArea);
      if (existing) {
        existing.scores.push(assessment.score);
        existing.capabilities.push(assessment.processName);
      } else {
        areaScores.set(assessment.businessArea, {
          scores: [assessment.score],
          capabilities: [assessment.processName],
        });
      }
    }
  }

  if (areaScores.size > 0) {
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Business Area Maturity Scores", MARGIN_LEFT, yPos);
    yPos += 8;

    const areaTableData = Array.from(areaScores.entries()).map(([area, areaData]) => {
      const avg = areaData.scores.reduce((a, b) => a + b, 0) / areaData.scores.length;
      return [area, avg.toFixed(1), areaData.scores.length.toString(), getMaturityLevelName(avg)];
    });

    autoTable(doc, {
      startY: yPos,
      head: [["Business Area", "Score", "Capabilities", "Maturity Level"]],
      body: areaTableData,
      theme: "striped",
      headStyles: { fillColor: COLORS.primary, fontSize: 10 },
      styles: { fontSize: 9, cellPadding: 3 },
      columnStyles: {
        0: { cellWidth: 68 },
        // Wide enough for the "Capabilities" header; at 25mm it broke mid-word.
        1: { cellWidth: 20, halign: "center" },
        2: { cellWidth: 34, halign: "center" },
        3: { cellWidth: 42 },
      },
      margin: { left: MARGIN_LEFT, right: MARGIN_RIGHT },
    });

    yPos = doc.lastAutoTable.finalY + 15;
  }

  return yPos;
}

/**
 * Generates a detailed section for a business area
 */
function generateBusinessAreaSection(
  doc: JsPDFWithAutoTable,
  businessArea: string,
  assessments: ExportData["data"]["assessments"],
  data: ExportData
): number {
  let yPos = MARGIN_TOP;

  yPos = addSectionHeader(doc, businessArea, yPos);

  // Business area score summary
  const scores = assessments.map((a) => a.score).filter((s): s is number => s !== undefined);

  if (scores.length > 0) {
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    doc.setFillColor(...COLORS.lightGray);
    doc.roundedRect(MARGIN_LEFT, yPos, CONTENT_WIDTH, 20, 3, 3, "F");

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLORS.primary);
    doc.text(`Business Area Average: ${avgScore.toFixed(1)} / 5.0`, MARGIN_LEFT + 5, yPos + 8);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLORS.darkGray);
    doc.text(
      `${assessments.length} capability${assessments.length > 1 ? " assessments" : " assessment"}`,
      MARGIN_LEFT + 5,
      yPos + 15
    );

    yPos += 28;
  }

  // Each capability
  for (const assessment of assessments) {
    yPos = checkPageBreak(doc, yPos, 80);
    yPos = generateCapabilitySection(doc, assessment, data, yPos);
  }

  return yPos;
}

/**
 * Generates a section for a single capability
 */
function generateCapabilitySection(
  doc: JsPDFWithAutoTable,
  assessment: ExportData["data"]["assessments"][0],
  data: ExportData,
  startY: number
): number {
  let yPos = startY;

  const capability = getCapabilityByCode(assessment.capabilityCode);

  // Capability header
  doc.setFillColor(...COLORS.primary);
  doc.rect(MARGIN_LEFT, yPos, CONTENT_WIDTH, 8, "F");

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.white);
  doc.text(assessment.processName, MARGIN_LEFT + 3, yPos + 5.5);

  // Score badge
  if (assessment.score !== undefined) {
    const scoreText = assessment.score.toFixed(1);
    doc.setFillColor(...COLORS.accent);
    doc.roundedRect(PAGE_WIDTH - MARGIN_RIGHT - 20, yPos + 1, 17, 6, 2, 2, "F");
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.white);
    doc.text(scoreText, PAGE_WIDTH - MARGIN_RIGHT - 11.5, yPos + 5, {
      align: "center",
    });
  }

  yPos += 12;

  // Capability description from BPT
  if (capability) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLORS.secondary);
    const desc = capability.bpt.process_details.description.substring(
      0,
      PDF_DESCRIPTION_MAX_LENGTH
    );
    const descLines = doc.splitTextToSize(desc + (desc.length >= 300 ? "..." : ""), CONTENT_WIDTH);
    doc.text(descLines, MARGIN_LEFT, yPos);
    yPos += descLines.length * 4 + 8;
  }

  // Get ratings for this assessment, in question order. Database order is
  // arbitrary, which previously printed questions scrambled (Q9, Q10, Q8, Q6...)
  // in a document intended for CMS submission.
  const ratings = data.data.ratings
    .filter((r) => r.capabilityAssessmentId === assessment.id)
    .sort((a, b) => a.questionIndex - b.questionIndex);

  // Get attachments for this assessment, grouped by rating
  const attachmentsByRating = new Map<string, typeof data.data.attachments>();
  for (const attachment of data.data.attachments) {
    if (attachment.capabilityAssessmentId === assessment.id) {
      const existing = attachmentsByRating.get(attachment.ratingId) ?? [];
      existing.push(attachment);
      attachmentsByRating.set(attachment.ratingId, existing);
    }
  }

  if (ratings.length > 0 && capability) {
    const questions = capability.bcm.maturity_model.capability_questions;

    // Render each question as a block with its notes and attachments
    for (const rating of ratings) {
      if (rating.level === null) continue;

      const question = questions[rating.questionIndex];
      if (!question) continue;

      const levelKey = `level_${rating.level}` as keyof typeof question.levels;
      const levelDesc = question.levels[levelKey] || "";
      const ratingAttachments = attachmentsByRating.get(rating.id) ?? [];
      const hasNotes = rating.notes && rating.notes.trim();
      const hasAttachments = ratingAttachments.length > 0;

      // Calculate space needed for this question block
      const estimatedHeight =
        30 + (hasNotes ? 15 : 0) + (hasAttachments ? 10 + ratingAttachments.length * 4 : 0);
      yPos = checkPageBreak(doc, yPos, estimatedHeight);

      // Question header bar
      doc.setFillColor(...COLORS.lightGray);
      doc.rect(MARGIN_LEFT, yPos, CONTENT_WIDTH, 6, "F");

      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...COLORS.secondary);
      doc.text(`Q${rating.questionIndex + 1}: ${question.category}`, MARGIN_LEFT + 2, yPos + 4);

      // Level badge
      doc.setFillColor(...COLORS.primary);
      doc.roundedRect(PAGE_WIDTH - MARGIN_RIGHT - 18, yPos + 0.5, 15, 5, 1.5, 1.5, "F");
      doc.setFontSize(7);
      doc.setTextColor(...COLORS.white);
      doc.text(`Level ${rating.level}`, PAGE_WIDTH - MARGIN_RIGHT - 10.5, yPos + 4, {
        align: "center",
      });

      yPos += 9;

      // Level description
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...COLORS.darkGray);
      const descLines = doc.splitTextToSize(levelDesc, CONTENT_WIDTH - 4);
      doc.text(descLines, MARGIN_LEFT + 2, yPos);
      yPos += descLines.length * 3.5 + 2;

      // Notes (if any)
      if (hasNotes) {
        doc.setFillColor(255, 251, 235); // Light yellow background
        const noteLines = doc.splitTextToSize(rating.notes, CONTENT_WIDTH - 10);
        const noteBoxHeight = noteLines.length * 3.5 + 4;
        doc.roundedRect(MARGIN_LEFT + 2, yPos, CONTENT_WIDTH - 4, noteBoxHeight, 1, 1, "F");

        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...COLORS.secondary);
        doc.text("Notes:", MARGIN_LEFT + 4, yPos + 3);

        doc.setFont("helvetica", "normal");
        doc.setTextColor(...COLORS.darkGray);
        doc.text(noteLines, MARGIN_LEFT + 4, yPos + 6.5);
        yPos += noteBoxHeight + 2;
      }

      // Attachments (if any)
      if (hasAttachments) {
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...COLORS.secondary);
        doc.text("Attachments:", MARGIN_LEFT + 2, yPos + 2);
        yPos += 4;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(...COLORS.darkGray);
        for (const attachment of ratingAttachments) {
          const attachText = attachment.description
            ? `• ${attachment.fileName} - ${attachment.description}`
            : `• ${attachment.fileName}`;
          doc.text(attachText, MARGIN_LEFT + 4, yPos + 2);
          yPos += 3.5;
        }
        yPos += 2;
      }

      yPos += 4; // Space between questions
    }
  }

  yPos += 6;
  return yPos;
}

/**
 * Adds a section header with styling
 */
function addSectionHeader(doc: JsPDFWithAutoTable, title: string, yPos: number): number {
  doc.setFillColor(...COLORS.primary);
  doc.rect(MARGIN_LEFT, yPos, 4, 10, "F");

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.secondary);
  doc.text(title, MARGIN_LEFT + 8, yPos + 7);

  return yPos + 15;
}

/**
 * Checks if we need a page break
 */
function checkPageBreak(doc: JsPDFWithAutoTable, yPos: number, requiredSpace: number): number {
  if (yPos + requiredSpace > PAGE_HEIGHT - MARGIN_BOTTOM) {
    doc.addPage();
    return MARGIN_TOP;
  }
  return yPos;
}

/**
 * Adds page numbers and footer to all pages
 */
function addPageNumbersAndFooter(doc: JsPDFWithAutoTable, stateName: string): void {
  const pageCount = doc.getNumberOfPages();

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    if (i === 1) continue;

    doc.setDrawColor(...COLORS.mediumGray);
    doc.line(MARGIN_LEFT, PAGE_HEIGHT - 18, PAGE_WIDTH - MARGIN_RIGHT, PAGE_HEIGHT - 18);

    doc.setFontSize(9);
    doc.setTextColor(...COLORS.darkGray);
    doc.text(`Page ${i - 1} of ${pageCount - 1}`, PAGE_WIDTH / 2, PAGE_HEIGHT - 12, {
      align: "center",
    });

    doc.setFontSize(8);
    doc.text(`${stateName} - MITA 3.0 Maturity Assessment`, MARGIN_LEFT, PAGE_HEIGHT - 12);
  }
}
