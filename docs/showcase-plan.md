# UHD Showcase Plan: Interface Validator + Public Parts Library

Two public pages on protoboard.ai that demonstrate OpenUHD to the world:

1. **`protoboard.ai/validate`** — a 2-module interface validator: pick Module A and
   Module B, see their interface→harness→interface connections, and run DRC
   (compatibility + capacity + parametric constraints) on the pair.
2. **`protoboard.ai/parts`** — a public library of UHD modules (step.parts-style),
   which also feeds the validator's search and suggestions.

---

## 1. Where the code lives

| Concern | Repo | Notes |
|---|---|---|
| UHD engine + DRC + parts data | `repos/uhd` (`@deltarobotics/uhd`) | Zero runtime deps — runs in the browser as-is |
| `/validate` and `/parts` pages | `repos/Protoboard-Website` (protoboard.ai) | Next.js 15 App Router, SEO infra (robots/sitemap/social metadata), Firebase App Hosting. **Not** next-alpha — that is an auth'd client-only SPA. |
| Part migration source | `repos/Protoboard/next-alpha/src/ProtoPart` | 168 ProtoPart definitions + thumbnails; schema v1.5.0 |

The website consumes `@deltarobotics/uhd` as a package (types + engine + library
JSON). The pages are plain React on top of it; no server round-trip is needed for
DRC because the engine is dependency-free TypeScript.

## 2. Work in `repos/uhd` (engine + library)

### 2.1 Export the full engine (small, do first)
`src/index.ts` currently exports only types + `matchProtocols`/role helpers.
Re-export `matching/*`, `binding/*`, `parameters/*`, `instance/*`, `visualize/*`
so web consumers don't need deep imports. Consider subpath `exports` map.

### 2.2 `validatePair()` — the DRC orchestrator (the real gap)
There is no top-level "validate two modules" entry point today. Implement the
`docs/drc-spec.md` pipeline as `src/drc/`. **Detailed phased plan:
`docs/drc-implementation-plan.md`; view contract it must satisfy:
`docs/visualizer-spec.md`.**

```ts
validatePair(a: ModuleDef, b: ModuleDef, opts?): PairValidationResult
```

- **Discovery**: enumerate candidate connections with `findCompatiblePairs` (direct
  protocol matches) + `findCompositionalMatch`/`deriveInferredInterface`
  (slot-filling matches). Each candidate becomes a synthesized `HarnessDef`
  (wire/bus) between the two modules — the "edges" the UI draws.
- **Per-connection checks**, each producing typed findings `{severity, code, message, refs}`:
  - *Compatibility*: protocol type/role/version via existing matchers.
  - *Parametric*: `checkParameterCompatibility` (range overlap, e.g. voltage) +
    `evaluateConstraints` for module-level `ConstraintExpr`s.
  - *Capacity*: **net-new** — aggregate current draw across connections claiming a
    supply (sum `current_draw` vs `max_current` on the power domain / interface),
    plus `max_instances` and claim conflicts via `findClaimConflicts`.
- **Rollup**: per-connection `ConnectionState` (`compatible | compatible_with_warnings | incompatible | not_evaluated`) and a pair-level verdict + counts, per drc-spec.
- Tests: fixture pairs — nano+VL53L0X (clean I2C), nano+L298N (compositional
  motor_control), VL53L0X on 5V rail (voltage range violation), over-capacity
  power budget case (new fixture).

### 2.3 `library/` — the canonical public parts set
Follow the layout already specced in `docs/architecture.md` (§ library):

```
library/protocols/   canonical i2c, spi, uart, power, digital defs
library/modules/     base templates (mcu-base, sensor-base, driver-base)
library/parts/       concrete ModuleDefs (TS), one file per part
```

- Seed (~10–15 parts) by promoting the test fixtures (arduino-nano, l298n,
  vl53l0x, dc-motor, battery from six-axis-arm) and hand-authoring a few
  crowd-pleasers (Raspberry Pi Pico, BME280, SSD1306 OLED, servo, buck converter)
  so the demo has interesting pairings across domains.
- **Manifest build step**: `scripts/build-library.ts` compiles TS defs →
  `library/dist/index.json` (search manifest: id, name, taxonomy, protocols,
  domains, thumbnail) + `library/dist/parts/<id>.json` (full ModuleDef). The
  website statically imports these — no database needed at this scale.
- **Artifacts**: use the existing `ArtifactDef` type — datasheet URLs, STEP files,
  images. Same pattern as ProtoPart (`artifacts/sources.json`): reference
  externally-hosted resources by URL, host small ones ourselves under
  `library/parts/<id>/artifacts/`.
- **Later**: `scripts/import-protopart.ts` converter to migrate the 168 ProtoPart
  definitions (their per-part dir layout is already "UHD-shaped" per ProtoPart's
  README) — this is how the library scales past the hand-authored seed.

## 3. `/validate` — the Interface Validator

### 3.1 UX flow (step wizard with persistent slots)
The page is a 3-step flow where the **slot rail stays pinned at top** and the
region below it changes with the active step:

```
┌────────────────────────────────────────────────────────────┐
│  [Slot A: Module card]  ══ edges/harness ══  [Slot B card] │  ← always visible
├────────────────────────────────────────────────────────────┤
│  Tabs: ① Select Module A | ② Select Module B | ③ DRC Results│
│                                                            │
│  ①/②: full search/filter (protocol, domain, taxonomy)      │
│      + "Suggested matches" rail once the other slot is set │
│  ③: connection list + findings + parameter/capacity tables  │
└────────────────────────────────────────────────────────────┘
```

- Selecting a part in step ① fills Slot A and auto-advances to step ②, where the
  results are pre-ranked by compatibility with A (engine's `findCompatiblePairs`
  against the whole library manifest = the suggestion engine).
- Once both slots are filled, DRC runs instantly client-side and step ③ activates
  with a verdict badge; the slot rail draws the discovered edges between the two
  module cards (interface → harness → interface), the web translation of
  `renderPairAscii`'s funnel view.
- URL state: `/validate?a=arduino-nano&b=vl53l0x` — shareable/SEO-crawlable pairs.

### 3.2 Center connection visualization
Each discovered connection renders as an edge bundle between the two module cards:
interface chip (name + protocol badge + role) on each side, harness topology label
(wire/bus) in the middle, colored by state (ok / warning / error / inferred-`*`).
Clicking an edge expands the funnel detail: slots → leaves on each side, the Tier-1
slot↔slot crossings (sda↔sda…), mirroring the ASCII pair view. SVG lines between
laid-out DOM chips (no canvas lib needed for 2 nodes).

### 3.3 DRC results panel (step ③)
- **Verdict header**: COMPATIBLE / COMPATIBLE WITH WARNINGS / INCOMPATIBLE +
  counts (n connections, n warnings, n errors).
- **Per-connection cards**: findings grouped by check type — Compatibility,
  Parametric (show the actual ranges: `VCC 2.6–3.5 V ∩ 4.5–5.5 V = ∅`), Capacity
  (budget bar: 340 mA of 500 mA).
- **Unmatched interfaces** listed neutrally (not errors — just "no counterpart").
- Below results: "Try these instead" — suggestion cards from the library ranked by
  compatibility score, one click swaps the slot.

### 3.4 Implementation notes
- Client component page; engine + library manifest loaded statically. Instant DRC
  re-run on any slot change.
- Search: client-side over the manifest (Fuse.js or plain filter at ~15–200 parts);
  filters = domain, protocol, taxonomy, manufacturer.
- Empty/loading/error states per slot and per panel; graceful "0 connections
  found" state that still shows both modules' unmatched interfaces.

## 4. `/parts` — the Public Parts Library

Style target: **step.parts** — minimal, monochrome, dense card grid, obvious
download links, ~zero chrome.

- **`/parts` (index)**: search bar + filter toggle (domain, protocol, taxonomy),
  card grid: thumbnail, name, manufacturer/part number, protocol badges, domain
  icons. Count + pagination like step.parts ("1–100 of N"). Statically generated
  from the library manifest; ISR/regenerate on library publish.
- **`/parts/[id]` (detail)**, three zones:
  1. **Part + metadata**: thumbnail, name, manufacturer, part number, version,
     description, tags/taxonomy, purchase/datasheet links.
  2. **UHD information**: interfaces table (name, domain, protocol+role badges,
     slots/profiles, parameters with ranges), power domains, interface groups,
     constraints — rendered from the ModuleDef; plus a raw "View UHD JSON" toggle
     (the shareable artifact that markets the format itself).
  3. **Artifacts**: list from `ArtifactDef[]` — datasheet, STEP/3D, firmware,
     docs — each with type icon, source (hosted by us vs external link), download.
- **Cross-link**: every detail page has a primary "Validate against another part →"
  CTA → `/validate?a=<id>`; the validator links each slot card back to its
  `/parts/[id]` page.
- SEO: `generateStaticParams` over the manifest, per-part metadata/OG images,
  sitemap entries — free marketing surface for every part added.

## 5. Build order

1. `uhd`: export surface + `validatePair()` + capacity check + tests (§2.1–2.2)
2. `uhd`: `library/` seed parts + manifest build (§2.3)
3. Website: `/parts` index + detail (pure rendering of the manifest — no engine
   dependency, ships first)
4. Website: `/validate` wizard + connection viz + DRC panel
5. Later: ProtoPart→UHD importer to scale the library; node editor reuses the
   connection-viz component as its edge inspector.

## 6. Design

Mockups live in `design/visualizer.pen`: validator (selection state + results
state with the B8 shared-region pair scene), parts library (grid + detail), plus
the concept boards (vocabulary, A/B/C directions, B1–B8 iterations). The locked
visual contract is `docs/visualizer-spec.md`. Direction: blueprint-technical —
near-monochrome ink palette, IBM Plex Mono for identifiers/data, one accent for
state color (green/amber/red reserved exclusively for DRC verdicts), step.parts
density for the library.
