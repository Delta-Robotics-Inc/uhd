# DRC + Engine Implementation Plan

Target: everything `docs/visualizer-spec.md` needs from `@deltarobotics/uhd`, built as
the composable DRC engine specced in `docs/drc-spec.md`. Ordered by dependency; each
phase is shippable and testable on its own.

Existing building blocks (implemented today):
`matchProtocols`/roles (`src/matching/`), `findCompatiblePairs`,
`findCompositionalMatch` (greedy, **single-level**), `deriveInferredInterface`,
`validateBinding`/profiles/claims/groups (`src/binding/`),
`getEffectiveRange`/`checkParameterCompatibility`/`evaluateConstraints`
(`src/parameters/`), instantiate/resolve (`src/instance/`).
Missing entirely: DRC orchestration, capacity, manual links, region paths, bridges,
connectors, census.

---

> Status 2026-07-07: Phases 0–2 implemented (`src/drc/`, `test/phase6-drc.test.ts`).
> Phase 2 ships protocol-tier discovery with region trees, unambiguous auto-connect,
> sub-link resolution, census, and potentials. 3a+ are next.

## Phase 0 — Export surface (prerequisite, ~small) ✅

- Re-export `matching/*`, `binding/*`, `parameters/*`, `instance/*`, `visualize/*` from
  `src/index.ts`; add `exports` subpaths (`.`, `./drc`, `./library`) to `package.json`.
- No behavior change. Unblocks web consumption without deep imports.

## Phase 1 — Result model (`src/drc/types.ts`) ✅

The serializable contract both the DRC and the view build against. Extends
`drc-spec.md` §5–7 with what the design iterations added:

```ts
type RegionPath = string[];            // ["actuator_port_1","uart"] — attachment altitude
interface EndpointAttachment {
  moduleId: string;
  regionPath: RegionPath;              // exact region that matched (NOT just interface id)
  role: string;
  altitude: "top" | "sub";             // derived: regionPath.length
}
interface SubLinkResult {              // one conductor / wire
  id: string;
  from: LeafRef; to: LeafRef;          // leaf interface + resolved physical pin ref
  method: "protocol" | "manual" | "inferred";
  locked: boolean;
  slotId?: string;
  provenance?: { moduleId: string };   // split fulfillment: which module supplies this slot
  rowPair?: number;                    // mirrored-ordering hint for the view
  diagnostics: Diagnostic[];
}
interface ConnectionResult {
  id: string;
  a: EndpointAttachment; b: EndpointAttachment;
  topology: "wire" | "bus" | "split" | "or";
  tier: Tier; confidence: number;
  state: ConnectionState;
  subLinks: SubLinkResult[];
  unresolvedSlots: UnresolvedSlot[];   // → sockets in the UI
  drops?: EndpointAttachment[];        // bus multi-drop extras
  bridgedParams?: BridgeResolution[];  // which ranges were bridge-substituted (§ Phase 5)
  diagnostics: Diagnostic[];
}
interface InterfaceCensusEntry {       // one per region node per module
  moduleId: string; regionPath: RegionPath;
  status: "connected" | "partial" | "compatible" | "no_counterpart" | "conflict";
  engagement?: { engaged: number; total: number };   // donut data
  reason?: string;                     // "∅ range vs power_12v", "compatible: d3"
  claimedBy?: string;                  // existing claim (findClaimConflicts)
  groupPolicy?: { groupId: string; policy: "one_of"|...; active: boolean };
}
interface PairValidationResult {
  connections: ConnectionResult[];
  census: InterfaceCensusEntry[];
  potentials: PotentialConnection[];   // ◉ / dashed bands, ranked
  capacity: CapacityReport[];
  verdict: { state: ConnectionState; counts: {...} };
}
```

Deliverable: types + JSON-schema snapshot test (contract stability for the website).

## Phase 2 — `validatePair()` orchestrator (`src/drc/validate-pair.ts`) ✅ (protocol tier)

```ts
validatePair(a: ModuleDef, b: ModuleDef, opts?: {
  context?: ModuleDef[];       // ghost third-party modules (split fulfillment)
  manualLinks?: ManualLinkDef[];
  selections?: GroupSelection[];   // one_of choices
  includePotentials?: boolean;     // census suggestions (default true)
}): PairValidationResult
```

Pipeline per drc-spec §6, composing existing primitives:
1. **Discovery** — enumerate candidate pairings across the full region trees of both
   modules (not just top-level interfaces): protocol pass (`matchProtocols`), then
   compositional (`findCompositionalMatch`), then inferred
   (`deriveInferredInterface`). Highest-altitude match wins per region subtree
   (visualizer-spec §4 rule 1); consumed regions are excluded from lower matches.
2. **Sub-link resolution** — slot walking + manual-link overlay (drc-spec §5). Emit
   `rowPair` indices while walking (the natural pair order IS the mirrored ordering).
3. **Parameter checks** — per sub-link + per pairing via `checkParameterCompatibility`
   / `evaluateConstraints`, with bridge substitution (Phase 5).
4. **Capacity** (Phase 6) and **claims/groups** (`findClaimConflicts`,
   `validateInterfaceGroups`) folded into diagnostics.
5. **Rollup** — ConnectionState per connection (drc-spec §6 stage 5) + engagement
   rollups up each ancestor chain (donut data) + pair verdict.
6. **Census & potentials** — walk every region of both modules; classify against the
   connection set; rank potentials by tier/confidence then parametric cleanliness.

Tests: fixture pairs — nano+VL53L0X (clean protocol), nano+L298N (compositional +
inferred), actuator_port vs bare-uart (altitude asymmetry + partial parent),
servo+controller+battery-in-context (split), VL53L0X on 5 V (bridged-range pass /
bare-die warn), over-budget rail (capacity error), one_of double-supply (group error).

## Phase 3 — Matching upgrades (`src/matching/`)

1. **Recursive compositional matching.** `findCompositionalMatch` today fills slots
   greedily at one level. Needed: multi-level slot resolution (slots whose `match`
   targets composed sub-interfaces — the 3-level `actuator_port` case) with
   backtracking or scored beam (greedy provably fails on shared-capability pins).
   *Decision needed:* backtracking depth limit vs. exhaustive (parts are small; suggest
   exhaustive with memo, cap at depth 4).
2. **Match-altitude search.** New `findBestPairings(aTree, bTree)` returning region-path
   pairs, honoring highest-common-level and consumed-region exclusion.
3. **Both-sides-implicit inference** (drc-spec tier `inferred`, stage-2 #3): neither
   side declares the protocol; capability walking only. Not implemented anywhere.
   *Decision needed:* ship v1 without it (one-sided inference covers the demos) and
   flag in census as future; or implement capability-graph walk now. Recommend defer.
4. **Suggestion scan** — `rankCounterparts(module, library)` reusing discovery per
   candidate; powers slot-B suggestions and `potentials`.

## Phase 4 — Manual links + accept/lock (`src/types/harness.ts`, `src/drc/manual.ts`)

- Add `manualLinks?: ManualLinkDef[]` to `HarnessDef` exactly as drc-spec §4.
- `acceptInferred(connection): ManualLinkDef[]` — converts an inferred connection's
  sub-links to locked manual links (the UI's "Accept & lock wiring").
- Resolution precedence: locked manual > auto-derived; unconsumed manual links surface
  as standalone `manual`-tier connections.

## Phase 5 — Bridged parametrics (`src/drc/bridge.ts`)

- Resolve `can_bridge` traits / `bridgesTo`: when a leaf's parameter is behind a bridge
  (regulator, level shifter), parametric checks evaluate the **bridged range** and
  record a `BridgeResolution` (the UI's `bridged 2.6–5.5 V` label + interior-lane view).
- *Decision needed:* bridge range representation — today `CanBridgeTrait` has from/to
  but no transfer function. Suggest v1: explicit `output_range` param on the bridge
  trait; no computation.

## Phase 6 — Capacity engine (`src/drc/capacity.ts`) — net-new

- **Current budgets**: group sinks by supply (power domain / rail through connections,
  including bus drops); sum `current_draw` vs `max_current`; emit
  `CapacityReport { railId, used, limit, contributors[] }` → budget bars; over → error.
- **Address space**: per-bus protocol capacity (i2c 112 addresses, address conflicts
  when two drops share an address).
- **Instance counts**: `max_instances` consumption (L298N's 2 motor channels).
- Requires parameter conventions: standardize `current_draw` / `max_current` ids in
  library parts (audit fixtures; document in library authoring guide).

## Phase 7 — Connector / ecosystem exclusivity (schema + check)

From `docs/NOTES.md` + B4: add optional `connector?: { type: string; ecosystem?:
string; gender?: ... }` to `InterfaceDef` (and endpoint override). Check: mated
connectors must agree on type; `ecosystem` present ⇒ both sides same ecosystem, else
INCOMPATIBLE with the `ecosystem lock` diagnostic.
*Decision needed:* field placement (InterfaceDef vs ArtifactDef vs new ConnectorDef) —
recommend `InterfaceDef.connector`, mirroring ProtoPart's `connector_type` resource
field for future migration.

## Phase 8 — Serialization + package

- `PairValidationResult` is plain JSON (no class instances, branded ids as strings).
- Ship `./drc` subpath; zero runtime deps preserved (browser execution is the point).
- Add golden-JSON tests per fixture pair (the website can pin against them).

## Phase 9 — Web plumbing (Protoboard-Website repo)

1. Library manifest build (`scripts/build-library.ts`) per `docs/showcase-plan.md` §2.3.
2. `/validate` page: engine runs client-side; state in URL.
3. **Pair-scene layout engine** (visualizer-spec §9): DOM rows + measured ports
   (ResizeObserver), SVG overlay for shared regions/wires, row-pairing from `rowPair`,
   band stacking by severity. Build as an isolated React component
   (`<PairScene result={…}/>`) — it is also the future node-editor edge inspector.
4. DRC results list = Concept C rows fed from the same `PairValidationResult`.

## Build order & estimates

| # | Work | Depends on | Size |
|---|---|---|---|
| 0 | export surface | — | XS |
| 1 | result model + schema test | — | S |
| 2 | validatePair pipeline (protocol tier only) | 0,1 | M |
| 3a | recursive compositional + altitude search | 2 | M–L |
| 3b | suggestion scan | 2 | S |
| 4 | manualLinks + accept/lock | 2 | S |
| 5 | bridged parametrics | 2 | S–M |
| 6 | capacity engine | 2 | M |
| 7 | connector/ecosystem | 1 | S |
| 8 | serialization/golden tests | 2+ | S |
| 9 | website: manifest, PairScene, /validate | 2–8 as available | L |

Critical path: 0 → 1 → 2 → 3a → 9. Phases 4–7 attach independently after 2.

## Design decisions (resolved 2026-07-07)

1. Recursive matching strategy: **exhaustive with memoization, depth cap 4** (Phase 3a).
2. Both-sides-implicit inference: **deferred** — one-sided inference covers the demos;
   census flags it as future.
3. Bridge transfer representation: **static `output_range` param on the bridge trait**,
   no transfer-function computation in v1 (Phase 5).
4. Connector modeling: **connectors are separate entities** (`ModuleDef.connectors[]`
   referencing interfaces/leaf signals), not an `InterfaceDef.connector` field — one
   interface can be exposed on multiple connectors (pin + pad), and one connector can
   carry multiple interfaces (QWIIC = i2c + power). Interface matching and connector
   mating are orthogonal DRC checks. Ecosystem/gender/type live on the connector.
   Phase 7 to be re-specced against this shape.
5. Capacity/DRC rule conventions: **scoped rule packs**, not globally canonical param
   ids. Rules are declarative instances of generic kinds (budget, count, address-space,
   range-overlap, mate) declared at domain / protocol / interface scope and resolved
   most-specific-wins. Canonical param ids (`current_draw`, `max_current`, …) are bound
   *inside* each domain pack. Phase 6 becomes a generic aggregate-rule evaluator +
   pack schema. Already reflected in `CapacityReport { ruleId, scope }`.
6. Auto-lock: **never auto-lock** — locks are always user actions. Additionally,
   auto-*connect* only unambiguous pairings (the sole viable candidate for both
   endpoints, preferring parametrically clean ones); ambiguous matches (a GPIO a dozen
   pins could serve) surface as potentials/◉ for the user to click. Implemented in
   `validatePair` (`isUnambiguous`).
7. Potential ranking: engine ranks by cleanliness → confidence → altitude and returns
   all; the view applies top-k (default 3 dashed bands per side, rest behind an
   expander). Final k is UX tuning at build time.

## Further exploration (not blocking)

- `split`/`or` topology UX beyond the B3/B4 vignettes (fan-out geometry in the SVG overlay).
- Constraint solver (architecture doc §future) — validation-only is fine for the demo.
- ProtoPart→UHD importer (library scale-up) and how its `resources[].functions`
  map onto capabilities (ProtoPart `gap-report.ts` "uhd-drift" is the hook).
- ASCII/HTML visualizer parity: emit the B8 semantics in `renderPairAscii` (donut/census
  markers) so terminal demos match the web story.
