// ============================================
// v2.0 Data Model - Single Capability Assessments
// ============================================

// Assessment status (simplified from v1.0 - no 'draft' state)
export type AssessmentStatus = "in_progress" | "finalized";

// Main assessment record - one per capability assessment
export interface CapabilityAssessment {
  id: string;
  capabilityCode: string; // "CM_Establish_Case"
  businessArea: string; // "Care Management"
  processName: string; // "Establish Case"
  status: AssessmentStatus;
  tags: string[]; // ["#provider-module", "#deloitte"]
  blueprintVersion: string; // "3.0"
  createdAt: Date;
  updatedAt: Date;
  finalizedAt?: Date;
  score?: number; // Calculated average (1-5) when finalized
  /**
   * Set while re-assessing a previously finalized capability: the id of the
   * AssessmentHistory snapshot taken when editing began.
   *
   * This is the assessment's "previous result" pointer. It tells the dashboard
   * which score and tags to keep showing during the re-assessment, and tells
   * revertEdit exactly which snapshot to restore. Resolving the snapshot by
   * newest date instead would pick up an imported entry with a later date and
   * restore (and delete) the wrong record.
   */
  editSnapshotId?: string;
}

// Rating for a single question within an assessment
export interface Rating {
  id: string;
  capabilityAssessmentId: string; // FK to CapabilityAssessment
  questionIndex: number; // 0-based index into capability_questions
  level: 1 | 2 | 3 | 4 | 5 | null;
  previousLevel?: 1 | 2 | 3 | 4 | 5; // Suggested level from previous assessment (carry-forward hint)
  notes: string;
  carriedForward: boolean; // True if copied from previous assessment
  attachmentIds: string[]; // Array of attachment IDs linked to this rating
  updatedAt: Date;
}

// Attachment stored in IndexedDB
export interface Attachment {
  id: string;
  capabilityAssessmentId: string; // FK to CapabilityAssessment
  ratingId: string; // FK to Rating
  fileName: string;
  fileType: string;
  fileSize: number;
  blob: Blob;
  description?: string;
  uploadedAt: Date;
}

// Historical snapshot of a finalized assessment
export interface AssessmentHistory {
  id: string;
  capabilityCode: string; // "CM_Establish_Case"
  snapshotDate: Date; // When this version was finalized
  tags: string[]; // Tags at time of snapshot
  /**
   * Maturity score (1-5), or null when the snapshotted assessment had no score.
   *
   * Nullable deliberately. A non-nullable number forces callers to invent a value
   * for scoreless assessments, and substituting 0 produces a score outside the
   * 1-5 scale that then flows into averages, renders as "0.0", and is rejected by
   * this app's own import validator. Absent is a real state; represent it.
   */
  score: number | null;
  ratings: HistoricalRating[]; // Full ratings snapshot
  blueprintVersion: string;
}

export interface HistoricalRating {
  questionIndex: number;
  level: 1 | 2 | 3 | 4 | 5;
  notes: string;
  attachmentIds: string[]; // Preserve attachment references in history
}

// Tag record for autocomplete
export interface Tag {
  id: string;
  name: string; // "#provider-module" (stored with #)
  usageCount: number; // For sorting autocomplete suggestions
  lastUsed: Date;
}

// ============================================
// Legacy v1.0 Types (for migration reference)
// ============================================

export type LegacyAssessmentStatus = "draft" | "in_progress" | "finalized";

export interface LegacyAssessment {
  id: string;
  name: string;
  status: LegacyAssessmentStatus;
  blueprintVersion: string;
  createdAt: Date;
  updatedAt: Date;
  finalizedAt?: Date;
}

export interface LegacyAssessmentCapability {
  id: string;
  assessmentId: string;
  capabilityCode: string;
  businessArea: string;
  processName: string;
}

export interface LegacyRating {
  id: string;
  assessmentId: string;
  capabilityCode: string;
  questionIndex: number;
  level: 1 | 2 | 3 | 4 | 5 | null;
  notes: string;
  carriedForward: boolean;
  updatedAt: Date;
}

// ============================================
// Blueprint types (from MITA JSON files)
// ============================================

export interface MaturityLevel {
  level_1: string;
  level_2: string;
  level_3: string;
  level_4: string;
  level_5: string;
}

export interface CapabilityQuestion {
  category: string;
  question: string;
  levels: MaturityLevel;
}

export interface BCM {
  document_type: "BCM";
  version: string;
  version_date: string;
  business_area: string;
  process_name: string;
  process_code: string;
  sub_category: string;
  maturity_model: {
    capability_questions: CapabilityQuestion[];
  };
  metadata: {
    source_file: string;
    source_page_range?: string;
    extracted_date: string;
  };
}

export interface AlternateProcessPath {
  description: string;
  reasons: string[];
}

export interface TriggerEvents {
  environment_based: string[];
  interaction_based: string[];
}

export interface BPT {
  document_type: "BPT";
  version: string;
  version_date: string;
  business_area: string;
  process_name: string;
  process_code: string;
  sub_category: string;
  process_details: {
    description: string;
    trigger_events: TriggerEvents;
    results: string[];
    process_steps: string[];
    diagrams: string[];
    alternate_process_path?: AlternateProcessPath;
    shared_data: string[];
    predecessor_processes: string[];
    successor_processes: string[];
    constraints: string;
    failures: string[];
    performance_measures: string[];
  };
  metadata: {
    source_file: string;
    source_page_range?: string;
    extracted_date: string;
  };
}

// Capability with both BCM and BPT data
export interface Capability {
  code: string;
  processName: string;
  businessArea: string;
  bcm: BCM;
  bpt: BPT;
}

// Business area grouping
export interface BusinessArea {
  name: string;
  code: string;
  capabilities: Capability[];
}
