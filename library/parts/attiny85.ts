/**
 * Microchip (Atmel) ATtiny85-20PU — datasheet-honest part definition.
 *
 * Primary sources:
 *   - ATtiny25/45/85 Datasheet (Atmel-2586) — pin configuration, alternate
 *     port functions, fuse behaviour (RSTDISBL/DWEN/CKSEL/CKOUT), DC
 *     characteristics, absolute maximum ratings.
 *   - ProtoPart `attiny85` definition (audited source of truth): per-pin
 *     function lists, logic thresholds, current ratings, design rules,
 *     usage notes, and warnings are carried over verbatim from it. Values
 *     not present there are omitted, not invented.
 *
 * Architecture notes honoured by this file:
 *   - Pin-honest like a schematic: all 8 physical PDIP-8 pins are leaf
 *     interfaces, in package order, with ids "pin_N" and the datasheet
 *     port/pin name as the displayed name (PB5, PB3, PB4, GND, PB0, PB1,
 *     PB2, VCC).
 *   - Every pin carries its verbatim ProtoPart function list (name,
 *     direction, signal class, description) in an `attiny85_pin_functions`
 *     trait — display data is separated from the canonical capability tags
 *     the matching engine needs.
 *   - Instances vs combinations: the ATtiny85 has no pin matrix — every
 *     peripheral signal is fixed to exactly one pad, so each controller
 *     exposes a single fixed profile and `max_instances: 1`.
 *   - Co-requirements (`co_requirement` traits): programming the RSTDISBL
 *     fuse frees PB5 (GPIO/ADC0/PCINT5) but permanently disables ISP
 *     programming; the USI is shared between SPI (three-wire) and I2C
 *     (two-wire) modes — only one protocol at a time; a crystal on
 *     XTAL1/XTAL2 commits PB3 and PB4 entirely; CLKI external-clock mode is
 *     mutually exclusive with XTAL1 crystal mode; ISP reuses the USI pins.
 *   - Implied harness connections (`implied_passives` traits): 100 nF VCC
 *     decoupling, 10 kΩ RESET pull-up, USI-I2C bus pull-ups
 *     (4.7 kΩ @ 100 kHz / 2.2 kΩ @ 400 kHz), crystal load capacitors.
 *   - Shareability exemptions (`net_shareable` traits): single VCC and GND
 *     pins are shared rails.
 *   - ProtoPart node-layout preservation: the ProtoPart definition places
 *     the 8 electrical pins at positions 1/2/5/8/11/12/14/15 of a 20-position
 *     node layout, with 12 "DNC" footprint-only mounting positions. Physical
 *     PDIP-8 pin numbers (1-8, confirmed by the ProtoPart design rules:
 *     "VCC (pin 8) and GND (pin 4)", "RESET pin (PB5, pin 1)") are used for
 *     the `pin` designators; the node-layout positions are preserved in
 *     `protopart_node_position` traits and the DNC positions in the `dnc`
 *     mechanical interface.
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
  SPI,
  I2C,
  defineModule,
  clockFreqHz,
  resolutionBits,
} from "../../src/protocols/index.js";

// ---------------------------------------------------------------------------
// Electrical constants — ProtoPart power domain / absolute maximum ratings
// ---------------------------------------------------------------------------

/** 2.7-5.5 V for operation up to 10 MHz (ATTINY85-20PU industrial variant). */
const VCC_RANGE: [number, number] = [2.7, 5.5];
/** 4.5-5.5 V required for the 20 MHz speed grade. */
const VCC_RANGE_20MHZ: [number, number] = [4.5, 5.5];
/** Per-pin continuous source/sink current limit (absolute max). */
const PIN_CURRENT_MA = 40;
/** Total continuous current through the VCC or GND pin (absolute max). */
const VCC_GND_CURRENT_MA = 200;

/**
 * Standard GPIO logic thresholds at VCC = 5 V (ProtoPart per-pin
 * logic_levels): V_IH min = 0.6*VCC, V_IL max = 0.3*VCC; V_OH min = 4.3 V at
 * 10 mA source, V_OL max = 0.6 V at 10 mA sink.
 */
const STD_LOGIC_LEVELS_TRAIT: TraitDef = {
  type: "logic_levels",
  params: {
    v_ih_min_V: 3.0,
    v_il_max_V: 1.5,
    v_oh_min_V: 4.3,
    v_ol_max_V: 0.6,
    conditions:
      "At VCC = 5 V: V_IH min = 0.6*VCC, V_IL max = 0.3*VCC; V_OH min at 10 mA source, V_OL max at 10 mA sink.",
    source: "ATtiny25/45/85 Datasheet (Atmel-2586), DC characteristics",
  },
};

/**
 * PB5 in its default RESET role uses tighter thresholds than regular GPIO:
 * V_IH min = 0.9*VCC, V_IL max = 0.2*VCC (values shown at VCC = 5 V).
 */
const RESET_LOGIC_LEVELS_TRAIT: TraitDef = {
  type: "logic_levels",
  params: {
    v_ih_min_V: 4.5,
    v_il_max_V: 1.0,
    conditions:
      "RESET function thresholds at VCC = 5 V: V_IH min = 0.9*VCC, V_IL max = 0.2*VCC — tighter than regular GPIO.",
    source: "ATtiny25/45/85 Datasheet (Atmel-2586), DC characteristics",
  },
};

// ---------------------------------------------------------------------------
// Datasheet-honest per-pin function metadata
// ---------------------------------------------------------------------------

/** Verbatim per-pin function row from the ProtoPart resource list. */
interface Attiny85Function {
  /** Signal/function name exactly as recorded in the ProtoPart definition. */
  name: string;
  /** ProtoPart direction vocabulary: sink = input, source = output. */
  direction?: "sink" | "source" | "bidirectional";
  signal_class?: "data" | "clock" | "sense" | "power" | "ground";
  description: string;
}

interface Attiny85PinSpec {
  /** Physical PDIP-8 package pin number. */
  pin: number;
  /** Datasheet port pin name — used as the displayed interface name. */
  name: string;
  /** Position of this pin in the ProtoPart 20-position node layout. */
  nodePosition: number;
  /** ProtoPart resource description (the slash-separated function summary). */
  summary: string;
  functions: Attiny85Function[];
  /** Timer compare-match output present (OC0x/OC1x). */
  pwm?: boolean;
  /** Any analog input function (ADC channel, comparator input, AREF). */
  analogIn?: boolean;
  i2cSda?: boolean;
  i2cScl?: boolean;
  spiMosi?: boolean;
  spiMiso?: boolean;
  spiSck?: boolean;
  /** Capability tags for fixed peripheral signals (slot matching). */
  extraCaps?: string[];
  /** PB5 uses the RESET thresholds instead of the standard GPIO ones. */
  resetLogic?: boolean;
  /** Extra pin-specific traits appended after the shared ones. */
  traits?: TraitDef[];
  /** Verbatim ProtoPart per-pin notes. */
  notes: string;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

/** Build one schematic-honest port pin from its ProtoPart resource row. */
function attiny85PortPin(spec: Attiny85PinSpec): InterfaceDef {
  const base = Pin({
    id: `pin_${spec.pin}`,
    name: spec.name,
    pin: spec.pin,
    voltageV: VCC_RANGE,
    capabilities: {
      // Every PB pin is a PCINT source (pin-change interrupt).
      interrupt: true,
      pwm: spec.pwm,
      analogIn: spec.analogIn,
      i2cSda: spec.i2cSda,
      i2cScl: spec.i2cScl,
      spiMosi: spec.spiMosi,
      spiMiso: spec.spiMiso,
      spiSck: spec.spiSck,
    },
  });

  const capabilities = unique([
    ...(base.capabilities ?? []),
    "pcint",
    ...(spec.extraCaps ?? []),
  ]);

  const parameters: Parameter[] = [
    ...(base.parameters ?? []),
    { id: "source_current", name: "Max continuous source current", unit: "mA", value: PIN_CURRENT_MA },
    { id: "sink_current", name: "Max continuous sink current", unit: "mA", value: PIN_CURRENT_MA },
  ];

  const traits: TraitDef[] = [
    {
      type: "attiny85_pin_functions",
      params: {
        source: "ATtiny25/45/85 Datasheet (Atmel-2586), Pin Configurations / Alternate Port Functions; ProtoPart attiny85 definition",
        summary: spec.summary,
        functions: spec.functions,
        note: spec.notes,
      },
    },
    { type: "power_domain", params: { domain: "vcc" } },
    {
      type: "internal_pulls",
      params: {
        pull_up: true,
        pull_down: false,
        note: "Software-selectable internal pull-up; no internal pull-down (ProtoPart has_internal_pullup / has_internal_pulldown).",
      },
    },
    spec.resetLogic ? RESET_LOGIC_LEVELS_TRAIT : STD_LOGIC_LEVELS_TRAIT,
    {
      type: "protopart_node_position",
      params: {
        position: spec.nodePosition,
        note: "Position of this pad in the ProtoPart 20-position node layout; the physical PDIP-8 pin number is the `pin` designator.",
      },
    },
    ...(spec.traits ?? []),
  ];

  return { ...base, capabilities, parameters, traits };
}

// ---------------------------------------------------------------------------
// Port pins PB0-PB5 — ProtoPart electrical resources, in PDIP-8 package order
// ---------------------------------------------------------------------------

const PORT_PIN_SPECS: Attiny85PinSpec[] = [
  {
    pin: 1, name: "PB5", nodePosition: 1,
    summary: "PCINT5 / !RESET / ADC0 / dW",
    analogIn: true,
    extraCaps: ["adc_in", "ext_reset", "debugwire"],
    resetLogic: true,
    functions: [
      {
        name: "Pin Change Interrupt", direction: "sink", signal_class: "data",
        description: "PCINT5 pin-change interrupt source. Only available when the RSTDISBL fuse repurposes the pin as PB5; latches on any logic-level transition on the pin.",
      },
      {
        name: "Reset", direction: "sink", signal_class: "data",
        description: "Active-low external reset input (default function). Holds the AVR core in reset while driven low; minimum recognised pulse width is 2.5 us. Internal pull-up is enabled at power-up.",
      },
      {
        name: "ADC", direction: "sink", signal_class: "sense",
        description: "ADC0 single-ended 10-bit analog input channel. Selectable only after the RSTDISBL fuse turns the pin into general-purpose PB5.",
      },
      {
        name: "Debug", direction: "bidirectional", signal_class: "data",
        description: "debugWIRE single-wire on-chip debug interface, multiplexed on the RESET pin when the DWEN fuse is programmed. Replaces conventional ISP behaviour.",
      },
    ],
    traits: [
      {
        type: "usage_restriction",
        params: {
          restriction:
            "RESET is the default function. Programming the RSTDISBL fuse to free PB5 as GPIO/ADC0/PCINT5 permanently disables ISP programming — recovery requires a high-voltage serial programmer.",
          exemption:
            "Free as GPIO/ADC0/PCINT5 once RSTDISBL is programmed and the design accepts high-voltage-serial-only reprogramming.",
        },
      },
      {
        type: "high_voltage_tolerance",
        params: {
          note: "The high-voltage programming mode tolerates up to +13 V on this pin only (absolute max on all other pins is VCC + 0.5 V).",
          max_voltage_V: 13,
        },
      },
    ],
    notes:
      "RESET is the default function and uses a tighter threshold than regular GPIO: V_IH min = 0.9*VCC, V_IL max = 0.2*VCC (values shown at VCC=5 V). Programming the RSTDISBL fuse to free PB5 as GPIO/ADC0/PCINT5 permanently disables ISP programming — recovery requires a high-voltage serial programmer. The high-voltage programming mode tolerates up to +13 V on this pin only.",
  },
  {
    pin: 2, name: "PB3", nodePosition: 2,
    summary: "PCINT3 / XTAL1 / CLKI / !OC1B / ADC3",
    pwm: true, analogIn: true,
    extraCaps: ["adc_in", "xtal1", "clki", "oc1b_n"],
    functions: [
      {
        name: "Pin Change Interrupt", direction: "sink", signal_class: "data",
        description: "PCINT3 pin-change interrupt source. Fires on any logic-level transition on PB3.",
      },
      {
        name: "XTAL1", direction: "sink", signal_class: "clock",
        description: "Crystal oscillator input. Pairs with XTAL2 on PB4 to drive an external 0.4-20 MHz crystal/resonator (or a 32.768 kHz watch crystal in low-frequency mode) when the CKSEL fuses select a crystal source (datasheet Tables 6-1 and 6-12). Pin is unavailable for other duties while the crystal oscillator is enabled.",
      },
      {
        name: "CLKI", direction: "sink", signal_class: "clock",
        description: "External clock input. Routes a single-ended logic-level clock straight into the AVR core when the CKSEL fuses select the external-clock source. Mutually exclusive with XTAL1 crystal mode.",
      },
      {
        name: "!PWM", direction: "source", signal_class: "data",
        description: "Timer1 compare-match output OC1B (inverted). Capable of high-speed PWM up to ~250 kHz at 8-bit resolution when fed from the internal 64 MHz PLL clock.",
      },
      {
        name: "ADC", direction: "sink", signal_class: "sense",
        description: "ADC3 single-ended 10-bit analog input channel.",
      },
    ],
    notes:
      "Standard GPIO thresholds at VCC=5 V: V_IH min = 0.6*VCC, V_IL max = 0.3*VCC; V_OH min = 4.3 V at 10 mA source, V_OL max = 0.6 V at 10 mA sink. When PB3 is committed to XTAL1/CLKI the pin cannot also act as a GPIO, PWM, or ADC channel — the crystal load capacitors occupy the net.",
  },
  {
    pin: 3, name: "PB4", nodePosition: 5,
    summary: "PCINT4 / XTAL2 / CLKO / OC1B / ADC2",
    pwm: true, analogIn: true,
    extraCaps: ["adc_in", "xtal2", "clko", "oc1b"],
    functions: [
      {
        name: "Pin Change Interrupt", direction: "sink", signal_class: "data",
        description: "PCINT4 pin-change interrupt source. Fires on any logic-level transition on PB4.",
      },
      {
        name: "XTAL2", direction: "source", signal_class: "clock",
        description: "Crystal oscillator output. Pairs with XTAL1 on PB3 to drive an external crystal/resonator when the CKSEL fuses select a crystal source.",
      },
      {
        name: "CLKO", direction: "source", signal_class: "clock",
        description: "Buffered system clock output. Enabled by programming the CKOUT fuse; outputs the divided system clock so downstream devices can be slaved to the AVR.",
      },
      {
        name: "PWM", direction: "source", signal_class: "data",
        description: "Timer1 compare-match output OC1B. Capable of high-speed PWM up to ~250 kHz at 8-bit resolution when fed from the internal 64 MHz PLL clock.",
      },
      {
        name: "ADC", direction: "sink", signal_class: "sense",
        description: "ADC2 single-ended 10-bit analog input channel.",
      },
    ],
    notes:
      "Standard GPIO thresholds at VCC=5 V: V_IH min = 0.6*VCC, V_IL max = 0.3*VCC; V_OH min = 4.3 V at 10 mA source, V_OL max = 0.6 V at 10 mA sink. When PB4 is committed to XTAL2 the pin cannot also act as GPIO, PWM, or ADC.",
  },
  {
    pin: 5, name: "PB0", nodePosition: 11,
    summary: "MOSI / DI / SDA / AIN0 / OC0A / !OC1A / AREF / PCINT0",
    pwm: true, analogIn: true, i2cSda: true, spiMosi: true,
    extraCaps: ["usi_di", "ain0", "aref", "oc0a", "oc1a_n"],
    functions: [
      {
        name: "MOSI", direction: "bidirectional", signal_class: "data",
        description: "SPI master-out/slave-in data line used by AVR ISP programmers (slave role on this device, sinking writes; mastered out when USI is configured as SPI master).",
      },
      {
        name: "DI", direction: "sink", signal_class: "data",
        description: "USI serial data input. Sampled in three-wire (SPI-like) and two-wire (I2C-like) USI modes.",
      },
      {
        name: "SDA", direction: "bidirectional", signal_class: "data",
        description: "USI two-wire (I2C-compatible) data line. Open-drain when driven low; idle state must be pulled high externally.",
      },
      {
        name: "AIN0", direction: "sink", signal_class: "sense",
        description: "Analog comparator positive input.",
      },
      {
        name: "PWM", direction: "source", signal_class: "data",
        description: "Timer0 compare-match output OC0A — 8-bit PWM up to ~62 kHz at the typical 16 MHz system clock.",
      },
      {
        name: "!PWM", direction: "source", signal_class: "data",
        description: "Timer1 compare-match output OC1A (inverted). High-speed PWM up to ~250 kHz when the timer is fed from the 64 MHz PLL clock.",
      },
      {
        name: "AREF", direction: "sink", signal_class: "sense",
        description: "External ADC reference voltage input. Selected by the REFS bits in ADMUX; external reference range is 2.0 V to VCC for single-ended channels (datasheet Table 21-8).",
      },
      {
        name: "Pin Change Interrupt", direction: "sink", signal_class: "data",
        description: "PCINT0 pin-change interrupt source. Fires on any logic-level transition on PB0.",
      },
    ],
    notes:
      "Standard GPIO thresholds at VCC=5 V: V_IH min = 0.6*VCC, V_IL max = 0.3*VCC; V_OH min = 4.3 V at 10 mA source, V_OL max = 0.6 V at 10 mA sink. USI SDA on this pin is open-drain and needs an external pull-up (typically 4.7 kΩ at 100 kHz or 2.2 kΩ at 400 kHz). The pin also doubles as the AREF input and as the ISP MOSI line — isolate during programming if it is also driving a peripheral net.",
  },
  {
    pin: 6, name: "PB1", nodePosition: 12,
    summary: "MISO / DO / AIN1 / OC0B / OC1A / PCINT1",
    pwm: true, analogIn: true, spiMiso: true,
    extraCaps: ["usi_do", "ain1", "oc0b", "oc1a"],
    functions: [
      {
        name: "MISO", direction: "bidirectional", signal_class: "data",
        description: "SPI master-in/slave-out data line used by AVR ISP programmers (source role on this device when reading flash; sink when USI is configured as SPI master).",
      },
      {
        name: "DO", direction: "source", signal_class: "data",
        description: "USI serial data output. Driven in three-wire (SPI-like) USI modes.",
      },
      {
        name: "AIN1", direction: "sink", signal_class: "sense",
        description: "Analog comparator negative input.",
      },
      {
        name: "PWM", direction: "source", signal_class: "data",
        description: "Timer0 compare-match output OC0B (8-bit, up to ~62 kHz) and Timer1 compare-match output OC1A — high-speed PWM up to ~250 kHz when Timer1 is fed from the 64 MHz PLL clock.",
      },
      {
        name: "Pin Change Interrupt", direction: "sink", signal_class: "data",
        description: "PCINT1 pin-change interrupt source. Fires on any logic-level transition on PB1.",
      },
    ],
    traits: [
      {
        type: "usage_note",
        params: {
          note: "Neither PB1 nor PB0 carries an ADC channel — ADC0-ADC3 live on PB5/PB2/PB4/PB3 (datasheet Table 17-4). Assign PB1 to digital/USI/PWM duties when possible and keep PB2/PB3/PB4 free for ADC.",
        },
      },
    ],
    notes:
      "Standard GPIO thresholds at VCC=5 V: V_IH min = 0.6*VCC, V_IL max = 0.3*VCC; V_OH min = 4.3 V at 10 mA source, V_OL max = 0.6 V at 10 mA sink. Neither PB1 nor PB0 carries an ADC channel — ADC0-ADC3 live on PB5/PB2/PB4/PB3 (datasheet Table 17-4). Assign PB1 to digital/USI/PWM duties when possible and keep PB2/PB3/PB4 free for ADC.",
  },
  {
    pin: 7, name: "PB2", nodePosition: 14,
    summary: "SCK / USCK / SCL / ADC1 / T0 / INT0 / PCINT2",
    analogIn: true, i2cScl: true, spiSck: true,
    extraCaps: ["adc_in", "usi_usck", "t0", "int0"],
    functions: [
      {
        name: "SCK", direction: "bidirectional", signal_class: "clock",
        description: "SPI serial clock line. Sourced by the AVR ISP programmer during programming; sourced or sunk by USI depending on master/slave configuration.",
      },
      {
        name: "USCK", direction: "bidirectional", signal_class: "clock",
        description: "USI serial clock. Driven when USI is configured as master; sampled when USI is slave.",
      },
      {
        name: "SCL", direction: "bidirectional", signal_class: "clock",
        description: "USI two-wire (I2C-compatible) clock line. Open-drain when driven low; idle state must be pulled high externally.",
      },
      {
        name: "ADC", direction: "sink", signal_class: "sense",
        description: "ADC1 single-ended 10-bit analog input channel.",
      },
      {
        name: "T0", direction: "sink", signal_class: "clock",
        description: "Timer/Counter0 external clock input. Counts rising or falling edges per the CS02:0 bits.",
      },
      {
        name: "Interrupt", direction: "sink", signal_class: "data",
        description: "INT0 dedicated external interrupt input. Triggers on low level or on rising/falling/any edge per the ISC01:0 bits — the only edge-configurable external interrupt on the device.",
      },
      {
        name: "Pin Change Interrupt", direction: "sink", signal_class: "data",
        description: "PCINT2 pin-change interrupt source. Fires on any logic-level transition on PB2.",
      },
    ],
    notes:
      "Standard GPIO thresholds at VCC=5 V: V_IH min = 0.6*VCC, V_IL max = 0.3*VCC; V_OH min = 4.3 V at 10 mA source, V_OL max = 0.6 V at 10 mA sink. USI SCL is open-drain and needs an external pull-up (typically 4.7 kΩ at 100 kHz or 2.2 kΩ at 400 kHz). INT0 — the only edge-configurable external interrupt on the device — is unique to this pin. PB2 also doubles as the ISP SCK line — isolate during programming if it is also driving a peripheral net.",
  },
];

const portPins: InterfaceDef[] = PORT_PIN_SPECS.map(attiny85PortPin);

// ---------------------------------------------------------------------------
// Power pins — ProtoPart resources "vcc" (pin 8) and "gnd" (pin 4)
// ---------------------------------------------------------------------------

const gndPin: InterfaceDef = {
  ...Ground({ id: "pin_4", name: "GND", pin: 4, maxCurrentA: 0.2 }),
  traits: [
    { type: "power_domain", params: { domain: "vcc" } },
    {
      type: "current_rating_basis",
      params: {
        note: "Total continuous return current through the GND pin is limited to 200 mA (same absolute-max as the VCC pin) — an absolute maximum, not a recommended operating point.",
      },
    },
    {
      type: "net_shareable",
      params: { net: "gnd", policy: "single_ground_instance_may_serve_all_members" },
    },
    {
      type: "assembly_requirement",
      params: {
        note: "Single-pin ground — place the decoupling capacitor between this pin and the VCC pin with the shortest possible loop.",
        source: "ProtoPart attiny85 definition, GND pin notes",
      },
    },
    {
      type: "protopart_node_position",
      params: {
        position: 8,
        note: "Position of this pad in the ProtoPart 20-position node layout; the physical PDIP-8 pin number is the `pin` designator.",
      },
    },
  ],
};

const vccPin: InterfaceDef = {
  ...PowerIn({ id: "pin_8", name: "VCC", pin: 8, voltageV: VCC_RANGE, nominalV: 5 }),
  capabilities: ["power_in", "vcc"],
  traits: [
    { type: "power_domain", params: { domain: "vcc" } },
    {
      type: "operating_conditions",
      params: {
        voltage_range_10MHz_V: VCC_RANGE,
        voltage_range_20MHz_V: VCC_RANGE_20MHZ,
        note: "2.7-5.5 V for operation up to 10 MHz; 4.5-5.5 V for the 20 MHz speed grade. At 3.3 V the maximum reliable clock is 10 MHz.",
      },
    },
    {
      type: "absolute_maximum",
      params: {
        supply_voltage_V: [-0.5, 6],
        note: "Absolute-max supply voltage is 6.0 V — exceeding it damages the part. Total continuous current through the VCC pin is limited to 200 mA, which also caps the sum of per-pin source currents.",
      },
    },
    {
      type: "implied_passives",
      params: {
        purpose: "Supply decoupling",
        components: [
          { kind: "capacitor", value: "100 nF ceramic", connection: "VCC (pin 8) to GND (pin 4), as close to the package as possible" },
        ],
        source: "ProtoPart attiny85 definition, design rules",
      },
    },
    {
      type: "protopart_node_position",
      params: {
        position: 15,
        note: "Position of this pad in the ProtoPart 20-position node layout; the physical PDIP-8 pin number is the `pin` designator.",
      },
    },
  ],
};

/** All 8 physical PDIP-8 pins, in package order — schematic-honest. */
const pins: InterfaceDef[] = [...portPins, gndPin, vccPin].sort(
  (a, b) => Number(a.pin ?? 0) - Number(b.pin ?? 0),
);

// ---------------------------------------------------------------------------
// Peripheral controllers — every routing on the ATtiny85 is pin-fixed
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

/** Shared USI-mode exclusivity — verbatim policy from the ProtoPart usage notes. */
const USI_SHARED_TRAIT = (self: string, others: string): TraitDef => ({
  type: "co_requirement",
  params: {
    with: others,
    condition: `${self} active`,
    effect:
      "The Universal Serial Interface (USI) is shared between SPI and TWI/I2C modes — only one protocol can be active at a time.",
    source: "ProtoPart attiny85 definition, usage notes",
  },
});

// ADC — one 10-bit SAR converter, four fixed single-ended channels.
const adc = composed({
  id: "adc",
  name: "ADC (10-bit SAR)",
  protocolType: "analog",
  roles: ["input"],
  parameters: [resolutionBits(10)],
  slots: [
    { id: "channel", required: true, count: 4, match: { protocol: "analog", role: "input", capability: "adc_in" } },
  ],
  profiles: [
    {
      id: "adc_channels",
      label: "ADC0-ADC3 (fixed analog pins)",
      bindings: { channel: ["pin_1", "pin_7", "pin_3", "pin_2"] },
    },
  ],
  maxInstances: 1,
  traits: [
    {
      type: "channels",
      params: {
        count: 4,
        mapping: "ADC0=PB5 (pin 1), ADC1=PB2 (pin 7), ADC2=PB4 (pin 3), ADC3=PB3 (pin 2)",
        note: "Single-ended 10-bit channels.",
      },
    },
    {
      // The canonical ATtiny85 co-requirement: ADC0 lives on the RESET pin.
      type: "co_requirement",
      params: {
        with: "pin_1, isp",
        condition: "ADC0 in use",
        effect:
          "ADC0 is selectable only after the RSTDISBL fuse turns the pin into general-purpose PB5 — which permanently disables ISP programming (recovery requires a high-voltage serial programmer).",
        source: "ProtoPart attiny85 definition, PB5 function list and warnings",
      },
    },
    {
      type: "reference_options",
      params: {
        note: "Reference selected by the REFS bits in ADMUX; the external AREF input (PB0, pin 5) accepts 2.0 V to VCC for single-ended channels (datasheet Table 21-8).",
        external_reference_interface: "adc_reference",
      },
    },
  ],
});

// External ADC reference input (AREF on PB0).
const adcReference = composed({
  id: "adc_reference",
  name: "ADC Reference (AREF)",
  protocolType: "analog",
  roles: ["input"],
  slots: [{ id: "aref", required: true, match: { protocol: "analog", role: "input", capability: "aref" } }],
  profiles: [
    { id: "aref_pin", label: "AREF = PB0 (pin 5)", bindings: { aref: "pin_5" } },
  ],
  maxInstances: 1,
  traits: [
    {
      type: "configuration_note",
      params: {
        note: "External ADC reference voltage input. Selected by the REFS bits in ADMUX; external reference range is 2.0 V to VCC for single-ended channels (datasheet Table 21-8).",
        source: "ATtiny25/45/85 Datasheet (Atmel-2586), Table 21-8; ProtoPart attiny85 definition, PB0 function list",
      },
    },
    {
      type: "co_requirement",
      params: {
        with: "pin_5",
        condition: "external AREF in use",
        effect: "AREF shares PB0 with the USI data lines (MOSI/DI/SDA), the comparator AIN0 input, and the Timer0/Timer1 PWM outputs — committing it to AREF removes those functions.",
      },
    },
  ],
});

// Analog comparator — fixed AIN0/AIN1 pair.
const comparator = composed({
  id: "comparator",
  name: "Analog Comparator",
  protocolType: "comparator",
  roles: ["input"],
  slots: [
    { id: "ain0", required: true, label: "AIN0 (positive)", match: { protocol: "analog", role: "input", capability: "ain0" } },
    { id: "ain1", required: true, label: "AIN1 (negative)", match: { protocol: "analog", role: "input", capability: "ain1" } },
  ],
  profiles: [
    {
      id: "comparator_pins",
      label: "AIN0=PB0 (pin 5), AIN1=PB1 (pin 6)",
      bindings: { ain0: "pin_5", ain1: "pin_6" },
    },
  ],
  maxInstances: 1,
  traits: [
    {
      type: "channels",
      params: { count: 1, mapping: "Positive input AIN0=PB0, negative input AIN1=PB1" },
    },
  ],
});

// Timer0 PWM — OC0A/OC0B compare-match outputs, 8-bit.
const timer0Pwm = composed({
  id: "timer0_pwm",
  name: "Timer0 PWM (OC0A/OC0B)",
  protocolType: "pwm",
  roles: ["output"],
  parameters: [resolutionBits(8)],
  slots: [
    { id: "oc0a", required: false, match: { protocol: "pwm", role: "output", capability: "oc0a" } },
    { id: "oc0b", required: false, match: { protocol: "pwm", role: "output", capability: "oc0b" } },
  ],
  profiles: [
    {
      id: "timer0_outputs",
      label: "OC0A=PB0 (pin 5), OC0B=PB1 (pin 6)",
      bindings: { oc0a: "pin_5", oc0b: "pin_6" },
    },
  ],
  maxInstances: 1,
  traits: [
    {
      type: "channels",
      params: {
        count: 2,
        mapping: "OC0A=PB0, OC0B=PB1",
        detail: "8-bit PWM up to ~62 kHz at the typical 16 MHz system clock.",
        source: "ProtoPart attiny85 definition, PB0/PB1 function lists",
      },
    },
    {
      type: "instance_combinations",
      params: {
        instances_in_silicon: 1,
        routing: "pin_fixed",
        combination_space: "OC0A and OC0B are fixed to PB0 and PB1 — no alternative routing exists.",
      },
    },
  ],
});

// Timer1 PWM — OC1A/!OC1A/OC1B/!OC1B, high-speed via the 64 MHz PLL.
const timer1Pwm = composed({
  id: "timer1_pwm",
  name: "Timer1 High-Speed PWM (OC1A/OC1B + inverted)",
  protocolType: "pwm",
  roles: ["output"],
  parameters: [resolutionBits(8)],
  slots: [
    { id: "oc1a", required: false, match: { protocol: "pwm", role: "output", capability: "oc1a" } },
    { id: "oc1a_n", required: false, label: "!OC1A (inverted)", match: { protocol: "pwm", role: "output", capability: "oc1a_n" } },
    { id: "oc1b", required: false, match: { protocol: "pwm", role: "output", capability: "oc1b" } },
    { id: "oc1b_n", required: false, label: "!OC1B (inverted)", match: { protocol: "pwm", role: "output", capability: "oc1b_n" } },
  ],
  profiles: [
    {
      id: "timer1_outputs",
      label: "OC1A=PB1 (pin 6), !OC1A=PB0 (pin 5), OC1B=PB4 (pin 3), !OC1B=PB3 (pin 2)",
      bindings: { oc1a: "pin_6", oc1a_n: "pin_5", oc1b: "pin_3", oc1b_n: "pin_2" },
    },
  ],
  maxInstances: 1,
  traits: [
    {
      type: "channels",
      params: {
        count: 4,
        mapping: "OC1A=PB1, !OC1A=PB0, OC1B=PB4, !OC1B=PB3",
        detail: "Compare-match outputs with true and inverted (!) polarities. High-speed PWM up to ~250 kHz at 8-bit resolution when fed from the internal 64 MHz PLL clock.",
        source: "ProtoPart attiny85 definition, PB0/PB1/PB3/PB4 function lists",
      },
    },
    {
      type: "display_notation",
      params: { note: "The ProtoPart definition models the inverted outputs as a separate '!PWM' interface; '!' marks the active-low/inverted compare-match outputs." },
    },
    {
      type: "instance_combinations",
      params: {
        instances_in_silicon: 1,
        routing: "pin_fixed",
        combination_space: "Each output is fixed to its pad — no alternative routing exists.",
      },
    },
  ],
});

// Timer/Counter0 external clock input (T0).
const timerT0 = composed({
  id: "timer",
  name: "Timer/Counter0 External Clock (T0)",
  protocolType: "timer",
  roles: ["input"],
  slots: [{ id: "t0", required: true, match: { capability: "t0" } }],
  profiles: [
    { id: "t0_pin", label: "T0 = PB2 (pin 7)", bindings: { t0: "pin_7" } },
  ],
  maxInstances: 1,
  traits: [
    {
      type: "configuration_note",
      params: {
        note: "Timer/Counter0 external clock input. Counts rising or falling edges per the CS02:0 bits.",
        source: "ProtoPart attiny85 definition, PB2 function list",
      },
    },
  ],
});

// Pin-change interrupts — every port pin is a PCINT source.
const pcint = composed({
  id: "pin_change_interrupt",
  name: "Pin Change Interrupt (PCINT0-5)",
  protocolType: "pin_change_interrupt",
  roles: ["input"],
  slots: [{ id: "channel", required: true, count: 6, match: { capability: "pcint" } }],
  profiles: [
    {
      id: "pcint_channels",
      label: "PCINT0-5 (all port pins)",
      bindings: {
        channel: ["pin_5", "pin_6", "pin_7", "pin_2", "pin_3", "pin_1"], // PCINT0-5 = PB0-PB5
      },
    },
  ],
  maxInstances: 1,
  traits: [
    {
      type: "channels",
      params: {
        count: 6,
        mapping: "PCINT0=PB0, PCINT1=PB1, PCINT2=PB2, PCINT3=PB3, PCINT4=PB4, PCINT5=PB5",
        note: "Fires on any logic-level transition. PCINT5 is only available when the RSTDISBL fuse repurposes the RESET pin as PB5.",
      },
    },
  ],
});

// INT0 — the only edge-configurable external interrupt, fixed to PB2.
const int0 = composed({
  id: "interrupt",
  name: "External Interrupt (INT0)",
  protocolType: "interrupt",
  roles: ["input"],
  slots: [{ id: "int0", required: true, match: { capability: "int0" } }],
  profiles: [
    { id: "int0_pin", label: "INT0 = PB2 (pin 7)", bindings: { int0: "pin_7" } },
  ],
  maxInstances: 1,
  traits: [
    {
      type: "configuration_note",
      params: {
        note: "Triggers on low level or on rising/falling/any edge per the ISC01:0 bits — the only edge-configurable external interrupt on the device.",
        source: "ProtoPart attiny85 definition, PB2 function list",
      },
    },
  ],
});

// USI — the raw Universal Serial Interface (USCK/DO/DI), the hardware that
// backs both the SPI-like three-wire and I2C-like two-wire modes below.
const usi = composed({
  id: "usi",
  name: "USI (Universal Serial Interface)",
  protocolType: "usi",
  roles: ["master", "slave", "clock_provider"],
  slots: [
    { id: "usck", required: true, match: { capability: "usi_usck" } },
    { id: "do", required: true, match: { capability: "usi_do" } },
    { id: "di", required: true, match: { capability: "usi_di" } },
  ],
  profiles: [
    {
      id: "usi_pins",
      label: "USCK=PB2 (pin 7), DO=PB1 (pin 6), DI=PB0 (pin 5)",
      bindings: { usck: "pin_7", do: "pin_6", di: "pin_5" },
    },
  ],
  maxInstances: 1,
  traits: [
    {
      type: "operating_modes",
      params: {
        modes: ["three-wire (SPI-like)", "two-wire (TWI/I2C-like)"],
        note: "Only one protocol can be active at a time; the same three pins are also the AVR ISP programming lines.",
        source: "ProtoPart attiny85 definition, usage notes",
      },
    },
    {
      type: "instance_combinations",
      params: {
        instances_in_silicon: 1,
        routing: "pin_fixed",
        combination_space: "USCK/DO/DI are fixed to PB2/PB1/PB0 — no alternative routing exists.",
      },
    },
  ],
});

// I2C (USI two-wire mode) — open-drain SDA/SCL on PB0/PB2 with mandatory
// external pull-ups. Clock range per the ProtoPart pull-up guidance
// (4.7 kΩ at 100 kHz, 2.2 kΩ at 400 kHz).
const I2C_TRAITS: TraitDef[] = [
  { type: "display_notation", params: { latex: "I^{2}C" } },
  {
    type: "implementation_note",
    params: {
      note: "I2C-compatible signalling is provided by the USI in two-wire mode, not by a dedicated TWI peripheral. SDA and SCL are open-drain when driven low; the idle state must be pulled high externally.",
      source: "ProtoPart attiny85 definition, PB0/PB2 function lists",
    },
  },
  {
    type: "implied_passives",
    params: {
      purpose: "Open-drain bus pull-ups",
      components: [
        { kind: "resistor", value: "typ. 4.7 kΩ at 100 kHz, 2.2 kΩ at 400 kHz", connection: "SDA (PB0) and SCL (PB2) to the bus supply" },
      ],
      source: "ProtoPart attiny85 definition, design rules",
    },
  },
  USI_SHARED_TRAIT("I2C (two-wire USI mode)", "usi, spi"),
];

const i2c = amend(
  I2C({
    id: "i2c",
    name: "I2C (USI two-wire mode)",
    roles: ["master", "slave"],
    clockFreqHz: [100_000, 400_000],
    maxInstances: 1,
    profiles: [
      { id: "i2c_usi_pins", label: "SDA=PB0 (pin 5), SCL=PB2 (pin 7)", sda: "pin_5", scl: "pin_7" },
    ],
  }),
  "i2c",
  I2C_TRAITS,
);

// SPI (USI three-wire mode / ISP wiring) — fixed to PB0/PB1/PB2. The USI has
// no hardware chip-select; the SPI builder's optional `ss` slot stays unbound.
const SPI_TRAITS: TraitDef[] = [
  {
    type: "implementation_note",
    params: {
      note: "SPI-like signalling is provided by the USI in three-wire mode (DI/DO/USCK), and the same pins carry the AVR ISP programming bus (MOSI/MISO/SCK). There is no hardware slave-select; framing is handled in firmware.",
      source: "ProtoPart attiny85 definition, PB0/PB1/PB2 function lists",
    },
  },
  {
    type: "protocol_roles_note",
    params: {
      note: "The ProtoPart definition lists roles master/slave/clock_provider for this bus; clock_provider reflects USCK being driven when USI is master.",
    },
  },
  {
    type: "instance_combinations",
    params: {
      instances_in_silicon: 1,
      routing: "pin_fixed",
      combination_space: "MOSI/MISO/SCK are fixed to PB0/PB1/PB2 — no alternative routing exists.",
    },
  },
  USI_SHARED_TRAIT("SPI (three-wire USI mode)", "usi, i2c"),
];

const spi = amend(
  SPI({
    id: "spi",
    name: "SPI (USI three-wire mode)",
    roles: ["master", "slave"],
    maxInstances: 1,
    profiles: [
      { id: "spi_usi_pins", label: "MOSI=PB0 (pin 5), MISO=PB1 (pin 6), SCK=PB2 (pin 7)", mosi: "pin_5", miso: "pin_6", sck: "pin_7" },
    ],
  }),
  "spi",
  SPI_TRAITS,
);

// External reset — the default function of PB5.
const reset = composed({
  id: "reset",
  name: "External Reset (RESET, active-low)",
  protocolType: "digital",
  roles: ["input"],
  defaultActive: true,
  parameters: [
    { id: "min_reset_pulse", name: "Minimum recognised reset pulse width", unit: "µs", value: 2.5 },
  ],
  slots: [{ id: "reset_n", required: true, match: { capability: "ext_reset" } }],
  profiles: [
    { id: "reset_pin", label: "RESET = PB5 (pin 1)", default_active: true, bindings: { reset_n: "pin_1" } },
  ],
  maxInstances: 1,
  traits: [
    {
      type: "reset_behavior",
      params: {
        polarity: "active_low",
        note: "Holds the AVR core in reset while driven low; minimum recognised pulse width is 2.5 us. Internal pull-up is enabled at power-up.",
        source: "ProtoPart attiny85 definition, PB5 function list",
      },
    },
    {
      type: "implied_passives",
      params: {
        purpose: "Reliable reset in noisy environments",
        components: [
          { kind: "resistor", value: "10 kΩ", connection: "RESET (pin 1) to VCC" },
        ],
        note: "Bring RESET out to a reset button or programming header. Do not leave RESET floating in noisy environments.",
        source: "ProtoPart attiny85 definition, design rules",
      },
    },
    {
      type: "co_requirement",
      params: {
        with: "pin_1, isp",
        condition: "PB5 reclaimed as GPIO (RSTDISBL fuse programmed)",
        effect: "Disabling the reset function permanently disables conventional ISP programming; a high-voltage serial programmer is then required to recover the chip.",
        source: "ProtoPart attiny85 definition, warnings",
      },
    },
  ],
});

// debugWIRE — single-wire on-chip debug multiplexed on the RESET pin.
const debugWire = composed({
  id: "debugwire",
  name: "debugWIRE On-Chip Debug",
  protocolType: "debug",
  roles: ["target"],
  slots: [{ id: "dw", required: true, match: { capability: "debugwire" } }],
  profiles: [
    { id: "dw_pin", label: "dW = RESET/PB5 (pin 1)", bindings: { dw: "pin_1" } },
  ],
  maxInstances: 1,
  traits: [
    {
      type: "configuration_note",
      params: {
        note: "debugWIRE single-wire on-chip debug interface, multiplexed on the RESET pin when the DWEN fuse is programmed. Replaces conventional ISP behaviour.",
        source: "ProtoPart attiny85 definition, PB5 function list",
      },
    },
  ],
});

// AVR ISP — 6-pin in-system programming header (SPI on PB0/PB1/PB2 + RESET).
const isp = composed({
  id: "isp",
  name: "AVR ISP Programming (6-pin)",
  protocolType: "spi",
  roles: ["device"],
  slots: [
    { id: "mosi", required: true, match: { capability: "spi_mosi" } },
    { id: "miso", required: true, match: { capability: "spi_miso" } },
    { id: "sck", required: true, match: { capability: "spi_sck" } },
    { id: "reset_n", required: true, match: { capability: "ext_reset" } },
    { id: "vcc", required: true, match: { capability: "vcc" } },
    { id: "gnd", required: true, match: { capability: "ground" } },
  ],
  profiles: [
    {
      id: "isp_header",
      label: "Standard 6-pin AVR ISP header",
      bindings: {
        mosi: "pin_5",   // PB0
        miso: "pin_6",   // PB1
        sck: "pin_7",    // PB2
        reset_n: "pin_1", // RESET
        vcc: "pin_8",
        gnd: "pin_4",
      },
    },
  ],
  maxInstances: 1,
  traits: [
    {
      type: "configuration_note",
      params: {
        note: "For ISP programming, expose PB0 (MOSI), PB1 (MISO), PB2 (SCK), RESET, VCC, and GND on a standard 6-pin AVR ISP header.",
        source: "ProtoPart attiny85 definition, design rules",
      },
    },
    {
      type: "co_requirement",
      params: {
        with: "usi, i2c, spi",
        condition: "ISP header shares the USI pins",
        effect: "ISP programming reuses the same three USI pins, so an ISP header on a board running USI peripherals needs to share or isolate those nets during programming.",
        source: "ProtoPart attiny85 definition, usage notes",
      },
    },
    {
      type: "co_requirement",
      params: {
        with: "reset",
        condition: "always",
        effect: "Conventional ISP requires the RESET function on pin 1. Programming the RSTDISBL fuse permanently disables ISP; recovery requires a high-voltage serial programmer.",
        source: "ProtoPart attiny85 definition, warnings",
      },
    },
  ],
});

// Crystal oscillator — XTAL1/XTAL2 on PB3/PB4, selected by the CKSEL fuses.
const oscillators = composed({
  id: "oscillators",
  name: "Crystal Oscillator (XTAL1/XTAL2)",
  protocolType: "clock",
  roles: ["input"],
  // Crystal/resonator envelope: 32.768 kHz low-frequency mode plus the
  // 0.4-20 MHz crystal/resonator modes (datasheet Tables 6-1/6-12). 0 Hz is
  // not a valid crystal source; DC-20 MHz applies only to the CLKI external
  // clock input (Table 21-3).
  parameters: [clockFreqHz([32_768, 20_000_000])],
  slots: [
    { id: "xtal1", required: true, match: { capability: "xtal1" } },
    { id: "xtal2", required: true, match: { capability: "xtal2" } },
  ],
  profiles: [
    {
      id: "xtal_pins",
      label: "XTAL1=PB3 (pin 2), XTAL2=PB4 (pin 3)",
      bindings: { xtal1: "pin_2", xtal2: "pin_3" },
    },
  ],
  maxInstances: 1,
  traits: [
    {
      type: "co_requirement",
      params: {
        with: "pin_2, pin_3",
        condition: "crystal/resonator fitted",
        effect: "If using PB3/PB4 as a crystal oscillator (XTAL1/XTAL2), they cannot also drive PWM, ADC, or GPIO — the crystal load capacitors and physical crystal occupy the pins.",
        source: "ProtoPart attiny85 definition, design rules",
      },
    },
    {
      type: "implied_passives",
      params: {
        purpose: "Crystal load",
        components: [
          { kind: "capacitor", value: "per crystal vendor C_L spec", connection: "XTAL1 to GND" },
          { kind: "capacitor", value: "per crystal vendor C_L spec", connection: "XTAL2 to GND" },
        ],
        source: "ProtoPart attiny85 definition, design rules ('the crystal load capacitors and physical crystal occupy the pins')",
      },
    },
    {
      type: "optionality",
      params: {
        note: "Optional — the internal 8 MHz RC oscillator is the default clock and suffices for most applications, but drifts up to ±10% over voltage and temperature; for UART or other timing-sensitive bit-banged protocols, calibrate OSCCAL or use an external crystal.",
        source: "ProtoPart attiny85 definition, design rules / usage notes",
      },
    },
    {
      type: "configuration_note",
      params: {
        note: "Enabled when the CKSEL fuses select the low/high-frequency crystal source. Crystal/resonator operating modes cover 0.4-20 MHz (0.4-0.9 MHz for ceramic resonators only); a 32.768 kHz watch crystal uses the separate low-frequency oscillator mode (datasheet Tables 6-1 and 6-12).",
        source: "ATtiny25/45/85 Datasheet (Atmel-2586), Tables 6-1/6-12; ProtoPart attiny85 definition, PB3 function list",
      },
    },
  ],
});

// External clock input — CLKI on PB3, mutually exclusive with the crystal.
const clockInput = composed({
  id: "clock_input",
  name: "External Clock Input (CLKI)",
  protocolType: "clock",
  roles: ["input"],
  slots: [{ id: "clki", required: true, match: { capability: "clki" } }],
  profiles: [
    { id: "clki_pin", label: "CLKI = PB3 (pin 2)", bindings: { clki: "pin_2" } },
  ],
  maxInstances: 1,
  traits: [
    {
      type: "configuration_note",
      params: {
        note: "Routes a single-ended logic-level clock straight into the AVR core when the CKSEL fuses select the external-clock source.",
        source: "ProtoPart attiny85 definition, PB3 function list",
      },
    },
    {
      type: "co_requirement",
      params: {
        with: "oscillators",
        condition: "external clock selected",
        effect: "Mutually exclusive with XTAL1 crystal mode.",
        source: "ProtoPart attiny85 definition, PB3 function list",
      },
    },
  ],
});

// Buffered system clock output — CLKO on PB4, enabled by the CKOUT fuse.
const clockOutput = composed({
  id: "clock_output",
  name: "System Clock Output (CLKO)",
  protocolType: "clock",
  roles: ["output"],
  slots: [{ id: "clko", required: true, match: { capability: "clko" } }],
  profiles: [
    { id: "clko_pin", label: "CLKO = PB4 (pin 3)", bindings: { clko: "pin_3" } },
  ],
  maxInstances: 1,
  traits: [
    {
      type: "configuration_note",
      params: {
        note: "Enabled by programming the CKOUT fuse; outputs the divided system clock so downstream devices can be slaved to the AVR.",
        source: "ProtoPart attiny85 definition, PB4 function list",
      },
    },
  ],
});

// Composed power input — mirrors the ProtoPart "power_input" interface
// (VCC + GND with max_connections 1 and matching voltage-domain constraint).
const powerInput = composed({
  id: "power_input",
  name: "VCC / GND",
  protocolType: "power",
  roles: ["input"],
  defaultActive: true,
  slots: [
    { id: "vcc", required: true, match: { protocol: "power", role: "input", capability: "vcc" } },
    { id: "gnd", required: true, match: { protocol: "power", role: "ground", capability: "ground" } },
  ],
  profiles: [
    {
      id: "power_pins",
      label: "VCC=pin 8, GND=pin 4",
      default_active: true,
      bindings: { vcc: "pin_8", gnd: "pin_4" },
    },
  ],
  maxInstances: 1,
  traits: [
    {
      type: "connection_constraints",
      params: {
        max_connections: 1,
        requires_matching_voltage_domain: true,
        source: "ProtoPart attiny85 definition, electrical interface 'power_input' constraints",
      },
    },
    {
      type: "implied_passives",
      params: {
        purpose: "Supply decoupling",
        components: [
          { kind: "capacitor", value: "100 nF", connection: "VCC (pin 8) to GND (pin 4), close to the package" },
        ],
        source: "ProtoPart attiny85 definition, 'power_input' interface description",
      },
    },
    {
      type: "supply_note",
      params: {
        note: "Single-rail DC supply input. 2.7-5.5 V (10 MHz max) or 4.5-5.5 V (20 MHz max).",
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Mechanical
// ---------------------------------------------------------------------------

const footprintMount: InterfaceDef = {
  id: "footprint_mounting",
  name: "PDIP-8 Through-Hole Footprint",
  domain: "mechanical",
  exposed: true,
  default_active: true,
  protocols: [{ type: "mechanical_connection", roles: ["mounting_point"] }],
  capabilities: ["pdip8", "through_hole"],
};

/**
 * ProtoPart mechanical interface "dnc": 12 footprint-only mounting positions
 * in the 20-position node layout. They have no internal bond to the PDIP-8
 * die and no physical package pin, so they are preserved here as a single
 * mechanical interface rather than as leaf electrical pins.
 */
const dncMounting: InterfaceDef = {
  id: "dnc",
  name: "DNC Mounting Pins",
  domain: "mechanical",
  exposed: true,
  default_active: false,
  protocols: [{ type: "mechanical_connection", roles: ["mounting_point"] }],
  capabilities: ["dnc_mounting", "through_hole"],
  max_instances: 12,
  traits: [
    {
      type: "protopart_node_positions",
      params: {
        positions: [3, 4, 6, 7, 9, 10, 13, 16, 17, 18, 19, 20],
        note: "Do not connect. Footprint mounting pins only; no internal bond to the PDIP-8 die. Footprint-only mounting pins in the ProtoPart 20-position node layout — they do not correspond to physical PDIP-8 package pins.",
        source: "ProtoPart attiny85 definition, mechanical resources",
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

export const ATTINY85: ModuleDef = defineModule({
  id: "attiny85",
  name: "Microchip ATtiny85 8-bit AVR Microcontroller",
  version: "1.0.0",
  manufacturer: "Microchip Technology (Atmel)",
  part_number: "ATTINY85-20PU",
  description:
    "Microchip (formerly Atmel) ATtiny85 8-bit AVR RISC microcontroller IC with 8 KB flash, 512 B EEPROM, 512 B SRAM, six GPIO, 4-channel 10-bit ADC, Universal Serial Interface (USI) supporting SPI/I2C-like signalling, two 8-bit timer/counters with PWM, internal RC oscillator, and an internal PLL for 64 MHz high-speed PWM. Default variant: ATTINY85-20PU in 8-pin PDIP, rated to 20 MHz at 4.5-5.5 V, -40 to +85 C industrial temperature range. Programmed via 6-pin AVR ISP (SPI on PB0/PB1/PB2 plus RESET) or debugWIRE single-wire interface on the RESET pin.",
  tags: [
    "attiny85",
    "attiny",
    "avr",
    "microcontroller",
    "mcu",
    "8-bit",
    "atmel",
    "microchip",
    "pdip-8",
    "dip-8",
    "usi",
    "arduino-compatible",
  ],
  categories: ["microcontroller"],

  interfaces: [
    // All 8 physical PDIP-8 pins in package order — schematic-honest.
    ...pins,

    // Power
    powerInput,

    // Analog peripherals
    adc,
    adcReference,
    comparator,

    // Timers / PWM
    timer0Pwm,
    timer1Pwm,
    timerT0,

    // Interrupts
    pcint,
    int0,

    // Serial / bus controllers (all backed by the single USI)
    usi,
    ...i2c,
    ...spi,

    // Reset / debug / programming
    reset,
    debugWire,
    isp,

    // Clocks
    oscillators,
    clockInput,
    clockOutput,

    // Mechanical
    footprintMount,
    dncMounting,
  ],

  interfaceGroups: [
    {
      id: "required_power_pins",
      label: "Required Power Pins",
      members: ["pin_8", "pin_4"],
      policy: "all_of",
    },
    {
      id: "isp_header_pins",
      label: "AVR ISP Header Pins (6-pin)",
      members: ["pin_5", "pin_6", "pin_7", "pin_1", "pin_8", "pin_4"],
      policy: "all_of",
    },
    {
      id: "usi_pins",
      label: "USI Pins (shared by SPI, I2C, and ISP)",
      members: ["pin_5", "pin_6", "pin_7"],
      policy: "all_of",
    },
    {
      id: "crystal_pins",
      label: "Crystal Oscillator Pins (XTAL1/XTAL2)",
      members: ["pin_2", "pin_3"],
      policy: "all_of",
    },
  ],

  requirements: [
    {
      type: "power",
      description:
        "Single-rail DC supply: 2.7-5.5 V for operation up to 10 MHz, 4.5-5.5 V for the 20 MHz speed grade (1.8-5.5 V only on ATTINY85V low-voltage variants). Absolute-max supply is 6.0 V. Total continuous current through VCC or GND is limited to 200 mA. Place a 100 nF decoupling capacitor between VCC (pin 8) and GND (pin 4) close to the package.",
      voltage_V: [2.7, 5.5],
    },
  ],

  domains: [
    {
      domain: "electrical",
      power_domains: [
        {
          id: "vcc",
          name: "Core/I-O supply",
          nominal_voltage_V: 5,
          voltage_range_V: VCC_RANGE,
          max_current_mA: VCC_GND_CURRENT_MA,
        },
      ],
      metadata: {
        supply_voltage_V: VCC_RANGE,
        // ProtoPart records pin_count 20 for its node layout (8 electrical
        // pads + 12 DNC mounting positions); the physical PDIP-8 package has
        // 8 pins.
        protopart_node_pin_count: 20,
        package_pins: 8,
        vcc_domain: {
          isolation_type: "non_isolated",
          ground_reference: "common",
          description:
            "Single VCC rail supplies both the AVR core and the I/O pad ring. ATTINY85-20PU is rated 2.7-5.5 V for operation up to 10 MHz and 4.5-5.5 V for operation up to 20 MHz. Total continuous current through the VCC or GND pin is limited to 200 mA. Recommended 0.1 uF decoupling cap close to pin 8.",
        },
        architecture: "8-bit AVR RISC",
        instruction_set: "AVR (120 instructions)",
        flash_memory_KB: 8,
        eeprom_memory_B: 512,
        sram_memory_B: 512,
        flash_endurance_cycles: 10_000,
        eeprom_endurance_cycles: 100_000,
        gpio_count: 6,
        adc_channels: 4,
        adc_resolution_bits: 10,
        pwm_channels: 4,
        timer_count: 2,
        comparator_count: 1,
        max_clock_speed_MHz: {
          at_2p7V_to_5p5V: 10,
          at_4p5V_to_5p5V: 20,
        },
        internal_oscillators_MHz: [8, 0.128],
        pll_peripheral_clock_MHz: 64,
        logic_thresholds_V: {
          v_ih_min_fraction_vcc: 0.6,
          v_il_max_fraction_vcc: 0.3,
          v_oh_min_V_at_5V_10mA_source: 4.3,
          v_ol_max_V_at_5V_10mA_sink: 0.6,
        },
        max_pin_current_mA: PIN_CURRENT_MA,
        max_total_vcc_or_gnd_current_mA: VCC_GND_CURRENT_MA,
        active_current_typ: {
          at_1p8V_1MHz_mA: 0.3,
          at_3V_4MHz_mA: 1.5,
          at_5V_8MHz_mA: 5,
          at_5V_20MHz_mA: 9,
        },
        power_down_current_typ_uA: {
          at_1p8V_wdt_off: 0.1,
          at_5V_wdt_off: 0.5,
        },
        sleep_modes: ["idle", "adc_noise_reduction", "power_down"],
        absolute_maximum_ratings: {
          supply_voltage_V: [-0.5, 6],
          pin_voltage_V_non_reset: [-0.5, "VCC + 0.5"],
          pin_voltage_V_reset: [-0.5, 13],
          pin_continuous_current_mA: 40,
          vcc_or_gnd_continuous_current_mA: 200,
          operating_temperature_absmax_C: [-55, 125],
          storage_temperature_C: [-65, 150],
          junction_temperature_C: 150,
        },
        programming_interfaces: [
          "spi_isp_6pin",
          "debugwire",
          "high_voltage_serial_programming",
        ],
        source: "ProtoPart attiny85 definition, electrical domain metadata (ATtiny25/45/85 Datasheet, Atmel-2586)",
      },
    },
    {
      domain: "mechanical",
      dimensions_mm: { length: 9.43, width: 7.94, height: 4.32 },
      weight_g: 0.55,
      metadata: {
        package_type: "PDIP-8",
        mounting_method: "through_hole",
        field_serviceable: true,
        requires_special_tools: false,
        protopart_node_layout:
          "The ProtoPart node places the 8 electrical pads at positions 1/2/5/8/11/12/14/15 of a 20-position layout; positions 3, 4, 6, 7, 9, 10, 13, 16-20 are DNC footprint-only mounting pins (see the `dnc` interface).",
      },
    },
    {
      domain: "thermal",
      operating_temperature_C: [-40, 85],
      metadata: {
        requires_thermal_management: false,
        thermal_monitoring_available: false,
      },
    },
  ],

  traits: [
    {
      type: "audit_note",
      params: {
        note: "The ProtoPart metadata.id reads 'ATTINY85-20SU' (the SOIC variant suffix) while part_number, description, and all purchase records say ATTINY85-20PU (PDIP-8). The PDIP-8 ATTINY85-20PU is taken as authoritative.",
      },
    },
    {
      type: "capability_absence",
      params: {
        capability: "uart",
        note: "There is no hardware UART on the ATtiny85. UART communication must be bit-banged in firmware (e.g. via SoftwareSerial or Timer0 in CTC mode).",
        source: "ProtoPart attiny85 definition, warnings",
      },
    },
    {
      type: "design_rules",
      params: {
        source: "ProtoPart attiny85 definition, design_rules (verbatim)",
        rules: [
          "Place a 0.1 uF (100 nF) ceramic decoupling capacitor between VCC (pin 8) and GND (pin 4) as close to the package as possible.",
          "If the RESET pin (PB5, pin 1) is left in its default reset role, pull it to VCC through a 10 kΩ resistor and bring it out to a reset button or programming header. Do not leave RESET floating in noisy environments.",
          "For ISP programming, expose PB0 (MOSI), PB1 (MISO), PB2 (SCK), RESET, VCC, and GND on a standard 6-pin AVR ISP header.",
          "When using USI as an I2C/TWI master or slave, add external pull-ups on SDA (PB0) and SCL (PB2): typically 4.7 kΩ at 100 kHz, 2.2 kΩ at 400 kHz.",
          "Do not sink or source more than 40 mA on a single pin, and keep the sum of all currents through VCC or GND below 200 mA. Use an external transistor or driver for higher-current loads.",
          "If using PB3/PB4 as a crystal oscillator (XTAL1/XTAL2), they cannot also drive PWM, ADC, or GPIO — the crystal load capacitors and physical crystal occupy the pins.",
          "The internal 8 MHz RC oscillator drifts up to ±10% over voltage and temperature; for UART or other timing-sensitive bit-banged protocols, calibrate OSCCAL or use an external crystal.",
        ],
      },
    },
    {
      type: "application_examples",
      params: {
        source: "ProtoPart attiny85 definition, application_examples (verbatim)",
        examples: [
          "Compact embedded controller for sensor reading and small actuator control where 6 GPIO are sufficient.",
          "Arduino-compatible projects programmed via Digispark-style USB bootloader or 6-pin ISP using ATTinyCore.",
          "Low-power battery-operated nodes leveraging the power-down sleep mode and watchdog wake-up.",
          "USI-driven I2C master for adding extra peripherals to a board that has no spare hardware I2C.",
          "High-speed PWM generation (up to ~250 kHz) on Timer1 using the internal 64 MHz PLL clock source.",
        ],
      },
    },
    {
      type: "usage_notes",
      params: {
        source: "ProtoPart attiny85 definition, usage_notes (verbatim)",
        note: "The ATtiny85 is the largest member of the ATtiny25/45/85 family. Pin assignments are identical across the three; only flash and SRAM capacity differ. When used in a 4.5-5.5 V system with the internal 8 MHz RC oscillator the chip can be powered directly from the supply with only a decoupling capacitor; no external crystal is required for most applications. The Universal Serial Interface (USI) is shared between SPI and TWI/I2C modes — only one protocol can be active at a time. ISP programming reuses the same three USI pins, so an ISP header on a board running USI peripherals needs to share or isolate those nets during programming. The RESET pin can be reclaimed as PB5 by programming the RSTDISBL fuse, but this disables conventional ISP programming and you will then need a high-voltage serial programmer to recover the chip.",
      },
    },
    {
      type: "warnings",
      params: {
        source: "ProtoPart attiny85 definition, warnings (verbatim)",
        warnings: [
          "The single VCC pin must stay between 2.7 V and 5.5 V for the -20PU industrial variant (1.8-5.5 V for ATTINY85V low-voltage variants). Exceeding 6.0 V will damage the device.",
          "The 20 MHz speed grade only applies when VCC is between 4.5 V and 5.5 V. At 3.3 V the maximum reliable clock is 10 MHz.",
          "There is no hardware UART on the ATtiny85. UART communication must be bit-banged in firmware (e.g. via SoftwareSerial or Timer0 in CTC mode).",
          "Programming the RSTDISBL fuse to free PB5 as a GPIO permanently disables ISP programming; recovery requires a high-voltage serial programmer.",
          "The internal RC oscillator drifts with temperature and supply voltage; precision-timed protocols may require an external crystal or careful OSCCAL trimming.",
        ],
      },
    },
    {
      type: "terminology_policy",
      params: {
        note: "Signal and function names in `attiny85_pin_functions` traits are carried verbatim from the ProtoPart definition (datasheet notation, including '!' for active-low/inverted); canonical capability tags exist only where slot matching requires them.",
      },
    },
  ],

  artifacts: [
    {
      id: "art_datasheet",
      name: "ATtiny25/45/85 Datasheet (Atmel-2586)",
      type: "datasheet",
      url: "https://ww1.microchip.com/downloads/en/devicedoc/atmel-2586-avr-8-bit-microcontroller-attiny25-attiny45-attiny85_datasheet.pdf",
    },
    {
      id: "art_product_page",
      name: "ATtiny85 Microchip product page",
      type: "documentation",
      url: "https://www.microchip.com/en-us/product/attiny85",
    },
    {
      id: "art_product_image",
      name: "ATTINY85-20PU product photo (DigiKey)",
      type: "custom",
      filePath: "./ProtoPart/protoparts/attiny85/artifacts/images/150_8P3_P_8.jpg",
      mimeType: "image/jpeg",
      tags: ["image", "product-photo"],
    },
    {
      id: "art_thumbnail",
      name: "Microchip ATtiny85 8-bit AVR Microcontroller thumbnail",
      type: "custom",
      filePath: "./ProtoPart/protoparts/attiny85/thumbnail.png",
      mimeType: "image/png",
      tags: ["image", "thumbnail", "preview"],
    },
  ],
});
