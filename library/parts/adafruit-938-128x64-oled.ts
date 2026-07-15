/**
 * Adafruit 938 — Monochrome 1.3" 128x64 OLED Graphic Display breakout —
 * datasheet-honest part definition.
 *
 * Primary sources:
 *   - Adafruit 938 product datasheet (DigiKey mirror, 938_Web.pdf) — pads,
 *     VIN range, onboard regulator/level shifting, jumper-selected bus mode
 *   - Adafruit product page (adafruit.com/product/938) — default I2C mode,
 *     address jumper, SPI conversion via solder-jumper cuts
 *   - Solomon Systech SSD1306 controller datasheet — 10 MHz SPI clock limit,
 *     reset pulse width, operating temperature (cited where inherited)
 * All electrical values below are carried over from the validated ProtoPart
 * definition (adafruit-938-128x64-oled, schema 1.4.0); nothing is invented
 * beyond that source.
 *
 * Architecture notes honoured by this file:
 *   - Pin-honest like a schematic: all 8 header pads are leaf interfaces in
 *     board order, ids matching the ProtoPart resource ids, with the silk
 *     label as the `pin` designator and the official pad name displayed.
 *     (The ProtoPart source gives no numeric header positions, so the silk
 *     labels are the designators.)
 *   - Every multiplexed pad carries a verbatim per-mode function list in a
 *     `pin_functions` trait — display data separated from the canonical
 *     capability tags slot matching needs.
 *   - I2C-default vs SPI-selectable duality: the two bus targets are
 *     composed interfaces bound to the same CLK/DATA pads; a `one_of`
 *     interface group plus `co_requirement` traits state the honest
 *     constraint — mode is chosen by cutting two solder jumpers, a
 *     one-time physical board-prep step, never runtime-switchable, and
 *     never simultaneous.
 *   - Write-only SPI modelled honestly: the SPI target is hand-rolled (the
 *     SPI builder would fabricate a required MISO slot) with only
 *     MOSI/SCK/CS/DC slots — there is no MISO/CIPO contact on the breakout.
 *   - Onboard passives (`onboard_passives` traits): the breakout ships its
 *     own I2C pull-ups; implied external passives are limited to the VIN
 *     decoupling capacitor the design rules require.
 *   - Shareability exemption (`net_shareable`): GND is inherently
 *     shareable.
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
  PowerOut,
  clockFreqHz,
  defineModule,
} from "../../src/protocols/index.js";

// ---------------------------------------------------------------------------
// Electrical constants — ProtoPart power domain / metadata
// ---------------------------------------------------------------------------

/** VIN accepts 3 V to 5 V; onboard regulator + level shifters normalise to 3.3 V. */
const VIN_RANGE: [number, number] = [3, 5];
/** Regulated logic rail behind the onboard LDO. */
const LOGIC_NOMINAL_V = 3.3;
/** metadata.i2c_max_frequency_hz — 400 kHz max SCL (SSD1306 datasheet Table 13-6: I2C clock cycle time tcycle min 2.5 µs). */
const I2C_MAX_HZ = 400_000;
/** metadata.spi_max_frequency_hz — "Maximum SPI clock is 10 MHz per the SSD1306 datasheet." */
const SPI_MAX_HZ = 10_000_000;
/** metadata.i2c_addresses_7bit — 0x3D default, 0x3C jumper-selectable. */
const I2C_ADDRESS_DEFAULT = 0x3d;
const I2C_ADDRESS_ALTERNATE = 0x3c;

/** Every pad sits behind the level shifters on the single 3.3 V logic domain. */
const POWER_DOMAIN_TRAIT: TraitDef = {
  type: "power_domain",
  params: {
    domain: "vdd_3v3",
    note: "Full level-shifted logic: pads accept 3 V or 5 V signalling to match VIN; the SSD1306 itself runs from the onboard 3.3 V regulator.",
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
// Header pads — 8 leaf interfaces, in board order (ProtoPart resource order)
// ---------------------------------------------------------------------------

const vin: InterfaceDef = {
  ...PowerIn({ id: "vin", name: "VIN", pin: "VIN", voltageV: VIN_RANGE }),
  capabilities: ["power_in"],
  traits: [
    POWER_DOMAIN_TRAIT,
    {
      type: "internal_regulator",
      params: {
        description:
          "Raw 3 V to 5 V power input pad to the onboard regulator and level-shifters. An onboard 3.3 V regulator and full-level-shifted logic give the SSD1306 controller a 3.3 V CMOS supply regardless of VIN.",
        source: "Adafruit 938 product page / ProtoPart power domain vdd_3v3",
      },
    },
    {
      type: "implied_passives",
      params: {
        purpose: "Supply decoupling",
        components: [{ kind: "capacitor", value: "≥0.1 µF", connection: "VIN to GND, local to the breakout" }],
        source: "ProtoPart design rule: 'Decouple VIN to ground with at least 0.1 uF locally.'",
      },
    },
  ],
};

const oled3vo: InterfaceDef = {
  ...PowerOut({ id: "oled_3vo", name: "3Vo", pin: "3Vo", voltageV: LOGIC_NOMINAL_V, maxCurrentA: 0.1 }),
  capabilities: ["power_out", "regulator_tap"],
  traits: [
    POWER_DOMAIN_TRAIT,
    {
      type: "internal_regulator",
      params: {
        description: "Regulated 3.3 V output from the onboard LDO. Optional tap to drive small downstream peripherals at <=100 mA.",
      },
    },
    {
      type: "current_derating",
      params: {
        rule: "The 3Vo regulator output can drive small downstream peripherals up to roughly 100 mA, but check thermal margin if loading heavily.",
        source: "ProtoPart design rules",
      },
    },
    { type: "optionality", params: { note: "Optional — may be left unconnected when no auxiliary 3.3 V tap is needed." } },
  ],
};

const gnd: InterfaceDef = {
  ...Ground({ id: "gnd", name: "GND", pin: "GND" }),
  traits: [
    { type: "net_shareable", params: { net: "gnd", policy: "single_ground_instance_may_serve_all_members" } },
  ],
};

/** CLK — serial clock pad, routed to SPI SCK or I2C SCL by the mode jumpers. */
const spiClk: InterfaceDef = withTraits(
  Pin({
    id: "spi_clk",
    name: "CLK (SPI SCK / I2C SCL)",
    pin: "CLK",
    voltageV: VIN_RANGE,
    capabilities: { inputOnly: true, spiSck: true, i2cScl: true },
  }),
  [
    {
      type: "pin_functions",
      params: {
        source: "ProtoPart resource spi_clk (Adafruit 938 documentation)",
        functions: [
          { name: "SPI SCK", direction: "I", mode: "spi" },
          { name: "I2C SCL", direction: "I", mode: "i2c" },
        ],
        note: "Routed to SPI SCK in SPI mode or I2C SCL in I2C mode (mode chosen by solder jumpers on the back of the breakout).",
      },
    },
    POWER_DOMAIN_TRAIT,
  ],
);

/** DATA — serial data pad, routed to SPI MOSI or I2C SDA by the mode jumpers. */
const spiData: InterfaceDef = withTraits(
  Pin({
    id: "spi_data",
    name: "DATA (SPI MOSI / I2C SDA)",
    pin: "DATA",
    voltageV: VIN_RANGE,
    capabilities: { spiMosi: true, i2cSda: true },
  }),
  [
    {
      type: "pin_functions",
      params: {
        source: "ProtoPart resource spi_data (Adafruit 938 documentation)",
        functions: [
          { name: "SPI MOSI (COPI)", direction: "I", mode: "spi", note: "Controller-out, peripheral-in. Write-only: there is no MISO/CIPO contact on the breakout." },
          { name: "I2C SDA", direction: "I/O", mode: "i2c" },
        ],
      },
    },
    POWER_DOMAIN_TRAIT,
  ],
);

/** DC — Data/Command select, SPI mode only. */
const displayDc: InterfaceDef = {
  ...withTraits(
    Pin({
      id: "display_dc",
      name: "DC",
      pin: "DC",
      voltageV: VIN_RANGE,
      capabilities: { inputOnly: true },
    }),
    [
      {
        type: "pin_functions",
        params: {
          source: "ProtoPart resource display_dc (Adafruit 938 documentation)",
          functions: [
            { name: "DC", direction: "I", mode: "spi", note: "Data/Command select: high = data, low = command. Drive from MCU GPIO." },
          ],
        },
      },
      POWER_DOMAIN_TRAIT,
      {
        type: "usage_restriction",
        params: {
          restriction: "Used in SPI mode only. DC is electrically unused in I2C mode; do not drive it in I2C-only builds.",
          source: "ProtoPart warnings",
        },
      },
    ],
  ),
  capabilities: ["digital_io", "display_dc"],
};

/** RST — active-low reset, optional in both bus modes: onboard auto-reset
 *  circuitry resets the display at power-up (Adafruit 938 datasheet, Nov 2019
 *  STEMMA QT revision). (Absorbs the ProtoPart `display_rst_input` interface
 *  the way the gold standard absorbs single-pin digital interfaces into their
 *  leaf pad.) */
const displayRst: InterfaceDef = {
  ...withTraits(
    Pin({
      id: "display_rst",
      name: "RST",
      pin: "RST",
      voltageV: VIN_RANGE,
      capabilities: { inputOnly: true },
    }),
    [
      {
        type: "pin_functions",
        params: {
          source: "ProtoPart resource display_rst (Adafruit 938 documentation)",
          functions: [
            { name: "RST", direction: "I", note: "Active-low reset input. Optional in both SPI and I2C modes: onboard auto-reset circuitry resets the display at power-up (Adafruit 938 datasheet, Nov 2019 revision). May be driven from an MCU GPIO for explicit hardware resets." },
          ],
        },
      },
      POWER_DOMAIN_TRAIT,
      {
        type: "reset_timing",
        params: {
          min_low_pulse_us: 3,
          description: "Pulse RST low for at least 3 us during init before issuing any SPI or I2C commands.",
          source: "ProtoPart design rules (SSD1306 datasheet)",
        },
      },
    ],
  ),
  capabilities: ["digital_io", "display_reset", "reset_input"],
};

/** CS — active-low SPI chip select, SPI mode only. */
const displayCs: InterfaceDef = withTraits(
  Pin({
    id: "display_cs",
    name: "CS",
    pin: "CS",
    voltageV: VIN_RANGE,
    capabilities: { inputOnly: true, spiSs: true },
  }),
  [
    {
      type: "pin_functions",
      params: {
        source: "ProtoPart resource display_cs (Adafruit 938 documentation)",
        functions: [
          { name: "CS", direction: "I", mode: "spi", note: "Active-low SPI chip-select input. Drive from MCU GPIO." },
        ],
      },
    },
    POWER_DOMAIN_TRAIT,
    {
      type: "usage_restriction",
      params: {
        restriction: "Used in SPI mode only. CS is electrically unused in I2C mode; do not drive it in I2C-only builds.",
        source: "ProtoPart warnings",
      },
    },
  ],
);

/** All 8 header pads in board order — schematic-honest. */
const pads: InterfaceDef[] = [vin, oled3vo, gnd, spiClk, spiData, displayDc, displayRst, displayCs];

// ---------------------------------------------------------------------------
// Bus targets — I2C default, SPI selectable by solder-jumper cuts.
// The two composed interfaces bind the SAME CLK/DATA pads; the one_of
// interface group + co_requirement traits carry the mutual exclusion.
// ---------------------------------------------------------------------------

const BUS_MODE_CO_REQUIREMENT = (other: string, condition: string, effect: string): TraitDef => ({
  type: "co_requirement",
  params: {
    with: other,
    condition,
    effect,
    source: "Adafruit 938 product documentation: SPI vs I2C mode is set by physical solder jumpers and is not runtime-switchable.",
  },
});

const i2cTarget = amend(
  I2C({
    id: "display_i2c_target",
    name: "OLED I2C target",
    roles: ["slave"],
    clockFreqHz: [0, I2C_MAX_HZ],
    address: I2C_ADDRESS_DEFAULT,
    sda: "spi_data",
    scl: "spi_clk",
    maxInstances: 1,
    defaultActive: true, // I2C is the factory-default mode (jumpers intact).
  }),
  "display_i2c_target",
  [
    { type: "display_notation", params: { latex: "I^{2}C" } },
    {
      type: "i2c_addressing",
      params: {
        default_7bit: "0x3D",
        alternate_7bit: "0x3C",
        selection: "jumper-selectable",
        note: "7-bit address 0x3D by default, jumper-selectable to 0x3C.",
      },
    },
    {
      type: "onboard_passives",
      params: {
        purpose: "Open-drain bus pull-ups",
        components: [{ kind: "resistor", connection: "SDA and SCL to the 3.3 V rail (fitted on the breakout)" }],
        note: "The breakout includes onboard I2C pull-ups; if sharing a multi-target I2C bus, make sure overall pull-up loading still meets the bus rules.",
        source: "ProtoPart design rules",
      },
    },
    {
      type: "unused_pins_in_mode",
      params: {
        pins: ["display_dc", "display_cs"],
        note: "DC and CS pads are electrically unused in I2C mode; do not drive them in I2C-only builds.",
      },
    },
    BUS_MODE_CO_REQUIREMENT(
      "display_spi_target",
      "Bus-mode solder jumpers intact (factory default)",
      "The I2C target exists only while the two solder jumpers on the back of the breakout are intact. Cutting them for SPI mode permanently disables I2C — the modes are mutually exclusive, never simultaneous.",
    ),
  ],
);

/**
 * Hand-rolled SPI slave: the SPI() builder would fabricate a required MISO
 * slot, but this bus is 3-wire write-only (SCK + MOSI + CS) plus the DC
 * Data/Command digital input — there is no MISO/CIPO contact on the breakout.
 */
const spiTarget: InterfaceDef = {
  id: "display_spi_target",
  name: "OLED SPI target",
  domain: "electrical",
  exposed: true,
  default_active: false, // Only after the one-time solder-jumper cuts.
  protocols: [{ type: "spi", roles: ["slave"] }],
  parameters: [clockFreqHz([0, SPI_MAX_HZ])], // "Maximum SPI clock is 10 MHz per the SSD1306 datasheet."
  slots: [
    { id: "mosi", label: "MOSI/COPI (write-only)", required: true, match: { protocol: "spi", role: "data_out", capability: "spi_mosi" } },
    { id: "sck", required: true, match: { protocol: "spi", role: "clock", capability: "spi_sck" } },
    { id: "ss", label: "CS", required: true, match: { protocol: "spi", role: "select", capability: "spi_ss" } },
    { id: "dc", label: "Data/Command select", required: true, match: { protocol: "digital", role: "input", capability: "display_dc" } },
  ],
  profiles: [
    {
      id: "display_spi_pads",
      label: "DATA/CLK/CS/DC header pads",
      bindings: { mosi: "spi_data", sck: "spi_clk", ss: "display_cs", dc: "display_dc" },
    },
  ],
  max_instances: 1,
  traits: [
    {
      type: "bus_topology",
      params: {
        wires: 3,
        write_only: true,
        note: "3-wire write-only SPI bus (SCK + MOSI + CS) plus a Data/Command digital input. The OLED is write-only over SPI — firmware that reads back display data over SPI will not work.",
        source: "ProtoPart design rules / warnings",
      },
    },
    BUS_MODE_CO_REQUIREMENT(
      "display_i2c_target",
      "Both bus-mode solder jumpers cut",
      "Active only when the breakout's two solder jumpers are cut for SPI mode — a one-time physical board-prep step, not runtime configurable. Cutting them disables the default I2C target.",
    ),
  ],
};

// ---------------------------------------------------------------------------
// Mechanical
// ---------------------------------------------------------------------------

/** Derived from the ProtoPart mechanical metadata (0.1" header, breakout PCB). */
const headerMount: InterfaceDef = {
  id: "header_mounting",
  name: '0.1" Header Breakout Mounting',
  domain: "mechanical",
  exposed: true,
  default_active: true,
  protocols: [{ type: "mechanical_connection", roles: ["mounting_point"] }],
  capabilities: ["pcb_header_pins", "header_0_1in", "breakout_pcb"],
};

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

export const ADAFRUIT_938_128X64_OLED: ModuleDef = defineModule({
  id: "adafruit-938-128x64-oled",
  name: 'Adafruit Monochrome 1.3" 128x64 OLED Graphic Display',
  version: "1.0.0",
  manufacturer: "Adafruit Industries LLC",
  part_number: "938",
  description:
    '1.3" diagonal monochrome 128x64 OLED graphic display breakout based on the Solomon Systech SSD1306 controller. Default-mode I2C, with SPI selectable by cutting two solder jumpers on the back of the breakout PCB. Onboard 3.3 V regulator and full level-shifted logic accept 3 V or 5 V at VIN. White pixels.',
  tags: ["adafruit", "938", "oled", "1.3-inch", "128x64", "ssd1306", "monochrome", "display", "spi", "i2c", "breakout"],
  categories: ["expansion.breakout"],

  interfaces: [
    // All 8 header pads in board order — schematic-honest.
    ...pads,

    // Bus targets (mutually exclusive — see interfaceGroups.bus_mode)
    ...i2cTarget,
    spiTarget,

    // Mechanical
    headerMount,
  ],

  interfaceGroups: [
    {
      id: "bus_mode",
      label: "Host Bus Mode (solder-jumper selected)",
      members: ["display_i2c_target", "display_spi_target"],
      policy: "one_of",
    },
    {
      id: "required_power_pins",
      label: "Required Power Pins",
      members: ["vin", "gnd"],
      policy: "all_of",
    },
    {
      id: "spi_mode_control_pins",
      label: "SPI-Mode-Only Control Pads (unused in I2C mode)",
      members: ["display_dc", "display_cs"],
      policy: "all_of",
    },
  ],

  requirements: [
    {
      type: "power",
      description:
        "VIN accepts 3 V to 5 V into the onboard 3.3 V regulator; typical draw 25 mA, peak 40 mA (~132 mW). Decouple VIN to ground with at least 0.1 µF locally.",
      voltage_V: [3, 5],
      current_mA: 40,
    },
    {
      type: "interface",
      description:
        "Exactly one host bus (see bus_mode group): the default-mode I2C master (7-bit address 0x3D, jumper-selectable to 0x3C, up to 400 kHz per the SSD1306 datasheet), or — after cutting the two solder jumpers — a write-only SPI master (SCK/MOSI/CS, up to 10 MHz) plus a DC Data/Command GPIO.",
      interface_protocol: "i2c",
    },
    {
      type: "interface",
      description:
        "RST is optional in both bus modes: onboard auto-reset circuitry resets the display at power-up (Adafruit 938 datasheet, Nov 2019 revision). If driven by a host GPIO, pulse low for at least 3 µs (SSD1306 datasheet) before issuing any SPI or I2C commands.",
      interface_protocol: "digital",
    },
  ],

  domains: [
    {
      domain: "electrical",
      power_domains: [
        {
          id: "vdd_3v3",
          name: "Display 3.3 V logic supply",
          nominal_voltage_V: 3.3,
          // ProtoPart voltage_range_V is the VIN acceptance window; the
          // onboard regulator holds the SSD1306 at 3.3 V regardless.
          voltage_range_V: VIN_RANGE,
          max_current_mA: 50,
          regulation_type: "regulated",
        },
      ],
      metadata: {
        pin_count: 8,
        supply_voltage_V: VIN_RANGE,
        power_consumption_mW: 132,
        current_typical_mA: 25,
        current_peak_mA: 40,
        panel_size_inches: 1.3,
        resolution_pixels: "128x64",
        controller: "SSD1306",
        pixel_color: "white",
        default_interface: "I2C",
        spi_requires_jumper_cuts: true,
        i2c_addresses_7bit: ["0x3D", "0x3C"],
        i2c_max_frequency_hz: I2C_MAX_HZ,
        spi_max_frequency_hz: SPI_MAX_HZ,
        regulated_3v3_output: true,
        logic_level_shifted: true,
        source: "ProtoPart adafruit-938-128x64-oled definition (Adafruit 938 documentation / SSD1306 datasheet)",
      },
    },
    {
      domain: "mechanical",
      dimensions_mm: { length: 35.6, width: 33, height: 6.2 },
      metadata: {
        package_type: "Adafruit breakout PCB",
        mounting_method: "pcb_header_pins",
        connector_system: "0.1 inch header",
        field_serviceable: true,
      },
    },
    {
      domain: "thermal",
      operating_temperature_C: [-40, 85],
      metadata: {
        requires_thermal_management: false,
        operating_temperature_source:
          "Inherited from Solomon Systech SSD1306 controller datasheet; not stated on Adafruit product page.",
      },
    },
  ],

  traits: [
    {
      type: "bus_mode_selection",
      params: {
        default: "I2C",
        alternate: "SPI",
        mechanism:
          "To enable SPI mode, cut the two solder jumpers on the back of the breakout (this is a one-time physical board-prep step, not runtime configurable).",
        runtime_switchable: false,
        mutually_exclusive: true,
        source: "Adafruit 938 product documentation / ProtoPart design rules",
      },
    },
    {
      type: "display_panel",
      params: {
        controller: "SSD1306",
        resolution_pixels: "128x64",
        panel_size_inches: 1.3,
        color: "monochrome (white pixels)",
      },
    },
    {
      type: "software_compatibility",
      params: {
        libraries: ["u8g2", "Adafruit_SSD1306", "luma.oled"],
        note: "SSD1306 is broadly supported. Default I2C address is 0x3D (jumper-selectable to 0x3C); SPI mode requires physically cutting two solder jumpers on the breakout's back side.",
        source: "ProtoPart compatibility_notes",
      },
    },
  ],

  artifacts: [
    {
      id: "art_datasheet",
      name: "Adafruit 938 Product Datasheet (938_Web.pdf)",
      type: "datasheet",
      url: "https://mm.digikey.com/Volume0/opasdata/d220001/medias/docus/197/938_Web.pdf",
      filePath: "./ProtoPart/protoparts/adafruit-938-128x64-oled/artifacts/datasheet/938_Web.pdf",
      mimeType: "application/pdf",
    },
    {
      id: "art_product_page",
      name: "Adafruit Product Page (product 938)",
      type: "documentation",
      url: "https://www.adafruit.com/product/938",
    },
  ],

  geometry: {
    xScale: 1,
    yScale: 1,
    outline: { preset: "rectangle" },
  },
});
