/**
 * Adafruit Feather nRF52 Bluefruit LE (product 3406) — source-honest part definition.
 *
 * Primary sources:
 *   - Adafruit Bluefruit nRF52 Feather Learning Guide
 *     (https://cdn-learn.adafruit.com/downloads/pdf/bluefruit-nrf52-feather-learning-guide.pdf)
 *   - ProtoPart definition.json, id "adafruit-feather-nrf52-bluefruit-le-3406",
 *     version 1.1.0 (schema 1.4.0) — the audited source of truth. Pin functions,
 *     power domains, design rules, usage notes, and warnings below are carried
 *     verbatim from that file; nothing is filled in from nRF52832 datasheet
 *     knowledge the JSON does not itself state.
 *
 * Documentation audit (2026-07, against the Adafruit learn guide pages,
 * product page 3406, the Adafruit nRF52 BSP feather_nrf52832 variant, the
 * Zephyr board docs, and the Nordic nRF52832 Product Specification) corrected
 * four source claims and resolved two data gaps, each cited inline:
 *   - A4/A5 ports un-swapped (A4 = P0.28, A5 = P0.29);
 *   - 3V3 regulator output corrected 400 mA -> 500 mA peak (not continuous);
 *   - per-GPIO current limits replaced with the Nordic-documented values
 *     (standard ~2 mA; high drive 14/15 mA at VDD >= 2.7 V; 15 mA chip total
 *     recommended) — the source's 10/5/30 mA figures are undocumented;
 *   - the verbatim 0.001 Mbps UART constraint is flagged as a source error;
 *   - ADC characteristics (8/10/12-bit, default 10-bit, 0-3.6 V via internal
 *     0.6 V ref with 1/6 gain) and the A7 double-100K divider filled in;
 *   - LED2 colour (blue) filled in. Charge current and JST polarity remain
 *     genuine gaps: no fetched documentation page states them.
 *
 * Architecture notes honoured by this file:
 *   - Pin-honest like a schematic: every header pin, test point, and on-board
 *     LED the source defines is a leaf interface with the official silkscreen
 *     name; where the source records the routed nRF52832 port pin (e.g.
 *     "SDA (P0.25)") that port designator is carried as the `pin` field.
 *     The source assigns no header-position ordinals, so pins appear in
 *     source order, not numbered header order.
 *   - Every leaf pin carries its verbatim source function list (name,
 *     direction, signal_class) in a `feather_pin_functions` trait — display
 *     data is separated from the canonical capability tags the matching
 *     engine needs.
 *   - Peripheral controllers exposed at the headers (I2C, SPI, UART, ADC)
 *     are composed interfaces whose slots bind the leaf pins through named
 *     profiles; `max_instances` mirrors the source's `max_connections`.
 *   - The USB micro-B connector, JST-PH battery connector, and BLE radio are
 *     modeled exactly as far as the source models them (power-domain
 *     descriptions, the CP2104 USB-UART bridge, and board metadata); RF
 *     parameters, charge current, JST polarity, and the VBUS/VBAT ORing
 *     topology are NOT specified by the source and are flagged as gaps
 *     rather than fabricated.
 *   - Board-level design_rules / usage_notes / warnings / compatibility_notes
 *     from the source are preserved verbatim as module traits, and their
 *     pin-specific consequences (A7 battery divider, P0.28/P0.29 low-drive,
 *     DFU/FRST boot behaviour, per-GPIO current limits) are additionally
 *     attached to the affected leaf interfaces.
 */

import type {
  InterfaceDef,
  ModuleDef,
  SlotDef,
  TraitDef,
} from "../../src/types/index.js";
import type { Parameter } from "../../src/types/parameter.js";
import type { PinCapabilities } from "../../src/protocols/index.js";
import {
  Ground,
  Pin,
  PowerIn,
  SPI,
  UART,
  I2C,
  defineModule,
} from "../../src/protocols/index.js";

// ---------------------------------------------------------------------------
// Electrical constants — ProtoPart power_domains + design_rules/warnings
// ---------------------------------------------------------------------------

const SOURCE =
  "Adafruit Bluefruit nRF52 Feather Learning Guide; ProtoPart definition.json v1.1.0";

/** Power domain vbus_5v: "USB micro-B power input." */
const VBUS_RANGE: [number, number] = [4.5, 5.2];
/** Power domain vbat_lipo: "Single-cell LiPo battery input via JST-PH." */
const VBAT_RANGE: [number, number] = [3, 4.2];
/** Power domain vdd_3v3: "Board 3.3V rail from on-board LDO; available on 3V pin." */
const VDD_3V3_RANGE: [number, number] = [3, 3.4];

/**
 * nRF52832 GPIO drive, per the Nordic nRF52832 Product Specification (GPIO
 * electrical specification) as confirmed by Nordic on DevZone Q&A 12614:
 * standard drive ~2 mA nominal; high drive max 14 mA source / 15 mA sink at
 * VDD >= 2.7 V; Nordic recommends <= 15 mA total GPIO current for the chip.
 * NOTE: corrects the ProtoPart source's "10 mA (5 mA recommended) / 30 mA
 * package" figures, which do not appear in the nRF52832 PS.
 */
const GPIO_STANDARD_DRIVE_MA = 2;

const GPIO_CURRENT_TRAIT: TraitDef = {
  type: "gpio_current_limits",
  params: {
    per_gpio_standard_drive_mA: 2,
    per_gpio_high_drive_source_max_mA: 14,
    per_gpio_high_drive_sink_max_mA: 15,
    high_drive_condition: "VDD >= 2.7 V",
    chip_total_recommended_mA: 15,
    source:
      "Nordic nRF52832 Product Specification — GPIO electrical specification (high drive max 14 mA source / 15 mA sink at VDD >= 2.7 V); Nordic DevZone Q&A 12614 (15 mA total recommended for the chip). Corrects the ProtoPart figures (10/5/30 mA), which are not documented.",
  },
};

/** Design rule + warning: 3.3 V logic only, never 5 V. */
const LOGIC_LEVEL_TRAIT: TraitDef = {
  type: "logic_level_restriction",
  params: {
    logic_V: 3.3,
    five_volt_tolerant: false,
    note: "All GPIO are 3.3V only; not 5V tolerant. Do not apply >3.3V to any GPIO.",
    source: `${SOURCE} — design_rules / warnings`,
  },
};

// ---------------------------------------------------------------------------
// Source-honest per-pin function metadata
// ---------------------------------------------------------------------------

/** Verbatim function entry from the ProtoPart resource's `functions` array. */
interface FeatherFunction {
  name: string;
  /** Source `direction` field, carried verbatim. */
  direction: "source" | "sink" | "bidirectional" | "input";
  /** Source `signal_class` field, carried verbatim. */
  signal_class: string;
}

/** Wrap a resource's verbatim function list + description as a display trait. */
function fnTrait(functions: FeatherFunction[], description: string): TraitDef {
  return {
    type: "feather_pin_functions",
    params: { source: SOURCE, functions, description },
  };
}

/** ProtoPart per-resource `connector_type`, preserved verbatim. */
function connectorTrait(connector: string): TraitDef {
  return { type: "connector_type", params: { connector } };
}

/** ProtoPart per-resource `power_domain_id`, preserved verbatim. */
function powerDomainTrait(domain: string, note?: string): TraitDef {
  return { type: "power_domain", params: { domain, ...(note ? { note } : {}) } };
}

function withTraits(iface: InterfaceDef, traits: TraitDef[]): InterfaceDef {
  return { ...iface, traits: [...(iface.traits ?? []), ...traits] };
}

/** Attach traits to the interface with the given id inside a builder result. */
function amend(ifaces: InterfaceDef[], id: string, traits: TraitDef[]): InterfaceDef[] {
  return ifaces.map((i) => (i.id === id ? withTraits(i, traits) : i));
}

// ---------------------------------------------------------------------------
// GPIO / signal header pins
// ---------------------------------------------------------------------------

interface FeatherGpioSpec {
  id: string;
  /** Official silkscreen name (source `name`, minus the routed port pin). */
  name: string;
  /** Routed nRF52832 port pin (from the source `name`, e.g. "SDA (P0.25)"). */
  port: string;
  capabilities?: PinCapabilities;
  functions: FeatherFunction[];
  /** Verbatim source description. */
  description: string;
  connector?: string;
  extraTraits?: TraitDef[];
}

/**
 * Build one source-honest 3.3 V GPIO header pin. Digital I/O is retained as
 * the base capability because the source's design_rules address "All GPIO"
 * collectively; per-pin functions beyond that are only what the source lists.
 */
function featherGpio(spec: FeatherGpioSpec): InterfaceDef {
  const base = Pin({
    id: spec.id,
    name: spec.name,
    pin: spec.port,
    voltageV: VDD_3V3_RANGE,
    driveCurrentmA: GPIO_STANDARD_DRIVE_MA,
    capabilities: spec.capabilities,
  });
  return {
    ...base,
    traits: [
      fnTrait(spec.functions, spec.description),
      powerDomainTrait("vdd_3v3"),
      connectorTrait(spec.connector ?? "through_hole_header_0.1in"),
      GPIO_CURRENT_TRAIT,
      LOGIC_LEVEL_TRAIT,
      ...(spec.extraTraits ?? []),
    ],
  };
}

// --- Power and control pins — source order ---------------------------------

const vbusPin: InterfaceDef = {
  ...PowerIn({ id: "pin_vbus", name: "VBUS", voltageV: VBUS_RANGE, nominalV: 5 }),
  capabilities: ["power_in", "vbus_5v"],
  traits: [
    fnTrait([{ name: "VBUS_IN", direction: "sink", signal_class: "power" }], "USB 5V input pin."),
    powerDomainTrait("vbus_5v"),
    connectorTrait("through_hole_header_0.1in"),
    {
      type: "current_limit",
      params: { max_mA: 500, note: "USB VBUS max 500 mA.", source: `${SOURCE} — warnings` },
    },
  ],
};

const vbatPin: InterfaceDef = {
  ...PowerIn({ id: "pin_vbat", name: "VBAT", voltageV: VBAT_RANGE, nominalV: 3.7 }),
  capabilities: ["power_in", "vbat_lipo"],
  traits: [
    fnTrait([{ name: "VBAT_IN", direction: "sink", signal_class: "power" }], "LiPo battery positive."),
    powerDomainTrait("vbat_lipo", "Single-cell LiPo battery input via JST-PH."),
    connectorTrait("through_hole_header_0.1in"),
  ],
};

/** "3.3V regulated output/input." — the source models this rail bidirectional. */
const pin3v3: InterfaceDef = {
  id: "pin_3v3",
  name: "3V3",
  domain: "electrical",
  exposed: true,
  default_active: true,
  protocols: [{ type: "power", roles: ["input", "output"] }],
  capabilities: ["power_in", "power_out", "vdd_3v3"],
  parameters: [
    { id: "voltage", unit: "V", value: 3.3, range: VDD_3V3_RANGE },
    { id: "max_current", name: "Max regulator output (peak)", unit: "A", value: 0.5 },
  ],
  traits: [
    fnTrait(
      [{ name: "VDD_3V3", direction: "bidirectional", signal_class: "power" }],
      "3.3V regulated output/input.",
    ),
    {
      type: "internal_regulator",
      params: {
        description: "Board 3.3V rail from on-board LDO; available on 3V pin.",
        source: `${SOURCE} — power domain vdd_3v3`,
      },
    },
    {
      type: "current_limit",
      params: {
        max_mA: 500,
        peak: true,
        note: "500 mA peak regulator output; not sustainable continuously from 5 V (regulator overheats).",
        source:
          "Adafruit learn guide, Power Management: 'We use a 500mA peak regulator. While you can get 500mA from it, you can't do it continuously from 5V as it will overheat the regulator.' Corrects the ProtoPart 400 mA figure.",
      },
    },
    {
      type: "co_requirement",
      params: {
        with: "pin_en",
        condition: "EN pulled low",
        effect: "Pull low to disable 3V3 regulator — the 3V3 rail (and everything on it) shuts down.",
        source: `${SOURCE} — pin EN description / usage notes`,
      },
    },
    powerDomainTrait("vdd_3v3"),
    connectorTrait("through_hole_header_0.1in"),
  ],
};

const gndPin: InterfaceDef = {
  ...Ground({ id: "pin_gnd", name: "GND" }),
  traits: [
    fnTrait([{ name: "GND", direction: "sink", signal_class: "ground" }], "Ground pins."),
    {
      type: "net_shareable",
      params: {
        net: "gnd",
        policy: "single_ground_instance_may_serve_all_members",
        note: "The source models the header's ground positions ('Ground pins.', plural) as one shared ground resource.",
      },
    },
    // The source records power_domain_id "vdd_3v3" on the GND resource;
    // preserved verbatim rather than corrected.
    powerDomainTrait("vdd_3v3", "As recorded in the source for the GND resource."),
    connectorTrait("through_hole_header_0.1in"),
  ],
};

const enPin: InterfaceDef = {
  id: "pin_en",
  name: "EN",
  domain: "electrical",
  exposed: true,
  default_active: true,
  protocols: [{ type: "digital", roles: ["input"] }],
  capabilities: ["regulator_enable"],
  parameters: [{ id: "voltage", unit: "V", range: VDD_3V3_RANGE }],
  traits: [
    fnTrait(
      [{ name: "EN", direction: "input", signal_class: "control" }],
      "Regulator enable. Pull low to disable 3V3 regulator.",
    ),
    powerDomainTrait("vdd_3v3"),
    connectorTrait("through_hole_header_0.1in"),
    LOGIC_LEVEL_TRAIT,
  ],
};

const rstPin: InterfaceDef = {
  id: "pin_rst",
  name: "RST",
  domain: "electrical",
  exposed: true,
  default_active: true,
  protocols: [{ type: "digital", roles: ["input"] }],
  capabilities: ["reset_input"],
  parameters: [{ id: "voltage", unit: "V", range: VDD_3V3_RANGE }],
  traits: [
    fnTrait([{ name: "RESET", direction: "input", signal_class: "reset" }], "Active-low reset."),
    powerDomainTrait("vdd_3v3"),
    connectorTrait("through_hole_header_0.1in"),
    LOGIC_LEVEL_TRAIT,
  ],
};

// --- Bus signal pins --------------------------------------------------------

const sdaPin = featherGpio({
  id: "pin_sda",
  name: "SDA",
  port: "P0.25",
  capabilities: { i2cSda: true },
  functions: [{ name: "I2C_SDA", direction: "bidirectional", signal_class: "data" }],
  description: "I2C data.",
});

const sclPin = featherGpio({
  id: "pin_scl",
  name: "SCL",
  port: "P0.26",
  capabilities: { i2cScl: true },
  functions: [{ name: "I2C_SCL", direction: "source", signal_class: "clock" }],
  description: "I2C clock.",
});

const sckPin = featherGpio({
  id: "pin_sck",
  name: "SCK",
  port: "P0.12",
  capabilities: { spiSck: true },
  functions: [{ name: "SPI_SCK", direction: "source", signal_class: "clock" }],
  description: "SPI clock.",
});

const mosiPin = featherGpio({
  id: "pin_mosi",
  name: "MOSI",
  port: "P0.13",
  capabilities: { spiMosi: true },
  functions: [{ name: "SPI_MOSI", direction: "source", signal_class: "data" }],
  description: "SPI MOSI.",
});

const misoPin = featherGpio({
  id: "pin_miso",
  name: "MISO",
  port: "P0.14",
  capabilities: { spiMiso: true },
  functions: [{ name: "SPI_MISO", direction: "sink", signal_class: "data" }],
  description: "SPI MISO.",
});

const txPin = featherGpio({
  id: "pin_tx",
  name: "TX",
  port: "P0.06",
  capabilities: { uartTx: true },
  functions: [{ name: "UART_TX", direction: "source", signal_class: "uart_tx" }],
  description: "UART TXD to CP2104.",
  extraTraits: [
    {
      type: "shared_with_onboard",
      params: {
        peripheral: "CP2104 USB-UART bridge",
        note: "This header pin is the same net that feeds the on-board CP2104 (programming and serial console).",
        source: SOURCE,
      },
    },
  ],
});

const rxPin = featherGpio({
  id: "pin_rx",
  name: "RX",
  port: "P0.08",
  capabilities: { uartRx: true },
  functions: [{ name: "UART_RX", direction: "sink", signal_class: "uart_rx" }],
  description: "UART RXD from CP2104.",
  extraTraits: [
    {
      type: "shared_with_onboard",
      params: {
        peripheral: "CP2104 USB-UART bridge",
        note: "This header pin is the same net that is driven by the on-board CP2104 (programming and serial console).",
        source: SOURCE,
      },
    },
  ],
});

// --- Analog inputs A0–A7 ----------------------------------------------------

const LOW_DRIVE_TRAIT: TraitDef = {
  type: "usage_restriction",
  params: {
    restriction: "P0.28 and P0.29 recommended for low-drive, low-frequency GPIO only.",
    note: "Incomplete in the source: the Nordic nRF52832 Product Specification pin assignments mark P0.22-P0.31 (10 pins) as recommended low drive, low frequency (<10 kHz) I/O to protect radio performance.",
    source: `${SOURCE} — design_rules; full pin list: Nordic nRF52832 Product Specification, pin assignments`,
  },
};

interface AnalogSpec {
  id: string;
  name: string;
  port: string;
  description: string;
  extraTraits?: TraitDef[];
}

// A4/A5 port mapping corrected: the Adafruit nRF52 BSP variant for this board
// (variants/feather_nrf52832/variant.h: PIN_A0..PIN_A7 = 2, 3, 4, 5, 28, 29,
// 30, 31) maps A4 = P0.28 and A5 = P0.29. The ProtoPart source had them
// swapped (A4 = P0.29, A5 = P0.28).
const ANALOG_SPECS: AnalogSpec[] = [
  { id: "pin_a0", name: "A0", port: "P0.02", description: "Analog input A0." },
  { id: "pin_a1", name: "A1", port: "P0.03", description: "Analog input A1." },
  { id: "pin_a2", name: "A2", port: "P0.04", description: "Analog input A2." },
  { id: "pin_a3", name: "A3", port: "P0.05", description: "Analog input A3." },
  {
    id: "pin_a4", name: "A4", port: "P0.28",
    description: "Analog input A4. Low-drive GPIO.",
    extraTraits: [LOW_DRIVE_TRAIT],
  },
  {
    id: "pin_a5", name: "A5", port: "P0.29",
    description: "Analog input A5. Low-drive GPIO.",
    extraTraits: [LOW_DRIVE_TRAIT],
  },
  { id: "pin_a6", name: "A6", port: "P0.30", description: "Analog input A6." },
  {
    id: "pin_a7", name: "A7", port: "P0.31",
    description: "Analog input A7 connected to VBAT divider.",
    extraTraits: [
      {
        type: "battery_monitor",
        params: {
          note: "A7/P0.31 tied to VBAT divider for battery measurement; avoid using as general input.",
          divider: "double-100K resistor divider — ADC reads VBAT/2",
          source: `${SOURCE} — design_rules; divider ratio: Adafruit learn guide, Power Management ("a double-100K resistor divider")`,
        },
      },
      {
        type: "usage_restriction",
        params: {
          restriction: "Avoid using as general input — permanently connected to the VBAT divider.",
          source: `${SOURCE} — design_rules`,
        },
      },
    ],
  },
];

const analogPins: InterfaceDef[] = ANALOG_SPECS.map((spec) =>
  featherGpio({
    id: spec.id,
    name: spec.name,
    port: spec.port,
    capabilities: { analogIn: true },
    functions: [{ name: "ADC_IN", direction: "sink", signal_class: "analog" }],
    description: spec.description,
    extraTraits: spec.extraTraits,
  }),
);

// --- Boot-control test points -----------------------------------------------

const dfuPin: InterfaceDef = {
  id: "pin_dfu",
  name: "DFU",
  pin: "P0.20",
  domain: "electrical",
  exposed: true,
  default_active: true,
  protocols: [{ type: "digital", roles: ["input"] }],
  capabilities: ["bootloader_entry"],
  parameters: [{ id: "voltage", unit: "V", range: VDD_3V3_RANGE }],
  traits: [
    fnTrait([{ name: "DFU_MODE", direction: "input", signal_class: "control" }], "Bootloader entry if low at reset."),
    {
      type: "boot_control",
      params: {
        action: "Pull DFU (P0.20) low at reset to enter serial bootloader.",
        source: `${SOURCE} — design_rules`,
      },
    },
    powerDomainTrait("vdd_3v3"),
    connectorTrait("test_point"),
    LOGIC_LEVEL_TRAIT,
  ],
};

const frstPin: InterfaceDef = {
  id: "pin_frst",
  name: "FRST",
  pin: "P0.22",
  domain: "electrical",
  exposed: true,
  default_active: true,
  protocols: [{ type: "digital", roles: ["input"] }],
  capabilities: ["factory_reset"],
  parameters: [{ id: "voltage", unit: "V", range: VDD_3V3_RANGE }],
  traits: [
    fnTrait([{ name: "FACTORY_RESET", direction: "input", signal_class: "control" }], "Factory reset if low at boot."),
    {
      type: "boot_control",
      params: {
        action: "FRST (P0.22) low at boot forces factory reset.",
        source: `${SOURCE} — design_rules`,
      },
    },
    powerDomainTrait("vdd_3v3"),
    connectorTrait("test_point"),
    LOGIC_LEVEL_TRAIT,
  ],
};

// --- On-board LEDs ------------------------------------------------------------

function onboardLed(config: {
  id: string;
  name: string;
  port: string;
  description: string;
}): InterfaceDef {
  return {
    id: config.id,
    name: config.name,
    pin: config.port,
    domain: "electrical",
    exposed: true,
    default_active: true,
    protocols: [{ type: "digital", roles: ["output"] }],
    capabilities: ["onboard_led"],
    parameters: [{ id: "voltage", unit: "V", range: VDD_3V3_RANGE }],
    traits: [
      fnTrait([{ name: "GPIO_OUT", direction: "source", signal_class: "digital" }], config.description),
      powerDomainTrait("vdd_3v3"),
      connectorTrait("smd_led"),
      GPIO_CURRENT_TRAIT,
    ],
  };
}

const led1 = onboardLed({ id: "pin_led1", name: "LED1", port: "P0.17", description: "User LED red." });
// The ProtoPart source says only "Status LED"; the colour (blue) is documented
// by the Adafruit BSP variant (feather_nrf52832 variant.h: LED_BLUE = 19) and
// the Zephyr board docs ("LED1 (blue) = P0.19").
const led2 = onboardLed({ id: "pin_led2", name: "LED2", port: "P0.19", description: "Status LED (blue)." });

/** All leaf electrical resources, in source order (the source assigns no header ordinals). */
const pins: InterfaceDef[] = [
  vbusPin,
  vbatPin,
  pin3v3,
  gndPin,
  enPin,
  rstPin,
  sdaPin,
  sclPin,
  sckPin,
  mosiPin,
  misoPin,
  txPin,
  rxPin,
  ...analogPins,
  dfuPin,
  frstPin,
  led1,
  led2,
];

// ---------------------------------------------------------------------------
// Composed peripheral controllers — ProtoPart `interfaces` array
// ---------------------------------------------------------------------------

function composed(config: {
  id: string;
  name: string;
  domain?: InterfaceDef["domain"];
  protocolType: string;
  roles: string[];
  slots: SlotDef[];
  profiles?: InterfaceDef["profiles"];
  parameters?: Parameter[];
  maxInstances?: number;
  defaultActive?: boolean;
  traits?: TraitDef[];
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

// I2C — "I2C master on SDA=P0.25, SCL=P0.26; external pull-ups required."
// clock_freq 400 kHz is the source's max_lane_rate_mbps 0.4 (= 400 kbit/s).
const i2cMaster = amend(
  I2C({
    id: "i2c_master",
    name: "I2C (Wire)",
    roles: ["master"],
    clockFreqHz: 400_000,
    sda: "pin_sda",
    scl: "pin_scl",
    maxInstances: 1, // source constraint: max_connections 1
  }),
  "i2c_master",
  [
    { type: "display_notation", params: { latex: "I^{2}C" } },
    {
      type: "implied_passives",
      params: {
        purpose: "Open-drain bus pull-ups",
        components: [
          { kind: "resistor", value: "external pull-ups (value per bus speed)", connection: "SDA and SCL to the 3.3 V rail" },
        ],
        source: `${SOURCE} — "external pull-ups required" / design rule: "I2C requires external pull-up resistors; not present on board."`,
      },
    },
    {
      type: "protopart_constraints",
      params: {
        max_connections: 1,
        max_lane_rate_mbps: 0.4,
        requires_matching_voltage_domain: true,
        source: "ProtoPart definition.json interfaces.i2c_master.constraints (verbatim)",
      },
    },
  ],
);

// SPI — "SPI on SCK=P0.12, MOSI=P0.13, MISO=P0.14."
// clock_freq 8 MHz is the source's max_lane_rate_mbps 8 (= 8 Mbit/s).
const spiMaster = amend(
  SPI({
    id: "spi_master",
    name: "SPI",
    roles: ["master"],
    clockFreqHz: 8_000_000,
    mosi: "pin_mosi",
    miso: "pin_miso",
    sck: "pin_sck",
    maxInstances: 1, // source constraint: max_connections 1
  }),
  "spi_master",
  [
    {
      type: "protopart_constraints",
      params: {
        max_connections: 1,
        max_lane_rate_mbps: 8,
        source: "ProtoPart definition.json interfaces.spi_master.constraints (verbatim)",
      },
    },
    {
      type: "chip_select_note",
      params: {
        note: "The source defines no dedicated chip-select pin; the SS slot is left unbound.",
      },
    },
  ],
);

// UART — "UART connected to on-board CP2104 USB-UART for programming and
// serial console." The source's max_lane_rate_mbps (0.001) is preserved
// verbatim in a trait; no baud-rate specification exists elsewhere in it.
const uartDebug = amend(
  UART({
    id: "uart_debug",
    name: "UART to USB (via CP2104)",
    roles: ["device"],
    rx: "pin_rx",
    tx: "pin_tx",
    maxInstances: 1, // source constraint: max_connections 1
  }),
  "uart_debug",
  [
    {
      type: "usb_uart_bridge",
      params: {
        bridge: "CP2104",
        note: "UART connected to on-board CP2104 USB-UART for programming and serial console.",
        source: SOURCE,
      },
    },
    {
      type: "protopart_constraints",
      params: {
        max_connections: 1,
        max_lane_rate_mbps: 0.001,
        note: "Carried verbatim from the source, but 0.001 Mbps (= 1 kbps) is contradicted by documentation: the CP2104 bridge supports 300 bps-2 Mbaud (Silicon Labs CP2104 datasheet) and the Adafruit guide's serial examples run at 115200 baud. Treat the verbatim figure as a source error, not a hardware limit.",
        source: "ProtoPart definition.json interfaces.uart_debug.constraints (verbatim); correction context: Silicon Labs CP2104 datasheet, Adafruit learn guide serial examples",
      },
    },
    {
      type: "co_requirement",
      params: {
        with: "FeatherWings requiring a dedicated UART",
        condition: "UART in use by the CP2104 bridge",
        effect: "Works with most FeatherWings except those requiring dedicated UART if UART is in use by CP2104 bridge. For FeatherWings, keep UART free if required by specific Wing.",
        source: `${SOURCE} — compatibility_notes / usage_notes`,
      },
    },
  ],
);

// ADC — the source defines eight ADC_IN header pins but no converter
// parameters; resolution/reference/range below are supplied from the Adafruit
// learn guide (Device Pinout page) and the product 3406 page.
const adc = composed({
  id: "adc",
  name: "ADC (A0-A7)",
  protocolType: "analog",
  roles: ["input"],
  slots: [
    { id: "channel", required: true, count: 8, match: { protocol: "analog", role: "input", capability: "analog_in" } },
  ],
  profiles: [
    {
      id: "adc_channels",
      label: "A0-A7 header pins",
      bindings: {
        channel: ["pin_a0", "pin_a1", "pin_a2", "pin_a3", "pin_a4", "pin_a5", "pin_a6", "pin_a7"],
      },
    },
  ],
  maxInstances: 1,
  traits: [
    {
      type: "channels",
      params: {
        count: 8,
        mapping: "A0=P0.02, A1=P0.03, A2=P0.04, A3=P0.05, A4=P0.28, A5=P0.29, A6=P0.30, A7=P0.31 (VBAT divider)",
      },
    },
    {
      type: "adc_characteristics",
      params: {
        resolution_bits_options: [8, 10, 12],
        default_resolution_bits: 10,
        default_reference: "internal 0.6 V reference with 1/6 gain",
        default_input_range_V: [0, 3.6],
        note: "Resolves the ProtoPart data gap (the source omitted all converter parameters).",
        source:
          "Adafruit learn guide, Device Pinout: 'The 8 available analog inputs can be configured to generate 8, 10 or 12-bit data'; 'Default voltage range: 0-3.6V (uses the internal 0.6V reference with 1/6 gain)'; 'Default resolution: 10-bit (0..1023)'. Adafruit product page 3406: '8 x 12-bit ADC pins'.",
      },
    },
  ],
});

// Power inputs — "Power via USB 5V or LiPo VBAT; board regulates to 3.3V."
const powerInputs = composed({
  id: "power_inputs",
  name: "Power Inputs",
  protocolType: "power",
  roles: ["input"],
  slots: [
    { id: "vbus", required: true, match: { protocol: "power", role: "input", capability: "vbus_5v" } },
    { id: "vbat", required: true, match: { protocol: "power", role: "input", capability: "vbat_lipo" } },
    { id: "gnd", required: true, match: { protocol: "power", role: "ground", capability: "ground" } },
  ],
  profiles: [
    {
      id: "power_inputs_default",
      label: "VBUS / VBAT / GND",
      default_active: true,
      bindings: { vbus: "pin_vbus", vbat: "pin_vbat", gnd: "pin_gnd" },
    },
  ],
  maxInstances: 1,
  defaultActive: true,
  traits: [
    {
      type: "power_sources",
      params: {
        description: "Power via USB 5V or LiPo VBAT; board regulates to 3.3V.",
        alternatives: "Power from USB (VBUS), LiPo (VBAT), or regulated 3.3V on 3V pin.",
        source: `${SOURCE} — interfaces.power_inputs / usage_notes`,
      },
    },
    {
      type: "lipo_charger",
      params: {
        note: "'Built-in LiPo charger' (board metadata). Adafruit learn guide (Power Management) confirms: when USB power is present the board automatically switches over to USB and starts charging an attached battery, with a CHG LED lit while charging (the LED may flicker with no battery attached). Charge current, JST polarity, and the VBUS/VBAT power-ORing topology are stated neither by the source nor in the guide text — those gaps remain unrepresented rather than fabricated.",
        source: `${SOURCE} — metadata.description; charging behaviour: Adafruit learn guide, Power Management`,
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Connectors — modeled exactly as far as the source describes them
// ---------------------------------------------------------------------------

const usbMicroB: InterfaceDef = {
  id: "usb_micro_b",
  name: "USB Micro-B",
  domain: "electrical",
  exposed: true,
  default_active: true,
  protocols: [
    { type: "usb", roles: ["device"] },
    { type: "power", roles: ["input"] },
  ],
  capabilities: ["usb_device", "usb_power_input"],
  parameters: [
    { id: "voltage", unit: "V", value: 5, range: VBUS_RANGE },
    { id: "max_current", unit: "A", value: 0.5 }, // warnings: "USB VBUS max 500 mA"
  ],
  traits: [
    {
      type: "connector",
      params: {
        kind: "USB micro-B",
        source: `${SOURCE} — power domain vbus_5v: "USB micro-B power input."`,
      },
    },
    {
      type: "usb_uart_bridge",
      params: {
        bridge: "CP2104",
        note: "USB data path is the on-board CP2104 USB-UART bridge, used for programming and the serial console.",
        source: `${SOURCE} — interfaces.uart_debug description`,
      },
    },
  ],
  bridgesTo: ["pin_vbus", "uart_debug"],
};

const jstBattery: InterfaceDef = {
  id: "jst_ph_battery",
  name: "JST-PH Battery Connector",
  domain: "electrical",
  exposed: true,
  default_active: true,
  protocols: [{ type: "power", roles: ["input"] }],
  capabilities: ["battery_input", "jst_ph"],
  parameters: [{ id: "voltage", unit: "V", value: 3.7, range: VBAT_RANGE }],
  traits: [
    {
      type: "connector",
      params: {
        kind: "JST-PH",
        source: `${SOURCE} — power domain vbat_lipo: "Single-cell LiPo battery input via JST-PH."`,
      },
    },
    {
      type: "data_gap",
      params: { note: "Connector polarity and charge current are not specified in the source." },
    },
  ],
  bridgesTo: ["pin_vbat"],
};

// ---------------------------------------------------------------------------
// Radio — the source names BLE only in board metadata; no RF data exists in it
// ---------------------------------------------------------------------------

const bleRadio: InterfaceDef = {
  id: "ble_radio",
  name: "Bluetooth LE Radio (nRF52832)",
  domain: "network",
  exposed: true,
  default_active: false,
  protocols: [{ type: "bluetooth", roles: ["peer"] }],
  capabilities: ["bluetooth_le"],
  traits: [
    {
      type: "radio_characteristics",
      params: {
        compliance: "Bluetooth LE (Nordic nRF52832 SoC)",
        note: "The source names the BLE radio only in board metadata ('Nordic nRF52832 SoC with Bluetooth LE'); it defines no RF parameters, antenna feed pin, or TX/RX characteristics — none are fabricated here.",
        source: `${SOURCE} — metadata.description / tags / taxonomy`,
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Mechanical — Feather footprint
// ---------------------------------------------------------------------------

const featherHeaders: InterfaceDef = {
  id: "feather_headers",
  name: "Feather header rows",
  domain: "mechanical",
  exposed: true,
  default_active: true,
  protocols: [{ type: "mechanical_connection", roles: ["connector"] }],
  capabilities: ["mechanical_connector", "through_hole_header_0.1in"],
  traits: [
    {
      type: "feather_pin_functions",
      params: {
        source: SOURCE,
        functions: [
          { name: "MECHANICAL_CONNECTOR", direction: "bidirectional", signal_class: "mechanical_drive" },
        ],
        description: 'Two 0.1" header rows for Feather/Wing stacking.',
      },
    },
    connectorTrait("through_hole_header_0.1in"),
  ],
};

const featherFootprint = composed({
  id: "feather_footprint",
  name: "Feather footprint",
  domain: "mechanical",
  protocolType: "mechanical_connection",
  roles: ["mounting_point"],
  slots: [
    { id: "headers", required: true, match: { protocol: "mechanical_connection", role: "connector", capability: "mechanical_connector" } },
  ],
  profiles: [
    {
      id: "feather_footprint_default",
      label: "Feather header rows",
      default_active: true,
      bindings: { headers: "feather_headers" },
    },
  ],
  maxInstances: 1, // source: max_instances 1
  defaultActive: true,
  traits: [
    {
      type: "form_factor",
      params: {
        standard: "Adafruit Feather",
        note: "Standard Feather board outline with 4 mounting holes.",
        source: SOURCE,
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

export const ADAFRUIT_FEATHER_NRF52_BLUEFRUIT_LE_3406: ModuleDef = defineModule({
  id: "adafruit-feather-nrf52-bluefruit-le-3406",
  name: "Adafruit Feather nRF52 Bluefruit LE (nRF52832)",
  version: "1.1.0",
  manufacturer: "Adafruit Industries",
  part_number: "3406",
  description:
    "Feather-format development board featuring Nordic nRF52832 SoC with Bluetooth LE, built-in LiPo charger, USB-UART, and Arduino IDE support. MCU: Nordic nRF52832 (Cortex-M4F, 64 MHz, 512KB flash, 64KB RAM).",
  tags: [
    "Feather",
    "nRF52832",
    "Bluetooth-LE",
    "Arduino-compatible",
    "LiPo-charger",
    "USB-UART",
    "3.3V-logic",
  ],
  categories: ["microcontroller.adafruit_mcu", "connectivity.wireless"],

  interfaces: [
    // Leaf header pins, test points, and on-board LEDs — source order.
    ...pins,

    // Bus controllers exposed at the headers
    ...i2cMaster,
    ...spiMaster,
    ...uartDebug,
    adc,

    // Power
    powerInputs,

    // Connectors
    usbMicroB,
    jstBattery,

    // Radio
    bleRadio,

    // Mechanical
    featherHeaders,
    featherFootprint,
  ],

  interfaceGroups: [
    {
      id: "power_sources",
      label: "Power Sources (USB VBUS, LiPo VBAT, or regulated 3.3 V)",
      members: ["pin_vbus", "pin_vbat", "pin_3v3"],
      policy: "any_of",
    },
    {
      id: "boot_control_pins",
      label: "Bootloader Control Test Points (DFU / FRST)",
      members: ["pin_dfu", "pin_frst"],
      policy: "all_of",
    },
    {
      id: "analog_inputs",
      label: "Analog Inputs A0-A7",
      members: ["pin_a0", "pin_a1", "pin_a2", "pin_a3", "pin_a4", "pin_a5", "pin_a6", "pin_a7"],
      policy: "all_of",
    },
  ],

  requirements: [
    {
      type: "power",
      description:
        "Power from USB VBUS (5 V nominal, 4.5-5.2 V, max 500 mA), a single-cell LiPo on VBAT via JST-PH (3.7 V nominal, 3.0-4.2 V), or regulated 3.3 V applied to the 3V pin; the on-board LDO regulates the 3.3 V rail (3.0-3.4 V, 3V3 pin max 500 mA peak output, not continuous from 5 V).",
    },
  ],

  domains: [
    {
      domain: "electrical",
      power_domains: [
        // vbus_5v max_current_mA is from the source's `warnings`. vdd_3v3
        // max_current_mA is corrected to the Adafruit guide's "500mA peak
        // regulator" (Power Management page); the source's 400 mA is not
        // documented anywhere in the guide.
        { id: "vbus_5v", name: "USB VBUS 5V", nominal_voltage_V: 5, voltage_range_V: VBUS_RANGE, max_current_mA: 500 },
        { id: "vbat_lipo", name: "VBAT LiPo", nominal_voltage_V: 3.7, voltage_range_V: VBAT_RANGE },
        { id: "vdd_3v3", name: "3V3 Regulated", nominal_voltage_V: 3.3, voltage_range_V: VDD_3V3_RANGE, max_current_mA: 500, regulation_type: "regulated" },
      ],
      metadata: {
        pin_count: 28,
        supply_voltage_V: VDD_3V3_RANGE,
        logic_levels: { vih_min: "0.7*VDD", vil_max: "0.3*VDD" },
        mcu: "Nordic nRF52832 (Cortex-M4F, 64 MHz, 512KB flash, 64KB RAM)",
        power_domain_descriptions: {
          vbus_5v: "USB micro-B power input.",
          vbat_lipo: "Single-cell LiPo battery input via JST-PH.",
          vdd_3v3: "Board 3.3V rail from on-board LDO; available on 3V pin.",
        },
        isolation: "All rails non_isolated, common ground reference (source power_domains).",
        source: SOURCE,
      },
    },
    {
      domain: "mechanical",
      dimensions_mm: { length: 51, width: 22.9, height: 7.1 },
      metadata: {
        package_type: "Adafruit Feather",
        mounting_method: "through_hole_headers",
        mounting_holes: 4,
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
      // Source design_rules; pin-level consequences are also attached to the
      // affected leaf interfaces above. The per-GPIO current rule is corrected:
      // the source's "10 mA (5 mA recommended) / 30 mA package" figures do not
      // appear in the nRF52832 Product Specification.
      type: "design_rules",
      params: {
        rules: [
          "All GPIO are 3.3V only; not 5V tolerant.",
          "I2C requires external pull-up resistors; not present on board.",
          "GPIO drive (nRF52832 PS, GPIO electrical specification): standard drive ~2 mA nominal; high drive max 14 mA source / 15 mA sink at VDD >= 2.7 V; Nordic recommends <= 15 mA total GPIO current for the chip.",
          "A7/P0.31 tied to VBAT divider for battery measurement; avoid using as general input.",
          "P0.28 and P0.29 recommended for low-drive, low-frequency GPIO only.",
          "Pull DFU (P0.20) low at reset to enter serial bootloader; FRST (P0.22) low at boot forces factory reset.",
        ],
        source: SOURCE,
      },
    },
    {
      type: "usage_notes",
      params: {
        note: "Power from USB (VBUS), LiPo (VBAT), or regulated 3.3V on 3V pin. Use EN pin low to disable 3V3 regulator. Provide local decoupling for external peripherals. For FeatherWings, keep UART free if required by specific Wing.",
        source: SOURCE,
      },
    },
    {
      type: "warnings",
      params: {
        warnings: [
          "ESD sensitive. Handle with care.",
          "Do not apply >3.3V to any GPIO.",
          "USB VBUS max 500 mA; 3V3 pin max 500 mA peak output from regulator (not continuous from 5 V — Adafruit learn guide, Power Management; corrects the ProtoPart 400 mA figure).",
        ],
        source: SOURCE,
      },
    },
    {
      type: "compatibility",
      params: {
        note: "Standard Feather footprint. Works with most FeatherWings except those requiring dedicated UART if UART is in use by CP2104 bridge. Arduino IDE supported via Adafruit nRF52 BSP.",
        source: SOURCE,
      },
    },
    {
      type: "application_examples",
      params: {
        examples: [
          "BLE sensor node with I2C sensors",
          "Battery-powered BLE data logger",
          "FeatherWing-compatible wireless controller",
        ],
        source: SOURCE,
      },
    },
    {
      type: "wireless_soc",
      params: {
        radios: ["ble_radio"],
        note: "No RF feed pin or antenna interface is defined by the source.",
      },
    },
    {
      // ProtoPart purchaseInfo — no OpenUHD home; preserved verbatim.
      type: "purchase_info",
      params: {
        vendor: "amazon",
        link: "https://amzn.to/4nz8Mmg",
        isAffiliate: true,
        vendorPartId: "B071ZSQDSJ",
        currentPriceUSD: "24.95",
        availabilityStatus: "in_stock",
        priceTimestamp: "2025-11-02T23:25:57.000Z",
      },
    },
  ],

  artifacts: [
    {
      id: "art_datasheet",
      name: "Bluefruit nRF52 Feather Learning Guide",
      type: "datasheet",
      url: "https://cdn-learn.adafruit.com/downloads/pdf/bluefruit-nrf52-feather-learning-guide.pdf",
    },
    {
      id: "art_thumbnail",
      name: "Thumbnail",
      type: "custom",
      filePath: "./ProtoPart/protoparts/adafruit-feather-nrf52-bluefruit-le-3406/thumbnail.png",
      mimeType: "image/png",
      tags: ["image", "thumbnail", "preview"],
      description: "Board product photo (source previewArtifactId: art_thumbnail).",
    },
  ],

  geometry: {
    // The source defines no node_geometry; only the rectangular Feather
    // outline (51 x 22.9 mm, mechanical domain) justifies the preset.
    outline: { preset: "rectangle" },
  },
});
