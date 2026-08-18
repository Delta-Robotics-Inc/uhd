/**
 * PJRC Teensy 4.1 (TEENSY41) — source-honest part definition.
 *
 * Primary source: ProtoPart definition `pjrc-teensy-4-1` (schema 1.4.0,
 * version 0.4.0) — the audited source of truth for this file:
 *   - electrical power_domains: USB 5V, VIN (Raw Input), Regulated 3.3V
 *   - electrical resources: USB connector, VIN, two 3.3 V output pins, two
 *     GND pins, and header pins 0-23 with their per-pin function lists
 *   - electrical interfaces: 3.3 V power output, digital pins, analog input,
 *     I2C master, SPI master, PWM, Digital Audio 1/2, S/PDIF, MQS, serial
 *     ports, CAN bus, USB device (480 MHz)
 *   - design_rules / warnings / validation_requirements / usage_notes /
 *     application_examples / compatibility_notes (carried as traits)
 * Secondary source: PJRC datasheets page (https://www.pjrc.com/teensy/datasheets.html)
 * as cited by the ProtoPart metadata. Nothing below is carried over from
 * convention, Arduino-core defaults, or the bare i.MX RT1062 datasheet
 * without being present in the ProtoPart definition.
 *
 * Architecture notes honoured by this file:
 *   - Pin-honest like a schematic: every edge pin the ProtoPart source
 *     defines is a leaf interface with its silkscreen designator — the USB
 *     connector, VIN, two 3.3 V pins, two GND pins, and header pins 0-23.
 *     The source does NOT define pins 24-41, VBAT/ON-OFF/PROGRAM, the
 *     micro-SD slot, USB host pads, or the Ethernet PHY pads; they are
 *     intentionally absent here (see the `source_coverage` module trait).
 *   - Every pin carries its verbatim ProtoPart function list in a
 *     `teensy_pin_functions` trait — display data is separated from the
 *     canonical capability tags the matching engine needs.
 *   - Instances vs combinations: the ProtoPart source declares each
 *     peripheral interface against function names, not pin pairings.
 *     Where the source pins a function to exactly one pin (SPI, Digital
 *     Audio 2, S/PDIF, MQS, USB) the binding is a named profile; where
 *     several pins carry the function (serial RX/TX, SDA/SCL, CAN_TX/RX,
 *     OUT1) the combination space is left open via capability-tag slots
 *     and documented in `instance_combinations` traits.
 *   - Co-requirements (`co_requirement` traits): USB and VIN power sources
 *     are mutually exclusive (ProtoPart design rule).
 *   - Implied harness connections (`implied_passives` traits): external
 *     I2C pull-up resistors; VIN supply decoupling (both ProtoPart design
 *     rules).
 *   - Shareability exemptions (`net_shareable` traits): the two 3.3 V
 *     output pins are one regulator net; the two GND pins are one ground
 *     net — a single supply/ground instance may serve all members.
 */

import type {
  InterfaceDef,
  ModuleDef,
  SlotDef,
  TraitDef,
} from "../../src/types/index.js";
import type { Parameter } from "../../src/types/parameter.js";
import {
  Ground,
  Pin,
  PowerIn,
  PowerOut,
  SPI,
  UART,
  defineModule,
  maxCurrentA,
  maxFrequencyHz,
  voltageV,
} from "../../src/protocols/index.js";

// ---------------------------------------------------------------------------
// Electrical constants — ProtoPart power_domains + design_rules/warnings
// ---------------------------------------------------------------------------

/** ProtoPart power domain "usb_5v": USB-supplied power with built-in protection. */
const USB_5V_RANGE: [number, number] = [4.5, 5.5];
/**
 * VIN input range per PJRC's official Teensy 4.1 pinout card (card11a_rev4,
 * https://www.pjrc.com/teensy/pinout.html): "Vin (3.6 to 5.5 volts)".
 * NOTE: the ProtoPart power domain said [3.6, 5] and its own design rule
 * "VIN must be 4.5-6V when using external power" — both disagreed with each
 * other and with PJRC; adjudicated to the official figure (see the
 * `source_discrepancy` trait on vin, which preserves both source values).
 */
const VIN_RANGE: [number, number] = [3.6, 5.5];
/**
 * 3.3 V rail per PJRC's official pinout card: "3.3V (250 mA max)"; product
 * page (https://www.pjrc.com/store/teensy41.html): "The recommended maximum
 * for external 3.3V usage is 250mA". The ProtoPart source's 1000 mA figure
 * is not supported by PJRC and was corrected (see the thermal_note trait on
 * the 3.3 V output pins, which preserves the source's 1 A wording).
 */
const RAIL_3V3_NOMINAL_V = 3.3;
const RAIL_3V3_MAX_A = 0.25;

/** ProtoPart design rule "Maximum 15mA per I/O pin". */
const PIN_MAX_MA = 15;

/**
 * ProtoPart warning: "Maximum current per pin is around 4-6mA for continuous
 * draw" — carried as the continuous-drive guidance parameter on every pin.
 */
const PIN_DRIVE_GUIDANCE: Parameter = {
  id: "drive_current",
  name: "Continuous drive current (source guidance)",
  unit: "mA",
  range: [4, 6],
};

/** ProtoPart design rules: 3.3 V only, NOT 5 V tolerant, never exceed 3.6 V. */
const IO_VOLTAGE_TRAIT: TraitDef = {
  type: "io_voltage_limits",
  params: {
    logic_level_V: 3.3,
    absolute_max_input_V: 3.6,
    five_volt_tolerant: false,
    note: "All I/O pins are 3.3V only and NOT 5V tolerant. Never apply more than 3.3V to any I/O pin; do not exceed 3.6V on any I/O pin.",
    source: "ProtoPart pjrc-teensy-4-1 design_rules / warnings",
  },
};

/** ProtoPart design rule + warnings on per-pin and cumulative current. */
const IO_CURRENT_TRAIT: TraitDef = {
  type: "io_current_limits",
  params: {
    per_pin_max_mA: PIN_MAX_MA,
    continuous_guidance_mA: [4, 6],
    pjrc_recommended_max_output_mA: 4,
    pjrc_note: "PJRC's official spec (https://www.pjrc.com/store/teensy41.html): 'The recommended maximum output current is 4mA'. PJRC publishes no 15 mA per-pin figure; the source's 15 mA design rule is retained unverified.",
    cumulative_note: "Maximum current for all I/O is limited (source does not quantify the cumulative figure).",
    load_note: "If you need to drive an LED or other load, use a transistor or MOSFET.",
    source: "ProtoPart pjrc-teensy-4-1 design_rules / warnings",
  },
};

/** ProtoPart design rule: USB and VIN power sources are mutually exclusive. */
function powerSourceExclusivity(other: string): TraitDef {
  return {
    type: "co_requirement",
    params: {
      with: other,
      condition: "both power sources connected",
      effect: "USB and VIN power sources are mutually exclusive — power the board from exactly one of them.",
      source: "ProtoPart pjrc-teensy-4-1 design_rules",
    },
  };
}

// ---------------------------------------------------------------------------
// Source-verbatim per-pin function metadata
// ---------------------------------------------------------------------------

/**
 * Verbatim function-name strings from the ProtoPart electrical resources.
 * The source lists names only (no direction/routing columns), so the trait
 * carries the strings exactly as written.
 */
interface TeensyPinSpec {
  /** Silkscreen / Arduino pin number (ProtoPart resource id "pin_<n>"). */
  pin: number;
  /** Verbatim ProtoPart function names, in source order. */
  functions: string[];
  /** Editorial note about the source data itself, when warranted. */
  sourceNote?: string;
  /**
   * PJRC-doc adjudication: expose the digital capability when the official
   * pinout documentation confirms it despite an omission in the ProtoPart
   * function list (the verbatim `functions` array is never altered).
   */
  digitalPerPjrc?: boolean;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

/**
 * Map a verbatim ProtoPart function name to an extra canonical capability
 * tag (beyond what the Pin builder emits). Names that are pure display data
 * (CTX/CRX, which no ProtoPart interface requires) map to nothing and live
 * only in the `teensy_pin_functions` trait.
 */
const EXTRA_CAPS: Record<string, string> = {
  CAN_RX: "can_rx",
  CAN_TX: "can_tx",
  OUT1: "audio1_out",
  IN1: "audio1_in",
  LRCLK1: "audio1_lrclk",
  BCLK1: "audio1_bclk",
  MCLK1: "audio1_mclk",
  OUT2: "audio2_out",
  IN2: "audio2_in",
  LRCLK2: "audio2_lrclk",
  BCLK2: "audio2_bclk",
  MQSL: "mqs_l",
  MQSR: "mqs_r",
  "S/PDIF_Out": "spdif_out",
  "S/PDIF_In": "spdif_in",
};

/** Build one schematic-honest header pin from its ProtoPart resource row. */
function teensyPin(spec: TeensyPinSpec): InterfaceDef {
  const fns = new Set(spec.functions);

  const base = Pin({
    id: `pin_${spec.pin}`,
    name: `Pin ${spec.pin}`,
    pin: spec.pin,
    voltageV: 3.3,
    capabilities: {
      // Capability flags derive strictly from the source's function list.
      digital: fns.has("Digital_pin") || spec.digitalPerPjrc === true,
      pwm: fns.has("PWM"),
      analogIn: fns.has("Analog_read_pin"),
      uartRx: fns.has("Serial_RX"),
      uartTx: fns.has("Serial_TX"),
      i2cSda: fns.has("SDA"),
      i2cScl: fns.has("SCL"),
      spiMosi: fns.has("MOSI"),
      spiMiso: fns.has("MISO"),
      spiSck: fns.has("SCK"),
      spiSs: fns.has("CS"),
    },
  });

  const capabilities = unique([
    ...(base.capabilities ?? []),
    ...spec.functions.flatMap((fn) => {
      const cap = EXTRA_CAPS[fn];
      return cap !== undefined ? [cap] : [];
    }),
  ]);

  const parameters: Parameter[] = [...(base.parameters ?? []), PIN_DRIVE_GUIDANCE];

  const traits: TraitDef[] = [
    {
      type: "teensy_pin_functions",
      params: {
        source: "ProtoPart pjrc-teensy-4-1 definition, electrical resources (verbatim function names)",
        functions: spec.functions,
        ...(spec.sourceNote ? { note: spec.sourceNote } : {}),
      },
    },
    IO_VOLTAGE_TRAIT,
    IO_CURRENT_TRAIT,
  ];

  return { ...base, capabilities, parameters, traits };
}

// ---------------------------------------------------------------------------
// Header pins 0-23 — ProtoPart electrical resources, in board pin order.
// Function lists are verbatim from the source (including CTX/CRX on pins
// 11/13, which no source interface consumes).
// ---------------------------------------------------------------------------

const PIN_SPECS: TeensyPinSpec[] = [
  { pin: 0, functions: ["PWM", "CAN_RX", "Serial_RX", "Digital_pin"] },
  { pin: 1, functions: ["PWM", "Serial_TX", "CAN_TX", "Digital_pin"] },
  { pin: 2, functions: ["PWM", "Digital_pin", "OUT2"] },
  { pin: 3, functions: ["LRCLK2", "PWM", "Digital_pin"] },
  { pin: 4, functions: ["BCLK2", "PWM", "Digital_pin"] },
  { pin: 5, functions: ["IN2", "PWM", "Digital_pin"] },
  { pin: 6, functions: ["OUT1", "PWM", "Digital_pin"] },
  { pin: 7, functions: ["OUT1", "PWM", "Serial_RX", "Digital_pin"] },
  { pin: 8, functions: ["IN1", "PWM", "Serial_TX", "Digital_pin"] },
  { pin: 9, functions: ["OUT1", "PWM", "Digital_pin"] },
  {
    pin: 10,
    functions: ["MQSR", "PWM", "CS"],
    digitalPerPjrc: true,
    sourceNote:
      "The source function list omits Digital_pin on this pin (unlike every neighbouring pin); the verbatim list is carried as-is. Adjudicated against PJRC's official Teensy 4.1 pinout card (card11a_rev4, https://www.pjrc.com/teensy/pinout.html): pin 10 is a digital I/O pin ('All digital pins have Interrupt capability'; product page lists 55 digital input/output pins) — the omission is a source error, so the digital_io capability IS exposed here.",
  },
  { pin: 11, functions: ["MOSI", "PWM", "CTX", "Digital_pin"] },
  { pin: 12, functions: ["MISO", "PWM", "MQSL", "Digital_pin"] },
  { pin: 13, functions: ["SCK", "PWM", "CRX", "Digital_pin"] },
  { pin: 14, functions: ["Serial_TX", "PWM", "Analog_read_pin", "S/PDIF_Out", "Digital_pin"] },
  { pin: 15, functions: ["Serial_RX", "PWM", "Analog_read_pin", "S/PDIF_In", "Digital_pin"] },
  { pin: 16, functions: ["Serial_RX", "SCL", "Analog_read_pin", "Digital_pin"] },
  { pin: 17, functions: ["Serial_TX", "SDA", "Analog_read_pin", "Digital_pin"] },
  { pin: 18, functions: ["SDA", "Analog_read_pin", "PWM", "Digital_pin"] },
  { pin: 19, functions: ["SCL", "Analog_read_pin", "PWM", "Digital_pin"] },
  { pin: 20, functions: ["LRCLK1", "Analog_read_pin", "Digital_pin", "Serial_TX"] },
  { pin: 21, functions: ["BCLK1", "Analog_read_pin", "Digital_pin", "Serial_RX"] },
  { pin: 22, functions: ["CAN_TX", "PWM", "Analog_read_pin", "Digital_pin"] },
  { pin: 23, functions: ["CAN_RX", "Analog_read_pin", "PWM", "Digital_pin", "MCLK1"] },
];

const headerPins: InterfaceDef[] = PIN_SPECS.map(teensyPin);

// ---------------------------------------------------------------------------
// Power and connector pins — ProtoPart electrical resources
// ---------------------------------------------------------------------------

const usbConnector: InterfaceDef = {
  ...PowerIn({
    id: "usb_5v",
    name: "USB Connector (5V in)",
    pin: "USB",
    voltageV: USB_5V_RANGE,
    nominalV: 5,
    maxCurrentA: 0.5,
  }),
  capabilities: ["power_in", "usb_connector"],
  traits: [
    {
      type: "power_domain",
      params: {
        domain: "usb_5v",
        description: "USB-supplied power with built-in protection.",
        regulation_type: "regulated",
      },
    },
    powerSourceExclusivity("vin"),
  ],
};

const vin: InterfaceDef = {
  ...PowerIn({
    id: "vin",
    name: "VIN (Raw Input)",
    pin: "VIN",
    voltageV: VIN_RANGE,
    nominalV: 5,
    maxCurrentA: 0.5,
  }),
  capabilities: ["power_in", "vin_input"],
  traits: [
    {
      type: "power_domain",
      params: {
        domain: "vin",
        description: "External power input through VIN pin.",
        regulation_type: "unregulated",
      },
    },
    {
      type: "source_discrepancy",
      params: {
        field: "VIN voltage range",
        power_domain_value_V: [3.6, 5],
        design_rule_value: "VIN must be 4.5-6V when using external power",
        note: "The ProtoPart power domain ([3.6, 5] V) and its own design rule disagree; both figures are preserved verbatim.",
        resolution:
          "Adjudicated against PJRC's official Teensy 4.1 pinout card (card11a_rev4, https://www.pjrc.com/teensy/pinout.html), which prints 'Vin (3.6 to 5.5 volts)'. Neither source figure matches: the power domain had the correct 3.6 V floor but a low 5 V ceiling, and the design rule's 4.5-6 V is wrong on both ends (6 V exceeds PJRC's documented maximum). The structured parameter now carries PJRC's 3.6-5.5 V.",
      },
    },
    {
      type: "implied_passives",
      params: {
        purpose: "VIN supply stability",
        components: [
          { kind: "capacitor", value: "sufficient decoupling (source does not quantify)", connection: "VIN to GND" },
        ],
        source: "ProtoPart design rules: 'Provide stable 5V supply to VIN with sufficient decoupling' / 'Ensure proper decoupling capacitors for stable operation'",
      },
    },
    powerSourceExclusivity("usb_5v"),
  ],
};

/** The two 3.3 V output pins sit on one regulated net (250 mA max per PJRC). */
function rail3v3Pin(id: string, ordinal: number): InterfaceDef {
  const base = PowerOut({
    id,
    name: `3.3V Output ${ordinal}`,
    pin: "3.3V",
    voltageV: RAIL_3V3_NOMINAL_V,
    maxCurrentA: RAIL_3V3_MAX_A,
  });
  return {
    ...base,
    capabilities: ["power_out", "power_3v3_out"],
    traits: [
      {
        type: "power_domain",
        params: {
          domain: "regulated_3v3",
          description: "3.3V output for CPU and low-power external devices.",
          regulation_type: "regulated",
        },
      },
      {
        // Shareability exemption: one supply consumer net may legally span
        // both pads — they are the same regulator output.
        type: "net_shareable",
        params: {
          net: "teensy41_regulated_3v3",
          policy: "single_supply_instance_may_serve_all_members",
          members: ["3v3_out_1", "3v3_out_2"],
        },
      },
      {
        type: "thermal_note",
        params: {
          note: "The 3.3V regulator can supply up to 1A but may dissipate heat at high currents.",
          source: "ProtoPart pjrc-teensy-4-1 warnings",
          correction:
            "The source's 1 A figure is not supported by PJRC. Official pinout card (card11a_rev4): '3.3V (250 mA max)'; product page (https://www.pjrc.com/store/teensy41.html): 'The recommended maximum for external 3.3V usage is 250mA'. The structured current limit on this pin carries 250 mA.",
        },
      },
    ],
  };
}

function gndPin(id: string, ordinal: number): InterfaceDef {
  return {
    ...Ground({ id, name: `Ground ${ordinal}`, pin: "GND" }),
    traits: [
      {
        type: "net_shareable",
        params: { net: "gnd", policy: "single_ground_instance_may_serve_all_members", members: ["gnd1", "gnd2"] },
      },
      {
        type: "power_domain",
        params: {
          domain: "regulated_3v3",
          note: "The ProtoPart source associates both ground pins with the regulated_3v3 power domain (common ground reference).",
        },
      },
    ],
  };
}

const powerAndServicePins: InterfaceDef[] = [
  usbConnector,
  vin,
  rail3v3Pin("3v3_out_1", 1),
  rail3v3Pin("3v3_out_2", 2),
  gndPin("gnd1", 1),
  gndPin("gnd2", 2),
];

/** All edge pins the source defines: power/connector pins, then pins 0-23. */
const pins: InterfaceDef[] = [...powerAndServicePins, ...headerPins];

// ---------------------------------------------------------------------------
// Composed interfaces — ProtoPart electrical `interfaces`, one for one.
// Slot capability tags are canonical; the source's raw protocol type/role
// strings are preserved in `source_protocol` traits wherever they were
// normalised (see the module-level `terminology_policy` trait).
// ---------------------------------------------------------------------------

function composed(config: {
  id: string;
  name: string;
  protocolType: string;
  roles: string[];
  slots: SlotDef[];
  profiles?: InterfaceDef["profiles"];
  parameters?: Parameter[];
  maxInstances?: number;
  defaultActive?: boolean;
  traits?: TraitDef[];
  domain?: InterfaceDef["domain"];
}): InterfaceDef {
  return {
    id: config.id,
    name: config.name,
    domain: config.domain ?? "electrical",
    exposed: true,
    default_active: config.defaultActive ?? false,
    protocols: [{ type: config.protocolType, roles: config.roles }],
    slots: config.slots,
    ...(config.profiles ? { profiles: config.profiles } : {}),
    ...(config.parameters ? { parameters: config.parameters } : {}),
    ...(config.maxInstances !== undefined ? { max_instances: config.maxInstances } : {}),
    ...(config.traits ? { traits: config.traits } : {}),
  };
}

function withTraits(iface: InterfaceDef, traits: TraitDef[]): InterfaceDef {
  return { ...iface, traits: [...(iface.traits ?? []), ...traits] };
}

/** Attach traits to the interface with the given id inside a builder result. */
function amend(ifaces: InterfaceDef[], id: string, traits: TraitDef[]): InterfaceDef[] {
  return ifaces.map((i) => (i.id === id ? withTraits(i, traits) : i));
}

/** Preserve the source's raw protocol descriptor where it was normalised. */
function sourceProtocol(type: string, role: string): TraitDef {
  return { type: "source_protocol", params: { raw: { type, role } } };
}

// 3.3 V power output — source requires one 3v3_power_output pin + one ground.
const powerOutput3v3 = composed({
  id: "3v3_power_output",
  name: "3.3V Power Output",
  protocolType: "power",
  roles: ["output"],
  parameters: [voltageV(RAIL_3V3_NOMINAL_V), maxCurrentA(RAIL_3V3_MAX_A)],
  slots: [
    { id: "rail", required: true, match: { protocol: "power", role: "output", capability: "power_3v3_out" } },
    { id: "gnd", required: true, match: { protocol: "power", role: "ground", capability: "ground" } },
  ],
  traits: [
    {
      type: "instance_combinations",
      params: {
        combination_space: "Rail: 3v3_out_1 or 3v3_out_2 (one regulator net); ground: gnd1 or gnd2 (one ground net). The source specifies no fixed pairing.",
      },
    },
  ],
});

// Digital pins — any header pin whose source function list includes Digital_pin.
const digitalPins = composed({
  id: "digital_pins",
  name: "Digital Pins (Read/Write)",
  protocolType: "digital",
  roles: ["input", "output", "bidirectional"],
  slots: [
    { id: "pin", required: true, match: { protocol: "digital", capability: "digital_io" } },
  ],
  traits: [
    sourceProtocol("digital", "transmitter"),
    {
      type: "instance_combinations",
      params: {
        combination_space: "Any header pin 0-23. The ProtoPart function list omitted Digital_pin on pin 10; adjudicated as a source error against PJRC's official pinout card ('All digital pins have Interrupt capability') — see the teensy_pin_functions note on pin_10.",
      },
    },
  ],
});

// Analog inputs — pins whose source function list includes Analog_read_pin.
const analogInput = composed({
  id: "analog_input",
  name: "Analog Pins (Read)",
  protocolType: "analog",
  roles: ["input"],
  slots: [
    { id: "channel", required: true, match: { protocol: "analog", role: "input", capability: "analog_in" } },
  ],
  traits: [
    sourceProtocol("analog", "receiver"),
    {
      type: "channels",
      params: {
        count: 10,
        mapping: "Pins 14-23 carry the Analog_read_pin function.",
        note: "The source assigns no A0-A9 channel names and no ADC resolution/reference figures.",
      },
    },
    {
      type: "co_requirement",
      params: {
        with: "3v3_power_output",
        condition: "analog measurements in use",
        effect: "Verify analog reference voltage (ProtoPart validation requirement).",
      },
    },
  ],
});

// I2C master — SDA/SCL route to two candidate pins each; the source does not
// pair them into controllers, so the combination space stays open.
const i2cMaster = composed({
  id: "i2c_master",
  name: "I2C Master (SDA/SCL)",
  protocolType: "i2c",
  roles: ["master"],
  slots: [
    { id: "sda", required: true, match: { protocol: "i2c", role: "data", capability: "i2c_sda" } },
    { id: "scl", required: true, match: { protocol: "i2c", role: "clock", capability: "i2c_scl" } },
  ],
  traits: [
    {
      type: "instance_combinations",
      params: {
        combination_space: "SDA: pin 17 or pin 18; SCL: pin 16 or pin 19. The source declares function eligibility only — no controller pairings and no bus clock figure.",
      },
    },
    {
      type: "implied_passives",
      params: {
        purpose: "Open-drain bus pull-ups",
        components: [
          { kind: "resistor", value: "value per bus (source does not quantify)", connection: "SDA and SCL to the bus supply" },
        ],
        source: "ProtoPart design rules: 'Use external pull-up resistors for I2C communication'",
      },
    },
  ],
});

// SPI master — the only peripheral the source pins to exactly one pin per
// signal: MOSI=11, MISO=12, SCK=13, CS=10.
const spiMaster = amend(
  SPI({
    id: "spi_master_miso", // ProtoPart interface id, kept verbatim
    name: "SPI Master (MISO/MOSI/SCK/CS)",
    roles: ["master"],
    profiles: [
      {
        id: "spi_main_pins",
        label: "MOSI=11 / MISO=12 / SCK=13 / CS=10",
        mosi: "pin_11",
        miso: "pin_12",
        sck: "pin_13",
        ss: "pin_10",
      },
    ],
  }),
  "spi_master_miso",
  [
    {
      type: "source_discrepancy",
      params: {
        field: "spi_master_miso protocol/requires",
        raw_protocol: { type: "spi", role: "slave" },
        raw_requires: ["MISO x1", "MISO x1", "SCK x1", "CS x1"],
        note: "The source names and describes this interface as 'SPI Master (MISO/MOSI/SCK/CS)' but records protocol role 'slave' and lists MISO twice (once presumably intended as MOSI). Roles here follow the interface's own name/description; the raw fields are preserved verbatim for audit.",
        resolution:
          "Adjudicated against PJRC's official Teensy 4.1 pinout card (card11a_rev4, https://www.pjrc.com/teensy/pinout.html): pins 10=CS, 11=MOSI, 12=MISO, 13=SCK form the board's main SPI port, with distinct MOSI and MISO signals — the board acts as SPI controller (master) on this port. The 'slave' role and duplicated MISO are source transcription errors; the 'master' role and the MOSI=11/MISO=12/SCK=13/CS=10 profile used here match the official card.",
      },
    },
    {
      type: "signal_integrity",
      params: {
        note: "Keep signal wires short for high-speed interfaces.",
        source: "ProtoPart pjrc-teensy-4-1 design_rules",
      },
    },
  ],
);

// PWM — one slot, any pin whose source function list includes PWM.
const pwmPins = composed({
  id: "pwm_pins",
  name: "PWM Pins",
  protocolType: "pwm",
  roles: ["output"],
  slots: [
    { id: "channel", required: true, match: { protocol: "pwm", role: "output", capability: "pwm_out" } },
  ],
  traits: [
    sourceProtocol("pwm", "transmitter"),
    {
      type: "channels",
      params: {
        count: 20,
        mapping: "Pins 0-15, 18, 19, 22 and 23 carry the PWM function (pins 16, 17, 20, 21 do not).",
        note: "The source assigns no PWM frequency or resolution figures.",
      },
    },
  ],
});

// Digital Audio 1 — OUT1/IN1/LRCLK1/BCLK1. OUT1 has three candidate pins, so
// no unique profile exists; MCLK1 (pin 23) is a pin function the source
// interface does not require.
const digitalAudio1 = composed({
  id: "digital_audio",
  name: "Digital Audio 1",
  protocolType: "digital_audio",
  roles: ["transmitter"],
  slots: [
    { id: "out", required: true, label: "OUT1", match: { capability: "audio1_out" } },
    { id: "in", required: true, label: "IN1", match: { capability: "audio1_in" } },
    { id: "lrclk", required: true, label: "LRCLK1", match: { capability: "audio1_lrclk" } },
    { id: "bclk", required: true, label: "BCLK1", match: { capability: "audio1_bclk" } },
  ],
  traits: [
    {
      type: "instance_combinations",
      params: {
        combination_space: "OUT1: pin 6, 7 or 9; IN1: pin 8; LRCLK1: pin 20; BCLK1: pin 21.",
        note: "MCLK1 is available on pin 23 per the source pin-function list, but the source's Digital Audio 1 interface does not require it — it is left as an unconsumed capability (audio1_mclk).",
      },
    },
  ],
});

// Digital Audio 2 — OUT2/IN2/LRCLK2/BCLK2, each on exactly one pin.
const digitalAudio2 = composed({
  id: "digital_audio_2",
  name: "Digital Audio 2",
  protocolType: "digital_audio",
  roles: ["transmitter"],
  slots: [
    { id: "out", required: true, label: "OUT2", match: { capability: "audio2_out" } },
    { id: "in", required: true, label: "IN2", match: { capability: "audio2_in" } },
    { id: "lrclk", required: true, label: "LRCLK2", match: { capability: "audio2_lrclk" } },
    { id: "bclk", required: true, label: "BCLK2", match: { capability: "audio2_bclk" } },
  ],
  profiles: [
    {
      id: "digital_audio_2_pins",
      label: "OUT2=2 / LRCLK2=3 / BCLK2=4 / IN2=5",
      bindings: { out: "pin_2", in: "pin_5", lrclk: "pin_3", bclk: "pin_4" },
    },
  ],
});

// S/PDIF — digital audio over single coax, out on pin 14, in on pin 15.
const spdif = composed({
  id: "digital_audio_over_single_coax",
  name: "Digital Audio Over Single Coax",
  protocolType: "digital_audio_over_single_coax",
  roles: ["transmitter"],
  slots: [
    { id: "out", required: true, label: "S/PDIF_Out", match: { capability: "spdif_out" } },
    { id: "in", required: true, label: "S/PDIF_In", match: { capability: "spdif_in" } },
  ],
  profiles: [
    {
      id: "spdif_pins",
      label: "S/PDIF Out=14 / In=15",
      bindings: { out: "pin_14", in: "pin_15" },
    },
  ],
});

// Medium Quality Sound — MQSL on pin 12, MQSR on pin 10.
const mqs = composed({
  id: "Medium_Quality_Sound_Output", // ProtoPart interface id, kept verbatim
  name: "Medium Quality Sound",
  protocolType: "medium_quality_sound_output",
  roles: ["transmitter"],
  slots: [
    { id: "left", required: true, label: "MQSL", match: { capability: "mqs_l" } },
    { id: "right", required: true, label: "MQSR", match: { capability: "mqs_r" } },
  ],
  profiles: [
    {
      id: "mqs_pins",
      label: "MQSL=12 / MQSR=10",
      bindings: { left: "pin_12", right: "pin_10" },
    },
  ],
});

// Serial ports — one RX + one TX per port; the source declares eligibility
// per function name only (no Serial1..Serial8 pairings, no baud figures).
const serialPorts = amend(
  UART({
    id: "Serial_ports", // ProtoPart interface id, kept verbatim
    name: "Serial Ports",
  }),
  "Serial_ports",
  [
    sourceProtocol("serial_ports", "transmitter"),
    {
      type: "instance_combinations",
      params: {
        combination_space: "Serial_RX: pins 0, 7, 15, 16, 21; Serial_TX: pins 1, 8, 14, 17, 20. The source declares no fixed RX/TX pairings and no baud-rate figures.",
      },
    },
  ],
);

// CAN bus — TX/RX eligibility only; the source declares no controller pairings.
const canBus = composed({
  id: "can_bus",
  name: "CAN Bus",
  protocolType: "can",
  roles: ["transceiver"],
  slots: [
    { id: "tx", required: true, label: "CAN_TX", match: { capability: "can_tx" } },
    { id: "rx", required: true, label: "CAN_RX", match: { capability: "can_rx" } },
  ],
  traits: [
    {
      type: "instance_combinations",
      params: {
        combination_space: "CAN_TX: pin 1 or 22; CAN_RX: pin 0 or 23. The source declares no controller pairings and no bit-rate figures.",
        note: "Pins 11 and 13 additionally list verbatim 'CTX'/'CRX' functions that no source interface requires; they are preserved as display data only (see teensy_pin_functions).",
      },
    },
  ],
});

// USB device — 480 Mbit/s (PJRC spec: "USB device 480 Mbit/sec speed"; the
// ProtoPart source wrote "480 MHz" — same 480e6 signaling figure, kept as
// the maxFrequencyHz parameter), max one connection, on the USB connector.
const usbDevice = composed({
  id: "usb_device",
  name: "Usb Device",
  protocolType: "usb",
  roles: ["device"],
  parameters: [maxFrequencyHz(480_000_000)],
  slots: [
    { id: "connector", required: true, match: { capability: "usb_connector" } },
  ],
  profiles: [
    { id: "usb_device_connector", label: "On-board USB connector", bindings: { connector: "usb_5v" } },
  ],
  maxInstances: 1, // constraints.max_connections: 1
  traits: [
    {
      type: "source_constraints",
      params: {
        exclusive: false,
        max_connections: 1,
        requires_matching_voltage_domain: false,
        source: "ProtoPart pjrc-teensy-4-1 usb_device interface constraints",
      },
    },
    {
      type: "programming_path",
      params: {
        note: "Connect via USB and ensure board is recognized; run a blink test on the built-in LED.",
        source: "ProtoPart pjrc-teensy-4-1 validation_requirements",
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

export const PJRC_TEENSY_4_1: ModuleDef = defineModule({
  id: "pjrc-teensy-4-1",
  name: "PJRC Teensy 4.1",
  version: "1.0.0",
  manufacturer: "PJRC",
  part_number: "TEENSY41",
  description:
    "PJRC Teensy 4.1 high-performance microcontroller development board based on NXP i.MX RT1062 ARM Cortex-M7. Ultra-fast 600MHz processor with extensive I/O capabilities.",
  tags: ["mcu", "board", "3v3", "usb", "arm", "cortex-m7", "teensy", "microcontroller", "high-performance", "600mhz"],
  categories: ["microcontroller.teensy"],

  interfaces: [
    // All edge pins the ProtoPart source defines, in source order:
    // USB / VIN / 3.3V x2 / GND x2, then header pins 0-23.
    ...pins,

    // Power delivery
    powerOutput3v3,

    // General-purpose I/O
    digitalPins,
    analogInput,
    pwmPins,

    // Serial / bus controllers
    i2cMaster,
    ...spiMaster,
    ...serialPorts,
    canBus,

    // Audio
    digitalAudio1,
    digitalAudio2,
    spdif,
    mqs,

    // Connectivity
    usbDevice,
  ],

  interfaceGroups: [
    {
      id: "power_sources",
      label: "Power Sources (mutually exclusive per design rule)",
      members: ["usb_5v", "vin"],
      policy: "one_of",
    },
    {
      id: "regulated_3v3_common_net",
      label: "3.3V Output Pins (one regulator net)",
      members: ["3v3_out_1", "3v3_out_2"],
      policy: "all_of",
    },
    {
      id: "ground_common_net",
      label: "Ground Pins (one ground net)",
      members: ["gnd1", "gnd2"],
      policy: "all_of",
    },
  ],

  requirements: [
    {
      type: "power",
      description:
        "Power from exactly one source: USB (4.5-5.5 V, ≤500 mA, regulated with built-in protection) or VIN (3.6-5.5 V per PJRC's official pinout card 'Vin (3.6 to 5.5 volts)'; the ProtoPart power domain said 3.6-5 V and its design rule 4.5-6 V — see the source_discrepancy trait on vin). Provide stable 5V supply to VIN with sufficient decoupling.",
      voltage_V: 5,
      current_mA: 500,
    },
    {
      type: "interface",
      description:
        "Programming and validation path: connect via USB and ensure the board is recognized (Teensyduino, PlatformIO, or a direct ARM toolchain per the source usage notes).",
      interface_protocol: "usb",
    },
  ],

  domains: [
    {
      domain: "electrical",
      power_domains: [
        { id: "usb_5v", name: "USB 5V", nominal_voltage_V: 5, voltage_range_V: USB_5V_RANGE, max_current_mA: 500, regulation_type: "regulated" },
        { id: "vin", name: "VIN (Raw Input)", nominal_voltage_V: 5, voltage_range_V: VIN_RANGE, max_current_mA: 500, regulation_type: "unregulated" },
        { id: "regulated_3v3", name: "Regulated 3.3V", nominal_voltage_V: 3.3, max_current_mA: 250, regulation_type: "regulated" },
      ],
      metadata: {
        // ProtoPart power-domain fields with no PowerDomainDef home:
        power_domain_details: {
          usb_5v: {
            voltage_tolerance_percent: 10,
            isolation_type: "non_isolated",
            ground_reference: "common",
            efficiency_percent: 90,
            voltage_ripple_mV: 50,
            compatible_domains: [],
            description: "USB-supplied power with built-in protection",
          },
          vin: {
            voltage_tolerance_percent: 10,
            isolation_type: "non_isolated",
            ground_reference: "common",
            efficiency_percent: 85,
            voltage_ripple_mV: 100,
            compatible_domains: [],
            description: "External power input through VIN pin",
          },
          regulated_3v3: {
            voltage_tolerance_percent: 6,
            isolation_type: "non_isolated",
            ground_reference: "common",
            efficiency_percent: 85,
            voltage_ripple_mV: 5,
            compatible_domains: ["usb_5v", "vin"],
            description: "3.3V output for CPU and low-power external devices",
          },
        },
        modeled_edge_pins: 30,
        header_io_pins: 24,
        io_voltage: "3.3 V only — NOT 5 V tolerant; never exceed 3.6 V on any I/O pin",
        per_pin_current_mA: { design_rule_max: PIN_MAX_MA, continuous_guidance: [4, 6], pjrc_recommended_max_output: 4 },
        cpu: "NXP i.MX RT1062 ARM Cortex-M7, 600 MHz (dynamic clock scaling; can be overclocked beyond 600 MHz per source usage notes)",
        source: "ProtoPart pjrc-teensy-4-1 definition (schema 1.4.0, version 0.4.0)",
      },
    },
    {
      domain: "mechanical",
      dimensions_mm: { length: 61, width: 18, height: 5 },
      weight_g: 5,
      metadata: {
        package_type: "PCB Module",
        mounting_method: "breadboard",
        enclosure_type: "open_pcb",
        assembly_time_min: 2,
        field_serviceable: true,
        mount_holes: [],
        note: "The ProtoPart source defines no mechanical resources or interfaces (no mounting interface is modeled). Form factor does not match Arduino shield layouts, but adapter boards exist (source compatibility notes).",
      },
    },
    {
      domain: "thermal",
      operating_temperature_C: [-40, 85],
      metadata: {
        thermal_design_power_W: 1,
        requires_thermal_management: false,
        thermal_monitoring_available: false,
        cooling_method: "passive",
        note: "The high-speed MCU can warm up under load; the 3.3V regulator may dissipate heat at high currents (source warnings).",
      },
    },
  ],

  traits: [
    {
      type: "terminology_policy",
      params: {
        note: "Interface ids and display names are ProtoPart-verbatim (including 'Serial_ports', 'Medium_Quality_Sound_Output', and 'spi_master_miso'). Protocol types/roles were normalised to the canonical builder vocabulary only where a canonical equivalent exists (serial_ports→uart; transmitter/receiver→output/input for digital, analog and pwm); every normalised raw descriptor is preserved in a source_protocol or source_discrepancy trait. Pin function names in teensy_pin_functions traits are source-verbatim and NOT normalised.",
      },
    },
    {
      type: "source_coverage",
      params: {
        note: "The ProtoPart source defines only the USB connector, VIN, two 3.3V pins, two GND pins, and header pins 0-23. It does not define pins 24-41, VBAT/ON-OFF/PROGRAM pins, the micro-SD slot (mentioned only in the source usage notes), the USB host pads, the Ethernet PHY pads, or the PSRAM/flash expansion pads — those board features are therefore not modeled here.",
      },
    },
    {
      type: "design_rules",
      params: {
        source: "ProtoPart pjrc-teensy-4-1 design_rules (verbatim)",
        rules: [
          "Maximum 15mA per I/O pin",
          "Maximum current for all I/O is limited",
          "VIN must be 4.5-6V when using external power",
          "USB and VIN power sources are mutually exclusive",
          "Do not exceed 3.6V on any I/O pin",
          "Use external pull-up resistors for I2C communication",
          "Ensure proper decoupling capacitors for stable operation",
          "All I/O pins are 3.3V only and NOT 5V tolerant",
          "Provide stable 5V supply to VIN with sufficient decoupling",
          "Keep signal wires short for high-speed interfaces",
        ],
      },
    },
    {
      type: "validation_requirements",
      params: {
        source: "ProtoPart pjrc-teensy-4-1 validation_requirements (verbatim)",
        requirements: [
          "Check power supply compatibility",
          "Verify I/O voltage levels",
          "Validate current limits",
          "Check communication protocol compatibility",
          "Ensure proper grounding",
          "Verify analog reference voltage",
          "Connect via USB and ensure board is recognized",
          "Run a blink test on the built-in LED",
          "Test each used interface with appropriate examples",
        ],
      },
    },
    {
      type: "warnings",
      params: {
        source: "ProtoPart pjrc-teensy-4-1 warnings (verbatim)",
        warnings: [
          "Never apply more than 3.3V to any I/O pin",
          "I/O pins are not 5V tolerant",
          "Maximum current per pin is around 4-6mA for continuous draw",
          "If you need to drive an LED or other load, use a transistor or MOSFET",
          "The high-speed MCU can warm up under load",
          "The 3.3V regulator can supply up to 1A but may dissipate heat at high currents",
          "Be cautious of the small components and the SD card slot",
        ],
      },
    },
    {
      type: "usage_notes",
      params: {
        source: "ProtoPart pjrc-teensy-4-1 usage_notes (verbatim)",
        note: "Requires the Teensyduino extension or compatible support to program using the Arduino IDE. The board can also be used with PlatformIO or direct ARM toolchains. The MCU supports dynamic clock scaling. The Teensy 4.1 can be overclocked beyond 600MHz for more performance. The built-in SD card slot allows for convenient data logging.",
      },
    },
    {
      type: "compatibility_notes",
      params: {
        source: "ProtoPart pjrc-teensy-4-1 compatibility_notes (verbatim)",
        note: "Software: Most Arduino sketches will compile and run, but direct hardware register manipulation must be adapted to the NXP i.MX RT1062's registers. Many Arduino libraries have Teensy 4 support. Hardware: The form factor doesn't match Arduino shield layouts, but adapter boards exist. Most 3.3V sensors and modules can connect directly.",
      },
    },
    {
      type: "application_examples",
      params: {
        source: "ProtoPart pjrc-teensy-4-1 application_examples (verbatim)",
        examples: [
          "Advanced robotics and drones with high-speed control loops",
          "Digital audio workstations or synthesizers",
          "LED stage lighting or art installations",
          "Scientific instrumentation and data acquisition",
          "IoT edge devices requiring significant processing",
        ],
      },
    },
  ],

  artifacts: [
    {
      id: "art_datasheet",
      name: "PJRC Teensy Datasheets",
      type: "datasheet",
      url: "https://www.pjrc.com/teensy/datasheets.html",
    },
    {
      id: "art_thumbnail",
      name: "Teensy 4.1 Thumbnail",
      type: "custom",
      filePath: "./ProtoPart/protoparts/pjrc-teensy-4-1/thumbnail.png",
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
