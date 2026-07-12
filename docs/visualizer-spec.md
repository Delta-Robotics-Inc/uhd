# UHD Pair Visualizer — View Specification

Status: draft v1 · Source designs: `design/visualizer.pen` (boards: Vocabulary, B5, B6, B7a–c, B8, B3, B4, screen "Validate — Results")
Companion: `docs/drc-implementation-plan.md` (engine work this spec depends on), `docs/drc-spec.md` (tier/state model).

This document is the **visual contract** for the 2-module validator at protoboard.ai/validate.
It locks the decisions made across design iterations so engine and UI work can proceed
against a stable target. Rationale lives on the Pencil canvas; rules live here.

---

## 1. Canonical renderings

Three renderings of the same data, by altitude of use:

| Rendering | Canvas board | Role |
|---|---|---|
| **Depth rails** | B6 | Browsing / collapsed state. Outline tree per module, mirrored, ports on interior edges. Scales to 40-pin modules. |
| **Shared regions** | B8 (canonical), B1/B7a precursors | Connected / expanded state. THE hero rendering — used on the validate results screen. |
| **Harness table** | Concept A | Export only ("build sheet"): WireViz-style connector tables with wire colors. Not an interactive surface. |

Rule: rails at rest, regions on focus. A connected interface renders as a shared region;
everything else renders as a rail/census row. Expanding and collapsing transitions between
the two without reordering rows.

## 2. Core principle: connection as shared territory

A match at level N does not draw a line between two interfaces — **it merges them into a
single region co-owned by both modules.**

- The matched interface renders as **one bordered, tinted box** that starts inside module
  A's card, crosses the lane, and ends inside module B's card.
- The region border is the harness jacket. The pairing pill (name · topology · tier ·
  state) sits centered on the region's top edge. Role labels sit in the region's top
  corners (`i2c · master` left, `i2c · slave · 0x29` right).
- **Match altitude is read from where the box begins on each side.** A top-level match
  starts at the card surface; a sub-interface match starts nested inside its parent's
  region. Altitude may differ per side (sub ↔ top is legal and labeled in the pill).
- Structure not participating in the match stays behind in the parent region (with its
  own port), visibly *not* part of the shared territory.

### 2.1 Conductors (child wires)

- Every linked leaf pair gets its own wire: a **straight horizontal dot→dot line** from
  the leaf's port on side A to the leaf's port on side B, at an invariant row height.
- **Row order is mirrored per pair** so wires never bend: A's `tx` row is placed at the
  same height as B's `rx` row. The layout engine (not the user) owns this ordering.
- Each wire carries: leaf chip + physical pin ref at both ends (`tx · D16` … `rx · pin 3`),
  a centered label chip (`tx → rx`, direction arrows honored), and state color.
- Wire line weight: parent pairing spine 3–4 px; conductor wires 1.5–2 px.

### 2.2 Region nesting (composition)

Depth is encoded by fill, not indentation (board B1):

| Level | Fill token | Example |
|---|---|---|
| L1 composed interface | `region-1` (#EDF1F7) | `actuator_port_1` |
| L2 sub-interface | `region-2` (#F8FAFD) | `uart`, `power_12v` |
| L3 leaf | white chip, `border-strong` outline | `tx`, `sda` |

Nesting is arbitrary-depth; fills alternate region-1/region-2 below L2. Shared regions
use the same tokens with the state color on the border.

## 3. Visual vocabulary (tier × state × port)

Tier and state are orthogonal and get orthogonal encodings (Vocabulary board).

### 3.1 Tier → line pattern + badge

| Tier | Confidence | Line | Extras |
|---|---|---|---|
| `protocol` | 1.0 | solid, full weight | — |
| `compositional` | 0.8 | solid + slot junction dot | — |
| `inferred` | 0.5 | dashed | ghost container (purple, `inferred` badge, `*name`, sparkle icon) |
| `manual` | 0.3 | dotted | lock icon |
| `none` | 0.0 | broken with ✕ | — |

### 3.2 State → color

| State | Color token |
|---|---|
| `VALID` | ok green #15803D |
| `VALID_INFERRED` | inferred purple #5B21B6 |
| `WARNING` | warn amber #B45309 |
| `CONFIGURATION_NEEDED` | amber socket + neutral chrome |
| `INCOMPATIBLE` | err red #B91C1C |
| `NOT_CONFIGURED` | neutral gray |

Green/amber/red/purple are **reserved exclusively** for DRC state. UI accent is blue.

### 3.3 Port states (B5/B6)

Every region at every depth has exactly one port on its interior edge:

| Glyph | Meaning |
|---|---|
| ● filled (state color) | connected at this level |
| ◎ donut | parent partially engaged (n of m subs); badge `partial · n/m` on header |
| ◉ hollow, green ring | compatible with the other module, unconnected — **click-to-connect affordance** |
| ○ hollow, gray ring | exists, no counterpart on the other module |
| tiny solid dot (7 px) | leaf linked inside a shared region (wire endpoint) |

Children under a connected parent do not re-pair and carry no independent pairing port —
their crossings are the wires inside the shared region.

## 4. Match-altitude rules (B5 Ex2, B6, B8)

1. The engine pairs **top-down** and connects at the **highest level both sides declare**.
   One pairing per match, attached to the exact region that matched (a region *path*, not
   an interface id).
2. When only a child matches, the shared region begins inside the parent's territory; the
   parent port becomes a donut and reports `n of m subs engaged`.
3. Children of a connected parent don't re-pair; their conductor crossings render as
   wires inside the shared region.
4. Unengaged children keep live hollow ports and can still pair — including with a
   *third* module via split fulfillment (§6.4).
5. Altitude asymmetry is legal (`sub ↔ top`); the pill labels both sides' altitude and
   tier/parametric checks evaluate on the matched pair only.

## 5. Module panel rules

### 5.1 Census — everything is shown

All interfaces of both modules are always represented (B5): connected (shared regions),
compatible-unconnected (◉ rows), and no-counterpart (○ rows, muted fill). Census rows sit
below the shared regions, outside any territory, under an `UNCONNECTED` caption. Reasons
render inline (`∅ range vs power_12v`, `compatible: d3`).

### 5.2 Two-column PCB-symbol layout (B5)

At high interface counts, each card splits into two columns like a schematic symbol:
interior columns reserved for connectable/connected interfaces, exterior columns for the
rest, both populated evenly. Card header always shows totals
(`9 interfaces · 3 connected · 1 compatible`). At low counts (≤ ~6/side) a single column
is fine — shared regions already dominate the space.

### 5.3 Depth rails (B6) — collapsed state

Outline tree with per-level rails; rails turn state-green along engaged branches only.
Collapsed interfaces still show `protocol · role` + availability. Rows engaged in the
current pair carry the region-1 tint (region fill = selection signal, not decoration).

## 6. Harness-lane features (B3/B4 vignettes — required, not optional)

1. **Multi-drop buses**: bus spine with tap points; extra endpoints hang as drops with
   their own state dot + address chip; `+ add drop · N addresses free` affordance.
2. **Capacity bars**: aggregated draw vs supply rendered on the band
   (`340 / 500 mA`, red when over), i2c address usage, instance counts.
3. **Unresolved slots**: required slot with no counterpart = amber empty socket `?` with
   interrupted conductor → `CONFIGURATION_NEEDED`; `assign leaf…` opens manual link flow.
4. **Split fulfillment**: one composed interface fed by several modules. Each slot carries
   a provenance chip (`arm-controller.d9 · pwm`); missing sources render the socket +
   `needs power · source` and suggest library parts. Pair view admits **ghost third-party
   modules** for context.
5. **Connector glyphs**: mated ○—○ pair with `connector_type` chip on the conductor;
   ecosystem-locked connectors render the refusal in red (`✕ ecosystem lock: dynamixel`).
6. **Internal bridges**: expandable interior lane on a card showing
   `external iface → can_bridge (regulator/shifter) → internal rail`. Parametric results
   must state when they evaluated a **bridged** range (band shows `bridged 2.6–5.5 V`).
7. **Claimed leaves**: grayed + lock + claimant name (`a4 · in use · Sensor I2C bus`).
8. **one_of groups**: bracketed radio group; unselected members disabled with reason.
   Compatible alternatives render as **dashed potential bands** (`3v3 ↔ vin ·
   alternative · one_of with 5v`).

## 7. Screen composition (validate results — screen "Validate — Results")

Top-to-bottom: pair scene (B8) → step tabs (① Select A ② Select B ③ DRC Results) →
verdict banner → per-connection DRC cards (Concept C's stages: tier 2 pairing /
tier 1 slot table / tier 0 conductors+parameters, with confidence meter and
accept-&-lock actions) → unmatched detail → library suggestions.
The census in the pair scene and the DRC cards must derive from the same result object.

## 8. Interaction model

| Action | Result |
|---|---|
| click ◉ port / dashed potential band | create connection (engine re-runs, band solidifies) |
| click band / pill | expand DRC detail card; hover highlights the full territory (both ends + band) |
| accept inferred (`Accept & lock wiring`) | converts sub-links to locked `manualLinks`; tier → manual, user-owned |
| `assign leaf…` on socket | manual link picker filtered to eligible leaves |
| `add drop` on bus | slot-B-style picker filtered to compatible bus devices |
| change module in slot | full re-validate; URL updates (`?a=…&b=…`) |

## 9. Layout-engine requirements (web implementation)

B8's continuity is not achievable with pure flexbox:

- Module cards and their internal rows render as DOM; each leaf/port registers a
  **measured y-coordinate** (ResizeObserver + layout pass).
- Shared regions and wires render in an **absolutely-positioned SVG overlay** spanning
  both cards; region rects and wire lines are computed from measured port positions.
- A **row-pairing solver** orders each side's leaf rows so paired leaves share a row
  index (mirrored ordering). Unpairable extras append below. Parent regions size to the
  union of their children's measured extents.
- Bands stack vertically in match order (stable sort: state severity, then name);
  potential (dashed) bands render only for the top-k suggestions to avoid noise.

## 10. Data contract (consumed from the engine)

The view renders exclusively from one serializable object (shape detailed in the
implementation plan): `PairValidationResult { modules, connections[], census[],
potentials[], capacity[], diagnostics[] }`, where each connection carries
`regionPathA/B` (altitude), `subLinks[]` (with provenance + method + locked),
`engagement { engaged, total }` per ancestor, `tier`, `state`, `confidence`,
and per-check findings. No view-side matching logic.
