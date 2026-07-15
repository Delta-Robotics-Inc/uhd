/**
 * Espressif ESP32-D0WDQ6 — datasheet-honest part definition.
 *
 * Primary source: ESP32 Series Datasheet v5.2 (2025.11)
 *   - Table 2-1  Pin Overview (pin numbers, names, functions — copied verbatim)
 *   - Table 2-5/2-6  Pin mapping between chip and flash/PSRAM
 *   - Table 3-1  Default configuration of strapping pins
 *   - Table 4-3/4-4  ADC characteristics and calibrated ranges
 *   - Table 4-6  Peripheral pin configurations (IO_MUX-fixed vs GPIO-matrix routable)
 *   - Table 5-1  Absolute maximum ratings (cumulative IO output current 1200 mA)
 *   - Table 5-2  Recommended power supply characteristics
 *   - Table 5-3  DC characteristics (I_OH per power domain, I_OL, 45 kΩ pulls)
 *   - Appendix A  Notes on ESP32 pin lists (input-only pins, drive-strength options)
 * Secondary sources are cited per-trait ("ESP32 TRM", "ESP32 Hardware Design
 * Guidelines"); nothing below is carried over from convention or SDK defaults
 * without attribution.
 *
 * Architecture notes honoured by this file:
 *   - Pin-honest like a schematic: all 49 physical pads (48 + exposed pad) are
 *     leaf interfaces, in package order, with ids "pin_N" and the datasheet
 *     pin name as the displayed name.
 *   - Every pin carries its verbatim datasheet function list (name, direction,
 *     routing) in an `esp32_pin_functions` trait — display data is separated
 *     from the canonical capability tags the matching engine needs.
 *   - Instances vs combinations: `max_instances` states how many controllers
 *     exist in silicon; slots + capability tags span the honest combination
 *     space (GPIO-matrix signals match any eligible pin via `matrix_in` /
 *     `matrix_out`); IO_MUX routings are captured as named profiles.
 *   - Co-requirements (`co_requirement` traits): ADC2 vs Wi-Fi, 40 MHz crystal
 *     for RF, MTDI strap vs VDD_SDIO voltage, 32K_XP/XN commitment, MTDO/GPIO5
 *     strap vs SDIO-slave timing.
 *   - Implied harness connections (`implied_passives` traits): crystal load
 *     caps, BBPLL loop filter RC (datasheet-specified values), CHIP_PU reset
 *     RC, LNA π-matching network.
 *   - Shareability exemptions (`net_shareable` traits): the five analog supply
 *     pins are one decoupled net; a single supply instance may serve all of
 *     them (and GND is inherently shareable).
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
  UART,
  I2C,
  defineModule,
  clockFreqHz,
  resolutionBits,
  voltageRangeV,
} from "../../src/protocols/index.js";

// ---------------------------------------------------------------------------
// Electrical constants — Datasheet Tables 5-1, 5-2, 5-3
// ---------------------------------------------------------------------------

/** Table 5-2: VDDA / VDD3P3 / VDD3P3_RTC / VDD_SDIO(3.3 V mode); min 2.3 V for chips with no in-package flash (D0WDQ6). */
const VDD_33_RANGE: [number, number] = [2.3, 3.6];
/** Table 5-2: VDD3P3_CPU may run down to 1.8 V. */
const VDD_CPU_RANGE: [number, number] = [1.8, 3.6];
/** Table 5-2 + note 1: VDD_SDIO is 1.8 V (internal LDO) or tracks VDD3P3_RTC. */
const VDD_SDIO_RANGE: [number, number] = [1.8, 3.6];

/** Table 5-3: I_OH at maximum drive strength, VDD3P3_CPU / VDD3P3_RTC domains. */
const IOH_RTC_CPU_MA = 40;
/** Table 5-3: I_OH typ, VDD_SDIO domain (see note 3 derating below). */
const IOH_SDIO_MA = 20;
/** Table 5-3: I_OL at maximum drive strength, all domains. */
const IOL_MA = 28;
/** Table 5-3: internal weak pull-up / pull-down resistance. */
const RPU_RPD_KOHM = 45;

/** Appendix A note 8: per-pin drive strength options; default setting is 2 (≈20 mA). */
const DRIVE_STRENGTH_TRAIT: TraitDef = {
  type: "drive_strength_options",
  params: {
    options_mA: [5, 10, 20, 40],
    default_mA: 20,
    source: "ESP32 Series Datasheet v5.2, Appendix A.1 note 8",
  },
};

type Esp32PowerDomain = "VDD3P3_RTC" | "VDD3P3_CPU" | "VDD_SDIO";

const DOMAIN_VOLTAGE: Record<Esp32PowerDomain, [number, number]> = {
  VDD3P3_RTC: VDD_33_RANGE,
  VDD3P3_CPU: VDD_CPU_RANGE,
  VDD_SDIO: VDD_SDIO_RANGE,
};

const DOMAIN_SOURCE_MA: Record<Esp32PowerDomain, number> = {
  VDD3P3_RTC: IOH_RTC_CPU_MA,
  VDD3P3_CPU: IOH_RTC_CPU_MA,
  VDD_SDIO: IOH_SDIO_MA,
};

// ---------------------------------------------------------------------------
// Datasheet-honest per-pin function metadata
// ---------------------------------------------------------------------------

/** How a function reaches the pad (Datasheet Table 4-6 / TRM IO_MUX chapter). */
type Esp32Via = "io_mux" | "rtc_mux" | "analog" | "gpio_matrix";

interface Esp32Function {
  /** Verbatim signal name from Datasheet Table 2-1 / Table 4-6. */
  name: string;
  /** Datasheet Type column: I = input, O = output, "I/O" = bidirectional. */
  direction: "I" | "O" | "I/O";
  via: Esp32Via;
  /**
   * Optional display override for notation the plain name cannot carry
   * (e.g. active-low overlines on other parts). Unused on the ESP32 but part
   * of the honest-display contract.
   */
  display?: string;
  note?: string;
}

interface Esp32GpioSpec {
  pin: number;
  /** Datasheet pin name (Table 2-1) — used as the displayed interface name. */
  name: string;
  gpio: number;
  domain: Esp32PowerDomain;
  /** GPIO34–39: no output driver, no internal pull resistors (Appendix A note 2). */
  inputOnly?: boolean;
  functions: Esp32Function[];
  /** Capability tags for IO_MUX-fixed signals (slot matching). */
  fixedCaps?: string[];
  adc?: { converter: 1 | 2; channel: number };
  dac?: 1 | 2;
  touch?: number;
  rtcGpio?: number;
  /** Table 3-1 strapping defaults + Section 3 boot parameter it controls. */
  strapping?: { defaultPull: "pull-up" | "pull-down"; bitValue: 0 | 1; controls: string };
  /** Table 2-6: allocated to the external SPI flash on a normally-booting design. */
  flashReserved?: boolean;
  notes?: string;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

/** Build one schematic-honest GPIO pad from its datasheet row. */
function esp32Gpio(spec: Esp32GpioSpec): InterfaceDef {
  const outputCapable = !spec.inputOnly;

  const base = Pin({
    id: `pin_${spec.pin}`,
    name: spec.name,
    pin: spec.pin,
    voltageV: DOMAIN_VOLTAGE[spec.domain],
    capabilities: {
      inputOnly: spec.inputOnly,
      interrupt: true,
      pwm: outputCapable, // LEDC/MCPWM: any output-capable GPIO via GPIO matrix (Table 4-6)
      analogIn: spec.adc !== undefined,
      analogOut: spec.dac !== undefined,
      touch: spec.touch !== undefined,
      // I2C0/1 route via GPIO matrix to any output-capable GPIO (Table 4-6)
      i2cSda: outputCapable,
      i2cScl: outputCapable,
      // UART0/1/2 route via GPIO matrix to any GPIO; TX/RTS need an output driver
      uartRx: true,
      uartCts: true,
      uartTx: outputCapable,
      uartRts: outputCapable,
    },
  });

  const capabilities = unique([
    ...(base.capabilities ?? []),
    `gpio${spec.gpio}`,
    // GPIO-matrix routability (Table 4-6 "Any GPIO Pins" rows): the honest
    // combination space for TWAI / RMT / PCNT / I2S / EMAC MDC-MDIO / etc.
    "matrix_in",
    ...(outputCapable ? ["matrix_out"] : []),
    ...(spec.adc ? [`adc${spec.adc.converter}_in`] : []),
    ...(spec.dac ? ["dac_out"] : []),
    ...(spec.rtcGpio !== undefined ? ["rtc_gpio"] : []),
    ...(spec.fixedCaps ?? []),
  ]);

  const parameters: Parameter[] = [
    ...(base.parameters ?? []),
    ...(outputCapable
      ? [
          { id: "source_current", name: "I_OH (max drive strength)", unit: "mA", value: DOMAIN_SOURCE_MA[spec.domain] },
          { id: "sink_current", name: "I_OL (max drive strength)", unit: "mA", value: IOL_MA },
        ]
      : []),
  ];

  const traits: TraitDef[] = [
    {
      type: "esp32_pin_functions",
      params: {
        source: "ESP32 Series Datasheet v5.2, Table 2-1 / Table 4-6",
        functions: spec.functions,
        ...(spec.notes ? { note: spec.notes } : {}),
      },
    },
    {
      type: "power_domain",
      params: {
        domain: spec.domain,
        ...(spec.domain === "VDD_SDIO"
          ? { note: "Pad voltage tracks VDD_SDIO: 1.8 V or VDD3P3_RTC depending on the MTDI strap / eFuse / register setting." }
          : {}),
      },
    },
    spec.inputOnly
      ? {
          type: "internal_pulls",
          params: {
            available: false,
            reason: "GPIO34-39 have no output driver and no internal pull-up/pull-down circuitry (Appendix A.1 note 2).",
          },
        }
      : {
          type: "internal_pulls",
          params: { available: true, pull_up_kOhm: RPU_RPD_KOHM, pull_down_kOhm: RPU_RPD_KOHM, programmable: true },
        },
    ...(outputCapable ? [DRIVE_STRENGTH_TRAIT] : []),
    ...(spec.domain === "VDD_SDIO" && outputCapable
      ? [
          {
            type: "current_derating",
            params: {
              rule: "VDD_SDIO-domain source current falls from ~30 mA to ~10 mA per pin as the number of simultaneously sourcing pins in the domain increases.",
              source: "ESP32 Series Datasheet v5.2, Table 5-3 note 3",
            },
          },
        ]
      : []),
    ...(spec.strapping
      ? [
          {
            type: "boot_strapping",
            params: {
              default_pull: spec.strapping.defaultPull,
              bit_value: spec.strapping.bitValue,
              controls: spec.strapping.controls,
              sampling: "Latched on the rising edge of CHIP_PU; hold ≥1 ms after CHIP_PU is high (Table 3-2).",
              source: "ESP32 Series Datasheet v5.2, Section 3 / Table 3-1",
            },
          },
        ]
      : []),
    ...(spec.flashReserved
      ? [
          {
            type: "usage_restriction",
            params: {
              restriction: "Allocated to the external SPI flash on any normally-booting design (Table 2-6); repurposing breaks default ROM boot.",
              exemption: "Free when the design boots from a flash wired to an alternative mapping — the restriction is conditional, not absolute.",
            },
          },
        ]
      : []),
  ];

  return { ...base, capabilities, parameters, traits };
}

// ---------------------------------------------------------------------------
// GPIO pads — Datasheet Table 2-1, in package pin order
// ---------------------------------------------------------------------------

const GPIO_SPECS: Esp32GpioSpec[] = [
  {
    pin: 5, name: "SENSOR_VP", gpio: 36, domain: "VDD3P3_RTC", inputOnly: true,
    adc: { converter: 1, channel: 0 }, rtcGpio: 0,
    functions: [
      { name: "GPIO36", direction: "I", via: "io_mux" },
      { name: "ADC1_CH0", direction: "I", via: "analog" },
      { name: "RTC_GPIO0", direction: "I", via: "rtc_mux" },
    ],
  },
  {
    pin: 6, name: "SENSOR_CAPP", gpio: 37, domain: "VDD3P3_RTC", inputOnly: true,
    adc: { converter: 1, channel: 1 }, rtcGpio: 1,
    functions: [
      { name: "GPIO37", direction: "I", via: "io_mux" },
      { name: "ADC1_CH1", direction: "I", via: "analog" },
      { name: "RTC_GPIO1", direction: "I", via: "rtc_mux" },
    ],
  },
  {
    pin: 7, name: "SENSOR_CAPN", gpio: 38, domain: "VDD3P3_RTC", inputOnly: true,
    adc: { converter: 1, channel: 2 }, rtcGpio: 2,
    functions: [
      { name: "GPIO38", direction: "I", via: "io_mux" },
      { name: "ADC1_CH2", direction: "I", via: "analog" },
      { name: "RTC_GPIO2", direction: "I", via: "rtc_mux" },
    ],
  },
  {
    pin: 8, name: "SENSOR_VN", gpio: 39, domain: "VDD3P3_RTC", inputOnly: true,
    adc: { converter: 1, channel: 3 }, rtcGpio: 3,
    functions: [
      { name: "GPIO39", direction: "I", via: "io_mux" },
      { name: "ADC1_CH3", direction: "I", via: "analog" },
      { name: "RTC_GPIO3", direction: "I", via: "rtc_mux" },
    ],
  },
  {
    pin: 10, name: "VDET_1", gpio: 34, domain: "VDD3P3_RTC", inputOnly: true,
    adc: { converter: 1, channel: 6 }, rtcGpio: 4,
    functions: [
      { name: "GPIO34", direction: "I", via: "io_mux" },
      { name: "ADC1_CH6", direction: "I", via: "analog" },
      { name: "RTC_GPIO4", direction: "I", via: "rtc_mux" },
    ],
  },
  {
    pin: 11, name: "VDET_2", gpio: 35, domain: "VDD3P3_RTC", inputOnly: true,
    adc: { converter: 1, channel: 7 }, rtcGpio: 5,
    functions: [
      { name: "GPIO35", direction: "I", via: "io_mux" },
      { name: "ADC1_CH7", direction: "I", via: "analog" },
      { name: "RTC_GPIO5", direction: "I", via: "rtc_mux" },
    ],
  },
  {
    pin: 12, name: "32K_XP", gpio: 32, domain: "VDD3P3_RTC",
    adc: { converter: 1, channel: 4 }, touch: 9, rtcGpio: 9,
    fixedCaps: ["xtal_32k_p"],
    functions: [
      { name: "GPIO32", direction: "I/O", via: "io_mux" },
      { name: "ADC1_CH4", direction: "I", via: "analog" },
      { name: "RTC_GPIO9", direction: "I/O", via: "rtc_mux" },
      { name: "TOUCH9", direction: "I", via: "analog" },
      { name: "32K_XP", direction: "I", via: "analog", note: "32.768 kHz crystal oscillator input" },
    ],
  },
  {
    pin: 13, name: "32K_XN", gpio: 33, domain: "VDD3P3_RTC",
    adc: { converter: 1, channel: 5 }, touch: 8, rtcGpio: 8,
    fixedCaps: ["xtal_32k_n"],
    functions: [
      { name: "GPIO33", direction: "I/O", via: "io_mux" },
      { name: "ADC1_CH5", direction: "I", via: "analog" },
      { name: "RTC_GPIO8", direction: "I/O", via: "rtc_mux" },
      { name: "TOUCH8", direction: "I", via: "analog" },
      { name: "32K_XN", direction: "O", via: "analog", note: "32.768 kHz crystal oscillator output" },
    ],
  },
  {
    pin: 14, name: "GPIO25", gpio: 25, domain: "VDD3P3_RTC",
    adc: { converter: 2, channel: 8 }, dac: 1, rtcGpio: 6,
    fixedCaps: ["emac_rxd0"],
    functions: [
      { name: "GPIO25", direction: "I/O", via: "io_mux" },
      { name: "ADC2_CH8", direction: "I", via: "analog" },
      { name: "RTC_GPIO6", direction: "I/O", via: "rtc_mux" },
      { name: "DAC_1", direction: "O", via: "analog" },
      { name: "EMAC_RXD0", direction: "I", via: "io_mux" },
    ],
  },
  {
    pin: 15, name: "GPIO26", gpio: 26, domain: "VDD3P3_RTC",
    adc: { converter: 2, channel: 9 }, dac: 2, rtcGpio: 7,
    fixedCaps: ["emac_rxd1"],
    functions: [
      { name: "GPIO26", direction: "I/O", via: "io_mux" },
      { name: "ADC2_CH9", direction: "I", via: "analog" },
      { name: "RTC_GPIO7", direction: "I/O", via: "rtc_mux" },
      { name: "DAC_2", direction: "O", via: "analog" },
      { name: "EMAC_RXD1", direction: "I", via: "io_mux" },
    ],
  },
  {
    pin: 16, name: "GPIO27", gpio: 27, domain: "VDD3P3_RTC",
    adc: { converter: 2, channel: 7 }, touch: 7, rtcGpio: 17,
    fixedCaps: ["emac_rx_dv"],
    functions: [
      { name: "GPIO27", direction: "I/O", via: "io_mux" },
      { name: "ADC2_CH7", direction: "I", via: "analog" },
      { name: "RTC_GPIO17", direction: "I/O", via: "rtc_mux" },
      { name: "TOUCH7", direction: "I", via: "analog" },
      { name: "EMAC_RX_DV", direction: "I", via: "io_mux", note: "CRS_DV in RMII mode" },
    ],
  },
  {
    pin: 17, name: "MTMS", gpio: 14, domain: "VDD3P3_RTC",
    adc: { converter: 2, channel: 6 }, touch: 6, rtcGpio: 16,
    fixedCaps: ["spi_sck", "hspi_clk", "sdio_host_clk", "hs2_clk", "sdio_slave_clk", "jtag_tms", "emac_txd2"],
    functions: [
      { name: "GPIO14", direction: "I/O", via: "io_mux" },
      { name: "ADC2_CH6", direction: "I", via: "analog" },
      { name: "RTC_GPIO16", direction: "I/O", via: "rtc_mux" },
      { name: "TOUCH6", direction: "I", via: "analog" },
      { name: "EMAC_TXD2", direction: "O", via: "io_mux" },
      { name: "HSPICLK", direction: "I/O", via: "io_mux" },
      { name: "HS2_CLK", direction: "O", via: "io_mux", note: "SDIO host port 2 clock" },
      { name: "SD_CLK", direction: "I", via: "io_mux", note: "SDIO slave clock" },
      { name: "MTMS", direction: "I", via: "io_mux", note: "JTAG TMS" },
    ],
  },
  {
    pin: 18, name: "MTDI", gpio: 12, domain: "VDD3P3_RTC",
    adc: { converter: 2, channel: 5 }, touch: 5, rtcGpio: 15,
    strapping: { defaultPull: "pull-down", bitValue: 0, controls: "Internal LDO (VDD_SDIO) voltage: low = 3.3 V (default), high = 1.8 V" },
    fixedCaps: ["spi_miso", "hspi_q", "sdio_host_data2", "hs2_data2", "sdio_slave_data2", "jtag_tdi", "emac_txd3"],
    functions: [
      { name: "GPIO12", direction: "I/O", via: "io_mux" },
      { name: "ADC2_CH5", direction: "I", via: "analog" },
      { name: "RTC_GPIO15", direction: "I/O", via: "rtc_mux" },
      { name: "TOUCH5", direction: "I", via: "analog" },
      { name: "EMAC_TXD3", direction: "O", via: "io_mux" },
      { name: "HSPIQ", direction: "I/O", via: "io_mux" },
      { name: "HS2_DATA2", direction: "I/O", via: "io_mux" },
      { name: "SD_DATA2", direction: "I/O", via: "io_mux" },
      { name: "MTDI", direction: "I", via: "io_mux", note: "JTAG TDI" },
    ],
  },
  {
    pin: 20, name: "MTCK", gpio: 13, domain: "VDD3P3_RTC",
    adc: { converter: 2, channel: 4 }, touch: 4, rtcGpio: 14,
    fixedCaps: ["spi_mosi", "hspi_d", "sdio_host_data3", "hs2_data3", "sdio_slave_data3", "jtag_tck", "emac_rx_er"],
    functions: [
      { name: "GPIO13", direction: "I/O", via: "io_mux" },
      { name: "ADC2_CH4", direction: "I", via: "analog" },
      { name: "RTC_GPIO14", direction: "I/O", via: "rtc_mux" },
      { name: "TOUCH4", direction: "I", via: "analog" },
      { name: "EMAC_RX_ER", direction: "I", via: "io_mux" },
      { name: "HSPID", direction: "I/O", via: "io_mux" },
      { name: "HS2_DATA3", direction: "I/O", via: "io_mux" },
      { name: "SD_DATA3", direction: "I/O", via: "io_mux" },
      { name: "MTCK", direction: "I", via: "io_mux", note: "JTAG TCK" },
    ],
  },
  {
    pin: 21, name: "MTDO", gpio: 15, domain: "VDD3P3_RTC",
    adc: { converter: 2, channel: 3 }, touch: 3, rtcGpio: 13,
    strapping: { defaultPull: "pull-up", bitValue: 1, controls: "U0TXD ROM-boot log printing; together with GPIO5, timing of the SDIO slave" },
    fixedCaps: ["spi_ss", "hspi_cs0", "sdio_host_cmd", "hs2_cmd", "sdio_slave_cmd", "jtag_tdo", "emac_rxd3"],
    functions: [
      { name: "GPIO15", direction: "I/O", via: "io_mux" },
      { name: "ADC2_CH3", direction: "I", via: "analog" },
      { name: "RTC_GPIO13", direction: "I/O", via: "rtc_mux" },
      { name: "TOUCH3", direction: "I", via: "analog" },
      { name: "EMAC_RXD3", direction: "I", via: "io_mux" },
      { name: "HSPICS0", direction: "I/O", via: "io_mux" },
      { name: "HS2_CMD", direction: "I/O", via: "io_mux" },
      { name: "SD_CMD", direction: "I/O", via: "io_mux" },
      { name: "MTDO", direction: "O", via: "io_mux", note: "JTAG TDO" },
    ],
  },
  {
    pin: 22, name: "GPIO2", gpio: 2, domain: "VDD3P3_RTC",
    adc: { converter: 2, channel: 2 }, touch: 2, rtcGpio: 12,
    strapping: { defaultPull: "pull-down", bitValue: 0, controls: "Chip boot mode (together with GPIO0): must be low or floating to enter serial download mode" },
    fixedCaps: ["hspi_wp", "sdio_host_data0", "hs2_data0", "sdio_slave_data0"],
    functions: [
      { name: "GPIO2", direction: "I/O", via: "io_mux" },
      { name: "ADC2_CH2", direction: "I", via: "analog" },
      { name: "RTC_GPIO12", direction: "I/O", via: "rtc_mux" },
      { name: "TOUCH2", direction: "I", via: "analog" },
      { name: "HSPIWP", direction: "I/O", via: "io_mux" },
      { name: "HS2_DATA0", direction: "I/O", via: "io_mux" },
      { name: "SD_DATA0", direction: "I/O", via: "io_mux" },
    ],
  },
  {
    pin: 23, name: "GPIO0", gpio: 0, domain: "VDD3P3_RTC",
    adc: { converter: 2, channel: 1 }, touch: 1, rtcGpio: 11,
    strapping: { defaultPull: "pull-up", bitValue: 1, controls: "Chip boot mode: high = SPI flash boot (default), low = serial download mode" },
    fixedCaps: ["emac_tx_clk", "clk_out"],
    functions: [
      { name: "GPIO0", direction: "I/O", via: "io_mux" },
      { name: "ADC2_CH1", direction: "I", via: "analog" },
      { name: "RTC_GPIO11", direction: "I/O", via: "rtc_mux" },
      { name: "TOUCH1", direction: "I", via: "analog" },
      { name: "EMAC_TX_CLK", direction: "I", via: "io_mux", note: "MII TX clock in; RMII 50 MHz REF_CLK in, or CLK_OUT with internal PLL" },
      { name: "CLK_OUT1", direction: "O", via: "io_mux" },
    ],
  },
  {
    pin: 24, name: "GPIO4", gpio: 4, domain: "VDD3P3_RTC",
    adc: { converter: 2, channel: 0 }, touch: 0, rtcGpio: 10,
    fixedCaps: ["hspi_hd", "sdio_host_data1", "hs2_data1", "sdio_slave_data1", "emac_tx_er"],
    functions: [
      { name: "GPIO4", direction: "I/O", via: "io_mux" },
      { name: "ADC2_CH0", direction: "I", via: "analog" },
      { name: "RTC_GPIO10", direction: "I/O", via: "rtc_mux" },
      { name: "TOUCH0", direction: "I", via: "analog" },
      { name: "EMAC_TX_ER", direction: "O", via: "io_mux" },
      { name: "HSPIHD", direction: "I/O", via: "io_mux" },
      { name: "HS2_DATA1", direction: "I/O", via: "io_mux" },
      { name: "SD_DATA1", direction: "I/O", via: "io_mux" },
    ],
  },
  {
    // Datasheet v5.2 Table 2-1 groups pins 25-33 under the VDD_SDIO power
    // domain — GPIO16/GPIO17 are NOT VDD3P3_CPU pins.
    pin: 25, name: "GPIO16", gpio: 16, domain: "VDD_SDIO",
    fixedCaps: ["sdio_host_data4", "hs1_data4", "emac_clk_out"],
    notes: "Unavailable on modules with in-package/off-package PSRAM (used as PSRAM CE#).",
    functions: [
      { name: "GPIO16", direction: "I/O", via: "io_mux" },
      { name: "HS1_DATA4", direction: "I/O", via: "io_mux" },
      { name: "U2RXD", direction: "I", via: "io_mux" },
      { name: "EMAC_CLK_OUT", direction: "O", via: "io_mux" },
    ],
  },
  {
    pin: 27, name: "GPIO17", gpio: 17, domain: "VDD_SDIO",
    fixedCaps: ["sdio_host_data5", "hs1_data5", "emac_clk_out_180"],
    notes: "Unavailable on modules with in-package/off-package PSRAM (PSRAM SCLK option).",
    functions: [
      { name: "GPIO17", direction: "I/O", via: "io_mux" },
      { name: "HS1_DATA5", direction: "I/O", via: "io_mux" },
      { name: "U2TXD", direction: "O", via: "io_mux" },
      { name: "EMAC_CLK_OUT_180", direction: "O", via: "io_mux" },
    ],
  },
  {
    pin: 28, name: "SD_DATA_2", gpio: 9, domain: "VDD_SDIO", flashReserved: true,
    fixedCaps: ["spi01_hd", "sdio_host_data2", "hs1_data2", "sdio_slave_data2"],
    functions: [
      { name: "GPIO9", direction: "I/O", via: "io_mux" },
      { name: "HS1_DATA2", direction: "I/O", via: "io_mux" },
      { name: "U1RXD", direction: "I", via: "io_mux" },
      { name: "SD_DATA2", direction: "I/O", via: "io_mux" },
      { name: "SPIHD", direction: "I/O", via: "io_mux", note: "Flash IO3/HOLD# (Table 2-6)" },
    ],
  },
  {
    pin: 29, name: "SD_DATA_3", gpio: 10, domain: "VDD_SDIO", flashReserved: true,
    fixedCaps: ["spi01_wp", "sdio_host_data3", "hs1_data3", "sdio_slave_data3"],
    functions: [
      { name: "GPIO10", direction: "I/O", via: "io_mux" },
      { name: "HS1_DATA3", direction: "I/O", via: "io_mux" },
      { name: "U1TXD", direction: "O", via: "io_mux" },
      { name: "SD_DATA3", direction: "I/O", via: "io_mux" },
      { name: "SPIWP", direction: "I/O", via: "io_mux", note: "Flash IO2/WP# (Table 2-6)" },
    ],
  },
  {
    pin: 30, name: "SD_CMD", gpio: 11, domain: "VDD_SDIO", flashReserved: true,
    fixedCaps: ["spi01_cs0", "sdio_host_cmd", "hs1_cmd", "sdio_slave_cmd"],
    functions: [
      { name: "GPIO11", direction: "I/O", via: "io_mux" },
      { name: "HS1_CMD", direction: "I/O", via: "io_mux" },
      { name: "U1RTS", direction: "O", via: "io_mux" },
      { name: "SD_CMD", direction: "I/O", via: "io_mux" },
      { name: "SPICS0", direction: "I/O", via: "io_mux", note: "Flash CS# (Table 2-6)" },
    ],
  },
  {
    pin: 31, name: "SD_CLK", gpio: 6, domain: "VDD_SDIO", flashReserved: true,
    fixedCaps: ["spi01_clk", "sdio_host_clk", "hs1_clk", "sdio_slave_clk"],
    functions: [
      { name: "GPIO6", direction: "I/O", via: "io_mux" },
      { name: "HS1_CLK", direction: "O", via: "io_mux" },
      { name: "U1CTS", direction: "I", via: "io_mux" },
      { name: "SD_CLK", direction: "I", via: "io_mux" },
      { name: "SPICLK", direction: "I/O", via: "io_mux", note: "Flash CLK (Table 2-6)" },
    ],
  },
  {
    pin: 32, name: "SD_DATA_0", gpio: 7, domain: "VDD_SDIO", flashReserved: true,
    fixedCaps: ["spi01_q", "sdio_host_data0", "hs1_data0", "sdio_slave_data0"],
    functions: [
      { name: "GPIO7", direction: "I/O", via: "io_mux" },
      { name: "HS1_DATA0", direction: "I/O", via: "io_mux" },
      { name: "U2RTS", direction: "O", via: "io_mux" },
      { name: "SD_DATA0", direction: "I/O", via: "io_mux" },
      { name: "SPIQ", direction: "I/O", via: "io_mux", note: "Flash IO1/DO (Table 2-6)" },
    ],
  },
  {
    pin: 33, name: "SD_DATA_1", gpio: 8, domain: "VDD_SDIO", flashReserved: true,
    fixedCaps: ["spi01_d", "sdio_host_data1", "hs1_data1", "sdio_slave_data1"],
    functions: [
      { name: "GPIO8", direction: "I/O", via: "io_mux" },
      { name: "HS1_DATA1", direction: "I/O", via: "io_mux" },
      { name: "U2CTS", direction: "I", via: "io_mux" },
      { name: "SD_DATA1", direction: "I/O", via: "io_mux" },
      { name: "SPID", direction: "I/O", via: "io_mux", note: "Flash IO0/DI (Table 2-6)" },
    ],
  },
  {
    pin: 34, name: "GPIO5", gpio: 5, domain: "VDD3P3_CPU",
    strapping: { defaultPull: "pull-up", bitValue: 1, controls: "Together with MTDO, timing of the SDIO slave" },
    fixedCaps: ["spi_ss", "vspi_cs0", "sdio_host_data6", "hs1_data6", "emac_rx_clk"],
    functions: [
      { name: "GPIO5", direction: "I/O", via: "io_mux" },
      { name: "HS1_DATA6", direction: "I/O", via: "io_mux" },
      { name: "VSPICS0", direction: "I/O", via: "io_mux" },
      { name: "EMAC_RX_CLK", direction: "I", via: "io_mux", note: "MII only" },
    ],
  },
  {
    pin: 35, name: "GPIO18", gpio: 18, domain: "VDD3P3_CPU",
    fixedCaps: ["spi_sck", "vspi_clk", "sdio_host_data7", "hs1_data7"],
    functions: [
      { name: "GPIO18", direction: "I/O", via: "io_mux" },
      { name: "HS1_DATA7", direction: "I/O", via: "io_mux" },
      { name: "VSPICLK", direction: "I/O", via: "io_mux" },
    ],
  },
  {
    pin: 36, name: "GPIO23", gpio: 23, domain: "VDD3P3_CPU",
    fixedCaps: ["spi_mosi", "vspi_d", "sdio_host_strobe", "hs1_strobe"],
    functions: [
      { name: "GPIO23", direction: "I/O", via: "io_mux" },
      { name: "HS1_STROBE", direction: "I", via: "io_mux" },
      { name: "VSPID", direction: "I/O", via: "io_mux" },
    ],
  },
  {
    pin: 38, name: "GPIO19", gpio: 19, domain: "VDD3P3_CPU",
    fixedCaps: ["spi_miso", "vspi_q", "emac_txd0"],
    functions: [
      { name: "GPIO19", direction: "I/O", via: "io_mux" },
      { name: "U0CTS", direction: "I", via: "io_mux" },
      { name: "VSPIQ", direction: "I/O", via: "io_mux" },
      { name: "EMAC_TXD0", direction: "O", via: "io_mux" },
    ],
  },
  {
    pin: 39, name: "GPIO22", gpio: 22, domain: "VDD3P3_CPU",
    fixedCaps: ["vspi_wp", "emac_txd1"],
    functions: [
      { name: "GPIO22", direction: "I/O", via: "io_mux" },
      { name: "U0RTS", direction: "O", via: "io_mux" },
      { name: "VSPIWP", direction: "I/O", via: "io_mux" },
      { name: "EMAC_TXD1", direction: "O", via: "io_mux" },
    ],
  },
  {
    pin: 40, name: "U0RXD", gpio: 3, domain: "VDD3P3_CPU",
    fixedCaps: ["clk_out"],
    notes: "Default UART0 RX — used by the ROM bootloader for flashing.",
    functions: [
      { name: "GPIO3", direction: "I/O", via: "io_mux" },
      { name: "U0RXD", direction: "I", via: "io_mux" },
      { name: "CLK_OUT2", direction: "O", via: "io_mux" },
    ],
  },
  {
    pin: 41, name: "U0TXD", gpio: 1, domain: "VDD3P3_CPU",
    fixedCaps: ["clk_out", "emac_rxd2"],
    notes: "Default UART0 TX — the ROM bootloader prints on this pin at reset unless silenced by the MTDO strap.",
    functions: [
      { name: "GPIO1", direction: "I/O", via: "io_mux" },
      { name: "U0TXD", direction: "O", via: "io_mux" },
      { name: "CLK_OUT3", direction: "O", via: "io_mux" },
      { name: "EMAC_RXD2", direction: "I", via: "io_mux" },
    ],
  },
  {
    pin: 42, name: "GPIO21", gpio: 21, domain: "VDD3P3_CPU",
    fixedCaps: ["vspi_hd", "emac_tx_en"],
    functions: [
      { name: "GPIO21", direction: "I/O", via: "io_mux" },
      { name: "VSPIHD", direction: "I/O", via: "io_mux" },
      { name: "EMAC_TX_EN", direction: "O", via: "io_mux" },
    ],
  },
];

const gpioPads: InterfaceDef[] = GPIO_SPECS.map(esp32Gpio);

// ---------------------------------------------------------------------------
// Power, RF, crystal, and analog service pads — Datasheet Table 2-1
// ---------------------------------------------------------------------------

/** The five analog supply pads (1, 3, 4, 43, 46) sit on one decoupled 3.3 V net. */
function analogSupplyPin(pinNo: number, name: string): InterfaceDef {
  const base = PowerIn({
    id: `pin_${pinNo}`,
    name,
    pin: pinNo,
    voltageV: VDD_33_RANGE,
    nominalV: 3.3,
  });
  return {
    ...base,
    capabilities: ["power_in", "analog_supply"],
    traits: [
      { type: "power_domain", params: { domain: "VDDA (analog power domain)" } },
      {
        // Shareability exemption: one supply instance may legally serve all
        // five pads — pin-usage exclusivity does not apply to a shared rail.
        type: "net_shareable",
        params: {
          net: "esp32_analog_3v3",
          policy: "single_supply_instance_may_serve_all_members",
          members: ["pin_1", "pin_3", "pin_4", "pin_43", "pin_46"],
        },
      },
      {
        type: "implied_passives",
        params: {
          purpose: "Supply decoupling",
          components: [{ kind: "capacitor", value: "100 nF", connection: "pin to GND, close to the pad" }],
          source: "ESP32 Hardware Design Guidelines",
        },
      },
    ],
  };
}

const powerAndServicePads: InterfaceDef[] = [
  analogSupplyPin(1, "VDDA"),

  {
    id: "pin_2",
    name: "LNA_IN",
    pin: 2,
    domain: "electrical",
    exposed: true,
    default_active: true,
    protocols: [{ type: "rf", roles: ["transceiver"] }],
    capabilities: ["rf_2g4_antenna_feed"],
    parameters: [
      // Table 5-6 note 2: Wi-Fi radio output impedance for the QFN 6*6 package.
      { id: "impedance", name: "Radio output impedance (real part)", unit: "Ω", value: 30 },
      { id: "frequency", unit: "Hz", range: [2_400_000_000, 2_484_000_000] },
    ],
    traits: [
      {
        type: "rf_port",
        params: {
          description: "Low Noise Amplifier (LNA) input signal, Power Amplifier (PA) output signal — shared Wi-Fi/Bluetooth feed.",
          output_impedance: "30 + j10 Ω (QFN 6*6 package)",
          source: "ESP32 Series Datasheet v5.2, Table 2-2 / Table 5-6 note 2",
        },
      },
      {
        type: "implied_passives",
        params: {
          purpose: "Impedance matching from 30 + j10 Ω to a 50 Ω antenna",
          components: [{ kind: "pi_network", value: "CLC π-matching network, values per board layout", connection: "LNA_IN to antenna" }],
          source: "ESP32 Hardware Design Guidelines",
        },
      },
    ],
    bridgesTo: ["wifi_radio", "bluetooth_radio"],
  },

  analogSupplyPin(3, "VDD3P3"),
  analogSupplyPin(4, "VDD3P3"),

  {
    id: "pin_9",
    name: "CHIP_PU",
    pin: 9,
    domain: "electrical",
    exposed: true,
    default_active: true,
    protocols: [{ type: "digital", roles: ["input"] }],
    capabilities: ["chip_enable", "reset_input"],
    parameters: [
      { id: "voltage", unit: "V", range: VDD_33_RANGE },
      // Table 5-3: V_IL_nRST — low level that shuts the chip down.
      { id: "reset_low_threshold", name: "V_IL_nRST (max)", unit: "V", value: 0.6 },
    ],
    traits: [
      {
        type: "esp32_pin_functions",
        params: {
          source: "ESP32 Series Datasheet v5.2, Table 2-1 / 2-2",
          functions: [
            { name: "CHIP_PU", direction: "I", via: "analog", note: "High: on, enables the chip. Low: off, the chip powers down. Do not leave floating." },
          ],
        },
      },
      { type: "internal_pulls", params: { available: false, reason: "CHIP_PU has no internal pull — it must be driven or pulled externally." } },
      {
        type: "power_up_timing",
        params: {
          t_STBL_min_us: 50,
          t_RST_min_us: 50,
          description: "Rails must be stable ≥50 µs before CHIP_PU rises; hold below V_IL_nRST ≥50 µs to reset.",
          source: "ESP32 Series Datasheet v5.2, Table 2-4",
        },
      },
      {
        type: "implied_passives",
        params: {
          purpose: "Clean power-on reset",
          components: [
            { kind: "resistor", value: "10 kΩ", connection: "CHIP_PU to VDD3P3_RTC" },
            { kind: "capacitor", value: "1 nF", connection: "CHIP_PU to GND" },
          ],
          source: "ESP32 Hardware Design Guidelines",
        },
      },
    ],
  },

  PowerIn({ id: "pin_19", name: "VDD3P3_RTC", pin: 19, voltageV: VDD_33_RANGE, nominalV: 3.3 }),

  {
    id: "pin_26",
    name: "VDD_SDIO",
    pin: 26,
    domain: "electrical",
    exposed: true,
    default_active: true,
    protocols: [{ type: "power", roles: ["input", "output"] }],
    capabilities: ["vdd_sdio"],
    parameters: [{ id: "voltage", unit: "V", value: 3.3, range: VDD_SDIO_RANGE }],
    traits: [
      {
        type: "internal_regulator",
        params: {
          description: "Output of the internal SDIO-LDO: 1.8 V, or the same voltage as VDD3P3_RTC. May instead be driven by an external supply (the LDO disables automatically).",
          source: "ESP32 Series Datasheet v5.2, Table 2-1 / Appendix A.1 note 3",
        },
      },
      {
        type: "co_requirement",
        params: {
          with: "pin_18",
          condition: "MTDI strap sampled at reset",
          effect: "MTDI low (default pull-down) selects 3.3 V; MTDI high selects 1.8 V. eFuse bits EFUSE_SDIO_FORCE / EFUSE_SDIO_TIEH override; software can reconfigure at runtime.",
          source: "ESP32 Series Datasheet v5.2, Section 3",
        },
      },
    ],
  },

  PowerIn({ id: "pin_37", name: "VDD3P3_CPU", pin: 37, voltageV: VDD_CPU_RANGE, nominalV: 3.3 }),

  analogSupplyPin(43, "VDDA"),

  {
    id: "pin_44",
    name: "XTAL_N",
    pin: 44,
    domain: "electrical",
    exposed: true,
    default_active: true,
    protocols: [{ type: "clock", roles: ["output"] }],
    capabilities: ["xtal_n"],
    parameters: [{ id: "clock_freq", unit: "Hz", range: [2_000_000, 60_000_000] }],
    traits: [
      { type: "esp32_pin_functions", params: { source: "Datasheet v5.2 Table 2-1/2-2", functions: [{ name: "XTAL_N", direction: "O", via: "analog", note: "External crystal output (differential clock negative)" }] } },
    ],
  },
  {
    id: "pin_45",
    name: "XTAL_P",
    pin: 45,
    domain: "electrical",
    exposed: true,
    default_active: true,
    protocols: [{ type: "clock", roles: ["input"] }],
    capabilities: ["xtal_p"],
    parameters: [{ id: "clock_freq", unit: "Hz", range: [2_000_000, 60_000_000] }],
    traits: [
      { type: "esp32_pin_functions", params: { source: "Datasheet v5.2 Table 2-1/2-2", functions: [{ name: "XTAL_P", direction: "I", via: "analog", note: "External crystal input (differential clock positive)" }] } },
    ],
  },

  analogSupplyPin(46, "VDDA"),

  {
    id: "pin_47",
    name: "CAP2",
    pin: 47,
    domain: "electrical",
    exposed: true,
    default_active: true,
    protocols: [{ type: "analog", roles: ["input"] }],
    capabilities: ["bbpll_cap2"],
    traits: [
      {
        type: "implied_passives",
        params: {
          purpose: "BBPLL loop filter",
          components: [
            { kind: "capacitor", value: "3.3 nF (10%)", connection: "CAP2 to CAP1 (in parallel with the resistor)" },
            { kind: "resistor", value: "20 kΩ", connection: "CAP2 to CAP1" },
          ],
          source: "ESP32 Series Datasheet v5.2, Table 2-1 (verbatim: 'Connects to a 3.3 nF (10%) capacitor and 20 kΩ resistor in parallel to CAP1')",
        },
      },
    ],
  },
  {
    id: "pin_48",
    name: "CAP1",
    pin: 48,
    domain: "electrical",
    exposed: true,
    default_active: true,
    protocols: [{ type: "analog", roles: ["input"] }],
    capabilities: ["bbpll_cap1"],
    traits: [
      {
        type: "implied_passives",
        params: {
          purpose: "BBPLL loop filter",
          components: [{ kind: "capacitor", value: "10 nF", connection: "CAP1 in series to GND" }],
          source: "ESP32 Series Datasheet v5.2, Table 2-1 (verbatim: 'Connects to a 10 nF series capacitor to ground')",
        },
      },
    ],
  },

  {
    ...Ground({ id: "pin_49", name: "GND", pin: 49, maxCurrentA: 1.2 }),
    traits: [
      {
        type: "current_rating_basis",
        params: {
          note: "1.2 A is the absolute-maximum cumulative IO output current (Table 5-1), returned through the exposed pad — not a recommended operating point.",
        },
      },
      {
        type: "net_shareable",
        params: { net: "gnd", policy: "single_ground_instance_may_serve_all_members" },
      },
      {
        type: "assembly_requirement",
        params: {
          note: "The exposed pad is the only ground return and the primary heat path — solder to the PCB ground plane with a via array.",
          source: "ESP32 Hardware Design Guidelines",
        },
      },
    ],
  },
];

/** All 49 pads, sorted into physical package order — schematic-honest. */
const pins: InterfaceDef[] = [...powerAndServicePads, ...gpioPads].sort(
  (a, b) => Number(a.pin ?? 0) - Number(b.pin ?? 0),
);

// ---------------------------------------------------------------------------
// Peripheral controllers
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

/** Table 4-4: calibrated effective measurement ranges per attenuation setting. */
const ADC_ATTENUATION_TRAIT: TraitDef = {
  type: "adc_attenuation_ranges",
  params: {
    source: "ESP32 Series Datasheet v5.2, Table 4-4 (after eFuse-Vref calibration)",
    ranges: [
      { atten: 0, effective_range_mV: [100, 950], total_error_mV: 23 },
      { atten: 1, effective_range_mV: [100, 1250], total_error_mV: 30 },
      { atten: 2, effective_range_mV: [150, 1750], total_error_mV: 40 },
      { atten: 3, effective_range_mV: [150, 2450], total_error_mV: 60 },
    ],
    note: "Above ~2450 mV (raw reading > 3000) at atten 3, accuracy degrades beyond the table (Table 4-3 note). ±6% chip-to-chip spread before calibration.",
  },
};

const adc1 = composed({
  id: "adc1",
  name: "ADC1",
  protocolType: "analog",
  roles: ["input"],
  parameters: [
    resolutionBits(12),
    voltageRangeV(0.1, 2.45), // widest calibrated effective range (atten 3)
    { id: "sample_rate", name: "Sampling rate (DIG controller)", unit: "Hz", value: 2_000_000 },
    { id: "sample_rate_rtc", name: "Sampling rate (RTC controller)", unit: "Hz", value: 200_000 },
  ],
  slots: [
    { id: "channel", required: true, count: 8, match: { protocol: "analog", role: "input", capability: "adc1_in" } },
  ],
  profiles: [
    {
      id: "adc1_channels",
      label: "ADC1_CH0-CH7 (fixed analog pads)",
      bindings: {
        channel: ["pin_5", "pin_6", "pin_7", "pin_8", "pin_12", "pin_13", "pin_10", "pin_11"],
      },
    },
  ],
  maxInstances: 1,
  traits: [
    ADC_ATTENUATION_TRAIT,
    { type: "channels", params: { count: 8, mapping: "CH0=SENSOR_VP, CH1=SENSOR_CAPP, CH2=SENSOR_CAPN, CH3=SENSOR_VN, CH4=32K_XP, CH5=32K_XN, CH6=VDET_1, CH7=VDET_2" } },
    { type: "low_power_capable", params: { note: "Usable by the ULP coprocessor during sleep (RTC controller, ≤200 ksps)." } },
  ],
});

const adc2 = composed({
  id: "adc2",
  name: "ADC2",
  protocolType: "analog",
  roles: ["input"],
  parameters: [
    resolutionBits(12),
    voltageRangeV(0.1, 2.45),
    { id: "sample_rate", name: "Sampling rate (DIG controller)", unit: "Hz", value: 2_000_000 },
    { id: "sample_rate_rtc", name: "Sampling rate (RTC controller)", unit: "Hz", value: 200_000 },
  ],
  slots: [
    { id: "channel", required: true, count: 10, match: { protocol: "analog", role: "input", capability: "adc2_in" } },
  ],
  profiles: [
    {
      id: "adc2_channels",
      label: "ADC2_CH0-CH9 (fixed analog pads)",
      bindings: {
        channel: ["pin_24", "pin_23", "pin_22", "pin_21", "pin_20", "pin_18", "pin_17", "pin_16", "pin_14", "pin_15"],
      },
    },
  ],
  maxInstances: 1,
  traits: [
    ADC_ATTENUATION_TRAIT,
    { type: "channels", params: { count: 10, mapping: "CH0=GPIO4, CH1=GPIO0, CH2=GPIO2, CH3=MTDO, CH4=MTCK, CH5=MTDI, CH6=MTMS, CH7=GPIO27, CH8=GPIO25, CH9=GPIO26" } },
    {
      // The canonical co-requirement example: a second converter instance
      // exists, but it is conditioned on the radio being idle.
      type: "co_requirement",
      params: {
        with: "wifi_radio",
        condition: "Wi-Fi active",
        effect: "ADC2 is used by the Wi-Fi driver and cannot be read while Wi-Fi is active — schedule reads when the radio is idle, or use ADC1.",
        source: "ESP32 TRM (On-Chip Sensors); Datasheet Table 4-3 specifies ADC characteristics with 'Wi-Fi & Bluetooth off'",
      },
    },
  ],
});

const dac = composed({
  id: "dac",
  name: "DAC",
  protocolType: "analog",
  roles: ["output"],
  parameters: [resolutionBits(8), voltageRangeV(0, 3.3)],
  slots: [
    { id: "channel", required: true, count: 2, match: { protocol: "analog", role: "output", capability: "dac_out" } },
  ],
  profiles: [
    { id: "dac_channels", label: "DAC_1 (GPIO25) / DAC_2 (GPIO26)", bindings: { channel: ["pin_14", "pin_15"] } },
  ],
  maxInstances: 1,
  traits: [
    { type: "channels", params: { count: 2, mapping: "DAC_1=GPIO25, DAC_2=GPIO26", note: "Independent conversions; supply-referenced (VDD as reference)." } },
  ],
});

const touch = composed({
  id: "touch",
  name: "Capacitive Touch Sensor",
  protocolType: "capacitive_touch",
  roles: ["input"],
  slots: [{ id: "channel", required: true, count: 10, match: { capability: "touch" } }],
  profiles: [
    {
      id: "touch_channels",
      label: "T0-T9 (fixed analog pads)",
      bindings: {
        channel: ["pin_24", "pin_23", "pin_22", "pin_21", "pin_20", "pin_18", "pin_17", "pin_16", "pin_13", "pin_12"],
      },
    },
  ],
  maxInstances: 1,
  traits: [
    { type: "channels", params: { count: 10, mapping: "T0=GPIO4, T1=GPIO0, T2=GPIO2, T3=MTDO, T4=MTCK, T5=MTDI, T6=MTMS, T7=GPIO27, T8=32K_XN, T9=32K_XP" } },
    {
      type: "qualification_note",
      params: {
        note: "The ESP32 touch sensor has not passed the Conducted Susceptibility (CS) test and thus has limited application scenarios.",
        source: "ESP32 Series Datasheet v5.2, Section 4.10 note",
      },
    },
  ],
});

const rtcGpio = composed({
  id: "rtc_gpio",
  name: "RTC GPIO",
  protocolType: "digital",
  roles: ["input", "output"],
  slots: [{ id: "channel", required: true, count: 18, match: { capability: "rtc_gpio" } }],
  profiles: [
    {
      id: "rtc_gpio_channels",
      label: "RTC_GPIO0-17",
      bindings: {
        channel: [
          "pin_5", "pin_6", "pin_7", "pin_8", "pin_10", "pin_11", // RTC_GPIO0-5
          "pin_14", "pin_15", "pin_13", "pin_12",                  // RTC_GPIO6-9
          "pin_24", "pin_23", "pin_22", "pin_21", "pin_20", "pin_18", "pin_17", "pin_16", // RTC_GPIO10-17
        ],
      },
    },
  ],
  maxInstances: 1,
  traits: [
    { type: "channels", params: { count: 18, note: "VDD3P3_RTC-domain pads that stay functional in Deep-sleep — e.g. as wake-up sources (Appendix A.1 note 5)." } },
  ],
});

// I²C — two controllers; pins route to any output-capable GPIO via the GPIO
// matrix (Table 4-6: "Any GPIO Pins"). No IO_MUX default exists — the
// GPIO21/GPIO22 pairing seen on dev boards is an SDK convention, not silicon.
const I2C_TRAITS: TraitDef[] = [
  { type: "display_notation", params: { latex: "I^{2}C" } },
  {
    type: "instance_combinations",
    params: {
      instances_in_silicon: 2,
      routing: "gpio_matrix",
      combination_space: "SDA: any output-capable GPIO (open-drain needs a driver); SCL: any output-capable GPIO.",
      note: "No IO_MUX default pins. GPIO21/GPIO22 is an ESP-IDF/Arduino convention only.",
    },
  },
  {
    type: "implied_passives",
    params: {
      purpose: "Open-drain bus pull-ups",
      components: [{ kind: "resistor", value: "typ. 2.2-10 kΩ (bus-speed dependent)", connection: "SDA and SCL to the bus supply" }],
      source: "I²C bus specification; datasheet notes speeds >400 kbit/s are 'constrained by SDA pull-up strength'",
    },
  },
];

const i2c0 = amend(
  I2C({ id: "i2c0", instance: 0, name: "I²C0", roles: ["master", "slave"], clockFreqHz: [100_000, 5_000_000], maxInstances: 1 }),
  "i2c0",
  I2C_TRAITS,
);
const i2c1 = amend(
  I2C({ id: "i2c1", instance: 1, name: "I²C1", roles: ["master", "slave"], clockFreqHz: [100_000, 5_000_000], maxInstances: 1 }),
  "i2c1",
  I2C_TRAITS,
);

// SPI0/SPI1 — the flash bus. SPI0 is the cache controller, SPI1 the user
// master on the same pins; both are pinned to the SD_* pads via IO_MUX.
const qspiFlash = composed({
  id: "spi01_flash",
  name: "SPI0/SPI1 Flash Bus",
  protocolType: "spi",
  roles: ["master"],
  parameters: [clockFreqHz([0, 80_000_000])],
  slots: [
    { id: "sck", required: true, match: { protocol: "spi", role: "clock", capability: "spi01_clk" } },
    { id: "cs", required: true, match: { protocol: "spi", role: "select", capability: "spi01_cs0" } },
    { id: "io0", required: true, match: { protocol: "spi", role: "data_out", capability: "spi01_d" } },
    { id: "io1", required: true, match: { protocol: "spi", role: "data_in", capability: "spi01_q" } },
    { id: "io2", required: false, match: { capability: "spi01_wp" } },
    { id: "io3", required: false, match: { capability: "spi01_hd" } },
  ],
  profiles: [
    {
      id: "spi01_flash_iomux",
      label: "Off-package flash wiring (Table 2-6)",
      default_active: true,
      bindings: {
        sck: "pin_31",  // SPICLK  -> flash CLK
        cs: "pin_30",   // SPICS0  -> flash CS#
        io0: "pin_33",  // SPID    -> flash IO0/DI
        io1: "pin_32",  // SPIQ    -> flash IO1/DO
        io2: "pin_29",  // SPIWP   -> flash IO2/WP#
        io3: "pin_28",  // SPIHD   -> flash IO3/HOLD#
      },
    },
  ],
  maxInstances: 1,
  defaultActive: true,
  traits: [
    { type: "spi_modes", params: { modes: ["Standard SPI", "Dual SPI", "Quad SPI"], note: "Connects external flash and SRAM (Section 4.10 'Parallel QSPI')." } },
    {
      type: "instance_combinations",
      params: {
        instances_in_silicon: 1,
        routing: "io_mux_fixed",
        combination_space: "Exactly one pin set — the flash bus is not matrix-routable.",
      },
    },
  ],
});

const SPI_USER_TRAITS = (busName: string, iomux: string): TraitDef[] => [
  {
    type: "instance_combinations",
    params: {
      instances_in_silicon: 1,
      routing: "io_mux_preferred",
      combination_space: `IO_MUX pins (${iomux}) reach full speed; per the ESP32 TRM the ${busName} signals may also route through the GPIO matrix to other pins at reduced clock (≤40 MHz).`,
      source: "Datasheet Section 4.8.2; ESP32 TRM, SPI Controller chapter",
    },
  },
];

const hspi = amend(
  SPI({
    id: "hspi",
    name: "HSPI (SPI2)",
    roles: ["master", "slave"],
    clockFreqHz: [0, 80_000_000],
    maxInstances: 1,
    profiles: [
      { id: "hspi_iomux", label: "HSPI IO_MUX (GPIO12-15)", mosi: "pin_20", miso: "pin_18", sck: "pin_17", ss: "pin_21" },
    ],
  }),
  "hspi",
  SPI_USER_TRAITS("HSPI", "GPIO2, GPIO4, GPIO12-15"),
);

const vspi = amend(
  SPI({
    id: "vspi",
    name: "VSPI (SPI3)",
    roles: ["master", "slave"],
    clockFreqHz: [0, 80_000_000],
    maxInstances: 1,
    profiles: [
      { id: "vspi_iomux", label: "VSPI IO_MUX (GPIO5, 18, 19, 23)", mosi: "pin_36", miso: "pin_38", sck: "pin_35", ss: "pin_34" },
    ],
  }),
  "vspi",
  SPI_USER_TRAITS("VSPI", "GPIO5, GPIO18-19, GPIO21-23"),
);

// UARTs — three controllers, any GPIO via the GPIO matrix; the profiles below
// are the IO_MUX (full-speed, default) routings from Table 2-1.
const UART_TRAITS = (n: number, iomuxNote: string): TraitDef[] => [
  {
    type: "instance_combinations",
    params: {
      instances_in_silicon: 1,
      routing: "gpio_matrix",
      combination_space: "RX/CTS: any GPIO (input path); TX/RTS: any output-capable GPIO.",
      iomux_default: iomuxNote,
      source: "ESP32 Series Datasheet v5.2, Section 4.8.3 / Table 2-1",
    },
  },
  ...(n === 1
    ? [{
        type: "co_requirement",
        params: {
          with: "spi01_flash",
          condition: "UART1 on its IO_MUX pins (GPIO9/GPIO10)",
          effect: "The UART1 IO_MUX pins are the flash SPIHD/SPIWP pads — on any flash-booting design UART1 must be matrix-routed to other pins.",
        },
      } satisfies TraitDef]
    : []),
];

const uart0 = amend(
  UART({
    id: "uart0",
    name: "UART0",
    roles: ["host", "device"],
    baudRate: [0, 5_000_000],
    maxInstances: 1,
    profiles: [
      { id: "uart0_iomux", label: "UART0 IO_MUX (GPIO1/3, RTS GPIO22, CTS GPIO19)", rx: "pin_40", tx: "pin_41", rts: "pin_39", cts: "pin_38" },
    ],
  }),
  "uart0",
  [
    ...UART_TRAITS(0, "U0RXD=GPIO3 (pin 40), U0TXD=GPIO1 (pin 41), U0RTS=GPIO22, U0CTS=GPIO19"),
    { type: "boot_console", params: { note: "UART0 is the ROM bootloader console: flashing uses U0RXD/U0TXD; boot log printing on U0TXD is controlled by the MTDO strap." } },
  ],
);

const uart1 = amend(
  UART({
    id: "uart1",
    name: "UART1",
    roles: ["host", "device"],
    baudRate: [0, 5_000_000],
    maxInstances: 1,
    profiles: [
      { id: "uart1_iomux", label: "UART1 IO_MUX (GPIO9/10, RTS GPIO11, CTS GPIO6 — conflicts with flash)", rx: "pin_28", tx: "pin_29", rts: "pin_30", cts: "pin_31" },
    ],
  }),
  "uart1",
  UART_TRAITS(1, "U1RXD=GPIO9 (pin 28), U1TXD=GPIO10 (pin 29), U1RTS=GPIO11, U1CTS=GPIO6"),
);

const uart2 = amend(
  UART({
    id: "uart2",
    name: "UART2",
    roles: ["host", "device"],
    baudRate: [0, 5_000_000],
    maxInstances: 1,
    profiles: [
      { id: "uart2_iomux", label: "UART2 IO_MUX (GPIO16/17, RTS GPIO7, CTS GPIO8)", rx: "pin_25", tx: "pin_27", rts: "pin_32", cts: "pin_33" },
    ],
  }),
  "uart2",
  UART_TRAITS(2, "U2RXD=GPIO16 (pin 25), U2TXD=GPIO17 (pin 27), U2RTS=GPIO7, U2CTS=GPIO8"),
);

/** Matrix-routed peripheral helper: signals reach any eligible GPIO. */
function matrixPeripheral(config: {
  id: string;
  name: string;
  protocolType: string;
  roles: string[];
  slots: SlotDef[];
  maxInstances: number;
  parameters?: Parameter[];
  traits?: TraitDef[];
}): InterfaceDef {
  return composed({ ...config });
}

const i2sTraits = (n: number): TraitDef[] => [
  {
    type: "instance_combinations",
    params: {
      instances_in_silicon: 2,
      routing: "gpio_matrix",
      combination_space: "All I2S signals route to any eligible GPIO via the GPIO matrix.",
      source: "ESP32 Series Datasheet v5.2, Section 4.8.5",
    },
  },
  {
    type: "operating_modes",
    params: {
      modes: ["master", "slave", "full-duplex", "half-duplex", "PDM in/out", ...(n === 0 ? ["parallel LCD data output", "parallel camera data input"] : ["parallel LCD data output"])],
      source: "ESP32 Series Datasheet v5.2, Section 4.8.5 / Table 4-6",
    },
  },
];

const i2s0 = matrixPeripheral({
  id: "i2s0",
  name: "I²S0",
  protocolType: "i2s",
  roles: ["master", "slave"],
  slots: [
    { id: "bck", required: false, match: { capability: "matrix_out" } },
    { id: "ws", required: false, match: { capability: "matrix_out" } },
    { id: "data_out", required: false, match: { capability: "matrix_out" } },
    { id: "data_in", required: false, match: { capability: "matrix_in" } },
    { id: "mclk", required: false, label: "I2S0_CLK", match: { capability: "clk_out" } },
  ],
  maxInstances: 1,
  traits: [...i2sTraits(0), { type: "display_notation", params: { latex: "I^{2}S0" } }],
});

const i2s1 = matrixPeripheral({
  id: "i2s1",
  name: "I²S1",
  protocolType: "i2s",
  roles: ["master", "slave"],
  slots: [
    { id: "bck", required: false, match: { capability: "matrix_out" } },
    { id: "ws", required: false, match: { capability: "matrix_out" } },
    { id: "data_out", required: false, match: { capability: "matrix_out" } },
    { id: "data_in", required: false, match: { capability: "matrix_in" } },
  ],
  maxInstances: 1,
  traits: [...i2sTraits(1), { type: "display_notation", params: { latex: "I^{2}S1" } }],
});

const ledc = matrixPeripheral({
  id: "ledc",
  name: "LED PWM Controller (LEDC)",
  protocolType: "pwm",
  roles: ["output"],
  parameters: [
    { id: "resolution", name: "Max duty-cycle resolution", unit: "dimensionless", value: 20 },
  ],
  slots: [
    { id: "channel", required: false, count: 16, match: { protocol: "pwm", role: "output", capability: "pwm_out" } },
  ],
  maxInstances: 1,
  traits: [
    {
      type: "channels",
      params: {
        count: 16,
        detail: "Eight high-speed (ledc_hs_sig_out0-7, 80 MHz clock) + eight low-speed (ledc_ls_sig_out0-7) generators sharing eight 20-bit timers.",
        source: "ESP32 Series Datasheet v5.2, Section 4.8.8 / Table 4-6",
      },
    },
    {
      type: "instance_combinations",
      params: { instances_in_silicon: 1, routing: "gpio_matrix", combination_space: "Any output-capable GPIO per channel." },
    },
  ],
});

const mcpwmTraits: TraitDef[] = [
  {
    type: "channels",
    params: {
      count: 6,
      detail: "Three PWM operators generating waveform pairs (six outputs), three fault-detection inputs, three sync inputs, three 32-bit capture channels.",
      source: "ESP32 Series Datasheet v5.2, Section 4.8.9",
    },
  },
  {
    type: "instance_combinations",
    params: { instances_in_silicon: 2, routing: "gpio_matrix", combination_space: "Any output-capable GPIO for outputs; any GPIO for fault/sync/capture inputs." },
  },
];

function mcpwm(n: 0 | 1): InterfaceDef {
  return matrixPeripheral({
    id: `mcpwm${n}`,
    name: `Motor Control PWM ${n} (MCPWM${n})`,
    protocolType: "pwm",
    roles: ["output"],
    slots: [
      { id: "pwm_out", required: false, count: 6, match: { protocol: "pwm", role: "output", capability: "pwm_out" } },
      { id: "fault_in", required: false, count: 3, match: { capability: "matrix_in" } },
      { id: "sync_in", required: false, count: 3, match: { capability: "matrix_in" } },
      { id: "capture_in", required: false, count: 3, match: { capability: "matrix_in" } },
    ],
    maxInstances: 1,
    traits: mcpwmTraits,
  });
}

const pcnt = matrixPeripheral({
  id: "pcnt",
  name: "Pulse Counter (PCNT)",
  protocolType: "pulse_counter",
  roles: ["input"],
  slots: [
    { id: "sig_in", required: false, count: 16, match: { capability: "matrix_in" } },
    { id: "ctrl_in", required: false, count: 16, match: { capability: "matrix_in" } },
  ],
  maxInstances: 1,
  traits: [
    {
      type: "channels",
      params: {
        count: 8,
        detail: "Eight units; each has a 16-bit signed counter and two channels (signal + control input each), with glitch filtering.",
        source: "ESP32 Series Datasheet v5.2, Section 4.8.7 / Table 4-6",
      },
    },
    { type: "instance_combinations", params: { instances_in_silicon: 8, routing: "gpio_matrix", combination_space: "Any GPIO per input." } },
  ],
});

const rmt = matrixPeripheral({
  id: "rmt",
  name: "Remote Control Peripheral (RMT)",
  protocolType: "rmt",
  roles: ["input", "output"],
  slots: [
    { id: "sig_in", required: false, count: 8, match: { capability: "matrix_in" } },
    { id: "sig_out", required: false, count: 8, match: { capability: "matrix_out" } },
  ],
  maxInstances: 1,
  traits: [
    {
      type: "channels",
      params: { count: 8, detail: "Eight channels, each with independent TX and RX for infrared or generic pulse trains.", source: "ESP32 Series Datasheet v5.2, Section 4.8.6" },
    },
    { type: "instance_combinations", params: { instances_in_silicon: 1, routing: "gpio_matrix", combination_space: "Any GPIO (in) / any output-capable GPIO (out) per channel." } },
  ],
});

const twai = matrixPeripheral({
  id: "twai",
  name: "TWAI (CAN 2.0)",
  protocolType: "twai",
  roles: ["controller"],
  parameters: [
    // Chip revisions v0.0/v1.0/v1.1 (this part): 25 kbit/s floor. Only the
    // -V3 revision extends down to 12.5 kbit/s.
    { id: "bit_rate", unit: "Hz", range: [25_000, 1_000_000] },
  ],
  slots: [
    { id: "rx", required: true, match: { capability: "matrix_in" } },
    { id: "tx", required: true, match: { capability: "matrix_out" } },
    { id: "bus_off_on", required: false, match: { capability: "matrix_out" } },
    { id: "clkout", required: false, match: { capability: "matrix_out" } },
  ],
  maxInstances: 1,
  traits: [
    {
      // The canonical instances-vs-combinations example: one controller in
      // silicon, a huge matrix-routing combination space.
      type: "instance_combinations",
      params: {
        instances_in_silicon: 1,
        routing: "gpio_matrix",
        combination_space: "RX: any of the 34 GPIOs; TX: any of the 28 output-capable GPIOs. Combinations are plentiful — simultaneous instances are exactly one.",
        source: "ESP32 Series Datasheet v5.2, Section 4.8.12 / Table 4-6",
      },
    },
    {
      type: "protocol_compliance",
      params: { standard: "ISO 11898-1 (CAN Specification 2.0)", frames: ["standard 11-bit", "extended 29-bit"], note: "Requires an external CAN transceiver to drive the bus." },
    },
  ],
});

const sdioHost = composed({
  id: "sdio_host",
  name: "SD/SDIO/MMC Host Controller",
  protocolType: "sdio",
  roles: ["host"],
  parameters: [clockFreqHz([0, 80_000_000])],
  slots: [
    { id: "clk", required: true, match: { capability: "sdio_host_clk" } },
    { id: "cmd", required: true, match: { capability: "sdio_host_cmd" } },
    { id: "data0", required: true, match: { capability: "sdio_host_data0" } },
    { id: "data1", required: false, match: { capability: "sdio_host_data1" } },
    { id: "data2", required: false, match: { capability: "sdio_host_data2" } },
    { id: "data3", required: false, match: { capability: "sdio_host_data3" } },
    { id: "data4", required: false, match: { capability: "sdio_host_data4" } },
    { id: "data5", required: false, match: { capability: "sdio_host_data5" } },
    { id: "data6", required: false, match: { capability: "sdio_host_data6" } },
    { id: "data7", required: false, match: { capability: "sdio_host_data7" } },
    { id: "strobe", required: false, match: { capability: "sdio_host_strobe" } },
  ],
  profiles: [
    {
      id: "sdio_host_hs1",
      label: "Port 1 (HS1_*): up to 8-bit + strobe",
      bindings: {
        clk: "pin_31", cmd: "pin_30",
        data0: "pin_32", data1: "pin_33", data2: "pin_28", data3: "pin_29",
        data4: "pin_25", data5: "pin_27", data6: "pin_34", data7: "pin_35",
        strobe: "pin_36",
      },
    },
    {
      id: "sdio_host_hs2",
      label: "Port 2 (HS2_*): up to 4-bit",
      bindings: {
        clk: "pin_17", cmd: "pin_21",
        data0: "pin_22", data1: "pin_24", data2: "pin_18", data3: "pin_20",
      },
    },
  ],
  maxInstances: 2,
  traits: [
    {
      type: "protocol_compliance",
      params: {
        standards: ["SD Memory Card 3.0/3.01", "SDIO 3.0", "CE-ATA 1.1", "MMC 4.41", "eMMC 4.5/4.51"],
        note: "Up to 80 MHz clock output; 1-/4-/8-bit bus modes; two SD/SDIO/MMC 4.41 cards in 4-bit mode; one SD card at 1.8 V.",
        source: "ESP32 Series Datasheet v5.2, Section 4.8.10",
      },
    },
    {
      type: "instance_combinations",
      params: {
        instances_in_silicon: 1,
        routing: "io_mux_fixed",
        combination_space: "Two fixed IO_MUX port mappings (HS1_*, HS2_*); slots do not mix across ports.",
      },
    },
    {
      type: "co_requirement",
      params: {
        with: "spi01_flash",
        condition: "Port 1 (HS1) in use",
        effect: "HS1_CLK/CMD/DATA0-3 are the external-flash pads — port 1 conflicts with a flash-booting design.",
      },
    },
  ],
});

const sdioSlave = composed({
  id: "sdio_slave",
  name: "SDIO/SPI Slave Controller",
  protocolType: "sdio",
  roles: ["device"],
  parameters: [clockFreqHz([0, 50_000_000])],
  slots: [
    { id: "clk", required: true, match: { capability: "sdio_slave_clk" } },
    { id: "cmd", required: true, match: { capability: "sdio_slave_cmd" } },
    { id: "data0", required: false, match: { capability: "sdio_slave_data0" } },
    { id: "data1", required: false, match: { capability: "sdio_slave_data1" } },
    { id: "data2", required: false, match: { capability: "sdio_slave_data2" } },
    { id: "data3", required: false, match: { capability: "sdio_slave_data3" } },
  ],
  profiles: [
    {
      id: "sdio_slave_mt",
      label: "SD_* on MTMS/MTDO/GPIO2/GPIO4/MTDI/MTCK",
      bindings: { clk: "pin_17", cmd: "pin_21", data0: "pin_22", data1: "pin_24", data2: "pin_18", data3: "pin_20" },
    },
    {
      id: "sdio_slave_sd",
      label: "SD_* on GPIO6-11 (flash pads)",
      bindings: { clk: "pin_31", cmd: "pin_30", data0: "pin_32", data1: "pin_33", data2: "pin_28", data3: "pin_29" },
    },
  ],
  maxInstances: 1,
  traits: [
    {
      type: "protocol_compliance",
      params: {
        standards: ["SDIO Card Specification 2.0"],
        note: "SPI, 1-bit SDIO and 4-bit SDIO transfer modes, 0-50 MHz; DMA to shared memory.",
        source: "ESP32 Series Datasheet v5.2, Section 4.8.11",
      },
    },
    {
      type: "co_requirement",
      params: {
        with: "pin_21, pin_34",
        condition: "SDIO slave in use",
        effect: "The MTDO and GPIO5 straps set the SDIO-slave sampling/driving clock edge at boot (Section 3).",
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
    { id: "tms", required: true, match: { capability: "jtag_tms" } },
    { id: "tck", required: true, match: { capability: "jtag_tck" } },
    { id: "tdi", required: true, match: { capability: "jtag_tdi" } },
    { id: "tdo", required: true, match: { capability: "jtag_tdo" } },
  ],
  profiles: [
    { id: "jtag_iomux", label: "MTMS/MTCK/MTDI/MTDO", bindings: { tms: "pin_17", tck: "pin_20", tdi: "pin_18", tdo: "pin_21" } },
  ],
  maxInstances: 1,
  traits: [
    { type: "configuration_note", params: { note: "eFuse EFUSE_DISABLE_JTAG permanently disables JTAG (one-time programmable).", source: "ESP32 Series Datasheet v5.2, Section 3" } },
  ],
});

const ethernetMac = composed({
  id: "ethernet_mac",
  name: "Ethernet MAC (MII/RMII)",
  protocolType: "ethernet_mac",
  roles: ["controller"],
  slots: [
    // Common to both PHY interfaces (IO_MUX-fixed):
    { id: "txd0", required: true, match: { capability: "emac_txd0" } },
    { id: "txd1", required: true, match: { capability: "emac_txd1" } },
    { id: "tx_en", required: true, match: { capability: "emac_tx_en" } },
    { id: "rxd0", required: true, match: { capability: "emac_rxd0" } },
    { id: "rxd1", required: true, match: { capability: "emac_rxd1" } },
    { id: "rx_dv", required: true, label: "RX_DV (MII) / CRS_DV (RMII)", match: { capability: "emac_rx_dv" } },
    { id: "tx_clk", required: false, label: "TX_CLK (MII) / REF_CLK (RMII)", match: { capability: "emac_tx_clk" } },
    // MII-only:
    { id: "rx_clk", required: false, match: { capability: "emac_rx_clk" } },
    { id: "txd2", required: false, match: { capability: "emac_txd2" } },
    { id: "txd3", required: false, match: { capability: "emac_txd3" } },
    { id: "rxd2", required: false, match: { capability: "emac_rxd2" } },
    { id: "rxd3", required: false, match: { capability: "emac_rxd3" } },
    { id: "rx_er", required: false, match: { capability: "emac_rx_er" } },
    { id: "tx_er", required: false, match: { capability: "emac_tx_er" } },
    // Clock outputs / management (management routes via GPIO matrix):
    { id: "clk_out", required: false, match: { capability: "emac_clk_out" } },
    { id: "clk_out_180", required: false, match: { capability: "emac_clk_out_180" } },
    { id: "mdc", required: false, match: { capability: "matrix_out" } },
    { id: "mdio", required: false, match: { capability: "matrix_out" } },
  ],
  profiles: [
    {
      id: "emac_mii",
      label: "MII (17 signals)",
      bindings: {
        tx_clk: "pin_23", rx_clk: "pin_34", tx_en: "pin_42",
        txd0: "pin_38", txd1: "pin_39", txd2: "pin_17", txd3: "pin_18",
        rx_er: "pin_20", rx_dv: "pin_16",
        rxd0: "pin_14", rxd1: "pin_15", rxd2: "pin_41", rxd3: "pin_21",
        tx_er: "pin_24",
      },
    },
    {
      id: "emac_rmii",
      label: "RMII (9 signals)",
      bindings: {
        tx_clk: "pin_23", // 50 MHz REF_CLK in, or CLK_OUT with internal PLL
        tx_en: "pin_42",
        txd0: "pin_38", txd1: "pin_39",
        rx_dv: "pin_16", // CRS_DV
        rxd0: "pin_14", rxd1: "pin_15",
      },
    },
  ],
  maxInstances: 1,
  traits: [
    {
      type: "protocol_compliance",
      params: {
        standard: "IEEE 802.3-2008 MAC",
        features: ["MII and RMII PHY interfaces", "half/full duplex", "hardware PTP (IEEE 1588-2008)", "25 MHz/50 MHz clock output"],
        source: "ESP32 Series Datasheet v5.2, Section 4.8.13",
      },
    },
    {
      type: "co_requirement",
      params: {
        with: "external PHY",
        condition: "always",
        effect: "The MAC has no PHY — an external MII (17-signal) or RMII (9-signal) PHY plus its clock scheme is required. MDC/MDIO/CRS/COL are slow signals routable to any GPIO via the matrix.",
        source: "ESP32 Series Datasheet v5.2, Section 4.8.13 / Appendix A.1 note 11",
      },
    },
  ],
});

const clockOutput = composed({
  id: "clock_output",
  name: "Clock Output",
  protocolType: "clock",
  roles: ["output"],
  slots: [{ id: "out", required: true, match: { protocol: "clock", role: "output", capability: "clk_out" } }],
  profiles: [
    { id: "clk_out1", label: "CLK_OUT1 (GPIO0)", bindings: { out: "pin_23" } },
    { id: "clk_out2", label: "CLK_OUT2 (GPIO3)", bindings: { out: "pin_40" } },
    { id: "clk_out3", label: "CLK_OUT3 (GPIO1)", bindings: { out: "pin_41" } },
  ],
  maxInstances: 3,
  traits: [
    { type: "instance_combinations", params: { instances_in_silicon: 3, routing: "io_mux_fixed", combination_space: "CLK_OUT1/2/3 are IO_MUX-fixed to GPIO0/GPIO3/GPIO1." } },
  ],
});

const xtalMain = composed({
  id: "xtal_main",
  name: "Main Crystal Oscillator",
  protocolType: "clock",
  roles: ["input"],
  parameters: [clockFreqHz([2_000_000, 60_000_000])],
  slots: [
    { id: "xp", required: true, match: { protocol: "clock", role: "input", capability: "xtal_p" } },
    { id: "xn", required: true, match: { protocol: "clock", role: "output", capability: "xtal_n" } },
  ],
  profiles: [
    { id: "xtal_pins", label: "XTAL_P/XTAL_N (pins 45/44)", default_active: true, bindings: { xp: "pin_45", xn: "pin_44" } },
  ],
  maxInstances: 1,
  defaultActive: true,
  traits: [
    {
      type: "co_requirement",
      params: {
        with: "wifi_radio, bluetooth_radio",
        condition: "RF in use",
        effect: "The external crystal may be 2-60 MHz, but Wi-Fi/Bluetooth functionality requires exactly 40 MHz.",
        source: "ESP32 Series Datasheet v5.2, Section 'Clocking' (External 2 MHz ~ 60 MHz crystal oscillator; 40 MHz only for Wi-Fi/Bluetooth functionality)",
      },
    },
    {
      type: "implied_passives",
      params: {
        purpose: "Crystal load",
        components: [
          { kind: "capacitor", value: "per crystal vendor C_L spec", connection: "XTAL_P to GND" },
          { kind: "capacitor", value: "per crystal vendor C_L spec", connection: "XTAL_N to GND" },
        ],
        source: "ESP32 Hardware Design Guidelines",
      },
    },
  ],
});

const xtal32k = composed({
  id: "xtal_32k",
  name: "32.768 kHz RTC Crystal Oscillator",
  protocolType: "clock",
  roles: ["input"],
  parameters: [clockFreqHz(32_768)],
  slots: [
    { id: "xp", required: true, match: { capability: "xtal_32k_p" } },
    { id: "xn", required: true, match: { capability: "xtal_32k_n" } },
  ],
  profiles: [
    { id: "xtal_32k_pins", label: "32K_XP/32K_XN (GPIO32/GPIO33)", bindings: { xp: "pin_12", xn: "pin_13" } },
  ],
  maxInstances: 1,
  traits: [
    {
      type: "co_requirement",
      params: {
        with: "pin_12, pin_13",
        condition: "32 kHz crystal fitted",
        effect: "Commits GPIO32 and GPIO33 entirely — their GPIO/ADC/TOUCH functions become unavailable.",
      },
    },
    {
      type: "implied_passives",
      params: {
        purpose: "Crystal load",
        components: [
          { kind: "capacitor", value: "per crystal vendor C_L spec", connection: "32K_XP to GND" },
          { kind: "capacitor", value: "per crystal vendor C_L spec", connection: "32K_XN to GND" },
        ],
        source: "ESP32 Hardware Design Guidelines",
      },
    },
    { type: "optionality", params: { note: "Optional — the RTC slow clock can instead use the internal RC oscillator (with reduced timekeeping accuracy)." } },
  ],
});

const bbpllFilter = composed({
  id: "bbpll_loop_filter",
  name: "BBPLL Loop Filter",
  protocolType: "analog",
  roles: ["input"],
  slots: [
    { id: "cap1", required: true, match: { capability: "bbpll_cap1" } },
    { id: "cap2", required: true, match: { capability: "bbpll_cap2" } },
  ],
  profiles: [
    { id: "bbpll_pins", label: "CAP1/CAP2 (pins 48/47)", default_active: true, bindings: { cap1: "pin_48", cap2: "pin_47" } },
  ],
  maxInstances: 1,
  defaultActive: true,
});

// ---------------------------------------------------------------------------
// Radios — Datasheet Sections 4.6/4.7, Tables 5-4 through 5-9
// ---------------------------------------------------------------------------

const wifiRadio: InterfaceDef = {
  id: "wifi_radio",
  name: "Wi-Fi Radio (802.11 b/g/n, 2.4 GHz)",
  domain: "network",
  exposed: true,
  default_active: false,
  protocols: [{ type: "wifi", roles: ["station", "access_point"] }],
  capabilities: ["wifi_802_11_bgn", "wifi_2g4"],
  parameters: [
    { id: "frequency", unit: "Hz", range: [2_400_000_000, 2_484_000_000] },
    { id: "max_data_rate", name: "Max data rate (802.11n)", unit: "bit/s", value: 150_000_000 },
    { id: "max_tx_power", name: "Max TX power (802.11b)", unit: "dBm", value: 20.5 },
  ],
  traits: [
    {
      type: "radio_characteristics",
      params: {
        modes: ["802.11b", "802.11g", "802.11n MCS0-7 HT20/HT40", "802.11n MCS32 (RX)"],
        tx_current_peak_mA: { "11b_19_5dBm": 240, "11g_16dBm": 190, "11n_14dBm": 180 },
        rx_current_mA: [95, 100],
        source: "ESP32 Series Datasheet v5.2, Section 4.6 / Table 5-4",
      },
    },
    {
      type: "co_requirement",
      params: {
        with: "adc2",
        condition: "Wi-Fi active",
        effect: "ADC2 unavailable while Wi-Fi runs (shared hardware).",
      },
    },
    {
      type: "co_requirement",
      params: { with: "xtal_main", condition: "always", effect: "Requires a 40 MHz main crystal." },
    },
  ],
  bridgesTo: ["pin_2"],
};

const bluetoothRadio: InterfaceDef = {
  id: "bluetooth_radio",
  name: "Bluetooth 4.2 BR/EDR + Bluetooth LE Radio",
  domain: "network",
  exposed: true,
  default_active: false,
  protocols: [{ type: "bluetooth", roles: ["peer"] }],
  capabilities: ["bluetooth_classic", "bluetooth_le", "bluetooth_2g4"],
  parameters: [
    { id: "frequency", unit: "Hz", range: [2_402_000_000, 2_480_000_000] },
    { id: "tx_power_range", name: "RF power control range", unit: "dBm", range: [-12, 9] },
  ],
  traits: [
    {
      type: "radio_characteristics",
      params: {
        compliance: "Bluetooth v4.2 BR/EDR and Bluetooth LE",
        tx_power_classes: "Class-1, class-2 and class-3 without external PA; dynamic control range up to 21 dB",
        rx_sensitivity_dBm: { BR: -90, BLE: -94 },
        tx_current_mA: 130,
        rx_current_mA: [95, 100],
        source: "ESP32 Series Datasheet v5.2, Sections 4.7/5.7, Tables 5-7 to 5-9",
      },
    },
    {
      type: "co_requirement",
      params: { with: "xtal_main", condition: "always", effect: "Requires a 40 MHz main crystal." },
    },
  ],
  bridgesTo: ["pin_2"],
};

// ---------------------------------------------------------------------------
// Mechanical / thermal
// ---------------------------------------------------------------------------

const footprintMount: InterfaceDef = {
  id: "footprint_mounting",
  name: "QFN-48 6×6 mm Surface-Mount Footprint",
  domain: "mechanical",
  exposed: true,
  default_active: true,
  protocols: [{ type: "mechanical_connection", roles: ["mounting_point"] }],
  capabilities: ["qfn48_6x6_0p4mm", "surface_mount"],
};

const thermalPad: InterfaceDef = {
  id: "thermal_pad",
  name: "Exposed Thermal Pad",
  pin: 49,
  domain: "thermal",
  exposed: true,
  default_active: true,
  protocols: [{ type: "thermal_connection", roles: ["thermal_source"] }],
  capabilities: ["heat_sink", "pcb_thermal_plane"],
  traits: [
    { type: "assembly_requirement", params: { note: "Same physical pad as pin 49 (GND); primary heat path to the PCB ground plane." } },
  ],
};

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

export const ESP32D0WDQ6: ModuleDef = defineModule({
  id: "esp32-d0wdq6",
  name: "Espressif ESP32-D0WDQ6",
  version: "2.0.0",
  manufacturer: "Espressif Systems",
  part_number: "ESP32-D0WDQ6",
  description:
    "Bare ESP32-D0WDQ6 SoC (chip revision v1.0/v1.1) in a QFN-48 6×6 mm package: dual-core Xtensa LX6 up to 240 MHz, 448 KB ROM, 520 KB SRAM, 2.4 GHz Wi-Fi 802.11 b/g/n and Bluetooth 4.2 BR/EDR + LE. No in-package flash — external SPI flash is required for normal boot. NRND (Not Recommended for New Designs) per Datasheet v5.2.",
  tags: ["esp32", "soc", "microcontroller", "wifi", "bluetooth", "ble", "xtensa-lx6", "qfn-48", "iot", "nrnd"],
  categories: ["microcontroller", "connectivity.wireless"],

  interfaces: [
    // All 49 physical pads in package order — schematic-honest.
    ...pins,

    // Analog peripherals
    adc1,
    adc2,
    dac,
    touch,
    rtcGpio,

    // Serial / bus controllers
    ...i2c0,
    ...i2c1,
    qspiFlash,
    ...hspi,
    ...vspi,
    ...uart0,
    ...uart1,
    ...uart2,
    i2s0,
    i2s1,

    // Timers / signal peripherals
    ledc,
    mcpwm(0),
    mcpwm(1),
    pcnt,
    rmt,
    twai,

    // Storage / debug / network fabric
    sdioHost,
    sdioSlave,
    jtag,
    ethernetMac,
    clockOutput,

    // Clocks and analog service networks
    xtalMain,
    xtal32k,
    bbpllFilter,

    // Radios
    wifiRadio,
    bluetoothRadio,

    // Mechanical / thermal
    footprintMount,
    thermalPad,
  ],

  interfaceGroups: [
    {
      id: "required_power_pins",
      label: "Required Power Pins",
      members: ["pin_1", "pin_3", "pin_4", "pin_19", "pin_26", "pin_37", "pin_43", "pin_46", "pin_49"],
      policy: "all_of",
    },
    {
      id: "analog_supply_common_net",
      label: "Analog Supply Pins (one decoupled net)",
      members: ["pin_1", "pin_3", "pin_4", "pin_43", "pin_46"],
      policy: "all_of",
    },
    {
      id: "boot_strapping_pins",
      label: "Boot Strapping Pins (Table 3-1)",
      members: ["pin_23", "pin_22", "pin_18", "pin_21", "pin_34"],
      policy: "all_of",
    },
    {
      id: "external_flash_pins",
      label: "External SPI Flash Pins (Table 2-6)",
      members: ["pin_28", "pin_29", "pin_30", "pin_31", "pin_32", "pin_33"],
      policy: "all_of",
    },
  ],

  requirements: [
    {
      type: "power",
      description:
        "External supply must deliver ≥0.5 A across the 3.3 V rails (Table 5-2); peak RF transmit draws 240 mA (802.11b, +19.5 dBm). VDDA/VDD3P3/VDD3P3_RTC: 2.3-3.6 V; VDD3P3_CPU: 1.8-3.6 V.",
      voltage_V: [2.3, 3.6],
      current_mA: 500,
    },
    {
      type: "interface",
      description:
        "No in-package flash: normal boot requires an external SPI flash on the SPI0/SPI1 flash bus (SPICS0/SPICLK/SPID/SPIQ, optionally SPIWP/SPIHD — Table 2-6).",
      interface_protocol: "spi",
    },
    {
      type: "interface",
      description:
        "A main crystal (or oscillator) on XTAL_P/XTAL_N is required; 40 MHz is mandatory for Wi-Fi/Bluetooth operation.",
      interface_protocol: "clock",
    },
    {
      type: "capability",
      description:
        "LNA_IN must reach a 2.4 GHz antenna through a π-matching network transforming the 30 + j10 Ω radio impedance (QFN 6×6) to the antenna's 50 Ω.",
      capability: "rf_2g4_antenna_feed",
    },
  ],

  domains: [
    {
      domain: "electrical",
      power_domains: [
        { id: "vdda_analog", name: "VDDA / VDD3P3 (analog + RF)", nominal_voltage_V: 3.3, voltage_range_V: VDD_33_RANGE, max_current_mA: 500 },
        { id: "vdd3p3_rtc", name: "VDD3P3_RTC (RTC + RTC-domain IO)", nominal_voltage_V: 3.3, voltage_range_V: VDD_33_RANGE },
        { id: "vdd3p3_cpu", name: "VDD3P3_CPU (CPU + digital IO)", nominal_voltage_V: 3.3, voltage_range_V: VDD_CPU_RANGE },
        { id: "vdd_sdio", name: "VDD_SDIO (internal SDIO-LDO output: 1.8 V or VDD3P3_RTC)", nominal_voltage_V: 3.3, voltage_range_V: VDD_SDIO_RANGE, regulation_type: "regulated" },
        { id: "gnd", name: "Ground (exposed pad)", nominal_voltage_V: 0, voltage_range_V: [0, 0], max_current_mA: 1200 },
      ],
      metadata: {
        pin_count: 49,
        package_pins: "48 perimeter pins + exposed pad",
        cpu: "Dual-core Xtensa LX6, up to 240 MHz",
        rom_KB: 448,
        sram_KB: 520,
        current_consumption: {
          tx_80211b_19_5dBm_mA: 240,
          rx_wifi_mA: "95-100",
          modem_sleep_240MHz_mA: "30-68",
          light_sleep_mA: 0.8,
        },
        absolute_max: {
          input_voltage_V: [-0.3, 3.6],
          cumulative_io_output_current_mA: 1200,
        },
        dc_characteristics: {
          V_IH: "0.75 × VDD",
          V_IL: "0.25 × VDD",
          I_OH_mA: { VDD3P3_CPU: 40, VDD3P3_RTC: 40, VDD_SDIO: 20 },
          I_OL_mA: 28,
          pull_resistors_kOhm: 45,
        },
        source: "ESP32 Series Datasheet v5.2, Tables 5-1 to 5-4",
      },
    },
    {
      domain: "mechanical",
      dimensions_mm: { length: 6, width: 6, height: 0.85 },
      metadata: {
        package_type: "QFN-48",
        pitch_mm: 0.4,
        mounting_method: "surface_mount",
        pin_1_orientation: "anti-clockwise numbering from pin 1, top view",
      },
    },
    {
      domain: "thermal",
      // Table 5-2 note 3: chips with no in-package flash/PSRAM (D0WDQ6).
      operating_temperature_C: [-40, 125],
      metadata: {
        storage_temperature_C: [-40, 150],
        primary_heat_path: "exposed_pad_to_pcb_ground_plane",
      },
    },
    {
      domain: "network",
      metadata: {
        wireless_standards: ["802.11b", "802.11g", "802.11n (HT20/HT40)", "Bluetooth 4.2 BR/EDR", "Bluetooth LE"],
        frequency_bands_ghz: [2.4],
        max_data_rate_mbps: 150,
      },
    },
  ],

  traits: [
    {
      type: "lifecycle_status",
      params: {
        status: "not_recommended_for_new_designs",
        source: "ESP32 Series Datasheet v5.2 cover page: 'ESP32-D0WDQ6 - Not Recommended for New Designs (NRND)'",
      },
    },
    { type: "chip_revision", params: { revisions: ["v1.0", "v1.1"], note: "The -V3 suffix part is the v3.0/v3.1 revision — a distinct orderable." } },
    { type: "requires_external_flash", params: { interfaceId: "spi01_flash", defaultProfile: "spi01_flash_iomux" } },
    { type: "wireless_soc", params: { radios: ["wifi_radio", "bluetooth_radio"], rfFeed: "pin_2" } },
    {
      type: "terminology_policy",
      params: {
        note: "Signal and function names in `esp32_pin_functions` traits are datasheet-verbatim and intentionally NOT normalised to a curated whitelist; canonical capability tags exist only where slot matching requires them.",
      },
    },
  ],

  artifacts: [
    {
      id: "art_datasheet",
      name: "ESP32 Series Datasheet v5.2",
      type: "datasheet",
      url: "https://www.espressif.com/sites/default/files/documentation/esp32_datasheet_en.pdf",
    },
    {
      id: "art_technical_reference",
      name: "ESP32 Technical Reference Manual",
      type: "datasheet",
      url: "https://www.espressif.com/sites/default/files/documentation/esp32_technical_reference_manual_en.pdf",
    },
    {
      id: "art_hardware_design_guidelines",
      name: "ESP32 Hardware Design Guidelines",
      type: "documentation",
      url: "https://www.espressif.com/sites/default/files/documentation/esp32_hardware_design_guidelines_en.pdf",
    },
    {
      id: "art_errata",
      name: "ESP32 Series SoC Errata",
      type: "documentation",
      url: "https://www.espressif.com/sites/default/files/documentation/eco_and_workarounds_for_bugs_in_esp32_en.pdf",
    },
    {
      id: "art_product_page",
      name: "Espressif ESP32 Product Page",
      type: "documentation",
      url: "https://www.espressif.com/en/products/socs/esp32",
    },
    {
      id: "art_snapeda",
      name: "SnapEDA Symbol and Footprint",
      type: "cad",
      url: "https://www.snapeda.com/parts/ESP32-D0WDQ6/Espressif%20Systems/view-part/?ref=digikey",
    },
    {
      id: "art_ultralibrarian",
      name: "Ultra Librarian CAD Models",
      type: "cad",
      url: "https://app.ultralibrarian.com/details/A7AAB95B-922A-11EA-B5D0-0AEBB021A1EA/Espressif-Systems/ESP32-D0WDQ6?ref=digikey",
    },
    {
      id: "art_chip_image",
      name: "ESP32-D0WDQ6 Product Photo",
      type: "custom",
      filePath: "./ProtoPart/protoparts/esp32-d0wdq6/artifacts/images/ESP32-D0WDQ6_tilted.png",
      mimeType: "image/png",
      tags: ["image", "product-photo"],
    },
  ],

  geometry: {
    xScale: 1,
    yScale: 1,
    outline: { preset: "rectangle" },
  },
});
