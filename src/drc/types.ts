import type { SlotMatch } from "../types/interface.js";

/**
 * DRC result model — the serializable contract between the engine and every
 * renderer (web PairScene, ASCII, JSON export). See docs/drc-implementation-plan.md
 * Phase 1 and docs/visualizer-spec.md §10.
 *
 * Everything here must survive JSON.parse(JSON.stringify(x)) unchanged.
 */

export type Tier = "protocol" | "compositional" | "inferred" | "manual" | "none";

export const TIER_CONFIDENCE: Record<Tier, number> = {
  protocol: 1.0,
  compositional: 0.8,
  inferred: 0.5,
  manual: 0.3,
  none: 0.0,
};

export type ConnectionState =
  | "valid"
  | "valid_inferred"
  | "valid_manual"
  | "configuration_needed"
  | "warning"
  | "incompatible"
  | "not_configured";

export interface Diagnostic {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  /** ids of the things this diagnostic is about (param ids, interface ids, slot ids) */
  refs?: string[];
}

/**
 * Path from a module's surface down to a region: ["actuator_port_1", "uart"].
 * The attachment altitude of a match is where this path ends — NOT just an
 * interface id (visualizer-spec §4 rule 1).
 */
export type RegionPath = string[];

export interface EndpointRef {
  moduleId: string;
  regionPath: RegionPath;
}

export interface EndpointAttachment extends EndpointRef {
  /** role played on the matched protocol ("master", "device", "input", …) */
  role: string;
  /** derived from regionPath.length; sub↔top asymmetry is legal */
  altitude: "top" | "sub";
}

/** One end of a conductor: a leaf interface, plus how it was reached. */
export interface LeafRef {
  moduleId: string;
  interfaceId: string;
  /** slot on the composed parent this leaf fills (absent for bare leaves) */
  slotId?: string;
  /** physical pin label if known ("D16", "pin 3") */
  pin?: string;
}

/** One conductor / wire inside a connection. */
export interface SubLinkResult {
  id: string;
  from: LeafRef;
  to: LeafRef;
  method: "protocol" | "manual" | "inferred";
  locked: boolean;
  /** split fulfillment: which module actually supplies this slot */
  provenance?: { moduleId: string };
  /** mirrored-ordering hint: from/to render at the same row index */
  rowPair: number;
  diagnostics: Diagnostic[];
}

export interface UnresolvedSlot {
  moduleId: string;
  regionPath: RegionPath;
  slotId: string;
  required: boolean;
  match: SlotMatch;
}

/** A realized pairing between two regions — one shared region in the B8 view. */
export interface ConnectionResult {
  id: string;
  a: EndpointAttachment;
  b: EndpointAttachment;
  topology: "wire" | "bus" | "split" | "or";
  /** protocol type the pairing matched on */
  protocol: string;
  tier: Tier;
  confidence: number;
  state: ConnectionState;
  subLinks: SubLinkResult[];
  /** required slots with no counterpart → amber sockets, CONFIGURATION_NEEDED */
  unresolvedSlots: UnresolvedSlot[];
  /** bus multi-drop extras beyond a/b */
  drops?: EndpointAttachment[];
  diagnostics: Diagnostic[];
}

/** One entry per region node per module — "everything is shown" (spec §5.1). */
export interface InterfaceCensusEntry {
  moduleId: string;
  regionPath: RegionPath;
  /** protocol summary for rail rendering ("i2c · master, slave") */
  label: string;
  status: "connected" | "partial" | "compatible" | "no_counterpart" | "conflict";
  /** donut data for partially-engaged parents */
  engagement?: { engaged: number; total: number };
  /** human-readable qualifier ("compatible: d3", "∅ range vs power_5v_out") */
  reason?: string;
}

/** A compatible-but-unconnected pairing — ◉ ports and dashed potential bands. */
export interface PotentialConnection {
  a: EndpointRef;
  b: EndpointRef;
  protocol: string;
  tier: Tier;
  confidence: number;
  /** true when every checked parameter is compatible */
  clean: boolean;
  diagnostics: Diagnostic[];
}

/**
 * Capacity findings (Phase 6). Shaped for scoped rule packs: `ruleId` names the
 * rule that produced the report and `scope` names where that rule was declared
 * (domain pack, protocol def, interface), so domains with different physics
 * (current vs. flow vs. bandwidth) reuse the same report shape.
 */
export interface CapacityReport {
  id: string;
  ruleId: string;
  scope: { level: "domain" | "protocol" | "interface"; id: string };
  resource: string;
  unit: string;
  used: number;
  limit: number;
  contributors: EndpointRef[];
  severity: "error" | "warning" | "info";
  message: string;
}

/** Explicit user-authored link (Phase 4). Locked links always win over derived. */
export interface ManualLinkDef {
  id: string;
  from: LeafRef;
  to: LeafRef;
  locked?: boolean;
}

export interface PairVerdict {
  state: ConnectionState;
  counts: {
    connections: number;
    valid: number;
    warnings: number;
    errors: number;
    configurationNeeded: number;
    potentials: number;
  };
}

export interface ModuleSummary {
  id: string;
  name: string;
  interfaceCount: number;
}

export interface PairValidationResult {
  modules: { a: ModuleSummary; b: ModuleSummary };
  connections: ConnectionResult[];
  census: InterfaceCensusEntry[];
  potentials: PotentialConnection[];
  capacity: CapacityReport[];
  verdict: PairVerdict;
}

export interface ValidatePairOptions {
  /** ghost third-party modules for split fulfillment (Phase 3+) */
  context?: import("../types/module.js").ModuleDef[];
  /** user-authored links overlaid on discovery (Phase 4) */
  manualLinks?: ManualLinkDef[];
  /** compute census suggestions / potentials (default true) */
  includePotentials?: boolean;
}
