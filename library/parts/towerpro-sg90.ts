/**
 * Tower Pro SG90 — audit-honest part definition.
 *
 * Primary source: ProtoPart `towerpro-sg90` definition v0.2.0 (schema 1.4.0),
 * itself citing the Tower Pro SG90 product page
 * (https://towerpro.com.tw/product/sg90-analog/):
 *   - electrical domain  power domain "servo_5v" (4.8-6.0 V, ~650 mA stall),
 *     three lead resources (V+/GND/Signal with wire colours), and the
 *     `rc_servo_3wire` PWM control interface (pulse/frame constraints)
 *   - mechanical domain  output spline + mounting flange resources, horn and
 *     mounting interfaces, 23 × 12.2 × 29 mm, 9 g
 *   - design_rules / validation_requirements / usage_notes / warnings /
 *     compatibility_notes — preserved verbatim as traits below
 * Nothing below is carried over from servo folklore or SDK defaults; every
 * value traces to a field of that definition.
 *
 * Architecture notes honoured by this file:
 *   - Pin-honest like a schematic: the integral 3-wire lead (S/JR connector)
 *     is three leaf interfaces with the ProtoPart resource ids and the
 *     standard wire colours as displayed names. The source gives no
 *     connector position numbers, so no `pin` designators are fabricated.
 *   - The PWM control contract (1.0-2.0 ms ↔ approx 0-180°, 0.5-2.5 ms
 *     extended, 20 ms frame / ~50 Hz) is carried as canonical parameters
 *     plus a `pwm_control_contract` trait on `rc_servo_3wire`.
 *   - The servo is a PWM *device* (signal sink) — the PWM() builder models
 *     PWM sources (roles ["output"]), so the control interface is
 *     hand-rolled with protocol role "device" per the ProtoPart JSON; only
 *     its canonical parameter helpers are reused.
 *   - Stall-current supply demands live in module `requirements` (dedicated
 *     4.8-6.0 V rail, ≥650 mA budget, tied grounds).
 *   - Mechanical content (stall torque, travel, spline, flange holes,
 *     dimensions, mass, gear material) is carried into the mechanical
 *     domain, leaf interfaces, and traits — none of it is invented.
 *   - Shareability: GND is inherently shareable and must be common with the
 *     PWM source's ground (`net_shareable` trait).
 */

import type {
  InterfaceDef,
  ModuleDef,
  TraitDef,
} from "../../src/types/index.js";
import {
  Ground,
  PowerIn,
  defineModule,
  clockFreqHz,
  voltageRangeV,
} from "../../src/protocols/index.js";

// ---------------------------------------------------------------------------
// Source citation + electrical constants — ProtoPart electrical domain
// ---------------------------------------------------------------------------

const SOURCE =
  "ProtoPart towerpro-sg90 definition v0.2.0 (Tower Pro SG90 product page: https://towerpro.com.tw/product/sg90-analog/)";

/** Power domain "servo_5v": supply range for logic and motor. */
const SUPPLY_RANGE_V: [number, number] = [4.8, 6];
const SUPPLY_NOMINAL_V = 5;
/** Power domain "servo_5v": stall current up to ~650 mA at 6 V. */
const STALL_CURRENT_A = 0.65;

/** Signal lead `voltage_tolerance_V`. */
const SIGNAL_TOLERANCE_V: [number, number] = [3, 6];
/** Signal lead `logic_levels_V.low_max`. */
const V_IL_MAX = 0.8;
/** Signal lead `logic_levels_V.high_min`. */
const V_IH_MIN = 2.3;

/** rc_servo_3wire constraints: nominal pulse width, 1.0-2.0 ms → approx 0-180°. */
const PULSE_NOMINAL_US: [number, number] = [1000, 2000];
/** rc_servo_3wire constraints: extended pulse widths accepted, unit-dependent. */
const PULSE_EXTENDED_US: [number, number] = [500, 2500];
/** rc_servo_3wire constraints: frame_period_ms. */
const FRAME_PERIOD_MS = 20;
/** "1-2 ms pulse at ~50 Hz controls angle" (RC_PWM function) — 20 ms frame. */
const FRAME_RATE_HZ = 50;

/** Every lead resource declares `connector_type: "3-pin-servo"`. */
function servoLeadConnector(wireColors: string[]): TraitDef {
  return {
    type: "connector",
    params: {
      connector_type: "3-pin-servo",
      wire_colors: wireColors,
      note: "Integral lead terminated in a 3-pin S/JR-style servo connector (electrical domain metadata: 'Micro servo with 3-pin S/JR connector'). The source gives no position numbering.",
    },
  };
}

/** Verbatim ProtoPart resource function list — display data, mirrored from the JSON. */
function sg90Functions(
  functions: Array<{ name: string; direction: string; signal_class: string; description: string }>,
): TraitDef {
  return { type: "sg90_functions", params: { source: SOURCE, functions } };
}

// ---------------------------------------------------------------------------
// The 3-wire lead — ProtoPart electrical resources, one leaf per wire
// ---------------------------------------------------------------------------

/** Resource `lead_red_vin`: POWER_IN, sink, max continuous 650 mA. */
const leadVin: InterfaceDef = {
  ...PowerIn({
    id: "lead_red_vin",
    name: "V+ (Red)",
    voltageV: SUPPLY_RANGE_V,
    nominalV: SUPPLY_NOMINAL_V,
    maxCurrentA: STALL_CURRENT_A,
  }),
  capabilities: ["power_in"],
  traits: [
    sg90Functions([
      { name: "POWER_IN", direction: "sink", signal_class: "power", description: "Supply 4.8–6.0 V" },
    ]),
    {
      type: "power_domain",
      params: {
        domain: "servo_5v",
        description: "Primary supply for servo logic and motor. Stall current up to ~650 mA at 6 V.",
      },
    },
    servoLeadConnector(["red"]),
    {
      type: "current_rating_basis",
      params: {
        note: "650 mA is the stall-current ceiling at 6 V, not a typical draw — validation expects no-load current <60 mA at 6 V and stall current <650 mA at 6 V.",
        source: SOURCE,
      },
    },
  ],
};

/** Resource `lead_brown_gnd`: GROUND, 0 V return. */
const leadGnd: InterfaceDef = {
  ...Ground({ id: "lead_brown_gnd", name: "GND (Brown/Black)" }),
  traits: [
    sg90Functions([
      { name: "GROUND", direction: "sink", signal_class: "power", description: "0 V return" },
    ]),
    {
      type: "power_domain",
      params: {
        domain: "servo_5v",
        note: "ground_reference: system_ground; isolation_type: non_isolated.",
      },
    },
    servoLeadConnector(["brown", "black"]),
    {
      // Shareability: ground is one net, and it must be common with the PWM
      // source even when the servo runs from its own supply.
      type: "net_shareable",
      params: {
        net: "gnd",
        policy: "single_ground_instance_may_serve_all_members",
        note: "'Power servos from a separate 5–6 V supply; tie grounds.' / 'ensure common ground.'",
      },
    },
  ],
};

/** Resource `lead_orange_sig`: RC_PWM input, 3-6 V tolerant, TTL-ish thresholds. */
const leadSignal: InterfaceDef = {
  id: "lead_orange_sig",
  name: "Signal (Orange/Yellow/White)",
  domain: "electrical",
  exposed: true,
  default_active: true,
  protocols: [{ type: "pwm", roles: ["input"] }],
  capabilities: ["rc_pwm_in"],
  parameters: [
    voltageRangeV(SIGNAL_TOLERANCE_V[0], SIGNAL_TOLERANCE_V[1]), // voltage_tolerance_V
    { id: "v_il_max", name: "Logic low, max (V_IL)", unit: "V", value: V_IL_MAX },
    { id: "v_ih_min", name: "Logic high, min (V_IH)", unit: "V", value: V_IH_MIN },
  ],
  traits: [
    sg90Functions([
      { name: "RC_PWM", direction: "input", signal_class: "pwm", description: "1–2 ms pulse at ~50 Hz controls angle" },
    ]),
    { type: "power_domain", params: { domain: "servo_5v" } },
    servoLeadConnector(["orange", "yellow", "white"]),
    {
      type: "logic_compatibility",
      params: {
        note: "Accepts 3.3 V or 5 V logic PWM in most cases; ensure common ground. Some clones require 5 V-high.",
        source: SOURCE,
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// RC servo control — ProtoPart electrical interface `rc_servo_3wire`
// ---------------------------------------------------------------------------

// The servo consumes PWM (protocol role "device" in the source JSON); the
// PWM() builder emits source-side units (roles ["output"]) and so does not
// fit — hand-rolled, with the canonical parameter helpers reused.
const rcServoControl: InterfaceDef = {
  id: "rc_servo_3wire",
  name: "RC servo PWM control",
  domain: "electrical",
  exposed: true,
  default_active: true, // the 3-wire lead is integral — always present
  protocols: [{ type: "pwm", roles: ["device"] }],
  slots: [
    { id: "power", required: true, match: { protocol: "power", role: "input", capability: "power_in" } },
    { id: "ground", required: true, match: { protocol: "power", role: "ground", capability: "ground" } },
    { id: "signal", required: true, match: { protocol: "pwm", role: "input", capability: "rc_pwm_in" } },
  ],
  profiles: [
    {
      id: "rc_servo_3wire_lead",
      label: "Integral 3-wire lead (S/JR connector)",
      default_active: true,
      bindings: { power: "lead_red_vin", ground: "lead_brown_gnd", signal: "lead_orange_sig" },
    },
  ],
  parameters: [
    clockFreqHz(FRAME_RATE_HZ), // "~50 Hz" per the RC_PWM function; 20 ms frame
    { id: "frame_period", name: "PWM frame period", unit: "ms", value: FRAME_PERIOD_MS },
    { id: "pulse_width", name: "Nominal pulse width", unit: "µs", range: PULSE_NOMINAL_US },
    { id: "pulse_width_extended", name: "Extended pulse width (unit-dependent)", unit: "µs", range: PULSE_EXTENDED_US },
  ],
  max_instances: 1, // one physical lead
  traits: [
    {
      type: "pwm_control_contract",
      params: {
        pulse_width_us: PULSE_NOMINAL_US,
        mapping: "Standard 3-wire RC servo interface. 1.0–2.0 ms → approx 0–180°.",
        pulse_extension_us: PULSE_EXTENDED_US,
        extension_note: "Accepts extended pulse widths 0.5–2.5 ms depending on unit.",
        frame_period_ms: FRAME_PERIOD_MS,
        neutral_check: "Verify neutral at 1500 µs pulse within ±10° (validation requirement).",
        source: SOURCE,
      },
    },
    {
      type: "calibration_note",
      params: {
        note: "Generate 50 Hz PWM with 1–2 ms pulses for nominal 0–180°; calibrate endpoints to avoid stall. Sweep 1000–2000 µs and confirm no mechanical binding.",
        source: SOURCE,
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Mechanical — ProtoPart mechanical resources and interfaces
// ---------------------------------------------------------------------------

/** Resource `servo_output_spline`: SERVO_OUTPUT, mechanical_drive source. */
const outputSpline: InterfaceDef = {
  id: "servo_output_spline",
  name: "Output spline",
  domain: "mechanical",
  exposed: true,
  default_active: true,
  protocols: [{ type: "mechanical_drive", roles: ["source"] }],
  capabilities: ["servo_output"],
  parameters: [
    // metadata.description: "~1.2–1.8 kg·cm stall torque depending on source"
    { id: "stall_torque", name: "Stall torque (source-dependent)", unit: "kg·cm", range: [1.2, 1.8] },
    // metadata.description: "~180° travel"
    { id: "travel", name: "Rotational travel (approx.)", unit: "°", value: 180 },
  ],
  traits: [
    sg90Functions([
      { name: "SERVO_OUTPUT", direction: "source", signal_class: "mechanical_drive", description: "Rotational output shaft for horn" },
    ]),
    {
      type: "connector",
      params: {
        connector_type: "spline",
        note: "Accepts included plastic horns; micro spline (often ~21T, varies by vendor).",
      },
    },
    {
      type: "gear_train",
      params: {
        material: "plastic",
        note: "Plastic gears. Avoid shock loads. Do not backdrive at power-off. Hold torque depends on supply voltage.",
        source: SOURCE,
      },
    },
  ],
};

/** Resource `mounting_flange`: MECHANICAL_MOUNT, bidirectional — both ears are one resource. */
const mountingFlange: InterfaceDef = {
  id: "mounting_flange",
  name: "Mount flange",
  domain: "mechanical",
  exposed: true,
  default_active: true,
  protocols: [{ type: "mechanical_mount", roles: ["bidirectional"] }],
  capabilities: ["mechanical_mount"],
  traits: [
    sg90Functions([
      { name: "MECHANICAL_MOUNT", direction: "bidirectional", signal_class: "mechanical_mount", description: "Two mounting ears with holes" },
    ]),
    {
      type: "connector",
      params: {
        connector_type: "through_hole",
        note: "Two Ø2.2 mm self-tapping screw holes on ears.",
      },
    },
  ],
};

/** ProtoPart mechanical interface `horn_interface`. */
const hornInterface: InterfaceDef = {
  id: "horn_interface",
  name: "Horn attachment",
  domain: "mechanical",
  exposed: true,
  default_active: true,
  protocols: [{ type: "mechanical_connection", roles: ["shaft"] }],
  slots: [
    { id: "output", required: true, match: { capability: "servo_output" } },
  ],
  profiles: [
    { id: "horn_spline", label: "Output spline", default_active: true, bindings: { output: "servo_output_spline" } },
  ],
  max_instances: 1,
  traits: [
    {
      type: "assembly_requirement",
      params: { note: "Attach horns with included M2 screw. Ensure travel limits are respected.", source: SOURCE },
    },
  ],
};

/** ProtoPart mechanical interface `mounting_interface` (requires MECHANICAL_MOUNT ×2). */
const mountingInterface: InterfaceDef = {
  id: "mounting_interface",
  name: "Servo mounting ears",
  domain: "mechanical",
  exposed: true,
  default_active: true,
  protocols: [{ type: "mechanical_connection", roles: ["mounting_point"] }],
  slots: [
    // The source requires the MECHANICAL_MOUNT function twice (two ears).
    { id: "ear", required: true, count: 2, match: { capability: "mechanical_mount" } },
  ],
  profiles: [
    {
      id: "mounting_ears",
      label: "Flange ears (both holes)",
      default_active: true,
      // The ProtoPart models both ears as the single `mounting_flange`
      // resource — one leaf carries both Ø2.2 mm holes.
      bindings: { ear: "mounting_flange" },
    },
  ],
  max_instances: 1,
  traits: [
    {
      type: "assembly_requirement",
      params: { note: "Use included self-tapping screws. Do not overtighten.", source: SOURCE },
    },
  ],
};

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

export const TOWERPRO_SG90: ModuleDef = defineModule({
  id: "towerpro-sg90",
  name: "Tower Pro SG90",
  version: "0.2.0",
  manufacturer: "Tower Pro",
  part_number: "SG90",
  description:
    "9 g analog micro servo for RC and robotics. ~180° travel, 4.8–6.0 V supply, ~1.2–1.8 kg·cm stall torque depending on source.",
  tags: ["sg90", "micro-servo", "rc-servo", "9g", "pwm"],
  categories: ["actuator.motor.servo", "robotics.rc"],

  interfaces: [
    // The 3-wire lead — schematic-honest leaves (source declares no
    // connector position numbers, so none are shown).
    leadVin,
    leadGnd,
    leadSignal,

    // Control
    rcServoControl,

    // Mechanical
    outputSpline,
    mountingFlange,
    hornInterface,
    mountingInterface,
  ],

  interfaceGroups: [
    {
      id: "servo_lead_3pin",
      label: "3-wire servo lead (S/JR connector)",
      members: ["lead_red_vin", "lead_brown_gnd", "lead_orange_sig"],
      policy: "all_of",
    },
  ],

  requirements: [
    {
      type: "power",
      description:
        "Supply 4.8–6.0 V on a dedicated rail; avoid powering from an MCU 5 V pin. Budget peak (stall) current ≥650 mA per servo, and tie the servo-supply ground to the PWM source's ground.",
      voltage_V: SUPPLY_RANGE_V,
      current_mA: 650,
    },
    {
      type: "interface",
      description:
        "Control requires a ~50 Hz PWM source delivering 1–2 ms pulses for nominal 0–180°; calibrate endpoints to avoid stall. 3.3 V or 5 V logic accepted in most cases (some clones require 5 V-high).",
      interface_protocol: "pwm",
    },
  ],

  domains: [
    {
      domain: "electrical",
      power_domains: [
        {
          id: "servo_5v",
          name: "Servo 5V Rail",
          nominal_voltage_V: SUPPLY_NOMINAL_V,
          voltage_range_V: SUPPLY_RANGE_V,
          max_current_mA: 650,
          regulation_type: "unregulated",
        },
      ],
      metadata: {
        pin_count: 3,
        package_type: "Micro servo with 3-pin S/JR connector",
        supply_voltage_V: SUPPLY_RANGE_V,
        power_consumption_mW: 300,
        // PowerDomainDef has no home for these source fields:
        power_domain_detail: {
          isolation_type: "non_isolated",
          ground_reference: "system_ground",
          description: "Primary supply for servo logic and motor. Stall current up to ~650 mA at 6 V.",
        },
        source: SOURCE,
      },
    },
    {
      domain: "mechanical",
      dimensions_mm: { length: 23, width: 12.2, height: 29 },
      weight_g: 9,
      metadata: {
        package_type: "9g micro servo",
        mounting_method: "Flange ears with two screws",
        source: SOURCE,
      },
    },
  ],

  traits: [
    {
      // metadata.description figures — the only torque/travel data the
      // source carries (no transit-speed spec exists in the definition).
      type: "servo_characteristics",
      params: {
        drive_type: "analog",
        stall_torque_kg_cm: [1.2, 1.8],
        stall_torque_note: "depending on source",
        travel_deg_approx: 180,
        source: SOURCE,
      },
    },
    {
      type: "design_rules",
      params: {
        rules: [
          "Supply 4.8–6.0 V on dedicated rail; avoid powering from MCU 5V pin.",
          "Budget peak current ≥650 mA per servo.",
          "Generate 50 Hz PWM with 1–2 ms pulses for nominal 0–180°; calibrate endpoints to avoid stall.",
        ],
        source: SOURCE,
      },
    },
    {
      type: "validation_requirements",
      params: {
        checks: [
          "Verify neutral at 1500 µs pulse within ±10°.",
          "Sweep 1000–2000 µs and confirm no mechanical binding.",
          "Measure no-load current <60 mA at 6 V and stall current <650 mA at 6 V.",
        ],
        source: SOURCE,
      },
    },
    {
      type: "usage_notes",
      params: {
        note: "Plastic gears. Avoid shock loads. Do not backdrive at power-off. Hold torque depends on supply voltage.",
        source: SOURCE,
      },
    },
    {
      type: "compatibility_notes",
      params: {
        note: "Accepts 3.3 V or 5 V logic PWM in most cases; ensure common ground. Some clones require 5 V-high.",
        source: SOURCE,
      },
    },
    {
      type: "warnings",
      params: {
        warnings: [
          "Do not exceed travel limits. Stall can overheat motor.",
          "Power servos from a separate 5–6 V supply; tie grounds.",
          "Avoid continuous stall or hammering; plastic gear wear will accelerate.",
        ],
        source: SOURCE,
      },
    },
    {
      type: "application_examples",
      params: {
        examples: ["RC airplane control surface", "Lightweight gimbal tilt", "Small robotics gripper"],
        source: SOURCE,
      },
    },
  ],

  artifacts: [
    {
      id: "art_datasheet",
      name: "Tower Pro SG90 Product Page",
      type: "datasheet",
      url: "https://towerpro.com.tw/product/sg90-analog/",
    },
    {
      id: "art_thumbnail",
      name: "Thumbnail",
      type: "custom",
      filePath: "./ProtoPart/protoparts/towerpro-sg90/thumbnail.png",
      mimeType: "image/png",
      description: "ProtoPart preview artifact (previewArtifactId).",
      tags: ["image", "thumbnail", "preview"],
    },
  ],

  geometry: {
    xScale: 1,
    yScale: 1,
    outline: { preset: "rectangle" },
  },
});
