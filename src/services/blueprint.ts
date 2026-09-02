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

// Extract capability code from filename (e.g., "CM_Establish_Case" from "CM_Establish_Case_BCM_v3.0.json")
function extractCapabilityCode(filename: string): string {
  const match = filename.match(/([A-Z]{2}_[^_]+(?:_[^_]+)*?)_(?:BCM|BPT)_v/);
  return match ? match[1] : "";
}

// Build the capabilities map
function buildCapabilitiesMap(): Map<string, { bcm?: BCM; bpt?: BPT }> {
  const capMap = new Map<string, { bcm?: BCM; bpt?: BPT }>();

  // Process BCM files
  for (const [path, bcm] of Object.entries(bcmModules)) {
    const code = extractCapabilityCode(path);
    if (code) {
      const existing = capMap.get(code) || {};
      capMap.set(code, { ...existing, bcm });
    }
  }

  // Process BPT files
  for (const [path, bpt] of Object.entries(bptModules)) {
    const code = extractCapabilityCode(path);
    if (code) {
      const existing = capMap.get(code) || {};
      capMap.set(code, { ...existing, bpt });
    }
  }

  return capMap;
}

// Build the full capabilities list
function buildCapabilities(): Capability[] {
  const capMap = buildCapabilitiesMap();
  const capabilities: Capability[] = [];
  const unpaired: string[] = [];

  for (const [code, data] of capMap.entries()) {
    if (data.bcm && data.bpt) {
      capabilities.push({
        code,
        processName: data.bcm.process_name,
        businessArea: data.bcm.business_area,
        bcm: data.bcm,
        bpt: data.bpt,
      });
    } else {
      unpaired.push(`${code} (missing ${data.bcm ? "BPT" : "BCM"})`);
    }
  }

  // A capability needs both halves to be usable, but dropping one silently means
  // it vanishes from the entire app with no signal. Two capabilities were lost
  // this way to BCM/BPT filename mismatches. Surface it during development so a
  // future mismatch is caught immediately rather than by counting rows.
  if (unpaired.length > 0 && import.meta.env.DEV) {
    console.warn(
      `[blueprint] ${unpaired.length} capability code(s) have only one of BCM/BPT and were excluded:\n  ` +
        unpaired.sort().join("\n  ") +
        "\nThe BCM and BPT filenames must use identical capability codes."
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
