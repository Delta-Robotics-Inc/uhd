/**
 * Espressif ESP32-DevKitC V4 — board-level, schematic-honest part definition.
 *
 * Primary sources (as audited in the ProtoPart esp32-devkitc-v4 definition):
 *   - ESP32-DevKitC V4 User Guide (docs.espressif.com/projects/esp-dev-kits)
 *     — header pinout (J2/J3, 2x19 @ 2.54 mm), EN/BOOT buttons, power options
 *   - ESP32-DevKitC V4 schematic (esp32_devkitc_v4_sch.pdf)
 *     — AMS1117-3.3 LDO, CP2102N USB-to-UART bridge, C15 errata
 *   - ESP32-WROOM-32E / ESP32-WROOM-32UE datasheet
 *     — module pin functions, flash-reserved pads, PSRAM sub-variant limits
 *
 * This is a BOARD audit, not a chip audit. The board carries an
 * ESP32-WROOM-32E module (which itself contains an ESP32 chip + 4 MB flash);
 * module/chip internals are not re-modelled here — only what the board
 * exposes: 38 header pins, the Micro-USB connector, the USB-UART bridge, the
 * LDO, and the EN/BOOT push-buttons, exactly as the ProtoPart JSON defines
 * them.
 *
 * Architecture notes honoured by this file:
 *   - Pin-honest like a schematic: all 38 header pins are leaf interfaces in
 *     header order (J2-1..J2-19, then J3-1..J3-19), with ids equal to the
 *     ProtoPart resource ids and the official silkscreen name as the
 *     displayed name. The Micro-USB receptacle is a 39th leaf interface.
 *   - Every pin carries its verbatim ProtoPart function list (name,
 *     direction, signal_class, description — including the generator's alias
 *     entries) in a `devkitc_pin_functions` trait; canonical capability tags
 *     exist only where slot matching needs them.
 *   - Composed interfaces mirror the ProtoPart `interfaces` list one-to-one
 *     (same ids, names, protocol types/roles, and max_instances), with slots
 *     derived from the `requires` lists and profiles binding the header-pin
 *     ids wherever the routing is fixed on this board.
 *   - Flash-reserved pins (D0-D3, CMD, CLK = GPIO6-11) carry
 *     `usage_restriction` traits — they are wired to the on-module SPI flash
 *     and must not be used as general I/O (board warning #2).
 *   - Strapping pins (GPIO0/2/5/12/15) carry `boot_strapping` traits; TX/RX
 *     carry the USB-UART sharing note; GPIO16/17 carry the PSRAM
 *     sub-variant restriction.
 *   - Power-input exclusivity (Micro-USB OR 5V pin OR 3V3 pin — never two at
 *     once) is modelled as a `one_of` interface group.
 *   - The seven ProtoPart board warnings are preserved verbatim as
 *     `board_warning` module traits; purchase info and the preview-artifact
 *     pointer (no OpenUHD home) are preserved as module traits too.
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
  SPI,
  defineModule,
} from "../../src/protocols/index.js";

// ---------------------------------------------------------------------------
// Electrical constants — ProtoPart power_domains
// ---------------------------------------------------------------------------

/** io_3v3 power domain: on-board AMS1117-3.3 LDO output. */
const IO_3V3_RANGE: [number, number] = [3, 3.6];
/** usb_5v power domain: Micro-USB VBUS or the 5V header pin. */
const USB_5V_RANGE: [number, number] = [4.75, 5.25];
/** io_3v3 domain max current (LDO budget), mA. */
const IO_3V3_MAX_MA = 600;
/** usb_5v domain max current (USB host / external supply limit), mA. */
const USB_5V_MAX_MA = 500;

/** Source citation used by every per-pin functions trait. */
const FUNCTIONS_SOURCE =
  "ProtoPart esp32-devkitc-v4 definition (ESP32-DevKitC V4 user guide; ESP32-WROOM-32E datasheet)";

// ---------------------------------------------------------------------------
// Verbatim ProtoPart per-pin function metadata
// ---------------------------------------------------------------------------

/** One entry of a ProtoPart resource `functions` list, carried verbatim. */
interface DevkitFunction {
  /** Verbatim ProtoPart function name (aliases included). */
  name: string;
  direction: "sink" | "source" | "bidirectional";
  signal_class?: string;
  /** Verbatim ProtoPart function description. */
  note?: string;
}

// Shared pad-capability functions (identical text across pins in the JSON).
const FN_INPUT_ENABLE: DevkitFunction = {
  name: "input_enable", direction: "sink", signal_class: "digital_pad",
  note: "Pad supports input-enable mode.",
};
const FN_IE_ALIAS: DevkitFunction = {
  name: "IE", direction: "sink", signal_class: "digital_pad",
  note: "IE alias. Pad supports input-enable mode.",
};
const FN_INPUT_DISABLE: DevkitFunction = {
  name: "input_disable", direction: "sink", signal_class: "digital_pad",
  note: "Pad supports input-disable mode.",
};
const FN_ID_ALIAS: DevkitFunction = {
  name: "ID", direction: "sink", signal_class: "digital_pad",
  note: "ID alias. Pad supports input-disable mode.",
};
const FN_WEAK_PULLUP: DevkitFunction = {
  name: "weak_pullup", direction: "bidirectional", signal_class: "digital_pad",
  note: "Pad has an internal weak pull-up.",
};
const FN_WPU_ALIAS: DevkitFunction = {
  name: "WPU", direction: "bidirectional", signal_class: "digital_pad",
  note: "WPU alias. Pad has an internal weak pull-up.",
};
const FN_WEAK_PULLDOWN: DevkitFunction = {
  name: "Weak Pull-Down Capability", direction: "bidirectional", signal_class: "digital_pad",
  note: "Pad has an internal weak pull-down.",
};
const FN_OPEN_DRAIN: DevkitFunction = {
  name: "Open Drain Capability", direction: "source", signal_class: "digital_pad",
  note: "Pad supports open-drain output mode.",
};
const FN_SPI_FLASH: DevkitFunction = {
  name: "spi_flash", direction: "bidirectional",
  note: "Reserved on this board for on-module SPI flash.",
};

function fnGpioIo(gpio: number): DevkitFunction {
  return {
    name: "GPIO Input / Output", direction: "bidirectional", signal_class: "digital",
    note: `GPIO${gpio} digital I/O pad.`,
  };
}

function fnGpioInputOnly(gpio: number): DevkitFunction {
  return {
    name: "GPIO Input Only", direction: "sink", signal_class: "digital",
    note: `GPIO${gpio} input-only digital pad.`,
  };
}

function fnAdc(converter: 1 | 2, channel: number): DevkitFunction {
  return {
    name: `ADC${converter}`, direction: "sink", signal_class: "analog",
    note: `ADC${converter}_CH${channel} ADC input.`,
  };
}

function fnRtcGpio(rtc: number, gpio: number, inputOnly: boolean): DevkitFunction {
  return {
    name: "RTC GPIO", direction: inputOnly ? "sink" : "bidirectional", signal_class: "rtc",
    note: `RTC GPIO${rtc} function on GPIO${gpio}.`,
  };
}

/** The JSON lists each touch channel twice: lowercase + uppercase alias. */
function fnTouch(n: number): DevkitFunction[] {
  return [
    { name: `touch${n}`, direction: "sink", signal_class: "capacitive_touch", note: `Touch sensor channel ${n}.` },
    { name: `TOUCH${n}`, direction: "sink", signal_class: "capacitive_touch", note: `TOUCH${n} alias. Touch sensor channel ${n}.` },
  ];
}

// ---------------------------------------------------------------------------
// Header GPIO pin builder
// ---------------------------------------------------------------------------

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

interface DevkitGpioSpec {
  /** ProtoPart resource id (kept as the interface id). */
  id: string;
  /** Silkscreen / ProtoPart display name. */
  name: string;
  /** Header designator, e.g. "J2-13" — the board's pin, in header order. */
  pin: string;
  /** ESP32 GPIO number behind this header pin. */
  gpio: number;
  /** GPIO34-39 group: no output driver (ProtoPart "GPIO Input Only"). */
  inputOnly?: boolean;
  /** Wired to the on-module SPI flash — not general I/O (warning #2). */
  flashReserved?: boolean;
  adc?: { converter: 1 | 2; channel: number };
  dac?: 1 | 2;
  touch?: number;
  rtcGpio?: number;
  /** Internal weak pull the ProtoPart functions declare for this pad. */
  pull?: "up" | "down";
  /** Pin-builder capability flags for bus signals this pad carries. */
  flags?: {
    i2cSda?: boolean; i2cScl?: boolean;
    spiMosi?: boolean; spiMiso?: boolean; spiSck?: boolean; spiSs?: boolean;
    uartRx?: boolean; uartTx?: boolean;
  };
  /** Extra canonical capability tags (jtag_*, spi_flash_*, straps, ...). */
  extraCaps?: string[];
  /** Verbatim ProtoPart resource functions. */
  functions: DevkitFunction[];
  /** Verbatim ProtoPart resource description. */
  description: string;
  extraTraits?: TraitDef[];
  bridgesTo?: string[];
}

/** Build one schematic-honest header GPIO pin from its ProtoPart resource. */
function devkitGpio(spec: DevkitGpioSpec): InterfaceDef {
  const base = Pin({
    id: spec.id,
    name: spec.name,
    pin: spec.pin,
    voltageV: IO_3V3_RANGE, // io_3v3 power domain (ProtoPart power_domain_id)
    capabilities: {
      inputOnly: spec.inputOnly,
      analogIn: spec.adc !== undefined,
      analogOut: spec.dac !== undefined,
      touch: spec.touch !== undefined,
      ...(spec.flags ?? {}),
    },
  });

  const capabilities = unique([
    ...(base.capabilities ?? []),
    `gpio${spec.gpio}`,
    // GPIO pool tags: input-only pins and flash-reserved pins are excluded
    // from the general "GPIO Input / Output" pool, exactly as the ProtoPart
    // functions are laid out.
    ...(spec.inputOnly ? ["gpio_input_only"] : []),
    ...(!spec.inputOnly && !spec.flashReserved ? ["gpio_io"] : []),
    ...(spec.adc ? [`adc${spec.adc.converter}_in`] : []),
    ...(spec.rtcGpio !== undefined ? ["rtc_gpio"] : []),
    // Every GPIO pad in the ProtoPart source carries "Open Drain Capability"
    // and an input-enable (IE) or input-disable (ID) function.
    "open_drain",
    "pad_input_gate",
    ...(spec.pull === "up" ? ["weak_pullup"] : []),
    ...(spec.pull === "down" ? ["weak_pulldown"] : []),
    ...(spec.extraCaps ?? []),
  ]);

  const traits: TraitDef[] = [
    {
      type: "devkitc_pin_functions",
      params: {
        source: FUNCTIONS_SOURCE,
        description: spec.description,
        gpio: spec.gpio,
        functions: spec.functions,
      },
    },
    { type: "power_domain", params: { domain: "io_3v3" } },
    ...(spec.pull === "up"
      ? [{ type: "internal_pulls", params: { pull_up: true, note: "Pad has an internal weak pull-up (ProtoPart weak_pullup/WPU function)." } }]
      : []),
    ...(spec.pull === "down"
      ? [{ type: "internal_pulls", params: { pull_down: true, note: "Pad has an internal weak pull-down (ProtoPart Weak Pull-Down Capability function)." } }]
      : []),
    ...(spec.flashReserved
      ? [
          {
            type: "usage_restriction",
            params: {
              restriction:
                "Wired to the on-module SPI flash on the ESP32-WROOM-32E and should not be used as general I/O.",
              source:
                "ProtoPart warning: 'GPIOs 6-11 (header pins D0, D1, D2, D3, CMD, CLK) are wired to the on-package SPI flash and MUST NOT be used as general I/O on the WROOM-32E variant.'",
            },
          },
        ]
      : []),
    ...(spec.extraTraits ?? []),
  ];

  return {
    ...base,
    capabilities,
    traits,
    ...(spec.bridgesTo ? { bridgesTo: spec.bridgesTo } : {}),
  };
}

// ---------------------------------------------------------------------------
// J2 header (19 pins) — ProtoPart resources in header order J2-1..J2-19
// ---------------------------------------------------------------------------

/** J2-1 — 3v3: bidirectional 3.3 V rail pin (LDO output or regulated input). */
const pin3v3: InterfaceDef = {
  id: "3v3",
  name: "3v3",
  pin: "J2-1",
  domain: "electrical",
  exposed: true,
  default_active: true,
  // ProtoPart functions: power_input (sink) + power_output (source) — the
  // pin is honestly bidirectional, not a plain PowerIn.
  protocols: [{ type: "power", roles: ["input", "output"] }],
  capabilities: ["power_3v3"],
  parameters: [
    { id: "voltage", unit: "V", value: 3.3, range: IO_3V3_RANGE },
    { id: "max_current", unit: "A", value: IO_3V3_MAX_MA / 1000 },
  ],
  traits: [
    {
      type: "devkitc_pin_functions",
      params: {
        source: FUNCTIONS_SOURCE,
        description:
          "3.3V header pin (J2 pin 1). Output of the on-board LDO when powered from USB/5V; can also be used as a regulated 3.3V input to bypass the LDO.",
        functions: [
          { name: "power_input", direction: "sink", note: "Power input on this header pin." },
          { name: "power_output", direction: "source", note: "Power output on this header pin." },
          { name: "power_3v3", direction: "bidirectional", signal_class: "power", note: "3.3 V board rail on J2 pin 1." },
          { name: "3V3", direction: "bidirectional", signal_class: "power", note: "3V3 alias. 3.3 V board rail on J2 pin 1." },
        ] satisfies DevkitFunction[],
      },
    },
    { type: "power_domain", params: { domain: "io_3v3" } },
    {
      type: "internal_regulator",
      params: {
        description:
          "On-board AMS1117-3.3 LDO output. Supplies the ESP32-WROOM-32E module and the 3V3 header pin.",
        source: "ProtoPart power domain io_3v3",
      },
    },
  ],
};

/** J2-2 — EN: CHIP_PU / active-low reset, tied to the EN push-button. */
const pinEn: InterfaceDef = {
  id: "en",
  name: "EN",
  pin: "J2-2",
  domain: "electrical",
  exposed: true,
  default_active: true,
  protocols: [{ type: "digital", roles: ["input"] }],
  capabilities: ["chip_pu", "reset_input"],
  parameters: [{ id: "voltage", unit: "V", range: IO_3V3_RANGE }],
  traits: [
    {
      type: "devkitc_pin_functions",
      params: {
        source: FUNCTIONS_SOURCE,
        description:
          "CHIP_PU / EN active-low reset. Pull low to reset the ESP32. Also tied to the on-board EN push-button.",
        functions: [
          { name: "reset", direction: "sink", note: "Active-low ESP32 reset input." },
          { name: "enable", direction: "sink", signal_class: "control", note: "ESP32 enable/reset input." },
          { name: "chip_pu", direction: "sink", signal_class: "control", note: "CHIP_PU input: high enables the chip; low powers it down." },
          { name: "EN", direction: "sink", signal_class: "control", note: "EN alias. ESP32 enable/reset input." },
          { name: "PU", direction: "sink", signal_class: "control", note: "PU alias. CHIP_PU input: high enables the chip; low powers it down." },
        ] satisfies DevkitFunction[],
      },
    },
    { type: "power_domain", params: { domain: "io_3v3" } },
    {
      type: "push_button",
      params: { button: "EN", behavior: "Pressing the on-board EN button pulls this line low and resets the ESP32." },
    },
  ],
};

/** J2-14 GND, J3-1 GND, J3-7 GND: one shared board ground net. */
function devkitGnd(id: string, name: string, pin: string): InterfaceDef {
  return {
    ...Ground({ id, name, pin }),
    traits: [
      {
        type: "devkitc_pin_functions",
        params: {
          source: FUNCTIONS_SOURCE,
          functions: [
            { name: "ground", direction: "bidirectional", note: "Board ground reference." },
            { name: "GND", direction: "bidirectional", signal_class: "power", note: "GND alias. Board ground reference." },
          ] satisfies DevkitFunction[],
        },
      },
      { type: "power_domain", params: { domain: "gnd" } },
      {
        type: "net_shareable",
        params: {
          net: "gnd",
          policy: "single_ground_instance_may_serve_all_members",
          members: ["gnd", "gnd_j3_1", "gnd_j3_7"],
        },
      },
    ],
  };
}

/** J2-19 — 5V: bidirectional 5 V rail pin (board power input or VBUS out). */
const pin5v: InterfaceDef = {
  id: "5v",
  name: "5V",
  pin: "J2-19",
  domain: "electrical",
  exposed: true,
  default_active: true,
  protocols: [{ type: "power", roles: ["input", "output"] }],
  capabilities: ["power_5v0"],
  parameters: [
    { id: "voltage", unit: "V", value: 5, range: USB_5V_RANGE },
    { id: "max_current", unit: "A", value: USB_5V_MAX_MA / 1000 },
  ],
  traits: [
    {
      type: "devkitc_pin_functions",
      params: {
        source: FUNCTIONS_SOURCE,
        description:
          "5V header pin (J2 pin 19). Can be used as a 5V input (board power) OR as a 5V output when powered via Micro-USB.",
        functions: [
          { name: "power_input", direction: "sink", note: "Power input on this header pin." },
          { name: "power_output", direction: "source", note: "Power output on this header pin." },
          { name: "power_5v0", direction: "bidirectional", signal_class: "power", note: "5 V board rail on J2 pin 19." },
          { name: "5V0", direction: "bidirectional", signal_class: "power", note: "5V0 alias. 5 V board rail on J2 pin 19." },
        ] satisfies DevkitFunction[],
      },
    },
    { type: "power_domain", params: { domain: "usb_5v" } },
  ],
};

const j2Gpio: InterfaceDef[] = [
  devkitGpio({
    id: "vp", name: "VP", pin: "J2-3", gpio: 36, inputOnly: true,
    adc: { converter: 1, channel: 0 }, rtcGpio: 0,
    extraCaps: ["sensor_vp"],
    description: "GPIO36 (VP / S_VP / SENSOR_VP). Input-only RTC GPIO; ADC1 channel 0.",
    functions: [
      FN_INPUT_DISABLE,
      { name: "sensor_vp", direction: "sink", signal_class: "analog", note: "SENSOR_VP analog input on GPIO36." },
      { name: "S_VP", direction: "sink", signal_class: "analog", note: "S_VP alias. SENSOR_VP analog input on GPIO36." },
      FN_ID_ALIAS,
      fnGpioInputOnly(36),
      fnAdc(1, 0),
      fnRtcGpio(0, 36, true),
      FN_OPEN_DRAIN,
    ],
  }),
  devkitGpio({
    id: "vn", name: "VN", pin: "J2-4", gpio: 39, inputOnly: true,
    adc: { converter: 1, channel: 3 }, rtcGpio: 3,
    extraCaps: ["sensor_vn"],
    description: "GPIO39 (VN / S_VN / SENSOR_VN). Input-only RTC GPIO; ADC1 channel 3.",
    functions: [
      FN_INPUT_DISABLE,
      { name: "sensor_vn", direction: "sink", signal_class: "analog", note: "SENSOR_VN analog input on GPIO39." },
      { name: "S_VN", direction: "sink", signal_class: "analog", note: "S_VN alias. SENSOR_VN analog input on GPIO39." },
      FN_ID_ALIAS,
      fnGpioInputOnly(39),
      fnAdc(1, 3),
      fnRtcGpio(3, 39, true),
      FN_OPEN_DRAIN,
    ],
  }),
  devkitGpio({
    id: "pin_34", name: "Pin 34", pin: "J2-5", gpio: 34, inputOnly: true,
    adc: { converter: 1, channel: 6 }, rtcGpio: 4,
    extraCaps: ["vdet"],
    description: "GPIO34 (VDET_1). Input-only RTC GPIO; ADC1 channel 6.",
    functions: [
      FN_INPUT_DISABLE,
      FN_ID_ALIAS,
      fnGpioInputOnly(34),
      fnAdc(1, 6),
      { name: "Voltage Detection", direction: "sink", signal_class: "analog", note: "VDET_1 analog input on GPIO34." },
      fnRtcGpio(4, 34, true),
      FN_OPEN_DRAIN,
    ],
  }),
  devkitGpio({
    id: "pin_35", name: "Pin 35", pin: "J2-6", gpio: 35, inputOnly: true,
    adc: { converter: 1, channel: 7 }, rtcGpio: 5,
    extraCaps: ["vdet"],
    description: "GPIO35 (VDET_2). Input-only RTC GPIO; ADC1 channel 7.",
    functions: [
      FN_INPUT_DISABLE,
      FN_ID_ALIAS,
      fnGpioInputOnly(35),
      fnAdc(1, 7),
      { name: "Voltage Detection", direction: "sink", signal_class: "analog", note: "VDET_2 analog input on GPIO35." },
      fnRtcGpio(5, 35, true),
      FN_OPEN_DRAIN,
    ],
  }),
  devkitGpio({
    id: "pin_32", name: "Pin 32", pin: "J2-7", gpio: 32,
    adc: { converter: 1, channel: 4 }, touch: 9, rtcGpio: 9,
    extraCaps: ["xtal_32k_p"],
    description: "GPIO32. ADC1_CH4, TOUCH9, XTAL_32K_P (32 kHz crystal input).",
    functions: [
      FN_INPUT_DISABLE,
      { name: "xtal_32k_p", direction: "sink", signal_class: "clock", note: "32.768 kHz crystal oscillator input on GPIO32." },
      ...fnTouch(9),
      { name: "32K_XP", direction: "sink", signal_class: "clock", note: "32K_XP alias. 32.768 kHz crystal oscillator input on GPIO32." },
      FN_ID_ALIAS,
      fnGpioIo(32),
      fnAdc(1, 4),
      fnRtcGpio(9, 32, false),
      FN_OPEN_DRAIN,
    ],
  }),
  devkitGpio({
    id: "pin_33", name: "Pin 33", pin: "J2-8", gpio: 33,
    adc: { converter: 1, channel: 5 }, touch: 8, rtcGpio: 8,
    extraCaps: ["xtal_32k_n"],
    description: "GPIO33. ADC1_CH5, TOUCH8, XTAL_32K_N.",
    functions: [
      FN_INPUT_DISABLE,
      { name: "xtal_32k_n", direction: "source", signal_class: "clock", note: "32.768 kHz crystal oscillator output on GPIO33." },
      ...fnTouch(8),
      { name: "32K_XN", direction: "source", signal_class: "clock", note: "32K_XN alias. 32.768 kHz crystal oscillator output on GPIO33." },
      FN_ID_ALIAS,
      fnGpioIo(33),
      fnAdc(1, 5),
      fnRtcGpio(8, 33, false),
      FN_OPEN_DRAIN,
    ],
  }),
  devkitGpio({
    id: "pin_25", name: "Pin 25", pin: "J2-9", gpio: 25,
    adc: { converter: 2, channel: 8 }, dac: 1, rtcGpio: 6,
    description: "GPIO25. ADC2_CH8 and DAC1.",
    functions: [
      FN_INPUT_DISABLE,
      FN_ID_ALIAS,
      fnGpioIo(25),
      fnAdc(2, 8),
      { name: "DAC", direction: "source", signal_class: "analog", note: "DAC_1 output on GPIO25." },
      fnRtcGpio(6, 25, false),
      FN_OPEN_DRAIN,
    ],
  }),
  devkitGpio({
    id: "pin_26", name: "Pin 26", pin: "J2-10", gpio: 26,
    adc: { converter: 2, channel: 9 }, dac: 2, rtcGpio: 7,
    description: "GPIO26. ADC2_CH9 and DAC2.",
    functions: [
      FN_INPUT_DISABLE,
      FN_ID_ALIAS,
      fnGpioIo(26),
      fnAdc(2, 9),
      { name: "DAC", direction: "source", signal_class: "analog", note: "DAC_2 output on GPIO26." },
      fnRtcGpio(7, 26, false),
      FN_OPEN_DRAIN,
    ],
  }),
  devkitGpio({
    id: "pin_27", name: "Pin 27", pin: "J2-11", gpio: 27,
    adc: { converter: 2, channel: 7 }, touch: 7, rtcGpio: 17,
    description: "GPIO27. ADC2_CH7, TOUCH7.",
    functions: [
      FN_INPUT_DISABLE,
      ...fnTouch(7),
      FN_ID_ALIAS,
      fnGpioIo(27),
      fnAdc(2, 7),
      fnRtcGpio(17, 27, false),
      FN_OPEN_DRAIN,
    ],
  }),
  devkitGpio({
    id: "pin_14", name: "Pin 14", pin: "J2-12", gpio: 14,
    adc: { converter: 2, channel: 6 }, touch: 6, rtcGpio: 16, pull: "up",
    flags: { spiSck: true },
    extraCaps: ["jtag_tms"],
    description: "GPIO14. ADC2_CH6, TOUCH6, MTMS (JTAG TMS), HSPI_CLK.",
    functions: [
      { name: "spi_sck", direction: "source", note: "SPI clock signal on GPIO14." },
      FN_INPUT_ENABLE,
      FN_WEAK_PULLUP,
      { name: "hspi_sck", direction: "source", signal_class: "digital", note: "HSPI clock output on GPIO14." },
      { name: "jtag_tms", direction: "sink", signal_class: "digital", note: "JTAG MTMS / TMS on GPIO14." },
      ...fnTouch(6),
      { name: "HSPI_SCK", direction: "source", signal_class: "digital", note: "HSPI_SCK alias. HSPI clock output on GPIO14." },
      { name: "MTMS", direction: "sink", signal_class: "digital", note: "MTMS alias. JTAG MTMS / TMS on GPIO14." },
      FN_IE_ALIAS,
      FN_WPU_ALIAS,
      fnGpioIo(14),
      fnAdc(2, 6),
      fnRtcGpio(16, 14, false),
      FN_OPEN_DRAIN,
    ],
  }),
  devkitGpio({
    id: "pin_12", name: "Pin 12", pin: "J2-13", gpio: 12,
    adc: { converter: 2, channel: 5 }, touch: 5, rtcGpio: 15, pull: "up",
    flags: { spiMiso: true },
    extraCaps: ["jtag_tdi", "strap_vdd_flash"],
    description: "GPIO12. ADC2_CH5, TOUCH5, MTDI (JTAG TDI), HSPI_Q. Strapping pin (controls flash voltage at boot).",
    extraTraits: [
      {
        type: "boot_strapping",
        params: {
          controls: "MTDI strap selects VDD_SDIO flash voltage at reset.",
          // Audit note: per the ESP32 datasheet strapping-pin table, MTDI's
          // default strap configuration is PULL-DOWN (VDD_SDIO = 3.3 V). The
          // weak_pullup/WPU function on this pad is a programmable pad
          // capability, not the boot default.
          default_configuration: "Pull-down (bit value 0 → VDD_SDIO = 3.3 V) per the ESP32 series datasheet strapping-pins table.",
          source:
            "ProtoPart pin_12 vdd_flash_strap function; board warning: strapping pins pulled to conflicting levels during reset can prevent boot or change flash voltage.",
        },
      },
    ],
    functions: [
      { name: "spi_miso", direction: "sink", note: "SPI MISO signal on GPIO12." },
      FN_INPUT_ENABLE,
      FN_WEAK_PULLUP,
      { name: "vdd_flash_strap", direction: "sink", signal_class: "strapping", note: "MTDI strap selects VDD_SDIO flash voltage at reset." },
      { name: "hspi_miso", direction: "sink", signal_class: "digital", note: "HSPI MISO input on GPIO12." },
      { name: "jtag_tdi", direction: "sink", signal_class: "digital", note: "JTAG MTDI / TDI on GPIO12." },
      ...fnTouch(5),
      { name: "HSPI_MISO", direction: "sink", signal_class: "digital", note: "HSPI_MISO alias. HSPI MISO input on GPIO12." },
      { name: "MTDI", direction: "sink", signal_class: "digital", note: "MTDI alias. JTAG MTDI / TDI on GPIO12." },
      { name: "VDD_FLASH", direction: "sink", signal_class: "strapping", note: "VDD_FLASH alias. MTDI strap selects VDD_SDIO flash voltage at reset." },
      FN_IE_ALIAS,
      FN_WPU_ALIAS,
      fnGpioIo(12),
      fnAdc(2, 5),
      fnRtcGpio(15, 12, false),
      FN_OPEN_DRAIN,
    ],
  }),
  devkitGpio({
    id: "pin_13", name: "Pin 13", pin: "J2-15", gpio: 13,
    adc: { converter: 2, channel: 4 }, touch: 4, rtcGpio: 14, pull: "down",
    flags: { spiMosi: true },
    extraCaps: ["jtag_tck"],
    description: "GPIO13. ADC2_CH4, TOUCH4, MTCK (JTAG TCK), HSPI_D.",
    functions: [
      { name: "spi_mosi", direction: "source", note: "SPI MOSI signal on GPIO13." },
      FN_INPUT_ENABLE,
      { name: "hspi_mosi", direction: "source", signal_class: "digital", note: "HSPI MOSI output on GPIO13." },
      { name: "jtag_tck", direction: "sink", signal_class: "digital", note: "JTAG MTCK / TCK on GPIO13." },
      ...fnTouch(4),
      { name: "HSPI_MOSI", direction: "source", signal_class: "digital", note: "HSPI_MOSI alias. HSPI MOSI output on GPIO13." },
      { name: "MTCK", direction: "sink", signal_class: "digital", note: "MTCK alias. JTAG MTCK / TCK on GPIO13." },
      FN_IE_ALIAS,
      fnGpioIo(13),
      fnAdc(2, 4),
      fnRtcGpio(14, 13, false),
      FN_OPEN_DRAIN,
      FN_WEAK_PULLDOWN,
    ],
  }),
];

/** Flash-bus header pins (D0-D3, CMD, CLK): reserved for the module flash. */
function flashPin(config: {
  id: string; name: string; pin: string; gpio: number;
  /** Canonical capability tag, e.g. "spi_flash_d2". */
  cap: string;
  /** Verbatim ProtoPart signal function + its alias entry. */
  signal: DevkitFunction; alias: DevkitFunction;
  /** JSON function order differs between D2/D3/CMD and CLK/D0/D1. */
  signalFirst?: boolean;
  description: string;
}): InterfaceDef {
  return devkitGpio({
    id: config.id, name: config.name, pin: config.pin, gpio: config.gpio,
    flashReserved: true, pull: "up",
    extraCaps: [config.cap],
    description: config.description,
    functions: config.signalFirst
      ? [FN_SPI_FLASH, config.signal, FN_INPUT_ENABLE, FN_WEAK_PULLUP, config.alias, FN_IE_ALIAS, FN_WPU_ALIAS, FN_OPEN_DRAIN]
      : [FN_SPI_FLASH, FN_INPUT_ENABLE, FN_WEAK_PULLUP, config.signal, config.alias, FN_IE_ALIAS, FN_WPU_ALIAS, FN_OPEN_DRAIN],
  });
}

const j2FlashPins: InterfaceDef[] = [
  flashPin({
    id: "d2", name: "D2", pin: "J2-16", gpio: 9, cap: "spi_flash_d2",
    signal: { name: "spi_flash_d2", direction: "bidirectional", signal_class: "digital", note: "SPI flash data 2; reserved on this board." },
    alias: { name: "D2", direction: "bidirectional", signal_class: "digital", note: "D2 alias. SPI flash data 2; reserved on this board." },
    description: "D2 / SD_DATA2 / GPIO9 (J2-16). Wired to on-module SPI flash on the ESP32-WROOM-32E and should not be used as general I/O.",
  }),
  flashPin({
    id: "d3", name: "D3", pin: "J2-17", gpio: 10, cap: "spi_flash_d3",
    signal: { name: "spi_flash_d3", direction: "bidirectional", signal_class: "digital", note: "SPI flash data 3; reserved on this board." },
    alias: { name: "D3", direction: "bidirectional", signal_class: "digital", note: "D3 alias. SPI flash data 3; reserved on this board." },
    description: "D3 / SD_DATA3 / GPIO10 (J2-17). Wired to on-module SPI flash on the ESP32-WROOM-32E and should not be used as general I/O.",
  }),
  flashPin({
    id: "cmd", name: "CMD", pin: "J2-18", gpio: 11, cap: "spi_flash_cmd",
    signal: { name: "spi_flash_cmd", direction: "bidirectional", signal_class: "digital", note: "SPI flash command; reserved on this board." },
    alias: { name: "CMD", direction: "bidirectional", signal_class: "digital", note: "CMD alias. SPI flash command; reserved on this board." },
    description: "CMD / SD_CMD / GPIO11 (J2-18). Wired to on-module SPI flash on the ESP32-WROOM-32E and should not be used as general I/O.",
  }),
];

// ---------------------------------------------------------------------------
// J3 header (19 pins) — ProtoPart resources in header order J3-1..J3-19
// ---------------------------------------------------------------------------

const j3Gpio: InterfaceDef[] = [
  devkitGpio({
    id: "pin_23", name: "Pin 23", pin: "J3-2", gpio: 23,
    flags: { spiMosi: true },
    description: "GPIO23. Default VSPI_MOSI.",
    functions: [
      { name: "spi_mosi", direction: "source", note: "SPI MOSI signal on GPIO23." },
      { name: "vspi_mosi", direction: "source", signal_class: "digital", note: "VSPI MOSI output on GPIO23." },
      { name: "wire_mosi", direction: "source", signal_class: "digital", note: "Arduino SPI MOSI alias on GPIO23." },
      FN_INPUT_ENABLE,
      { name: "VSPI_MOSI", direction: "source", signal_class: "digital", note: "VSPI_MOSI alias. VSPI MOSI output on GPIO23." },
      { name: "WIRE_MOSI", direction: "source", signal_class: "digital", note: "WIRE_MOSI alias. Arduino SPI MOSI alias on GPIO23." },
      FN_IE_ALIAS,
      fnGpioIo(23),
      FN_OPEN_DRAIN,
    ],
  }),
  devkitGpio({
    id: "pin_22", name: "Pin 22", pin: "J3-3", gpio: 22,
    flags: { i2cScl: true },
    description: "GPIO22. Default I2C0_SCL.",
    functions: [
      { name: "i2c_scl", direction: "source", note: "I2C clock signal on GPIO22." },
      { name: "wire_scl", direction: "source", signal_class: "digital", note: "Arduino Wire SCL / I2C clock on GPIO22." },
      FN_INPUT_ENABLE,
      { name: "WIRE_SCL", direction: "source", signal_class: "digital", note: "WIRE_SCL alias. Arduino Wire SCL / I2C clock on GPIO22." },
      FN_IE_ALIAS,
      fnGpioIo(22),
      FN_OPEN_DRAIN,
    ],
  }),
  devkitGpio({
    id: "tx", name: "TX", pin: "J3-4", gpio: 1, pull: "up",
    flags: { uartTx: true },
    description: "GPIO1 / U0TXD. Primary serial transmit; shared with the on-board USB-UART bridge. Strapping behavior: pulled up at boot.",
    bridgesTo: ["micro_usb"],
    extraTraits: [
      {
        type: "shared_with_usb_bridge",
        params: {
          note: "TX (GPIO1) is shared with the on-board USB-to-UART bridge. To use UART0 with an external peer, unplug USB or tri-state the bridge by holding the bridge IC in reset.",
          source: "ProtoPart board warning #7",
        },
      },
      // Audit correction: GPIO1/U0TXD is NOT one of the five ESP32 strapping
      // pins (GPIO0/2/5/12/15 per the ESP32 datasheet strapping-pin table);
      // "pulled up at boot" is its IO_MUX reset default, not a strap.
      {
        type: "reset_default",
        params: {
          note: "Weak pull-up at reset (IO_MUX default for U0TXD). Not a strapping pin — the ESP32 strapping pins are GPIO0/2/5/12/15 only.",
          source: "ESP32 series datasheet: IO_MUX pad list and strapping-pins table.",
        },
      },
    ],
    functions: [
      { name: "uart_tx", direction: "source", note: "UART transmit output on GPIO1." },
      { name: "u0txd", direction: "source", signal_class: "digital", note: "UART0 transmit output on GPIO1." },
      { name: "serial_tx", direction: "source", signal_class: "digital", note: "Primary serial TX alias on GPIO1." },
      FN_INPUT_ENABLE,
      FN_WEAK_PULLUP,
      { name: "U0TXD", direction: "source", signal_class: "digital", note: "U0TXD alias. UART0 transmit output on GPIO1." },
      { name: "SERIAL_TX", direction: "source", signal_class: "digital", note: "SERIAL_TX alias. Primary serial TX alias on GPIO1." },
      { name: "TX", direction: "source", note: "TX alias. UART transmit output on GPIO1." },
      FN_IE_ALIAS,
      FN_WPU_ALIAS,
      fnGpioIo(1),
      FN_OPEN_DRAIN,
    ],
  }),
  devkitGpio({
    id: "rx", name: "RX", pin: "J3-5", gpio: 3, pull: "up",
    flags: { uartRx: true },
    description: "GPIO3 / U0RXD. Primary serial receive; shared with the on-board USB-UART bridge.",
    bridgesTo: ["micro_usb"],
    extraTraits: [
      {
        type: "shared_with_usb_bridge",
        params: {
          note: "RX (GPIO3) is shared with the on-board USB-to-UART bridge. To use UART0 with an external peer, unplug USB or tri-state the bridge by holding the bridge IC in reset.",
          source: "ProtoPart board warning #7",
        },
      },
    ],
    functions: [
      { name: "uart_rx", direction: "sink", note: "UART receive input on GPIO3." },
      { name: "u0rxd", direction: "sink", signal_class: "digital", note: "UART0 receive input on GPIO3." },
      { name: "serial_rx", direction: "sink", signal_class: "digital", note: "Primary serial RX alias on GPIO3." },
      FN_INPUT_ENABLE,
      FN_WEAK_PULLUP,
      { name: "U0RXD", direction: "sink", signal_class: "digital", note: "U0RXD alias. UART0 receive input on GPIO3." },
      { name: "SERIAL_RX", direction: "sink", signal_class: "digital", note: "SERIAL_RX alias. Primary serial RX alias on GPIO3." },
      { name: "RX", direction: "sink", note: "RX alias. UART receive input on GPIO3." },
      FN_IE_ALIAS,
      FN_WPU_ALIAS,
      fnGpioIo(3),
      FN_OPEN_DRAIN,
    ],
  }),
  devkitGpio({
    id: "pin_21", name: "Pin 21", pin: "J3-6", gpio: 21,
    flags: { i2cSda: true },
    description: "GPIO21. Default I2C0_SDA.",
    functions: [
      { name: "i2c_sda", direction: "bidirectional", note: "I2C data signal on GPIO21." },
      { name: "wire_sda", direction: "bidirectional", signal_class: "digital", note: "Arduino Wire SDA / I2C data on GPIO21." },
      FN_INPUT_ENABLE,
      { name: "WIRE_SDA", direction: "bidirectional", signal_class: "digital", note: "WIRE_SDA alias. Arduino Wire SDA / I2C data on GPIO21." },
      FN_IE_ALIAS,
      fnGpioIo(21),
      FN_OPEN_DRAIN,
    ],
  }),
  devkitGpio({
    id: "pin_19", name: "Pin 19", pin: "J3-8", gpio: 19,
    flags: { spiMiso: true },
    description: "GPIO19. Default VSPI_MISO.",
    functions: [
      { name: "spi_miso", direction: "sink", note: "SPI MISO signal on GPIO19." },
      { name: "vspi_miso", direction: "sink", signal_class: "digital", note: "VSPI MISO input on GPIO19." },
      FN_INPUT_ENABLE,
      { name: "VSPI_MISO", direction: "sink", signal_class: "digital", note: "VSPI_MISO alias. VSPI MISO input on GPIO19." },
      FN_IE_ALIAS,
      fnGpioIo(19),
      FN_OPEN_DRAIN,
    ],
  }),
  devkitGpio({
    id: "pin_18", name: "Pin 18", pin: "J3-9", gpio: 18,
    flags: { spiSck: true },
    description: "GPIO18. Default VSPI_SCK.",
    functions: [
      { name: "spi_sck", direction: "source", note: "SPI clock signal on GPIO18." },
      { name: "vspi_sck", direction: "source", signal_class: "digital", note: "VSPI clock output on GPIO18." },
      FN_INPUT_ENABLE,
      { name: "VSPI_SCK", direction: "source", signal_class: "digital", note: "VSPI_SCK alias. VSPI clock output on GPIO18." },
      FN_IE_ALIAS,
      fnGpioIo(18),
      FN_OPEN_DRAIN,
    ],
  }),
  devkitGpio({
    id: "pin_5", name: "Pin 5", pin: "J3-10", gpio: 5, pull: "up",
    flags: { spiSs: true },
    extraCaps: ["sdio"],
    description: "GPIO5. Default VSPI_CS0. Strapping pin (pulled up at boot).",
    extraTraits: [
      {
        type: "boot_strapping",
        params: {
          controls: "GPIO5 SDIO timing strap; pulled up at boot.",
          source: "ProtoPart pin_5 sdio function and description; board warning: strapping pins pulled to conflicting levels during reset can prevent boot or change flash voltage.",
        },
      },
    ],
    functions: [
      { name: "spi_cs", direction: "source", note: "SPI chip-select signal on GPIO5." },
      { name: "vspi_ss", direction: "source", signal_class: "digital", note: "VSPI chip-select output on GPIO5." },
      { name: "sdio", direction: "bidirectional", signal_class: "digital", note: "GPIO5 SDIO timing strap / SDIO alternate function." },
      FN_INPUT_ENABLE,
      FN_WEAK_PULLUP,
      { name: "VSPI_SS", direction: "source", signal_class: "digital", note: "VSPI_SS alias. VSPI chip-select output on GPIO5." },
      { name: "SDIO", direction: "bidirectional", signal_class: "digital", note: "SDIO alias. GPIO5 SDIO timing strap / SDIO alternate function." },
      FN_IE_ALIAS,
      FN_WPU_ALIAS,
      fnGpioIo(5),
      FN_OPEN_DRAIN,
    ],
  }),
  devkitGpio({
    id: "pin_17", name: "Pin 17", pin: "J3-11", gpio: 17,
    flags: { uartTx: true },
    // Audit correction: 28 is the WROOM-32E MODULE pin number (datasheet pin
    // definitions: IO17 = module pin 28); the ESP32 chip pin for GPIO17 is 27.
    description: "GPIO17 / U2TXD (module pin 28). Fully usable on the default ESP32-WROOM-32E module. NOTE: on WROVER-E / WROVER-IE and on -R2 sub-variants of WROOM-32E (ESP32-D0WDR2-V3 die with embedded 2 MB PSRAM), GPIO17 is consumed by the in-package PSRAM and cannot be used as general I/O.",
    extraTraits: [
      {
        type: "variant_restriction",
        params: {
          note: "Not usable on WROVER-E / WROVER-IE variants or on -R2 (ESP32-D0WDR2-V3) sub-variants of WROOM-32E, where the in-package PSRAM consumes this pin.",
          source: "ProtoPart board warning #3",
        },
      },
    ],
    functions: [
      { name: "uart_tx", direction: "source", note: "UART transmit output on GPIO17." },
      FN_INPUT_ENABLE,
      FN_IE_ALIAS,
      fnGpioIo(17),
      FN_OPEN_DRAIN,
    ],
  }),
  devkitGpio({
    id: "pin_16", name: "Pin 16", pin: "J3-12", gpio: 16,
    flags: { uartRx: true },
    // Audit correction: 27 is the WROOM-32E MODULE pin number (datasheet pin
    // definitions: IO16 = module pin 27); the ESP32 chip pin for GPIO16 is 25.
    description: "GPIO16 / U2RXD (module pin 27). Fully usable on the default ESP32-WROOM-32E module. NOTE: on WROVER-E / WROVER-IE and on -R2 sub-variants of WROOM-32E (ESP32-D0WDR2-V3 die with embedded 2 MB PSRAM), GPIO16 is consumed by the in-package PSRAM and cannot be used as general I/O.",
    extraTraits: [
      {
        type: "variant_restriction",
        params: {
          note: "Not usable on WROVER-E / WROVER-IE variants or on -R2 (ESP32-D0WDR2-V3) sub-variants of WROOM-32E, where the in-package PSRAM consumes this pin.",
          source: "ProtoPart board warning #3",
        },
      },
    ],
    functions: [
      { name: "uart_rx", direction: "sink", note: "UART receive input on GPIO16." },
      FN_INPUT_ENABLE,
      FN_IE_ALIAS,
      fnGpioIo(16),
      FN_OPEN_DRAIN,
    ],
  }),
  devkitGpio({
    id: "pin_4", name: "Pin 4", pin: "J3-13", gpio: 4,
    adc: { converter: 2, channel: 0 }, touch: 0, rtcGpio: 10, pull: "down",
    description: "GPIO4. ADC2_CH0, TOUCH0.",
    functions: [
      ...fnTouch(0),
      FN_INPUT_ENABLE,
      FN_IE_ALIAS,
      fnGpioIo(4),
      fnAdc(2, 0),
      fnRtcGpio(10, 4, false),
      FN_OPEN_DRAIN,
      FN_WEAK_PULLDOWN,
    ],
  }),
  devkitGpio({
    id: "pin_0", name: "Pin 0", pin: "J3-14", gpio: 0,
    adc: { converter: 2, channel: 1 }, touch: 1, rtcGpio: 11, pull: "up",
    extraCaps: ["strap_boot"],
    description: "GPIO0. ADC2_CH1, TOUCH1. BOOT strapping pin - hold LOW at reset to enter firmware download mode (used by the on-board BOOT push-button).",
    extraTraits: [
      {
        type: "boot_strapping",
        params: {
          controls: "GPIO0 boot strap; low at reset enters download mode.",
          source: "ProtoPart pin_0 boot function; used by the on-board BOOT push-button.",
        },
      },
      {
        type: "push_button",
        params: { button: "BOOT", behavior: "Pressing the on-board BOOT button pulls GPIO0 low; hold at reset to enter firmware download mode." },
      },
      {
        type: "hardware_errata",
        params: {
          note: "Earlier ESP32-DevKitC V4 boards may have a 0402 cap (C15) near GPIO0 that causes spurious boot-into-download or distorts a clock signal output on GPIO0. Remove C15 if you hit either issue.",
          source: "ProtoPart board warning #6",
        },
      },
    ],
    functions: [
      ...fnTouch(1),
      { name: "boot", direction: "sink", signal_class: "strapping", note: "GPIO0 boot strap; low at reset enters download mode." },
      FN_INPUT_ENABLE,
      FN_WEAK_PULLUP,
      { name: "BOOT", direction: "sink", signal_class: "strapping", note: "BOOT alias. GPIO0 boot strap; low at reset enters download mode." },
      FN_IE_ALIAS,
      FN_WPU_ALIAS,
      fnGpioIo(0),
      fnAdc(2, 1),
      fnRtcGpio(11, 0, false),
      FN_OPEN_DRAIN,
    ],
  }),
  devkitGpio({
    id: "pin_2", name: "Pin 2", pin: "J3-15", gpio: 2,
    adc: { converter: 2, channel: 2 }, touch: 2, rtcGpio: 12, pull: "down",
    description: "GPIO2. ADC2_CH2, TOUCH2. Strapping pin (must be low or floating at boot).",
    extraTraits: [
      {
        type: "boot_strapping",
        params: {
          // Audit correction: the low/floating requirement applies only to
          // entering the serial bootloader (GPIO0 low); GPIO2 is don't-care
          // for normal SPI flash boot (ESP32 datasheet boot-mode strapping).
          controls: "Boot-mode strap together with GPIO0: to enter the serial bootloader (GPIO0 low at reset), GPIO2 must also be low or floating; it is don't-care for normal SPI flash boot.",
          source: "ProtoPart pin_2 description; board warning #4; ESP32 series datasheet strapping-pins boot-mode table.",
        },
      },
    ],
    functions: [
      ...fnTouch(2),
      FN_INPUT_ENABLE,
      FN_IE_ALIAS,
      fnGpioIo(2),
      fnAdc(2, 2),
      fnRtcGpio(12, 2, false),
      FN_OPEN_DRAIN,
      FN_WEAK_PULLDOWN,
    ],
  }),
  devkitGpio({
    id: "pin_15", name: "Pin 15", pin: "J3-16", gpio: 15,
    adc: { converter: 2, channel: 3 }, touch: 3, rtcGpio: 13, pull: "up",
    flags: { spiSs: true },
    extraCaps: ["jtag_tdo", "strap_boot_log"],
    description: "GPIO15. ADC2_CH3, TOUCH3, MTDO (JTAG TDO). Strapping pin (controls boot-mode messages).",
    extraTraits: [
      {
        type: "boot_strapping",
        params: {
          controls: "MTDO strap controls U0TXD boot log output.",
          source: "ProtoPart pin_15 boot_log function; board warning #4.",
        },
      },
    ],
    functions: [
      { name: "touch3", direction: "sink", signal_class: "capacitive_touch", note: "Touch sensor channel 3." },
      { name: "jtag_tdo", direction: "source", signal_class: "digital", note: "JTAG MTDO / TDO on GPIO15." },
      { name: "hspi_ss", direction: "source", signal_class: "digital", note: "HSPI chip-select output on GPIO15." },
      { name: "boot_log", direction: "source", signal_class: "strapping", note: "MTDO strap controls U0TXD boot log output." },
      FN_INPUT_ENABLE,
      FN_WEAK_PULLUP,
      { name: "TOUCH3", direction: "sink", signal_class: "capacitive_touch", note: "TOUCH3 alias. Touch sensor channel 3." },
      { name: "HSPI_SS", direction: "source", signal_class: "digital", note: "HSPI_SS alias. HSPI chip-select output on GPIO15." },
      { name: "MTDO", direction: "source", signal_class: "digital", note: "MTDO alias. JTAG MTDO / TDO on GPIO15." },
      { name: "LOG", direction: "source", signal_class: "strapping", note: "LOG alias. MTDO strap controls U0TXD boot log output." },
      FN_IE_ALIAS,
      FN_WPU_ALIAS,
      fnGpioIo(15),
      fnAdc(2, 3),
      fnRtcGpio(13, 15, false),
      FN_OPEN_DRAIN,
    ],
  }),
];

const j3FlashPins: InterfaceDef[] = [
  flashPin({
    id: "d1", name: "D1", pin: "J3-17", gpio: 8, cap: "spi_flash_d1", signalFirst: true,
    signal: { name: "spi_flash_d1", direction: "bidirectional", signal_class: "digital", note: "SPI flash data 1; reserved on this board." },
    alias: { name: "D1", direction: "bidirectional", signal_class: "digital", note: "D1 alias. SPI flash data 1; reserved on this board." },
    description: "D1 / SD_DATA1 / GPIO8 (J3-17). Wired to on-module SPI flash on the ESP32-WROOM-32E and should not be used as general I/O.",
  }),
  flashPin({
    id: "d0", name: "D0", pin: "J3-18", gpio: 7, cap: "spi_flash_d0", signalFirst: true,
    signal: { name: "spi_flash_d0", direction: "bidirectional", signal_class: "digital", note: "SPI flash data 0; reserved on this board." },
    alias: { name: "D0", direction: "bidirectional", signal_class: "digital", note: "D0 alias. SPI flash data 0; reserved on this board." },
    description: "D0 / SD_DATA0 / GPIO7 (J3-18). Wired to on-module SPI flash on the ESP32-WROOM-32E and should not be used as general I/O.",
  }),
  flashPin({
    id: "clk", name: "CLK", pin: "J3-19", gpio: 6, cap: "spi_flash_sck", signalFirst: true,
    signal: { name: "spi_flash_sck", direction: "source", signal_class: "digital", note: "SPI flash clock; reserved on this board." },
    alias: { name: "CLK", direction: "source", signal_class: "digital", note: "CLK alias. SPI flash clock; reserved on this board." },
    description: "CLK / SD_CLK / GPIO6 (J3-19). Wired to on-module SPI flash on the ESP32-WROOM-32E and should not be used as general I/O.",
  }),
];

// ---------------------------------------------------------------------------
// Micro-USB connector
// ---------------------------------------------------------------------------

const microUsb: InterfaceDef = {
  id: "micro_usb",
  name: "Micro-USB",
  domain: "electrical",
  exposed: true,
  default_active: true,
  // The connector both powers the board (VBUS -> usb_5v rail) and carries
  // USB 2.0 FS data into the CP2102N USB-to-UART bridge.
  protocols: [
    { type: "usb", roles: ["device"] },
    { type: "power", roles: ["input"] },
  ],
  capabilities: ["micro_usb"],
  parameters: [{ id: "voltage", unit: "V", value: 5, range: USB_5V_RANGE }],
  traits: [
    {
      type: "devkitc_pin_functions",
      params: {
        source: FUNCTIONS_SOURCE,
        description:
          "Micro-USB-B receptacle. Carries VBUS (5V) and USB 2.0 Full-Speed D+/D- routed through the on-board USB-to-UART bridge (CP2102N) to U0TXD/U0RXD on the ESP32.",
        functions: [
          { name: "micro_usb", direction: "bidirectional", note: "Micro-USB power and USB-UART connector." },
        ] satisfies DevkitFunction[],
      },
    },
    { type: "power_domain", params: { domain: "usb_5v" } },
    {
      type: "usb_uart_bridge",
      params: {
        part: "CP2102N",
        connects: "USB 2.0 Full-Speed D+/D- to U0TXD/U0RXD (header pins TX/RX, GPIO1/GPIO3)",
        purpose: "Power and programming (firmware flashing / serial console).",
      },
    },
    { type: "connector", params: { connector_type: "micro_usb" } },
  ],
  bridgesTo: ["tx", "rx"],
};

/**
 * All 38 header pins in header order (J2-1..19, J3-1..19) + Micro-USB.
 *
 * Audit: the full header map was VERIFIED pin-for-pin against the official
 * ESP32-DevKitC V4 user guide pin-layout tables (docs.espressif.com):
 *   J2 1-19: 3V3, EN, VP, VN, IO34, IO35, IO32, IO33, IO25, IO26, IO27,
 *            IO14, IO12, GND, IO13, D2, D3, CMD, 5V
 *   J3 1-19: GND, IO23, IO22, TX, RX, IO21, GND, IO19, IO18, IO5, IO17,
 *            IO16, IO4, IO0, IO2, IO15, D1, D0, CLK
 * Every designator below (including the ~24 mid-header ones the builder
 * assigned from resource order) matches the official table.
 */
const pins: InterfaceDef[] = [
  // J2, pins 1-19
  pin3v3,
  pinEn,
  ...j2Gpio.slice(0, 11),          // VP..Pin 12 (J2-3..J2-13)
  devkitGnd("gnd", "GND", "J2-14"),
  ...j2Gpio.slice(11, 12),         // Pin 13 (J2-15)
  ...j2FlashPins,                  // D2, D3, CMD (J2-16..J2-18)
  pin5v,
  // J3, pins 1-19
  devkitGnd("gnd_j3_1", "GND (J3-1)", "J3-1"),
  ...j3Gpio.slice(0, 5),           // Pin 23..Pin 21 (J3-2..J3-6)
  devkitGnd("gnd_j3_7", "GND (J3-7)", "J3-7"),
  ...j3Gpio.slice(5),              // Pin 19..Pin 15 (J3-8..J3-16)
  ...j3FlashPins,                  // D1, D0, CLK (J3-17..J3-19)
  // Connector
  microUsb,
];

// ---------------------------------------------------------------------------
// Composed interfaces — one-to-one with the ProtoPart `interfaces` list
// (same ids, names, protocol types/roles and max_instances). Pool-style
// interfaces (one function claimed per instance) use a single count-1 slot
// with max_instances equal to the pool size, exactly as the JSON counts them.
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

// --- Power rails ------------------------------------------------------------

const power3v3 = composed({
  id: "power_3v3",
  name: "Power 3.3V",
  protocolType: "power",
  roles: ["peer"], // ProtoPart role: peer (rail is input OR output)
  slots: [{ id: "rail", required: true, match: { protocol: "power", capability: "power_3v3" } }],
  profiles: [{ id: "power_3v3_rail", label: "3V3 (J2-1)", bindings: { rail: "3v3" } }],
  maxInstances: 1,
});

const power5v = composed({
  id: "power_5v",
  name: "Power 5V",
  protocolType: "power",
  roles: ["peer"],
  slots: [{ id: "rail", required: true, match: { protocol: "power", capability: "power_5v0" } }],
  profiles: [{ id: "power_5v_rail", label: "5V (J2-19)", bindings: { rail: "5v" } }],
  maxInstances: 1,
});

const ground = composed({
  id: "ground",
  name: "Ground",
  protocolType: "power",
  roles: ["peer"],
  slots: [{ id: "pin", required: true, match: { protocol: "power", role: "ground", capability: "ground" } }],
  maxInstances: 3, // three GND header pins: J2-14, J3-1, J3-7
  traits: [
    { type: "channels", params: { count: 3, mapping: "GND=J2-14, GND (J3-1)=J3-1, GND (J3-7)=J3-7" } },
  ],
});

// --- Reset / boot -----------------------------------------------------------

const chipEnableReset = composed({
  id: "chip_enable_reset",
  name: "Chip Enable / Reset",
  protocolType: "digital",
  roles: ["input"],
  slots: [{ id: "en", required: true, match: { protocol: "digital", role: "input", capability: "chip_pu" } }],
  profiles: [{ id: "chip_enable_reset_en", label: "EN (J2-2)", bindings: { en: "en" } }],
  maxInstances: 1,
  traits: [
    {
      type: "protopart_requires",
      params: {
        functions: ["EN", "PU"],
        note: "The ProtoPart source requires EN and PU — both aliases of the same header pin; one physical pin satisfies both.",
      },
    },
  ],
});

const bootConfiguration = composed({
  id: "boot_configuration",
  name: "Boot Configuration",
  protocolType: "digital",
  roles: ["input"],
  slots: [
    { id: "boot", required: true, label: "BOOT (GPIO0)", match: { protocol: "digital", role: "input", capability: "strap_boot" } },
    { id: "log", required: true, label: "LOG (GPIO15 / MTDO)", match: { protocol: "digital", role: "input", capability: "strap_boot_log" } },
    { id: "vdd_flash", required: true, label: "VDD_FLASH (GPIO12 / MTDI)", match: { protocol: "digital", role: "input", capability: "strap_vdd_flash" } },
  ],
  profiles: [
    {
      id: "boot_configuration_straps",
      label: "BOOT=Pin 0, LOG=Pin 15, VDD_FLASH=Pin 12",
      bindings: { boot: "pin_0", log: "pin_15", vdd_flash: "pin_12" },
    },
  ],
  maxInstances: 3, // ProtoPart max_instances: 3
  traits: [
    {
      type: "boot_strapping",
      params: {
        note: "GPIOs 0, 2, 5, 12, and 15 are strapping pins - pulling them to conflicting levels during reset can prevent boot or change flash voltage.",
        source: "ProtoPart board warning #4",
      },
    },
  ],
});

// --- GPIO pools -------------------------------------------------------------

const gpioInputOnly = composed({
  id: "gpio_input_only",
  name: "GPIO Input Only",
  protocolType: "digital",
  roles: ["input"],
  slots: [{ id: "pin", required: true, match: { protocol: "digital", role: "input", capability: "gpio_input_only" } }],
  maxInstances: 4,
  traits: [
    { type: "channels", params: { count: 4, mapping: "VP=GPIO36, VN=GPIO39, Pin 34=GPIO34, Pin 35=GPIO35" } },
  ],
});

const gpioInputOutput = composed({
  id: "gpio_input_output",
  name: "GPIO Input / Output",
  protocolType: "digital",
  roles: ["peer"],
  slots: [{ id: "pin", required: true, match: { protocol: "digital", capability: "gpio_io" } }],
  maxInstances: 22,
  traits: [
    {
      type: "channels",
      params: {
        count: 22,
        note: "All bidirectional header GPIOs. Excludes the four input-only pins (GPIO34-39 group) and the six flash-reserved pins (D0-D3, CMD, CLK), which the ProtoPart source does not give a GPIO Input / Output function.",
      },
    },
  ],
});

// --- Analog -----------------------------------------------------------------

const adc1 = composed({
  id: "adc1",
  name: "ADC1",
  protocolType: "analog",
  roles: ["input"],
  slots: [{ id: "channel", required: true, match: { protocol: "analog", role: "input", capability: "adc1_in" } }],
  maxInstances: 6, // six ADC1 channels reach the headers
  traits: [
    {
      type: "channels",
      params: {
        count: 6,
        mapping: "CH0=VP (GPIO36), CH3=VN (GPIO39), CH4=Pin 32, CH5=Pin 33, CH6=Pin 34, CH7=Pin 35",
      },
    },
  ],
});

const adc2 = composed({
  id: "adc2",
  name: "ADC2",
  protocolType: "analog",
  roles: ["input"],
  slots: [{ id: "channel", required: true, match: { protocol: "analog", role: "input", capability: "adc2_in" } }],
  maxInstances: 10,
  traits: [
    {
      type: "channels",
      params: {
        count: 10,
        mapping: "CH0=Pin 4, CH1=Pin 0, CH2=Pin 2, CH3=Pin 15, CH4=Pin 13, CH5=Pin 12, CH6=Pin 14, CH7=Pin 27, CH8=Pin 25, CH9=Pin 26",
      },
    },
  ],
});

const dac = composed({
  id: "dac",
  name: "DAC",
  protocolType: "analog",
  roles: ["output"],
  slots: [{ id: "channel", required: true, match: { protocol: "analog", role: "output", capability: "analog_out" } }],
  maxInstances: 2,
  traits: [
    { type: "channels", params: { count: 2, mapping: "DAC_1=Pin 25 (GPIO25), DAC_2=Pin 26 (GPIO26)" } },
  ],
});

const hallSensor = composed({
  id: "hall_sensor",
  name: "Hall Sensor",
  protocolType: "analog",
  roles: ["input"],
  slots: [
    { id: "svp", required: true, label: "S_VP", match: { protocol: "analog", role: "input", capability: "sensor_vp" } },
    { id: "svn", required: true, label: "S_VN", match: { protocol: "analog", role: "input", capability: "sensor_vn" } },
  ],
  profiles: [
    { id: "hall_sensor_vp_vn", label: "S_VP=VP (J2-3), S_VN=VN (J2-4)", bindings: { svp: "vp", svn: "vn" } },
  ],
  maxInstances: 2, // ProtoPart max_instances: 2 (one S_VP/S_VN pair exists on the board)
});

const voltageDetection = composed({
  id: "voltage_detection",
  name: "Voltage Detection",
  protocolType: "analog",
  roles: ["input"],
  slots: [{ id: "channel", required: true, match: { protocol: "analog", role: "input", capability: "vdet" } }],
  maxInstances: 2,
  traits: [
    { type: "channels", params: { count: 2, mapping: "VDET_1=Pin 34 (GPIO34), VDET_2=Pin 35 (GPIO35)" } },
  ],
});

// --- RTC / touch / oscillator -----------------------------------------------

const rtcGpio = composed({
  id: "rtc_gpio",
  name: "RTC GPIO",
  protocolType: "digital",
  roles: ["peer"],
  slots: [{ id: "channel", required: true, match: { protocol: "digital", capability: "rtc_gpio" } }],
  maxInstances: 16,
  traits: [
    {
      type: "channels",
      params: {
        count: 16,
        mapping:
          "RTC_GPIO0=VP, RTC_GPIO3=VN, RTC_GPIO4=Pin 34, RTC_GPIO5=Pin 35, RTC_GPIO6=Pin 25, RTC_GPIO7=Pin 26, RTC_GPIO8=Pin 33, RTC_GPIO9=Pin 32, RTC_GPIO10=Pin 4, RTC_GPIO11=Pin 0, RTC_GPIO12=Pin 2, RTC_GPIO13=Pin 15, RTC_GPIO14=Pin 13, RTC_GPIO15=Pin 12, RTC_GPIO16=Pin 14, RTC_GPIO17=Pin 27",
      },
    },
  ],
});

const touchSensor = composed({
  id: "touch_sensor",
  name: "Touch Sensor",
  protocolType: "custom", // ProtoPart protocol type: custom
  roles: ["input"],
  slots: [{ id: "channel", required: true, match: { capability: "touch" } }],
  maxInstances: 10,
  traits: [
    {
      type: "channels",
      params: {
        count: 10,
        mapping: "T0=Pin 4, T1=Pin 0, T2=Pin 2, T3=Pin 15, T4=Pin 13, T5=Pin 12, T6=Pin 14, T7=Pin 27, T8=Pin 33, T9=Pin 32",
        note: "The ProtoPart source enumerates the ten channel functions TOUCH0-TOUCH9 individually; each instance claims one channel.",
      },
    },
  ],
});

const rtcCrystalOscillator = composed({
  id: "rtc_crystal_oscillator",
  name: "RTC Crystal Oscillator",
  protocolType: "oscillators", // ProtoPart protocol type
  roles: ["peer"],
  slots: [
    { id: "xp", required: true, label: "32K_XP", match: { capability: "xtal_32k_p" } },
    { id: "xn", required: true, label: "32K_XN", match: { capability: "xtal_32k_n" } },
  ],
  profiles: [
    { id: "rtc_crystal_pins", label: "32K_XP=Pin 32, 32K_XN=Pin 33", bindings: { xp: "pin_32", xn: "pin_33" } },
  ],
  maxInstances: 2, // ProtoPart max_instances: 2 (one XP/XN pair exists on the board)
});

// --- Serial buses -----------------------------------------------------------

// UART is hand-rolled (not the UART builder): the ProtoPart role is "peer",
// which the builder's host/device role set cannot express, and the source
// gives no baud-rate data to carry.
const uartTraits = (aliasNote?: string): TraitDef[] => [
  {
    type: "co_requirement",
    params: {
      with: "micro_usb",
      condition: "UART0 profile (TX/RX header pins) with USB connected",
      effect:
        "TX (GPIO1) and RX (GPIO3) are shared with the on-board USB-to-UART bridge. To use UART0 with an external peer, unplug USB or tri-state the bridge by holding the bridge IC in reset.",
      source: "ProtoPart board warning #7",
    },
  },
  ...(aliasNote ? [{ type: "alias_note", params: { note: aliasNote } }] : []),
];

const uart = composed({
  id: "uart",
  name: "UART",
  protocolType: "uart",
  roles: ["peer"],
  slots: [
    { id: "tx", required: true, match: { protocol: "uart", role: "transmitter", capability: "uart_tx" } },
    { id: "rx", required: true, match: { protocol: "uart", role: "receiver", capability: "uart_rx" } },
  ],
  profiles: [
    { id: "uart0", label: "UART0: TX (GPIO1), RX (GPIO3) — shared with USB bridge", bindings: { tx: "tx", rx: "rx" } },
    // Second RX/TX pair on the headers (ProtoPart max_instances: 2): the
    // pin_16/pin_17 resources are described as GPIO16 / U2RXD and
    // GPIO17 / U2TXD and carry uart_rx / uart_tx functions.
    // Audit: VERIFIED against the ESP32-WROOM-32E datasheet pin definitions —
    // U2RXD is a listed function of GPIO16 (module pin 27) and U2TXD of
    // GPIO17 (module pin 28), so the UART2 profile is datasheet-honest.
    { id: "uart2", label: "UART2: Pin 17 (GPIO17/U2TXD), Pin 16 (GPIO16/U2RXD)", bindings: { tx: "pin_17", rx: "pin_16" } },
  ],
  maxInstances: 2,
  traits: uartTraits(),
});

const arduinoSerial = composed({
  id: "arduino_serial",
  name: "Arduino Serial",
  protocolType: "uart",
  roles: ["peer"],
  slots: [
    { id: "tx", required: true, match: { protocol: "uart", role: "transmitter", capability: "uart_tx" } },
    { id: "rx", required: true, match: { protocol: "uart", role: "receiver", capability: "uart_rx" } },
  ],
  profiles: [
    { id: "arduino_serial_default", label: "Serial: TX (GPIO1), RX (GPIO3)", bindings: { tx: "tx", rx: "rx" } },
  ],
  maxInstances: 2, // ProtoPart max_instances: 2
  traits: uartTraits(
    "Arduino-core alias of the primary serial port (Serial), carried as its own interface because the ProtoPart source lists it separately.",
  ),
});

// SPI builder fits: ProtoPart role "master" is a builder role. No clock
// frequency is given in the source, so none is emitted.
const hspi = SPI({
  id: "hspi",
  name: "High-Speed SPI",
  roles: ["master"],
  maxInstances: 4, // ProtoPart max_instances: 4
  profiles: [
    {
      id: "hspi_default",
      label: "HSPI: SCK=Pin 14, MISO=Pin 12, MOSI=Pin 13, SS=Pin 15",
      mosi: "pin_13", miso: "pin_12", sck: "pin_14", ss: "pin_15",
    },
  ],
});

const vspi = SPI({
  id: "vspi",
  name: "Virtual SPI",
  roles: ["master"],
  maxInstances: 4, // ProtoPart max_instances: 4
  profiles: [
    {
      id: "vspi_default",
      label: "VSPI: SCK=Pin 18, MISO=Pin 19, MOSI=Pin 23, SS=Pin 5",
      mosi: "pin_23", miso: "pin_19", sck: "pin_18", ss: "pin_5",
    },
  ],
});

// I2C is hand-rolled (not the I2C builder): the builder always emits a
// default 400 kHz clock parameter, and the ProtoPart source gives no bus
// clock to carry — hand-rolling avoids fabricating one.
const i2cWire = composed({
  id: "i2c_wire",
  name: "I2C / Wire",
  protocolType: "i2c",
  roles: ["master"],
  slots: [
    { id: "sda", required: true, match: { protocol: "i2c", role: "data", capability: "i2c_sda" } },
    { id: "scl", required: true, match: { protocol: "i2c", role: "clock", capability: "i2c_scl" } },
  ],
  profiles: [
    { id: "i2c_wire_default", label: "Wire: SDA=Pin 21 (GPIO21), SCL=Pin 22 (GPIO22)", bindings: { sda: "pin_21", scl: "pin_22" } },
  ],
  maxInstances: 2, // ProtoPart max_instances: 2
});

const externalFlashMemorySpi = composed({
  id: "external_flash_memory_spi",
  name: "External Flash Memory SPI",
  protocolType: "spi",
  roles: ["master"],
  slots: [
    { id: "clk", required: true, match: { capability: "spi_flash_sck" } },
    { id: "cmd", required: true, match: { capability: "spi_flash_cmd" } },
    { id: "d0", required: true, match: { capability: "spi_flash_d0" } },
    { id: "d1", required: true, match: { capability: "spi_flash_d1" } },
    { id: "d2", required: true, match: { capability: "spi_flash_d2" } },
    { id: "d3", required: true, match: { capability: "spi_flash_d3" } },
  ],
  profiles: [
    {
      id: "flash_bus_pins",
      label: "CLK (J3-19), CMD (J2-18), D0 (J3-18), D1 (J3-17), D2 (J2-16), D3 (J2-17)",
      bindings: { clk: "clk", cmd: "cmd", d0: "d0", d1: "d1", d2: "d2", d3: "d3" },
    },
  ],
  maxInstances: 6, // ProtoPart max_instances: 6
  traits: [
    {
      type: "usage_restriction",
      params: {
        restriction:
          "This bus is already committed to the SPI flash inside the ESP32-WROOM-32E module — the header pins expose it but it must not be repurposed as general I/O.",
        source: "ProtoPart board warning #2",
      },
    },
  ],
});

const jtag = composed({
  id: "jtag",
  name: "JTAG",
  protocolType: "jtag",
  roles: ["target"],
  slots: [
    { id: "tdi", required: true, match: { capability: "jtag_tdi" } },
    { id: "tdo", required: true, match: { capability: "jtag_tdo" } },
    { id: "tck", required: true, match: { capability: "jtag_tck" } },
    { id: "tms", required: true, match: { capability: "jtag_tms" } },
  ],
  profiles: [
    {
      id: "jtag_mt_pins",
      label: "MTDI=Pin 12, MTDO=Pin 15, MTCK=Pin 13, MTMS=Pin 14",
      bindings: { tdi: "pin_12", tdo: "pin_15", tck: "pin_13", tms: "pin_14" },
    },
  ],
  maxInstances: 4, // ProtoPart max_instances: 4
});

const sdio = composed({
  id: "sdio",
  name: "SDIO",
  protocolType: "sdio",
  roles: ["peer"],
  slots: [{ id: "sdio", required: true, match: { capability: "sdio" } }],
  profiles: [{ id: "sdio_gpio5", label: "SDIO strap / alternate function on Pin 5 (GPIO5)", bindings: { sdio: "pin_5" } }],
  maxInstances: 1,
});

// --- Pad-capability pools (carried verbatim from the ProtoPart source) ------

const openDrainCapability = composed({
  id: "open_drain_capability",
  name: "Open Drain Capability",
  protocolType: "digital",
  roles: ["peer"],
  slots: [{ id: "pad", required: true, match: { protocol: "digital", capability: "open_drain" } }],
  // Mirrors the ProtoPart pool: all 32 header GPIO pads carry an "Open Drain
  // Capability" function in the source. Datasheet caveat: GPIO34-39 (VP, VN,
  // Pin 34, Pin 35) are input-only with no output driver, so open-drain
  // OUTPUT is not physically available on those four pads.
  maxInstances: 32,
});

const inputEnableCapability = composed({
  id: "input_enable_capability",
  name: "Input Enable Capability",
  protocolType: "digital",
  roles: ["peer"],
  slots: [{ id: "pad", required: true, match: { protocol: "digital", capability: "pad_input_gate" } }],
  maxInstances: 32,
  traits: [
    {
      type: "protopart_requires",
      params: {
        functions: ["IE", "ID"],
        note: "The ProtoPart source lists input-enable (IE) on bidirectional pads and input-disable (ID) on input-only pads; both are carried under the shared pad_input_gate capability tag.",
      },
    },
  ],
});

const weakPullUpCapability = composed({
  id: "weak_pull_up_capability",
  name: "Weak Pull-Up Capability",
  protocolType: "digital",
  roles: ["peer"],
  slots: [{ id: "pad", required: true, match: { protocol: "digital", capability: "weak_pullup" } }],
  maxInstances: 13, // pads the ProtoPart source marks WPU
});

const weakPullDownCapability = composed({
  id: "weak_pull_down_capability",
  name: "Weak Pull-Down Capability",
  protocolType: "digital",
  roles: ["peer"],
  slots: [{ id: "pad", required: true, match: { protocol: "digital", capability: "weak_pulldown" } }],
  maxInstances: 3, // Pin 13, Pin 2, Pin 4
});

// ---------------------------------------------------------------------------
// Network domain — radios inside the ESP32-WROOM-32E module
// ---------------------------------------------------------------------------

const wifiRadio: InterfaceDef = {
  id: "wifi_radio",
  name: "2.4 GHz Wi-Fi radio (PCB trace antenna)",
  domain: "network",
  exposed: true,
  default_active: true,
  protocols: [{ type: "rf", roles: ["transceiver"] }],
  capabilities: ["wifi_rf"],
  traits: [
    {
      type: "antenna",
      params: {
        description:
          "Integrated 802.11 b/g/n radio inside the ESP32-WROOM-32E module. PCB trace antenna on the module.",
      },
    },
  ],
};

const bluetoothRadio: InterfaceDef = {
  id: "bluetooth_radio",
  name: "Bluetooth 4.2 dual-mode radio",
  domain: "network",
  exposed: true,
  default_active: true,
  protocols: [{ type: "rf", roles: ["transceiver"] }],
  capabilities: ["bluetooth_rf"],
  traits: [
    {
      type: "antenna",
      params: {
        description:
          "Integrated Bluetooth 4.2 BR/EDR + BLE radio inside the ESP32-WROOM-32E module. Shares the PCB trace antenna with Wi-Fi.",
      },
    },
  ],
};

const wifiClient = composed({
  id: "wifi_client",
  name: "Wi-Fi",
  domain: "network",
  protocolType: "wifi",
  roles: ["client", "access_point", "peer"], // ProtoPart roles, verbatim
  slots: [{ id: "rf", required: true, match: { capability: "wifi_rf" } }],
  profiles: [{ id: "wifi_client_radio", label: "On-module Wi-Fi radio", bindings: { rf: "wifi_radio" } }],
  traits: [
    {
      type: "radio_characteristics",
      params: {
        description: "2.4 GHz 802.11 b/g/n. Supports station, soft-AP, and Wi-Fi Direct / ESP-NOW peer roles.",
      },
    },
  ],
});

const bluetoothPeer = composed({
  id: "bluetooth_peer",
  name: "Bluetooth (Classic + BLE)",
  domain: "network",
  protocolType: "bluetooth",
  roles: ["peer"],
  slots: [{ id: "rf", required: true, match: { capability: "bluetooth_rf" } }],
  profiles: [{ id: "bluetooth_peer_radio", label: "On-module Bluetooth radio", bindings: { rf: "bluetooth_radio" } }],
  traits: [
    {
      type: "radio_characteristics",
      params: {
        description: "Bluetooth 4.2 dual-mode: Classic BR/EDR plus Bluetooth Low Energy.",
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

export const ESP32_DEVKITC_V4: ModuleDef = defineModule({
  id: "esp32-devkitc-v4",
  name: "Espressif ESP32-DevKitC V4",
  version: "1.0.0",
  manufacturer: "Espressif Systems",
  part_number: "ESP32-DevKitC-V4",
  description:
    "Espressif's reference ESP32 development board. Hosts an ESP32-WROOM-32E module (Xtensa LX6 dual-core 240 MHz, 4 MB flash, 2.4 GHz Wi-Fi + Bluetooth 4.2 dual-mode) on a 54.4 x 27.9 mm breakout PCB. Exposes 38 pins on two 19-pin 2.54 mm headers (J2/J3), a Micro-USB port wired to a USB-to-UART bridge (CP2102N) for power and programming, and EN (reset) + BOOT (download) push-buttons. Breadboard-friendly footprint.",
  tags: ["esp32", "esp32-wroom-32e", "dev-board", "wifi", "bluetooth", "ble", "micro-usb", "xtensa", "dual-core"],
  categories: ["microcontroller.development_board", "connectivity.wireless"],

  interfaces: [
    // All 38 header pins in header order (J2-1..19, J3-1..19) + Micro-USB.
    ...pins,

    // Power rails
    power3v3,
    power5v,
    ground,

    // Reset / boot
    chipEnableReset,
    bootConfiguration,

    // GPIO pools
    gpioInputOnly,
    gpioInputOutput,

    // Analog
    adc1,
    adc2,
    dac,
    hallSensor,
    voltageDetection,

    // RTC / touch / oscillator
    rtcGpio,
    touchSensor,
    rtcCrystalOscillator,

    // Serial buses
    uart,
    arduinoSerial,
    ...hspi,
    ...vspi,
    i2cWire,
    externalFlashMemorySpi,
    jtag,
    sdio,

    // Pad-capability pools
    openDrainCapability,
    inputEnableCapability,
    weakPullUpCapability,
    weakPullDownCapability,

    // Network (radios inside the WROOM-32E module)
    wifiRadio,
    bluetoothRadio,
    wifiClient,
    bluetoothPeer,
  ],

  interfaceGroups: [
    {
      id: "j2_header",
      label: "J2 Header (19 pins, 2.54 mm)",
      members: [
        "3v3", "en", "vp", "vn", "pin_34", "pin_35", "pin_32", "pin_33",
        "pin_25", "pin_26", "pin_27", "pin_14", "pin_12", "gnd", "pin_13",
        "d2", "d3", "cmd", "5v",
      ],
      policy: "all_of",
    },
    {
      id: "j3_header",
      label: "J3 Header (19 pins, 2.54 mm)",
      members: [
        "gnd_j3_1", "pin_23", "pin_22", "tx", "rx", "pin_21", "gnd_j3_7",
        "pin_19", "pin_18", "pin_5", "pin_17", "pin_16", "pin_4", "pin_0",
        "pin_2", "pin_15", "d1", "d0", "clk",
      ],
      policy: "all_of",
    },
    {
      id: "flash_reserved_pins",
      label: "Flash-Reserved Pins (GPIO6-11 — not general I/O)",
      members: ["d2", "d3", "cmd", "clk", "d0", "d1"],
      policy: "all_of",
    },
    {
      id: "strapping_pins",
      label: "Strapping Pins (GPIO0/2/5/12/15)",
      members: ["pin_0", "pin_2", "pin_5", "pin_12", "pin_15"],
      policy: "all_of",
    },
    {
      // Board warning #5: power via Micro-USB OR the 5V header pin OR the
      // 3V3 header pin — never two of these simultaneously.
      id: "power_source",
      label: "Power Source (exactly one)",
      members: ["micro_usb", "5v", "3v3"],
      policy: "one_of",
    },
  ],

  requirements: [
    {
      type: "power",
      description:
        "Power via exactly one of: Micro-USB VBUS (5 V), the 5V header pin (4.75-5.25 V, up to 500 mA from the USB host or external supply), or a regulated 3.3 V supply on the 3V3 header pin (3.0-3.6 V, bypassing the on-board AMS1117-3.3 LDO). Never power from two of these simultaneously, or the board / supply can be damaged.",
      voltage_V: [3, 5.25], // ProtoPart supply_voltage_V
      current_mA: 500,
    },
  ],

  domains: [
    {
      domain: "electrical",
      power_domains: [
        { id: "usb_5v", name: "5V input rail", nominal_voltage_V: 5, voltage_range_V: USB_5V_RANGE, max_current_mA: USB_5V_MAX_MA },
        { id: "io_3v3", name: "3.3V logic rail", nominal_voltage_V: 3.3, voltage_range_V: IO_3V3_RANGE, max_current_mA: IO_3V3_MAX_MA, regulation_type: "regulated" },
        { id: "gnd", name: "Ground", nominal_voltage_V: 0, voltage_range_V: [0, 0], max_current_mA: 1000 },
      ],
      metadata: {
        pin_count: 38,
        supply_voltage_V: [3, 5.25],
        supports_usb: true,
        package_type: "PCB module / 2x 19-pin 2.54mm headers",
        // PowerDomainDef has no description field — the ProtoPart power
        // domain descriptions are preserved here verbatim.
        power_domain_notes: {
          usb_5v: "5V rail sourced from Micro-USB VBUS or the 5V header pin. Current limited by USB host or external supply.",
          io_3v3: "On-board AMS1117-3.3 LDO output. Supplies the ESP32-WROOM-32E module and the 3V3 header pin.",
          gnd: "Common board ground.",
        },
      },
    },
    {
      domain: "network",
      metadata: {
        network_protocols: ["wifi", "bluetooth"],
        wireless_standards: ["802.11 b/g/n (2.4 GHz)", "Bluetooth 4.2 BR/EDR", "Bluetooth Low Energy 4.2"],
        frequency_bands_ghz: [2.4],
      },
    },
    {
      domain: "thermal",
      operating_temperature_C: [-40, 85],
    },
    {
      domain: "mechanical",
      dimensions_mm: { length: 54.4, width: 27.9, height: 13 },
    },
  ],

  traits: [
    {
      type: "hosted_module",
      params: {
        module: "ESP32-WROOM-32E",
        note: "The board carries an ESP32-WROOM-32E module (ESP32 chip + 4 MB SPI flash + PCB trace antenna); module internals are not decomposed here — this definition models only what the board exposes.",
      },
    },
    {
      type: "usb_uart_bridge",
      params: {
        part: "CP2102N",
        connects: "Micro-USB D+/D- to U0TXD/U0RXD (header pins TX/RX, GPIO1/GPIO3)",
        purpose: "Power and programming.",
      },
    },
    {
      type: "voltage_regulator",
      params: {
        part: "AMS1117-3.3",
        output: "io_3v3 rail (3.3 V nominal, 600 mA max)",
        source: "ProtoPart power domain io_3v3",
      },
    },
    {
      type: "push_buttons",
      params: {
        buttons: [
          { name: "EN", function: "Reset — pulls EN/CHIP_PU (J2-2) low." },
          { name: "BOOT", function: "Download mode — pulls GPIO0 (J3-14) low; hold at reset to enter firmware download mode." },
        ],
      },
    },

    // ProtoPart board warnings, verbatim.
    {
      type: "board_warning",
      params: {
        topic: "logic_level",
        warning: "All GPIO signals are 3.3V logic. ESP32 GPIOs are NOT 5V-tolerant - driving them with 5V can damage the module.",
      },
    },
    {
      type: "board_warning",
      params: {
        topic: "flash_reserved_pins",
        warning: "GPIOs 6-11 (header pins D0, D1, D2, D3, CMD, CLK) are wired to the on-package SPI flash and MUST NOT be used as general I/O on the WROOM-32E variant.",
      },
    },
    {
      type: "board_warning",
      params: {
        topic: "psram_variants",
        warning: "GPIOs 16 and 17 are usable on the default ESP32-WROOM-32E module (no PSRAM). They are NOT usable on WROVER-E / WROVER-IE variants or on -R2 (ESP32-D0WDR2-V3) sub-variants of WROOM-32E, where the in-package PSRAM consumes both pins.",
      },
    },
    {
      type: "board_warning",
      params: {
        topic: "strapping_pins",
        warning: "GPIOs 0, 2, 5, 12, and 15 are strapping pins - pulling them to conflicting levels during reset can prevent boot or change flash voltage.",
      },
    },
    {
      type: "board_warning",
      params: {
        topic: "power_input_exclusivity",
        warning: "Power the board via Micro-USB OR the 5V header pin OR the 3V3 header pin - never two of these simultaneously, or the board / supply can be damaged.",
      },
    },
    {
      type: "board_warning",
      params: {
        topic: "gpio0_c15_errata",
        warning: "Earlier ESP32-DevKitC V4 boards may have a 0402 cap (C15) near GPIO0 that causes spurious boot-into-download or distorts a clock signal output on GPIO0. Remove C15 if you hit either issue.",
      },
    },
    {
      type: "board_warning",
      params: {
        topic: "usb_uart_sharing",
        warning: "TX (GPIO1) and RX (GPIO3) are shared with the on-board USB-to-UART bridge. To use UART0 with an external peer, unplug USB or tri-state the bridge by holding the bridge IC in reset.",
      },
    },

    // ProtoPart fields with no OpenUHD home, preserved verbatim.
    { type: "preview_artifact", params: { artifactId: "art_thumbnail" } },
    {
      type: "purchase_info",
      params: {
        vendors: [
          {
            vendor: "Amazon",
            vendorPartId: "B09MQJWQN2",
            title: "ESP32-DevKitC-32E Development Board (Espressif)",
            link: "https://www.amazon.com/dp/B09MQJWQN2?tag=protoboard01-20",
            isAffiliate: true,
            currentPriceUSD: "11.00",
            currency: "USD",
            availabilityStatus: "in_stock",
            productStatus: "active",
            priceTimestamp: "2026-05-16T21:20:00Z",
            region: "US",
          },
          {
            vendor: "DigiKey",
            vendorPartId: "1965-ESP32-DEVKITC-32E-ND",
            title: "ESP32-DEVKITC-32E Espressif ESP32-WROOM-32E DevKitC V4",
            link: "https://www.digikey.com/en/products/detail/espressif-systems/ESP32-DEVKITC-32E/12091810",
            isAffiliate: false,
            currentPriceUSD: "10.00",
            currency: "USD",
            availabilityStatus: "in_stock",
            productStatus: "active",
            stockQuantityAvailable: 393,
            priceTimestamp: "2026-05-16T21:20:00Z",
            region: "US",
          },
          {
            vendor: "Espressif",
            title: "ESP32-DevKitC overview (manufacturer product page)",
            link: "https://www.espressif.com/en/products/devkits/esp32-devkitc/overview",
            isAffiliate: false,
            availabilityStatus: "unknown",
            priceTimestamp: "2026-05-16T21:20:00Z",
            notes: "Manufacturer product page; not a direct-purchase storefront for retail customers.",
          },
        ],
      },
    },
  ],

  artifacts: [
    {
      id: "art_user_guide",
      name: "ESP32-DevKitC V4 user guide (Espressif)",
      type: "documentation", // ProtoPart type "link"
      url: "https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32/esp32-devkitc/user_guide.html",
    },
    {
      id: "art_schematic",
      name: "ESP32-DevKitC V4 schematic (PDF)",
      type: "datasheet",
      url: "https://dl.espressif.com/dl/schematics/esp32_devkitc_v4_sch.pdf",
    },
    {
      id: "art_pcb_layout",
      name: "ESP32-DevKitC V4 PCB layout (PDF)",
      type: "datasheet",
      url: "https://dl.espressif.com/dl/schematics/esp32_devkitc_v4_pcb_layout.pdf",
    },
    {
      id: "art_dimensions",
      name: "ESP32-DevKitC V4 dimensions (PDF)",
      type: "datasheet",
      url: "https://dl.espressif.com/dl/schematics/esp32_devkitc_v4_dimensions.pdf",
    },
    {
      id: "art_module_datasheet",
      name: "ESP32-WROOM-32E datasheet (PDF)",
      type: "datasheet",
      url: "https://www.espressif.com/sites/default/files/documentation/esp32-wroom-32e_esp32-wroom-32ue_datasheet_en.pdf",
    },
    {
      id: "art_product_image",
      name: "ESP32-DEVKITC-32E product photo",
      type: "custom", // ProtoPart type "image"
      filePath: "./ProtoPart/protoparts/esp32-devkitc-v4/artifacts/images/ESP32-DEVKITC-32E.jpg",
      mimeType: "image/jpeg",
      tags: ["image", "product-photo"],
    },
    {
      id: "art_product_page",
      name: "Espressif product page",
      type: "documentation", // ProtoPart type "link"
      url: "https://www.espressif.com/en/products/devkits/esp32-devkitc/overview",
    },
    {
      id: "art_thumbnail",
      name: "Espressif ESP32-DevKitC V4 thumbnail",
      type: "custom", // ProtoPart type "image"
      filePath: "./ProtoPart/protoparts/esp32-devkitc-v4/thumbnail.png",
      mimeType: "image/png",
      tags: ["image", "thumbnail"],
    },
  ],

  // The ProtoPart source has node_geometry: null — no geometry is carried
  // over rather than fabricating one.
});
