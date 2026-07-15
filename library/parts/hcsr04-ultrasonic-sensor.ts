/**
 * HC-SR04 Ultrasonic Sonar Distance Sensor (+ bundled 2 × 10 kΩ echo divider)
 * — ProtoPart-honest part definition.
 *
 * Primary source: ProtoPart `HCSR04-Ultrasonic-Sensor` definition.json
 *   (schema 1.4.0, part version 0.1.0) — the audited source of truth for
 *   every electrical value below. Its own datasheet reference:
 *   HC-SR04 datasheet (SparkFun mirror),
 *   https://cdn.sparkfun.com/datasheets/Sensors/Proximity/HCSR04.pdf
 *
 * Architecture notes honoured by this file:
 *   - Pin-honest like a schematic: the 4 header pins (VCC, Trig, Echo, GND)
 *     are leaf interfaces with ids "pin_N" in header order and the ProtoPart
 *     resource name as the displayed name. The ProtoPart JSON carries no
 *     physical pin designators; the 1-4 numbering follows the part's header
 *     order (VCC, Trig, Echo, GND).
 *   - Every pin carries its verbatim ProtoPart function list (name,
 *     signal_class, description) in an `hcsr04_pin_functions` trait —
 *     display data is separated from the canonical capability tags the
 *     matching engine needs (`power_in`, `ground`, `hcsr04_trig`,
 *     `hcsr04_echo`).
 *   - Implied harness connections (`implied_passives` trait): this specific
 *     ProtoPart bundles a 2 × 10 kΩ resistor divider on the Echo pin so the
 *     5 V echo pulse is safe for 3.3 V hosts — the divider is part of the
 *     audited definition, mirroring how the ESP32 reference models external
 *     RC networks.
 *   - Source-discrepancy resolution (audited): the ProtoPart metadata
 *     description says the divider lowers the echo to 2.5 V; the echo
 *     power-domain and resource descriptions say 3 V. Adjudicated to 2.5 V —
 *     2 × 10 kΩ halves 5 V, and the Adafruit product page (PID 3942) states
 *     the divider converts the 5 V level "to a safe 2.5V". The 3 V wording is
 *     still carried verbatim in the quoted source strings.
 *   - No fabricated interfaces: the ProtoPart JSON specifies no trigger pulse
 *     width, echo pulse-width-to-distance timing, measuring range, resolution,
 *     or supply/quiescent current. No interfaces or parameters were invented
 *     for them; datasheet-verified timing facts (Elecfreaks HC-SR04 datasheet,
 *     SparkFun mirror) are recorded only in the `data_gap` trait note.
 */

import type {
  InterfaceDef,
  ModuleDef,
  TraitDef,
} from "../../src/types/index.js";
import {
  Ground,
  Pin,
  PowerIn,
  defineModule,
  voltageV,
} from "../../src/protocols/index.js";

// ---------------------------------------------------------------------------
// Electrical constants — ProtoPart electrical domain (power_domains)
// ---------------------------------------------------------------------------

/** Shared citation string for values lifted verbatim from the ProtoPart JSON. */
const SRC =
  "ProtoPart HCSR04-Ultrasonic-Sensor definition.json (schema 1.4.0, v0.1.0)";

/** VCC power domain: "Main power supply must not exceed 5.0V." */
const VCC_NOMINAL_V = 5;
/** Trig power domain: "trigger pin, works with 3V-5V inputs". */
const TRIG_INPUT_RANGE_V: [number, number] = [3, 5];
/**
 * Echo power domain nominal: post-divider level. Adjudicated to 2.5 V — a
 * 2 × 10 kΩ divider halves the 5 V echo pulse (5 V × 10k/(10k+10k) = 2.5 V),
 * and the Adafruit product page (PID 3942) states the divider converts "the
 * 5V logic level to a safe 2.5V". The ProtoPart echo-domain text said 3 V;
 * that figure is preserved verbatim in descriptions but is not used here.
 */
const ECHO_DIVIDED_NOMINAL_V = 2.5;

// ---------------------------------------------------------------------------
// ProtoPart-honest per-pin function metadata
// ---------------------------------------------------------------------------

/** Signal classes as they appear in the ProtoPart resource functions. */
type Hcsr04SignalClass = "power" | "control" | "data" | "ground";

interface Hcsr04Function {
  /** Verbatim function name from the ProtoPart resource. */
  name: string;
  /** Verbatim `signal_class` from the ProtoPart resource. */
  signal_class: Hcsr04SignalClass;
  /**
   * Verbatim description. The ProtoPart functions carry no per-function
   * description; the owning resource's description is used.
   */
  description: string;
}

/** Wrap a pin's verbatim ProtoPart function list as a display trait. */
function hcsr04PinFunctions(functions: Hcsr04Function[]): TraitDef {
  return {
    type: "hcsr04_pin_functions",
    params: { source: `${SRC}, electrical resources`, functions },
  };
}

// ---------------------------------------------------------------------------
// Header pins — 4 leaf interfaces in header order (VCC, Trig, Echo, GND)
// ---------------------------------------------------------------------------

const vccPin: InterfaceDef = {
  ...PowerIn({ id: "pin_1", name: "VCC", pin: 1, voltageV: VCC_NOMINAL_V }),
  capabilities: ["power_in"],
  traits: [
    hcsr04PinFunctions([
      { name: "VCC", signal_class: "power", description: "Main power supply must not exceed 5.0V." },
    ]),
    { type: "power_domain", params: { domain: "vcc" } },
    {
      type: "supply_limit",
      params: {
        max_voltage_V: 5.0,
        note: "Main power supply must not exceed 5.0V.",
        source: `${SRC}, VCC power domain`,
      },
    },
  ],
};

const trigPin: InterfaceDef = {
  // Input-only from the sensor's side: the host drives Trig, the sensor
  // never does — the Pin builder drops the output/bidirectional roles.
  ...Pin({
    id: "pin_2",
    name: "Trig",
    pin: 2,
    voltageV: TRIG_INPUT_RANGE_V,
    capabilities: { inputOnly: true },
  }),
  capabilities: ["digital_io", "hcsr04_trig"],
  traits: [
    hcsr04PinFunctions([
      { name: "Trig", signal_class: "control", description: "trigger pin, works with 3V-5V inputs" },
    ]),
    { type: "power_domain", params: { domain: "trig" } },
    {
      type: "logic_compatibility",
      params: {
        note: "Works with 3V-5V inputs — the trigger input accepts 3.3 V logic directly, no level shifting required.",
        source: `${SRC}, Trig power domain`,
      },
    },
  ],
};

const echoPin: InterfaceDef = {
  id: "pin_3",
  name: "Echo",
  pin: 3,
  domain: "electrical",
  exposed: true,
  default_active: true,
  // Output-only from the sensor's side (hand-rolled: the Pin builder has no
  // output-only form) — the host samples the echo pulse on this line.
  protocols: [{ type: "digital", roles: ["output"] }],
  capabilities: ["digital_io", "hcsr04_echo"],
  // Post-divider nominal level as this ProtoPart ships it: 2.5 V (see the
  // implied_passives trait — the 2.5 V vs 3 V source discrepancy is resolved
  // in favour of 2.5 V per divider arithmetic and the Adafruit product page).
  parameters: [voltageV(ECHO_DIVIDED_NOMINAL_V)],
  traits: [
    hcsr04PinFunctions([
      {
        name: "Echo",
        signal_class: "data",
        description:
          "Echo pin outputs a 5V pulse, however this is lowered to 3V by the 10kOhm resistor divider for ONLY this device",
      },
    ]),
    { type: "power_domain", params: { domain: "echo" } },
    {
      // The bundled divider — part of this audited definition, not a board
      // suggestion. Topology is the standard divider arrangement implied by
      // "10kOhm resistor divider" with "2 x 10K resistors"; the ProtoPart
      // JSON does not draw the network explicitly.
      type: "implied_passives",
      params: {
        purpose: "Echo-pin level shifting for 3.3 V hosts — bundled with this specific part",
        components: [
          { kind: "resistor", value: "10 kΩ", connection: "Echo (sensor output) in series to the host signal node" },
          { kind: "resistor", value: "10 kΩ", connection: "host signal node to GND" },
        ],
        behavior:
          "Echo pin outputs a 5V pulse, however this is lowered to 3V by the 10kOhm resistor divider for ONLY this device",
        source: `${SRC}, echo power domain / resource description`,
        discrepancy_note:
          "RESOLVED: the divided echo level is 2.5 V, not 3 V. A 2 x 10 kOhm divider halves the 5 V pulse (5 V x 10k/(10k+10k) = 2.5 V), and the Adafruit product page for this exact bundle (PID 3942) says the two 10K resistors 'convert the 5V logic level to a safe 2.5V'. The ProtoPart metadata's 2.5 V figure is correct; the echo power-domain/resource '3V' wording (preserved verbatim above) is arithmetically wrong.",
      },
    },
  ],
};

const gndPin: InterfaceDef = {
  ...Ground({ id: "pin_4", name: "GND", pin: 4 }),
  traits: [
    hcsr04PinFunctions([
      { name: "GND", signal_class: "ground", description: "Ground pin" },
    ]),
    {
      type: "net_shareable",
      params: { net: "gnd", policy: "single_ground_instance_may_serve_all_members" },
    },
  ],
};

/** All 4 header pins, in header order — schematic-honest. */
const pins: InterfaceDef[] = [vccPin, trigPin, echoPin, gndPin];

// ---------------------------------------------------------------------------
// Composed sensor interface — ProtoPart electrical interface
// "ultrasonic_sensor" (requires VCC, GND, Trig, Echo — one of each)
// ---------------------------------------------------------------------------

const ultrasonicSensor: InterfaceDef = {
  id: "ultrasonic_sensor",
  name: "Ultrasonic Sensor",
  domain: "electrical",
  exposed: true,
  default_active: true,
  protocols: [{ type: "ultrasonic_sensor", roles: ["sensor"] }],
  slots: [
    { id: "vcc", required: true, match: { protocol: "power", role: "input", capability: "power_in" } },
    { id: "gnd", required: true, match: { protocol: "power", role: "ground", capability: "ground" } },
    { id: "trig", required: true, match: { protocol: "digital", role: "input", capability: "hcsr04_trig" } },
    { id: "echo", required: true, match: { protocol: "digital", role: "output", capability: "hcsr04_echo" } },
  ],
  profiles: [
    {
      id: "ultrasonic_sensor_header",
      label: "4-pin header (VCC / Trig / Echo / GND)",
      default_active: true,
      bindings: { vcc: "pin_1", gnd: "pin_4", trig: "pin_2", echo: "pin_3" },
    },
  ],
  max_instances: 1,
  traits: [
    {
      type: "operating_principle",
      params: {
        note: "Ultrasonic Sensor, 4-pin, 2-wire with a 10kOhm resistor divider on the echo pin to lower the echo pin voltage to 2.5V",
        source: `${SRC}, metadata description (verbatim)`,
      },
    },
    {
      type: "data_gap",
      params: {
        note: "The ProtoPart source specifies no trigger pulse width, echo pulse-width timing, measuring range, or update rate — trigger/echo timing semantics remain unmodelled as interfaces/parameters. Datasheet-verified timing facts (Elecfreaks HC-SR04 datasheet, SparkFun mirror, cited below): trigger requires a >= 10 uS TTL high pulse; the module then emits an 8-cycle 40 kHz ultrasonic burst; Echo goes high for a duration proportional to range (uS / 58 = cm, uS / 148 = inch, or range = high-level time x 340 m/s / 2); measuring range 2 cm to 400 cm; recommended measurement cycle over 60 ms to prevent trigger/echo overlap.",
        datasheet: "https://cdn.sparkfun.com/datasheets/Sensors/Proximity/HCSR04.pdf",
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

export const HCSR04_ULTRASONIC_SENSOR: ModuleDef = defineModule({
  id: "HCSR04-Ultrasonic-Sensor",
  name: "HC-SR04 Ultrasonic Sonar Distance Sensor + 2 x 10K resistors",
  version: "1.0.0", // audited definition; ProtoPart source version 0.1.0
  manufacturer: "Adafruit",
  part_number: "HCSR04",
  description:
    "Ultrasonic Sensor, 4-pin, 2-wire with a 10kOhm resistor divider on the echo pin to lower the echo pin voltage to 2.5V",
  // ProtoPart tag list, deduplicated ("sensor" appeared twice in the source).
  tags: ["ultrasonic_sensor", "sensor", "ultrasonic", "sonar", "distance", "adafruit", "breakout"],
  categories: ["sensor.distance"],

  interfaces: [
    // All 4 header pins in header order — schematic-honest.
    ...pins,

    // The composed sensor function.
    ultrasonicSensor,
  ],

  interfaceGroups: [
    {
      id: "sensor_header",
      label: "Sensor Header Pins (all required)",
      members: ["pin_1", "pin_2", "pin_3", "pin_4"],
      policy: "all_of",
    },
  ],

  requirements: [
    {
      type: "power",
      description:
        "Main power supply must not exceed 5.0V (ProtoPart VCC power domain). The source JSON specifies no supply-current figure.",
      voltage_V: 5,
    },
  ],

  domains: [
    {
      domain: "electrical",
      // The ProtoPart JSON models Trig and Echo signal levels as
      // power_domains (a schema quirk carried over faithfully). Descriptions
      // and the isolation/ground fields have no PowerDomainDef home and are
      // preserved in metadata below.
      power_domains: [
        { id: "vcc", name: "VCC", nominal_voltage_V: VCC_NOMINAL_V },
        { id: "trig", name: "Trig", voltage_range_V: TRIG_INPUT_RANGE_V },
        { id: "echo", name: "Echo", nominal_voltage_V: ECHO_DIVIDED_NOMINAL_V },
      ],
      metadata: {
        pin_count: 4,
        pin_order: ["VCC", "Trig", "Echo", "GND"],
        power_domain_descriptions: {
          vcc: "Main power supply must not exceed 5.0V.",
          trig: "trigger pin, works with 3V-5V inputs",
          echo: "Echo pin outputs a 5V pulse, however this is lowered to 3V by the 10kOhm resistor divider for ONLY this device",
        },
        // ProtoPart per-domain fields with no PowerDomainDef equivalent:
        isolation_type: "non_isolated",
        ground_reference: "common",
        // ProtoPart Trig domain declared its 3-5 V range in
        // `nominal_voltage_V` (as an array); mapped to voltage_range_V above.
        trig_nominal_field_note:
          "Source JSON expressed the Trig domain's 3-5 V window in nominal_voltage_V; carried as voltage_range_V.",
        source: SRC,
      },
    },
  ],

  traits: [
    {
      // "+ 2 x 10K resistors" from the ProtoPart name: the divider is a
      // bundled component of this specific part, not an optional add-on.
      type: "bundled_components",
      params: {
        components: [{ kind: "resistor", value: "10 kΩ", quantity: 2 }],
        purpose:
          "Echo-pin resistor divider to lower the 5 V echo pulse for 3.3 V hosts (see implied_passives on pin_3).",
        scope: "for ONLY this device — the bare HC-SR04 module does not include the divider",
        source: `${SRC}, metadata name / echo power domain`,
      },
    },
  ],

  artifacts: [
    {
      id: "art_datasheet",
      name: "HC-SR04 Datasheet (SparkFun mirror)",
      type: "datasheet",
      url: "https://cdn.sparkfun.com/datasheets/Sensors/Proximity/HCSR04.pdf",
    },
    {
      id: "art_thumbnail",
      name: "HC-SR04 Thumbnail",
      type: "custom",
      filePath: "./ProtoPart/protoparts/HCSR04-Ultrasonic-Sensor/thumbnail.png",
      mimeType: "image/png",
      tags: ["image", "thumbnail"],
    },
  ],

  // Presentational default (the ProtoPart source carries no node_geometry),
  // matching the ESP32 reference convention.
  geometry: {
    xScale: 1,
    yScale: 1,
    outline: { preset: "rectangle" },
  },
});
