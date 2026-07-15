/**
 * Raspberry Pi RP2040 — datasheet-honest part definition.
 *
 * Audited from: C:\Software\ProtoPart\protoparts\rp2040\definition.json (v2.0,
 * schema 1.5.0). Primary sources cited by that definition:
 *   - RP2040 Datasheet (https://datasheets.raspberrypi.com/rp2040/rp2040-datasheet.pdf)
 *       Table 1    Pin descriptions (pin numbers, names — copied verbatim)
 *       Table 2    GPIO function table (F1 SPI, F2 UART, F3 I2C, F4 PWM, F5 SIO,
 *                  F6 PIO0, F7 PIO1, F8 CLOCK, F9 USB) — the fixed function-select
 *                  routing that replaces a full GPIO matrix on this part
 *       Table 342  PADS_BANK0:SWCLK reset state (PUE=1/PDE=0)
 *       Table 619  TESTEN reset state (internal pull-down)
 *       Table 634  Recommended supply voltages (IOVDD, DVDD, USB_VDD, ADC_AVDD)
 *       §1.4.2     Pin specifications (single ground via exposed pad, USB routing)
 *       §2.16      Crystal oscillator (XOSC, Pierce topology, 12 MHz for USB boot)
 *       §2.9.5     ADC supply sensitivity (performance compromised below 2.97 V)
 *       §3.6.2     PIO example: WS2812 LEDs
 *       §4.2-§4.5  UART (PL011), I2C (DW_apb_i2c), SPI (PL022), PWM
 *   - Hardware Design with RP2040 (decoupling, QSPI flash, BOOTSEL wiring)
 *
 * This models the BARE RP2040 CHIP (QFN-56 7×7 mm), not a Pico board: no
 * onboard flash, no USB connector, no BOOTSEL button (board-level BOOTSEL is a
 * pushbutton on QSPI_SS_N, pin 56 — there is no dedicated USB_BOOT pin).
 *
 * Architecture notes honoured by this file:
 *   - Pin-honest like a schematic: all 57 physical pads (56 perimeter + exposed
 *     ground pad) are leaf interfaces, in package order, ids "pin_N" (and
 *     "pad_gnd" for the exposed pad, keeping the ProtoPart resource id), with
 *     the datasheet pin name as the displayed name.
 *   - Every GPIO carries its verbatim function-select list (name, direction,
 *     signal class, FUNCSEL slot) in an `rp2040_pin_functions` trait — display
 *     data is separated from the canonical capability tags the matching engine
 *     needs.
 *   - Instances vs combinations: `max_instances` states how many controllers
 *     (or state machines / mux slots) exist in silicon; slots + capability tags
 *     span the honest combination space. The RP2040 has no ESP32-style GPIO
 *     matrix — every peripheral function is FUNCSEL-fixed to specific pins, so
 *     controller-specific tags (spi0_rx, uart1_tx, i2c0_sda, pwm3_a,
 *     clock_gpin0, usb_vbus_det, ...) are emitted per pin from the JSON's own
 *     function data, and profiles enumerate every silicon-valid pin group.
 *     SIO/PIO0/PIO1 reach every bank-0 GPIO — those tags are the matrix
 *     analogue here.
 *   - Co-requirements (`co_requirement` traits): external QSPI flash for XIP
 *     boot (the chip cannot run user code without it), 12 MHz crystal for the
 *     USB bootloader, VREG_VOUT→DVDD external routing, USB_VDD supplied even
 *     when USB is unused, ADC_AVDD as ADC reference/clamp rail.
 *   - Implied harness connections (`implied_passives` traits): crystal load
 *     caps, USB_DP/DM 27 Ω series terminations, ADC_AVDD ferrite-bead filter,
 *     100 nF per supply pin + 1 µF bulk per rail (all from the ProtoPart
 *     design_rules).
 *   - Shareability exemptions (`net_shareable` traits): the six IOVDD pins are
 *     one rail, the two DVDD pins are one rail, and the exposed pad is the
 *     single external ground connection.
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
  I2C,
  defineModule,
  clockFreqHz,
  resolutionBits,
} from "../../src/protocols/index.js";

// ---------------------------------------------------------------------------
// Electrical constants — ProtoPart power_domains (Datasheet Table 634 / §1.4.2)
// ---------------------------------------------------------------------------

/** IOVDD digital I/O ring: 1.8 V or 3.3 V (typical 3.3 V). Sets logic level for all GPIOs and the QSPI interface. */
const IOVDD_RANGE: [number, number] = [1.8, 3.3];
/** DVDD digital core: 1.05-1.16 V (typ 1.1 V) per Table 634. */
const DVDD_RANGE: [number, number] = [1.05, 1.16];
/** VREG_VIN input to the on-chip core LDO. */
const VREG_VIN_RANGE: [number, number] = [1.8, 3.3];
/** USB_VDD dedicated USB 1.1 PHY supply: 3.135-3.63 V (typ 3.3 V) per Table 634. */
const USB_VDD_RANGE: [number, number] = [3.135, 3.63];
/** ADC_AVDD analog supply/reference: 1.62-3.63 V (typ 3.3 V) per Table 634; performance compromised below 2.97 V (§2.9.5). */
const ADC_AVDD_RANGE: [number, number] = [1.62, 3.63];

/** ProtoPart design rule 2: per-supply-pin decoupling. */
const SUPPLY_DECOUPLING_TRAIT: TraitDef = {
  type: "implied_passives",
  params: {
    purpose: "Supply decoupling",
    components: [
      { kind: "capacitor", value: "100 nF ceramic", connection: "pin to GND, close to the pin" },
      { kind: "capacitor", value: "1 µF bulk", connection: "one per rail group" },
    ],
    source: "ProtoPart design_rules / Hardware Design with RP2040",
  },
};

// ---------------------------------------------------------------------------
// Datasheet-honest per-pin function metadata
// ---------------------------------------------------------------------------

/**
 * One FUNCSEL entry, carried verbatim from the ProtoPart per-pin function
 * lists. `direction` uses the ProtoPart vocabulary (source/sink/bidirectional)
 * rather than the datasheet's I/O column, because that is what the audited
 * JSON records. `funcsel` is the Datasheet Table 2 column: the ProtoPart
 * definition cites F1 (SPI), F2 (UART), F4 (PWM), F8 (CLOCK) and F9 (USB)
 * explicitly; F3/F5/F6/F7 complete the same table row.
 */
interface Rp2040Function {
  name: string;
  direction: "source" | "sink" | "bidirectional";
  signal_class: "data" | "clock" | "sense" | "power" | "ground";
  funcsel?: string;
  note?: string;
}

interface Rp2040GpioSpec {
  /** QFN-56 package pin number (Datasheet Table 1). */
  pin: number;
  /** Bank-0 GPIO number — used as the displayed interface name (GPIOn). */
  gpio: number;
  /** F1: fixed SPI controller signal on this pin. */
  spi: string;
  /** F2: fixed UART controller signal on this pin. */
  uart: string;
  /** F3: fixed I2C controller signal on this pin. */
  i2c: string;
  /** F4: fixed PWM slice/channel on this pin (PWM<slice>_<A|B>). */
  pwm: string;
  /** F9: fixed USB VBUS-management signal on this pin. */
  usb: string;
  /** F8: CLOCK_GPINn / CLOCK_GPOUTn where present (GPIO20-25 only). */
  clock?: string;
  /** ADC channel number for GPIO26-29 (pins 38-41). */
  adc?: number;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

/** Verbatim function list for one GPIO pad, mirroring the ProtoPart entry. */
function gpioFunctions(spec: Rp2040GpioSpec): Rp2040Function[] {
  const spiDir: "source" | "sink" = spec.spi.endsWith("_RX") ? "sink" : "source";
  const uartDir: "source" | "sink" =
    spec.uart.endsWith("_RX") || spec.uart.endsWith("CTS") ? "sink" : "source";
  const usbDir: "source" | "sink" = spec.usb.endsWith("_EN") ? "source" : "sink";

  const fns: Rp2040Function[] = [
    { name: "digital_io", direction: "bidirectional", signal_class: "data" },
  ];
  if (spec.adc !== undefined) {
    fns.push({
      name: "analog_input",
      direction: "sink",
      signal_class: "sense",
      note: `ADC${spec.adc}`,
    });
  }
  fns.push(
    {
      name: spec.spi,
      direction: spiDir,
      signal_class: spec.spi.endsWith("_SCK") ? "clock" : "data",
      funcsel: "F1",
    },
    { name: spec.uart, direction: uartDir, signal_class: "data", funcsel: "F2" },
    {
      name: spec.i2c,
      direction: "bidirectional",
      signal_class: spec.i2c.endsWith("_SCL") ? "clock" : "data",
      funcsel: "F3",
    },
    { name: spec.pwm, direction: "source", signal_class: "data", funcsel: "F4" },
    { name: "SIO", direction: "bidirectional", signal_class: "data", funcsel: "F5" },
    { name: "PIO0", direction: "bidirectional", signal_class: "data", funcsel: "F6" },
    { name: "PIO1", direction: "bidirectional", signal_class: "data", funcsel: "F7" },
  );
  if (spec.clock !== undefined) {
    fns.push({
      name: spec.clock,
      direction: spec.clock.includes("GPIN") ? "sink" : "source",
      signal_class: "clock",
      funcsel: "F8",
    });
  }
  fns.push({
    name: spec.usb,
    direction: usbDir,
    signal_class: usbDir === "sink" ? "sense" : "data",
    funcsel: "F9",
  });
  return fns;
}

/** Build one schematic-honest GPIO pad from its function-select row. */
function rp2040Gpio(spec: Rp2040GpioSpec): InterfaceDef {
  const base = Pin({
    id: `pin_${spec.pin}`,
    name: `GPIO${spec.gpio}`,
    pin: spec.pin,
    voltageV: IOVDD_RANGE,
    capabilities: {
      // Every bank-0 GPIO carries a fixed PWM channel via F4 (JSON per-pin
      // `pwm_out` function) — generic tag for inter-module PWM matching.
      pwm: true,
      analogIn: spec.adc !== undefined,
      // Generic bus tags reflect the ONE fixed controller signal this pin has
      // (the F1/F2/F3 columns), never a routable superset.
      i2cSda: spec.i2c.endsWith("_SDA"),
      i2cScl: spec.i2c.endsWith("_SCL"),
      spiMosi: spec.spi.endsWith("_TX"), // datasheet TX = controller data out
      spiMiso: spec.spi.endsWith("_RX"), // datasheet RX = controller data in
      spiSck: spec.spi.endsWith("_SCK"),
      spiSs: spec.spi.endsWith("_CSn"),
      uartTx: spec.uart.endsWith("_TX"),
      uartRx: spec.uart.endsWith("_RX"),
      uartRts: spec.uart.endsWith("RTS"),
      uartCts: spec.uart.endsWith("CTS"),
    },
  });

  const capabilities = unique([
    ...(base.capabilities ?? []),
    `gpio${spec.gpio}`,
    // Controller-specific FUNCSEL tags — the honest combination space. These
    // are what the composed controllers' traits/profiles enumerate; the
    // routing is fixed, not matrix-style.
    spec.spi.toLowerCase(),
    spec.uart.toLowerCase(),
    spec.i2c.toLowerCase(),
    spec.pwm.toLowerCase(),
    spec.usb.toLowerCase(),
    // SIO/PIO reach every bank-0 GPIO (F5/F6/F7) — the matrix analogue.
    "sio",
    "pio0",
    "pio1",
    ...(spec.clock !== undefined
      ? [spec.clock.toLowerCase(), spec.clock.includes("GPIN") ? "clock_gpin" : "clock_gpout"]
      : []),
    ...(spec.adc !== undefined ? [`adc_ch${spec.adc}`] : []),
  ]);

  const traits: TraitDef[] = [
    {
      type: "rp2040_pin_functions",
      params: {
        source:
          "RP2040 Datasheet §1.4.3 Table 2 (GPIO function table) — carried verbatim from the ProtoPart definition",
        functions: gpioFunctions(spec),
      },
    },
    {
      type: "power_domain",
      params: {
        domain: "IOVDD",
        note: "Logic level tracks IOVDD: 3.3 V typical, 1.8 V supported. All GPIO are NOT 5 V tolerant — apply level shifting for 5 V signals (ProtoPart warnings).",
      },
    },
    ...(spec.adc !== undefined
      ? [
          {
            type: "analog_input_clamp",
            params: {
              note: "The voltage on the ADC analogue inputs must not exceed IOVDD — voltages greater than IOVDD leak through the pad ESD protection diodes (absolute maximum pin voltage IOVDD + 0.5 V, Table 622).",
              source: "RP2040 Datasheet §2.9.5 note / Table 622 — corrects the ProtoPart warning's 'clamped to ADC_AVDD + 0.3 V'",
            },
          } satisfies TraitDef,
        ]
      : []),
  ];

  return { ...base, capabilities, traits };
}

// ---------------------------------------------------------------------------
// Bank-0 GPIO pads — ProtoPart pins 2-9, 11-18, 27-32, 34-41 (Datasheet
// Table 1 / Table 2), in package pin order. Each row is the pin's fixed
// FUNCSEL assignment, transcribed from the per-pin function lists.
// ---------------------------------------------------------------------------

const GPIO_SPECS: Rp2040GpioSpec[] = [
  { pin: 2,  gpio: 0,  spi: "SPI0_RX",  uart: "UART0_TX",  i2c: "I2C0_SDA", pwm: "PWM0_A", usb: "USB_OVCUR_DET" },
  { pin: 3,  gpio: 1,  spi: "SPI0_CSn", uart: "UART0_RX",  i2c: "I2C0_SCL", pwm: "PWM0_B", usb: "USB_VBUS_DET" },
  { pin: 4,  gpio: 2,  spi: "SPI0_SCK", uart: "UART0_CTS", i2c: "I2C1_SDA", pwm: "PWM1_A", usb: "USB_VBUS_EN" },
  { pin: 5,  gpio: 3,  spi: "SPI0_TX",  uart: "UART0_RTS", i2c: "I2C1_SCL", pwm: "PWM1_B", usb: "USB_OVCUR_DET" },
  { pin: 6,  gpio: 4,  spi: "SPI0_RX",  uart: "UART1_TX",  i2c: "I2C0_SDA", pwm: "PWM2_A", usb: "USB_VBUS_DET" },
  { pin: 7,  gpio: 5,  spi: "SPI0_CSn", uart: "UART1_RX",  i2c: "I2C0_SCL", pwm: "PWM2_B", usb: "USB_VBUS_EN" },
  { pin: 8,  gpio: 6,  spi: "SPI0_SCK", uart: "UART1_CTS", i2c: "I2C1_SDA", pwm: "PWM3_A", usb: "USB_OVCUR_DET" },
  { pin: 9,  gpio: 7,  spi: "SPI0_TX",  uart: "UART1_RTS", i2c: "I2C1_SCL", pwm: "PWM3_B", usb: "USB_VBUS_DET" },
  { pin: 11, gpio: 8,  spi: "SPI1_RX",  uart: "UART1_TX",  i2c: "I2C0_SDA", pwm: "PWM4_A", usb: "USB_VBUS_EN" },
  { pin: 12, gpio: 9,  spi: "SPI1_CSn", uart: "UART1_RX",  i2c: "I2C0_SCL", pwm: "PWM4_B", usb: "USB_OVCUR_DET" },
  { pin: 13, gpio: 10, spi: "SPI1_SCK", uart: "UART1_CTS", i2c: "I2C1_SDA", pwm: "PWM5_A", usb: "USB_VBUS_DET" },
  { pin: 14, gpio: 11, spi: "SPI1_TX",  uart: "UART1_RTS", i2c: "I2C1_SCL", pwm: "PWM5_B", usb: "USB_VBUS_EN" },
  { pin: 15, gpio: 12, spi: "SPI1_RX",  uart: "UART0_TX",  i2c: "I2C0_SDA", pwm: "PWM6_A", usb: "USB_OVCUR_DET" },
  { pin: 16, gpio: 13, spi: "SPI1_CSn", uart: "UART0_RX",  i2c: "I2C0_SCL", pwm: "PWM6_B", usb: "USB_VBUS_DET" },
  { pin: 17, gpio: 14, spi: "SPI1_SCK", uart: "UART0_CTS", i2c: "I2C1_SDA", pwm: "PWM7_A", usb: "USB_VBUS_EN" },
  { pin: 18, gpio: 15, spi: "SPI1_TX",  uart: "UART0_RTS", i2c: "I2C1_SCL", pwm: "PWM7_B", usb: "USB_OVCUR_DET" },
  { pin: 27, gpio: 16, spi: "SPI0_RX",  uart: "UART0_TX",  i2c: "I2C0_SDA", pwm: "PWM0_A", usb: "USB_VBUS_DET" },
  { pin: 28, gpio: 17, spi: "SPI0_CSn", uart: "UART0_RX",  i2c: "I2C0_SCL", pwm: "PWM0_B", usb: "USB_VBUS_EN" },
  { pin: 29, gpio: 18, spi: "SPI0_SCK", uart: "UART0_CTS", i2c: "I2C1_SDA", pwm: "PWM1_A", usb: "USB_OVCUR_DET" },
  { pin: 30, gpio: 19, spi: "SPI0_TX",  uart: "UART0_RTS", i2c: "I2C1_SCL", pwm: "PWM1_B", usb: "USB_VBUS_DET" },
  { pin: 31, gpio: 20, spi: "SPI0_RX",  uart: "UART1_TX",  i2c: "I2C0_SDA", pwm: "PWM2_A", usb: "USB_VBUS_EN",    clock: "CLOCK_GPIN0" },
  { pin: 32, gpio: 21, spi: "SPI0_CSn", uart: "UART1_RX",  i2c: "I2C0_SCL", pwm: "PWM2_B", usb: "USB_OVCUR_DET",  clock: "CLOCK_GPOUT0" },
  { pin: 34, gpio: 22, spi: "SPI0_SCK", uart: "UART1_CTS", i2c: "I2C1_SDA", pwm: "PWM3_A", usb: "USB_VBUS_DET",   clock: "CLOCK_GPIN1" },
  { pin: 35, gpio: 23, spi: "SPI0_TX",  uart: "UART1_RTS", i2c: "I2C1_SCL", pwm: "PWM3_B", usb: "USB_VBUS_EN",    clock: "CLOCK_GPOUT1" },
  { pin: 36, gpio: 24, spi: "SPI1_RX",  uart: "UART1_TX",  i2c: "I2C0_SDA", pwm: "PWM4_A", usb: "USB_OVCUR_DET",  clock: "CLOCK_GPOUT2" },
  { pin: 37, gpio: 25, spi: "SPI1_CSn", uart: "UART1_RX",  i2c: "I2C0_SCL", pwm: "PWM4_B", usb: "USB_VBUS_DET",   clock: "CLOCK_GPOUT3" },
  { pin: 38, gpio: 26, spi: "SPI1_SCK", uart: "UART1_CTS", i2c: "I2C1_SDA", pwm: "PWM5_A", usb: "USB_VBUS_EN",    adc: 0 },
  { pin: 39, gpio: 27, spi: "SPI1_TX",  uart: "UART1_RTS", i2c: "I2C1_SCL", pwm: "PWM5_B", usb: "USB_OVCUR_DET",  adc: 1 },
  { pin: 40, gpio: 28, spi: "SPI1_RX",  uart: "UART0_TX",  i2c: "I2C0_SDA", pwm: "PWM6_A", usb: "USB_VBUS_DET",   adc: 2 },
  { pin: 41, gpio: 29, spi: "SPI1_CSn", uart: "UART0_RX",  i2c: "I2C0_SCL", pwm: "PWM6_B", usb: "USB_VBUS_EN",    adc: 3 },
];

const gpioPads: InterfaceDef[] = GPIO_SPECS.map(rp2040Gpio);

// ---------------------------------------------------------------------------
// QSPI pads (bank 1) — pins 51-56, dedicated to the external XIP flash.
// Each also has a software-controlled GPIO (digital_io) function per the
// ProtoPart definition.
// ---------------------------------------------------------------------------

function qspiPad(config: {
  pin: number;
  name: string;
  cap: string;
  direction: "source" | "bidirectional";
  signalClass: "data" | "clock";
  note: string;
  extraTraits?: TraitDef[];
}): InterfaceDef {
  return {
    id: `pin_${config.pin}`,
    name: config.name,
    pin: config.pin,
    domain: "electrical",
    exposed: true,
    default_active: true,
    protocols: [{ type: "digital", roles: ["input", "output", "bidirectional"] }],
    capabilities: ["digital_io", config.cap],
    parameters: [{ id: "voltage", unit: "V", range: IOVDD_RANGE }],
    traits: [
      {
        type: "rp2040_pin_functions",
        params: {
          source: "RP2040 Datasheet Table 1 — carried verbatim from the ProtoPart definition",
          functions: [
            {
              name: config.name,
              direction: config.direction,
              signal_class: config.signalClass,
              note: config.note,
            },
            { name: "digital_io", direction: "bidirectional", signal_class: "data" },
          ] satisfies Rp2040Function[],
        },
      },
      { type: "power_domain", params: { domain: "IOVDD" } },
      {
        type: "usage_restriction",
        params: {
          restriction:
            "Dedicated to the external XIP flash on any booting design — the chip cannot run user code without it.",
          exemption:
            "Usable as a software-controlled GPIO when not required for flash access (ProtoPart pin descriptions).",
        },
      },
      ...(config.extraTraits ?? []),
    ],
  };
}

const qspiPads: InterfaceDef[] = [
  qspiPad({
    pin: 51, name: "QSPI_SD3", cap: "qspi_sd3", direction: "bidirectional", signalClass: "data",
    note: "External XIP flash data line 3.",
  }),
  qspiPad({
    pin: 52, name: "QSPI_SCLK", cap: "qspi_sclk", direction: "source", signalClass: "clock",
    note: "External XIP flash clock output.",
  }),
  qspiPad({
    pin: 53, name: "QSPI_SD0", cap: "qspi_sd0", direction: "bidirectional", signalClass: "data",
    note: "External XIP flash data line 0 (MOSI in single-bit SPI mode).",
  }),
  qspiPad({
    pin: 54, name: "QSPI_SD2", cap: "qspi_sd2", direction: "bidirectional", signalClass: "data",
    note: "External XIP flash data line 2.",
  }),
  qspiPad({
    pin: 55, name: "QSPI_SD1", cap: "qspi_sd1", direction: "bidirectional", signalClass: "data",
    note: "External XIP flash data line 1 (MISO in single-bit SPI mode).",
  }),
  qspiPad({
    pin: 56, name: "QSPI_SS_N", cap: "qspi_ss_n", direction: "source", signalClass: "data",
    note: "External XIP flash chip-select (active low).",
    extraTraits: [
      { type: "display_notation", params: { active_low: true, display: "QSPI_SS̅" } },
      {
        type: "boot_strapping",
        params: {
          controls:
            "USB BOOTSEL UF2 mode: pulling this pin low during reset forces the boot ROM into UF2 mass-storage mode — the standard board-level BOOTSEL mechanism (there is no dedicated USB_BOOT pin on the bare chip).",
          recommended_wiring:
            "Route through a momentary pushbutton to GND to support firmware loading via the USB BOOTSEL UF2 path (ProtoPart design_rules).",
          source: "ProtoPart pin 56 description / design_rules / warnings",
        },
      },
    ],
  }),
];

// ---------------------------------------------------------------------------
// Power, clock, debug, and service pads — ProtoPart pins 1, 10, 19-26, 33,
// 42-50 and the exposed ground pad
// ---------------------------------------------------------------------------

/** The six IOVDD pads (1, 10, 22, 33, 42, 49) sit on one 1.8-3.3 V rail. */
function iovddPin(pinNo: number, ordinal: number): InterfaceDef {
  const base = PowerIn({
    id: `pin_${pinNo}`,
    name: "IOVDD",
    pin: pinNo,
    voltageV: IOVDD_RANGE,
    nominalV: 3.3,
  });
  return {
    ...base,
    capabilities: ["power_in", "iovdd"],
    traits: [
      {
        type: "power_domain",
        params: {
          domain: "IOVDD",
          note: `Digital I/O ring supply (${ordinal} of 6). Sets logic level for all 30 GPIOs and the QSPI flash interface.`,
        },
      },
      {
        // Shareability exemption: one supply instance may legally serve all
        // six pads — mixing rails on IOVDD pins is not supported.
        type: "net_shareable",
        params: {
          net: "rp2040_iovdd",
          policy: "single_supply_instance_may_serve_all_members",
          members: ["pin_1", "pin_10", "pin_22", "pin_33", "pin_42", "pin_49"],
          source: "ProtoPart design_rules: 'Tie all six IOVDD pins to the same supply rail (1.8 V or 3.3 V).'",
        },
      },
      SUPPLY_DECOUPLING_TRAIT,
    ],
  };
}

/** The two DVDD pads (23, 50) sit on one 1.1 V core rail. */
function dvddPin(pinNo: number, ordinal: number): InterfaceDef {
  const base = PowerIn({
    id: `pin_${pinNo}`,
    name: "DVDD",
    pin: pinNo,
    voltageV: DVDD_RANGE,
    nominalV: 1.1,
  });
  return {
    ...base,
    capabilities: ["power_in", "dvdd"],
    traits: [
      {
        type: "power_domain",
        params: {
          domain: "DVDD",
          note: `1.1 V digital core supply (${ordinal} of 2). Keep within 1.05-1.16 V per Datasheet Table 634 (use 1.15 V if running clk_sys at 200 MHz).`,
        },
      },
      {
        type: "net_shareable",
        params: {
          net: "rp2040_dvdd",
          policy: "single_supply_instance_may_serve_all_members",
          members: ["pin_23", "pin_50"],
        },
      },
      {
        type: "co_requirement",
        params: {
          with: "pin_45",
          condition: "always",
          effect:
            "DVDD must not be left floating: supply from VREG_VOUT (typical — route pin 45 externally to both DVDD pins with low impedance) or from an external 1.1 V regulator.",
          source: "ProtoPart design_rules / warnings",
        },
      },
      SUPPLY_DECOUPLING_TRAIT,
    ],
  };
}

const powerAndServicePads: InterfaceDef[] = [
  iovddPin(1, 1),
  iovddPin(10, 2),

  {
    id: "pin_19",
    name: "TESTEN",
    pin: 19,
    domain: "electrical",
    exposed: true,
    default_active: true,
    protocols: [{ type: "digital", roles: ["input"] }],
    capabilities: ["testen", "factory_test"],
    parameters: [{ id: "voltage", unit: "V", range: IOVDD_RANGE }],
    traits: [
      {
        type: "rp2040_pin_functions",
        params: {
          source: "RP2040 Datasheet Table 1 / Table 619 — carried verbatim from the ProtoPart definition",
          functions: [
            {
              name: "digital_input",
              direction: "sink",
              signal_class: "data",
              note: "TESTEN — factory test enable (IOVDD bank).",
            },
          ] satisfies Rp2040Function[],
        },
      },
      {
        type: "internal_pulls",
        params: {
          available: true,
          pull_down_at_reset: true,
          source: "RP2040 Datasheet Table 619 (internal pull-down at reset)",
        },
      },
      {
        type: "usage_restriction",
        params: {
          restriction:
            "Must be tied externally to GND in production use — a floating TESTEN can place the chip in factory test mode and prevent normal boot. Not a ground source.",
          source: "ProtoPart pin 19 description / design_rules / warnings",
        },
      },
    ],
  },

  {
    id: "pin_20",
    name: "XIN",
    pin: 20,
    domain: "electrical",
    exposed: true,
    default_active: true,
    protocols: [{ type: "clock", roles: ["input"] }],
    capabilities: ["xtal_in"],
    parameters: [
      // ProtoPart pin 20: "USB bootloader requires 12 MHz."
      { id: "clock_freq", unit: "Hz", value: 12_000_000 },
    ],
    traits: [
      {
        type: "rp2040_pin_functions",
        params: {
          source: "RP2040 Datasheet Table 1 / §2.16 — carried verbatim from the ProtoPart definition",
          functions: [
            {
              name: "XIN",
              direction: "sink",
              signal_class: "clock",
              note: "Crystal oscillator input. Connect a 12 MHz crystal between XIN/XOUT with load capacitors, or drive XIN with a single-ended CMOS clock (XOUT disconnected).",
            },
            { name: "digital_input", direction: "sink", signal_class: "clock" },
          ] satisfies Rp2040Function[],
        },
      },
      { type: "power_domain", params: { domain: "IOVDD" } },
    ],
  },
  {
    id: "pin_21",
    name: "XOUT",
    pin: 21,
    domain: "electrical",
    exposed: true,
    default_active: true,
    protocols: [{ type: "clock", roles: ["output"] }],
    capabilities: ["xtal_out"],
    traits: [
      {
        type: "rp2040_pin_functions",
        params: {
          source: "RP2040 Datasheet Table 1 / §2.16 — carried verbatim from the ProtoPart definition",
          functions: [
            {
              name: "XOUT",
              direction: "source",
              signal_class: "clock",
              note: "Crystal oscillator output. Connect to the 12 MHz crystal opposite XIN; leave open when XIN is driven by an external clock.",
            },
            { name: "digital_output", direction: "source", signal_class: "clock" },
          ] satisfies Rp2040Function[],
        },
      },
      { type: "power_domain", params: { domain: "IOVDD" } },
    ],
  },

  iovddPin(22, 3),
  dvddPin(23, 1),

  {
    id: "pin_24",
    name: "SWCLK",
    pin: 24,
    domain: "electrical",
    exposed: true,
    default_active: true,
    protocols: [{ type: "digital", roles: ["input"] }],
    capabilities: ["swd_clk"],
    parameters: [{ id: "voltage", unit: "V", range: IOVDD_RANGE }],
    traits: [
      {
        type: "rp2040_pin_functions",
        params: {
          source: "RP2040 Datasheet Table 1 / Table 342 — carried verbatim from the ProtoPart definition",
          functions: [
            {
              name: "SWCLK",
              direction: "sink",
              signal_class: "clock",
              note: "Serial Wire Debug clock input (Digital In FT, IOVDD bank). Multi-drop SWD bus access to both M0+ cores; also used to download code.",
            },
            { name: "digital_input", direction: "sink", signal_class: "clock" },
          ] satisfies Rp2040Function[],
        },
      },
      {
        type: "internal_pulls",
        params: {
          available: true,
          pull_up_at_reset: true,
          source: "RP2040 Datasheet Table 342, PADS_BANK0:SWCLK (PUE=1/PDE=0)",
        },
      },
      { type: "power_domain", params: { domain: "IOVDD" } },
    ],
  },
  {
    id: "pin_25",
    name: "SWDIO",
    pin: 25,
    domain: "electrical",
    exposed: true,
    default_active: true,
    protocols: [{ type: "digital", roles: ["input", "output", "bidirectional"] }],
    capabilities: ["swd_io"],
    parameters: [{ id: "voltage", unit: "V", range: IOVDD_RANGE }],
    traits: [
      {
        type: "rp2040_pin_functions",
        params: {
          source: "RP2040 Datasheet Table 1 — carried verbatim from the ProtoPart definition",
          functions: [
            {
              name: "SWDIO",
              direction: "bidirectional",
              signal_class: "data",
              note: "Serial Wire Debug bidirectional data. Pair with SWCLK for SWD debug to both cores.",
            },
            { name: "digital_io", direction: "bidirectional", signal_class: "data" },
          ] satisfies Rp2040Function[],
        },
      },
      {
        type: "internal_pulls",
        params: { available: true, pull_up_at_reset: true, source: "ProtoPart pin 25 description ('has internal pull-up')" },
      },
      { type: "power_domain", params: { domain: "IOVDD" } },
    ],
  },
  {
    id: "pin_26",
    name: "RUN",
    pin: 26,
    domain: "electrical",
    exposed: true,
    default_active: true,
    protocols: [{ type: "digital", roles: ["input"] }],
    capabilities: ["run_reset", "reset_input"],
    parameters: [{ id: "voltage", unit: "V", range: IOVDD_RANGE }],
    traits: [
      {
        type: "rp2040_pin_functions",
        params: {
          source: "RP2040 Datasheet Table 1 — carried verbatim from the ProtoPart definition",
          functions: [
            {
              name: "RESET",
              direction: "sink",
              signal_class: "data",
              note: "Global asynchronous reset. Reset when driven low, run when driven high.",
            },
          ] satisfies Rp2040Function[],
        },
      },
      {
        type: "internal_pulls",
        params: {
          available: true,
          pull_up_at_reset: true,
          note: "Has internal pull-up; if no external reset is required, tie directly to IOVDD.",
          source: "ProtoPart pin 26 description",
        },
      },
      { type: "power_domain", params: { domain: "IOVDD" } },
    ],
  },

  iovddPin(33, 4),
  iovddPin(42, 5),

  {
    ...PowerIn({
      id: "pin_43",
      name: "ADC_AVDD",
      pin: 43,
      voltageV: ADC_AVDD_RANGE,
      nominalV: 3.3,
    }),
    capabilities: ["power_in", "adc_avdd", "analog_supply"],
    traits: [
      {
        type: "power_domain",
        params: {
          domain: "ADC_AVDD",
          note: "Analog supply / reference for the 12-bit ADC. 1.62-3.63 V (typ 3.3 V) per Table 634; ADC performance is compromised below 2.97 V (§2.9.5).",
        },
      },
      {
        type: "implied_passives",
        params: {
          purpose: "ADC supply filtering for best ENOB",
          components: [
            { kind: "ferrite_bead", value: "from the main 3V3 rail", connection: "3V3 to ADC_AVDD" },
            { kind: "capacitor", value: "1 µF", connection: "ADC_AVDD to GND" },
            { kind: "capacitor", value: "100 nF", connection: "ADC_AVDD to GND" },
          ],
          source: "ProtoPart design_rules / adc_avdd power-domain description",
        },
      },
    ],
  },

  {
    ...PowerIn({
      id: "pin_44",
      name: "VREG_VIN",
      pin: 44,
      voltageV: VREG_VIN_RANGE,
      nominalV: 3.3,
    }),
    capabilities: ["power_in", "vreg_vin"],
    traits: [
      {
        type: "power_domain",
        params: {
          domain: "VREG_VIN",
          note: "Power input for the internal core voltage regulator (nominal 1.8-3.3 V per Datasheet §1.4.2).",
        },
      },
      SUPPLY_DECOUPLING_TRAIT,
    ],
    bridgesTo: ["pin_45"],
  },
  {
    ...PowerOut({
      id: "pin_45",
      name: "VREG_VOUT",
      pin: 45,
      voltageV: 1.1,
      maxCurrentA: 0.1,
    }),
    capabilities: ["power_out", "vreg_vout"],
    traits: [
      {
        type: "internal_regulator",
        params: {
          description:
            "Output of the internal core voltage regulator: nominal 1.1 V at up to 100 mA (Datasheet §1.4.2). Externally route to both DVDD pins (23, 50).",
          source: "ProtoPart pin 45 description / ldo interface",
        },
      },
      {
        type: "co_requirement",
        params: {
          with: "pin_23, pin_50",
          condition: "internal core LDO in use (typical)",
          effect:
            "Keep VREG_VOUT decoupling close to pin 45 and route to both DVDD pins with low impedance.",
          source: "ProtoPart design_rules",
        },
      },
    ],
    bridgesTo: ["pin_23", "pin_50"],
  },

  {
    id: "pin_46",
    name: "USB_DM",
    pin: 46,
    domain: "electrical",
    exposed: true,
    default_active: true,
    protocols: [{ type: "usb", roles: ["data_minus"] }],
    capabilities: ["usb_dm"],
    traits: [
      {
        type: "rp2040_pin_functions",
        params: {
          source: "RP2040 Datasheet Table 1 / §1.4.2 — carried verbatim from the ProtoPart definition",
          functions: [
            {
              name: "usb_dm",
              direction: "bidirectional",
              signal_class: "data",
              note: "USB 1.1 differential data minus.",
            },
          ] satisfies Rp2040Function[],
        },
      },
      { type: "power_domain", params: { domain: "USB_VDD" } },
      {
        type: "internal_pulls",
        params: {
          available: true,
          note: "USB bus pull-ups/pull-downs are provided internally.",
          source: "ProtoPart pin 46 description",
        },
      },
      {
        type: "implied_passives",
        params: {
          purpose: "USB series termination",
          components: [{ kind: "resistor", value: "27 Ω", connection: "in series with USB_DM" }],
          source: "ProtoPart pin 46 description / design_rules",
        },
      },
      {
        type: "layout_requirement",
        params: {
          note: "Route USB_DP/USB_DM as a 90 Ω differential pair (Hardware Design with RP2040 §2.4.1; the 27 Ω series terminations are from Datasheet §1.4.2).",
          source: "ProtoPart design_rules",
        },
      },
    ],
  },
  {
    id: "pin_47",
    name: "USB_DP",
    pin: 47,
    domain: "electrical",
    exposed: true,
    default_active: true,
    protocols: [{ type: "usb", roles: ["data_plus"] }],
    capabilities: ["usb_dp"],
    traits: [
      {
        type: "rp2040_pin_functions",
        params: {
          source: "RP2040 Datasheet Table 1 / §1.4.2 — carried verbatim from the ProtoPart definition",
          functions: [
            {
              name: "usb_dp",
              direction: "bidirectional",
              signal_class: "data",
              note: "USB 1.1 differential data plus.",
            },
          ] satisfies Rp2040Function[],
        },
      },
      { type: "power_domain", params: { domain: "USB_VDD" } },
      {
        type: "internal_pulls",
        params: {
          available: true,
          note: "USB bus pull-ups/pull-downs are provided internally.",
          source: "ProtoPart pin 47 description",
        },
      },
      {
        type: "implied_passives",
        params: {
          purpose: "USB series termination",
          components: [{ kind: "resistor", value: "27 Ω", connection: "in series with USB_DP" }],
          source: "ProtoPart pin 47 description / design_rules",
        },
      },
      {
        type: "layout_requirement",
        params: {
          note: "Route USB_DP/USB_DM as a 90 Ω differential pair (Hardware Design with RP2040 §2.4.1; the 27 Ω series terminations are from Datasheet §1.4.2).",
          source: "ProtoPart design_rules",
        },
      },
    ],
  },

  {
    ...PowerIn({
      id: "pin_48",
      name: "USB_VDD",
      pin: 48,
      voltageV: USB_VDD_RANGE,
      nominalV: 3.3,
    }),
    capabilities: ["power_in", "usb_vdd"],
    traits: [
      {
        type: "power_domain",
        params: {
          domain: "USB_VDD",
          note: "Dedicated 3.3 V supply for the integrated USB 1.1 PHY. Decouple separately from IOVDD; supply from the same 3.3 V rail with its own decoupling.",
        },
      },
      {
        type: "co_requirement",
        params: {
          with: "usb_device, usb_host",
          condition: "always (even if USB is unused)",
          effect:
            "USB_VDD must be supplied even if USB is unused; otherwise the USB PHY draws leakage current that may keep the chip from entering low-power states cleanly.",
          source: "ProtoPart warnings",
        },
      },
      SUPPLY_DECOUPLING_TRAIT,
    ],
  },

  iovddPin(49, 6),
  dvddPin(50, 2),

  {
    ...Ground({ id: "pad_gnd", name: "GND (Exposed Pad)", pin: 57, maxCurrentA: 1.0 }),
    traits: [
      {
        type: "assembly_requirement",
        params: {
          note: "Exposed thermal pad on the QFN-56 underside — the single external ground connection (Datasheet §1.4.2), bonded to all internal ground pads on the die. Solder to the PCB ground plane and stitch with thermal vias for heat dissipation and ground reference integrity; leaving it floating violates the ground reference, increases noise, and degrades thermal performance.",
          source: "ProtoPart pad_gnd description / design_rules / warnings",
        },
      },
      {
        type: "net_shareable",
        params: { net: "gnd", policy: "single_ground_instance_may_serve_all_members" },
      },
      {
        type: "pin_designator_note",
        params: {
          note: "The ProtoPart resource id is 'pad_gnd' (no perimeter pin number); 57 is the CAD-footprint designator for the exposed pad.",
        },
      },
    ],
  },
];

/** All 57 pads, sorted into physical package order — schematic-honest. */
const pins: InterfaceDef[] = [...powerAndServicePads, ...gpioPads, ...qspiPads].sort(
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

// ADC — 4 user channels on GPIO26-29 (ProtoPart `adc_in` interface).
const adc = composed({
  id: "adc_in",
  name: "ADC",
  protocolType: "analog",
  roles: ["input"],
  parameters: [resolutionBits(12)],
  slots: [
    { id: "channel", required: true, count: 4, match: { protocol: "analog", role: "input", capability: "analog_in" } },
  ],
  profiles: [
    {
      id: "adc_channels",
      label: "ADC0-ADC3 (GPIO26-29, pins 38-41)",
      bindings: { channel: ["pin_38", "pin_39", "pin_40", "pin_41"] },
    },
  ],
  maxInstances: 1,
  traits: [
    {
      type: "channels",
      params: {
        count: 4,
        mapping: "ADC0=GPIO26 (pin 38), ADC1=GPIO27 (pin 39), ADC2=GPIO28 (pin 40), ADC3=GPIO29 (pin 41)",
        note: "12-bit successive-approximation ADC; an internal temperature sensor occupies a further non-pinned input (ProtoPart usage_notes).",
      },
    },
    {
      type: "performance_note",
      params: {
        note: "Effective ENOB ~9 bits without filtering; ADC performance is compromised below ADC_AVDD = 2.97 V (Datasheet §2.9.5).",
        source: "ProtoPart usage_notes / adc_avdd power-domain description",
      },
    },
    {
      type: "co_requirement",
      params: {
        with: "pin_43",
        condition: "always",
        effect:
          "ADC_AVDD is the analog supply and conversion reference; the voltage on ADC inputs must not exceed IOVDD (leakage through ESD protection diodes above IOVDD — Datasheet §2.9.5 note). Filter from the main 3V3 with a ferrite bead + 1 µF + 100 nF for best ENOB.",
        source: "ProtoPart warnings / design_rules (input limit corrected to the datasheet's IOVDD bound, §2.9.5)",
      },
    },
  ],
});

// SPI — two PL022 controllers; each signal is FUNCSEL-fixed (F1) to specific
// pin groups (no matrix routing). Datasheet names TX/RX/SCK/CSn map onto the
// builder's mosi/miso/sck/ss slots.
const SPI_TRAITS = (n: 0 | 1, groups: string, partial?: string): TraitDef[] => [
  {
    type: "controller_ip",
    params: { ip: "Arm PL022 SSP", source: "RP2040 Datasheet §4.4; ProtoPart spi interface description" },
  },
  {
    type: "signal_naming",
    params: {
      note: `Datasheet signals are SPI${n}_TX / SPI${n}_RX / SPI${n}_SCK / SPI${n}_CSn; TX binds the mosi slot, RX the miso slot, CSn the ss slot.`,
    },
  },
  {
    type: "instance_combinations",
    params: {
      instances_in_silicon: 1,
      routing: "gpio_funcsel_fixed",
      combination_space: groups,
      ...(partial ? { partial_groups: partial } : {}),
      source: "RP2040 Datasheet §1.4.3 Table 2 (F1 column); ProtoPart per-pin function lists",
    },
  },
  {
    type: "protopart_constraints",
    params: { requires_matching_voltage_domain: true, max_lane_rate_mbps: 62 },
  },
];

const spi0 = amend(
  SPI({
    id: "spi_0",
    name: "SPI 0",
    roles: ["master"], // ProtoPart models the PL022 interfaces in master role
    clockFreqHz: [0, 62_500_000], // "Up to ~62.5 Mbps (sysclk/2)"
    maxInstances: 1,
    profiles: [
      { id: "spi0_gpio0",  label: "SPI0 on GPIO0-3 (pins 2-5)",     miso: "pin_2",  ss: "pin_3",  sck: "pin_4",  mosi: "pin_5" },
      { id: "spi0_gpio4",  label: "SPI0 on GPIO4-7 (pins 6-9)",     miso: "pin_6",  ss: "pin_7",  sck: "pin_8",  mosi: "pin_9" },
      { id: "spi0_gpio16", label: "SPI0 on GPIO16-19 (pins 27-30)", miso: "pin_27", ss: "pin_28", sck: "pin_29", mosi: "pin_30" },
      { id: "spi0_gpio20", label: "SPI0 on GPIO20-23 (pins 31-35)", miso: "pin_31", ss: "pin_32", sck: "pin_34", mosi: "pin_35" },
    ],
  }),
  "spi_0",
  SPI_TRAITS(0, "Four fixed pin groups: GPIO0-3, GPIO4-7, GPIO16-19, GPIO20-23. Signals do not mix across groups arbitrarily — each GPIO carries exactly one fixed SPI0 signal."),
);

const spi1 = amend(
  SPI({
    id: "spi_1",
    name: "SPI 1",
    roles: ["master"],
    clockFreqHz: [0, 62_500_000],
    maxInstances: 1,
    profiles: [
      { id: "spi1_gpio8",  label: "SPI1 on GPIO8-11 (pins 11-14)",  miso: "pin_11", ss: "pin_12", sck: "pin_13", mosi: "pin_14" },
      { id: "spi1_gpio12", label: "SPI1 on GPIO12-15 (pins 15-18)", miso: "pin_15", ss: "pin_16", sck: "pin_17", mosi: "pin_18" },
      { id: "spi1_gpio24", label: "SPI1 on GPIO24-27 (pins 36-39)", miso: "pin_36", ss: "pin_37", sck: "pin_38", mosi: "pin_39" },
    ],
  }),
  "spi_1",
  SPI_TRAITS(
    1,
    "Three complete fixed pin groups: GPIO8-11, GPIO12-15, GPIO24-27.",
    "GPIO28/GPIO29 (pins 40/41) carry only SPI1_RX / SPI1_CSn — not a complete bus by themselves.",
  ),
);

// UART — two PL011 controllers; TX/RX on F2 with optional CTS/RTS on the
// adjacent F2 pins of the same group.
const UART_TRAITS = (n: 0 | 1, groups: string, partial?: string): TraitDef[] => [
  {
    type: "controller_ip",
    params: { ip: "Arm PL011", source: "RP2040 Datasheet §4.2; ProtoPart uart interface description" },
  },
  {
    type: "instance_combinations",
    params: {
      instances_in_silicon: 1,
      routing: "gpio_funcsel_fixed",
      combination_space: groups,
      ...(partial ? { partial_groups: partial } : {}),
      source: "RP2040 Datasheet §1.4.3 Table 2 (F2 column); ProtoPart per-pin function lists",
    },
  },
  {
    type: "flow_control",
    params: {
      note: `Optional hardware flow control via UART${n}_CTS / UART${n}_RTS on the corresponding F2 pins.`,
      source: "ProtoPart uart interface description",
    },
  },
];

const uart0 = amend(
  UART({
    id: "uart_0",
    name: "UART 0",
    maxInstances: 1,
    profiles: [
      { id: "uart0_gpio0",  label: "UART0 on GPIO0-3 (pins 2-5)",     tx: "pin_2",  rx: "pin_3",  cts: "pin_4",  rts: "pin_5" },
      { id: "uart0_gpio12", label: "UART0 on GPIO12-15 (pins 15-18)", tx: "pin_15", rx: "pin_16", cts: "pin_17", rts: "pin_18" },
      { id: "uart0_gpio16", label: "UART0 on GPIO16-19 (pins 27-30)", tx: "pin_27", rx: "pin_28", cts: "pin_29", rts: "pin_30" },
      { id: "uart0_gpio28", label: "UART0 on GPIO28/29 (pins 40/41, no flow control)", tx: "pin_40", rx: "pin_41" },
    ],
  }),
  "uart_0",
  UART_TRAITS(
    0,
    "Four fixed TX/RX groups: GPIO0/1, GPIO12/13, GPIO16/17, GPIO28/29 (CTS/RTS on GPIO2/3, GPIO14/15, GPIO18/19).",
    "The GPIO28/29 group has no CTS/RTS pins.",
  ),
);

const uart1 = amend(
  UART({
    id: "uart_1",
    name: "UART 1",
    maxInstances: 1,
    profiles: [
      { id: "uart1_gpio4",  label: "UART1 on GPIO4-7 (pins 6-9)",     tx: "pin_6",  rx: "pin_7",  cts: "pin_8",  rts: "pin_9" },
      { id: "uart1_gpio8",  label: "UART1 on GPIO8-11 (pins 11-14)",  tx: "pin_11", rx: "pin_12", cts: "pin_13", rts: "pin_14" },
      { id: "uart1_gpio20", label: "UART1 on GPIO20-23 (pins 31-35)", tx: "pin_31", rx: "pin_32", cts: "pin_34", rts: "pin_35" },
      { id: "uart1_gpio24", label: "UART1 on GPIO24-27 (pins 36-39)", tx: "pin_36", rx: "pin_37", cts: "pin_38", rts: "pin_39" },
    ],
  }),
  "uart_1",
  UART_TRAITS(1, "Four fixed TX/RX groups: GPIO4/5, GPIO8/9, GPIO20/21, GPIO24/25 (CTS/RTS on GPIO6/7, GPIO10/11, GPIO22/23, GPIO26/27)."),
);

// I2C — two DW_apb_i2c controllers. The ProtoPart definition models master
// and slave as separate interfaces per controller; they are merged here into
// one interface per controller with both roles (mirroring the gold-standard
// convention). SDA sits on even GPIOs, SCL on odd, alternating controllers
// every two GPIOs (F3).
const I2C_TRAITS = (n: 0 | 1, pairs: string): TraitDef[] => [
  { type: "display_notation", params: { latex: "I^{2}C" } },
  {
    type: "controller_ip",
    params: {
      ip: "Synopsys DW_apb_i2c",
      modes: ["standard-mode", "fast-mode", "fast-mode plus"],
      source: "RP2040 Datasheet §4.3; ProtoPart i2c interface descriptions",
    },
  },
  {
    type: "instance_combinations",
    params: {
      instances_in_silicon: 1,
      routing: "gpio_funcsel_fixed",
      combination_space: pairs,
      source: "RP2040 Datasheet §1.4.3 Table 2 (F3 column); ProtoPart per-pin function lists",
    },
  },
  {
    type: "role_note",
    params: {
      note: `The ProtoPart definition models I2C ${n} master and slave as separate interfaces (i2c_${n}_master / i2c_${n}_slave); both are roles of the same DW_apb_i2c controller.`,
    },
  },
  { type: "protopart_constraints", params: { requires_matching_voltage_domain: true } },
  {
    type: "implied_passives",
    params: {
      purpose: "Open-drain bus pull-ups",
      components: [{ kind: "resistor", value: "bus-speed dependent", connection: "SDA and SCL to the bus supply" }],
      source: "I²C bus specification (open-drain bus) — not stated in the ProtoPart definition",
    },
  },
];

const i2c0 = amend(
  I2C({
    id: "i2c_0",
    name: "I2C 0",
    roles: ["master", "slave"],
    clockFreqHz: [100_000, 1_000_000], // standard / fast / fast-mode plus (mode names per ProtoPart; rates are the I2C-spec definitions of those modes)
    maxInstances: 1,
    profiles: [
      { id: "i2c0_gpio0",  label: "I2C0 on GPIO0/1 (pins 2/3)",     sda: "pin_2",  scl: "pin_3" },
      { id: "i2c0_gpio4",  label: "I2C0 on GPIO4/5 (pins 6/7)",     sda: "pin_6",  scl: "pin_7" },
      { id: "i2c0_gpio8",  label: "I2C0 on GPIO8/9 (pins 11/12)",   sda: "pin_11", scl: "pin_12" },
      { id: "i2c0_gpio12", label: "I2C0 on GPIO12/13 (pins 15/16)", sda: "pin_15", scl: "pin_16" },
      { id: "i2c0_gpio16", label: "I2C0 on GPIO16/17 (pins 27/28)", sda: "pin_27", scl: "pin_28" },
      { id: "i2c0_gpio20", label: "I2C0 on GPIO20/21 (pins 31/32)", sda: "pin_31", scl: "pin_32" },
      { id: "i2c0_gpio24", label: "I2C0 on GPIO24/25 (pins 36/37)", sda: "pin_36", scl: "pin_37" },
      { id: "i2c0_gpio28", label: "I2C0 on GPIO28/29 (pins 40/41)", sda: "pin_40", scl: "pin_41" },
    ],
  }),
  "i2c_0",
  I2C_TRAITS(0, "Eight fixed SDA/SCL pairs: GPIO0/1, 4/5, 8/9, 12/13, 16/17, 20/21, 24/25, 28/29."),
);

const i2c1 = amend(
  I2C({
    id: "i2c_1",
    name: "I2C 1",
    roles: ["master", "slave"],
    clockFreqHz: [100_000, 1_000_000],
    maxInstances: 1,
    profiles: [
      { id: "i2c1_gpio2",  label: "I2C1 on GPIO2/3 (pins 4/5)",     sda: "pin_4",  scl: "pin_5" },
      { id: "i2c1_gpio6",  label: "I2C1 on GPIO6/7 (pins 8/9)",     sda: "pin_8",  scl: "pin_9" },
      { id: "i2c1_gpio10", label: "I2C1 on GPIO10/11 (pins 13/14)", sda: "pin_13", scl: "pin_14" },
      { id: "i2c1_gpio14", label: "I2C1 on GPIO14/15 (pins 17/18)", sda: "pin_17", scl: "pin_18" },
      { id: "i2c1_gpio18", label: "I2C1 on GPIO18/19 (pins 29/30)", sda: "pin_29", scl: "pin_30" },
      { id: "i2c1_gpio22", label: "I2C1 on GPIO22/23 (pins 34/35)", sda: "pin_34", scl: "pin_35" },
      { id: "i2c1_gpio26", label: "I2C1 on GPIO26/27 (pins 38/39)", sda: "pin_38", scl: "pin_39" },
    ],
  }),
  "i2c_1",
  I2C_TRAITS(1, "Seven fixed SDA/SCL pairs: GPIO2/3, 6/7, 10/11, 14/15, 18/19, 22/23, 26/27."),
);

// PWM — one block: 8 slices × 2 channels (A/B) = 16 channels, every bank-0
// GPIO carrying exactly one fixed channel via F4.
const PWM_CHANNEL_TAGS = [
  "pwm0_a", "pwm0_b", "pwm1_a", "pwm1_b", "pwm2_a", "pwm2_b", "pwm3_a", "pwm3_b",
  "pwm4_a", "pwm4_b", "pwm5_a", "pwm5_b", "pwm6_a", "pwm6_b", "pwm7_a", "pwm7_b",
];

const pwm = composed({
  id: "pwm",
  name: "PWM",
  protocolType: "pwm",
  roles: ["output"],
  slots: PWM_CHANNEL_TAGS.map((tag): SlotDef => ({
    id: tag,
    required: false,
    match: { protocol: "pwm", role: "output", capability: tag },
  })),
  maxInstances: 1,
  traits: [
    {
      type: "channels",
      params: {
        count: 16,
        detail:
          "16 channels arranged as 8 slices × 2 channels (A/B). Each slice has an independent 16-bit counter with an 8.4 fractional clock divider (8 integer + 4 fractional bits, Datasheet §4.5.1 / DIV register); channels A and B share the counter but have independent compare registers.",
        mapping:
          "Slice = floor(GPIO/2) mod 8; channel A on even GPIOs, B on odd. GPIO16-29 repeat slices 0-6, so PWM0_A appears on GPIO0 and GPIO16, etc.; PWM7_A/B appear only on GPIO14/15.",
        source: "ProtoPart pwm interface description / RP2040 Datasheet §4.5",
      },
    },
    {
      type: "measurement_input",
      params: {
        note: "The B channel can also serve as a frequency / duty-cycle measurement input.",
        source: "ProtoPart pwm interface description",
      },
    },
    {
      type: "instance_combinations",
      params: {
        instances_in_silicon: 1,
        routing: "gpio_funcsel_fixed",
        combination_space:
          "Any bank-0 GPIO via F4; the per-pin PWMn_A/PWMn_B capability tag identifies which slice/channel that pin carries.",
      },
    },
    {
      type: "application_note",
      params: {
        note: "8.4 fractional clock dividers (Datasheet §4.5.1) easily cover 22-25 kHz / 12-bit duty applications.",
        source: "ProtoPart usage_notes (divider width corrected to the datasheet's 8.4 fractional divider)",
      },
    },
  ],
});

// PIO — two programmable-I/O blocks, four state machines each (eight user
// state machines total). Any bank-0 GPIO is reachable — the RP2040's
// matrix-analogue combination space.
function pio(n: 0 | 1): InterfaceDef {
  return composed({
    id: `pio${n}`,
    name: `PIO${n} (Programmable I/O Block ${n})`,
    protocolType: "pio",
    roles: ["input", "output"],
    slots: [
      { id: "gpio", required: false, count: 30, match: { capability: `pio${n}` } },
    ],
    maxInstances: 4, // state machines in this block
    traits: [
      {
        type: "channels",
        params: {
          count: 4,
          detail: "Four user-programmable I/O state machines per block; eight total across PIO0/PIO1.",
          source: "ProtoPart metadata description / usage_notes",
        },
      },
      {
        type: "instance_combinations",
        params: {
          instances_in_silicon: 4,
          routing: "gpio_funcsel_fixed",
          combination_space: `Any bank-0 GPIO (GPIO0-29) via funcsel F${6 + n}; QSPI-bank pads are not reachable.`,
        },
      },
      {
        type: "application_note",
        params: {
          note: "Especially good for protocols not natively supported: I2S, SK6812 / WS2812 LED data, parallel pixel buses (CSI/DPI capture), software USB host.",
          source: "ProtoPart usage_notes / application_examples",
        },
      },
    ],
  });
}

// WS2812 / NeoPixel driver — a PIO application the ProtoPart definition
// promotes to a first-class interface (datasheet §3.6.2).
const ws2812 = composed({
  id: "ws2812",
  name: "NeoPixel / WS2812B LED Control",
  protocolType: "digital",
  roles: ["transmitter"],
  parameters: [
    { id: "bit_rate", name: "NRZ wire bit rate", unit: "Hz", value: 800_000 },
  ],
  slots: [
    // The `pio0` tag spans exactly the 30 bank-0 GPIOs — the honest pin space
    // (the program can run on either PIO block; QSPI pads are unreachable).
    { id: "data", required: true, match: { protocol: "digital", role: "output", capability: "pio0" } },
  ],
  maxInstances: 8, // bounded by the eight PIO state machines
  traits: [
    {
      type: "implemented_by",
      params: {
        note: "WS2812 / NeoPixel-family LED data line driver implemented via a PIO state machine (Datasheet §3.6.2 'WS2812 LEDs'); bit timing is held in the PIO program. One bank-0 GPIO drives a daisy-chain of LEDs using the canonical ~800 kbit/s NRZ wire protocol.",
        consumes: "one PIO state machine per instance",
        source: "ProtoPart ws2812 interface description",
      },
    },
    {
      type: "instance_combinations",
      params: {
        instances_in_silicon: 8,
        routing: "gpio_funcsel_fixed",
        combination_space: "Any GPIO0-29 can serve as the data pin.",
      },
    },
  ],
});

// QSPI flash bus — the XIP boot path. Dedicated bank-1 pads; mandatory for
// running user code.
const qspiFlash = composed({
  id: "qspi_flash",
  name: "Quad-SPI (XIP Flash Bus)",
  protocolType: "spi",
  roles: ["master"],
  parameters: [
    { id: "max_data_rate", name: "Max data rate (QSPI quad-SDR)", unit: "bit/s", value: 133_000_000 },
  ],
  slots: [
    { id: "sclk", required: true, match: { protocol: "spi", role: "clock", capability: "qspi_sclk" } },
    { id: "ss_n", required: true, match: { protocol: "spi", role: "select", capability: "qspi_ss_n" } },
    { id: "sd0", required: true, match: { capability: "qspi_sd0" } },
    { id: "sd1", required: true, match: { capability: "qspi_sd1" } },
    { id: "sd2", required: true, match: { capability: "qspi_sd2" } },
    { id: "sd3", required: true, match: { capability: "qspi_sd3" } },
  ],
  profiles: [
    {
      id: "qspi_flash_fixed",
      label: "Dedicated QSPI pads (pins 51-56)",
      default_active: true,
      bindings: {
        sclk: "pin_52",
        ss_n: "pin_56",
        sd0: "pin_53",
        sd1: "pin_55",
        sd2: "pin_54",
        sd3: "pin_51",
      },
    },
  ],
  maxInstances: 1,
  defaultActive: true,
  traits: [
    {
      type: "instance_combinations",
      params: {
        instances_in_silicon: 1,
        routing: "dedicated_pads",
        combination_space: "Exactly one pin set — the QSPI flash bus is not muxed onto bank-0 GPIOs.",
      },
    },
    {
      type: "co_requirement",
      params: {
        with: "external QSPI flash",
        condition: "always",
        effect:
          "External QSPI flash is mandatory — the RP2040 has no internal flash and cannot boot or run user code without it (typically 2-16 MB). Use a flash compatible with the chip's XIP boot ROM (typically Winbond W25Q-series).",
        source: "ProtoPart qspi_flash description / design_rules / warnings",
      },
    },
    { type: "protopart_constraints", params: { requires_matching_voltage_domain: true } },
  ],
});

// USB 1.1 PHY — one PHY, two mutually exclusive modes. The ProtoPart
// definition models device and host as separate interfaces; the
// `usb_phy_mode` interface group below enforces one-of.
function usbMode(mode: "device" | "host", traits: TraitDef[]): InterfaceDef {
  return composed({
    id: `usb_${mode}`,
    name: mode === "device" ? "USB 1.1 Device" : "USB 1.1 Host",
    protocolType: "usb",
    roles: [mode],
    slots: [
      { id: "dp", required: true, match: { protocol: "usb", role: "data_plus", capability: "usb_dp" } },
      { id: "dm", required: true, match: { protocol: "usb", role: "data_minus", capability: "usb_dm" } },
    ],
    profiles: [
      {
        id: `usb_${mode}_pins`,
        label: "USB_DP / USB_DM (pins 47/46)",
        bindings: { dp: "pin_47", dm: "pin_46" },
      },
    ],
    maxInstances: 1,
    traits: [
      {
        type: "co_requirement",
        params: {
          with: "pin_48",
          condition: "always",
          effect: "The USB PHY is powered from the dedicated USB_VDD rail (3.135-3.63 V).",
        },
      },
      {
        type: "co_requirement",
        params: {
          with: mode === "device" ? "usb_host" : "usb_device",
          condition: `usb_${mode === "device" ? "host" : "device"} active`,
          effect: "One PHY: device and host modes are mutually exclusive (see the usb_phy_mode interface group).",
        },
      },
      ...traits,
    ],
  });
}

const usbDevice = usbMode("device", [
  {
    type: "boot_rom_role",
    params: {
      note: "In device mode used for the BOOTSEL UF2 mass-storage interface and user firmware CDC/HID.",
      source: "ProtoPart usb_device description",
    },
  },
]);

const usbHost = usbMode("host", [
  {
    type: "operating_modes",
    params: {
      modes: ["full-speed", "low-speed"],
      note: "USB 1.1 host mode supports Full Speed and Low Speed devices (software stack required).",
      source: "RP2040 Datasheet Table 1 / §1.2 ('Full Speed device and Full/Low Speed host') — corrects the ProtoPart usb_host description's 'full-speed only'",
    },
  },
]);

// USB VBUS management — F9 mux signals, each available on ten fixed GPIOs.
function usbMgmt(config: {
  id: string;
  name: string;
  cap: string;
  role: "input" | "output";
  gpios: string;
  description: string;
}): InterfaceDef {
  return composed({
    id: config.id,
    name: config.name,
    protocolType: "digital",
    roles: [config.role],
    slots: [{ id: "signal", required: true, match: { capability: config.cap } }],
    maxInstances: 1,
    traits: [
      {
        type: "instance_combinations",
        params: {
          instances_in_silicon: 1,
          routing: "gpio_funcsel_fixed",
          combination_space: config.gpios,
          source: "RP2040 Datasheet §1.4.3 Table 2 (F9 column); ProtoPart interface description",
        },
      },
      { type: "description", params: { note: config.description } },
    ],
  });
}

const usbVbusDetect = usbMgmt({
  id: "usb_vbus_detect",
  name: "USB VBUS Detect",
  cap: "usb_vbus_det",
  role: "input",
  gpios: "Available on GPIO1, 4, 7, 10, 13, 16, 19, 22, 25, 28 per Datasheet Table 2.",
  description:
    "USB VBUS detection input via GPIO F9 mux (USB_VBUS_DET). Read this signal to know when the USB host is providing bus power.",
});

const usbVbusEnable = usbMgmt({
  id: "usb_vbus_enable",
  name: "USB VBUS Enable",
  cap: "usb_vbus_en",
  role: "output",
  gpios: "Available on GPIO2, 5, 8, 11, 14, 17, 20, 23, 26, 29 per Datasheet Table 2.",
  description:
    "USB VBUS enable output via GPIO F9 mux (USB_VBUS_EN). Drives an external USB host power switch (e.g. TPS2051) in host mode.",
});

const usbOvercurrentDetect = usbMgmt({
  id: "usb_overcurrent_detect",
  name: "USB Over-current Detect",
  cap: "usb_ovcur_det",
  role: "input",
  gpios: "Available on GPIO0, 3, 6, 9, 12, 15, 18, 21, 24, 27 per Datasheet Table 2.",
  description:
    "USB over-current detection input via GPIO F9 mux (USB_OVCUR_DET). Reads the active-low overcurrent flag from an external USB power switch in host mode.",
});

// General-purpose clock I/O — F8 mux: two GPIN slots, four GPOUT slots, each
// fixed to one GPIO. (The ProtoPart definition types these as digital
// interfaces; they are modelled here with the clock protocol, matching the
// gold-standard convention for clock pins.)
const clockGpInput = composed({
  id: "clock_gp_input",
  name: "Clock GP Input",
  protocolType: "clock",
  roles: ["input"],
  slots: [{ id: "in", required: true, match: { capability: "clock_gpin" } }],
  profiles: [
    { id: "clock_gpin0", label: "CLOCK_GPIN0 (GPIO20, pin 31)", bindings: { in: "pin_31" } },
    { id: "clock_gpin1", label: "CLOCK_GPIN1 (GPIO22, pin 34)", bindings: { in: "pin_34" } },
  ],
  maxInstances: 2,
  traits: [
    {
      type: "instance_combinations",
      params: {
        instances_in_silicon: 2,
        routing: "gpio_funcsel_fixed",
        combination_space: "CLOCK_GPIN0 on GPIO20 (pin 31), CLOCK_GPIN1 on GPIO22 (pin 34) via F8 — no other pins.",
        source: "RP2040 Datasheet §1.4.3 Table 3 / §2.15.2; ProtoPart clock_gp_input description",
      },
    },
    {
      type: "description",
      params: {
        note: "Routes an external clock signal into the chip's clocks block as an alternative reference (e.g. to drive clk_ref or feed the frequency counter).",
      },
    },
  ],
});

const clockGpOutput = composed({
  id: "clock_gp_output",
  name: "Clock GP Output",
  protocolType: "clock",
  roles: ["output"],
  slots: [{ id: "out", required: true, match: { capability: "clock_gpout" } }],
  profiles: [
    { id: "clock_gpout0", label: "CLOCK_GPOUT0 (GPIO21, pin 32)", bindings: { out: "pin_32" } },
    { id: "clock_gpout1", label: "CLOCK_GPOUT1 (GPIO23, pin 35)", bindings: { out: "pin_35" } },
    { id: "clock_gpout2", label: "CLOCK_GPOUT2 (GPIO24, pin 36)", bindings: { out: "pin_36" } },
    { id: "clock_gpout3", label: "CLOCK_GPOUT3 (GPIO25, pin 37)", bindings: { out: "pin_37" } },
  ],
  maxInstances: 4,
  traits: [
    {
      type: "instance_combinations",
      params: {
        instances_in_silicon: 4,
        routing: "gpio_funcsel_fixed",
        combination_space:
          "CLOCK_GPOUT0-3 fixed to GPIO21 (pin 32), GPIO23 (pin 35), GPIO24 (pin 36), GPIO25 (pin 37) via F8.",
        source: "RP2040 Datasheet §1.4.3 Table 3 / §2.15.2; ProtoPart clock_gp_output description",
      },
    },
    {
      type: "description",
      params: {
        note: "Drives any selected internal clock (PLL outputs, clk_sys, etc.) onto a GPIO with optional integer divide, for use by other parts.",
      },
    },
  ],
});

// Crystal oscillator — Pierce XOSC on the dedicated XIN/XOUT pads.
const crystalOscillator = composed({
  id: "crystal_oscillator",
  name: "External Crystal Oscillator (XOSC)",
  protocolType: "clock",
  roles: ["input"],
  parameters: [clockFreqHz(12_000_000)], // the USB bootloader requires 12 MHz
  slots: [
    { id: "xin", required: true, match: { protocol: "clock", role: "input", capability: "xtal_in" } },
    // Optional: left open when XIN is driven by a single-ended CMOS clock.
    { id: "xout", required: false, match: { protocol: "clock", role: "output", capability: "xtal_out" } },
  ],
  profiles: [
    {
      id: "xosc_pins",
      label: "XIN/XOUT (pins 20/21)",
      default_active: true,
      bindings: { xin: "pin_20", xout: "pin_21" },
    },
  ],
  maxInstances: 1,
  defaultActive: true,
  traits: [
    {
      type: "oscillator_topology",
      params: {
        note: "Pierce-type crystal oscillator (XOSC, Datasheet §2.16). XIN and XOUT form the inverter terminals of an on-chip Pierce circuit driving an external crystal. Drives clk_ref / the PLLs.",
        source: "ProtoPart crystal_oscillator description",
      },
    },
    {
      type: "implied_passives",
      params: {
        purpose: "Crystal load",
        components: [
          { kind: "capacitor", value: "per crystal vendor C_L spec", connection: "XIN to GND" },
          { kind: "capacitor", value: "per crystal vendor C_L spec", connection: "XOUT to GND" },
        ],
        source: "ProtoPart crystal_oscillator description ('external crystal with two load capacitors to ground')",
      },
    },
    {
      type: "co_requirement",
      params: {
        with: "usb_device, usb_host",
        condition: "USB bootloader / USB in use",
        effect:
          "The USB bootloader requires a 12 MHz crystal (or a 12 MHz CMOS clock driven into XIN with XOUT left open, per §1.4.2 / §2.16.2).",
        source: "ProtoPart pin 20 / crystal_oscillator descriptions",
      },
    },
    {
      type: "alternative_drive",
      params: {
        note: "XIN may instead be driven by a single-ended CMOS clock with XOUT disconnected.",
      },
    },
  ],
});

// SWD — dedicated two-wire debug port to both Cortex-M0+ cores.
const swd = composed({
  id: "swd",
  name: "SWD (Serial Wire Debug)",
  protocolType: "swd",
  roles: ["target"],
  slots: [
    { id: "swclk", required: true, match: { capability: "swd_clk" } },
    { id: "swdio", required: true, match: { capability: "swd_io" } },
  ],
  profiles: [
    { id: "swd_pins", label: "SWCLK/SWDIO (pins 24/25)", bindings: { swclk: "pin_24", swdio: "pin_25" } },
  ],
  maxInstances: 1,
  traits: [
    {
      type: "description",
      params: {
        note: "Serial Wire Debug interface to both Cortex-M0+ cores (Datasheet §2.3.4). Dedicated multi-drop SWD bus on SWCLK (pin 24) and SWDIO (pin 25), each with internal pull-up at reset. Used for debugging and to download code over the bus.",
        source: "ProtoPart swd interface description",
      },
    },
  ],
});

// RUN reset — the ProtoPart `reset_input` interface.
const resetInput = composed({
  id: "reset_input",
  name: "RUN Reset",
  protocolType: "digital",
  roles: ["input"],
  slots: [{ id: "run", required: true, match: { capability: "run_reset" } }],
  profiles: [
    { id: "run_pin", label: "RUN (pin 26)", default_active: true, bindings: { run: "pin_26" } },
  ],
  maxInstances: 1,
  defaultActive: true,
  traits: [
    {
      type: "description",
      params: {
        note: "Active-low RUN pin (pin 26). Drive low to hold the RP2040 in reset; has internal pull-up so it can be left unconnected or tied to IOVDD for autonomous power-on reset.",
        source: "ProtoPart reset_input description",
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Mechanical / thermal
// ---------------------------------------------------------------------------

const footprintMount: InterfaceDef = {
  id: "footprint_mounting",
  name: "QFN-56 7×7 mm Surface-Mount Footprint",
  domain: "mechanical",
  exposed: true,
  default_active: true,
  protocols: [{ type: "mechanical_connection", roles: ["mounting_point"] }],
  capabilities: ["qfn56_7x7_0p4mm", "surface_mount"],
  traits: [
    {
      type: "assembly_requirement",
      params: {
        note: "Reflow solder to the QFN-56 land pattern. The center exposed pad must be soldered to the PCB ground plane and stitched with thermal vias for heat dissipation and electrical ground continuity.",
        source: "ProtoPart footprint_mounting description",
      },
    },
  ],
};

const thermalPad: InterfaceDef = {
  id: "thermal_pad",
  name: "Exposed Thermal Pad",
  pin: 57,
  domain: "thermal",
  exposed: true,
  default_active: true,
  protocols: [{ type: "thermal_connection", roles: ["thermal_source"] }],
  capabilities: ["heat_sink", "pcb_thermal_plane"],
  traits: [
    {
      type: "assembly_requirement",
      params: {
        note: "Same physical pad as pad_gnd (the single external ground connection); primary heat path to the PCB ground plane via thermal vias.",
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

export const RP2040: ModuleDef = defineModule({
  id: "rp2040",
  name: "Raspberry Pi RP2040",
  version: "2.0.0",
  manufacturer: "Raspberry Pi",
  part_number: "RP2040",
  description:
    "Bare-chip dual-core Arm Cortex-M0+ microcontroller in QFN-56 7×7 mm package. 264 KB SRAM with NO internal flash (external QSPI flash required for code execution via XIP). 30 multi-function GPIOs (GPIO0..GPIO29), 2x UART, 2x I2C, 2x SPI, 16 PWM channels (8 slices), 4-channel 12-bit ADC, USB 1.1 host/device PHY, and 8 user-programmable I/O state machines (PIO) across two PIO blocks. Flexible system clock up to 133 MHz default.",
  tags: [
    "rp2040",
    "raspberry-pi",
    "microcontroller",
    "arm-cortex-m0",
    "dual-core",
    "qfn-56",
    "pio",
    "usb",
    "bare-chip",
  ],
  categories: ["microcontroller.raspberry_pi"],

  interfaces: [
    // All 57 physical pads in package order — schematic-honest.
    ...pins,

    // Analog
    adc,

    // Serial / bus controllers
    ...spi0,
    ...spi1,
    ...uart0,
    ...uart1,
    ...i2c0,
    ...i2c1,
    qspiFlash,

    // Timers / programmable I/O
    pwm,
    pio(0),
    pio(1),
    ws2812,

    // USB fabric
    usbDevice,
    usbHost,
    usbVbusDetect,
    usbVbusEnable,
    usbOvercurrentDetect,

    // Clocks / debug / reset
    clockGpInput,
    clockGpOutput,
    crystalOscillator,
    swd,
    resetInput,

    // Mechanical / thermal
    footprintMount,
    thermalPad,
  ],

  interfaceGroups: [
    {
      id: "required_power_pins",
      label: "Required Power Pins",
      // IOVDD ×6, DVDD ×2, USB_VDD (must be supplied even if USB is unused —
      // ProtoPart warnings), and the exposed ground pad. VREG_VIN (pin 44) is
      // required only when the internal core LDO feeds DVDD; ADC_AVDD (pin 43)
      // is the ADC supply — the ProtoPart definition does not state either as
      // unconditionally required, so they are deliberately not listed here.
      members: [
        "pin_1", "pin_10", "pin_22", "pin_23", "pin_33", "pin_42",
        "pin_48", "pin_49", "pin_50", "pad_gnd",
      ],
      policy: "all_of",
    },
    {
      id: "iovdd_common_net",
      label: "IOVDD Pins (one 1.8-3.3 V rail)",
      members: ["pin_1", "pin_10", "pin_22", "pin_33", "pin_42", "pin_49"],
      policy: "all_of",
    },
    {
      id: "dvdd_common_net",
      label: "DVDD Pins (one 1.1 V core rail)",
      members: ["pin_23", "pin_50"],
      policy: "all_of",
    },
    {
      id: "qspi_flash_pins",
      label: "Dedicated QSPI Flash Pins",
      members: ["pin_51", "pin_52", "pin_53", "pin_54", "pin_55", "pin_56"],
      policy: "all_of",
    },
    {
      id: "usb_phy_mode",
      label: "USB PHY Mode (one PHY: device or host)",
      members: ["usb_device", "usb_host"],
      policy: "one_of",
    },
  ],

  requirements: [
    {
      type: "power",
      description:
        "IOVDD digital I/O ring: six pins (1, 10, 22, 33, 42, 49) tied to one 1.8-3.3 V rail (typical 3.3 V) — mixing rails is not supported. Sets the logic level for all GPIOs and the QSPI interface.",
      voltage_V: [1.8, 3.3],
      current_mA: 50,
    },
    {
      type: "power",
      description:
        "DVDD digital core: 1.05-1.16 V (typ 1.1 V, Table 634) on pins 23 and 50 — from VREG_VOUT (typical; VREG_VIN accepts 1.8-3.3 V) or an external 1.1 V regulator. Must not be left floating.",
      voltage_V: [1.05, 1.16],
      current_mA: 100,
    },
    {
      type: "power",
      description:
        "USB_VDD: dedicated 3.135-3.63 V (typ 3.3 V) supply for the USB 1.1 PHY (pin 48). Must be supplied even if USB is unused.",
      voltage_V: [3.135, 3.63],
      current_mA: 30,
    },
    {
      type: "interface",
      description:
        "No internal flash: the chip cannot boot or run user code without an external QSPI flash (typically 2-16 MB, Winbond W25Q-series compatible with the XIP boot ROM) on the dedicated QSPI pads (pins 51-56).",
      interface_protocol: "spi",
    },
    {
      type: "interface",
      description:
        "A 12 MHz crystal between XIN/XOUT (or a 12 MHz CMOS clock into XIN with XOUT open) is required for the USB bootloader.",
      interface_protocol: "clock",
    },
  ],

  domains: [
    {
      domain: "electrical",
      power_domains: [
        { id: "iovdd", name: "IOVDD Digital I/O Supply", nominal_voltage_V: 3.3, voltage_range_V: IOVDD_RANGE, max_current_mA: 50 },
        { id: "dvdd", name: "DVDD Digital Core Supply", nominal_voltage_V: 1.1, voltage_range_V: DVDD_RANGE, max_current_mA: 100 },
        { id: "vreg_vin", name: "Core LDO Input", nominal_voltage_V: 3.3, voltage_range_V: VREG_VIN_RANGE, max_current_mA: 100, regulation_type: "regulated" },
        { id: "usb_vdd", name: "USB PHY Supply", nominal_voltage_V: 3.3, voltage_range_V: USB_VDD_RANGE, max_current_mA: 30 },
        { id: "adc_avdd", name: "ADC Analog Supply", nominal_voltage_V: 3.3, voltage_range_V: ADC_AVDD_RANGE, max_current_mA: 5 },
        { id: "gnd", name: "Ground (exposed pad)", nominal_voltage_V: 0, voltage_range_V: [0, 0], max_current_mA: 1000 },
      ],
      metadata: {
        pin_count: 56,
        package_pins: "56 perimeter pins + exposed ground pad",
        cpu: "Dual-core Arm Cortex-M0+, up to 133 MHz default system clock",
        sram_KB: 264,
        internal_flash: "none — external QSPI flash required (XIP)",
        supply_voltage_V: [1.8, 3.3],
        power_consumption_mW: 132,
        max_operating_freq_Hz: 133_000_000,
        supports_usb: true,
        supports_hot_plug: false,
        // Verbatim ProtoPart power-domain descriptions with no PowerDomainDef home:
        power_domain_details: {
          iovdd:
            "Digital I/O ring supply (six pins: 1, 10, 22, 33, 42, 49). Sets logic level for all 30 GPIOs and QSPI flash interface. Typical 3.3 V; 1.8 V supported for low-voltage I/O. Non-isolated, common ground reference.",
          dvdd:
            "1.1 V digital core supply (pins 23 and 50). Normally driven by the on-chip core LDO from VREG_VOUT, but can be supplied externally. Per datasheet Table 634, DVDD must be 1.05-1.16 V (typ 1.1 V).",
          vreg_vin:
            "VREG_VIN input to the on-chip core voltage regulator (1.8-3.3 V). VREG_VOUT delivers ~1.1 V to DVDD.",
          usb_vdd:
            "Dedicated 3.3 V supply for the USB 1.1 PHY (USB_VDD pin 48). Per datasheet Table 634: 3.135-3.63 V (typ 3.3 V). Decouple separately from IOVDD.",
          adc_avdd:
            "Analog supply / reference for the 12-bit ADC (ADC_AVDD pin 43). Per datasheet Table 634: 1.62-3.63 V (typ 3.3 V); ADC performance is compromised below 2.97 V (datasheet §2.9.5). Filter from main 3V3 with ferrite bead to maximize ENOB.",
          gnd:
            "Common ground via the QFN-56 exposed thermal pad (center). Single external ground connection per datasheet §1.4.2; bonded to a number of internal ground pads on the RP2040 die.",
        },
        source: "ProtoPart electrical domain (power_domains + metadata); RP2040 Datasheet Table 634",
      },
    },
    {
      domain: "mechanical",
      dimensions_mm: { length: 7, width: 7, height: 0.9 },
      metadata: {
        package_type: "QFN-56 (7x7) EP",
        pitch_mm: 0.4,
        exposed_pad_mm: "3.0-3.2 (nominal 3.1) square (Datasheet §5.1 D2/E2)",
        max_height_mm: 0.9, // Datasheet Table §5.1: A max 0.900 mm
        mounting_method: "surface_mount",
        enclosure_type: "ic_package",
      },
    },
    {
      domain: "thermal",
      operating_temperature_C: [-40, 85],
      metadata: {
        thermal_design_power_W: 0.13,
        requires_thermal_management: false,
        thermal_monitoring_available: true, // internal temperature sensor on the ADC
        cooling_method: "passive",
        primary_heat_path: "exposed_pad_to_pcb_ground_plane",
      },
    },
  ],

  traits: [
    { type: "requires_external_flash", params: { interfaceId: "qspi_flash", defaultProfile: "qspi_flash_fixed" } },
    {
      type: "bare_chip_notice",
      params: {
        note: "This is the bare RP2040 chip, not a Pico board. There is no dedicated USB_BOOT pin — the board-level BOOTSEL button on the Pi Pico is wired to QSPI_SS_N (pin 56). Bare-chip BOOTSEL entry is via a pushbutton on QSPI_CS.",
        source: "ProtoPart usage_notes / warnings",
      },
    },
    {
      type: "compatibility_notes",
      params: {
        note: "Pin-compatible only with itself (RP2040). The RP2350 successor uses a different package (QFN-60) and is NOT a drop-in replacement. Most RP2040 reference layouts (Pico, Pico W, Adafruit Feather RP2040) are good starting points for new designs.",
      },
    },
    {
      type: "design_rules",
      params: {
        source: "ProtoPart definition design_rules (verbatim)",
        rules: [
          "Tie all six IOVDD pins (1, 10, 22, 33, 42, 49) to the same supply rail (1.8 V or 3.3 V). Mixing rails on IOVDD pins is not supported.",
          "Bypass each supply pin with a 100 nF ceramic close to the pin. Place a 1 uF bulk cap on each rail group.",
          "DVDD (pins 23, 50) must be supplied either by VREG_VOUT (typical) or an external 1.1 V regulator. Keep DVDD within 1.05-1.16 V per datasheet Table 634 (use 1.15 V if running clk_sys at 200 MHz).",
          "Connect the QFN-56 center pad to the PCB ground plane with multiple thermal vias for both heat dissipation and ground reference integrity. This pad is the single external ground connection on the bare chip.",
          "External QSPI flash is mandatory — the RP2040 has no internal flash. Use a flash compatible with the chip's XIP boot ROM (typically Winbond W25Q-series).",
          "Keep VREG_VOUT decoupling close to pin 45 and route to both DVDD pins (23, 50) with low impedance.",
          "Filter ADC_AVDD (pin 43) with a ferrite bead from 3V3 plus 1 uF + 100 nF for best ENOB.",
          "USB_VDD (pin 48) must come from the same 3.3 V rail with its own decoupling; route USB_DP/USB_DM (pins 47/46) as a 90 ohm differential pair (Hardware Design with RP2040 §2.4.1) with 27 ohm series termination resistors per datasheet §1.4.2.",
          "Tie TESTEN (pin 19) to GND in production designs; floating TESTEN may cause incorrect boot behavior.",
          "To support firmware loading via the USB BOOTSEL UF2 path at the board level, route QSPI_SS_N (pin 56) through a momentary pushbutton-to-GND. Pulling QSPI_CS low during reset forces the boot ROM into UF2 mass-storage mode.",
        ],
      },
    },
    {
      type: "warnings",
      params: {
        source: "ProtoPart definition warnings (verbatim)",
        warnings: [
          "No internal flash. The chip cannot boot or run user code without an external QSPI flash (typically 2-16 MB).",
          "All GPIO are 3.3 V (or 1.8 V) digital — NOT 5 V tolerant. Apply level shifting for 5 V signals.",
          "The voltage on ADC inputs must not exceed IOVDD — voltages above IOVDD leak through the ESD protection diodes (Datasheet §2.9.5 note; absolute maximum pin voltage IOVDD + 0.5 V per Table 622). [Corrected from the ProtoPart 'clamped to ADC_AVDD + 0.3 V' wording.]",
          "DVDD pins (23, 50) must not be left floating. Connect to VREG_VOUT (typical) or an external 1.1 V supply.",
          "The exposed center pad must be soldered to ground — it is the single external GND connection. Leaving it floating violates ground reference, increases noise, and degrades thermal performance.",
          "USB_VDD must be supplied even if USB is unused; otherwise the USB PHY draws leakage current that may keep the chip from entering low-power states cleanly.",
          "TESTEN (pin 19) must be tied to GND. A floating TESTEN can place the chip in factory test mode and prevent normal boot.",
          "There is no dedicated USB_BOOT pin on the bare RP2040 chip. The board-level BOOTSEL button on the Pi Pico is wired to QSPI_CS (pin 56), not to a separate USB_BOOT pin.",
        ],
      },
    },
    {
      type: "usage_notes",
      params: {
        source: "ProtoPart definition usage_notes (verbatim)",
        note: "Bare-chip dual-core Cortex-M0+ at 133 MHz with 264 KB SRAM. Requires external QSPI flash for user code (no internal flash). Strong PIO subsystem (8 user state machines) makes it especially good for protocols not natively supported (I2S, SK6812 / WS2812 LED data, parallel pixel buses, software USB host). 16 PWM channels (8 slices x A/B) with 8.4 fractional clock dividers (Datasheet §4.5.1) — easily covers 22-25 kHz / 12-bit duty applications. 4-channel 12-bit ADC plus internal temperature sensor; effective ENOB ~9 bits without filtering. USB 1.1 PHY supports both device (BOOTSEL UF2 + user CDC/HID) and host modes. SWD debug via SWCLK (pin 24) / SWDIO (pin 25). Bare-chip BOOTSEL entry is via a pushbutton on QSPI_CS (pin 56), not a dedicated USB_BOOT pin — that pin only exists on board-level products like the Pi Pico.",
      },
    },
    {
      type: "application_examples",
      params: {
        source: "ProtoPart definition application_examples (verbatim)",
        examples: [
          "Audio effects co-processor with PIO-based I2S receive and bass-band FFT envelope tracking",
          "Multi-channel SK6812 / WS2812 LED ring driver via PIO",
          "Cost-sensitive USB MIDI / HID device",
          "Closed-loop coil drivers (e.g. 22-25 kHz / 12-bit duty PWM into MOSFET gates)",
          "Educational and hobbyist Pico-class boards",
          "Industrial sensor hubs with parallel CSI / DPI capture via PIO",
          "I2C peripheral acting as command relay between a host MCU/BT SoC and on-board effects engine",
        ],
      },
    },
    {
      type: "terminology_policy",
      params: {
        note: "Signal and function names in `rp2040_pin_functions` traits are ProtoPart/datasheet-verbatim and intentionally NOT normalised to a curated whitelist; canonical capability tags exist only where slot matching requires them. The ProtoPart per-pin generic entries (pwm_out, CLOCK_GPIN, CLOCK_GPOUT, SIO, PIO0, PIO1) are represented as capability tags plus the F4/F5/F6/F7/F8 rows of each pin's function list.",
      },
    },
  ],

  artifacts: [
    {
      id: "art_datasheet",
      name: "RP2040 Datasheet",
      type: "datasheet",
      url: "https://datasheets.raspberrypi.com/rp2040/rp2040-datasheet.pdf",
    },
    {
      id: "art_hardware_design",
      name: "Hardware Design with RP2040",
      type: "datasheet",
      url: "https://datasheets.raspberrypi.com/rp2040/hardware-design-with-rp2040.pdf",
    },
    {
      id: "art_product_page",
      name: "Raspberry Pi RP2040 product page",
      type: "documentation",
      url: "https://www.raspberrypi.com/products/rp2040/",
    },
    {
      id: "art_mfg_image",
      name: "RP2040 manufacturer photo (DigiKey)",
      type: "custom",
      filePath: "./ProtoPart/protoparts/rp2040/artifacts/images/MFG_RP2040.jpg",
      mimeType: "image/jpeg",
      tags: ["image", "product-photo"],
    },
    {
      id: "art_snapeda",
      name: "SnapEDA part page",
      type: "cad",
      url: "https://www.snapeda.com/parts/SC0914(13)/Raspberry%20Pi/view-part/?ref=digikey",
    },
    {
      id: "art_ultralibrarian",
      name: "UltraLibrarian part page",
      type: "cad",
      url: "https://app.ultralibrarian.com/details/A6F27E67-2E9C-11ED-B159-0A34D6323D74/Raspberry-Pi/SC0914-13-?ref=digikey",
    },
    {
      id: "art_digikey_forum_compare",
      name: "DigiKey forum: SC0914-7 vs SC0914-13",
      type: "documentation",
      url: "https://forum.digikey.com/t/sc0914-7-vs-sc0914-13-raspberry-pi-comparison/19824",
    },
  ],

  geometry: {
    xScale: 1,
    yScale: 1,
    outline: { preset: "rectangle" },
  },
});
