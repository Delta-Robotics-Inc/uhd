/**
 * ST VL53L0X — datasheet-honest part definition.
 *
 * Primary source: ProtoPart audited definition `vl53l0x` (schema 1.4.0,
 * v1.0), itself audited from the ST VL53L0X datasheet
 * (https://www.st.com/resource/en/datasheet/vl53l0x.pdf):
 *   - Electrical domain: single `avdd_main` power domain (2.8 V nominal,
 *     2.6-3.5 V) feeding both AVDD and AVDDVCSEL; 12-pad Optical LGA-12
 *     pinout; I2C target (400 kHz max, default 7-bit address 0x29);
 *     XSHUT hardware-standby input; GPIO1 open-drain interrupt output.
 *   - Design rules: shared AVDD/AVDDVCSEL supply, 100 nF + 4.7 uF
 *     decoupling, 1.5-2 kOhm I2C pull-ups (2.8 V @ 400 kHz, once per bus),
 *     XSHUT must always be driven, DNC pin 8 floating / GPIO1 unconnected
 *     when unused.
 *   - Warnings: Class 1 laser (IEC 60825-1:2014), reflectance-dependent
 *     range, XSHUT-low disables I2C.
 * Nothing below is carried over from convention or SDK defaults; values not
 * present in the ProtoPart JSON (e.g. supply current, per-pin logic levels)
 * are omitted rather than invented.
 *
 * Architecture notes honoured by this file:
 *   - Pin-honest like a schematic: all 12 physical pads are leaf interfaces,
 *     in package order, with ids "pin_N" and the datasheet pad name as the
 *     displayed name. Pad 8 (DNC) is modelled explicitly even though the
 *     ProtoPart resources list omits it — the design rules document it
 *     ("Leave DNC pin 8 floating"), and a schematic-honest part shows every
 *     pad.
 *   - Every pad carries its ProtoPart function list (name, direction,
 *     signal class) in a `vl53l0x_pin_functions` trait — display data is
 *     separated from the canonical capability tags the matching engine needs.
 *   - Buses are separate composed interfaces: the I2C target binds SDA/SCL
 *     through slots + a default profile; XSHUT and GPIO1 get `gpio_control`
 *     / `gpio_interrupt` composed interfaces mirroring the ProtoPart
 *     `interfaces` block.
 *   - Co-requirements (`co_requirement` traits): XSHUT low forces hardware
 *     standby and disables I2C.
 *   - Implied harness connections (`implied_passives` traits): supply
 *     decoupling (100 nF + 4.7 uF), I2C bus pull-ups (1.5-2 kOhm), the
 *     conditional XSHUT pull-up, the conditional GPIO1 pull-up.
 *   - Shareability exemptions (`net_shareable` traits): AVDD and AVDDVCSEL
 *     sit on one supply net (a single supply instance may serve both);
 *     AVSSVCSEL plus all GND pads are one ground net; SDA/SCL are multi-drop
 *     bus lines (the ProtoPart requires-block marks them shareable with each
 *     other).
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
  I2C,
  PowerIn,
  defineModule,
} from "../../src/protocols/index.js";

// ---------------------------------------------------------------------------
// Electrical constants — ProtoPart electrical domain
// ---------------------------------------------------------------------------

/** `avdd_main` power domain: single external supply feeding AVDD and AVDDVCSEL. */
const AVDD_RANGE: [number, number] = [2.6, 3.5];
const AVDD_NOMINAL_V = 2.8;
/** `timing.max_i2c_freq_hz` / electrical metadata `i2c_max_frequency_hz`. */
const I2C_MAX_FREQ_HZ = 400_000;
/** Electrical metadata `i2c_address_7bit` (0x29; 8-bit write form 0x52). */
const I2C_ADDRESS_7BIT = 0x29;

const SOURCE = "ST VL53L0X datasheet, via ProtoPart audited definition vl53l0x v1.0";
const DESIGN_RULES_SOURCE = `${SOURCE} (design_rules)`;

// ---------------------------------------------------------------------------
// Datasheet-honest per-pin function metadata
// ---------------------------------------------------------------------------

interface Vl53l0xFunction {
  /** Verbatim function name from the ProtoPart resource entry. */
  name: string;
  /** ProtoPart `direction` field, carried verbatim. */
  direction: "input" | "output" | "bidirectional" | "sink" | "source";
  /** ProtoPart `signal_class` field, carried verbatim. */
  signal_class: "power" | "ground" | "data" | "clock";
}

/** Preserve a pad's ProtoPart function list + description as display data. */
function pinFunctions(functions: Vl53l0xFunction[], description: string): TraitDef {
  return {
    type: "vl53l0x_pin_functions",
    params: { source: SOURCE, functions, description },
  };
}

// ---------------------------------------------------------------------------
// Power and ground pads — Optical LGA-12, in package pin order
// ---------------------------------------------------------------------------

/** AVSSVCSEL + all GND pads sit on the main ground net (design rule 1). */
const GROUND_NET_MEMBERS = ["pin_2", "pin_3", "pin_4", "pin_6", "pin_12"];

function groundPin(pinNo: number, name: string, description: string): InterfaceDef {
  return {
    ...Ground({ id: `pin_${pinNo}`, name, pin: pinNo }),
    traits: [
      pinFunctions([{ name: "ground", direction: "sink", signal_class: "ground" }], description),
      // The ProtoPart resource assigns ground pads to the avdd_main domain
      // (ground_reference: "common").
      { type: "power_domain", params: { domain: "avdd_main" } },
      {
        type: "net_shareable",
        params: {
          net: "gnd",
          policy: "single_ground_instance_may_serve_all_members",
          members: GROUND_NET_MEMBERS,
          note: "Connect AVSSVCSEL plus all GND pins to the main ground.",
          source: DESIGN_RULES_SOURCE,
        },
      },
    ],
  };
}

/** AVDDVCSEL (pin 1) and AVDD (pin 11) share one decoupled 2.6-3.5 V net. */
function supplyPin(pinNo: number, name: string, description: string, decouplingConnection: string): InterfaceDef {
  const base = PowerIn({
    id: `pin_${pinNo}`,
    name,
    pin: pinNo,
    voltageV: AVDD_RANGE,
    nominalV: AVDD_NOMINAL_V,
  });
  return {
    ...base,
    traits: [
      pinFunctions([{ name: "power_in", direction: "sink", signal_class: "power" }], description),
      { type: "power_domain", params: { domain: "avdd_main" } },
      {
        // Shareability exemption: one supply instance may legally serve both
        // supply pads — the datasheet mandates a single shared rail.
        type: "net_shareable",
        params: {
          net: "vl53l0x_avdd",
          policy: "single_supply_instance_may_serve_all_members",
          members: ["pin_1", "pin_11"],
          note: "Power AVDD and AVDDVCSEL from the same 2.6 V to 3.5 V supply.",
          source: DESIGN_RULES_SOURCE,
        },
      },
      {
        type: "implied_passives",
        params: {
          purpose: "Supply decoupling",
          components: [
            { kind: "capacitor", value: "100 nF", connection: decouplingConnection },
            { kind: "capacitor", value: "4.7 uF", connection: decouplingConnection },
          ],
          source: `${DESIGN_RULES_SOURCE}: 'Place 100 nF and 4.7 uF decoupling capacitors as close as possible to the AVDDVCSEL/AVSSVCSEL and AVDD pins.'`,
        },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Signal and service pads
// ---------------------------------------------------------------------------

const xshutPad: InterfaceDef = {
  id: "pin_5",
  name: "XSHUT",
  pin: 5,
  domain: "electrical",
  exposed: true,
  default_active: true,
  protocols: [{ type: "digital", roles: ["input"] }],
  capabilities: ["shutdown_ctrl"],
  traits: [
    pinFunctions(
      [{ name: "shutdown_ctrl", direction: "input", signal_class: "data" }],
      "Active-low hardware shutdown input.",
    ),
    {
      type: "drive_requirement",
      params: {
        rule: "Drive XSHUT at all times to avoid leakage current.",
        source: DESIGN_RULES_SOURCE,
      },
    },
    {
      type: "implied_passives",
      params: {
        purpose: "Guaranteed XSHUT level while the host is in reset",
        components: [
          { kind: "resistor", value: "10 kOhm (recommended)", connection: "XSHUT to the main supply" },
        ],
        condition: "Add a pull-up if the host state during reset is not guaranteed.",
        source: `${DESIGN_RULES_SOURCE}; value per ST VL53L0X datasheet DS11555 Rev 2 Figure 3 note: 'XSHUT and GPIO1 pull up recommended values are 10k Ohms'`,
      },
    },
    {
      type: "co_requirement",
      params: {
        with: "i2c_target",
        condition: "XSHUT held low",
        effect: "Holding XSHUT low forces hardware standby and disables I2C communication.",
        source: `${SOURCE} (warnings / shutdown_in interface)`,
      },
    },
  ],
};

const gpio1Pad: InterfaceDef = {
  id: "pin_7",
  name: "GPIO1",
  pin: 7,
  domain: "electrical",
  exposed: true,
  default_active: true,
  protocols: [{ type: "digital", roles: ["output"] }],
  capabilities: ["interrupt_out"],
  traits: [
    pinFunctions(
      [{ name: "interrupt", direction: "output", signal_class: "data" }],
      "Open-drain interrupt output.",
    ),
    {
      type: "output_driver",
      params: {
        drive: "open_drain",
        note: "GPIO1 is open-drain and requires a pull-up if used.",
        source: `${SOURCE} (compatibility_notes)`,
      },
    },
    {
      type: "implied_passives",
      params: {
        purpose: "Open-drain interrupt line pull-up",
        components: [
          { kind: "resistor", value: "10 kOhm (recommended)", connection: "GPIO1 to the bus/IO supply" },
        ],
        condition: "Only when interrupt signaling is used.",
        source: `${SOURCE} (compatibility_notes); value per ST VL53L0X datasheet DS11555 Rev 2 Figure 3 note: 'XSHUT and GPIO1 pull up recommended values are 10k Ohms'`,
      },
    },
    {
      type: "optionality",
      params: {
        note: "Leave GPIO1 unconnected if interrupt signaling is not used.",
        source: DESIGN_RULES_SOURCE,
      },
    },
  ],
};

// Pad 8 is absent from the ProtoPart resources list; the design rules name
// it DNC and require it floating, so it is modelled as an unconnectable pad.
const dncPad: InterfaceDef = {
  id: "pin_8",
  name: "DNC",
  pin: 8,
  domain: "electrical",
  exposed: false,
  default_active: false,
  protocols: [],
  capabilities: ["do_not_connect"],
  traits: [
    {
      type: "usage_restriction",
      params: {
        restriction: "Leave DNC pin 8 floating.",
        source: DESIGN_RULES_SOURCE,
      },
    },
  ],
};

const sdaPad: InterfaceDef = {
  id: "pin_9",
  name: "SDA",
  pin: 9,
  domain: "electrical",
  exposed: true,
  default_active: true,
  protocols: [{ type: "digital", roles: ["input", "output", "bidirectional"] }],
  capabilities: ["i2c_sda"],
  traits: [
    pinFunctions([{ name: "i2c_sda", direction: "bidirectional", signal_class: "data" }], "I2C serial data."),
  ],
};

// SCL is an input on this target device (the ProtoPart function direction is
// "input") — no output roles are claimed.
const sclPad: InterfaceDef = {
  id: "pin_10",
  name: "SCL",
  pin: 10,
  domain: "electrical",
  exposed: true,
  default_active: true,
  protocols: [{ type: "digital", roles: ["input"] }],
  capabilities: ["i2c_scl"],
  traits: [
    pinFunctions([{ name: "i2c_scl", direction: "input", signal_class: "clock" }], "I2C serial clock input."),
  ],
};

/** All 12 pads in physical package order — schematic-honest. */
const pins: InterfaceDef[] = [
  supplyPin(1, "AVDDVCSEL", "VCSEL supply pin connected to the main supply.", "close to the AVDDVCSEL/AVSSVCSEL pins"),
  groundPin(2, "AVSSVCSEL", "VCSEL ground return."),
  groundPin(3, "GND", "Main ground."),
  groundPin(4, "GND2", "Ground."),
  xshutPad,
  groundPin(6, "GND3", "Ground."),
  gpio1Pad,
  dncPad,
  sdaPad,
  sclPad,
  supplyPin(11, "AVDD", "Main supply input.", "close to the AVDD pin"),
  groundPin(12, "GND4", "Ground."),
];

// ---------------------------------------------------------------------------
// Composed interfaces — ProtoPart electrical `interfaces` block
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

// I2C target — ST terminology is "target"; the OpenUHD I2C role vocabulary
// expresses that as "slave". SDA/SCL are fixed pads, so the single profile is
// the honest combination space.
const I2C_TARGET_TRAITS: TraitDef[] = [
  {
    type: "i2c_addressing",
    params: {
      default_address_7bit: "0x29",
      default_address_8bit_write: "0x52",
      programmable: true,
      note:
        "Programmable I2C address; default 7-bit address 0x29. ST documents the default as 0x52 in 8-bit form, which corresponds to 7-bit address 0x29 used by most host SDKs.",
      source: `${SOURCE} (i2c_target interface / compatibility_notes)`,
    },
  },
  {
    type: "implied_passives",
    params: {
      purpose: "Open-drain bus pull-ups",
      components: [
        {
          kind: "resistor",
          value: "1.5-2 kOhm (ST recommendation for 2.8 V operation at 400 kHz)",
          connection: "SDA and SCL to the bus supply — fit only once per bus",
        },
      ],
      source: DESIGN_RULES_SOURCE,
    },
  },
  {
    // The ProtoPart requires-block marks i2c_sda and i2c_scl as shareable
    // with each other: one shared bus harness may carry both functions, and
    // the bus itself is multi-drop.
    type: "net_shareable",
    params: {
      net: "i2c_bus",
      policy: "multi_drop_bus_shared_across_targets",
      note:
        "Multi-sensor arrays on one bus are typically managed by holding devices in hardware standby through XSHUT, then assigning unique addresses during initialization.",
      source: `${SOURCE} (requires.shareable_with / usage_notes)`,
    },
  },
  {
    type: "co_requirement",
    params: {
      with: "pin_5",
      condition: "XSHUT held low",
      effect: "I2C is unavailable while XSHUT is held low (hardware standby).",
      source: `${SOURCE} (shutdown_in interface / warnings)`,
    },
  },
];

const i2cTarget = amend(
  I2C({
    id: "i2c_target",
    name: "I2C target interface",
    roles: ["slave"],
    clockFreqHz: I2C_MAX_FREQ_HZ,
    address: I2C_ADDRESS_7BIT,
    sda: "pin_9",
    scl: "pin_10",
    maxInstances: 1,
    defaultActive: true,
  }),
  "i2c_target",
  I2C_TARGET_TRAITS,
);

const interruptOut = composed({
  id: "interrupt_out",
  name: "Interrupt output",
  protocolType: "gpio_interrupt",
  roles: ["source"],
  slots: [{ id: "int", required: true, match: { capability: "interrupt_out" } }],
  profiles: [
    { id: "interrupt_out_gpio1", label: "GPIO1 (pin 7)", bindings: { int: "pin_7" } },
  ],
  maxInstances: 1,
  defaultActive: false, // optional — leave GPIO1 unconnected when unused
  traits: [
    {
      type: "output_driver",
      params: {
        drive: "open_drain",
        note: "GPIO1 open-drain interrupt output — requires a pull-up if used.",
        source: `${SOURCE} (interrupt_out interface / compatibility_notes)`,
      },
    },
    {
      type: "optionality",
      params: {
        note: "Leave GPIO1 unconnected if interrupt signaling is not used.",
        source: DESIGN_RULES_SOURCE,
      },
    },
  ],
});

const shutdownIn = composed({
  id: "shutdown_in",
  name: "Hardware standby control",
  protocolType: "gpio_control",
  roles: ["sink"],
  slots: [{ id: "xshut", required: true, match: { capability: "shutdown_ctrl" } }],
  profiles: [
    { id: "shutdown_in_xshut", label: "XSHUT (pin 5)", default_active: true, bindings: { xshut: "pin_5" } },
  ],
  maxInstances: 1,
  defaultActive: true, // XSHUT must be driven at all times (design rule)
  traits: [
    {
      type: "co_requirement",
      params: {
        with: "i2c_target",
        condition: "XSHUT driven low",
        effect: "Drive XSHUT low for hardware standby; I2C is unavailable while held low.",
        source: `${SOURCE} (shutdown_in interface)`,
      },
    },
    {
      type: "multi_sensor_usage",
      params: {
        note:
          "Multi-sensor arrays on one bus are typically managed by holding devices in hardware standby through XSHUT, then assigning unique addresses during initialization.",
        source: `${SOURCE} (usage_notes)`,
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Mechanical
// ---------------------------------------------------------------------------

const footprintMount: InterfaceDef = {
  id: "footprint_mounting",
  name: "Optical LGA-12 4.4×2.4 mm Surface-Mount Footprint",
  domain: "mechanical",
  exposed: true,
  default_active: true,
  protocols: [{ type: "mechanical_connection", roles: ["mounting_point"] }],
  capabilities: ["lga12_optical", "surface_mount"],
};

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

export const VL53L0X: ModuleDef = defineModule({
  id: "vl53l0x",
  name: "ST VL53L0X Time-of-Flight Ranging Sensor",
  version: "1.0.0",
  manufacturer: "STMicroelectronics",
  part_number: "VL53L0X",
  description:
    "Single-zone 940 nm laser time-of-flight ranging sensor with embedded SPAD array, programmable I2C target interface, XSHUT hardware standby input, and GPIO1 interrupt output.",
  tags: ["vl53l0x", "tof", "distance", "ranging", "i2c", "0x29", "xshut", "gpio1", "laser", "stmicroelectronics"],
  categories: ["sensor.distance"],

  interfaces: [
    // All 12 physical pads in package order — schematic-honest.
    ...pins,

    // Bus / control interfaces (ProtoPart electrical `interfaces` block)
    ...i2cTarget,
    interruptOut,
    shutdownIn,

    // Mechanical
    footprintMount,
  ],

  interfaceGroups: [
    {
      id: "required_power_pins",
      label: "Required Power Pins",
      members: ["pin_1", "pin_2", "pin_3", "pin_4", "pin_6", "pin_11", "pin_12"],
      policy: "all_of",
    },
    {
      id: "avdd_common_net",
      label: "Supply Pins (one shared 2.6-3.5 V net)",
      members: ["pin_1", "pin_11"],
      policy: "all_of",
    },
    {
      id: "i2c_bus_pins",
      label: "I2C Bus Pins",
      members: ["pin_9", "pin_10"],
      policy: "all_of",
    },
  ],

  requirements: [
    {
      type: "power",
      description:
        "Power AVDD and AVDDVCSEL from the same 2.6 V to 3.5 V supply (2.8 V nominal) and connect AVSSVCSEL plus all GND pins to the main ground. The ProtoPart definition specifies no supply-current figure.",
      voltage_V: AVDD_RANGE,
    },
    {
      type: "interface",
      description:
        "A host I2C controller (up to 400 kHz) with external pull-ups fitted only once per bus; ST recommends 1.5-2 kOhm pull-ups for 2.8 V operation at 400 kHz.",
      interface_protocol: "i2c",
    },
    {
      type: "interface",
      description:
        "XSHUT must be driven at all times to avoid leakage current; add a pull-up if the host state during reset is not guaranteed.",
      interface_protocol: "gpio_control",
    },
  ],

  domains: [
    {
      domain: "electrical",
      power_domains: [
        {
          id: "avdd_main",
          name: "Main supply",
          nominal_voltage_V: AVDD_NOMINAL_V,
          voltage_range_V: AVDD_RANGE,
        },
      ],
      metadata: {
        pin_count: 12,
        supply_voltage_V: AVDD_RANGE,
        package_type: "Optical LGA-12",
        i2c_address_7bit: "0x29",
        i2c_address_8bit_write: "0x52",
        i2c_max_frequency_hz: I2C_MAX_FREQ_HZ,
        field_of_view_deg: 25,
        laser_wavelength_nm: 940,
        maximum_ranging_distance_cm: 200,
        typical_profile_distance_cm: 120,
        // PowerDomainDef has no home for these ProtoPart power-domain fields:
        power_domain_details: {
          avdd_main: {
            isolation_type: "non_isolated",
            ground_reference: "common",
            description: "Single external supply feeding both AVDD and AVDDVCSEL.",
          },
        },
        source: SOURCE,
      },
    },
    {
      domain: "mechanical",
      dimensions_mm: { length: 4.4, width: 2.4, height: 1 },
      metadata: {
        package_type: "Optical LGA-12",
        mounting_method: "surface_mount",
      },
    },
    {
      domain: "thermal",
      operating_temperature_C: [-20, 70],
      metadata: {
        requires_thermal_management: false,
      },
    },
  ],

  traits: [
    {
      type: "laser_safety",
      params: {
        classification: "Class 1 laser device compliant with IEC 60825-1:2014",
        restriction: "Do not modify the optics or aperture geometry.",
        source: `${SOURCE} (warnings)`,
      },
    },
    {
      type: "ranging_performance",
      params: {
        maximum_ranging_distance_cm: 200,
        typical_profile_distance_cm: 120,
        field_of_view_deg: 25,
        laser_wavelength_nm: 940,
        caveat:
          "The advertised 2 m maximum range requires favorable target reflectance and indoor conditions; darker targets and outdoor IR reduce practical range significantly. Maximum usable range depends strongly on target reflectance and ambient infrared conditions.",
        source: `${SOURCE} (electrical metadata / warnings / compatibility_notes)`,
      },
    },
    {
      type: "usage_notes",
      params: {
        note:
          "The VL53L0X is a PCB-integration sensor module rather than a ready-to-wire breakout. It exposes a programmable I2C target interface plus XSHUT and GPIO1 for system control. Multi-sensor arrays on one bus are typically managed by holding devices in hardware standby through XSHUT, then assigning unique addresses during initialization.",
        source: SOURCE,
      },
    },
    {
      type: "application_examples",
      params: {
        examples: [
          "Wall tracking and collision avoidance for robotics.",
          "Access control and presence detection.",
          "Liquid level and inventory sensing.",
        ],
        source: SOURCE,
      },
    },
    {
      // Verbatim design-rule block, preserved for auditability; each rule is
      // also distributed onto the pad/bus it constrains as a structured trait.
      type: "design_rules",
      params: {
        rules: [
          "Power AVDD and AVDDVCSEL from the same 2.6 V to 3.5 V supply and connect AVSSVCSEL plus all GND pins to the main ground.",
          "Place 100 nF and 4.7 uF decoupling capacitors as close as possible to the AVDDVCSEL/AVSSVCSEL and AVDD pins.",
          "Use external I2C pull-ups only once per bus; ST recommends 1.5 kOhm to 2 kOhm pull-ups for 2.8 V operation at 400 kHz.",
          "Drive XSHUT at all times to avoid leakage current; add a pull-up if the host state during reset is not guaranteed.",
          "Leave DNC pin 8 floating and leave GPIO1 unconnected if interrupt signaling is not used.",
        ],
        source: SOURCE,
      },
    },
    {
      type: "preview_artifact",
      params: { artifactId: "art_thumbnail" },
    },
  ],

  artifacts: [
    {
      id: "art_datasheet",
      name: "ST VL53L0X Datasheet",
      type: "datasheet",
      url: "https://www.st.com/resource/en/datasheet/vl53l0x.pdf",
    },
    {
      id: "art_product_page",
      name: "ST VL53L0X Product Page",
      type: "documentation",
      url: "https://www.st.com/en/imaging-and-photonics-solutions/vl53l0x.html",
    },
    {
      id: "art_thumbnail",
      name: "Thumbnail",
      type: "custom",
      filePath: "./ProtoPart/protoparts/vl53l0x/thumbnail.png",
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
