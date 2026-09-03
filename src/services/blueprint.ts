import type { BCM, BPT, Capability, BusinessArea } from "../types";

// Import all BCM files using Vite's glob import
const bcmModules = import.meta.glob<BCM>("../data/bcm/**/*.json", {
  eager: true,
  import: "default",
});

// Import all BPT files using Vite's glob import
const bptModules = import.meta.glob<BPT>("../data/bpt/**/*.json", {
  eager: true,
  import: "default",
});

/**
 * Extract this app's capability code from a filename
 * (e.g. "CM_Establish_Case" from "CM_Establish_Case_BCM_v3.0.json").
 *
 * Still filename-derived because this value is persisted on every assessment;
 * changing how it is computed would orphan stored rows. It is no longer used to
 * pair the two halves — see `buildCapabilitiesMap`.
 */
function extractCapabilityCode(filename: string): string {
  const match = filename.match(/([A-Z]{2}_[^_]+(?:_[^_]+)*?)_(?:BCM|BPT)_v/);
  return match ? match[1] : "";
}

/**
 * Group BCM and BPT records into pairs, keyed on the upstream `process_id`.
 *
 * Pairing on `process_id` rather than on the filename is the whole point. CMS
 * names two processes inconsistently across its own appendices, so the BCM and BPT
 * filenames for those disagreed and this app silently built 74 capabilities from
 * 152 files — two capabilities vanished from the dashboard, the process tree and
 * every average, with no error. `process_id` is upstream's answer to that: one
 * value per process, identical on both halves, regardless of spelling.
 *
 * The app's own `code` still comes from the filename, so stored assessments keep
 * resolving. Pairing and identity are deliberately separate concerns here.
 */
function buildCapabilitiesMap(): Map<string, { bcm?: BCM; bpt?: BPT; code?: string }> {
  const capMap = new Map<string, { bcm?: BCM; bpt?: BPT; code?: string }>();

  for (const [path, bcm] of Object.entries(bcmModules)) {
    const existing = capMap.get(bcm.process_id) || {};
    // The BCM's filename supplies the app-facing code. Taken from the BCM half
    // specifically, and only here, so a single rule decides it.
    capMap.set(bcm.process_id, {
      ...existing,
      bcm,
      code: extractCapabilityCode(path),
    });
  }

  for (const [, bpt] of Object.entries(bptModules)) {
    const existing = capMap.get(bpt.process_id) || {};
    capMap.set(bpt.process_id, { ...existing, bpt });
  }

  return capMap;
}

// Build the full capabilities list
function buildCapabilities(): Capability[] {
  const capMap = buildCapabilitiesMap();
  const capabilities: Capability[] = [];
  const unpaired: string[] = [];

  for (const [processId, data] of capMap.entries()) {
    if (data.bcm && data.bpt && data.code) {
      capabilities.push({
        code: data.code,
        processName: data.bcm.process_name,
        businessArea: data.bcm.business_area,
        bcm: data.bcm,
        bpt: data.bpt,
      });
    } else {
      const missing = !data.bcm ? "BCM" : !data.bpt ? "BPT" : "a parseable filename";
      unpaired.push(`${processId} (missing ${missing})`);
    }
  }

  // A capability needs both halves to be usable, but dropping one silently means it
  // vanishes from the entire app with no signal. Two capabilities were lost that way
  // when pairing was done by filename. Pairing now uses `process_id`, so this should be
  // unreachable — it stays as the tripwire that reports an unpaired record rather than
  // letting us discover it by counting rows.
  //
  // Warned in production too, not just DEV. A capability disappearing is exactly the
  // class of failure this change set exists to remove, and gating the only signal behind
  // a dev build reproduced it for every real user.
  if (unpaired.length > 0) {
    console.warn(
      `[blueprint] ${unpaired.length} process_id(s) lack a complete BCM/BPT pair and were excluded:\n  ` +
        unpaired.sort().join("\n  ")
    );
  }

  return capabilities.sort((a, b) => {
    // Sort by business area first, then by process name
    const areaCompare = a.businessArea.localeCompare(b.businessArea);
    if (areaCompare !== 0) return areaCompare;
    return a.processName.localeCompare(b.processName);
  });
}

// Build business areas with their capabilities
function buildBusinessAreas(): BusinessArea[] {
  // Via the cache, not buildCapabilities() directly: building twice also logged
  // the unpaired-capability warning twice on startup.
  const capabilities = getCapabilities();
  const areaMap = new Map<string, Capability[]>();

  for (const cap of capabilities) {
    const existing = areaMap.get(cap.businessArea) || [];
    existing.push(cap);
    areaMap.set(cap.businessArea, existing);
  }

  // Map business area names to codes
  const areaCodes: Record<string, string> = {
    "Business Relationship Management": "BR",
    "Care Management": "CM",
    "Contractor Management": "CO",
    "Eligibility and Enrollment Management": "EE",
    "Financial Management": "FM",
    "Operations Management": "OM",
    "Performance Management": "PE",
    "Plan Management": "PL",
    "Provider Management": "PM",
  };

  const businessAreas: BusinessArea[] = [];
  for (const [name, caps] of areaMap.entries()) {
    businessAreas.push({
      name,
      code: areaCodes[name] || name.substring(0, 2).toUpperCase(),
      capabilities: caps,
    });
  }

  return businessAreas.sort((a, b) => a.name.localeCompare(b.name));
}

// Cached data
let cachedCapabilities: Capability[] | null = null;
let cachedBusinessAreas: BusinessArea[] | null = null;
let cachedCapabilitiesByCode: Map<string, Capability> | null = null;

// Public API
export function getCapabilities(): Capability[] {
  if (!cachedCapabilities) {
    cachedCapabilities = buildCapabilities();
  }
  return cachedCapabilities;
}

export function getBusinessAreas(): BusinessArea[] {
  if (!cachedBusinessAreas) {
    cachedBusinessAreas = buildBusinessAreas();
  }
  return cachedBusinessAreas;
}

/**
 * Look up a capability by code.
 *
 * Map-backed rather than a linear scan: this is called once per capability inside
 * the score aggregation and once per rating in the PDF generator, so a `find` over
 * all capabilities made those loops quadratic.
 */
export function getCapabilityByCode(code: string): Capability | undefined {
  if (!cachedCapabilitiesByCode) {
    cachedCapabilitiesByCode = new Map(getCapabilities().map((c) => [c.code, c]));
  }
  return cachedCapabilitiesByCode.get(code);
}

export function getCapabilityByProcessName(processName: string): Capability | undefined {
  // Normalize the search: case-insensitive, trim whitespace
  const normalized = processName.trim().toLowerCase();
  return getCapabilities().find((c) => c.processName.toLowerCase() === normalized);
}

export function getBlueprintVersion(): string {
  const capabilities = getCapabilities();
  return capabilities.length > 0 ? capabilities[0].bcm.version : "3.0";
}

export function getTotalQuestionCount(capabilityCodes: string[]): number {
  return capabilityCodes.reduce((total, code) => {
    const cap = getCapabilityByCode(code);
    return total + (cap?.bcm.maturity_model.capability_questions.length || 0);
  }, 0);
}
