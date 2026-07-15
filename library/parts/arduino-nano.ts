/**
 * Arduino Nano (A000005) — ProtoPart-honest part definition.
 *
 * Primary source: ProtoPart definition `protoparts/arduino-nano/definition.json`
 * (schema 1.4.0, definition version 0.4.0) — the audited source of truth.
 *   - electrical domain: 30 resources (pin_count 30), 10 interfaces,
 *     6 power domains (VIN, USB 5V, Regulated 5V, Regulated 3.3V,
 *     Digital I/O, Analog Reference)
 *   - mechanical domain: 4× M3 mounting holes + PCB mounting interface,
 *     45 × 18 × 7 mm, 7 g
 *   - thermal domain: -40..85 °C, 0.5 W TDP, passive cooling
 *   - top-level warnings / design_rules / usage_notes / application_examples /
 *     compatibility_notes / validation_requirements (preserved as module traits)
 * Secondary source (cited, not mined for new values): Arduino Nano datasheet,
 * https://docs.arduino.cc/resources/datasheets/A000005-datasheet.pdf
 *
 * Architecture notes honoured by this file:
 *   - Pin-honest like a schematic: all 30 ProtoPart electrical resources are
 *     leaf interfaces, in ProtoPart resource order, with the resource id as
 *     the interface id. The source definition carries NO physical package pin
 *     designators (unlike the ESP32 gold standard), so `pin` numbers are
 *     deliberately omitted rather than invented — see the audit report.
 *   - Every pin carries its verbatim ProtoPart description and function list
 *     in a `nano_pin_functions` trait — display data is separated from the
 *     canonical capability tags the matching engine needs.
 *   - Buses/archetypes are composed interfaces with slots; the fixed
 *     silicon routings (SDA=A4/SCL=A5, SPI on D10-D13, UART on D0/D1, the
 *     two power sources and two regulated rails) are captured as profiles.
 *   - ProtoPart `constraints` blocks (max_connections,
 *     requires_matching_voltage_domain) and bus flags (exclusive,
 *     supports_clock_stretching, pullups_on_master) are preserved as traits.
 *   - Implied passives (`implied_passives` trait): 4.7 kΩ I²C bus pull-ups
 *     from `recommended_pullup_res_kΩ` on A4/A5 and the design rule "Use
 *     external pull-up resistors for I2C communication".
 *   - Mutual exclusions: VIN vs USB power ("USB and VIN power sources are
 *     mutually exclusive") is an interfaceGroup `one_of` plus a
 *     co_requirement trait; the three UART views (transceiver/TX-only/
 *     RX-only) share the D0/D1 pins and form a `one_of` group.
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
  I2C,
  Pin,
  PowerIn,
  PowerOut,
  SPI,
  UART,
  baudRate,
  defineModule,
  maxCurrentA,
  voltageRangeV,
  voltageV,
} from "../../src/protocols/index.js";

// ---------------------------------------------------------------------------
// Electrical constants — ProtoPart electrical domain `power_domains`
// ---------------------------------------------------------------------------

/** Verbatim citation used by every `nano_pin_functions` trait below. */
const SOURCE = "ProtoPart arduino-nano definition.json (schema 1.4.0)";

/** "VIN (Raw Input)": 7-12 V unregulated, nominal 9 V, max 500 mA. */
const VIN_RANGE: [number, number] = [7, 12];
/** "USB 5V": 4.5-5.5 V regulated, nominal 5 V, max 500 mA. */
const USB_RANGE: [number, number] = [4.5, 5.5];
/** "Digital I/O": 5 V logic, 4.5-5.5 V range, 40 mA per-pin domain limit. */
const DIGITAL_IO_RANGE: [number, number] = [4.5, 5.5];
/**
 * "Analog Reference": 1.1-5.5 V, nominal 5 V — the ADC reference span the
 * ProtoPart definition assigns to A0-A7 and AREF (not a logic-level spec).
 */
const ANALOG_REF_RANGE: [number, number] = [1.1, 5.5];

/** ProtoPart `io_drive_strength_mA` on every digital-capable pin. */
const IO_DRIVE_MA = 40;

type NanoPowerDomain = "digital_io" | "analog_ref";

const DOMAIN_VOLTAGE: Record<NanoPowerDomain, [number, number]> = {
  digital_io: DIGITAL_IO_RANGE,
  analog_ref: ANALOG_REF_RANGE,
};

/** ProtoPart `has_internal_pullup: true` — no resistance value is given. */
const INTERNAL_PULLUP_TRAIT: TraitDef = {
  type: "internal_pulls",
  params: {
    pull_up_available: true,
    pull_up_resistance_kohm: [20, 50],
    note: "Resistance not specified in the source definition (has_internal_pullup: true only; no pull-down is claimed). Resolved from the ATmega328P datasheet, Common DC Characteristics: I/O-pin pull-up resistor Rpu = 20-50 kOhm (the RESET pull-up RRST is 30-60 kOhm).",
    source: `${SOURCE}; ATmega328P datasheet (Microchip), Electrical Characteristics — Common DC Characteristics`,
  },
};

/** ProtoPart per-interface `constraints` block, preserved verbatim. */
function connectionConstraints(
  maxConnections: number,
  requiresMatchingVoltageDomain: boolean,
): TraitDef {
  return {
    type: "connection_constraints",
    params: {
      max_connections: maxConnections,
      requires_matching_voltage_domain: requiresMatchingVoltageDomain,
      source: SOURCE,
    },
  };
}

// ---------------------------------------------------------------------------
// ProtoPart-honest per-pin metadata
// ---------------------------------------------------------------------------

interface NanoPinSpec {
  /** ProtoPart resource id — kept as the interface id. */
  id: string;
  /** Short display name derived from the resource id + functions. */
  name: string;
  /** Verbatim ProtoPart resource description. */
  description: string;
  /** Verbatim ProtoPart function names. */
  functions: string[];
  domain: NanoPowerDomain;
  /** General-purpose digital I/O (default true; A6/A7 are analog-only). */
  digital?: boolean;
  analogIn?: boolean;
  pwm?: boolean;
  interrupt?: boolean;
  i2cSda?: boolean;
  i2cScl?: boolean;
  spiMosi?: boolean;
  spiMiso?: boolean;
  spiSck?: boolean;
  spiSs?: boolean;
  uartRx?: boolean;
  uartTx?: boolean;
  /** D13 carries the ProtoPart "led" function (built-in LED). */
  led?: boolean;
  /** ProtoPart `has_internal_pullup`. */
  internalPullup?: boolean;
  /** ProtoPart `io_drive_strength_mA`. */
  driveCurrentmA?: number;
  traits?: TraitDef[];
}

/** Build one schematic-honest header pin from its ProtoPart resource. */
function nanoPin(spec: NanoPinSpec): InterfaceDef {
  const base = Pin({
    id: spec.id,
    name: spec.name,
    voltageV: DOMAIN_VOLTAGE[spec.domain],
    ...(spec.driveCurrentmA !== undefined ? { driveCurrentmA: spec.driveCurrentmA } : {}),
    capabilities: {
      digital: spec.digital ?? true,
      analogIn: spec.analogIn,
      pwm: spec.pwm,
      interrupt: spec.interrupt,
      i2cSda: spec.i2cSda,
      i2cScl: spec.i2cScl,
      spiMosi: spec.spiMosi,
      spiMiso: spec.spiMiso,
      spiSck: spec.spiSck,
      spiSs: spec.spiSs,
      uartRx: spec.uartRx,
      uartTx: spec.uartTx,
    },
  });

  const capabilities = [
    ...(base.capabilities ?? []),
    ...(spec.led ? ["led"] : []),
  ];

  const traits: TraitDef[] = [
    {
      type: "nano_pin_functions",
      params: {
        source: SOURCE,
        description: spec.description,
        functions: spec.functions,
      },
    },
    { type: "power_domain", params: { domain: spec.domain } },
    ...(spec.internalPullup ? [INTERNAL_PULLUP_TRAIT] : []),
    ...(spec.traits ?? []),
  ];

  return { ...base, capabilities, traits };
}

// ---------------------------------------------------------------------------
// Digital pins D0-D13 — ProtoPart resources d0..d13, in resource order
// ---------------------------------------------------------------------------

const DIGITAL_PIN_SPECS: NanoPinSpec[] = [
  {
    id: "d0", name: "D0 / RX", description: "Digital pin 0 / UART RX",
    functions: ["digital_io", "uart_rx"], domain: "digital_io",
    uartRx: true, internalPullup: true, driveCurrentmA: IO_DRIVE_MA,
  },
  {
    id: "d1", name: "D1 / TX", description: "Digital pin 1 / UART TX",
    functions: ["digital_io", "uart_tx"], domain: "digital_io",
    uartTx: true, internalPullup: true, driveCurrentmA: IO_DRIVE_MA,
  },
  {
    id: "d2", name: "D2", description: "Digital pin 2 / External interrupt",
    functions: ["digital_io", "interrupt"], domain: "digital_io",
    interrupt: true, internalPullup: true, driveCurrentmA: IO_DRIVE_MA,
  },
  {
    id: "d3", name: "D3", description: "Digital pin 3 / PWM / External interrupt",
    functions: ["digital_io", "pwm", "interrupt"], domain: "digital_io",
    pwm: true, interrupt: true, internalPullup: true, driveCurrentmA: IO_DRIVE_MA,
  },
  {
    id: "d4", name: "D4", description: "Digital pin 4",
    functions: ["digital_io"], domain: "digital_io",
    internalPullup: true, driveCurrentmA: IO_DRIVE_MA,
  },
  {
    id: "d5", name: "D5", description: "Digital pin 5 / PWM",
    functions: ["digital_io", "pwm"], domain: "digital_io",
    pwm: true, internalPullup: true, driveCurrentmA: IO_DRIVE_MA,
  },
  {
    id: "d6", name: "D6", description: "Digital pin 6 / PWM",
    functions: ["digital_io", "pwm"], domain: "digital_io",
    pwm: true, internalPullup: true, driveCurrentmA: IO_DRIVE_MA,
  },
  {
    id: "d7", name: "D7", description: "Digital pin 7",
    functions: ["digital_io"], domain: "digital_io",
    internalPullup: true, driveCurrentmA: IO_DRIVE_MA,
  },
  {
    id: "d8", name: "D8", description: "Digital pin 8",
    functions: ["digital_io"], domain: "digital_io",
    internalPullup: true, driveCurrentmA: IO_DRIVE_MA,
  },
  {
    id: "d9", name: "D9", description: "Digital pin 9 / PWM",
    functions: ["digital_io", "pwm"], domain: "digital_io",
    pwm: true, internalPullup: true, driveCurrentmA: IO_DRIVE_MA,
  },
  {
    id: "d10", name: "D10 / SS", description: "Digital pin 10 / PWM / SPI SS",
    functions: ["digital_io", "pwm", "spi_ss"], domain: "digital_io",
    pwm: true, spiSs: true, internalPullup: true, driveCurrentmA: IO_DRIVE_MA,
  },
  {
    id: "d11", name: "D11 / MOSI", description: "Digital pin 11 / PWM / SPI MOSI",
    functions: ["digital_io", "pwm", "spi_mosi"], domain: "digital_io",
    pwm: true, spiMosi: true, internalPullup: true, driveCurrentmA: IO_DRIVE_MA,
  },
  {
    id: "d12", name: "D12 / MISO", description: "Digital pin 12 / SPI MISO",
    functions: ["digital_io", "spi_miso"], domain: "digital_io",
    spiMiso: true, internalPullup: true, driveCurrentmA: IO_DRIVE_MA,
  },
  {
    id: "d13", name: "D13 / SCK / LED", description: "Digital pin 13 / SPI SCK / Built-in LED",
    functions: ["digital_io", "spi_sck", "led"], domain: "digital_io",
    spiSck: true, led: true, internalPullup: true, driveCurrentmA: IO_DRIVE_MA,
    traits: [
      { type: "onboard_indicator", params: { indicator: "Built-in LED on D13", source: SOURCE } },
    ],
  },
];

// ---------------------------------------------------------------------------
// Analog pins A0-A7 — ProtoPart resources a0..a7 (A6/A7 are analog-only)
// ---------------------------------------------------------------------------

/** 4.7 kΩ pull-up from ProtoPart `recommended_pullup_res_kΩ` on A4/A5. */
function i2cPullupTrait(signal: "SDA" | "SCL", pinName: string): TraitDef {
  return {
    type: "implied_passives",
    params: {
      purpose: "I²C bus pull-up (the master provides none)",
      components: [
        { kind: "resistor", value: "4.7 kΩ (recommended)", connection: `${signal} (${pinName}) to the bus supply` },
      ],
      source: `${SOURCE}: recommended_pullup_res_kΩ = 4.7; design rule "Use external pull-up resistors for I2C communication"`,
    },
  };
}

const ANALOG_PIN_SPECS: NanoPinSpec[] = [
  {
    id: "a0", name: "A0", description: "Analog pin A0 / Digital I/O",
    functions: ["analog_input", "digital_io"], domain: "analog_ref",
    analogIn: true, internalPullup: true, driveCurrentmA: IO_DRIVE_MA,
  },
  {
    id: "a1", name: "A1", description: "Analog pin A1 / Digital I/O",
    functions: ["analog_input", "digital_io"], domain: "analog_ref",
    analogIn: true, internalPullup: true, driveCurrentmA: IO_DRIVE_MA,
  },
  {
    id: "a2", name: "A2", description: "Analog pin A2 / Digital I/O",
    functions: ["analog_input", "digital_io"], domain: "analog_ref",
    analogIn: true, internalPullup: true, driveCurrentmA: IO_DRIVE_MA,
  },
  {
    id: "a3", name: "A3", description: "Analog pin A3 / Digital I/O",
    functions: ["analog_input", "digital_io"], domain: "analog_ref",
    analogIn: true, internalPullup: true, driveCurrentmA: IO_DRIVE_MA,
  },
  {
    id: "a4", name: "A4 / SDA", description: "Analog pin A4 / Digital I/O / I2C SDA",
    functions: ["analog_input", "digital_io", "i2c_sda"], domain: "analog_ref",
    analogIn: true, i2cSda: true, internalPullup: true, driveCurrentmA: IO_DRIVE_MA,
    traits: [i2cPullupTrait("SDA", "A4")],
  },
  {
    id: "a5", name: "A5 / SCL", description: "Analog pin A5 / Digital I/O / I2C SCL",
    functions: ["analog_input", "digital_io", "i2c_scl"], domain: "analog_ref",
    analogIn: true, i2cScl: true, internalPullup: true, driveCurrentmA: IO_DRIVE_MA,
    traits: [i2cPullupTrait("SCL", "A5")],
  },
  {
    // A6/A7: analog_input is the only ProtoPart function — no digital I/O,
    // no internal pull-up, no drive-strength rating in the source.
    id: "a6", name: "A6", description: "Analog pin A6",
    functions: ["analog_input"], domain: "analog_ref",
    digital: false, analogIn: true,
  },
  {
    id: "a7", name: "A7", description: "Analog pin A7",
    functions: ["analog_input"], domain: "analog_ref",
    digital: false, analogIn: true,
  },
];

// ---------------------------------------------------------------------------
// Power, reference, and reset pins — ProtoPart resources, in resource order
// ---------------------------------------------------------------------------

const vinPin: InterfaceDef = {
  ...PowerIn({ id: "vin", name: "VIN", voltageV: VIN_RANGE, nominalV: 9, maxCurrentA: 0.5 }),
  capabilities: ["power_in", "power_input"],
  traits: [
    {
      type: "nano_pin_functions",
      params: { source: SOURCE, description: "External power input pin", functions: ["power_input"] },
    },
    {
      type: "power_domain",
      params: {
        domain: "vin",
        regulation_type: "unregulated",
        note: "VIN (Raw Input): 7-12 V, nominal 9 V, max 500 mA, ±10% tolerance, 100 mV ripple, 85% downstream efficiency.",
      },
    },
  ],
};

const usb5vPin: InterfaceDef = {
  ...PowerIn({ id: "usb_5v", name: "USB 5V", voltageV: USB_RANGE, nominalV: 5, maxCurrentA: 0.5 }),
  capabilities: ["power_in", "power_input"],
  traits: [
    {
      type: "nano_pin_functions",
      params: { source: SOURCE, description: "USB power input", functions: ["power_input"] },
    },
    { type: "connector", params: { connector_type: "usb" } },
    {
      type: "power_domain",
      params: {
        domain: "usb_5v",
        regulation_type: "regulated",
        note: "USB-supplied power with built-in protection: 4.5-5.5 V, max 500 mA, ±10% tolerance, 50 mV ripple.",
      },
    },
  ],
};

const fiveVOutPin: InterfaceDef = {
  ...PowerOut({ id: "5v_out", name: "5V", voltageV: 5, maxCurrentA: 0.8 }),
  capabilities: ["power_out", "power_output"],
  traits: [
    {
      type: "nano_pin_functions",
      params: { source: SOURCE, description: "5V power output pin", functions: ["power_output"] },
    },
    { type: "power_domain", params: { domain: "regulated_5v" } },
  ],
};

const threeV3OutPin: InterfaceDef = {
  ...PowerOut({ id: "3v3_out", name: "3V3", voltageV: 3.3, maxCurrentA: 0.05 }),
  capabilities: ["power_out", "power_output"],
  traits: [
    {
      type: "nano_pin_functions",
      params: { source: SOURCE, description: "3.3V power output pin", functions: ["power_output"] },
    },
    {
      type: "power_domain",
      params: {
        domain: "regulated_3v3",
        note: "Low-power 3.3V output for sensors and low-power devices — max 50 mA. Corrected from ProtoPart's 150 mA: the Arduino Nano user manual (pin 17) states the 3V3 pin is '+3.3V output (from FTDI)', and the FTDI FT232R datasheet rates the 3V3OUT LDO at 50 mA maximum external load.",
      },
    },
  ],
};

/**
 * Two ground pins. The ProtoPart definition associates gnd1 with the
 * regulated_5v domain and gnd2 with regulated_3v3 (all domains share
 * `ground_reference: "common"`); the association is carried verbatim.
 */
function groundPin(n: 1 | 2, powerDomainId: string): InterfaceDef {
  return {
    ...Ground({ id: `gnd${n}`, name: "GND" }),
    traits: [
      {
        type: "nano_pin_functions",
        params: { source: SOURCE, description: `Ground pin ${n}`, functions: ["ground"] },
      },
      { type: "power_domain", params: { domain: powerDomainId, ground_reference: "common" } },
    ],
  };
}

const arefPin: InterfaceDef = {
  id: "aref",
  name: "AREF",
  domain: "electrical",
  exposed: true,
  default_active: true,
  protocols: [{ type: "analog", roles: ["input"] }],
  capabilities: ["analog_reference"],
  parameters: [
    voltageRangeV(ANALOG_REF_RANGE[0], ANALOG_REF_RANGE[1]),
    { id: "max_current", name: "Analog-reference domain max current", unit: "mA", value: 1 },
  ],
  traits: [
    {
      type: "nano_pin_functions",
      params: { source: SOURCE, description: "Analog reference voltage input", functions: ["analog_reference"] },
    },
    {
      type: "power_domain",
      params: {
        domain: "analog_ref",
        note: "Precision reference for ADC measurements: 1.1-5.5 V, ±1% tolerance, max 1 mA.",
      },
    },
  ],
};

const resetPin: InterfaceDef = {
  id: "reset",
  name: "RESET",
  domain: "electrical",
  exposed: true,
  default_active: true,
  protocols: [{ type: "digital", roles: ["input"] }],
  capabilities: ["reset"],
  parameters: [voltageRangeV(DIGITAL_IO_RANGE[0], DIGITAL_IO_RANGE[1])],
  traits: [
    {
      type: "nano_pin_functions",
      params: { source: SOURCE, description: "Reset pin", functions: ["reset"] },
    },
    { type: "power_domain", params: { domain: "digital_io" } },
    INTERNAL_PULLUP_TRAIT,
  ],
};

/**
 * All 30 electrical resources, in ProtoPart resource order (the source
 * definition carries no physical package pin numbers to sort by).
 */
const pins: InterfaceDef[] = [
  vinPin,
  usb5vPin,
  fiveVOutPin,
  threeV3OutPin,
  groundPin(1, "regulated_5v"),
  groundPin(2, "regulated_3v3"),
  ...DIGITAL_PIN_SPECS.map(nanoPin),
  ...ANALOG_PIN_SPECS.map(nanoPin),
  arefPin,
  resetPin,
];

// ---------------------------------------------------------------------------
// Composed interfaces — ProtoPart electrical `interfaces`
// ---------------------------------------------------------------------------

function withTraits(iface: InterfaceDef, traits: TraitDef[]): InterfaceDef {
  return { ...iface, traits: [...(iface.traits ?? []), ...traits] };
}

/** Attach traits to the interface with the given id inside a builder result. */
function amend(ifaces: InterfaceDef[], id: string, traits: TraitDef[]): InterfaceDef[] {
  return ifaces.map((i) => (i.id === id ? withTraits(i, traits) : i));
}

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

// Power input — one supply + one ground. The two profiles are the two
// power_input resources; VIN and USB are mutually exclusive per the
// ProtoPart design rules. Ground binds to gnd1 as the representative
// ground pin (both grounds share the common reference).
const powerInput = composed({
  id: "power_input",
  name: "Power Input",
  protocolType: "power",
  roles: ["input"],
  slots: [
    { id: "supply", required: true, match: { protocol: "power", role: "input", capability: "power_input" } },
    { id: "gnd", required: true, match: { protocol: "power", role: "ground", capability: "ground" } },
  ],
  profiles: [
    { id: "power_via_vin", label: "VIN (7-12 V, unregulated)", bindings: { supply: "vin", gnd: "gnd1" } },
    { id: "power_via_usb", label: "USB 5 V", bindings: { supply: "usb_5v", gnd: "gnd1" } },
  ],
  maxInstances: 1,
  traits: [
    connectionConstraints(1, true),
    {
      type: "co_requirement",
      params: {
        with: "vin, usb_5v",
        condition: "both power sources present",
        effect: "USB and external power should not be used simultaneously — USB and VIN power sources are mutually exclusive.",
        source: `${SOURCE}: warnings / design_rules`,
      },
    },
    {
      type: "usage_restriction",
      params: { restriction: "Do not reverse power supply polarity.", source: `${SOURCE}: warnings` },
    },
  ],
});

// Power output — the regulated rails. The ProtoPart power_delivery block
// describes the 5 V rail; the 3.3 V rail limit lives on the 3v3_out leaf.
const powerOutput = composed({
  id: "power_output",
  name: "Power Output",
  protocolType: "power",
  roles: ["output"],
  parameters: [voltageV(5), maxCurrentA(0.8)],
  slots: [
    { id: "rail", required: true, match: { protocol: "power", role: "output", capability: "power_output" } },
    { id: "gnd", required: true, match: { protocol: "power", role: "ground", capability: "ground" } },
  ],
  profiles: [
    { id: "rail_5v", label: "Regulated 5 V (≤800 mA)", bindings: { rail: "5v_out", gnd: "gnd1" } },
    { id: "rail_3v3", label: "Regulated 3.3 V (≤50 mA, FT232RL 3V3OUT)", bindings: { rail: "3v3_out", gnd: "gnd2" } },
  ],
  maxInstances: 2, // both regulated rails exist concurrently
  traits: [
    connectionConstraints(10, false),
    {
      type: "power_delivery",
      params: {
        max_current_mA: 800,
        max_voltage_V: 5,
        regulation_tolerance_percent: 4,
        ripple_voltage_mV: 10,
        efficiency_percent: 85,
        note: "ProtoPart power_delivery block — figures describe the regulated 5 V rail; the 3.3 V rail is limited to 50 mA (FT232RL 3V3OUT — see 3v3_out).",
      },
    },
  ],
});

// Digital / analog archetype interfaces — ProtoPart declares these as
// generic single-pin interfaces matching any eligible resource, so they
// carry slots but no fixed profiles. Protocol roles are ProtoPart-verbatim.
const digitalOutput = composed({
  id: "digital_output",
  name: "Digital Output",
  protocolType: "digital",
  roles: ["transmitter"],
  slots: [
    { id: "pin", required: true, match: { protocol: "digital", role: "output", capability: "digital_io" } },
  ],
  traits: [connectionConstraints(1, true)],
});

const digitalInput = composed({
  id: "digital_input",
  name: "Digital Input",
  protocolType: "digital",
  roles: ["receiver"],
  slots: [
    { id: "pin", required: true, match: { protocol: "digital", role: "input", capability: "digital_io" } },
  ],
  traits: [connectionConstraints(1, true)],
});

const analogInput = composed({
  id: "analog_input",
  name: "Analog Input",
  protocolType: "analog",
  roles: ["receiver"],
  slots: [
    { id: "pin", required: true, match: { protocol: "analog", role: "input", capability: "analog_in" } },
  ],
  traits: [
    connectionConstraints(1, true),
    {
      type: "channels",
      params: { count: 8, mapping: "A0-A7 (A6/A7 are analog-only)", source: SOURCE },
    },
  ],
});

// I²C master — hardwired to A4 (SDA) / A5 (SCL). 400 kHz max
// (protocol_max_freq_Hz). The master provides no pull-ups.
const i2cMaster = amend(
  I2C({
    id: "i2c_master",
    name: "I2C Master",
    roles: ["master"],
    clockFreqHz: 400_000, // ProtoPart protocol_max_freq_Hz (maximum)
    maxInstances: 1,
    profiles: [{ id: "i2c_a4_a5", label: "SDA = A4, SCL = A5", sda: "a4", scl: "a5" }],
  }),
  "i2c_master",
  [
    {
      type: "bus_characteristics",
      params: { supports_clock_stretching: true, pullups_on_master: false, exclusive: false, source: SOURCE },
    },
    connectionConstraints(8, true),
    {
      type: "implied_passives",
      params: {
        purpose: "I²C bus pull-ups (pullups_on_master: false)",
        components: [
          { kind: "resistor", value: "4.7 kΩ (recommended)", connection: "SDA (A4) to the bus supply" },
          { kind: "resistor", value: "4.7 kΩ (recommended)", connection: "SCL (A5) to the bus supply" },
        ],
        source: `${SOURCE}: recommended_pullup_res_kΩ on A4/A5; design rule "Use external pull-up resistors for I2C communication"`,
      },
    },
  ],
);

// SPI master — hardwired to D11/D12/D13 with default SS on D10. 8 MHz max.
const spiMaster = amend(
  SPI({
    id: "spi_master",
    name: "SPI Master",
    roles: ["master"],
    clockFreqHz: 8_000_000, // ProtoPart protocol_max_freq_Hz (maximum)
    maxInstances: 1,
    profiles: [
      { id: "spi_d10_d13", label: "MOSI = D11, MISO = D12, SCK = D13, SS = D10", mosi: "d11", miso: "d12", sck: "d13", ss: "d10" },
    ],
  }),
  "spi_master",
  [
    { type: "bus_characteristics", params: { exclusive: false, source: SOURCE } },
    connectionConstraints(8, true),
  ],
);

// UART — ProtoPart declares three views of the single D0/D1 port:
// a full transceiver plus TX-only and RX-only interfaces. The transceiver
// uses the canonical UART builder; its ProtoPart-verbatim role list
// ("transceiver"/"transmitter"/"receiver") is preserved as a trait since
// the builder normalises the port roles to host/device.
const uartTransceiver = amend(
  UART({
    id: "uart_transceiver",
    name: "UART Transceiver",
    // Corrected 115 200 → 2 000 000: the ATmega328P USART reaches 2 Mbps at
    // fosc = 16 MHz with U2Xn = 1 (ATmega328P datasheet, USART "Examples of
    // Baud Rate Setting" tables). ProtoPart's protocol_max_freq_Hz of 115200
    // was a practical default, not the silicon maximum.
    baudRate: 2_000_000,
    maxInstances: 1,
    profiles: [{ id: "uart_d0_d1", label: "RX = D0, TX = D1", rx: "d0", tx: "d1" }],
  }),
  "uart_transceiver",
  [
    connectionConstraints(1, true),
    {
      type: "protopart_roles",
      params: {
        roles: ["transceiver", "transmitter", "receiver"],
        note: "ProtoPart-declared protocol roles, verbatim; the OpenUHD UART builder normalises the port to host/device.",
      },
    },
  ],
);

const uartTransmitter = composed({
  id: "uart_transmitter",
  name: "UART Transmitter",
  protocolType: "uart",
  roles: ["transmitter"],
  // 2 Mbps max at 16 MHz, U2Xn = 1 — ATmega328P datasheet baud-rate tables.
  parameters: [{ ...baudRate(2_000_000), name: "Max baud rate" }],
  slots: [
    { id: "tx", required: true, match: { protocol: "uart", role: "transmitter", capability: "uart_tx" } },
  ],
  profiles: [{ id: "uart_tx_d1", label: "TX = D1", bindings: { tx: "d1" } }],
  maxInstances: 1,
  traits: [connectionConstraints(1, true)],
});

const uartReceiver = composed({
  id: "uart_receiver",
  name: "UART Receiver",
  protocolType: "uart",
  roles: ["receiver"],
  // 2 Mbps max at 16 MHz, U2Xn = 1 — ATmega328P datasheet baud-rate tables.
  parameters: [{ ...baudRate(2_000_000), name: "Max baud rate" }],
  slots: [
    { id: "rx", required: true, match: { protocol: "uart", role: "receiver", capability: "uart_rx" } },
  ],
  profiles: [{ id: "uart_rx_d0", label: "RX = D0", bindings: { rx: "d0" } }],
  maxInstances: 1,
  traits: [connectionConstraints(1, true)],
});

// ---------------------------------------------------------------------------
// Mechanical — 4× M3 corner mounting holes + PCB mounting interface
// ---------------------------------------------------------------------------

/**
 * Hole positions come from the mechanical domain's `mount_holes` table;
 * the descriptions pair with coordinates by corner (origin at the
 * top-left of the board outline).
 */
function mountHole(n: 1 | 2 | 3 | 4, description: string, x: number, y: number): InterfaceDef {
  return {
    id: `mount_hole_${n}`,
    name: description,
    domain: "mechanical",
    exposed: true,
    default_active: true,
    protocols: [{ type: "threaded_connection", roles: ["mounting_point"] }],
    capabilities: ["mounting_hole"],
    parameters: [
      { id: "hole_diameter", unit: "mm", value: 3.2 },
      { id: "max_force", unit: "N", value: 50 },
    ],
    traits: [
      { type: "fastener", params: { thread_spec: "M3", connector_type: "through_hole" } },
      { type: "position", params: { x_mm: x, y_mm: y, source: `${SOURCE}: mechanical mount_holes table` } },
    ],
  };
}

const mountHoles: InterfaceDef[] = [
  mountHole(1, "Top-left mounting hole", 1.27, 1.27),
  mountHole(2, "Top-right mounting hole", 43.18, 1.27),
  mountHole(3, "Bottom-left mounting hole", 1.27, 16.51),
  mountHole(4, "Bottom-right mounting hole", 43.18, 16.51),
];

const pcbMounting = composed({
  id: "pcb_mounting",
  name: "PCB Mounting",
  domain: "mechanical",
  protocolType: "threaded_connection",
  roles: ["mounting_point"],
  parameters: [
    { id: "installation_torque", unit: "Nm", value: 0.3 },
    { id: "working_load", unit: "N", value: 200 },
  ],
  slots: [{ id: "hole", required: true, count: 4, match: { capability: "mounting_hole" } }],
  profiles: [
    {
      id: "pcb_mounting_corners",
      label: "PCB mounting interface using 4 corner holes",
      bindings: { hole: ["mount_hole_1", "mount_hole_2", "mount_hole_3", "mount_hole_4"] },
    },
  ],
  maxInstances: 1,
  traits: [{ type: "connection_type", params: { type: "removable" } }],
});

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

export const ARDUINO_NANO: ModuleDef = defineModule({
  id: "arduino-nano",
  name: "Arduino Nano",
  version: "1.0.0",
  manufacturer: "Arduino",
  part_number: "A000005",
  description:
    "Arduino Nano microcontroller board with USB connectivity, based on ATmega328P. Compact form factor ideal for embedded projects requiring a small footprint with full Arduino compatibility.",
  tags: ["mcu", "board", "5v", "usb", "atmega328p", "arduino", "microcontroller", "embedded"],
  categories: ["microcontroller.arduino"],

  interfaces: [
    // All 30 electrical resources, in ProtoPart resource order.
    ...pins,

    // Power interfaces
    powerInput,
    powerOutput,

    // Digital / analog archetypes
    digitalOutput,
    digitalInput,
    analogInput,

    // Serial / bus controllers
    ...i2cMaster,
    ...spiMaster,
    ...uartTransceiver,
    uartTransmitter,
    uartReceiver,

    // Mechanical
    ...mountHoles,
    pcbMounting,
  ],

  interfaceGroups: [
    {
      id: "power_sources",
      label: "Power Sources (mutually exclusive)",
      members: ["vin", "usb_5v"],
      policy: "one_of",
    },
    {
      id: "ground_pins",
      label: "Ground Pins (common reference)",
      members: ["gnd1", "gnd2"],
      policy: "any_of",
    },
    {
      // All three UART views bind the same D0/D1 pins.
      id: "uart_port_views",
      label: "UART Port Views (one D0/D1 port)",
      members: ["uart_transceiver", "uart_transmitter", "uart_receiver"],
      policy: "one_of",
    },
    {
      id: "mounting_holes",
      label: "M3 Corner Mounting Holes",
      members: ["mount_hole_1", "mount_hole_2", "mount_hole_3", "mount_hole_4"],
      policy: "all_of",
    },
  ],

  requirements: [
    {
      type: "power",
      description:
        "External power: 7-12 V on VIN (unregulated, max 500 mA domain rating). 'VIN must be 7-12V when using external power.' Mutually exclusive with USB power.",
      voltage_V: [7, 12],
      current_mA: 500,
    },
    {
      type: "power",
      description:
        "Alternative: 5 V via USB (4.5-5.5 V, max 500 mA, built-in protection). 'Do not exceed 5.5V on any pin when powered by USB.'",
      voltage_V: [4.5, 5.5],
      current_mA: 500,
    },
  ],

  domains: [
    {
      domain: "electrical",
      power_domains: [
        { id: "vin", name: "VIN (Raw Input)", nominal_voltage_V: 9, voltage_range_V: VIN_RANGE, max_current_mA: 500, regulation_type: "unregulated" },
        { id: "usb_5v", name: "USB 5V", nominal_voltage_V: 5, voltage_range_V: USB_RANGE, max_current_mA: 500, regulation_type: "regulated" },
        { id: "regulated_5v", name: "Regulated 5V", nominal_voltage_V: 5, voltage_range_V: [4.8, 5.2], max_current_mA: 800, regulation_type: "regulated" },
        // max_current_mA corrected 150 → 50: 3V3 is the FT232RL's 3V3OUT LDO
        // (Arduino Nano user manual, pin 17: "+3.3V output (from FTDI)";
        // FTDI FT232R datasheet: 3V3OUT sources up to 50 mA).
        { id: "regulated_3v3", name: "Regulated 3.3V", nominal_voltage_V: 3.3, voltage_range_V: [3.1, 3.5], max_current_mA: 50, regulation_type: "regulated" },
        { id: "digital_io", name: "Digital I/O", nominal_voltage_V: 5, voltage_range_V: DIGITAL_IO_RANGE, max_current_mA: 40, regulation_type: "regulated" },
        { id: "analog_ref", name: "Analog Reference", nominal_voltage_V: 5, voltage_range_V: ANALOG_REF_RANGE, max_current_mA: 1, regulation_type: "regulated" },
      ],
      metadata: {
        pin_count: 30,
        supply_voltage_V: VIN_RANGE,
        power_consumption_mW: 500,
        package_type: "PCB Module",
        max_operating_freq_Hz: 16_000_000,
        supports_usb: true,
        supports_hot_plug: true,
        safety_standards: ["UL", "CSA"],
        emc_compliance: ["CE", "FCC"],
        io_limits: {
          per_pin_max_mA: 40,
          total_io_max_mA: 200,
          max_pin_voltage_on_usb_V: 5.5,
          source: `${SOURCE}: design_rules / warnings`,
        },
        // PowerDomainDef has no home for these ProtoPart fields — preserved here.
        power_domain_details: {
          vin: { description: "External power input through barrel jack or VIN pin", isolation_type: "non_isolated", ground_reference: "common", voltage_tolerance_percent: 10, voltage_ripple_mV: 100, efficiency_percent: 85, compatible_domains: [] },
          usb_5v: { description: "USB-supplied power with built-in protection", isolation_type: "non_isolated", ground_reference: "common", voltage_tolerance_percent: 10, voltage_ripple_mV: 50, efficiency_percent: 90, compatible_domains: [] },
          regulated_5v: { description: "Regulated 5V output for powering external components", isolation_type: "non_isolated", ground_reference: "common", voltage_tolerance_percent: 4, voltage_ripple_mV: 10, efficiency_percent: 85, compatible_domains: ["usb_5v"] },
          regulated_3v3: { description: "Low-power 3.3V output for sensors and low-power devices", isolation_type: "non_isolated", ground_reference: "common", voltage_tolerance_percent: 6, voltage_ripple_mV: 5, efficiency_percent: 80, compatible_domains: ["regulated_5v"] },
          digital_io: { description: "5V logic level for digital I/O pins", isolation_type: "non_isolated", ground_reference: "common", voltage_tolerance_percent: 10, compatible_domains: ["regulated_5v"] },
          analog_ref: { description: "Precision reference for ADC measurements", isolation_type: "non_isolated", ground_reference: "common", voltage_tolerance_percent: 1, compatible_domains: ["regulated_5v"] },
        },
      },
    },
    {
      domain: "mechanical",
      dimensions_mm: { length: 45, width: 18, height: 7 },
      weight_g: 7,
      metadata: {
        package_type: "PCB Module",
        enclosure_type: "open_pcb",
        mounting_method: "through_hole",
        field_serviceable: true,
        assembly_time_min: 5,
        mount_holes: [
          { x: 1.27, y: 1.27, diam_mm: 3.2 },
          { x: 43.18, y: 1.27, diam_mm: 3.2 },
          { x: 1.27, y: 16.51, diam_mm: 3.2 },
          { x: 43.18, y: 16.51, diam_mm: 3.2 },
        ],
      },
    },
    {
      domain: "thermal",
      operating_temperature_C: [-40, 85],
      metadata: {
        cooling_method: "passive",
        thermal_design_power_W: 0.5,
        requires_thermal_management: false,
        thermal_monitoring_available: false,
      },
    },
  ],

  traits: [
    {
      type: "io_current_limits",
      params: {
        per_pin_max_mA: 40,
        total_io_max_mA: 200,
        source: `${SOURCE}: design_rules ("Maximum 40mA per I/O pin", "Maximum 200mA total I/O current")`,
      },
    },
    {
      // ProtoPart top-level fields with no structural OpenUHD home,
      // preserved verbatim.
      type: "warnings",
      params: {
        items: [
          "Do not exceed 40mA per I/O pin",
          "Do not reverse power supply polarity",
          "Ensure proper grounding for all connections",
          "USB and external power should not be used simultaneously",
          "Avoid exposing to high humidity or corrosive environments",
          "Maximum operating temperature is 85°C",
        ],
      },
    },
    {
      type: "design_rules",
      params: {
        rules: [
          "Maximum 40mA per I/O pin",
          "Maximum 200mA total I/O current",
          "VIN must be 7-12V when using external power",
          "USB and VIN power sources are mutually exclusive",
          "Do not exceed 5.5V on any pin when powered by USB",
          "Use external pull-up resistors for I2C communication",
          "Ensure proper decoupling capacitors for stable operation",
        ],
      },
    },
    {
      type: "usage_notes",
      params: {
        note: "Arduino Nano is a compact microcontroller board perfect for embedded projects requiring a small footprint. Excellent for prototyping and small-scale production. Compatible with most Arduino shields and libraries. Can be powered via USB or external VIN, with onboard regulator providing 5V and 3.3V outputs.",
      },
    },
    {
      type: "compatibility_notes",
      params: {
        note: "Compatible with 5V and 3.3V sensors and actuators. Works with most Arduino libraries and shields. Can be programmed via USB or ISP. Compatible with Arduino IDE and other development environments.",
      },
    },
    {
      type: "application_examples",
      params: {
        examples: [
          "IoT sensor nodes",
          "Wearable electronics",
          "Small robotics projects",
          "Educational electronics",
          "Prototype development",
          "Embedded control systems",
        ],
      },
    },
    {
      type: "validation_requirements",
      params: {
        items: [
          "Check power supply compatibility",
          "Verify I/O voltage levels",
          "Validate current limits",
          "Check communication protocol compatibility",
          "Ensure proper grounding",
          "Verify analog reference voltage",
        ],
      },
    },
  ],

  artifacts: [
    {
      id: "art_datasheet",
      name: "Arduino Nano (A000005) Datasheet",
      type: "datasheet",
      url: "https://docs.arduino.cc/resources/datasheets/A000005-datasheet.pdf",
    },
    {
      id: "art_thumbnail",
      name: "Arduino Nano Thumbnail",
      type: "custom",
      filePath: "./ProtoPart/protoparts/arduino-nano/thumbnail.png",
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
