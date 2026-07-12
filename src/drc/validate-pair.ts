import type { ModuleDef } from "../types/module.js";
import { matchProtocols, type ProtocolMatchResult } from "../matching/protocol-match.js";
import { areRolesCompatible } from "../matching/roles.js";
import {
  buildRegionTree,
  flattenTree,
  descendants,
  pickProfile,
  type RegionNode,
} from "./region-tree.js";
import { checkPairParameters } from "./param-check.js";
import type {
  ConnectionResult,
  ConnectionState,
  Diagnostic,
  InterfaceCensusEntry,
  LeafRef,
  PairValidationResult,
  PotentialConnection,
  SubLinkResult,
  UnresolvedSlot,
  ValidatePairOptions,
} from "./types.js";
import { TIER_CONFIDENCE } from "./types.js";

interface Candidate {
  a: RegionNode;
  b: RegionNode;
  match: ProtocolMatchResult;
  diagnostics: Diagnostic[];
  clean: boolean;
}

/**
 * Validate a pair of modules: discover connections across both region trees,
 * resolve conductors, run parameter checks, and produce the full serializable
 * result the visualizer renders from (docs/drc-implementation-plan.md Phase 2).
 *
 * v1 scope: protocol-tier matching only. Compositional/inferred discovery
 * (Phase 3a), manual links (Phase 4), bridges (Phase 5), and capacity (Phase 6)
 * layer on top of this pipeline.
 */
export function validatePair(
  moduleA: ModuleDef,
  moduleB: ModuleDef,
  opts: ValidatePairOptions = {},
): PairValidationResult {
  const includePotentials = opts.includePotentials !== false;

  const rootsA = buildRegionTree(moduleA);
  const rootsB = buildRegionTree(moduleB);
  const regionsA = flattenTree(rootsA);
  const regionsB = flattenTree(rootsB);

  // --- Stage 1: discovery — enumerate every compatible region pairing ---
  const candidates: Candidate[] = [];
  for (const a of regionsA) {
    for (const b of regionsB) {
      if (a.iface.domain !== b.iface.domain) continue;
      const match = matchProtocols(a.iface, b.iface);
      if (!match.compatible) continue;
      const diagnostics = checkPairParameters(a.iface.parameters, b.iface.parameters);
      candidates.push({
        a,
        b,
        match,
        diagnostics,
        clean: diagnostics.every((d) => d.severity !== "error"),
      });
    }
  }

  // Highest common altitude first, then parametric cleanliness, then stable ids.
  candidates.sort(
    (x, y) =>
      x.a.depth + x.b.depth - (y.a.depth + y.b.depth) ||
      Number(y.clean) - Number(x.clean) ||
      candidateKey(x).localeCompare(candidateKey(y)),
  );

  // --- Stage 2: acceptance — auto-connect only unambiguous pairings ---
  // A region (or any of its ancestors/descendants) participates in at most one
  // connection; consumed subtrees drop out of the alive set as we accept.
  const consumedA = new Set<RegionNode>();
  const consumedB = new Set<RegionNode>();
  const accepted: Candidate[] = [];

  const blocked = (node: RegionNode, consumed: Set<RegionNode>): boolean =>
    consumed.has(node) ||
    descendants(node).some((d) => consumed.has(d)) ||
    ancestorConsumed(node, consumed);

  const alive = (c: Candidate) => !blocked(c.a, consumedA) && !blocked(c.b, consumedB);

  let progressed = true;
  while (progressed) {
    progressed = false;
    const aliveCandidates = candidates.filter(alive);
    for (const c of aliveCandidates) {
      if (!alive(c)) continue; // may have been consumed earlier this sweep
      if (!isUnambiguous(c, aliveCandidates.filter(alive))) continue;
      accepted.push(c);
      consumedA.add(c.a);
      for (const d of descendants(c.a)) consumedA.add(d);
      consumedB.add(c.b);
      for (const d of descendants(c.b)) consumedB.add(d);
      progressed = true;
    }
  }

  // --- Stage 3: build connection results (sub-links, states) ---
  const connections = accepted.map((c) => buildConnection(c, moduleA.id, moduleB.id));

  // --- Stage 4: potentials — compatible pairings that were not auto-connected ---
  const potentials: PotentialConnection[] = includePotentials
    ? candidates
        .filter((c) => !accepted.includes(c))
        .map((c) => ({
          a: { moduleId: moduleA.id, regionPath: c.a.path },
          b: { moduleId: moduleB.id, regionPath: c.b.path },
          protocol: c.match.matchedProtocol ?? "",
          tier: "protocol" as const,
          confidence: c.match.confidence,
          clean: c.clean,
          diagnostics: c.diagnostics,
        }))
    : [];

  // --- Stage 5: census — every region of both modules is represented ---
  const census = [
    ...buildCensus(moduleA.id, regionsA, consumedA, accepted.map((c) => c.a), candidates.map((c) => c.a), candidates, "a"),
    ...buildCensus(moduleB.id, regionsB, consumedB, accepted.map((c) => c.b), candidates.map((c) => c.b), candidates, "b"),
  ];

  // --- Stage 6: verdict rollup ---
  const counts = {
    connections: connections.length,
    valid: connections.filter((c) => c.state === "valid" || c.state === "valid_inferred" || c.state === "valid_manual").length,
    warnings: connections.filter((c) => c.state === "warning").length,
    errors: connections.filter((c) => c.state === "incompatible").length,
    configurationNeeded: connections.filter((c) => c.state === "configuration_needed").length,
    potentials: potentials.length,
  };
  const state: ConnectionState =
    connections.length === 0
      ? "not_configured"
      : counts.errors > 0
        ? "incompatible"
        : counts.configurationNeeded > 0
          ? "configuration_needed"
          : counts.warnings > 0
            ? "warning"
            : "valid";

  return {
    modules: {
      a: { id: moduleA.id, name: moduleA.name, interfaceCount: regionsA.length },
      b: { id: moduleB.id, name: moduleB.name, interfaceCount: regionsB.length },
    },
    connections,
    census,
    potentials,
    capacity: [], // Phase 6
    verdict: { state, counts },
  };
}

function candidateKey(c: Candidate): string {
  return `${c.a.path.join(".")}~${c.b.path.join(".")}`;
}

function ancestorConsumed(node: RegionNode, consumed: Set<RegionNode>): boolean {
  let current = node.parent;
  while (current) {
    if (consumed.has(current)) return true;
    current = current.parent;
  }
  return false;
}

/**
 * Auto-connect policy: a candidate is accepted only when it is the sole viable
 * choice for BOTH of its endpoints — the only clean alive candidate, or (when an
 * endpoint has no clean options at all) the only alive candidate. Ambiguous
 * matches (a GPIO that a dozen pins could serve) surface as potentials for the
 * user to click instead. Connections are never auto-locked.
 */
function isUnambiguous(c: Candidate, aliveCandidates: Candidate[]): boolean {
  for (const side of ["a", "b"] as const) {
    const forEndpoint = aliveCandidates.filter((x) => x[side] === c[side]);
    const clean = forEndpoint.filter((x) => x.clean);
    const pool = clean.length > 0 ? clean : forEndpoint;
    if (pool.length !== 1 || pool[0] !== c) return false;
  }
  return true;
}

function buildConnection(c: Candidate, moduleIdA: string, moduleIdB: string): ConnectionResult {
  const id = `${moduleIdA}:${c.a.path.join(".")}~${moduleIdB}:${c.b.path.join(".")}`;
  const { subLinks, unresolvedSlots } = resolveSubLinks(id, c, moduleIdA, moduleIdB);

  const allDiagnostics = [...c.diagnostics, ...subLinks.flatMap((l) => l.diagnostics)];
  const hasError = allDiagnostics.some((d) => d.severity === "error");
  const hasWarning = allDiagnostics.some((d) => d.severity === "warning");
  const state: ConnectionState = hasError
    ? "incompatible"
    : unresolvedSlots.some((s) => s.required)
      ? "configuration_needed"
      : hasWarning
        ? "warning"
        : "valid";

  return {
    id,
    a: {
      moduleId: moduleIdA,
      regionPath: c.a.path,
      role: c.match.roleA ?? "",
      altitude: c.a.depth === 0 ? "top" : "sub",
    },
    b: {
      moduleId: moduleIdB,
      regionPath: c.b.path,
      role: c.match.roleB ?? "",
      altitude: c.b.depth === 0 ? "top" : "sub",
    },
    topology: "wire",
    protocol: c.match.matchedProtocol ?? "",
    tier: "protocol",
    confidence: TIER_CONFIDENCE.protocol,
    state,
    subLinks,
    unresolvedSlots,
    diagnostics: c.diagnostics,
  };
}

/**
 * Pair the matched regions' slots into conductors. When both sides declare
 * slots, slots pair by protocol + complementary role and each side's conductor
 * endpoint is the leaf its active profile binds. When either side is a bare
 * leaf, the connection is a single conductor between the regions themselves.
 * rowPair indices carry the mirrored row ordering the layout engine uses.
 */
function resolveSubLinks(
  connectionId: string,
  c: Candidate,
  moduleIdA: string,
  moduleIdB: string,
): { subLinks: SubLinkResult[]; unresolvedSlots: UnresolvedSlot[] } {
  const slotsA = c.a.iface.slots ?? [];
  const slotsB = c.b.iface.slots ?? [];
  const subLinks: SubLinkResult[] = [];
  const unresolvedSlots: UnresolvedSlot[] = [];

  if (slotsA.length === 0 || slotsB.length === 0) {
    subLinks.push({
      id: `${connectionId}#0`,
      from: { moduleId: moduleIdA, interfaceId: c.a.iface.id },
      to: { moduleId: moduleIdB, interfaceId: c.b.iface.id },
      method: "protocol",
      locked: false,
      rowPair: 0,
      diagnostics: [],
    });
    return { subLinks, unresolvedSlots };
  }

  const profileA = pickProfile(c.a.iface);
  const profileB = pickProfile(c.b.iface);
  const usedB = new Set<string>();
  let row = 0;

  for (const slotA of slotsA) {
    const protocol = slotA.match.protocol;
    const partner = slotsB.find(
      (slotB) =>
        !usedB.has(slotB.id) &&
        protocol !== undefined &&
        slotB.match.protocol?.toLowerCase() === protocol.toLowerCase() &&
        (slotA.match.role === undefined ||
          slotB.match.role === undefined ||
          areRolesCompatible(protocol, slotA.match.role, slotB.match.role)),
    );

    if (!partner) {
      if (slotA.required) {
        unresolvedSlots.push({
          moduleId: moduleIdA,
          regionPath: c.a.path,
          slotId: slotA.id,
          required: true,
          match: slotA.match,
        });
      }
      continue;
    }
    usedB.add(partner.id);

    subLinks.push({
      id: `${connectionId}#${row}`,
      from: leafRef(moduleIdA, c.a.iface.id, slotA.id, profileA?.bindings[slotA.id]),
      to: leafRef(moduleIdB, c.b.iface.id, partner.id, profileB?.bindings[partner.id]),
      method: "protocol",
      locked: false,
      rowPair: row,
      diagnostics: [],
    });
    row++;
  }

  for (const slotB of slotsB) {
    if (slotB.required && !usedB.has(slotB.id)) {
      unresolvedSlots.push({
        moduleId: moduleIdB,
        regionPath: c.b.path,
        slotId: slotB.id,
        required: true,
        match: slotB.match,
      });
    }
  }

  return { subLinks, unresolvedSlots };
}

function leafRef(
  moduleId: string,
  ownerInterfaceId: string,
  slotId: string,
  binding: string | string[] | undefined,
): LeafRef {
  const bound = Array.isArray(binding) ? binding[0] : binding;
  return { moduleId, interfaceId: bound ?? ownerInterfaceId, slotId };
}

function buildCensus(
  moduleId: string,
  regions: RegionNode[],
  consumed: Set<RegionNode>,
  connectedNodes: RegionNode[],
  candidateNodes: RegionNode[],
  candidates: Candidate[],
  side: "a" | "b",
): InterfaceCensusEntry[] {
  const connectedSet = new Set(connectedNodes);
  const candidateSet = new Set(candidateNodes);

  return regions.map((node) => {
    const label = node.iface.protocols
      .map((p) => `${p.type} · ${p.roles.join(", ")}`)
      .join(" | ");
    const base = { moduleId, regionPath: node.path, label };

    if (connectedSet.has(node)) {
      return { ...base, status: "connected" as const };
    }

    const engagedChildren = node.children.filter(
      (child) => connectedSet.has(child) || descendants(child).some((d) => connectedSet.has(d)),
    );
    if (engagedChildren.length > 0) {
      return {
        ...base,
        status: "partial" as const,
        engagement: { engaged: engagedChildren.length, total: node.children.length },
      };
    }

    if (consumed.has(node)) {
      // inside a connected parent's shared territory — engaged via the parent
      return { ...base, status: "connected" as const, reason: "via parent" };
    }

    if (candidateSet.has(node)) {
      const counterparts = candidates
        .filter((c) => c[side] === node)
        .map((c) => (side === "a" ? c.b : c.a).iface.id);
      return {
        ...base,
        status: "compatible" as const,
        reason: `compatible: ${[...new Set(counterparts)].join(", ")}`,
      };
    }

    return { ...base, status: "no_counterpart" as const };
  });
}
