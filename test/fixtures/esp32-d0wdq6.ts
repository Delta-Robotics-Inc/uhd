import type { InterfaceDef, ModuleDef, SlotDef } from "../../src/types/index.js";
import {
  ADC,
  DAC,
  Ground,
  I2C,
  Pin,
  PowerIn,
  SPI,
  UART,
  defineModule,
  type PinConfig,
} from "../../src/protocols/index.js";

type Esp32PinConfig = PinConfig & {
  functions: string[];
  extraCapabilities?: string[];
  sourceCurrentmA?: number;
  sinkCurrentmA?: number;
  strapping?: boolean;
  externalFlashPad?: boolean;
};

const VDD_RTC: [number, number] = [2.3, 3.6];
const VDD_IO: [number, number] = [1.8, 3.6];
const GPIO_DRIVE_MA = 28;

const MATRIX_IN = ["twai_rx", "rmt_in"];
const MATRIX_OUT = ["twai_tx", "twai_clkout", "rmt_out", "clk_out"];
const MATRIX_BIDIR = [...MATRIX_IN, ...MATRIX_OUT];

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function addTraits(
  iface: InterfaceDef,
  capabilities: string[],
  params: Record<string, unknown>,
): InterfaceDef {
  return {
    ...iface,
    capabilities: unique([...(iface.capabilities ?? []), ...capabilities]),
    traits: [
      ...(iface.traits ?? []),
      { type: "esp32_pin_functions", params },
    ],
  };
}

function esp32Pin(config: Esp32PinConfig): InterfaceDef {
  const {
    functions,
    extraCapabilities = [],
    sourceCurrentmA,
    sinkCurrentmA,
    strapping,
    externalFlashPad,
    ...pinConfig
  } = config;

  const capabilities = [...extraCapabilities];
  if (strapping) capabilities.push("strapping_pin");
  if (externalFlashPad) capabilities.push("external_flash_pad");

  return addTraits(Pin(pinConfig), capabilities, {
    functions,
    ...(sourceCurrentmA !== undefined || sinkCurrentmA !== undefined
      ? { current_mA: { source: sourceCurrentmA, sink: sinkCurrentmA } }
      : {}),
    ...(strapping ? { boot_strapping_pin: true } : {}),
    ...(externalFlashPad ? { normally_reserved_for_external_flash: true } : {}),
  });
}

function digitalInput(
  id: string,
  name: string,
  pin: number,
  capabilities: string[],
): InterfaceDef {
  return {
    id,
    name,
    pin,
    domain: "electrical",
    exposed: true,
    default_active: true,
    protocols: [{ type: "digital", roles: ["input"] }],
    capabilities: ["digital_in", ...capabilities],
    parameters: [{ id: "voltage", unit: "V", range: VDD_RTC }],
  };
}

function composed(
  id: string,
  name: string,
  protocolType: string,
  roles: string[],
  slots: SlotDef[],
  profiles?: InterfaceDef["profiles"],
  maxInstances?: number,
  defaultActive = false,
  domain: InterfaceDef["domain"] = "electrical",
): InterfaceDef {
  return {
    id,
    name,
    domain,
    exposed: true,
    default_active: defaultActive,
    protocols: [{ type: protocolType, roles }],
    slots,
    ...(profiles ? { profiles } : {}),
    ...(maxInstances !== undefined ? { max_instances: maxInstances } : {}),
  };
}

const powerPins: InterfaceDef[] = [
  PowerIn({ id: "vdda_1", name: "VDDA Analog Supply 1", pin: 1, voltageV: VDD_RTC, nominalV: 3.3, maxCurrentA: 0.5 }),
  PowerIn({ id: "vdd3p3_3", name: "VDD3P3 RF PA Supply 1", pin: 3, voltageV: VDD_RTC, nominalV: 3.3, maxCurrentA: 0.5 }),
  PowerIn({ id: "vdd3p3_4", name: "VDD3P3 RF PA Supply 2", pin: 4, voltageV: VDD_RTC, nominalV: 3.3, maxCurrentA: 0.5 }),
  PowerIn({ id: "vdd3p3_rtc", name: "VDD3P3 RTC IO Supply", pin: 19, voltageV: VDD_RTC, nominalV: 3.3, maxCurrentA: 0.04 }),
  {
    id: "vdd_sdio",
    name: "VDD_SDIO Supply",
    pin: 26,
    domain: "electrical",
    exposed: true,
    default_active: true,
    protocols: [{ type: "power", roles: ["input", "output"] }],
    parameters: [
      { id: "voltage", unit: "V", value: 3.3, range: VDD_IO },
      { id: "max_current", unit: "A", value: 0.04 },
    ],
    capabilities: ["vdd_sdio"],
  },
  PowerIn({ id: "vdd3p3_cpu", name: "VDD3P3 CPU IO Supply", pin: 37, voltageV: VDD_IO, nominalV: 3.3, maxCurrentA: 0.04 }),
  PowerIn({ id: "vdda_43", name: "VDDA Analog Supply 2", pin: 43, voltageV: VDD_RTC, nominalV: 3.3, maxCurrentA: 0.5 }),
  PowerIn({ id: "vdda_46", name: "VDDA Analog Supply 3", pin: 46, voltageV: VDD_RTC, nominalV: 3.3, maxCurrentA: 0.5 }),
  Ground({ id: "gnd", name: "Exposed Ground / Thermal Pad", pin: 49, maxCurrentA: 1.2 }),
];

const specialPins: InterfaceDef[] = [
  {
    id: "lna_in",
    name: "LNA_IN 2.4 GHz RF Feed",
    pin: 2,
    domain: "electrical",
    exposed: true,
    default_active: true,
    protocols: [{ type: "rf", roles: ["transceiver"] }],
    capabilities: ["rf_2g4_antenna_feed"],
    parameters: [
      { id: "impedance", unit: "ohm", value: 50 },
      { id: "frequency", unit: "Hz", range: [2_400_000_000, 2_500_000_000] },
    ],
    bridgesTo: ["wifi_radio", "bluetooth_radio"],
  },
  digitalInput("chip_pu", "CHIP_PU Enable", 9, ["chip_enable", "reset_input"]),
  {
    id: "xtal_n",
    name: "XTAL_N Crystal Output",
    pin: 44,
    domain: "electrical",
    exposed: true,
    default_active: true,
    protocols: [{ type: "clock", roles: ["output"] }],
    capabilities: ["crystal_out"],
    parameters: [{ id: "clock_freq", unit: "Hz", value: 40_000_000 }],
  },
  {
    id: "xtal_p",
    name: "XTAL_P Crystal Input",
    pin: 45,
    domain: "electrical",
    exposed: true,
    default_active: true,
    protocols: [{ type: "clock", roles: ["input"] }],
    capabilities: ["crystal_in"],
    parameters: [{ id: "clock_freq", unit: "Hz", value: 40_000_000 }],
  },
  {
    id: "cap2",
    name: "CAP2 Bias Network Pin",
    pin: 47,
    domain: "electrical",
    exposed: true,
    default_active: true,
    protocols: [{ type: "analog", roles: ["input"] }],
    capabilities: ["bias_capacitor_pin"],
  },
  {
    id: "cap1",
    name: "CAP1 Bias Capacitor Pin",
    pin: 48,
    domain: "electrical",
    exposed: true,
    default_active: true,
    protocols: [{ type: "analog", roles: ["input"] }],
    capabilities: ["bias_capacitor_pin"],
  },
];

const gpioPins: InterfaceDef[] = [
  esp32Pin({
    id: "sensor_vp",
    name: "GPIO36 / SENSOR_VP / ADC1_CH0",
    pin: 5,
    voltageV: VDD_RTC,
    capabilities: { inputOnly: true, analogIn: true, interrupt: true },
    functions: ["GPIO36", "ADC1_CH0", "RTC_GPIO0", "SENSOR_VP"],
    extraCapabilities: ["gpio36", "adc1_ch0", "rtc_gpio0", ...MATRIX_IN],
  }),
  esp32Pin({
    id: "sensor_capp",
    name: "GPIO37 / SENSOR_CAPP / ADC1_CH1",
    pin: 6,
    voltageV: VDD_RTC,
    capabilities: { inputOnly: true, analogIn: true, interrupt: true },
    functions: ["GPIO37", "ADC1_CH1", "RTC_GPIO1", "SENSOR_CAPP"],
    extraCapabilities: ["gpio37", "adc1_ch1", "rtc_gpio1", ...MATRIX_IN],
  }),
  esp32Pin({
    id: "sensor_capn",
    name: "GPIO38 / SENSOR_CAPN / ADC1_CH2",
    pin: 7,
    voltageV: VDD_RTC,
    capabilities: { inputOnly: true, analogIn: true, interrupt: true },
    functions: ["GPIO38", "ADC1_CH2", "RTC_GPIO2", "SENSOR_CAPN"],
    extraCapabilities: ["gpio38", "adc1_ch2", "rtc_gpio2", ...MATRIX_IN],
  }),
  esp32Pin({
    id: "sensor_vn",
    name: "GPIO39 / SENSOR_VN / ADC1_CH3",
    pin: 8,
    voltageV: VDD_RTC,
    capabilities: { inputOnly: true, analogIn: true, interrupt: true },
    functions: ["GPIO39", "ADC1_CH3", "RTC_GPIO3", "SENSOR_VN"],
    extraCapabilities: ["gpio39", "adc1_ch3", "rtc_gpio3", ...MATRIX_IN],
  }),
  esp32Pin({
    id: "vdet_1",
    name: "GPIO34 / VDET_1 / ADC1_CH6",
    pin: 10,
    voltageV: VDD_RTC,
    capabilities: { inputOnly: true, analogIn: true, interrupt: true },
    functions: ["GPIO34", "ADC1_CH6", "RTC_GPIO4", "VDET_1"],
    extraCapabilities: ["gpio34", "adc1_ch6", "rtc_gpio4", ...MATRIX_IN],
  }),
  esp32Pin({
    id: "vdet_2",
    name: "GPIO35 / VDET_2 / ADC1_CH7",
    pin: 11,
    voltageV: VDD_RTC,
    capabilities: { inputOnly: true, analogIn: true, interrupt: true },
    functions: ["GPIO35", "ADC1_CH7", "RTC_GPIO5", "VDET_2"],
    extraCapabilities: ["gpio35", "adc1_ch7", "rtc_gpio5", ...MATRIX_IN],
  }),
  esp32Pin({
    id: "32k_xp",
    name: "GPIO32 / ADC1_CH4 / TOUCH9 / 32K_XP",
    pin: 12,
    voltageV: VDD_RTC,
    driveCurrentmA: GPIO_DRIVE_MA,
    capabilities: { pwm: true, interrupt: true, analogIn: true, touch: true, i2cSda: true, i2cScl: true },
    functions: ["GPIO32", "ADC1_CH4", "RTC_GPIO9", "TOUCH9", "32K_XP"],
    extraCapabilities: ["gpio32", "adc1_ch4", "rtc_gpio9", "touch9", "xtal_32k_xp", ...MATRIX_BIDIR],
    sourceCurrentmA: 40,
    sinkCurrentmA: 28,
  }),
  esp32Pin({
    id: "32k_xn",
    name: "GPIO33 / ADC1_CH5 / TOUCH8 / 32K_XN",
    pin: 13,
    voltageV: VDD_RTC,
    driveCurrentmA: GPIO_DRIVE_MA,
    capabilities: { pwm: true, interrupt: true, analogIn: true, touch: true, i2cSda: true, i2cScl: true },
    functions: ["GPIO33", "ADC1_CH5", "RTC_GPIO8", "TOUCH8", "32K_XN"],
    extraCapabilities: ["gpio33", "adc1_ch5", "rtc_gpio8", "touch8", "xtal_32k_xn", ...MATRIX_BIDIR],
    sourceCurrentmA: 40,
    sinkCurrentmA: 28,
  }),
  esp32Pin({
    id: "gpio25",
    name: "GPIO25 / ADC2_CH8 / DAC_1 / EMAC_RXD0",
    pin: 14,
    voltageV: VDD_RTC,
    driveCurrentmA: GPIO_DRIVE_MA,
    capabilities: { pwm: true, interrupt: true, analogIn: true, analogOut: true, i2cSda: true, i2cScl: true },
    functions: ["GPIO25", "ADC2_CH8", "RTC_GPIO6", "DAC_1", "EMAC_RXD0"],
    extraCapabilities: ["gpio25", "adc2_ch8", "rtc_gpio6", "dac1", "emac_rxd0", ...MATRIX_BIDIR],
    sourceCurrentmA: 40,
    sinkCurrentmA: 28,
  }),
  esp32Pin({
    id: "gpio26",
    name: "GPIO26 / ADC2_CH9 / DAC_2 / EMAC_RXD1",
    pin: 15,
    voltageV: VDD_RTC,
    driveCurrentmA: GPIO_DRIVE_MA,
    capabilities: { pwm: true, interrupt: true, analogIn: true, analogOut: true, i2cSda: true, i2cScl: true },
    functions: ["GPIO26", "ADC2_CH9", "RTC_GPIO7", "DAC_2", "EMAC_RXD1"],
    extraCapabilities: ["gpio26", "adc2_ch9", "rtc_gpio7", "dac2", "emac_rxd1", ...MATRIX_BIDIR],
    sourceCurrentmA: 40,
    sinkCurrentmA: 28,
  }),
  esp32Pin({
    id: "gpio27",
    name: "GPIO27 / ADC2_CH7 / TOUCH7 / EMAC_RX_DV",
    pin: 16,
    voltageV: VDD_RTC,
    driveCurrentmA: GPIO_DRIVE_MA,
    capabilities: { pwm: true, interrupt: true, analogIn: true, touch: true, i2cSda: true, i2cScl: true },
    functions: ["GPIO27", "ADC2_CH7", "RTC_GPIO17", "TOUCH7", "EMAC_RX_DV"],
    extraCapabilities: ["gpio27", "adc2_ch7", "rtc_gpio17", "touch7", "emac_rx_dv", ...MATRIX_BIDIR],
    sourceCurrentmA: 40,
    sinkCurrentmA: 28,
  }),
  esp32Pin({
    id: "mtms",
    name: "GPIO14 / MTMS / HSPICLK / ADC2_CH6",
    pin: 17,
    voltageV: VDD_RTC,
    driveCurrentmA: GPIO_DRIVE_MA,
    capabilities: { pwm: true, interrupt: true, analogIn: true, touch: true, i2cSda: true, i2cScl: true, spiSck: true },
    functions: ["GPIO14", "ADC2_CH6", "RTC_GPIO16", "TOUCH6", "EMAC_TXD2", "HSPICLK", "HS2_CLK", "SD_CLK", "MTMS"],
    extraCapabilities: ["gpio14", "adc2_ch6", "rtc_gpio16", "touch6", "emac_txd2", "sdio_clk", "jtag_tms", ...MATRIX_BIDIR],
    sourceCurrentmA: 40,
    sinkCurrentmA: 28,
  }),
  esp32Pin({
    id: "mtdi",
    name: "GPIO12 / MTDI / HSPIQ / ADC2_CH5",
    pin: 18,
    voltageV: VDD_RTC,
    driveCurrentmA: GPIO_DRIVE_MA,
    capabilities: { pwm: true, interrupt: true, analogIn: true, touch: true, i2cSda: true, i2cScl: true, spiMiso: true },
    functions: ["GPIO12", "ADC2_CH5", "RTC_GPIO15", "TOUCH5", "EMAC_TXD3", "HSPIQ", "HS2_DATA2", "SD_DATA2", "MTDI"],
    extraCapabilities: ["gpio12", "adc2_ch5", "rtc_gpio15", "touch5", "emac_txd3", "sdio_data2", "jtag_tdi", ...MATRIX_BIDIR],
    sourceCurrentmA: 40,
    sinkCurrentmA: 28,
    strapping: true,
  }),
  esp32Pin({
    id: "mtck",
    name: "GPIO13 / MTCK / HSPID / ADC2_CH4",
    pin: 20,
    voltageV: VDD_RTC,
    driveCurrentmA: GPIO_DRIVE_MA,
    capabilities: { pwm: true, interrupt: true, analogIn: true, touch: true, i2cSda: true, i2cScl: true, spiMosi: true },
    functions: ["GPIO13", "ADC2_CH4", "RTC_GPIO14", "TOUCH4", "EMAC_RX_ER", "HSPID", "HS2_DATA3", "SD_DATA3", "MTCK"],
    extraCapabilities: ["gpio13", "adc2_ch4", "rtc_gpio14", "touch4", "emac_rx_er", "sdio_data3", "jtag_tck", ...MATRIX_BIDIR],
    sourceCurrentmA: 40,
    sinkCurrentmA: 28,
  }),
  esp32Pin({
    id: "mtdo",
    name: "GPIO15 / MTDO / HSPICS0 / ADC2_CH3",
    pin: 21,
    voltageV: VDD_RTC,
    driveCurrentmA: GPIO_DRIVE_MA,
    capabilities: { pwm: true, interrupt: true, analogIn: true, touch: true, i2cSda: true, i2cScl: true, spiSs: true },
    functions: ["GPIO15", "ADC2_CH3", "RTC_GPIO13", "TOUCH3", "EMAC_RXD3", "HSPICS0", "HS2_CMD", "SD_CMD", "MTDO"],
    extraCapabilities: ["gpio15", "adc2_ch3", "rtc_gpio13", "touch3", "emac_rxd3", "sdio_cmd", "jtag_tdo", ...MATRIX_BIDIR],
    sourceCurrentmA: 40,
    sinkCurrentmA: 28,
    strapping: true,
  }),
  esp32Pin({
    id: "gpio2",
    name: "GPIO2 / ADC2_CH2 / TOUCH2 / HSPIWP",
    pin: 22,
    voltageV: VDD_RTC,
    driveCurrentmA: GPIO_DRIVE_MA,
    capabilities: { pwm: true, interrupt: true, analogIn: true, touch: true, i2cSda: true, i2cScl: true },
    functions: ["GPIO2", "ADC2_CH2", "RTC_GPIO12", "TOUCH2", "HSPIWP", "HS2_DATA0", "SD_DATA0"],
    extraCapabilities: ["gpio2", "adc2_ch2", "rtc_gpio12", "touch2", "spi_wp", "sdio_data0", ...MATRIX_BIDIR],
    sourceCurrentmA: 40,
    sinkCurrentmA: 28,
    strapping: true,
  }),
  esp32Pin({
    id: "gpio0",
    name: "GPIO0 / ADC2_CH1 / TOUCH1 / EMAC_TX_CLK",
    pin: 23,
    voltageV: VDD_RTC,
    driveCurrentmA: GPIO_DRIVE_MA,
    capabilities: { pwm: true, interrupt: true, analogIn: true, touch: true, i2cSda: true, i2cScl: true },
    functions: ["GPIO0", "ADC2_CH1", "RTC_GPIO11", "TOUCH1", "EMAC_TX_CLK", "CLK_OUT1"],
    extraCapabilities: ["gpio0", "adc2_ch1", "rtc_gpio11", "touch1", "emac_tx_clk", ...MATRIX_BIDIR],
    sourceCurrentmA: 40,
    sinkCurrentmA: 28,
    strapping: true,
  }),
  esp32Pin({
    id: "gpio4",
    name: "GPIO4 / ADC2_CH0 / TOUCH0 / HSPIHD",
    pin: 24,
    voltageV: VDD_RTC,
    driveCurrentmA: GPIO_DRIVE_MA,
    capabilities: { pwm: true, interrupt: true, analogIn: true, touch: true, i2cSda: true, i2cScl: true },
    functions: ["GPIO4", "ADC2_CH0", "RTC_GPIO10", "TOUCH0", "EMAC_TX_ER", "HSPIHD", "HS2_DATA1", "SD_DATA1"],
    extraCapabilities: ["gpio4", "adc2_ch0", "rtc_gpio10", "touch0", "spi_hd", "emac_tx_er", "sdio_data1", ...MATRIX_BIDIR],
    sourceCurrentmA: 40,
    sinkCurrentmA: 28,
  }),
  esp32Pin({
    id: "gpio16",
    name: "GPIO16 / U2RXD / HS1_DATA4",
    pin: 25,
    voltageV: VDD_IO,
    driveCurrentmA: GPIO_DRIVE_MA,
    capabilities: { pwm: true, interrupt: true, i2cSda: true, i2cScl: true, uartRx: true },
    functions: ["GPIO16", "HS1_DATA4", "U2RXD", "EMAC_CLK_OUT"],
    extraCapabilities: ["gpio16", "sdio_data4", "emac_clk_out", ...MATRIX_BIDIR],
    sourceCurrentmA: 40,
    sinkCurrentmA: 28,
  }),
  esp32Pin({
    id: "gpio17",
    name: "GPIO17 / U2TXD / HS1_DATA5",
    pin: 27,
    voltageV: VDD_IO,
    driveCurrentmA: GPIO_DRIVE_MA,
    capabilities: { pwm: true, interrupt: true, i2cSda: true, i2cScl: true, uartTx: true },
    functions: ["GPIO17", "HS1_DATA5", "U2TXD", "EMAC_CLK_OUT_180"],
    extraCapabilities: ["gpio17", "sdio_data5", "emac_clk_out_180", ...MATRIX_BIDIR],
    sourceCurrentmA: 40,
    sinkCurrentmA: 28,
  }),
  esp32Pin({
    id: "sd_data_2",
    name: "GPIO9 / SD_DATA2 / SPIHD / U1RXD",
    pin: 28,
    voltageV: VDD_IO,
    driveCurrentmA: GPIO_DRIVE_MA,
    capabilities: { pwm: true, interrupt: true, i2cSda: true, i2cScl: true, uartRx: true },
    functions: ["GPIO9", "HS1_DATA2", "U1RXD", "SD_DATA2", "SPIHD"],
    extraCapabilities: ["gpio9", "sdio_data2", "spi_hd", ...MATRIX_BIDIR],
    sourceCurrentmA: 30,
    sinkCurrentmA: 28,
    externalFlashPad: true,
  }),
  esp32Pin({
    id: "sd_data_3",
    name: "GPIO10 / SD_DATA3 / SPIWP / U1TXD",
    pin: 29,
    voltageV: VDD_IO,
    driveCurrentmA: GPIO_DRIVE_MA,
    capabilities: { pwm: true, interrupt: true, i2cSda: true, i2cScl: true, uartTx: true },
    functions: ["GPIO10", "HS1_DATA3", "U1TXD", "SD_DATA3", "SPIWP"],
    extraCapabilities: ["gpio10", "sdio_data3", "spi_wp", ...MATRIX_BIDIR],
    sourceCurrentmA: 30,
    sinkCurrentmA: 28,
    externalFlashPad: true,
  }),
  esp32Pin({
    id: "sd_cmd",
    name: "GPIO11 / SD_CMD / SPICS0 / U1RTS",
    pin: 30,
    voltageV: VDD_IO,
    driveCurrentmA: GPIO_DRIVE_MA,
    capabilities: { pwm: true, interrupt: true, i2cSda: true, i2cScl: true, spiSs: true, uartRts: true },
    functions: ["GPIO11", "HS1_CMD", "U1RTS", "SD_CMD", "SPICS0"],
    extraCapabilities: ["gpio11", "sdio_cmd", ...MATRIX_BIDIR],
    sourceCurrentmA: 30,
    sinkCurrentmA: 28,
    externalFlashPad: true,
  }),
  esp32Pin({
    id: "sd_clk",
    name: "GPIO6 / SD_CLK / SPICLK / U1CTS",
    pin: 31,
    voltageV: VDD_IO,
    driveCurrentmA: GPIO_DRIVE_MA,
    capabilities: { pwm: true, interrupt: true, i2cSda: true, i2cScl: true, spiSck: true, uartCts: true },
    functions: ["GPIO6", "HS1_CLK", "U1CTS", "SD_CLK", "SPICLK"],
    extraCapabilities: ["gpio6", "sdio_clk", ...MATRIX_BIDIR],
    sourceCurrentmA: 30,
    sinkCurrentmA: 28,
    externalFlashPad: true,
  }),
  esp32Pin({
    id: "sd_data_0",
    name: "GPIO7 / SD_DATA0 / SPIQ / U2RTS",
    pin: 32,
    voltageV: VDD_IO,
    driveCurrentmA: GPIO_DRIVE_MA,
    capabilities: { pwm: true, interrupt: true, i2cSda: true, i2cScl: true, spiMiso: true, uartRts: true },
    functions: ["GPIO7", "HS1_DATA0", "U2RTS", "SD_DATA0", "SPIQ"],
    extraCapabilities: ["gpio7", "sdio_data0", ...MATRIX_BIDIR],
    sourceCurrentmA: 30,
    sinkCurrentmA: 28,
    externalFlashPad: true,
  }),
  esp32Pin({
    id: "sd_data_1",
    name: "GPIO8 / SD_DATA1 / SPID / U2CTS",
    pin: 33,
    voltageV: VDD_IO,
    driveCurrentmA: GPIO_DRIVE_MA,
    capabilities: { pwm: true, interrupt: true, i2cSda: true, i2cScl: true, spiMosi: true, uartCts: true },
    functions: ["GPIO8", "HS1_DATA1", "U2CTS", "SD_DATA1", "SPID"],
    extraCapabilities: ["gpio8", "sdio_data1", ...MATRIX_BIDIR],
    sourceCurrentmA: 30,
    sinkCurrentmA: 28,
    externalFlashPad: true,
  }),
  esp32Pin({
    id: "gpio5",
    name: "GPIO5 / VSPICS0 / EMAC_RX_CLK",
    pin: 34,
    voltageV: VDD_IO,
    driveCurrentmA: GPIO_DRIVE_MA,
    capabilities: { pwm: true, interrupt: true, i2cSda: true, i2cScl: true, spiSs: true },
    functions: ["GPIO5", "HS1_DATA6", "VSPICS0", "EMAC_RX_CLK"],
    extraCapabilities: ["gpio5", "sdio_data6", "emac_rx_clk", ...MATRIX_BIDIR],
    sourceCurrentmA: 40,
    sinkCurrentmA: 28,
    strapping: true,
  }),
  esp32Pin({
    id: "gpio18",
    name: "GPIO18 / VSPICLK / HS1_DATA7",
    pin: 35,
    voltageV: VDD_IO,
    driveCurrentmA: GPIO_DRIVE_MA,
    capabilities: { pwm: true, interrupt: true, i2cSda: true, i2cScl: true, spiSck: true },
    functions: ["GPIO18", "HS1_DATA7", "VSPICLK"],
    extraCapabilities: ["gpio18", "sdio_data7", ...MATRIX_BIDIR],
    sourceCurrentmA: 40,
    sinkCurrentmA: 28,
  }),
  esp32Pin({
    id: "gpio23",
    name: "GPIO23 / VSPID / HS1_STROBE",
    pin: 36,
    voltageV: VDD_IO,
    driveCurrentmA: GPIO_DRIVE_MA,
    capabilities: { pwm: true, interrupt: true, i2cSda: true, i2cScl: true, spiMosi: true },
    functions: ["GPIO23", "HS1_STROBE", "VSPID"],
    extraCapabilities: ["gpio23", "sdio_strobe", ...MATRIX_BIDIR],
    sourceCurrentmA: 40,
    sinkCurrentmA: 28,
  }),
  esp32Pin({
    id: "gpio19",
    name: "GPIO19 / U0CTS / VSPIQ / EMAC_TXD0",
    pin: 38,
    voltageV: VDD_IO,
    driveCurrentmA: GPIO_DRIVE_MA,
    capabilities: { pwm: true, interrupt: true, i2cSda: true, i2cScl: true, spiMiso: true, uartCts: true },
    functions: ["GPIO19", "U0CTS", "VSPIQ", "EMAC_TXD0"],
    extraCapabilities: ["gpio19", "emac_txd0", ...MATRIX_BIDIR],
    sourceCurrentmA: 40,
    sinkCurrentmA: 28,
  }),
  esp32Pin({
    id: "gpio22",
    name: "GPIO22 / U0RTS / VSPIWP / EMAC_TXD1",
    pin: 39,
    voltageV: VDD_IO,
    driveCurrentmA: GPIO_DRIVE_MA,
    capabilities: { pwm: true, interrupt: true, i2cSda: true, i2cScl: true, uartRts: true },
    functions: ["GPIO22", "U0RTS", "VSPIWP", "EMAC_TXD1"],
    extraCapabilities: ["gpio22", "spi_wp", "emac_txd1", ...MATRIX_BIDIR],
    sourceCurrentmA: 40,
    sinkCurrentmA: 28,
  }),
  esp32Pin({
    id: "u0rxd",
    name: "GPIO3 / U0RXD / CLK_OUT2",
    pin: 40,
    voltageV: VDD_IO,
    driveCurrentmA: GPIO_DRIVE_MA,
    capabilities: { pwm: true, interrupt: true, i2cSda: true, i2cScl: true, uartRx: true },
    functions: ["GPIO3", "U0RXD", "CLK_OUT2"],
    extraCapabilities: ["gpio3", ...MATRIX_BIDIR],
    sourceCurrentmA: 40,
    sinkCurrentmA: 28,
  }),
  esp32Pin({
    id: "u0txd",
    name: "GPIO1 / U0TXD / CLK_OUT3 / EMAC_RXD2",
    pin: 41,
    voltageV: VDD_IO,
    driveCurrentmA: GPIO_DRIVE_MA,
    capabilities: { pwm: true, interrupt: true, i2cSda: true, i2cScl: true, uartTx: true },
    functions: ["GPIO1", "U0TXD", "CLK_OUT3", "EMAC_RXD2"],
    extraCapabilities: ["gpio1", "emac_rxd2", ...MATRIX_BIDIR],
    sourceCurrentmA: 40,
    sinkCurrentmA: 28,
  }),
  esp32Pin({
    id: "gpio21",
    name: "GPIO21 / VSPIHD / EMAC_TX_EN",
    pin: 42,
    voltageV: VDD_IO,
    driveCurrentmA: GPIO_DRIVE_MA,
    capabilities: { pwm: true, interrupt: true, i2cSda: true, i2cScl: true },
    functions: ["GPIO21", "VSPIHD", "EMAC_TX_EN"],
    extraCapabilities: ["gpio21", "spi_hd", "emac_tx_en", ...MATRIX_BIDIR],
    sourceCurrentmA: 40,
    sinkCurrentmA: 28,
  }),
];

const qspiFlash = composed(
  "qspi_flash",
  "SPI0/1 External Flash Interface",
  "spi",
  ["master"],
  [
    { id: "sck", required: true, match: { protocol: "spi", role: "clock", capability: "spi_sck" } },
    { id: "cs", required: true, match: { protocol: "spi", role: "select", capability: "spi_ss" } },
    { id: "io0", required: true, match: { protocol: "spi", role: "data_out", capability: "spi_mosi" } },
    { id: "io1", required: true, match: { protocol: "spi", role: "data_in", capability: "spi_miso" } },
    { id: "io2", required: true, match: { capability: "spi_wp" } },
    { id: "io3", required: true, match: { capability: "spi_hd" } },
  ],
  [
    {
      id: "spi0_flash_default",
      label: "SPI0/1 Flash (GPIO6-GPIO11)",
      default_active: true,
      bindings: {
        sck: "sd_clk",
        cs: "sd_cmd",
        io0: "sd_data_1",
        io1: "sd_data_0",
        io2: "sd_data_3",
        io3: "sd_data_2",
      },
    },
  ],
  1,
  true,
);

const ledcPwm = composed(
  "ledc_pwm",
  "LEDC PWM Generator",
  "pwm",
  ["output"],
  [{ id: "channel", required: true, match: { protocol: "pwm", role: "output", capability: "pwm_out" } }],
  undefined,
  16,
);

const twai = composed(
  "twai",
  "TWAI CAN 2.0 Controller",
  "twai",
  ["controller"],
  [
    { id: "rx", required: true, match: { capability: "twai_rx" } },
    { id: "tx", required: true, match: { capability: "twai_tx" } },
  ],
  undefined,
  1,
);

const touch = composed(
  "touch",
  "Capacitive Touch Sensors",
  "capacitive_touch",
  ["input"],
  [{ id: "channel", required: true, count: 10, match: { capability: "touch" } }],
  [
    {
      id: "touch_channels",
      bindings: {
        channel: ["gpio4", "gpio0", "gpio2", "mtdo", "mtck", "mtdi", "mtms", "gpio27", "32k_xn", "32k_xp"],
      },
    },
  ],
  10,
);

const jtag = composed(
  "jtag",
  "JTAG Debug Port",
  "jtag",
  ["target"],
  [
    { id: "tms", required: true, match: { capability: "jtag_tms" } },
    { id: "tck", required: true, match: { capability: "jtag_tck" } },
    { id: "tdi", required: true, match: { capability: "jtag_tdi" } },
    { id: "tdo", required: true, match: { capability: "jtag_tdo" } },
  ],
  [{ id: "jtag_default", bindings: { tms: "mtms", tck: "mtck", tdi: "mtdi", tdo: "mtdo" } }],
  1,
);

const sdio = composed(
  "sdio",
  "SDIO / SDMMC Host",
  "sdio",
  ["host", "device"],
  [
    { id: "clk", required: true, match: { capability: "sdio_clk" } },
    { id: "cmd", required: true, match: { capability: "sdio_cmd" } },
    { id: "data0", required: true, match: { capability: "sdio_data0" } },
    { id: "data1", required: true, match: { capability: "sdio_data1" } },
    { id: "data2", required: false, match: { capability: "sdio_data2" } },
    { id: "data3", required: false, match: { capability: "sdio_data3" } },
    { id: "data4", required: false, match: { capability: "sdio_data4" } },
    { id: "data5", required: false, match: { capability: "sdio_data5" } },
    { id: "data6", required: false, match: { capability: "sdio_data6" } },
    { id: "data7", required: false, match: { capability: "sdio_data7" } },
    { id: "strobe", required: false, match: { capability: "sdio_strobe" } },
  ],
  [
    {
      id: "sdio_slot1_8bit",
      label: "SDIO Slot 1 (GPIO6-GPIO11, GPIO16-GPIO18, GPIO23)",
      bindings: {
        clk: "sd_clk",
        cmd: "sd_cmd",
        data0: "sd_data_0",
        data1: "sd_data_1",
        data2: "sd_data_2",
        data3: "sd_data_3",
        data4: "gpio16",
        data5: "gpio17",
        data6: "gpio5",
        data7: "gpio18",
        strobe: "gpio23",
      },
    },
    {
      id: "sdio_slot2_4bit",
      label: "SDIO Slot 2 (GPIO2, GPIO4, GPIO12-GPIO15)",
      bindings: {
        clk: "mtms",
        cmd: "mtdo",
        data0: "gpio2",
        data1: "gpio4",
        data2: "mtdi",
        data3: "mtck",
      },
    },
  ],
  2,
);

const ethernetMac = composed(
  "ethernet_mac",
  "Ethernet MAC MII/RMII Signals",
  "ethernet_mac",
  ["controller"],
  [
    { id: "txd0", required: true, match: { capability: "emac_txd0" } },
    { id: "txd1", required: true, match: { capability: "emac_txd1" } },
    { id: "tx_en", required: true, match: { capability: "emac_tx_en" } },
    { id: "rxd0", required: true, match: { capability: "emac_rxd0" } },
    { id: "rxd1", required: true, match: { capability: "emac_rxd1" } },
    { id: "rx_dv", required: false, match: { capability: "emac_rx_dv" } },
    { id: "rx_clk", required: false, match: { capability: "emac_rx_clk" } },
    { id: "tx_clk", required: false, match: { capability: "emac_tx_clk" } },
    { id: "clk_out", required: false, match: { capability: "emac_clk_out" } },
  ],
  [
    {
      id: "emac_default",
      bindings: {
        txd0: "gpio19",
        txd1: "gpio22",
        tx_en: "gpio21",
        rxd0: "gpio25",
        rxd1: "gpio26",
        rx_dv: "gpio27",
        rx_clk: "gpio5",
        tx_clk: "gpio0",
        clk_out: "gpio16",
      },
    },
  ],
  1,
);

const wifiRadio: InterfaceDef = {
  id: "wifi_radio",
  name: "Wi-Fi 2.4 GHz Radio",
  domain: "network",
  exposed: true,
  default_active: false,
  protocols: [{ type: "wifi", roles: ["station", "access_point"] }],
  capabilities: ["wifi_802_11_bgn", "wifi_2g4"],
  parameters: [
    { id: "frequency", unit: "Hz", range: [2_400_000_000, 2_500_000_000] },
    { id: "max_bandwidth", unit: "dimensionless", value: 150 },
  ],
  bridgesTo: ["lna_in"],
};

const bluetoothRadio: InterfaceDef = {
  id: "bluetooth_radio",
  name: "Bluetooth 4.2 BR/EDR + BLE Radio",
  domain: "network",
  exposed: true,
  default_active: false,
  protocols: [{ type: "bluetooth", roles: ["peer"] }],
  capabilities: ["bluetooth_classic", "bluetooth_le", "bluetooth_2g4"],
  parameters: [{ id: "frequency", unit: "Hz", range: [2_400_000_000, 2_500_000_000] }],
  bridgesTo: ["lna_in"],
};

const footprintMount: InterfaceDef = {
  id: "footprint_mounting",
  name: "QFN-48 6x6 mm Surface-Mount Footprint",
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
};

export const ESP32D0WDQ6: ModuleDef = defineModule({
  id: "esp32-d0wdq6",
  name: "Espressif ESP32-D0WDQ6",
  version: "1.0.0",
  manufacturer: "Espressif Systems",
  part_number: "ESP32-D0WDQ6",
  description:
    "Bare ESP32-D0WDQ6 SoC in QFN-48 6x6 mm package with dual-core Xtensa LX6, 2.4 GHz Wi-Fi, Bluetooth 4.2 BR/EDR + BLE, and external SPI flash requirement.",
  tags: ["esp32", "soc", "microcontroller", "wifi", "bluetooth", "ble", "xtensa-lx6", "qfn-48", "iot"],
  categories: ["microcontroller", "connectivity.wireless"],

  interfaces: [
    ...powerPins,
    ...specialPins,
    ...gpioPins,

    ...ADC({
      id: "adc1",
      name: "ADC1 SAR Converter",
      instance: 1,
      resolutionBits: 12,
      rangeV: [0, 3.3],
      channels: ["sensor_vp", "sensor_capp", "sensor_capn", "sensor_vn", "32k_xp", "32k_xn", "vdet_1", "vdet_2"],
    }),
    ...ADC({
      id: "adc2",
      name: "ADC2 SAR Converter",
      instance: 2,
      resolutionBits: 12,
      rangeV: [0, 3.3],
      channels: ["gpio4", "gpio0", "gpio2", "mtdo", "mtck", "mtdi", "mtms", "gpio27", "gpio25", "gpio26"],
    }),
    ...DAC({
      id: "dac",
      name: "8-bit DAC Outputs",
      resolutionBits: 8,
      rangeV: [0, 3.3],
      channels: ["gpio25", "gpio26"],
    }),
    ...I2C({
      id: "i2c",
      name: "I2C Controllers",
      roles: ["master", "slave"],
      clockFreqHz: [100_000, 400_000],
      voltageV: 3.3,
      maxInstances: 2,
      profiles: [
        { id: "i2c0_default", label: "I2C0 Default (GPIO21/GPIO22)", sda: "gpio21", scl: "gpio22" },
      ],
    }),
    qspiFlash,
    ...SPI({
      id: "spi",
      name: "HSPI / VSPI User SPI Controllers",
      roles: ["master", "slave"],
      clockFreqHz: [100_000, 80_000_000],
      voltageV: 3.3,
      maxInstances: 2,
      profiles: [
        { id: "hspi_default", label: "HSPI IO_MUX", mosi: "mtck", miso: "mtdi", sck: "mtms", ss: "mtdo" },
        { id: "vspi_default", label: "VSPI IO_MUX", mosi: "gpio23", miso: "gpio19", sck: "gpio18", ss: "gpio5" },
      ],
    }),
    ...UART({
      id: "uart",
      name: "UART Controllers",
      roles: ["host", "device"],
      baudRate: [300, 5_000_000],
      voltageV: 3.3,
      maxInstances: 3,
      profiles: [
        { id: "uart0_default", label: "UART0", rx: "u0rxd", tx: "u0txd", rts: "gpio22", cts: "gpio19" },
        { id: "uart1_default", label: "UART1", rx: "sd_data_2", tx: "sd_data_3", rts: "sd_cmd", cts: "sd_clk" },
        { id: "uart2_default", label: "UART2", rx: "gpio16", tx: "gpio17", rts: "sd_data_0", cts: "sd_data_1" },
      ],
    }),
    ledcPwm,
    twai,
    touch,
    jtag,
    sdio,
    ethernetMac,
    wifiRadio,
    bluetoothRadio,
    footprintMount,
    thermalPad,
  ],

  interfaceGroups: [
    {
      id: "required_power_pins",
      label: "Required Power Pins",
      members: ["vdda_1", "vdd3p3_3", "vdd3p3_4", "vdd3p3_rtc", "vdd_sdio", "vdd3p3_cpu", "vdda_43", "vdda_46", "gnd"],
      policy: "all_of",
    },
    {
      id: "boot_strapping_pins",
      label: "Boot Strapping Pins",
      members: ["gpio0", "gpio2", "gpio5", "mtdi", "mtdo"],
      policy: "all_of",
    },
  ],

  requirements: [
    {
      type: "power",
      description: "Primary ESP32 supply rails must be within the ESP32 operating range and capable of Wi-Fi/BT transmit current bursts.",
      voltage_V: [2.3, 3.6],
      current_mA: 500,
    },
    {
      type: "interface",
      description: "ESP32-D0WDQ6 has no in-package flash; normal boot requires external SPI flash on the SPI0/1 flash interface.",
      interface_protocol: "spi",
    },
    {
      type: "capability",
      description: "LNA_IN must connect to a matched 50 ohm 2.4 GHz antenna network.",
      capability: "rf_2g4_antenna_feed",
    },
  ],

  domains: [
    {
      domain: "electrical",
      power_domains: [
        { id: "vdda_analog", name: "VDDA / VDD3P3 Analog and RF", nominal_voltage_V: 3.3, voltage_range_V: VDD_RTC, max_current_mA: 500 },
        { id: "io_3v3", name: "VDD_SDIO / VDD3P3_CPU IO", nominal_voltage_V: 3.3, voltage_range_V: VDD_IO, max_current_mA: 40 },
        { id: "gnd", name: "Common Ground", nominal_voltage_V: 0, voltage_range_V: [0, 0], max_current_mA: 1200 },
      ],
      metadata: {
        pin_count: 49,
        max_operating_freq_Hz: 240_000_000,
        typical_power_mW: 792,
        package_type: "QFN-48",
      },
    },
    {
      domain: "mechanical",
      dimensions_mm: { length: 6, width: 6, height: 0.85 },
      metadata: {
        package_type: "QFN-48",
        pitch_mm: 0.4,
        mounting_method: "surface_mount",
      },
    },
    {
      domain: "thermal",
      operating_temperature_C: [-40, 125],
      metadata: {
        thermal_design_power_W: 0.79,
        primary_heat_path: "exposed_pad_to_pcb_ground_plane",
      },
    },
    {
      domain: "network",
      metadata: {
        wireless_standards: ["802.11b", "802.11g", "802.11n", "Bluetooth 4.2 BR/EDR", "Bluetooth LE"],
        frequency_bands_ghz: [2.4],
        max_bandwidth_mbps: 150,
      },
    },
  ],

  traits: [
    { type: "lifecycle_status", params: { status: "not_recommended_for_new_designs", source_definition: "ProtoPart esp32-d0wdq6" } },
    { type: "requires_external_flash", params: { interfaceId: "qspi_flash", defaultProfile: "spi0_flash_default" } },
    { type: "wireless_soc", params: { radios: ["wifi_radio", "bluetooth_radio"], rfFeed: "lna_in" } },
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
      filePath: "../ProtoPart/protoparts/esp32-d0wdq6/artifacts/images/ESP32-D0WDQ6_tilted.png",
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

