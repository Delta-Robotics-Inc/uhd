/**
 * TDK InvenSense ICM-42688-P — datasheet-honest part definition.
 *
 * Primary source: ProtoPart audited definition
 *   (ProtoPart/protoparts/icm-42688-p/definition.json), itself sourced from:
 *   - ICM-42688-P Datasheet DS-000347 rev 1.6 — pin assignment table (pin
 *     numbers, names, functions — copied verbatim), host-interface speeds
 *     (I3C ≤12.5 MHz, I2C ≤1 MHz, SPI ≤24 MHz), supply ranges (1.71–3.6 V),
 *     Table 3 (Section 3.3.1) low-noise-mode 6-axis current (0.88 mA), logic
 *     thresholds (V_IH ≥ 0.7·VDDIO, V_IL ≤ 0.3·VDDIO), absolute-max supply
 *     -0.5 V to +4 V (Table 9).
 *   - TDK application schematic / Table 11 BOM — decoupling (10 nF at VDDIO,
 *     100 nF + 2.2 µF at VDD).
 *   - AN-000173 — APEX motion functions (pedometer, tap, tilt,
 *     wake-on-motion, significant motion detection).
 * Nothing below is carried over from convention or SDK defaults without
 * attribution; values absent from the ProtoPart JSON are omitted, not guessed.
 *
 * Architecture notes honoured by this file:
 *   - Pin-honest like a schematic: all 14 physical LGA pads are leaf
 *     interfaces, in package order, with ids "pin_N" and the datasheet pin
 *     name as the displayed name (including the five RESV pads).
 *   - Every pin carries its verbatim ProtoPart/datasheet function list
 *     (name, direction, signal class) in an `icm42688p_pin_functions` trait —
 *     display data is separated from the canonical capability tags the
 *     matching engine needs.
 *   - Instances vs combinations: the four host buses (I3C / I2C / SPI 4-wire /
 *     SPI 3-wire) are composed interfaces multiplexed onto the same AP_* pads
 *     (pins 1, 12, 13, 14) — mode-exclusive, one host protocol per board
 *     design (`bus_mode_exclusivity` traits + a one_of interface group).
 *   - Co-requirements (`co_requirement` traits): AP_CS tied to VDDIO in
 *     I2C/I3C mode; AP_AD0 strap selects slave address 0x68/0x69; INT vs
 *     INT1 aggregate mapping on pin 4; INT2/FSYNC/CLKIN single-function
 *     rule on pin 9.
 *   - Implied harness connections (`implied_passives` traits): supply
 *     decoupling at pins 5 and 8, I2C pull-ups to VDDIO on AP_SDA/AP_SCL.
 *   - Usage restrictions (`usage_restriction` traits): pin 7 RESV must be
 *     tied to GND; pins 2/3/10/11 RESV are no-connect-or-GND.
 */

import type {
  InterfaceDef,
  ModuleDef,
  ProtocolDef,
  SlotDef,
  TraitDef,
} from "../../src/types/index.js";
import type { Parameter } from "../../src/types/parameter.js";
import {
  Ground,
  PowerIn,
  SPI,
  I2C,
  defineModule,
  clockFreqHz,
  voltageRangeV,
} from "../../src/protocols/index.js";

// ---------------------------------------------------------------------------
// Electrical constants — Datasheet DS-000347 rev 1.6 via ProtoPart definition
// ---------------------------------------------------------------------------

/** VDD core/sensor supply: 1.71–3.6 V, typical 1.8 V. */
const VDD_RANGE: [number, number] = [1.71, 3.6];
/** VDDIO I/O supply (host interface, INT1, INT2/FSYNC/CLKIN pins): 1.71–3.6 V. */
const VDDIO_RANGE: [number, number] = [1.71, 3.6];
/** Typical supply voltage for both rails. */
const SUPPLY_NOMINAL_V = 1.8;

/** Host-interface maximum clock rates (ProtoPart electrical metadata). */
const I2C_MAX_HZ = 1_000_000;
const I3C_MAX_HZ = 12_500_000;
const SPI_MAX_HZ = 24_000_000;

// ---------------------------------------------------------------------------
// Datasheet-honest per-pin function metadata
// ---------------------------------------------------------------------------

interface Icm42688pFunction {
  /** Verbatim function name from the ProtoPart definition / datasheet pin table. */
  name: string;
  /**
   * ProtoPart direction convention: "source" = driven by the ICM-42688-P,
   * "sink" = received by it. Absent for pure reserved pads.
   */
  direction?: "source" | "sink" | "bidirectional";
  signal_class?: string;
  description?: string;
}

/** Verbatim function-list trait — the honest-display contract per pin. */
function pinFunctions(functions: Icm42688pFunction[], note?: string): TraitDef {
  return {
    type: "icm42688p_pin_functions",
    params: {
      source:
        "ICM-42688-P Datasheet DS-000347 rev 1.6, pin assignment table (via ProtoPart definition)",
      functions,
      ...(note ? { note } : {}),
    },
  };
}

function powerDomain(domain: "VDD" | "VDDIO"): TraitDef {
  return {
    type: "power_domain",
    params: {
      domain,
      description:
        domain === "VDD"
          ? "Analog and digital core supply, 1.71 V to 3.6 V (typical 1.8 V)."
          : "Digital I/O supply for the host interface, INT1, and INT2/FSYNC/CLKIN pins. 1.71 V to 3.6 V.",
    },
  };
}

/** AP_AD0 slave-address strap — shared by pin 1 and the strap interface. */
const ADDRESS_STRAP_TRAIT: TraitDef = {
  type: "address_strapping",
  params: {
    strap: "AP_AD0",
    low: "7-bit I2C/I3C slave address 0x68 (AP_AD0 pulled to GND)",
    high: "7-bit I2C/I3C slave address 0x69 (AP_AD0 pulled to VDDIO)",
    note: "The host interface supports only 7-bit slave addresses 0x68 and 0x69.",
    source:
      "ICM-42688-P Datasheet DS-000347 rev 1.6, pin 1 description / ProtoPart compatibility notes",
  },
};

/** INT drive options — datasheet INT_CONFIG register, verbatim from ProtoPart. */
const INT_DRIVE_TRAIT: TraitDef = {
  type: "drive_configuration",
  params: {
    options: ["push-pull", "open-drain"],
    polarity: "programmable",
    note: "Drive type and polarity programmable via INT_CONFIG register.",
    source: "ICM-42688-P Datasheet DS-000347 rev 1.6 (via ProtoPart pin 4 notes)",
  },
};

// ---------------------------------------------------------------------------
// Leaf pins — LGA-14, in package pin order (ProtoPart electrical resources)
// ---------------------------------------------------------------------------

interface IcmPinSpec {
  pin: number;
  /** Datasheet pin name — used as the displayed interface name. */
  name: string;
  domain: "VDD" | "VDDIO";
  protocols: ProtocolDef[];
  /** Canonical capability tags for slot matching. */
  capabilities?: string[];
  functions: Icm42688pFunction[];
  notes?: string;
  extraTraits?: TraitDef[];
  /** VDDIO-referenced logic pins carry the supply voltage range; RESV pads do not. */
  withVoltageParam?: boolean;
  defaultActive?: boolean;
}

/** Build one schematic-honest LGA pad from its ProtoPart resource row. */
function icmPin(spec: IcmPinSpec): InterfaceDef {
  return {
    id: `pin_${spec.pin}`,
    name: spec.name,
    pin: spec.pin,
    domain: "electrical",
    exposed: true,
    default_active: spec.defaultActive ?? true,
    protocols: spec.protocols,
    ...(spec.capabilities ? { capabilities: spec.capabilities } : {}),
    ...(spec.withVoltageParam ?? true
      ? { parameters: [voltageRangeV(VDDIO_RANGE[0], VDDIO_RANGE[1])] }
      : {}),
    traits: [
      pinFunctions(spec.functions, spec.notes),
      powerDomain(spec.domain),
      ...(spec.extraTraits ?? []),
    ],
  };
}

/** Pins 2, 3, 10, 11: reserved, "No Connect or Connect to GND". */
function resvPin(pinNo: number): InterfaceDef {
  return icmPin({
    pin: pinNo,
    name: "RESV",
    domain: "VDDIO",
    protocols: [],
    capabilities: ["resv"],
    withVoltageParam: false,
    defaultActive: false,
    functions: [{ name: "RESV", description: "Reserved pin; no connect or connect to GND." }],
    notes: "TDK datasheet pinout table: 'No Connect or Connect to GND'.",
    extraTraits: [
      {
        type: "usage_restriction",
        params: {
          restriction: "Reserved pin — leave unconnected or tie to GND. No signal function.",
          source: "TDK datasheet pinout table: 'No Connect or Connect to GND' (via ProtoPart design rules)",
        },
      },
    ],
  });
}

const pins: InterfaceDef[] = [
  // Pin 1 — AP_SDO / AP_AD0
  icmPin({
    pin: 1,
    name: "AP_SDO / AP_AD0",
    domain: "VDDIO",
    protocols: [{ type: "digital", roles: ["input", "output"] }],
    capabilities: ["spi_miso", "i2c_addr_strap"],
    functions: [
      { name: "MISO", direction: "source", signal_class: "data", description: "AP_SDO: SPI serial data output in 4-wire mode." },
      { name: "Addr", direction: "sink", signal_class: "data", description: "AP_AD0: I3C/I2C slave address LSB strap." },
    ],
    notes: "Pull to GND for 7-bit I2C/I3C slave address 0x68, or to VDDIO for 0x69.",
    extraTraits: [ADDRESS_STRAP_TRAIT],
  }),

  // Pins 2, 3 — RESV
  resvPin(2),
  resvPin(3),

  // Pin 4 — INT1 / INT
  icmPin({
    pin: 4,
    name: "INT1 / INT",
    domain: "VDDIO",
    protocols: [
      { type: "digital", roles: ["output"] },
      { type: "interrupt", roles: ["output"] },
    ],
    capabilities: ["int1", "int_aggregate"],
    functions: [
      { name: "INT1", direction: "source", signal_class: "data", description: "Interrupt 1 output." },
      { name: "INT", direction: "source", signal_class: "data", description: "All interrupts mapped to pin 4." },
    ],
    notes: "Drive type and polarity programmable via INT_CONFIG register.",
    extraTraits: [INT_DRIVE_TRAIT],
  }),

  // Pin 5 — VDDIO
  {
    ...PowerIn({ id: "pin_5", name: "VDDIO", pin: 5, voltageV: VDDIO_RANGE, nominalV: SUPPLY_NOMINAL_V }),
    capabilities: ["power_in", "vddio"],
    traits: [
      pinFunctions(
        [{ name: "VDDIO", direction: "sink", signal_class: "power", description: "I/O power supply voltage." }],
        "Place a 10 nF decoupling capacitor close to this pin per TDK application schematic (DS-000347 rev 1.6, Table 11: VDDIO bypass C3, X7R 10 nF).",
      ),
      powerDomain("VDDIO"),
      {
        type: "implied_passives",
        params: {
          purpose: "Supply decoupling",
          components: [{ kind: "capacitor", value: "10 nF", connection: "VDDIO (pin 5) to GND, close to the pin" }],
          source: "TDK application schematic, DS-000347 rev 1.6 Table 11 (VDDIO bypass C3, X7R 10 nF)",
        },
      },
    ],
  },

  // Pin 6 — GND
  {
    ...Ground({ id: "pin_6", name: "GND", pin: 6 }),
    traits: [
      pinFunctions([{ name: "GND", direction: "sink", signal_class: "ground" }]),
      powerDomain("VDD"),
      {
        type: "net_shareable",
        params: { net: "gnd", policy: "single_ground_instance_may_serve_all_members" },
      },
    ],
  },

  // Pin 7 — RESV (must be tied to GND)
  {
    id: "pin_7",
    name: "RESV",
    pin: 7,
    domain: "electrical",
    exposed: true,
    default_active: true,
    protocols: [{ type: "power", roles: ["ground"] }],
    capabilities: ["ground", "resv"],
    traits: [
      pinFunctions(
        [
          { name: "RESV", description: "Reserved pin; connect to GND." },
          { name: "GND", direction: "sink", signal_class: "ground" },
        ],
        "TDK datasheet pinout table requires this pin to be tied to GND.",
      ),
      powerDomain("VDD"),
      {
        type: "usage_restriction",
        params: {
          restriction: "Pin 7 (RESV) must be tied to GND.",
          consequence: "Floating it can cause unspecified behavior.",
          source: "TDK datasheet pinout table (via ProtoPart design rules and warnings)",
        },
      },
    ],
  },

  // Pin 8 — VDD
  {
    ...PowerIn({ id: "pin_8", name: "VDD", pin: 8, voltageV: VDD_RANGE, nominalV: SUPPLY_NOMINAL_V }),
    capabilities: ["power_in", "vdd"],
    traits: [
      pinFunctions(
        [{ name: "VDD", direction: "sink", signal_class: "power", description: "Power supply voltage." }],
        "Place a 100 nF (C1) plus 2.2 uF (C2) decoupling capacitor close to this pin per TDK application schematic (DS-000347 rev 1.6, Table 11: VDD bypass, X7R).",
      ),
      powerDomain("VDD"),
      {
        type: "implied_passives",
        params: {
          purpose: "Supply decoupling",
          components: [
            { kind: "capacitor", value: "100 nF", connection: "VDD (pin 8) to GND, close to the pin" },
            { kind: "capacitor", value: "2.2 µF (bulk)", connection: "VDD rail to GND" },
          ],
          source: "TDK application schematic, DS-000347 rev 1.6 Table 11 (VDD bypass C1 0.1 µF + C2 2.2 µF, X7R)",
        },
      },
    ],
  },

  // Pin 9 — INT2 / FSYNC / CLKIN
  icmPin({
    pin: 9,
    name: "INT2 / FSYNC / CLKIN",
    domain: "VDDIO",
    protocols: [
      { type: "digital", roles: ["input", "output"] },
      { type: "interrupt", roles: ["output"] },
      { type: "clock", roles: ["input"] },
    ],
    capabilities: ["int2", "fsync", "clkin"],
    functions: [
      { name: "INT2", direction: "source", signal_class: "data", description: "Interrupt 2 output." },
      { name: "FSYNC", direction: "sink", signal_class: "data", description: "Frame sync input." },
      { name: "CLKIN", direction: "sink", signal_class: "clock", description: "External clock input." },
    ],
    notes: "If FSYNC and CLKIN are not used, configure this pin as INT2 output, or tie to GND when unused per datasheet.",
    extraTraits: [
      {
        type: "mode_exclusive",
        params: {
          modes: ["INT2", "FSYNC", "CLKIN"],
          rule: "Pin 9 (INT2/FSYNC/CLKIN) provides exactly one function at a time; if unused, tie to GND.",
          source: "ProtoPart design rules (ICM-42688-P datasheet DS-000347 rev 1.6)",
        },
      },
    ],
  }),

  // Pins 10, 11 — RESV
  resvPin(10),
  resvPin(11),

  // Pin 12 — AP_CS
  icmPin({
    pin: 12,
    name: "AP_CS",
    domain: "VDDIO",
    protocols: [{ type: "digital", roles: ["input"] }],
    capabilities: ["spi_ss"],
    functions: [
      { name: "CS", direction: "sink", signal_class: "data", description: "AP_CS: SPI chip select." },
      { name: "VDDIO", direction: "sink", signal_class: "power", description: "Tie AP_CS to VDDIO when using the I3C or I2C host interface." },
    ],
    notes: "Connect to VDDIO when using I3C or I2C host interface (per datasheet pinout description).",
    extraTraits: [
      {
        type: "co_requirement",
        params: {
          with: "i2c_slave, i3c_slave",
          condition: "I3C or I2C host interface selected",
          effect: "Tie pin 12 (AP_CS) to VDDIO; pin 12 is SPI chip select only when SPI is selected.",
          source: "ProtoPart design rules (ICM-42688-P datasheet pinout description)",
        },
      },
    ],
  }),

  // Pin 13 — AP_SCL / AP_SCLK
  icmPin({
    pin: 13,
    name: "AP_SCL / AP_SCLK",
    domain: "VDDIO",
    protocols: [{ type: "digital", roles: ["input"] }],
    capabilities: ["i2c_scl", "spi_sck"],
    functions: [
      { name: "SCL", direction: "sink", signal_class: "clock", description: "AP_SCL: I3C/I2C serial clock." },
      { name: "SCLK", direction: "sink", signal_class: "clock", description: "AP_SCLK: SPI serial clock." },
    ],
  }),

  // Pin 14 — AP_SDA / AP_SDIO / AP_SDI
  icmPin({
    pin: 14,
    name: "AP_SDA / AP_SDIO / AP_SDI",
    domain: "VDDIO",
    protocols: [{ type: "digital", roles: ["input", "output", "bidirectional"] }],
    capabilities: ["i2c_sda", "spi_mosi", "spi_sdio"],
    functions: [
      { name: "SDA", direction: "bidirectional", signal_class: "data", description: "AP_SDA: I3C/I2C serial data." },
      { name: "MOSI/MISO", direction: "bidirectional", signal_class: "data", description: "AP_SDIO: SPI serial data I/O in 3-wire mode." },
      { name: "MOSI", direction: "sink", signal_class: "data", description: "AP_SDI: SPI serial data input in 4-wire mode." },
    ],
    notes: "External pull-up resistor to VDDIO required when used as I2C SDA.",
  }),
];

// ---------------------------------------------------------------------------
// Composed interfaces — host buses, strap, interrupts, FSYNC/CLKIN, power
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

const HOST_BUSES = ["i2c_slave", "i3c_slave", "spi_4wire_slave", "spi_3wire_slave"] as const;

/**
 * The four host buses share the AP_* pads (pins 1, 12, 13, 14) — exactly one
 * host protocol may be wired per board design (ProtoPart compatibility notes).
 */
function busModeExclusivity(self: string): TraitDef {
  return {
    type: "bus_mode_exclusivity",
    params: {
      exclusive_with: HOST_BUSES.filter((id) => id !== self),
      note: "The same physical pins (AP_SCL, AP_SDA, AP_CS, AP_SDO) are multiplexed across I3C, I2C, and SPI; pick one host protocol per board design.",
      source: "ProtoPart compatibility notes (ICM-42688-P datasheet DS-000347 rev 1.6)",
    },
  };
}

/** ProtoPart interface constraint `requires_matching_voltage_domain: true`. */
const VOLTAGE_DOMAIN_TRAIT: TraitDef = {
  type: "voltage_domain_matching",
  params: {
    requires_matching_voltage_domain: true,
    note: "Logic thresholds scale with VDDIO (V_IH >= 0.7 * VDDIO, V_IL <= 0.3 * VDDIO).",
    source: "ProtoPart interface constraints / compatibility notes",
  },
};

/** AP_AD0 address selection applies to both I2C and I3C target modes. */
const ADDR_CO_REQUIREMENT: TraitDef = {
  type: "co_requirement",
  params: {
    with: "ap_ad0_strap",
    condition: "I2C or I3C host interface selected",
    effect: "7-bit slave address is 0x68 when AP_AD0 is pulled low, 0x69 when pulled high.",
    source: "ProtoPart i2c_slave description (ICM-42688-P datasheet DS-000347 rev 1.6)",
  },
};

// I²C — fast-mode-plus target, up to 1 MHz on AP_SCL/AP_SDA (pins 13/14).
const i2cSlave = amend(
  I2C({
    id: "i2c_slave",
    name: "Host I2C",
    roles: ["slave"],
    clockFreqHz: [0, I2C_MAX_HZ],
    maxInstances: 1,
    profiles: [
      { id: "i2c_pins", label: "AP_SCL/AP_SDA (pins 13/14)", sda: "pin_14", scl: "pin_13" },
    ],
  }),
  "i2c_slave",
  [
    { type: "display_notation", params: { latex: "I^{2}C" } },
    {
      type: "protocol_compliance",
      params: {
        standard: "I2C fast-mode-plus",
        max_clock_hz: I2C_MAX_HZ,
        note: "I2C target interface, fast-mode-plus up to 1 MHz.",
        source: "ProtoPart i2c_slave description",
      },
    },
    busModeExclusivity("i2c_slave"),
    ADDR_CO_REQUIREMENT,
    {
      type: "co_requirement",
      params: {
        with: "pin_12",
        condition: "I2C host interface selected",
        effect: "Pin 12 (AP_CS) must be tied to VDDIO for I2C mode.",
        source: "ProtoPart i2c_slave description",
      },
    },
    {
      type: "implied_passives",
      params: {
        purpose: "I2C open-drain bus pull-ups",
        components: [
          {
            kind: "resistor",
            value: "required; value not specified in source (choose per bus speed/capacitance)",
            connection: "AP_SDA (pin 14) and AP_SCL (pin 13) to VDDIO",
          },
        ],
        source: "ProtoPart design rules: 'External pull-up resistors to VDDIO are required on AP_SDA and AP_SCL when using I2C.'",
      },
    },
    VOLTAGE_DOMAIN_TRAIT,
  ],
);

// I3C — MIPI I3C SDR target, up to 12.5 MHz SCL on the same AP_SCL/AP_SDA pads.
// Hand-composed: the ProtoPart schema (v1.5.0) has no canonical I3C protocol
// type and modelled it as `custom`; normalised here to protocol type "i3c".
const i3cSlave = composed({
  id: "i3c_slave",
  name: "Host I3C",
  protocolType: "i3c",
  roles: ["slave"],
  parameters: [clockFreqHz([0, I3C_MAX_HZ])],
  slots: [
    { id: "scl", required: true, match: { capability: "i2c_scl" } },
    { id: "sda", required: true, match: { capability: "i2c_sda" } },
  ],
  profiles: [
    { id: "i3c_pins", label: "AP_SCL/AP_SDA (pins 13/14)", bindings: { scl: "pin_13", sda: "pin_14" } },
  ],
  maxInstances: 1,
  traits: [
    {
      type: "protocol_compliance",
      params: {
        standard: "MIPI I3C SDR",
        max_clock_hz: I3C_MAX_HZ,
        note: "MIPI I3C SDR target interface, up to 12.5 MHz SCL.",
        protopart_protocol_type: "custom (no canonical I3C type in ProtoPart schema v1.5.0; normalised to 'i3c' here)",
        source: "ProtoPart i3c_slave description",
      },
    },
    busModeExclusivity("i3c_slave"),
    ADDR_CO_REQUIREMENT,
    {
      type: "co_requirement",
      params: {
        with: "pin_12",
        condition: "I3C host interface selected",
        effect: "AP_CS (pin 12) must be tied to VDDIO when using I3C.",
        source: "ProtoPart i3c_slave description",
      },
    },
    VOLTAGE_DOMAIN_TRAIT,
  ],
});

// SPI 4-wire — target up to 24 MHz, mode 0/3, on AP_CS/AP_SCLK/AP_SDI/AP_SDO.
const spi4WireSlave = amend(
  SPI({
    id: "spi_4wire_slave",
    name: "Host SPI 4-Wire",
    roles: ["slave"],
    clockFreqHz: [0, SPI_MAX_HZ],
    maxInstances: 1,
    profiles: [
      {
        id: "spi_4wire_pins",
        label: "AP_CS/AP_SCLK/AP_SDI/AP_SDO (pins 12/13/14/1)",
        mosi: "pin_14",
        miso: "pin_1",
        sck: "pin_13",
        ss: "pin_12",
      },
    ],
  }),
  "spi_4wire_slave",
  [
    {
      type: "spi_modes",
      params: {
        modes: ["Mode 0", "Mode 3"],
        note: "SPI 4-wire target interface up to 24 MHz, mode 0/3.",
        source: "ProtoPart spi_4wire_slave description",
      },
    },
    busModeExclusivity("spi_4wire_slave"),
    VOLTAGE_DOMAIN_TRAIT,
  ],
);

// SPI 3-wire — a single bidirectional data line (AP_SDIO) replaces MOSI/MISO;
// hand-composed because the standard SPI builder cannot express a shared
// data slot. Pin 1 (AP_SDO/MISO) is unused in this mode.
const spi3WireSlave = composed({
  id: "spi_3wire_slave",
  name: "Host SPI 3-Wire",
  protocolType: "spi",
  roles: ["slave"],
  parameters: [clockFreqHz([0, SPI_MAX_HZ])],
  slots: [
    { id: "ss", required: true, match: { protocol: "spi", role: "select", capability: "spi_ss" } },
    { id: "sck", required: true, match: { protocol: "spi", role: "clock", capability: "spi_sck" } },
    { id: "sdio", required: true, label: "AP_SDIO (bidirectional data)", match: { capability: "spi_sdio" } },
  ],
  profiles: [
    {
      id: "spi_3wire_pins",
      label: "AP_CS/AP_SCLK/AP_SDIO (pins 12/13/14)",
      bindings: { ss: "pin_12", sck: "pin_13", sdio: "pin_14" },
    },
  ],
  maxInstances: 1,
  traits: [
    {
      type: "protocol_compliance",
      params: {
        note: "SPI 3-wire target interface up to 24 MHz.",
        source: "ProtoPart spi_3wire_slave description",
      },
    },
    {
      type: "configuration_note",
      params: {
        note: "Pin 1 AP_SDO/MISO is unused in this mode.",
        source: "ProtoPart spi_3wire_slave description",
      },
    },
    busModeExclusivity("spi_3wire_slave"),
    VOLTAGE_DOMAIN_TRAIT,
  ],
});

// AP_AD0 register-address strap — a static configuration input on pin 1.
const apAd0Strap = composed({
  id: "ap_ad0_strap",
  name: "AP_AD0 Address Strap",
  protocolType: "digital",
  roles: ["input"],
  slots: [{ id: "ad0", required: true, match: { capability: "i2c_addr_strap" } }],
  profiles: [{ id: "ap_ad0_pin", label: "AP_AD0 (pin 1)", bindings: { ad0: "pin_1" } }],
  maxInstances: 1,
  traits: [
    ADDRESS_STRAP_TRAIT,
    {
      type: "co_requirement",
      params: {
        with: "spi_4wire_slave",
        condition: "SPI 4-wire host interface selected",
        effect: "Pin 1 serves as AP_SDO (MISO) in 4-wire SPI mode — the address strap is meaningful only in I2C/I3C mode.",
        source: "ProtoPart pin 1 function list",
      },
    },
  ],
});

// Interrupt outputs — pin 4 carries either the named INT1 or the aggregate INT.
const int1Output = composed({
  id: "int1_output",
  name: "Interrupt 1 Output",
  protocolType: "digital",
  roles: ["output"],
  slots: [{ id: "int1", required: true, match: { capability: "int1" } }],
  profiles: [{ id: "int1_pin", label: "INT1 (pin 4)", bindings: { int1: "pin_4" } }],
  maxInstances: 1,
  traits: [
    {
      type: "interrupt_sources",
      params: {
        note: "Programmable interrupt output for data ready, FIFO, motion, and APEX events. Push-pull or open-drain, polarity selectable.",
        source: "ProtoPart int1_output description",
      },
    },
    INT_DRIVE_TRAIT,
  ],
});

const intOutput = composed({
  id: "int_output",
  name: "Aggregate Interrupt Output",
  protocolType: "digital",
  roles: ["output"],
  slots: [{ id: "int", required: true, match: { capability: "int_aggregate" } }],
  profiles: [{ id: "int_pin", label: "INT (pin 4, all interrupts)", bindings: { int: "pin_4" } }],
  maxInstances: 1,
  traits: [
    {
      type: "co_requirement",
      params: {
        with: "int1_output",
        condition: "all interrupts mapped to INT on pin 4",
        effect: "Aggregate interrupt output on pin 4 when all interrupts are mapped to INT. This is the same physical pin as INT1 and is mutually exclusive with using pin 4 as a named INT1-only connection.",
        source: "ProtoPart int_output description",
      },
    },
    INT_DRIVE_TRAIT,
  ],
});

// Pin-9 alternates — INT2, FSYNC, CLKIN: exactly one function at a time.
const PIN9_MODE_TRAIT: TraitDef = {
  type: "co_requirement",
  params: {
    with: "pin_9",
    condition: "pin 9 mode selection",
    effect: "Pin 9 (INT2/FSYNC/CLKIN) provides exactly one function at a time; if unused, tie to GND.",
    source: "ProtoPart design rules",
  },
};

const int2Output = composed({
  id: "int2_output",
  name: "Interrupt 2 Output",
  protocolType: "digital",
  roles: ["output"],
  slots: [{ id: "int2", required: true, match: { capability: "int2" } }],
  profiles: [{ id: "int2_pin", label: "INT2 (pin 9)", bindings: { int2: "pin_9" } }],
  maxInstances: 1,
  traits: [
    {
      type: "interrupt_sources",
      params: {
        note: "Programmable interrupt output on pin 9 when not configured as FSYNC or CLKIN. Push-pull or open-drain, polarity selectable.",
        source: "ProtoPart int2_output description",
      },
    },
    INT_DRIVE_TRAIT,
    PIN9_MODE_TRAIT,
  ],
});

const fsyncIn = composed({
  id: "fsync_in",
  name: "Frame Sync Input",
  protocolType: "digital",
  roles: ["input"],
  slots: [{ id: "fsync", required: true, match: { capability: "fsync" } }],
  profiles: [{ id: "fsync_pin", label: "FSYNC (pin 9)", bindings: { fsync: "pin_9" } }],
  maxInstances: 1,
  traits: [
    {
      type: "optionality",
      params: {
        note: "Optional external frame-sync input on pin 9. Used to timestamp gyro/accel samples against an external strobe (for example a camera VSYNC).",
        source: "ProtoPart fsync_in description",
      },
    },
    PIN9_MODE_TRAIT,
  ],
});

const clkin = composed({
  id: "clkin",
  name: "External Reference Clock",
  protocolType: "clock",
  roles: ["input"],
  // ProtoPart description: "32 kHz nominal" — stated as-is, no tighter spec given.
  parameters: [{ id: "clock_freq", name: "Nominal CLKIN frequency", unit: "Hz", value: 32_000 }],
  slots: [{ id: "clkin", required: true, match: { capability: "clkin" } }],
  profiles: [{ id: "clkin_pin", label: "CLKIN (pin 9)", bindings: { clkin: "pin_9" } }],
  maxInstances: 1,
  traits: [
    {
      type: "optionality",
      params: {
        note: "Optional external reference clock input on pin 9 (32 kHz nominal) used to drive the internal sampling clock and reduce ODR temperature drift / device-to-device variation.",
        source: "ProtoPart clkin description",
      },
    },
    PIN9_MODE_TRAIT,
  ],
});

// Power interfaces — the ProtoPart definition composes each rail with its
// ground return (VDD+GND, VDDIO+GND), mirrored here as composed interfaces.
const POWER_UP_TRAIT: TraitDef = {
  type: "power_up_requirement",
  params: {
    note: "VDD and VDDIO must ramp monotonically (10%-90% ramp time 0.01-3 ms per datasheet A.C. characteristics); absolute-max VDD/VDDIO is -0.5 V to +4 V (DS-000347 rev 1.6, Table 9). Both supplies must be present for proper operation.",
    source: "ProtoPart warnings / design rules (ICM-42688-P datasheet DS-000347 rev 1.6)",
  },
};

const vddPowerIn = composed({
  id: "vdd_power_in",
  name: "VDD Power",
  protocolType: "power",
  roles: ["input"],
  defaultActive: true,
  parameters: [voltageRangeV(VDD_RANGE[0], VDD_RANGE[1], SUPPLY_NOMINAL_V)],
  slots: [
    { id: "vdd", required: true, match: { protocol: "power", role: "input", capability: "vdd" } },
    { id: "gnd", required: true, match: { protocol: "power", role: "ground", capability: "ground" } },
  ],
  profiles: [
    { id: "vdd_pins", label: "VDD/GND (pins 8/6)", default_active: true, bindings: { vdd: "pin_8", gnd: "pin_6" } },
  ],
  maxInstances: 1,
  traits: [
    {
      type: "supply_description",
      params: {
        note: "1.71 V to 3.6 V core and sensor supply (typical 1.8 V). Datasheet Table 3 (Section 3.3.1, D.C. Electrical Characteristics) lists low-noise-mode 6-axis current consumption of 0.88 mA at typical conditions.",
        source: "ProtoPart vdd power domain / vdd_power_in description",
      },
    },
    POWER_UP_TRAIT,
  ],
});

const vddioPowerIn = composed({
  id: "vddio_power_in",
  name: "VDDIO Power",
  protocolType: "power",
  roles: ["input"],
  defaultActive: true,
  parameters: [voltageRangeV(VDDIO_RANGE[0], VDDIO_RANGE[1], SUPPLY_NOMINAL_V)],
  slots: [
    { id: "vddio", required: true, match: { protocol: "power", role: "input", capability: "vddio" } },
    { id: "gnd", required: true, match: { protocol: "power", role: "ground", capability: "ground" } },
  ],
  profiles: [
    { id: "vddio_pins", label: "VDDIO/GND (pins 5/6)", default_active: true, bindings: { vddio: "pin_5", gnd: "pin_6" } },
  ],
  maxInstances: 1,
  traits: [
    {
      type: "supply_description",
      params: {
        note: "1.71 V to 3.6 V digital I/O supply (typical 1.8 V) for the host interface, INT1, and INT2/FSYNC/CLKIN pins.",
        source: "ProtoPart vddio power domain / vddio_power_in description",
      },
    },
    POWER_UP_TRAIT,
  ],
});

// ---------------------------------------------------------------------------
// Mechanical
// ---------------------------------------------------------------------------

const pcbMount: InterfaceDef = {
  id: "pcb_mount",
  name: "PCB Surface Mount",
  domain: "mechanical",
  exposed: true,
  default_active: true,
  protocols: [{ type: "mechanical_connection", roles: ["mounting_point"] }],
  capabilities: ["lga14_2p5x3p0mm", "surface_mount"],
  traits: [
    {
      type: "assembly_requirement",
      params: {
        note: "Surface-mount LGA-14 solder attachment to PCB land pattern. Package body 2.5 mm x 3.0 mm x 0.91 mm.",
        source: "ProtoPart pcb_mount description",
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

export const ICM_42688_P: ModuleDef = defineModule({
  id: "icm-42688-p",
  name: "TDK InvenSense ICM-42688-P",
  version: "1.0.0",
  manufacturer: "TDK InvenSense",
  part_number: "ICM-42688-P",
  description:
    "TDK InvenSense ICM-42688-P is a high-precision 6-axis MEMS MotionTracking IMU combining a 3-axis gyroscope and 3-axis accelerometer with selectable gyro full-scale ranges from +/-15.625 dps to +/-2000 dps and accelerometer ranges from +/-2 g to +/-16 g. It supports host interfaces of I3C (up to 12.5 MHz), I2C (up to 1 MHz), and SPI (up to 24 MHz), a 2 KB FIFO, programmable INT1 and INT2 (with FSYNC / CLKIN multiplexed on INT2), and APEX motion functions including pedometer, tap, tilt, wake-on-motion, and significant motion detection.",
  tags: [
    "icm-42688-p",
    "icm42688",
    "tdk",
    "invensense",
    "imu",
    "accelerometer",
    "gyroscope",
    "6-axis",
    "i2c",
    "spi",
    "i3c",
    "fifo",
    "interrupts",
    "fsync",
    "clkin",
    "apex",
    "motion-tracking",
  ],
  categories: ["sensor.motion"],

  interfaces: [
    // All 14 physical LGA pads in package order — schematic-honest.
    ...pins,

    // Host buses (mode-exclusive on the shared AP_* pads)
    ...i2cSlave,
    i3cSlave,
    ...spi4WireSlave,
    spi3WireSlave,

    // Configuration strap
    apAd0Strap,

    // Interrupts / sync / clock
    int1Output,
    intOutput,
    int2Output,
    fsyncIn,
    clkin,

    // Power
    vddPowerIn,
    vddioPowerIn,

    // Mechanical
    pcbMount,
  ],

  interfaceGroups: [
    {
      id: "required_power_pins",
      label: "Required Power / Ground Connections (incl. pin 7 RESV tied to GND)",
      members: ["pin_5", "pin_6", "pin_7", "pin_8"],
      policy: "all_of",
    },
    {
      id: "host_interface",
      label: "Host Interface (one protocol per design — shared AP_* pads)",
      members: ["i2c_slave", "i3c_slave", "spi_4wire_slave", "spi_3wire_slave"],
      policy: "one_of",
    },
    {
      id: "pin_4_interrupt_mode",
      label: "Pin 4: named INT1 vs aggregate INT",
      members: ["int1_output", "int_output"],
      policy: "one_of",
    },
    {
      id: "pin_9_mode",
      label: "Pin 9: INT2 / FSYNC / CLKIN (exactly one function)",
      members: ["int2_output", "fsync_in", "clkin"],
      policy: "one_of",
    },
  ],

  requirements: [
    {
      type: "power",
      description:
        "Both VDD (pin 8) and VDDIO (pin 5) must be present within 1.71-3.6 V (typical 1.8 V) for proper operation. Low-noise-mode 6-axis current consumption is 0.88 mA (datasheet Table 3, Section 3.3.1); total power ~1.584 mW at 1.8 V.",
      voltage_V: [1.71, 3.6],
      current_mA: 1,
    },
    {
      type: "interface",
      description:
        "Host must attach through exactly one of the multiplexed AP_* host interfaces: I3C (up to 12.5 MHz), I2C (up to 1 MHz), or SPI (up to 24 MHz, 3- or 4-wire). AP_CS must be tied to VDDIO in I2C/I3C mode.",
    },
  ],

  domains: [
    {
      domain: "electrical",
      power_domains: [
        {
          id: "vdd",
          name: "VDD Core/Sensor Supply",
          nominal_voltage_V: 1.8,
          voltage_range_V: VDD_RANGE,
          max_current_mA: 1,
        },
        {
          id: "vddio",
          name: "VDDIO I/O Supply",
          nominal_voltage_V: 1.8,
          voltage_range_V: VDDIO_RANGE,
          max_current_mA: 1,
        },
      ],
      metadata: {
        package_type: "LGA-14",
        pin_count: 14,
        supply_voltage_V: [1.71, 3.6],
        power_consumption_mW: 1.584,
        i2c_addresses_7bit: ["0x68", "0x69"],
        i2c_max_frequency_hz: I2C_MAX_HZ,
        i3c_max_frequency_hz: I3C_MAX_HZ,
        spi_max_frequency_hz: SPI_MAX_HZ,
        accelerometer_ranges_g: [2, 4, 8, 16],
        gyroscope_ranges_dps: [15.625, 31.25, 62.5, 125, 250, 500, 1000, 2000],
        accelerometer_odr_hz: [1.5625, 32000],
        gyroscope_odr_hz: [12.5, 32000],
        fifo_size_bytes: 2048,
        gyroscope_noise_density_mdps_rt_hz: 2.8,
        accelerometer_noise_density_ug_rt_hz: 70,
        low_noise_6axis_current_mA: 0.88,
        esd_hbm_kV: 2,
        esd_cdm_V: 500,
        logic_levels: { vih_min: "0.7*VDDIO", vil_max: "0.3*VDDIO" },
        absolute_max_supply_V: 4,
        power_domain_notes: {
          vdd: "Analog and digital core supply, 1.71 V to 3.6 V (typical 1.8 V). Datasheet Table 3 (Section 3.3.1, D.C. Electrical Characteristics) lists low-noise-mode 6-axis current consumption of 0.88 mA at typical conditions.",
          vddio: "Digital I/O supply for the host interface, INT1, and INT2/FSYNC/CLKIN pins. 1.71 V to 3.6 V.",
        },
        source: "ICM-42688-P Datasheet DS-000347 rev 1.6, via ProtoPart definition (electrical metadata)",
      },
    },
    {
      domain: "mechanical",
      dimensions_mm: { length: 3, width: 2.5, height: 0.91 },
      metadata: {
        package_type: "LGA-14",
        mounting_method: "surface_mount",
        requires_special_tools: false,
        field_serviceable: false,
      },
    },
    {
      domain: "thermal",
      operating_temperature_C: [-40, 85],
      metadata: {
        requires_thermal_management: false,
      },
    },
  ],

  traits: [
    {
      type: "apex_motion_functions",
      params: {
        functions: ["pedometer", "tap", "tilt", "wake-on-motion", "significant motion detection"],
        source: "ProtoPart description; AN-000173 ICM-426xx APEX Motion Functions",
      },
    },
    {
      type: "assembly_requirement",
      params: {
        note: "This is a fine-pitch surface-mount LGA IC and is not suitable for solderless breadboard use without a breakout board.",
        source: "ProtoPart warnings",
      },
    },
    {
      type: "configuration_dependence",
      params: {
        note: "Current, noise, and timing specs depend on selected power mode, ODR, filters, and VDDIO level.",
        source: "ProtoPart warnings",
      },
    },
    {
      type: "usage_notes",
      params: {
        note: "ICM-42688-P is a bare LGA-14 IC, not a ready-to-wire breakout. Use it when the PCB can support the TDK LGA-14 footprint, local decoupling, and a 1.71 V to 3.6 V logic-level host. The simplest configuration is I2C with AP_CS tied to VDDIO and AP_AD0 strapped for address selection. For lowest noise and tightest ODR accuracy, drive a 32 kHz CLKIN on pin 9 and use SPI at up to 24 MHz.",
        source: "ProtoPart usage notes",
      },
    },
    {
      type: "compatibility_notes",
      params: {
        note: "Logic thresholds scale with VDDIO (VIH >= 0.7 * VDDIO, VIL <= 0.3 * VDDIO). The host interface supports only 7-bit slave addresses 0x68 and 0x69. The same physical pins (AP_SCL, AP_SDA, AP_CS, AP_SDO) are multiplexed across I3C, I2C, and SPI; pick one host protocol per board design. Unlike the Bosch BMI270, the ICM-42688-P does NOT expose an AUX I2C master for an external magnetometer.",
        source: "ProtoPart compatibility notes",
      },
    },
    {
      type: "application_examples",
      params: {
        examples: [
          "AR/VR/XR head and controller motion tracking.",
          "Robotics pose, vibration, and gesture sensing.",
          "High-performance IoT motion analytics.",
          "Industrial and consumer inertial measurement where CLKIN-based timing accuracy is required.",
        ],
        source: "ProtoPart application examples",
      },
    },
    {
      type: "terminology_policy",
      params: {
        note: "Signal and function names in `icm42688p_pin_functions` traits are ProtoPart/datasheet-verbatim and intentionally NOT normalised to a curated whitelist; canonical capability tags exist only where slot matching requires them.",
      },
    },
  ],

  artifacts: [
    {
      id: "art_datasheet",
      name: "ICM-42688-P Datasheet (DS-000347 rev 1.6)",
      type: "datasheet",
      url: "https://product.tdk.com/system/files/dam/doc/product/sensor/mortion-inertial/imu/data_sheet/ds-000347-icm-42688-p-v1.6.pdf",
    },
    {
      id: "art_product_page",
      name: "TDK InvenSense ICM-42688-P Product Page",
      type: "documentation",
      url: "https://invensense.tdk.com/products/motion-tracking/6-axis/icm-42688-p/",
    },
    {
      id: "art_apex_appnote",
      name: "AN-000173 ICM-426xx APEX Motion Functions",
      type: "documentation",
      url: "https://invensense.tdk.com/download-resource/an-000173",
    },
    {
      id: "art_distributor_search",
      name: "TDK InvenSense distributor search (ICM-42688-P)",
      type: "documentation",
      url: "https://dilp.netcomponents.com/tdkcorp_result.html?mode=1&partnumber1=icm-42688-p&partnumber2=dk-42688-p&pq=Search&ref=/cgi-bin/tdkcorp.asp",
      tags: ["purchasing"],
    },
    {
      id: "art_product_image",
      name: "ICM-42688-P product photo (DigiKey)",
      type: "custom",
      filePath: "./ProtoPart/protoparts/icm-42688-p/artifacts/images/1428_-14LGA-_97-2_5x3_-_-14.jpg",
      mimeType: "image/jpeg",
      tags: ["image", "product-photo"],
    },
  ],

  geometry: {
    xScale: 1,
    yScale: 1,
    outline: { preset: "rectangle" },
  },
});
