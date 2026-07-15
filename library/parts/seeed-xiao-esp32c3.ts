/**
 * Seeed Studio XIAO ESP32C3 — source-honest part definition.
 *
 * Primary source: ProtoPart `seeed-xiao-esp32c3` definition v0.2.0 (schema
 * 1.4.0) — the audited source of truth for this file. Its underlying vendor
 * reference is the Seeed Studio product page for SKU 113991054:
 *   https://www.seeedstudio.com/Seeed-XIAO-ESP32C3-p-5431.html
 * Nothing below is carried over from ESP32-C3 SoC datasheets, SDK defaults,
 * or general XIAO-family knowledge unless the ProtoPart JSON states it; gaps
 * in the JSON are left unrepresented rather than filled in.
 *
 * Architecture notes honoured by this file:
 *   - Pin-honest like a schematic: all 14 edge pads (D0-D10, 5V, 3V3, GND)
 *     plus the USB-C receptacle and the U.FL antenna connector are leaf
 *     interfaces. The JSON provides no numeric pad indices, so `pin` carries
 *     the official silkscreen designator ("D0" … "D10", "5V", "3V3", "GND")
 *     and the array preserves the JSON's resource order.
 *   - Every pad carries its verbatim JSON function list (name, direction,
 *     shareable_with) in a `xiao_pad_functions` trait — display data is
 *     separated from the canonical capability tags slot matching needs.
 *   - The JSON's composed `interfaces` (power in/out, USB device, GPIO, ADC,
 *     I2C master, SPI master, UART) map onto slot-composed InterfaceDefs
 *     whose profiles bind the pad ids the JSON's `requires` functions live
 *     on; `max_instances` reflects how many pads can satisfy the interface.
 *   - Co-requirements: D7 is both the default UART RX pad and the modeled
 *     SPI SS pad (JSON warning) — captured as `co_requirement` traits on
 *     both controllers and a trait on the pad itself.
 *   - Shareability: the USB-C connector's four functions are mutually
 *     shareable (one physical connector serves power + data + ground); the
 *     U.FL feed is shared between the Wi-Fi and Bluetooth radios.
 *   - The JSON's four `warnings` are distributed to the interfaces they
 *     constrain (3.3 V logic restriction, D6/D7 contention, strapping-pin
 *     advisory, USB 5 V budget caveat) instead of being dropped.
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
  PowerOut,
  SPI,
  defineModule,
  maxCurrentA,
  voltageRangeV,
} from "../../src/protocols/index.js";

// ---------------------------------------------------------------------------
// Electrical constants — ProtoPart definition, electrical power_domains
// ---------------------------------------------------------------------------

/** Citation string used by every trait that carries JSON-verbatim data. */
const SOURCE =
  "ProtoPart seeed-xiao-esp32c3 definition v0.2.0 (Seeed Studio XIAO ESP32C3, SKU 113991054)";

/** power_domains.usb_5v: USB / 5V rail. */
const USB_5V_RANGE: [number, number] = [4.75, 5.25];
/** power_domains.usb_5v.max_current_mA — see the USB2.0 budget caveat below. */
const USB_5V_MAX_A = 0.5;

/** power_domains.regulated_3v3 (3.3 V regulator output) and io_3v3 (I/O reference) share this range. */
const RANGE_3V3: [number, number] = [3.0, 3.6];
/** power_domains.regulated_3v3.max_current_mA. */
const REG_3V3_MAX_A = 0.7;

/** power_domains.gnd.max_current_mA. */
const GND_MAX_A = 2.0;

// ---------------------------------------------------------------------------
// Source-honest per-pad function metadata
// ---------------------------------------------------------------------------

/** Verbatim function entry from the JSON's electrical `resources[].functions`. */
interface XiaoFunction {
  name: string;
  /** JSON direction column, carried verbatim. */
  direction: "input" | "output" | "bidirectional";
  /** Functions this one may share its physical connection with (JSON `shareable_with`). */
  shareable_with?: string[];
}

/** Wrap a pad's verbatim JSON function list as a display trait. */
function padFunctionsTrait(connectorType: string, functions: XiaoFunction[]): TraitDef {
  return {
    type: "xiao_pad_functions",
    params: {
      source: `${SOURCE}, electrical resources`,
      connector_type: connectorType,
      functions,
    },
  };
}

interface XiaoIoPadSpec {
  id: string;
  /** Official silkscreen designator — used as the `pin` field. */
  silkscreen: string;
  /** Verbatim JSON resource name — used as the displayed interface name. */
  name: string;
  analogIn?: boolean;
  i2cSda?: boolean;
  i2cScl?: boolean;
  uartTx?: boolean;
  uartRx?: boolean;
  spiSs?: boolean;
  spiSck?: boolean;
  spiMiso?: boolean;
  spiMosi?: boolean;
  functions: XiaoFunction[];
  traits?: TraitDef[];
}

/** Build one schematic-honest 3.3 V I/O edge pad from its JSON resource row. */
function xiaoIoPad(spec: XiaoIoPadSpec): InterfaceDef {
  const base = Pin({
    id: spec.id,
    name: spec.name,
    pin: spec.silkscreen,
    voltageV: RANGE_3V3, // io_3v3 domain — 3.3 V logic only (see logic_level_restriction)
    capabilities: {
      analogIn: spec.analogIn,
      i2cSda: spec.i2cSda,
      i2cScl: spec.i2cScl,
      uartTx: spec.uartTx,
      uartRx: spec.uartRx,
      spiSs: spec.spiSs,
      spiSck: spec.spiSck,
      spiMiso: spec.spiMiso,
      spiMosi: spec.spiMosi,
    },
  });

  return {
    ...base,
    traits: [
      padFunctionsTrait("pin", spec.functions),
      { type: "power_domain", params: { domain: "io_3v3" } },
      ...(spec.traits ?? []),
    ],
  };
}

// ---------------------------------------------------------------------------
// I/O edge pads — JSON electrical resources d0..d10, in JSON order
// ---------------------------------------------------------------------------

const DIGITAL_IO_FN: XiaoFunction = { name: "digital_io", direction: "bidirectional" };
const ANALOG_IN_FN: XiaoFunction = { name: "analog_input", direction: "input" };

const IO_PAD_SPECS: XiaoIoPadSpec[] = [
  { id: "d0", silkscreen: "D0", name: "D0 / A0", analogIn: true, functions: [DIGITAL_IO_FN, ANALOG_IN_FN] },
  { id: "d1", silkscreen: "D1", name: "D1 / A1", analogIn: true, functions: [DIGITAL_IO_FN, ANALOG_IN_FN] },
  { id: "d2", silkscreen: "D2", name: "D2 / A2", analogIn: true, functions: [DIGITAL_IO_FN, ANALOG_IN_FN] },
  { id: "d3", silkscreen: "D3", name: "D3 / A3", analogIn: true, functions: [DIGITAL_IO_FN, ANALOG_IN_FN] },
  {
    id: "d4", silkscreen: "D4", name: "D4 / SDA", i2cSda: true,
    functions: [DIGITAL_IO_FN, { name: "i2c_sda", direction: "bidirectional" }],
  },
  {
    id: "d5", silkscreen: "D5", name: "D5 / SCL", i2cScl: true,
    functions: [DIGITAL_IO_FN, { name: "i2c_scl", direction: "bidirectional" }],
  },
  {
    id: "d6", silkscreen: "D6", name: "D6 / TX", uartTx: true,
    functions: [DIGITAL_IO_FN, { name: "uart_tx", direction: "output" }],
  },
  {
    id: "d7", silkscreen: "D7", name: "D7 / RX (also usable as SPI SS)", uartRx: true, spiSs: true,
    functions: [
      DIGITAL_IO_FN,
      { name: "uart_rx", direction: "input" },
      { name: "spi_ss", direction: "output" },
    ],
    traits: [
      {
        type: "co_requirement",
        params: {
          with: "uart, spi_master",
          condition: "UART and SPI (with SS) required simultaneously",
          effect:
            "D6/D7 are the default UART TX/RX pins; D7 is also modeled as SPI SS, so UART and SPI-SS may contend if both are required simultaneously.",
          source: `${SOURCE}, warnings`,
        },
      },
    ],
  },
  {
    id: "d8", silkscreen: "D8", name: "D8 / SCK", spiSck: true,
    functions: [DIGITAL_IO_FN, { name: "spi_sck", direction: "output" }],
  },
  {
    id: "d9", silkscreen: "D9", name: "D9 / MISO", spiMiso: true,
    functions: [DIGITAL_IO_FN, { name: "spi_miso", direction: "input" }],
  },
  {
    id: "d10", silkscreen: "D10", name: "D10 / MOSI", spiMosi: true,
    functions: [DIGITAL_IO_FN, { name: "spi_mosi", direction: "output" }],
  },
];

const ioPads: InterfaceDef[] = IO_PAD_SPECS.map(xiaoIoPad);

// ---------------------------------------------------------------------------
// Connector and power pads — JSON electrical resources, in JSON order
// ---------------------------------------------------------------------------

/**
 * USB-C receptacle. The JSON models it as one resource carrying four
 * mutually-shareable functions (power_input, usb_dp, usb_dm, ground) — one
 * physical connector legally serves the 5 V input, the data pair, and the
 * ground return at once, so all four capability tags live on this single
 * leaf and the composed interfaces below bind their slots back to it.
 */
const usbC: InterfaceDef = {
  id: "usb_c",
  name: "USB-C receptacle",
  domain: "electrical",
  exposed: true,
  default_active: true,
  protocols: [
    { type: "usb", roles: ["device"] },
    { type: "power", roles: ["input"] },
  ],
  capabilities: ["usb_dp", "usb_dm", "power_5v_in", "ground"],
  parameters: [voltageRangeV(USB_5V_RANGE[0], USB_5V_RANGE[1], 5), maxCurrentA(USB_5V_MAX_A)],
  traits: [
    padFunctionsTrait("usb_c", [
      { name: "power_input", direction: "input", shareable_with: ["usb_dp", "usb_dm", "ground"] },
      { name: "usb_dp", direction: "bidirectional", shareable_with: ["power_input", "usb_dm", "ground"] },
      { name: "usb_dm", direction: "bidirectional", shareable_with: ["power_input", "usb_dp", "ground"] },
      { name: "ground", direction: "bidirectional", shareable_with: ["power_input", "usb_dp", "usb_dm"] },
    ]),
    { type: "power_domain", params: { domain: "usb_5v" } },
    {
      // Shareability exemption: the connector's functions are mutually
      // shareable — power, data, and ground instances may all use this pad.
      type: "net_shareable",
      params: {
        net: "usb_c_connector",
        policy: "all_connector_functions_share_one_physical_connector",
        members: ["power_input", "usb_dp", "usb_dm", "ground"],
      },
    },
  ],
};

/**
 * 5V edge pad. The JSON gives it both power_input and power_output functions
 * (mutually shareable): it is the USB/5V-rail node exposed at the board edge,
 * usable to feed the board or to tap the rail.
 */
const pin5v: InterfaceDef = {
  id: "pin_5v",
  name: "5V pin",
  pin: "5V",
  domain: "electrical",
  exposed: true,
  default_active: true,
  protocols: [{ type: "power", roles: ["input", "output"] }],
  capabilities: ["power_5v_in", "power_5v_out"],
  parameters: [voltageRangeV(USB_5V_RANGE[0], USB_5V_RANGE[1], 5), maxCurrentA(USB_5V_MAX_A)],
  traits: [
    padFunctionsTrait("pin", [
      { name: "power_input", direction: "input", shareable_with: ["power_output"] },
      { name: "power_output", direction: "output", shareable_with: ["power_input"] },
    ]),
    { type: "power_domain", params: { domain: "usb_5v" } },
    {
      type: "supply_budget",
      params: {
        note: "USB 5V available current depends on the upstream USB source and any onboard protection; treat 500mA as a USB2.0 default-budget, not a guaranteed board output capability.",
        source: `${SOURCE}, warnings`,
      },
    },
  ],
};

/** 3V3 edge pad — regulator output only (the JSON models no power_input here). */
const pin3v3: InterfaceDef = {
  ...PowerOut({
    id: "pin_3v3",
    name: "3V3 pin",
    pin: "3V3",
    voltageV: RANGE_3V3,
    nominalV: 3.3,
    maxCurrentA: REG_3V3_MAX_A,
  }),
  capabilities: ["power_3v3_out"],
  traits: [
    padFunctionsTrait("pin", [{ name: "power_output", direction: "output" }]),
    { type: "power_domain", params: { domain: "regulated_3v3" } },
  ],
};

/** GND edge pad — common return for every domain (inherently shareable). */
const gndPin: InterfaceDef = {
  ...Ground({ id: "gnd_pin", name: "GND pin", pin: "GND", maxCurrentA: GND_MAX_A }),
  traits: [
    padFunctionsTrait("pin", [{ name: "ground", direction: "bidirectional" }]),
    { type: "power_domain", params: { domain: "gnd" } },
    {
      type: "net_shareable",
      params: { net: "gnd", policy: "single_ground_instance_may_serve_all_members" },
    },
  ],
};

/**
 * All edge pads plus the USB-C receptacle, in the JSON's resource order.
 * The JSON assigns no numeric pad indices — `pin` fields carry silkscreen
 * designators instead of package numbers.
 */
const pads: InterfaceDef[] = [usbC, pin5v, pin3v3, gndPin, ...ioPads];

// ---------------------------------------------------------------------------
// Composed electrical interfaces — JSON electrical `interfaces` (requires →
// slots; the functions they name → capability tags on the pads above)
// ---------------------------------------------------------------------------

function composed(config: {
  id: string;
  name: string;
  protocolType: string;
  roles: string[];
  slots: SlotDef[];
  profiles?: InterfaceDef["profiles"];
  parameters?: Parameter[];
  capabilities?: string[];
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
    ...(config.capabilities ? { capabilities: config.capabilities } : {}),
    ...(config.maxInstances !== undefined ? { max_instances: config.maxInstances } : {}),
    ...(config.traits ? { traits: config.traits } : {}),
  };
}

function withTraits(iface: InterfaceDef, traits: TraitDef[]): InterfaceDef {
  return { ...iface, traits: [...(iface.traits ?? []), ...traits] };
}

/** Attach traits to the interface with the given id inside a builder result. */
function amend(ifaces: InterfaceDef[], id: string, traits: TraitDef[]): InterfaceDef[] {
  return ifaces.map((i) => (i.id === id ? withTraits(i, traits) : i));
}

/**
 * 5V power in — JSON requires one power_input + one ground. Both the USB-C
 * receptacle and the 5V pad expose power_input on the usb_5v domain, so both
 * routings are modeled as profiles.
 */
const powerInUsb = composed({
  id: "power_in_usb",
  name: "5V power in",
  protocolType: "power",
  roles: ["input"],
  parameters: [voltageRangeV(USB_5V_RANGE[0], USB_5V_RANGE[1], 5), maxCurrentA(USB_5V_MAX_A)],
  slots: [
    { id: "vin", required: true, match: { protocol: "power", role: "input", capability: "power_5v_in" } },
    { id: "gnd", required: true, match: { capability: "ground" } },
  ],
  profiles: [
    {
      id: "power_in_via_usb_c",
      label: "USB-C VBUS + connector ground",
      bindings: { vin: "usb_c", gnd: "usb_c" },
    },
    {
      id: "power_in_via_5v_pad",
      label: "5V edge pad + GND edge pad",
      bindings: { vin: "pin_5v", gnd: "gnd_pin" },
    },
  ],
  maxInstances: 1,
  traits: [
    {
      type: "supply_budget",
      params: {
        note: "USB 5V available current depends on the upstream USB source and any onboard protection; treat 500mA as a USB2.0 default-budget, not a guaranteed board output capability.",
        source: `${SOURCE}, warnings`,
      },
    },
  ],
});

/** 3.3V power out — JSON requires one power_output + one ground. */
const powerOut3v3 = composed({
  id: "power_out_3v3",
  name: "3.3V power out",
  protocolType: "power",
  roles: ["output"],
  parameters: [voltageRangeV(RANGE_3V3[0], RANGE_3V3[1], 3.3), maxCurrentA(REG_3V3_MAX_A)],
  slots: [
    { id: "vout", required: true, match: { protocol: "power", role: "output", capability: "power_3v3_out" } },
    { id: "gnd", required: true, match: { capability: "ground" } },
  ],
  profiles: [
    {
      id: "power_out_3v3_pads",
      label: "3V3 edge pad + GND edge pad",
      bindings: { vout: "pin_3v3", gnd: "gnd_pin" },
    },
  ],
  maxInstances: 1,
});

/** USB device/data — JSON requires usb_dp + usb_dm; both live on the receptacle. */
const usbDevice = composed({
  id: "usb_device",
  name: "USB device/data",
  protocolType: "usb",
  roles: ["device"],
  slots: [
    { id: "dp", required: true, match: { capability: "usb_dp" } },
    { id: "dm", required: true, match: { capability: "usb_dm" } },
  ],
  profiles: [
    { id: "usb_device_usb_c", label: "USB-C receptacle D+/D-", bindings: { dp: "usb_c", dm: "usb_c" } },
  ],
  maxInstances: 1,
});

/**
 * GPIO (single pin) — JSON protocol digital/peer, requiring one digital_io
 * function. Eleven pads (D0-D10) carry digital_io, so up to eleven
 * simultaneous instances exist; any pad satisfies the slot.
 */
const gpio = composed({
  id: "gpio",
  name: "GPIO (single pin)",
  protocolType: "digital",
  roles: ["peer"], // JSON-verbatim role
  slots: [
    { id: "io", required: true, match: { protocol: "digital", capability: "digital_io" } },
  ],
  maxInstances: 11,
  traits: [
    {
      type: "instance_combinations",
      params: {
        combination_space: "Any of the 11 digital-capable edge pads (D0-D10); one GPIO instance per pad.",
        source: `${SOURCE}, electrical resources`,
      },
    },
  ],
});

/**
 * ADC (single channel) — JSON requires one analog_input function; only
 * D0-D3 (A0-A3) carry it, so at most four simultaneous channels exist.
 * The JSON states no resolution, sample rate, or measurement range —
 * none are invented here.
 */
const adcIn = composed({
  id: "adc_in",
  name: "ADC (single channel)",
  protocolType: "analog",
  roles: ["input"],
  slots: [
    { id: "channel", required: true, match: { protocol: "analog", role: "input", capability: "analog_in" } },
  ],
  maxInstances: 4,
  traits: [
    {
      type: "channels",
      params: { count: 4, mapping: "A0=D0, A1=D1, A2=D2, A3=D3", source: `${SOURCE}, electrical resources` },
    },
  ],
});

/**
 * I2C master — hand-rolled rather than built with the I2C() builder because
 * the builder always emits a clock_freq parameter (defaulting to 400 kHz
 * Fast-mode) and the JSON states no I2C clock speed; slot shapes mirror the
 * builder's canonical ones. JSON requires i2c_sda + i2c_scl, fixed on D4/D5.
 */
const i2cMaster = composed({
  id: "i2c_master",
  name: "I2C master",
  protocolType: "i2c",
  roles: ["master"],
  slots: [
    { id: "sda", required: true, match: { protocol: "i2c", role: "data", capability: "i2c_sda" } },
    { id: "scl", required: true, match: { protocol: "i2c", role: "clock", capability: "i2c_scl" } },
  ],
  profiles: [
    { id: "i2c_master_default", label: "SDA=D4, SCL=D5", bindings: { sda: "d4", scl: "d5" } },
  ],
  maxInstances: 1,
  traits: [{ type: "display_notation", params: { latex: "I^{2}C" } }],
});

/**
 * SPI master — JSON requires spi_sck + spi_mosi + spi_miso + spi_ss, on
 * D8/D10/D9/D7 respectively. No clock frequency is stated in the JSON so
 * none is emitted (the SPI builder only adds parameters when provided).
 */
const spiMaster = amend(
  SPI({
    id: "spi_master",
    name: "SPI master",
    roles: ["master"],
    mosi: "d10",
    miso: "d9",
    sck: "d8",
    ss: "d7",
    maxInstances: 1,
  }),
  "spi_master",
  [
    {
      type: "co_requirement",
      params: {
        with: "uart",
        condition: "SPI SS bound to D7 while the UART is also required",
        effect:
          "D7 doubles as the default UART RX pin — SPI-SS and UART may contend if both are required simultaneously.",
        source: `${SOURCE}, warnings`,
      },
    },
  ],
);

/**
 * UART — hand-rolled rather than built with UART() so the JSON-verbatim
 * protocol role "peer" is preserved (the builder only offers host/device);
 * slot shapes mirror the builder's canonical ones. JSON requires uart_tx +
 * uart_rx, fixed on D6/D7.
 */
const uart = composed({
  id: "uart",
  name: "UART",
  protocolType: "uart",
  roles: ["peer"], // JSON-verbatim role
  slots: [
    { id: "rx", required: true, match: { protocol: "uart", role: "receiver", capability: "uart_rx" } },
    { id: "tx", required: true, match: { protocol: "uart", role: "transmitter", capability: "uart_tx" } },
  ],
  profiles: [
    { id: "uart_default", label: "TX=D6, RX=D7 (board default)", bindings: { rx: "d7", tx: "d6" } },
  ],
  maxInstances: 1,
  traits: [
    {
      type: "default_routing",
      params: {
        note: "D6/D7 are the default UART TX/RX pins.",
        source: `${SOURCE}, warnings`,
      },
    },
    {
      type: "co_requirement",
      params: {
        with: "spi_master",
        condition: "SPI SS on D7 in use",
        effect:
          "D7 is also modeled as SPI SS, so UART and SPI-SS may contend if both are required simultaneously.",
        source: `${SOURCE}, warnings`,
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Network domain — U.FL antenna feed and radios (JSON network domain)
// ---------------------------------------------------------------------------

/**
 * U.FL external antenna connector — a physical wireless port (JSON
 * `resource_type: physical_port`, connector `u.fl`) whose two functions
 * (wifi_antenna, bluetooth_antenna) are mutually shareable: one antenna
 * feed serves both radios.
 */
const uflAntenna: InterfaceDef = {
  id: "ufl_antenna",
  name: "U.FL external antenna connector",
  domain: "network",
  exposed: true,
  default_active: true,
  protocols: [{ type: "rf", roles: ["transceiver"] }],
  capabilities: ["wifi_antenna", "bluetooth_antenna"],
  traits: [
    {
      type: "rf_port",
      params: {
        port_type: "wireless",
        connector: "u.fl",
        description: "External U.FL antenna connector — the board's only modeled antenna feed.",
        source: `${SOURCE}, network resources`,
      },
    },
    {
      type: "net_shareable",
      params: {
        net: "xiao_antenna_feed",
        policy: "single_antenna_serves_both_radios",
        members: ["wifi_antenna", "bluetooth_antenna"],
      },
    },
  ],
  bridgesTo: ["wifi_client", "bluetooth_peer"],
};

/** Wi-Fi (client) — JSON requires one wifi_antenna function. */
const wifiClient = composed({
  id: "wifi_client",
  name: "Wi-Fi (client)",
  domain: "network",
  protocolType: "wifi",
  roles: ["client"],
  capabilities: ["wifi_802_11_bgn", "wifi_2g4"],
  slots: [{ id: "antenna", required: true, match: { capability: "wifi_antenna" } }],
  profiles: [
    { id: "wifi_ufl", label: "U.FL external antenna", bindings: { antenna: "ufl_antenna" } },
  ],
  maxInstances: 1,
  traits: [
    {
      type: "wireless_standard",
      params: { standard: "802.11 b/g/n (2.4GHz)", source: `${SOURCE}, network wireless_capabilities` },
    },
  ],
});

/** Bluetooth LE — JSON requires one bluetooth_antenna function. */
const bluetoothPeer = composed({
  id: "bluetooth_peer",
  name: "Bluetooth LE",
  domain: "network",
  protocolType: "bluetooth",
  roles: ["peer"],
  capabilities: ["bluetooth_le", "bluetooth_2g4"],
  slots: [{ id: "antenna", required: true, match: { capability: "bluetooth_antenna" } }],
  profiles: [
    { id: "bluetooth_ufl", label: "U.FL external antenna", bindings: { antenna: "ufl_antenna" } },
  ],
  maxInstances: 1,
  traits: [
    {
      type: "wireless_standard",
      params: { standard: "Bluetooth 5 (LE)", source: `${SOURCE}, network wireless_capabilities` },
    },
  ],
});

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

export const SEEED_XIAO_ESP32C3: ModuleDef = defineModule({
  id: "seeed-xiao-esp32c3",
  name: "Seeed Studio XIAO ESP32C3",
  version: "0.2.0",
  manufacturer: "Seeed Studio",
  part_number: "113991054",
  description:
    "Thumb-sized ESP32-C3 (RISC-V) dev board in the XIAO form factor with USB-C, 3.3V I/O, Wi-Fi + BLE, and an external U.FL antenna connector.",
  tags: ["xiao", "esp32-c3", "risc-v", "wifi", "ble", "usb-c"],
  categories: ["microcontroller.seeed_mcu", "microcontroller.esp32", "connectivity.wireless"],

  interfaces: [
    // Edge pads + connectors in the JSON's resource order — schematic-honest.
    ...pads,

    // Composed electrical interfaces (JSON electrical `interfaces`)
    powerInUsb,
    powerOut3v3,
    usbDevice,
    gpio,
    adcIn,
    i2cMaster,
    ...spiMaster,
    uart,

    // Network domain: antenna feed and radios
    uflAntenna,
    wifiClient,
    bluetoothPeer,
  ],

  interfaceGroups: [
    {
      id: "power_entry",
      label: "5V Power Entry (USB-C receptacle or 5V edge pad)",
      members: ["usb_c", "pin_5v"],
      policy: "any_of",
    },
    {
      id: "analog_capable_pads",
      label: "Analog-Capable Pads (A0-A3)",
      members: ["d0", "d1", "d2", "d3"],
      policy: "any_of",
    },
  ],

  requirements: [
    {
      type: "power",
      description:
        "5 V supply on the usb_5v domain, via the USB-C receptacle or the 5V edge pad (4.75-5.25 V). Treat the 500 mA figure as a USB2.0 default-budget dependent on the upstream source, not a guaranteed capability.",
      voltage_V: [4.75, 5.25],
      current_mA: 500,
    },
    {
      type: "capability",
      description:
        "Wi-Fi/BLE operation requires an external 2.4 GHz antenna attached to the U.FL connector — the JSON models no onboard antenna.",
      capability: "wifi_antenna",
    },
  ],

  domains: [
    {
      domain: "electrical",
      power_domains: [
        { id: "usb_5v", name: "USB / 5V rail", nominal_voltage_V: 5, voltage_range_V: USB_5V_RANGE, max_current_mA: 500 },
        {
          id: "regulated_3v3",
          name: "3.3V regulator output",
          nominal_voltage_V: 3.3,
          voltage_range_V: RANGE_3V3,
          max_current_mA: 700,
          regulation_type: "regulated",
        },
        { id: "io_3v3", name: "3.3V digital/analog I/O reference", nominal_voltage_V: 3.3, voltage_range_V: RANGE_3V3, max_current_mA: 20 },
        { id: "gnd", name: "Ground", nominal_voltage_V: 0, voltage_range_V: [0, 0], max_current_mA: 2000 },
      ],
      metadata: {
        edge_pads: 14,
        edge_pad_names: ["D0", "D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10", "5V", "3V3", "GND"],
        connectors: ["USB-C receptacle", "U.FL antenna connector"],
        pad_designators: "silkscreen names — the audited JSON assigns no numeric pad indices",
        io_3v3_current_note:
          "max_current_mA 20 is the io_3v3 domain figure from the JSON; it does not state whether this is per-pad or aggregate.",
        source: SOURCE,
      },
    },
    {
      domain: "network",
      metadata: {
        wireless_standards: ["802.11 b/g/n (2.4GHz)", "Bluetooth 5 (LE)"],
        antenna: "external via U.FL connector",
        source: `${SOURCE}, network wireless_capabilities`,
      },
    },
    {
      domain: "thermal",
      operating_temperature_C: [-40, 85],
    },
    {
      domain: "mechanical",
      // The JSON states length and width only — no height.
      dimensions_mm: { length: 21, width: 17.8 },
      metadata: {
        form_factor: "Seeed Studio XIAO",
        mounting: "14 edge pads (connector_type: pin) + USB-C receptacle",
        source: SOURCE,
      },
    },
  ],

  traits: [
    {
      type: "logic_level_restriction",
      params: {
        note: "All GPIO/ADC are 3.3V-domain; do not apply 5V logic directly.",
        source: `${SOURCE}, warnings`,
      },
    },
    {
      type: "boot_strapping_advisory",
      params: {
        note: "Some pins are strapping/boot sensitive (board docs recommend avoiding external pulls on certain pins during reset/boot).",
        limitation: "The audited JSON does not enumerate which pads are strapping-sensitive — verify against board docs before adding external pulls.",
        source: `${SOURCE}, warnings`,
      },
    },
    { type: "wireless_soc", params: { radios: ["wifi_client", "bluetooth_peer"], rfFeed: "ufl_antenna" } },
    {
      type: "terminology_policy",
      params: {
        note: "Function names in `xiao_pad_functions` traits are JSON-verbatim and intentionally NOT normalised to a curated whitelist; canonical capability tags exist only where slot matching requires them.",
      },
    },
  ],

  artifacts: [
    {
      id: "art_product_page",
      name: "Seeed Studio XIAO ESP32C3 Product Page",
      type: "documentation",
      url: "https://www.seeedstudio.com/Seeed-XIAO-ESP32C3-p-5431.html",
      description: "Vendor product page — the datasheet_url recorded in the audited ProtoPart definition.",
    },
    {
      id: "art_thumbnail",
      name: "Seeed Studio XIAO ESP32C3 Thumbnail",
      type: "custom",
      filePath: "./ProtoPart/protoparts/seeed-xiao-esp32c3/thumbnail.png",
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
