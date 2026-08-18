/**
 * Bosch Sensortec BME280 — datasheet-honest part definition.
 *
 * Primary source: BME280 Datasheet BST-BME280-DS002 (Rev 1.24, Feb 2024)
 *   - Table 35  Pin description (pin numbers, names, functions — LGA-8)
 *   - Section 1.1  Supply ranges and current consumption (VDD 1.71-3.6 V,
 *     VDDIO 1.2-3.6 V, 3.6 µA typ @ 1 Hz, 0.1 µA sleep)
 *   - Section 6.2  I²C interface (Standard/Fast/High-speed, SDO address strap)
 *   - Section 6.3  SPI interface (mode '00'/'11' auto-selection, spi3w_en
 *     register bit; 4-/3-wire connection diagrams Figures 18/19 in §7.3-§7.4)
 *   - Section 7.2  Design-in guidance (CSB mode latch Figure 17, pull-ups,
 *     decoupling), Section 7.5  Package (2.5 × 2.5 × 0.93 mm LGA, metal lid)
 * All values below are carried from the audited ProtoPart definition
 * (protoparts/bme280/definition.json); nothing is added from convention.
 *
 * Architecture notes honoured by this file:
 *   - Pin-honest like a schematic: all 8 LGA pads are leaf interfaces, in
 *     package order, with ids "pin_N" and the datasheet pin name (Table 35)
 *     as the displayed name.
 *   - Every pin carries its verbatim function list (name, direction,
 *     signal class) in a `bme280_pin_functions` trait — display data is
 *     separated from the canonical capability tags slot matching needs.
 *   - Buses share pads: I²C, SPI 4-wire, and SPI 3-wire are composed
 *     interfaces whose slots bind the same physical pins; a one_of
 *     interface group models the power-on mode latch (one mode at a time).
 *   - Co-requirements (`co_requirement` traits): CSB tied to VDDIO latches
 *     I²C mode; SDO straps the I²C address (GND → 0x76, VDDIO → 0x77,
 *     never floating); SDO is hi-Z/DNC in SPI 3-wire mode.
 *   - Implied harness connections (`implied_passives` traits): ~4.7 kΩ
 *     pull-ups to VDDIO on SDA/SCL in I²C mode; 100 nF decoupling at VDD
 *     and VDDIO.
 *   - Shareability exemption (`net_shareable` trait): the two GND pads
 *     (pins 1 and 7) are one ground net; a single ground instance may
 *     serve both.
 */

import type {
  InterfaceDef,
  ModuleDef,
  TraitDef,
} from "../../src/types/index.js";
import {
  Ground,
  I2C,
  Pin,
  PowerIn,
  SPI,
  clockFreqHz,
  defineModule,
} from "../../src/protocols/index.js";

// ---------------------------------------------------------------------------
// Electrical constants — Datasheet Section 1.1 (via ProtoPart power_domains)
// ---------------------------------------------------------------------------

/** VDD analog + digital core supply range. */
const VDD_RANGE: [number, number] = [1.71, 3.6];
/** VDDIO digital interface supply range (CSB, SDI/SDA, SCK/SCL, SDO). */
const VDDIO_RANGE: [number, number] = [1.2, 3.6];
/** I²C: Standard-mode 100 kHz up to High-speed mode 3.4 MHz (§6.2). */
const I2C_CLOCK_RANGE: [number, number] = [100_000, 3_400_000];
/** SPI (3- and 4-wire): up to 10 MHz (§6.3). */
const SPI_CLOCK_RANGE: [number, number] = [0, 10_000_000];

/** §7.2: external pull-ups to VDDIO on SDA/SCL when the bus runs I²C. */
const I2C_PULLUP_TRAIT: TraitDef = {
  type: "implied_passives",
  params: {
    purpose: "I²C open-drain bus pull-ups",
    components: [
      {
        kind: "resistor",
        value: "~4.7 kΩ typical (moderate bus capacitance)",
        connection: "SDA (pin 3) and SCL (pin 4) to VDDIO",
      },
    ],
    source: "BME280 Datasheet §7.2",
  },
};

/** §7.2-§7.4: 100 nF decoupling close to each supply pin. */
function decouplingTrait(pinName: string): TraitDef {
  return {
    type: "implied_passives",
    params: {
      purpose: "Supply decoupling",
      components: [
        { kind: "capacitor", value: "100 nF", connection: `${pinName} to GND, close to the pin` },
      ],
      source: "BME280 Datasheet §7.2-§7.4",
    },
  };
}

/** The two GND pads sit on one common ground net. */
const GND_NET_TRAIT: TraitDef = {
  type: "net_shareable",
  params: {
    net: "gnd",
    policy: "single_ground_instance_may_serve_all_members",
    members: ["pin_1", "pin_7"],
  },
};

/**
 * JSON constraint carried verbatim: bus logic levels must match the VDDIO
 * domain of the host ("requires_matching_voltage_domain": true).
 */
const VDDIO_DOMAIN_MATCH_TRAIT: TraitDef = {
  type: "voltage_domain_matching",
  params: {
    requires_matching_voltage_domain: true,
    domain: "vddio",
    note: "Logic thresholds scale with VDDIO (datasheet section 6.4, interface parameter specification: input levels specified as %VDDIO).",
  },
};

function withTraits(iface: InterfaceDef, traits: TraitDef[]): InterfaceDef {
  return { ...iface, traits: [...(iface.traits ?? []), ...traits] };
}

/** Attach traits to the interface with the given id inside a builder result. */
function amend(ifaces: InterfaceDef[], id: string, traits: TraitDef[]): InterfaceDef[] {
  return ifaces.map((i) => (i.id === id ? withTraits(i, traits) : i));
}

// ---------------------------------------------------------------------------
// Physical pads — Datasheet Table 35 (p. 38), in package pin order
// ---------------------------------------------------------------------------

const pin1Gnd: InterfaceDef = withTraits(Ground({ id: "pin_1", name: "GND", pin: 1 }), [
  {
    type: "bme280_pin_functions",
    params: {
      source: "BME280 Datasheet Table 35, p. 38",
      functions: [{ name: "GND", direction: "sink", signal_class: "ground" }],
      description: "GND — ground reference.",
    },
  },
  { type: "power_domain", params: { domain: "vdd" } },
  GND_NET_TRAIT,
]);

const pin2Csb: InterfaceDef = withTraits(
  Pin({
    id: "pin_2",
    name: "CSB",
    pin: 2,
    voltageV: VDDIO_RANGE,
    capabilities: { inputOnly: true, spiSs: true },
  }),
  [
    {
      type: "bme280_pin_functions",
      params: {
        source: "BME280 Datasheet Table 35, p. 38",
        functions: [
          { name: "CSB", direction: "sink", signal_class: "data" },
          { name: "VDDIO", direction: "sink", signal_class: "power" },
        ],
        description:
          "CSB — chip-select input (SPI 4-wire and SPI 3-wire); must be tied directly to VDDIO to select I²C mode.",
      },
    },
    { type: "power_domain", params: { domain: "vddio" } },
    {
      type: "internal_pulls",
      params: {
        available: true,
        pull_up: "internal pull-up to VDDIO",
        note: "SPI: CSB is active-low chip-select with an internal pull-up to VDDIO.",
      },
    },
    {
      type: "co_requirement",
      params: {
        with: "i2c",
        condition: "I²C mode",
        effect:
          "The pin must be hard-wired to VDDIO at power-on so the device latches I²C mode.",
        source: "BME280 Datasheet §7.2, Figure 17",
      },
    },
  ],
);

const pin3Sdi: InterfaceDef = (() => {
  const base = Pin({
    id: "pin_3",
    name: "SDI",
    pin: 3,
    voltageV: VDDIO_RANGE,
    capabilities: { i2cSda: true, spiMosi: true },
  });
  return {
    ...base,
    // spi_3w_sdio: half-duplex bidirectional data for the 3-wire bus slot.
    capabilities: [...(base.capabilities ?? []), "spi_3w_sdio"],
    traits: [
      {
        type: "bme280_pin_functions",
        params: {
          source: "BME280 Datasheet Table 35, p. 38",
          functions: [
            { name: "SDI", direction: "sink", signal_class: "data" },
            { name: "SDI/SDO", direction: "bidirectional", signal_class: "data" },
            { name: "SDA", direction: "bidirectional", signal_class: "data" },
          ],
          description:
            "SDI — serial data input in SPI 4-wire, bidirectional SDI/SDO half-duplex data in SPI 3-wire, SDA in I²C.",
          note: "In SPI 4-wire SDI is sampled on the SCK rising edge. In SPI 3-wire the same pin carries the device's response after the address phase.",
        },
      },
      { type: "power_domain", params: { domain: "vddio" } },
      I2C_PULLUP_TRAIT,
    ],
  } satisfies InterfaceDef;
})();

const pin4Sck: InterfaceDef = withTraits(
  Pin({
    id: "pin_4",
    name: "SCK",
    pin: 4,
    voltageV: VDDIO_RANGE,
    capabilities: { inputOnly: true, i2cScl: true, spiSck: true },
  }),
  [
    {
      type: "bme280_pin_functions",
      params: {
        source: "BME280 Datasheet Table 35, p. 38",
        functions: [
          { name: "SCK", direction: "sink", signal_class: "clock" },
          { name: "SCL", direction: "sink", signal_class: "clock" },
        ],
        description: "SCK — serial clock input in SPI 4-wire and SPI 3-wire, SCL in I²C.",
      },
    },
    { type: "power_domain", params: { domain: "vddio" } },
    I2C_PULLUP_TRAIT,
  ],
);

const pin5Sdo: InterfaceDef = withTraits(
  Pin({
    id: "pin_5",
    name: "SDO",
    pin: 5,
    voltageV: VDDIO_RANGE,
    capabilities: { spiMiso: true },
  }),
  [
    {
      type: "bme280_pin_functions",
      params: {
        source: "BME280 Datasheet Table 35, p. 38",
        functions: [
          { name: "SDO", direction: "source", signal_class: "data" },
          { name: "DNC", direction: "bidirectional", signal_class: "data" },
          { name: "GND", direction: "sink", signal_class: "ground" },
          { name: "VDDIO", direction: "sink", signal_class: "power" },
        ],
        description:
          "SDO — serial data output in SPI 4-wire; DNC (Do Not Connect) in SPI 3-wire; I²C address strap in I²C (tie to GND for 0x76, VDDIO for 0x77).",
        note: "SPI 4-wire: SDO changes on the SCK falling edge (§6.3). SPI 3-wire: pin is held hi-Z, leave DNC. I²C: must not float.",
      },
    },
    { type: "power_domain", params: { domain: "vddio" } },
    {
      type: "co_requirement",
      params: {
        with: "i2c",
        condition: "I²C mode",
        effect:
          "The pin selects the 7-bit address — tie to GND for default 0x76 or to VDDIO for 0x77; never leave floating.",
        source: "BME280 Datasheet §6.2",
      },
    },
    {
      type: "co_requirement",
      params: {
        with: "spi_3wire",
        condition: "SPI 3-wire mode",
        effect: "The pin is held hi-Z and must be left DNC (Do Not Connect).",
        source: "BME280 Datasheet §6.3",
      },
    },
  ],
);

const pin6Vddio: InterfaceDef = (() => {
  const base = PowerIn({
    id: "pin_6",
    name: "VDDIO",
    pin: 6,
    voltageV: VDDIO_RANGE,
    nominalV: 1.8,
  });
  return {
    ...base,
    capabilities: ["power_in", "vddio_supply"],
    traits: [
      {
        type: "bme280_pin_functions",
        params: {
          source: "BME280 Datasheet Table 35, p. 38",
          functions: [{ name: "VDDIO", direction: "sink", signal_class: "power" }],
          description: "VDDIO — digital / interface supply input (1.2 V to 3.6 V).",
        },
      },
      { type: "power_domain", params: { domain: "vddio" } },
      decouplingTrait("VDDIO"),
    ],
  } satisfies InterfaceDef;
})();

const pin7Gnd: InterfaceDef = withTraits(Ground({ id: "pin_7", name: "GND", pin: 7 }), [
  {
    type: "bme280_pin_functions",
    params: {
      source: "BME280 Datasheet Table 35, p. 38",
      functions: [{ name: "GND", direction: "sink", signal_class: "ground" }],
      description: "GND — ground reference.",
    },
  },
  { type: "power_domain", params: { domain: "vdd" } },
  GND_NET_TRAIT,
]);

const pin8Vdd: InterfaceDef = (() => {
  const base = PowerIn({
    id: "pin_8",
    name: "VDD",
    pin: 8,
    voltageV: VDD_RANGE,
    nominalV: 3.3,
  });
  return {
    ...base,
    capabilities: ["power_in", "vdd_supply"],
    traits: [
      {
        type: "bme280_pin_functions",
        params: {
          source: "BME280 Datasheet Table 35, p. 38",
          functions: [{ name: "VDD", direction: "sink", signal_class: "power" }],
          description: "VDD — analog and digital core supply input (1.71 V to 3.6 V).",
        },
      },
      { type: "power_domain", params: { domain: "vdd" } },
      decouplingTrait("VDD"),
    ],
  } satisfies InterfaceDef;
})();

/** All 8 pads in physical package order — schematic-honest. */
const pins: InterfaceDef[] = [
  pin1Gnd,
  pin2Csb,
  pin3Sdi,
  pin4Sck,
  pin5Sdo,
  pin6Vddio,
  pin7Gnd,
  pin8Vdd,
];

// ---------------------------------------------------------------------------
// Serial buses — one mode at a time, latched by CSB at power-on
// ---------------------------------------------------------------------------

// I²C — target (slave) up to 3.4 MHz on the shared SDI/SCK pads.
const i2c = amend(
  I2C({
    id: "i2c",
    name: "I²C",
    roles: ["slave"],
    clockFreqHz: I2C_CLOCK_RANGE,
    sda: "pin_3",
    scl: "pin_4",
    maxInstances: 1, // JSON constraint: max_connections 1
  }),
  "i2c",
  [
    { type: "display_notation", params: { latex: "I^{2}C" } },
    {
      type: "operating_modes",
      params: {
        modes: ["Standard-mode (100 kHz)", "Fast-mode (400 kHz)", "High-speed mode (up to 3.4 MHz)"],
        source: "BME280 Datasheet §6.2",
      },
    },
    {
      type: "co_requirement",
      params: {
        with: "pin_2",
        condition: "I²C mode",
        effect:
          "Configuration strap (board-level, not a bus signal): CSB must be tied directly to VDDIO to latch I²C mode at power-on.",
        source: "BME280 Datasheet §7.2, Figure 17",
      },
    },
    {
      type: "co_requirement",
      params: {
        with: "pin_5",
        condition: "I²C mode",
        effect:
          "Configuration strap: SDO selects the 7-bit address — tie to GND for 0x76, tie to VDDIO for 0x77, never leave floating.",
        source: "BME280 Datasheet §6.2",
      },
    },
    I2C_PULLUP_TRAIT,
    VDDIO_DOMAIN_MATCH_TRAIT,
  ],
);

// SPI 4-wire — full-duplex target up to 10 MHz (Table 35 / Figure 18).
const spi4wire = amend(
  SPI({
    id: "spi_4wire",
    name: "SPI 4-wire",
    roles: ["slave"],
    clockFreqHz: SPI_CLOCK_RANGE,
    mosi: "pin_3", // SDI: host-to-device serial data, sampled on SCK rising edge
    miso: "pin_5", // SDO: device-to-host serial data, changes on SCK falling edge
    sck: "pin_4",
    ss: "pin_2", // CSB: active-low chip-select with internal pull-up to VDDIO
    maxInstances: 1, // JSON constraint: max_connections 1
  }),
  "spi_4wire",
  [
    {
      type: "spi_modes",
      params: {
        modes: ["mode '00' (CPOL=CPHA=0)", "mode '11' (CPOL=CPHA=1)"],
        note: "Mode is auto-selected from the SCK level at the falling edge of CSB.",
        source: "BME280 Datasheet §6.3 (4-wire connection diagram: §7.3 Figure 18)",
      },
    },
    VDDIO_DOMAIN_MATCH_TRAIT,
  ],
);

// SPI 3-wire — half-duplex target on a single SDI/SDO data line; the SPI
// builder assumes separate MOSI/MISO, so this bus is hand-rolled.
const spi3wire: InterfaceDef = {
  id: "spi_3wire",
  name: "SPI 3-wire",
  domain: "electrical",
  exposed: true,
  default_active: false,
  protocols: [{ type: "spi", roles: ["slave"] }],
  parameters: [clockFreqHz(SPI_CLOCK_RANGE)],
  slots: [
    { id: "csb", required: true, match: { protocol: "spi", role: "select", capability: "spi_ss" } },
    { id: "sck", required: true, match: { protocol: "spi", role: "clock", capability: "spi_sck" } },
    {
      id: "sdio",
      label: "SDI/SDO (half-duplex bidirectional data)",
      required: true,
      match: { protocol: "spi", role: "data", capability: "spi_3w_sdio" },
    },
  ],
  profiles: [
    {
      id: "spi_3wire_pins",
      label: "CSB/SCK/SDI-SDO (pins 2/4/3)",
      bindings: { csb: "pin_2", sck: "pin_4", sdio: "pin_3" },
    },
  ],
  max_instances: 1, // JSON constraint: max_connections 1
  traits: [
    {
      type: "configuration_note",
      params: {
        note: "Enabled by setting spi3w_en=1 in register 0xF5 (config). Same mode '00' / mode '11' behavior as SPI 4-wire.",
        source: "BME280 Datasheet §6.3 and §5.4.6 register 0xF5 (3-wire connection diagram: §7.4 Figure 19)",
      },
    },
    {
      type: "co_requirement",
      params: {
        with: "pin_5",
        condition: "SPI 3-wire mode",
        effect: "SDO (pin 5) is held hi-Z in this mode and must be left DNC (Do Not Connect).",
        source: "BME280 Datasheet §6.3",
      },
    },
    {
      type: "operating_notes",
      params: {
        note: "Host drives SDI/SDO during the address phase; the device drives it during the data phase.",
        source: "BME280 Datasheet §6.3.2 (SPI read: data is sent out on SDI in 3-wire mode)",
      },
    },
    VDDIO_DOMAIN_MATCH_TRAIT,
  ],
};

// ---------------------------------------------------------------------------
// Power interfaces — carried from the ProtoPart composed power interfaces
// ---------------------------------------------------------------------------

const vddPowerIn: InterfaceDef = {
  id: "vdd_power_in",
  name: "VDD Power",
  domain: "electrical",
  exposed: true,
  default_active: true,
  protocols: [{ type: "power", roles: ["input"] }],
  parameters: [{ id: "voltage", unit: "V", value: 3.3, range: VDD_RANGE }],
  slots: [
    { id: "vdd", required: true, match: { protocol: "power", role: "input", capability: "vdd_supply" } },
    { id: "gnd", required: true, match: { protocol: "power", role: "ground", capability: "ground" } },
  ],
  profiles: [
    {
      id: "vdd_power_pins",
      label: "VDD/GND (pins 8/1)",
      default_active: true,
      bindings: { vdd: "pin_8", gnd: "pin_1" },
    },
  ],
  traits: [
    {
      type: "supply_characteristics",
      params: {
        description:
          "1.71 V to 3.6 V analog and digital core supply. Typical current is 3.6 uA at 1 Hz humidity+pressure+temperature, 0.1 uA in sleep mode.",
        source: "BME280 Datasheet §1.1",
      },
    },
  ],
};

const vddioPowerIn: InterfaceDef = {
  id: "vddio_power_in",
  name: "VDDIO Power",
  domain: "electrical",
  exposed: true,
  default_active: true,
  protocols: [{ type: "power", roles: ["input"] }],
  parameters: [{ id: "voltage", unit: "V", value: 1.8, range: VDDIO_RANGE }],
  slots: [
    { id: "vddio", required: true, match: { protocol: "power", role: "input", capability: "vddio_supply" } },
    { id: "gnd", required: true, match: { protocol: "power", role: "ground", capability: "ground" } },
  ],
  profiles: [
    {
      id: "vddio_power_pins",
      label: "VDDIO/GND (pins 6/7)",
      default_active: true,
      bindings: { vddio: "pin_6", gnd: "pin_7" },
    },
  ],
  traits: [
    {
      type: "supply_characteristics",
      params: {
        description:
          "1.2 V to 3.6 V digital interface supply for the I²C / SPI bus. Independent of VDD so host logic can run at 1.8 V while VDD is 3.3 V.",
        source: "BME280 Datasheet §1.1",
      },
    },
  ],
};

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
  capabilities: ["lga8_2p5x2p5_0p65mm", "surface_mount"],
  traits: [
    {
      type: "package_description",
      params: {
        note: "Surface-mount LGA solder attachment to PCB land pattern. Eight 0.65 mm pitch pads (0.35 x 0.35 mm each) on the bottom of the metal-lid package. 2.5 x 2.5 x 0.93 mm body. (Pitch corrected from 0.4 mm to the datasheet value 0.65 mm.)",
        source: "BME280 Datasheet Section 7.5, Figure 20 (LGA PITCH 0.65, LGA SIZE 0.350x0.350)",
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

export const BME280: ModuleDef = defineModule({
  id: "bme280",
  name: "Bosch BME280",
  version: "1.1",
  manufacturer: "Bosch Sensortec",
  part_number: "BME280",
  description:
    "Bosch Sensortec BME280 is a bare LGA-8 combined digital humidity, barometric pressure, and temperature sensor. Tiny 2.5 x 2.5 x 0.93 mm package with I2C (up to 3.4 MHz) and SPI (3- and 4-wire, up to 10 MHz). Independent VDD (1.71-3.6 V) and VDDIO (1.2-3.6 V) supplies suit battery-powered and ultra-low-power designs at 3.6 uA running and 0.1 uA in sleep.",
  tags: [
    "bme280",
    "bosch",
    "bosch-sensortec",
    "environmental",
    "humidity",
    "pressure",
    "temperature",
    "barometer",
    "i2c",
    "spi",
    "lga-8",
    "low-power",
  ],
  categories: ["sensor", "sensor.environmental"],

  interfaces: [
    // All 8 physical pads in package order — schematic-honest.
    ...pins,

    // Serial buses (shared pads; mode latched by CSB at power-on)
    ...i2c,
    ...spi4wire,
    spi3wire,

    // Power
    vddPowerIn,
    vddioPowerIn,

    // Mechanical
    pcbMount,
  ],

  interfaceGroups: [
    {
      id: "required_power_pins",
      label: "Required Power Pins",
      members: ["pin_1", "pin_6", "pin_7", "pin_8"],
      policy: "all_of",
    },
    {
      id: "ground_common_net",
      label: "Ground Pads (one common net)",
      members: ["pin_1", "pin_7"],
      policy: "all_of",
    },
    {
      // The device runs exactly one host interface, latched at power-on:
      // CSB tied to VDDIO → I²C; CSB driven as chip-select → SPI (3- or
      // 4-wire per the spi3w_en register bit).
      id: "serial_interface_mode",
      label: "Serial Interface Mode (I²C / SPI 4-wire / SPI 3-wire)",
      members: ["i2c", "spi_4wire", "spi_3wire"],
      policy: "one_of",
    },
  ],

  requirements: [
    {
      type: "power",
      description:
        "VDD analog and digital core supply: 1.71-3.6 V. Typical full-sensor current is 3.6 uA at 1 Hz output rate; 0.1 uA in sleep mode (§1.1). Do not exceed 4.25 V (absolute maximum).",
      voltage_V: [1.71, 3.6],
      current_mA: 1,
    },
    {
      type: "power",
      description:
        "VDDIO interface supply for CSB, SDI/SDA, SCK/SCL, and SDO: 1.2-3.6 V, independent of VDD. Do not exceed 4.25 V (absolute maximum).",
      voltage_V: [1.2, 3.6],
      current_mA: 1,
    },
  ],

  domains: [
    {
      domain: "electrical",
      power_domains: [
        {
          id: "vdd",
          name: "VDD Analog Supply",
          nominal_voltage_V: 3.3,
          voltage_range_V: VDD_RANGE,
          max_current_mA: 1,
        },
        {
          id: "vddio",
          name: "VDDIO Interface Supply",
          nominal_voltage_V: 1.8,
          voltage_range_V: VDDIO_RANGE,
          max_current_mA: 1,
        },
      ],
      metadata: {
        pin_count: 8,
        package_type: "LGA-8",
        supply_voltage_V: [1.2, 3.6],
        power_consumption_mW: 0.012,
        max_operating_freq_Hz: 10_000_000,
        power_domain_notes: {
          vdd: "Analog and digital core supply. Typical full-sensor current is 3.6 uA at 1 Hz output rate; 0.1 uA in sleep mode. Datasheet section 1.1.",
          vddio:
            "Digital I/O supply for CSB, SDI/SDA, SCK/SCL, and SDO pins. Independent of VDD so the host can run logic at 1.8 V while VDD is 3.3 V. Datasheet section 1.1.",
        },
        isolation_type: "non_isolated",
        ground_reference: "common",
      },
    },
    {
      domain: "mechanical",
      dimensions_mm: { length: 2.5, width: 2.5, height: 0.93 },
      metadata: {
        package_type: "LGA-8",
        pitch_mm: 0.65,
        mounting_method: "surface_mount",
        requires_special_tools: false,
        field_serviceable: false,
        lid: "metal lid (Datasheet section 7.5, Figure 20)",
      },
    },
    {
      domain: "thermal",
      operating_temperature_C: [-40, 85],
      metadata: {
        requires_thermal_management: false,
        thermal_monitoring_available: true,
        cooling_method: "passive",
      },
    },
  ],

  traits: [
    {
      // ProtoPart design_rules — carried verbatim.
      type: "design_rules",
      params: {
        rules: [
          "Tie CSB (pin 2) directly to VDDIO to select I2C mode; the device only enters I2C mode while CSB is high.",
          "Do not leave SDO (pin 5) floating in I2C mode. Tie to GND for 7-bit address 0x76 or to VDDIO for 0x77.",
          "Add external pull-up resistors to VDDIO on SDA (pin 3) and SCL (pin 4) when using I2C. A 4.7 kOhm pull-up is typical for moderate bus capacitance.",
          "Place 100 nF decoupling capacitors close to VDD (pin 8) and VDDIO (pin 6).",
          "Maximum I2C clock is 3.4 MHz (high-speed mode); maximum SPI clock is 10 MHz.",
          "Do not exceed 4.25 V on VDD or VDDIO (datasheet absolute maximum ratings).",
          "Avoid placing the sensor near localized heat sources; self-heating shifts the temperature reading and the derived humidity / altitude values.",
        ],
      },
    },
    {
      type: "usage_notes",
      params: {
        note: "BME280 is a fine-pitch bare LGA IC, not a ready-to-wire breakout. Use it when the PCB can support the 2.5 mm LGA-8 footprint with two decoupling capacitors and external I2C pull-ups. For the simplest host integration, run it in I2C mode with CSB tied to VDDIO and SDO strapped to GND for address 0x76 (or VDDIO for 0x77). VDD and VDDIO can be driven from the same rail or from independent supplies (e.g., 3.3 V VDD + 1.8 V VDDIO).",
      },
    },
    {
      type: "application_examples",
      params: {
        examples: [
          "Indoor environmental monitoring (temperature, humidity, pressure)",
          "Wearable / handheld altimeter and barometer",
          "Indoor navigation with floor-change detection",
          "HVAC control sensor node",
          "Battery-powered IoT climate node where ultra-low-power sleep is critical",
          "GPS dead-reckoning enhancement via barometric altitude",
        ],
      },
    },
    {
      type: "compatibility_notes",
      params: {
        note: "Logic thresholds scale with VDDIO (datasheet section 6.4, interface parameter specification). Register-compatible with the BMP280 pressure sensor, so existing BMP280 drivers work with the BME280's pressure and temperature channels. The 7-bit I2C address must be 0x76 or 0x77; if two BME280s share a bus, strap SDO differently on each.",
      },
    },
    {
      type: "warnings",
      params: {
        warnings: [
          "Bare LGA-8 IC is not solderless-breadboard friendly. For prototyping, use a breakout board such as the Adafruit BME280 instead.",
          "Do not exceed 4.25 V on VDD or VDDIO; absolute maximum ratings will damage the device.",
          "The sensor is not waterproof. Long-term exposure to condensation can degrade humidity accuracy and may require reconditioning.",
          "Self-heating from neighboring components or from VDD regulator dissipation distorts the temperature, humidity, and pressure outputs.",
        ],
      },
    },
    {
      type: "terminology_policy",
      params: {
        note: "Signal and function names in `bme280_pin_functions` traits are datasheet-verbatim (Table 35) and intentionally NOT normalised to a curated whitelist; canonical capability tags exist only where slot matching requires them.",
      },
    },
  ],

  artifacts: [
    {
      id: "art_datasheet",
      name: "BME280 Datasheet (BST-BME280-DS001-24, Rev 1.24, Feb 2024)",
      type: "datasheet",
      url: "https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bme280-ds002.pdf",
    },
    {
      id: "art_product_page",
      name: "Bosch Sensortec BME280 Product Page",
      type: "documentation",
      url: "https://www.bosch-sensortec.com/en/products/environmental-sensors/humidity-sensors-bme280/",
    },
    {
      id: "art_product_image",
      name: "BME280 product photo (DigiKey)",
      type: "custom",
      filePath: "./ProtoPart/protoparts/bme280/artifacts/images/MFG_BME280.jpg",
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
