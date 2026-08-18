/**
 * STEPPERONLINE 17HS19-2004S1 — datasheet-honest part definition.
 *
 * Primary source: STEPPERONLINE 17HS19-2004S1 product page (datasheet)
 *   https://www.omc-stepperonline.com/nema-17-bipolar-59ncm-84oz-in-2a-42x48mm-4-wires-w-1m-cable-connector-17hs19-2004s1
 * audited via the ProtoPart definition (protoparts/stepperonline-17hs19-2004s1,
 * schema 1.4.0): NEMA 17 bipolar stepper, 59 N·cm holding torque, 1.8° step,
 * 2.0 A/phase, 4-wire with 1 m cable and 4-pin 2.54 mm female connector.
 * Nothing below is carried over from stepper-catalogue convention without
 * attribution to that audited source.
 *
 * Architecture notes honoured by this file:
 *   - Pin-honest like a schematic: the four motor leads are leaf interfaces.
 *     The source defines connector positions only by wire colour
 *     (A+=Black, A-=Green, B+=Red, B-=Blue), so the colour codes are the
 *     `pin` designators — no invented connector pin numbers.
 *   - Phase pairing: each winding (A+/A-, B+/B-) is an `all_of` interface
 *     group — a driver must connect each winding as a pair, never a single
 *     lead. The composed `bipolar_stepper_phases` interface spans all four
 *     leads with one default lead-colour profile (max_connections: 1).
 *   - Current-driven load: the phase coils are a floating power domain;
 *     the 2.8 V "rated voltage" is I×R at 2.0 A and 1.4 Ω. A chopper
 *     (current-limiting) driver is required — the coils must never be
 *     driven directly from a voltage source (source design rule).
 *   - Mechanical-domain content is carried faithfully: NEMA 17 front
 *     mounting face (31±0.2 mm square hole pattern, 4×M3 tapped), Ø5 mm × 24 mm D-cut
 *     output shaft (15 mm flat), 0.59 N·m holding torque, 1.8° step angle,
 *     42×42×48 mm frame, 390 g — as leaf + composed mechanical interfaces
 *     mirroring the source's resources/interfaces split.
 *   - Source design_rules / validation_requirements / usage_notes /
 *     warnings / compatibility_notes are preserved verbatim as module
 *     traits, and additionally woven into the interfaces they govern.
 */

import type {
  InterfaceDef,
  ModuleDef,
  TraitDef,
} from "../../src/types/index.js";
import type { Parameter } from "../../src/types/parameter.js";
import {
  defineModule,
  maxCurrentA,
  voltageRangeV,
} from "../../src/protocols/index.js";

// ---------------------------------------------------------------------------
// Electrical constants — ProtoPart `phase_coils` power domain + lead ratings
// ---------------------------------------------------------------------------

/** Rated coil voltage: "2.8 V is I×R at 2.0 A and 1.4 Ω" (power-domain description / usage notes). */
const COIL_NOMINAL_V = 2.8;
/** Phase-coil domain withstand range (power_domains.phase_coils.voltage_range_V). */
const COIL_RANGE_V: [number, number] = [0, 24];
/** Rated continuous phase current: lead current_rating 2000 mA source and sink; design rule "Limit phase current to ≤2.0 A." */
const RATED_PHASE_CURRENT_A = 2.0;
/** Coil resistance per phase: "Verify coil resistance ≈1.4 Ω/phase at 25 °C" (validation requirement). */
const COIL_RESISTANCE_OHM = 1.4;
/** Holding torque: 59 N·cm; "Confirm holding torque near 0.59 N·m at 2-phase energize" (validation requirement). */
const HOLDING_TORQUE_NM = 0.59;
/** Full step angle (part description: "1.8° step"). */
const STEP_ANGLE_DEG = 1.8;

/** Lead termination — every lead is a flying wire in the 1 m cable (resource connector_type: "wire"). */
const LEAD_TERMINATION_TRAIT: TraitDef = {
  type: "termination",
  params: {
    connector_type: "wire",
    cable: "1 m cable terminating in a 4-pin 2.54 mm female connector",
    note: "Verify mating header (source compatibility notes).",
    source: "ProtoPart stepperonline-17hs19-2004s1: electrical resources / compatibility_notes",
  },
};

// ---------------------------------------------------------------------------
// Phase leads — schematic-honest leaf interfaces, one per wire
// ---------------------------------------------------------------------------

interface StepperLeadSpec {
  /** Interface id, verbatim from the ProtoPart resource id. */
  id: string;
  /** Displayed name, verbatim ("Lead BLK (A+)", ...). */
  name: string;
  /** Wire colour code — the only connector-position designator the source defines. */
  colour: "BLK" | "GRN" | "RED" | "BLU";
  /** Verbatim function name (PHASE_A, PHASE_A_BAR, PHASE_B, PHASE_B_BAR). */
  functionName: string;
  /** Verbatim function description ("Phase A positive", ...). */
  functionDescription: string;
  /** Canonical capability tag for slot matching. */
  capability: string;
  winding: "A" | "B";
}

/** Build one motor lead from its audited resource row. */
function stepperLead(spec: StepperLeadSpec): InterfaceDef {
  const parameters: Parameter[] = [
    // Floating, current-driven winding: 2.8 V nominal (I×R), 0-24 V domain range.
    voltageRangeV(COIL_RANGE_V[0], COIL_RANGE_V[1], COIL_NOMINAL_V),
    maxCurrentA(RATED_PHASE_CURRENT_A),
  ];

  return {
    id: spec.id,
    name: spec.name,
    pin: spec.colour,
    domain: "electrical",
    exposed: true,
    default_active: true,
    // Source function: direction "bidirectional", signal_class "power" —
    // winding current alternates under the driver's H-bridge.
    protocols: [{ type: "power", roles: ["bidirectional"] }],
    capabilities: [spec.capability],
    parameters,
    traits: [
      {
        type: "stepper_phase_function",
        params: {
          function: spec.functionName,
          description: spec.functionDescription,
          direction: "bidirectional",
          signal_class: "power",
          source: "ProtoPart stepperonline-17hs19-2004s1, electrical resources",
        },
      },
      {
        type: "power_domain",
        params: {
          domain: "phase_coils",
          isolation_type: "non_isolated",
          ground_reference: "floating",
          note: "Per-phase DC winding. Current-driven; 2.8 V is I×R at 2.0 A and 1.4 Ω.",
        },
      },
      {
        type: "current_rating",
        params: {
          source_max_continuous_mA: 2000,
          sink_max_continuous_mA: 2000,
          source: "ProtoPart lead current_rating",
        },
      },
      {
        // Phase pairing is physical: one winding, two leads. A driver must
        // land both leads of the winding — a single lead is meaningless.
        type: "winding_pair",
        params: {
          winding: `Phase ${spec.winding}`,
          pair:
            spec.winding === "A"
              ? ["lead_black", "lead_green"]
              : ["lead_red", "lead_blue"],
        },
      },
      LEAD_TERMINATION_TRAIT,
    ],
  };
}

const phaseLeads: InterfaceDef[] = [
  stepperLead({
    id: "lead_black", name: "Lead BLK (A+)", colour: "BLK",
    functionName: "PHASE_A", functionDescription: "Phase A positive",
    capability: "phase_a", winding: "A",
  }),
  stepperLead({
    id: "lead_green", name: "Lead GRN (A-)", colour: "GRN",
    functionName: "PHASE_A_BAR", functionDescription: "Phase A negative",
    capability: "phase_a_bar", winding: "A",
  }),
  stepperLead({
    id: "lead_red", name: "Lead RED (B+)", colour: "RED",
    functionName: "PHASE_B", functionDescription: "Phase B positive",
    capability: "phase_b", winding: "B",
  }),
  stepperLead({
    id: "lead_blue", name: "Lead BLU (B-)", colour: "BLU",
    functionName: "PHASE_B_BAR", functionDescription: "Phase B negative",
    capability: "phase_b_bar", winding: "B",
  }),
];

// ---------------------------------------------------------------------------
// Composed drive interface — the connection a bipolar stepper driver makes
// ---------------------------------------------------------------------------

const bipolarStepperPhases: InterfaceDef = {
  id: "bipolar_stepper_phases",
  name: "Bipolar stepper, 2-phase",
  domain: "electrical",
  exposed: true,
  default_active: true,
  // Verbatim protocol from the audited definition: type
  // "bipolar_stepper_phases", role "motor" — pairs with a driver-side
  // interface presenting the driver role of the same protocol.
  protocols: [{ type: "bipolar_stepper_phases", roles: ["motor"] }],
  max_instances: 1, // constraints.max_connections: 1
  parameters: [
    { id: "rated_phase_current", name: "Rated phase current (continuous)", unit: "A", value: RATED_PHASE_CURRENT_A },
    { id: "coil_resistance", name: "Coil resistance per phase (≈, 25 °C)", unit: "Ω", value: COIL_RESISTANCE_OHM },
    { id: "rated_coil_voltage", name: "Rated coil voltage (I×R)", unit: "V", value: COIL_NOMINAL_V },
    // Datasheet: "INDUCTANCE/PHASE(mH)@1KHz 3.00±20%" (17HS19-2004S1 Full Datasheet,
    // omc-stepperonline.com/download/17HS19-2004S1.pdf) — added during datasheet audit.
    { id: "coil_inductance", name: "Coil inductance per phase (±20%, 1 kHz)", unit: "mH", value: 3.0 },
    // Electrical-domain figure: power_consumption_mW = 11200 (both phases at rating).
    { id: "power_consumption", name: "Power consumption", unit: "W", value: 11.2 },
  ],
  slots: [
    { id: "phase_a", label: "PHASE_A (A+)", required: true, match: { protocol: "power", role: "bidirectional", capability: "phase_a" } },
    { id: "phase_a_bar", label: "PHASE_A_BAR (A-)", required: true, match: { protocol: "power", role: "bidirectional", capability: "phase_a_bar" } },
    { id: "phase_b", label: "PHASE_B (B+)", required: true, match: { protocol: "power", role: "bidirectional", capability: "phase_b" } },
    { id: "phase_b_bar", label: "PHASE_B_BAR (B-)", required: true, match: { protocol: "power", role: "bidirectional", capability: "phase_b_bar" } },
  ],
  profiles: [
    {
      id: "stepper_leads",
      label: "4-wire leads: A+=Black, A-=Green, B+=Red, B-=Blue",
      default_active: true,
      bindings: {
        phase_a: "lead_black",
        phase_a_bar: "lead_green",
        phase_b: "lead_red",
        phase_b_bar: "lead_blue",
      },
    },
  ],
  traits: [
    {
      type: "wiring_sequence",
      params: {
        mapping: "A+=Black, A-=Green, B+=Red, B-=Blue",
        note: "Connect to a bipolar stepper driver.",
        source: "ProtoPart interface description / design rule 'Observe wiring sequence'",
      },
    },
    {
      type: "drive_requirement",
      params: {
        driver: "Chopper (current-limiting) bipolar stepper driver",
        rule: "Use a chopper driver; do not drive coils directly from a voltage source. Limit phase current to ≤2.0 A.",
        typical_bus: "Rated coil voltage is 2.8 V (I×R). Typical driver bus 12-36 V with current limiting.",
        source: "ProtoPart design_rules / usage_notes",
      },
    },
    {
      type: "connection_constraint",
      params: {
        max_connections: 1,
        requires_connector_type: "wire",
        source: "ProtoPart bipolar_stepper_phases constraints",
      },
    },
    {
      type: "duty_warning",
      params: {
        warning: "Prolonged stall at rated current can overheat the motor.",
        source: "ProtoPart warnings",
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Mechanical — NEMA 17 mounting face and D-cut output shaft
// ---------------------------------------------------------------------------

/** Leaf: the physical front mounting face (ProtoPart mechanical resource `front_face_mount`). */
const frontFaceMount: InterfaceDef = {
  id: "front_face_mount",
  name: "Front face mount",
  domain: "mechanical",
  exposed: true,
  default_active: true,
  protocols: [{ type: "mechanical", roles: ["bidirectional"] }],
  capabilities: ["mechanical_mount"],
  parameters: [
    // Datasheet dimension drawing: 31±0.2 mm is the hole-to-hole spacing of the
    // square NEMA 17 pattern (two "31±0.2" dims), not a bolt-circle diameter.
    // Id kept stable for consumers; corrected during datasheet audit
    // (17HS19-2004S1_Dimension-2.svg, omc-stepperonline.com).
    { id: "bolt_circle_diameter", name: "Mounting hole spacing (square pattern)", unit: "mm", value: 31, tolerance: { type: "absolute", value: 0.2 } },
    // mount_holes: front, diam 3 mm (M3 nominal).
    { id: "mount_hole_diameter", name: "Mount hole diameter", unit: "mm", value: 3 },
  ],
  traits: [
    {
      type: "mechanical_function",
      params: {
        function: "MECHANICAL_MOUNT",
        // Datasheet drawing: "4-M3 DEPTH 4.5MIN" — tapped holes in the front face,
        // not clearance holes (corrected during datasheet audit).
        description: "NEMA 17 4×M3 tapped (4.5 mm min depth)",
        direction: "bidirectional",
        signal_class: "mechanical_drive",
        source: "ProtoPart mechanical resources",
      },
    },
    // Datasheet drawing: "4-M3 DEPTH 4.5MIN" (tapped, blind) on a 31±0.2 mm square.
    { type: "hole_pattern", params: { count: 4, thread: "M3 tapped, 4.5 mm min depth", location: "front" } },
    { type: "termination", params: { connector_type: "through_hole" } },
  ],
};

/** Leaf: the physical output shaft (ProtoPart mechanical resource `output_shaft`). */
const outputShaft: InterfaceDef = {
  id: "output_shaft",
  name: "D-cut output shaft",
  domain: "mechanical",
  exposed: true,
  default_active: true,
  // Source function SHAFT_OUTPUT: direction "source" — torque flows out.
  protocols: [{ type: "mechanical", roles: ["source"] }],
  capabilities: ["shaft_output"],
  parameters: [
    // "Ø5 mm shaft, 24 mm length, D-flat 15 mm."
    { id: "shaft_diameter", name: "Shaft diameter", unit: "mm", value: 5 },
    { id: "shaft_length", name: "Shaft length", unit: "mm", value: 24 },
    { id: "d_flat_length", name: "D-flat length", unit: "mm", value: 15 },
  ],
  traits: [
    {
      type: "mechanical_function",
      params: {
        function: "SHAFT_OUTPUT",
        description: "5 mm D-shaft",
        direction: "source",
        signal_class: "mechanical_drive",
        source: "ProtoPart mechanical resources",
      },
    },
    { type: "termination", params: { connector_type: "custom" } },
  ],
};

/** Composed: the NEMA 17 front mount a bracket/frame connects to. */
const mountingInterface: InterfaceDef = {
  id: "mounting_interface",
  name: "NEMA 17 front mount",
  domain: "mechanical",
  exposed: true,
  default_active: true,
  protocols: [{ type: "mechanical_connection", roles: ["mounting_point"] }],
  max_instances: 1,
  slots: [
    { id: "mount", required: true, match: { protocol: "mechanical", role: "bidirectional", capability: "mechanical_mount" } },
  ],
  profiles: [
    {
      id: "front_face",
      label: "Front face (31±0.2 mm square hole pattern, 4×M3 tapped)",
      default_active: true,
      bindings: { mount: "front_face_mount" },
    },
  ],
  traits: [
    { type: "assembly_requirement", params: { note: "Use four M3 screws.", source: "ProtoPart mounting_interface description" } },
  ],
};

/** Composed: the torque output a coupler/gear connects to. */
const shaftInterface: InterfaceDef = {
  id: "shaft_interface",
  name: "Shaft output",
  domain: "mechanical",
  exposed: true,
  default_active: true,
  protocols: [{ type: "mechanical_connection", roles: ["custom"] }],
  max_instances: 1,
  parameters: [
    { id: "holding_torque", name: "Holding torque (2-phase energize)", unit: "Nm", value: HOLDING_TORQUE_NM },
    { id: "step_angle", name: "Full step angle", unit: "deg", value: STEP_ANGLE_DEG },
  ],
  slots: [
    { id: "shaft", required: true, match: { protocol: "mechanical", role: "source", capability: "shaft_output" } },
  ],
  profiles: [
    {
      id: "d_cut_shaft",
      label: "Ø5 mm × 24 mm D-cut shaft (15 mm flat)",
      default_active: true,
      bindings: { shaft: "output_shaft" },
    },
  ],
  traits: [
    {
      type: "coupling_requirement",
      params: {
        note: "Couple with 5 mm bore coupler or gear.",
        source: "ProtoPart shaft_interface description",
      },
    },
    {
      type: "load_limits",
      params: {
        warning: "Avoid excessive axial/radial loads; use proper couplers.",
        validation: "Check runout and coupler alignment to avoid bearing load.",
        source: "ProtoPart warnings / validation_requirements",
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

export const STEPPERONLINE_17HS19_2004S1: ModuleDef = defineModule({
  id: "stepperonline-17hs19-2004s1",
  name: "STEPPERONLINE 17HS19-2004S1",
  version: "1.0.0",
  manufacturer: "STEPPERONLINE",
  part_number: "17HS19-2004S1",
  description:
    "NEMA 17 bipolar stepper motor, 59 N·cm holding torque, 1.8° step, 2.0 A/phase, 4-wire with 1 m cable and 4-pin connector.",
  tags: ["nema17", "stepper", "bipolar", "59Ncm", "2A", "48mm", "4-wire", "1m-cable"],
  categories: ["actuator.motor.stepper"],

  interfaces: [
    // The four motor leads — schematic-honest, colour-designated.
    ...phaseLeads,

    // The drive connection a bipolar stepper driver makes (all four leads).
    bipolarStepperPhases,

    // Mechanical: mounting face and output shaft (leaf + composed).
    frontFaceMount,
    outputShaft,
    mountingInterface,
    shaftInterface,
  ],

  interfaceGroups: [
    {
      id: "phase_a_winding",
      label: "Phase A winding (A+/A- — connect as a pair)",
      members: ["lead_black", "lead_green"],
      policy: "all_of",
    },
    {
      id: "phase_b_winding",
      label: "Phase B winding (B+/B- — connect as a pair)",
      members: ["lead_red", "lead_blue"],
      policy: "all_of",
    },
    {
      id: "required_motor_leads",
      label: "Required Motor Leads (4-wire bipolar)",
      members: ["lead_black", "lead_green", "lead_red", "lead_blue"],
      policy: "all_of",
    },
  ],

  requirements: [
    {
      type: "interface",
      description:
        "Connect to a bipolar stepper driver. Use a chopper (current-limiting) driver; do not drive the coils directly from a voltage source. Rated coil voltage is 2.8 V (I×R); typical driver bus 12-36 V with current limiting.",
      interface_protocol: "bipolar_stepper_phases",
    },
    {
      type: "power",
      description:
        "Driver must limit phase current to ≤2.0 A continuous per winding (design rule). Phase-coil domain withstand range 0-24 V; the coils are floating and non-isolated.",
      current_mA: 2000,
    },
  ],

  domains: [
    {
      domain: "electrical",
      power_domains: [
        {
          id: "phase_coils",
          name: "Stepper Phase Coils",
          nominal_voltage_V: COIL_NOMINAL_V,
          voltage_range_V: COIL_RANGE_V,
        },
      ],
      metadata: {
        pin_count: 4,
        power_consumption_mW: 11200,
        package_type: "Motor with 1 m cable and 4-pin connector",
        phase_coils_domain: {
          isolation_type: "non_isolated",
          ground_reference: "floating",
          description: "Per-phase DC winding. Current-driven; 2.8 V is I×R at 2.0 A and 1.4 Ω.",
        },
        source: "ProtoPart stepperonline-17hs19-2004s1, electrical domain",
      },
    },
    {
      domain: "mechanical",
      dimensions_mm: { length: 48, width: 42, height: 42 },
      weight_g: 390,
      metadata: {
        package_type: "NEMA 17 frame",
        mount_holes: [{ location: "front", diam_mm: 3 }],
        source: "ProtoPart stepperonline-17hs19-2004s1, mechanical domain",
      },
    },
  ],

  traits: [
    {
      type: "design_rules",
      params: {
        rules: [
          "Limit phase current to ≤2.0 A.",
          "Use a chopper driver; do not drive coils directly from a voltage source.",
          "Observe wiring sequence: A+=Black, A-=Green, B+=Red, B-=Blue.",
        ],
        source: "ProtoPart design_rules (verbatim)",
      },
    },
    {
      type: "validation_requirements",
      params: {
        checks: [
          "Verify coil resistance ≈1.4 Ω/phase at 25 °C.",
          "Confirm holding torque near 0.59 N·m at 2-phase energize.",
          "Check runout and coupler alignment to avoid bearing load.",
        ],
        source: "ProtoPart validation_requirements (verbatim)",
      },
    },
    {
      type: "usage_notes",
      params: {
        note: "Rated coil voltage is 2.8 V (I×R). Typical driver bus 12-36 V with current limiting.",
        source: "ProtoPart usage_notes (verbatim)",
      },
    },
    {
      type: "compatibility_notes",
      params: {
        note: "Bipolar 4-wire. 1 m cable terminates in 4-pin 2.54 mm female connector; verify mating header.",
        source: "ProtoPart compatibility_notes (verbatim)",
      },
    },
    {
      type: "warnings",
      params: {
        warnings: [
          "Prolonged stall at rated current can overheat the motor.",
          "Avoid excessive axial/radial loads; use proper couplers.",
        ],
        source: "ProtoPart warnings (verbatim)",
      },
    },
    {
      type: "application_examples",
      params: {
        examples: ["3D printer axes", "Small CNC stages", "Robotics actuators"],
        source: "ProtoPart application_examples (verbatim)",
      },
    },
    {
      // ProtoPart previewArtifactId — preserved so the preview selection survives the audit.
      type: "preview_artifact",
      params: { artifactId: "art_thumbnail" },
    },
  ],

  artifacts: [
    {
      id: "art_datasheet",
      name: "STEPPERONLINE 17HS19-2004S1 Product Page (datasheet)",
      type: "datasheet",
      url: "https://www.omc-stepperonline.com/nema-17-bipolar-59ncm-84oz-in-2a-42x48mm-4-wires-w-1m-cable-connector-17hs19-2004s1",
    },
    {
      id: "art_thumbnail",
      name: "Thumbnail",
      type: "custom",
      filePath: "./ProtoPart/protoparts/stepperonline-17hs19-2004s1/thumbnail.png",
      mimeType: "image/png",
      tags: ["image", "thumbnail"],
    },
  ],

  geometry: {
    xScale: 1,
    yScale: 1,
    outline: { preset: "rectangle" },
  },
});
