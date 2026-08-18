/**
 * REV Robotics NEO Vortex Brushless Motor (REV-21-1652) — ProtoPart-honest
 * part definition.
 *
 * Primary source: ProtoPart definition
 *   ProtoPart/protoparts/rev-21-1652-neo-vortex-brushless-motor/definition.json
 *   (schema 1.4.0, part version 0.2.0) — the audited source of truth.
 *   - metadata: "High-power sensored brushless motor with dock interface and
 *     1/2 in hex through-bore rotor."
 *   - electrical domain: three phase dock contacts + one JST-PH 6 encoder
 *     connector; one power domain ("Sensor 5V": 5 V nominal, 4.5-5.5 V,
 *     200 mA max).
 *   - mechanical domain: 4x threaded mounting holes and the 1/2 in hex
 *     through-bore rotor output.
 * Secondary source: REV Robotics product page
 *   https://www.revrobotics.com/rev-21-1652/ (the ProtoPart `datasheet_url`).
 *
 * Architecture notes honoured by this file:
 *   - Contact-honest like a schematic: every ProtoPart electrical/mechanical
 *     `resource` is a leaf interface carrying its verbatim description in a
 *     `vortex_contact_functions` trait; every ProtoPart `interface` is a
 *     composed interface whose slots bind those leaves through a fixed
 *     default profile (there is exactly one physical binding for each).
 *   - The three phase contacts are one indivisible set: the dock interface
 *     requires all of phase_a/phase_b/phase_c, mirrored by an all_of
 *     interface group. A sensored controller additionally consumes the
 *     6-pin sensor bundle — captured as the `controller_docking_set` group
 *     and a `sensored_motor` trait, wording taken from the JSON only.
 *   - ProtoPart `constraints` (max_connections, requires_connector_type)
 *     map to `max_instances` plus `connection_constraint` traits;
 *     `connector_type` on each resource is preserved on its leaf trait.
 *   - Performance data (absent from the audited JSON) has been verified
 *     against REV Robotics official sources and added as a module-level
 *     `motor_performance` trait: 12 V nominal, 565 Kv, 6784 RPM free speed,
 *     3.6 A free running current, 211 A stall current, 3.6 Nm stall torque,
 *     640 W peak power, 375 W typical output at 40 A. Sources:
 *     https://www.revrobotics.com/rev-21-1652/ and
 *     https://docs.revrobotics.com/brushless/neo/vortex. The source JSON
 *     still carries no phase-contact electrical ratings, no mass, no body
 *     dimensions, and no thermal domain — those remain unmodelled.
 *   - Former source-internal discrepancy RESOLVED against REV docs: the two
 *     texts describe two different features, both real. "#10-32 threaded
 *     mounting hole (2 in bolt circle)" is the motor MOUNTING pattern (REV
 *     specs: "#10-32 threaded holes on a 2in bolt circle"). "4x M3 x 25 mm
 *     socket head cap screws" are the DOCKING hardware that secure a
 *     SPARK Flex or NEO Vortex Solo Adapter to the motor (REV: "M3 SHCS x
 *     25 mm"; ideal torque 11.5 ±0.9 in-lb / 1.3 ±0.1 Nm per
 *     https://docs.revrobotics.com/brushless/neo/vortex/solo-adapter).
 *     The face_mount interface now carries the #10-32 pattern; the M3
 *     hardware is recorded as docking metadata.
 *   - The JSON's own `warnings` (protopart-whitelist gaps for `phase_c` and
 *     `encoder_index`) are preserved as a module-level trait.
 */

import type {
  InterfaceDef,
  ModuleDef,
  TraitDef,
} from "../../src/types/index.js";
import { defineModule } from "../../src/protocols/index.js";

// ---------------------------------------------------------------------------
// Source citation shared by the verbatim-description traits
// ---------------------------------------------------------------------------

const PROTOPART_SOURCE =
  "ProtoPart rev-21-1652-neo-vortex-brushless-motor definition.json (schema 1.4.0, v0.2.0)";

/**
 * Verbatim ProtoPart resource metadata for one leaf contact — the
 * electromechanical analogue of the gold standard's `esp32_pin_functions`
 * trait: display/source data separated from the canonical capability tags
 * the matching engine needs.
 */
function contactFunctions(functions: string[], description: string): TraitDef {
  return {
    type: "vortex_contact_functions",
    params: {
      source: PROTOPART_SOURCE,
      functions: functions.map((name) => ({ name })),
      description,
    },
  };
}

// ---------------------------------------------------------------------------
// Electrical leaf contacts — ProtoPart electrical `resources`
// ---------------------------------------------------------------------------
// No power/signal builder fits here: the JSON declares no voltage, current,
// or signal-class data for these contacts (only `connector_type` and a
// custom/peer protocol on the composed interfaces), so the leaves are
// hand-rolled with exactly what the source states.

/** One motor phase power contact in the dock interface. */
function phaseContact(letter: "a" | "b" | "c"): InterfaceDef {
  const upper = letter.toUpperCase();
  return {
    id: `phase_${letter}`,
    name: `Phase ${upper} dock contact`,
    domain: "electrical",
    exposed: true,
    default_active: true,
    protocols: [{ type: "custom", roles: ["peer"] }],
    capabilities: [`phase_${letter}`],
    traits: [
      contactFunctions(
        [`phase_${letter}`],
        `Motor phase ${upper} power contact in the dock interface.`,
      ),
      { type: "connector", params: { connector_type: "dock_contact" } },
    ],
    // The rotor is the motor's mechanical output; phase power entering the
    // dock leaves the part as shaft motion at the 1/2 in hex through-bore.
    bridgesTo: ["rotor_hex_bore"],
  };
}

const phaseContacts: InterfaceDef[] = [
  phaseContact("a"),
  phaseContact("b"),
  phaseContact("c"),
];

/** The 6-pin JST-PH sensor connector — ProtoPart resource `jst_encoder_connector`. */
const jstEncoderConnector: InterfaceDef = {
  id: "jst_encoder_connector",
  name: "JST-PH 6 encoder connector",
  domain: "electrical",
  exposed: true,
  default_active: true,
  protocols: [{ type: "custom", roles: ["peer"] }],
  capabilities: ["encoder_connector"],
  traits: [
    contactFunctions(["encoder_connector"], "JST-PH 6 encoder connector."),
    { type: "connector", params: { connector_type: "jst_ph_6" } },
    {
      // "Sensor 5V" is the only power domain the ProtoPart electrical domain
      // declares; the composed encoder interface's description lists 5V/GND
      // among the six positions of this connector.
      type: "power_domain",
      params: {
        domain: "sensor_5v",
        note: "'Sensor 5V' power domain (5 V nominal, 4.5-5.5 V, 200 mA max) per the ProtoPart electrical domain; the connector carries 5V/GND alongside the sensor signals.",
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Electrical composed interfaces — ProtoPart electrical `interfaces`
// ---------------------------------------------------------------------------

/**
 * ProtoPart `bldc_phase_dock`: requires phase_a + phase_b + phase_c (count 1
 * each); constraints max_connections: 1, requires_connector_type: "dock_contact".
 */
const bldcPhaseDock: InterfaceDef = {
  id: "bldc_phase_dock",
  name: "Brushless phase dock",
  domain: "electrical",
  exposed: true,
  default_active: true,
  protocols: [{ type: "custom", roles: ["peer"] }],
  slots: [
    { id: "phase_a", required: true, match: { capability: "phase_a" } },
    { id: "phase_b", required: true, match: { capability: "phase_b" } },
    { id: "phase_c", required: true, match: { capability: "phase_c" } },
  ],
  profiles: [
    {
      id: "dock_contacts",
      label: "Phase A/B/C dock contacts (fixed)",
      default_active: true,
      bindings: { phase_a: "phase_a", phase_b: "phase_b", phase_c: "phase_c" },
    },
  ],
  max_instances: 1, // ProtoPart constraints.max_connections: 1
  traits: [
    {
      type: "interface_description",
      params: {
        source: PROTOPART_SOURCE,
        description:
          "3-phase dock interface to a compatible motor controller (e.g., docked SPARK Flex).",
      },
    },
    {
      type: "connection_constraint",
      params: {
        max_connections: 1,
        requires_connector_type: "dock_contact",
        source: `${PROTOPART_SOURCE}, interface bldc_phase_dock constraints`,
      },
    },
    {
      // All three phases are one indivisible connection: the interface's
      // `requires` list demands each of phase_a/phase_b/phase_c at count 1.
      type: "indivisible_set",
      params: {
        members: ["phase_a", "phase_b", "phase_c"],
        note: "A motor controller must take all three phase contacts together — the dock interface requires one of each.",
      },
    },
  ],
  bridgesTo: ["rotor_hex_bore"],
};

/**
 * ProtoPart `encoder_connector`: requires the encoder_connector function
 * (count 1); constraints max_connections: 1, requires_connector_type: "jst_ph_6".
 */
const encoderConnector: InterfaceDef = {
  id: "encoder_connector",
  name: "JST-PH 6 encoder connector",
  domain: "electrical",
  exposed: true,
  default_active: true,
  protocols: [{ type: "custom", roles: ["peer"] }],
  slots: [
    { id: "connector", required: true, match: { capability: "encoder_connector" } },
  ],
  profiles: [
    {
      id: "jst_ph_6",
      label: "JST-PH 6 connector (fixed)",
      default_active: true,
      bindings: { connector: "jst_encoder_connector" },
    },
  ],
  max_instances: 1, // ProtoPart constraints.max_connections: 1
  traits: [
    {
      type: "interface_description",
      params: {
        source: PROTOPART_SOURCE,
        description:
          "6-pin JST-PH sensor connector (via Solo Adapter): 5V/GND, quadrature A/B, index/C, temperature analog.",
      },
    },
    {
      type: "connection_constraint",
      params: {
        max_connections: 1,
        requires_connector_type: "jst_ph_6",
        source: `${PROTOPART_SOURCE}, interface encoder_connector constraints`,
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Mechanical leaves — ProtoPart mechanical `resources`
// ---------------------------------------------------------------------------

/**
 * ProtoPart resource `mounting_holes_x4`.
 * NOTE (audit, resolved): the description below is CONFIRMED against REV
 * specs — "#10-32 threaded holes on a 2in bolt circle" is the motor's
 * mounting pattern (https://www.revrobotics.com/rev-21-1652/). The
 * "4x M3 x 25 mm socket head cap screws" formerly attributed to face_mount
 * are the separate docking hardware for a SPARK Flex / Solo Adapter.
 */
const mountingHoles: InterfaceDef = {
  id: "mounting_holes_x4",
  name: "Mounting holes x4",
  domain: "mechanical",
  exposed: true,
  default_active: true,
  protocols: [{ type: "mechanical_connection", roles: ["mounting_point"] }],
  capabilities: ["mounting_holes_x4"],
  traits: [
    contactFunctions(
      ["mounting_holes_x4"],
      "#10-32 threaded mounting hole (2 in bolt circle).",
    ),
    { type: "connector", params: { connector_type: "threaded_hole" } },
  ],
};

/** ProtoPart resource `hex_bore` — the rotor output. */
const hexBore: InterfaceDef = {
  id: "hex_bore",
  name: "1/2 in hex rotor bore",
  domain: "mechanical",
  exposed: true,
  default_active: true,
  protocols: [{ type: "mechanical_connection", roles: ["custom"] }],
  capabilities: ["mechanical_drive"],
  traits: [
    contactFunctions(["mechanical_drive"], "1/2 in hex through-bore output interface."),
    { type: "connector", params: { connector_type: "custom" } },
  ],
};

// ---------------------------------------------------------------------------
// Mechanical composed interfaces — ProtoPart mechanical `interfaces`
// ---------------------------------------------------------------------------

/** ProtoPart `face_mount`: requires mounting_holes_x4 (count 1); max_instances 1. */
const faceMount: InterfaceDef = {
  id: "face_mount",
  name: "Face mount",
  domain: "mechanical",
  exposed: true,
  default_active: true,
  protocols: [{ type: "mechanical_connection", roles: ["mounting_point"] }],
  slots: [
    { id: "holes", required: true, match: { capability: "mounting_holes_x4" } },
  ],
  profiles: [
    {
      id: "face_mount_holes",
      label: "4x mounting holes (fixed)",
      default_active: true,
      bindings: { holes: "mounting_holes_x4" },
    },
  ],
  max_instances: 1,
  traits: [
    {
      type: "assembly_requirement",
      params: {
        source:
          "REV NEO Vortex specifications (https://www.revrobotics.com/rev-21-1652/); docking hardware per https://docs.revrobotics.com/brushless/neo/vortex/solo-adapter",
        note: "Mounting pattern: 4x #10-32 threaded holes on a 2 in bolt circle (motor mounting). The 4x M3 x 25 mm socket head cap screws are NOT mounting hardware — they are the docking screws that secure a SPARK Flex or NEO Vortex Solo Adapter to the motor (ideal torque 11.5 ±0.9 in-lb / 1.3 ±0.1 Nm; do not run the motor without them installed).",
      },
    },
  ],
};

/** ProtoPart `rotor_hex_bore`: requires mechanical_drive (count 1); max_instances 1. */
const rotorHexBore: InterfaceDef = {
  id: "rotor_hex_bore",
  name: "1/2 in hex rotor bore",
  domain: "mechanical",
  exposed: true,
  default_active: true,
  protocols: [{ type: "mechanical_connection", roles: ["custom"] }],
  slots: [
    { id: "bore", required: true, match: { capability: "mechanical_drive" } },
  ],
  profiles: [
    {
      id: "rotor_bore",
      label: "1/2 in hex through-bore (fixed)",
      default_active: true,
      bindings: { bore: "hex_bore" },
    },
  ],
  max_instances: 1,
  traits: [
    {
      type: "interface_description",
      params: {
        source: PROTOPART_SOURCE,
        description: "Output rotor interface: 1/2 in hex through-bore.",
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

export const REV_21_1652_NEO_VORTEX: ModuleDef = defineModule({
  id: "rev-21-1652-neo-vortex-brushless-motor",
  name: "NEO Vortex Brushless Motor",
  version: "0.2.0",
  manufacturer: "REV Robotics",
  part_number: "REV-21-1652",
  description:
    "High-power sensored brushless motor with dock interface and 1/2 in hex through-bore rotor. Three-phase dock contacts mate a compatible motor controller (e.g., docked SPARK Flex); a 6-pin JST-PH connector (via Solo Adapter) carries 5V/GND, quadrature A/B, index/C, and temperature analog.",
  tags: ["brushless", "bldc", "sensored", "frc", "rev-ion", "motor"],
  categories: ["motor"], // ProtoPart metadata.type: "motor" (no taxonomy field in source)

  interfaces: [
    // Electrical leaf contacts — ProtoPart resources, in source order.
    ...phaseContacts,
    jstEncoderConnector,

    // Electrical composed interfaces.
    bldcPhaseDock,
    encoderConnector,

    // Mechanical leaves — ProtoPart resources.
    mountingHoles,
    hexBore,

    // Mechanical composed interfaces.
    faceMount,
    rotorHexBore,
  ],

  interfaceGroups: [
    {
      id: "bldc_phase_contacts",
      label: "Phase Dock Contacts (one indivisible 3-phase set)",
      members: ["phase_a", "phase_b", "phase_c"],
      policy: "all_of",
    },
    {
      // A sensored controller consumes the phase set and the sensor bundle
      // together: the part is described as a sensored brushless motor, and
      // the encoder connector is its commutation/telemetry feedback path.
      id: "controller_docking_set",
      label: "Motor Controller Connections (phases + sensor feedback)",
      members: ["bldc_phase_dock", "encoder_connector"],
      policy: "all_of",
    },
  ],

  requirements: [
    {
      type: "interface",
      description:
        "Drive requires a compatible 3-phase motor controller on the dock interface (e.g., docked SPARK Flex) taking all three phase contacts together.",
      interface_protocol: "custom",
    },
    {
      type: "power",
      description:
        "Sensor 5V supply for the encoder connector: 5 V nominal (4.5-5.5 V), 200 mA max, per the ProtoPart 'Sensor 5V' power domain.",
      voltage_V: [4.5, 5.5],
      current_mA: 200,
    },
  ],

  domains: [
    {
      domain: "electrical",
      power_domains: [
        {
          id: "sensor_5v",
          name: "Sensor 5V",
          nominal_voltage_V: 5,
          voltage_range_V: [4.5, 5.5],
          max_current_mA: 200,
        },
      ],
      metadata: {
        // Faithfulness note: the ProtoPart source declares no phase
        // voltage/current ratings. kV, torque, and power figures were
        // absent from the source too, but have been verified against REV
        // official specs and added as the module-level `motor_performance`
        // trait below.
        connector_types: {
          phase_contacts: "dock_contact",
          encoder: "jst_ph_6",
        },
        source: PROTOPART_SOURCE,
      },
    },
    {
      domain: "mechanical",
      // No dimensions_mm / weight_g: the source JSON carries neither.
      metadata: {
        output_interface: "1/2 in hex through-bore rotor",
        mounting_pattern:
          "#10-32 threaded mounting holes on a 2 in bolt circle (confirmed: REV NEO Vortex specs, https://www.revrobotics.com/rev-21-1652/)",
        docking_hardware:
          "4x M3 x 25 mm socket head cap screws through counterbored clearance holes, securing a docked SPARK Flex or NEO Vortex Solo Adapter (NOT motor mounting); ideal torque 11.5 ±0.9 in-lb (1.3 ±0.1 Nm) per https://docs.revrobotics.com/brushless/neo/vortex/solo-adapter",
        source: PROTOPART_SOURCE,
      },
    },
  ],

  traits: [
    {
      // Performance figures verified against REV Robotics official sources
      // (product page specs + docs.revrobotics.com NEO Vortex page). Not
      // present in the audited ProtoPart JSON — added during datasheet audit.
      type: "motor_performance",
      params: {
        nominal_voltage_V: 12,
        motor_kv_rpm_per_V: 565,
        free_speed_rpm: 6784,
        free_running_current_A: 3.6,
        stall_current_A: 211,
        stall_torque_Nm: 3.6,
        peak_output_power_W: 640,
        typical_output_power_at_40A_W: 375,
        source:
          "REV Robotics NEO Vortex specifications: https://www.revrobotics.com/rev-21-1652/ and https://docs.revrobotics.com/brushless/neo/vortex",
      },
    },
    {
      type: "sensored_motor",
      params: {
        note: "Sensored brushless motor (per metadata description). Sensor path is the 6-pin JST-PH connector — verbatim: '6-pin JST-PH sensor connector (via Solo Adapter): 5V/GND, quadrature A/B, index/C, temperature analog.'",
        source: PROTOPART_SOURCE,
      },
    },
    {
      // The source JSON's own `warnings` array, carried verbatim.
      type: "protopart_warnings",
      params: {
        warnings: [
          "Whitelist additions needed: functions phase_c and encoder_index are not present in protopart-whitelist.json; add them to make this part canonical.",
        ],
        source: PROTOPART_SOURCE,
      },
    },
    {
      type: "terminology_policy",
      params: {
        note: "Function names (phase_a/phase_b/phase_c, encoder_connector, mounting_holes_x4, mechanical_drive) are ProtoPart-verbatim and intentionally NOT normalised: the source itself flags phase_c and encoder_index as absent from the protopart whitelist. Capability tags mirror those function names for slot matching only.",
      },
    },
  ],

  artifacts: [
    {
      id: "art_product_page",
      name: "REV Robotics NEO Vortex Product Page (REV-21-1652)",
      type: "documentation",
      url: "https://www.revrobotics.com/rev-21-1652/", // ProtoPart metadata.datasheet_url
    },
    {
      id: "art_thumbnail",
      name: "NEO Vortex Thumbnail",
      type: "custom",
      filePath: "./ProtoPart/protoparts/rev-21-1652-neo-vortex-brushless-motor/thumbnail.png",
      mimeType: "image/png",
      tags: ["image", "thumbnail"],
    },
  ],

  // The source JSON declares no node_geometry; the neutral default matches
  // the gold-standard tail structure.
  geometry: {
    xScale: 1,
    yScale: 1,
    outline: { preset: "rectangle" },
  },
});
