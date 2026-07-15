/**
 * L298N Dual H-Bridge Motor Driver Module — audit-honest part definition.
 *
 * Primary source: ProtoPart audited definition
 *   ProtoPart/protoparts/l298n-motor-driver/definition.json (schema 1.4.0, part v0.3.0)
 * whose electrical values trace to the ST L298N datasheet (mirror:
 * components101.com L298N-Motor-Driver-Datasheet.pdf). Everything below is
 * carried over from that JSON — power-domain ranges (Vs 5-35 V board-dependent,
 * logic 4.5-5.5 V @ ~36 mA), per-output 2 A continuous rating, the 78M05
 * regulator's 100 mA / 5% / 100 mV delivery envelope, the ~2.3 V input-HIGH
 * threshold, the ~2 V Darlington drop, and the module's design rules,
 * validation requirements, usage notes, and warnings (all preserved verbatim
 * as traits). Nothing is invented beyond that JSON.
 *
 * Architecture notes honoured by this file:
 *   - Pin-honest like a schematic: all 13 board terminals defined by the
 *     ProtoPart resources are leaf interfaces with their official screw
 *     terminal / header designators as `pin` strings (the JSON assigns no
 *     numeric pin positions, so the silk-screen names are the designators).
 *   - Instances vs combinations: the two H-bridge channels are composed
 *     interfaces. Direction control is one interface per channel (the JSON
 *     defines `motor_channel_a_control` / `motor_channel_b_control`
 *     separately); the motor output is a single interface with two profiles
 *     (OUT1+OUT2, OUT3+OUT4) and `max_instances: 2`, mirroring the JSON's
 *     one `dc_motor_output` interface with `max_connections: 2`.
 *   - Co-requirements (`co_requirement` traits): the onboard 5 V regulator
 *     jumper vs. Vs ≤ ~12 V (regulator-output mode) and its inverse
 *     (external-5 V-input mode); the ENA/ENB enable jumpers vs. PWM speed
 *     control. Jumpers are not JSON resources, so they are modelled as
 *     traits, not pins.
 *   - Shareability: GND is a single common net for motor and logic returns
 *     (`net_shareable`); the JSON's `shareable_with` marking on the EN
 *     pwm_input requirement is preserved as a `slot_shareability` trait.
 *   - The mutually exclusive roles of the 5V terminal (regulated output vs.
 *     logic input) are expressed as two composed power interfaces over the
 *     same `vss_5v` pin, grouped `one_of`.
 */

import type {
  InterfaceDef,
  ModuleDef,
  TraitDef,
} from "../../src/types/index.js";
import {
  Ground,
  Pin,
  PowerIn,
  PowerOut,
  defineModule,
  maxCurrentA,
  voltageRangeV,
} from "../../src/protocols/index.js";

// ---------------------------------------------------------------------------
// Electrical constants — ProtoPart electrical domain (power_domains, resources)
// ---------------------------------------------------------------------------

/** power_domains.vmotor: board-dependent motor supply range, typically 5-35 V. */
const VS_RANGE: [number, number] = [5, 35];
/** power_domains.vmotor: nominal motor supply voltage. */
const VS_NOMINAL_V = 12;
/** power_domains.vmotor: max_current_mA 4000 (~2 A per channel, two channels). */
const VS_MAX_CURRENT_A = 4;

/** power_domains.logic5v: 5 V TTL logic supply range. */
const LOGIC_RANGE: [number, number] = [4.5, 5.5];
/** power_domains.logic5v: logic supply consumption (~36 mA). */
const LOGIC_MAX_CURRENT_A = 0.036;

/** resources.out1-out4 current_rating.source.max_continuous_mA. */
const OUT_MAX_CONTINUOUS_A = 2;

/** design_rules: "Logic input HIGH threshold is ~2.3 V ...". */
const V_IH_APPROX_V = 2.3;

/** design_rules / warnings: "~2 V or more drop across the bipolar outputs under load". */
const OUTPUT_DROP_TRAIT: TraitDef = {
  type: "voltage_drop",
  params: {
    drop_V_approx: 2,
    note: "Expect ~2 V or more drop across the bipolar (Darlington) outputs under load, so size Vs accordingly.",
    source: "ProtoPart usage_notes / warnings (L298N datasheet, bipolar output stage)",
  },
};

/** design_rules[6], verbatim — shared by every logic-level control pin. */
const LOGIC_LEVEL_TRAIT: TraitDef = {
  type: "logic_levels",
  params: {
    v_ih_approx_V: V_IH_APPROX_V,
    rule: "Logic input HIGH threshold is ~2.3 V, so 3.3 V control signals are typically acceptable, but the logic supply should still be 5 V.",
    source: "ProtoPart design_rules (L298N datasheet TTL input levels)",
  },
};

function powerDomainTrait(domain: "vmotor" | "logic5v"): TraitDef {
  return {
    type: "power_domain",
    params: {
      domain,
      isolation_type: "non_isolated",
      ground_reference: "common",
    },
  };
}

function connectorTrait(kind: "screw_terminal" | "pin_header"): TraitDef {
  return { type: "connector", params: { connector_type: kind } };
}

/** Verbatim per-terminal function description from the ProtoPart resource. */
function pinFunctionTrait(description: string): TraitDef {
  return {
    type: "l298n_pin_function",
    params: {
      description,
      source: "ProtoPart definition.json, electrical resources",
    },
  };
}

// ---------------------------------------------------------------------------
// Power terminals — screw terminal block (resources: vs_in, vss_5v, gnd)
// ---------------------------------------------------------------------------

const vsIn: InterfaceDef = {
  ...PowerIn({
    id: "vs_in",
    name: "VS (Motor Supply)",
    pin: "VS",
    voltageV: VS_RANGE,
    nominalV: VS_NOMINAL_V,
    maxCurrentA: VS_MAX_CURRENT_A,
  }),
  capabilities: ["power_in", "motor_supply_in"],
  traits: [
    powerDomainTrait("vmotor"),
    connectorTrait("screw_terminal"),
    pinFunctionTrait(
      "Motor supply input (Vs/Vcc2) for external power (e.g., battery or DC supply 5–35 V)",
    ),
    {
      type: "data_note",
      params: {
        note: "RESOLVED (datasheet audit 2026-07-09): the ST L298 datasheet specifies VS operative condition VIH+2.5 V (~4.8 V) min to 46 V max, 50 V absolute maximum — so neither of the previously conflicting quotes (4.5-36 V resource text vs 5-35 V domain) is an IC datasheet limit. 5-35 V is retained as the module-level operating range (board-dependent derating well inside the IC envelope); the former 4.5-36 V resource quote was corrected to match.",
        source: "ST L298 datasheet, ABSOLUTE MAXIMUM RATINGS (VS Power Supply 50 V) and ELECTRICAL CHARACTERISTICS (VS Supply Voltage, pin 4: VIH+2.5 min / 46 V max, operative condition)",
      },
    },
  ],
  // Vs feeds the H-bridge output stage directly, and the onboard 78M05
  // regulator derives the 5 V rail from it when the regulator jumper is fitted
  // (metadata.description: "onboard 5 V regulator (activated via jumper)").
  bridgesTo: ["out1", "out2", "out3", "out4", "vss_5v"],
};

/**
 * The 5V terminal is dual-role: regulated output (regulator jumper installed,
 * Vs modest) or logic input (jumper removed / Vs high). Hand-rolled because
 * the PowerIn/PowerOut builders are single-role; the two composed interfaces
 * `logic_5v_in` / `logic_5v_out` below expose each role separately.
 */
const vss5v: InterfaceDef = {
  id: "vss_5v",
  name: "5V (Vss Logic)",
  pin: "5V",
  domain: "electrical",
  exposed: true,
  default_active: true,
  protocols: [{ type: "power", roles: ["input", "output"] }],
  capabilities: ["logic_5v"],
  parameters: [{ id: "voltage", unit: "V", value: 5, range: LOGIC_RANGE }],
  traits: [
    powerDomainTrait("logic5v"),
    connectorTrait("screw_terminal"),
    pinFunctionTrait(
      "5 V logic pin. Acts as a regulated 5 V output when the onboard regulator jumper is installed and Vs is modest (typically ≤12 V); otherwise use as a 5 V logic input (jumper removed).",
    ),
    {
      type: "internal_regulator",
      params: {
        regulator: "78M05",
        description:
          "Onboard 5 V regulator (activated via jumper) that can power the logic circuitry and, within limits, an external controller.",
        source: "ProtoPart metadata.description / design_rules ('78M05 regulator')",
      },
    },
  ],
};

const gnd: InterfaceDef = {
  ...Ground({ id: "gnd", name: "GND", pin: "GND" }),
  traits: [
    powerDomainTrait("vmotor"),
    connectorTrait("screw_terminal"),
    pinFunctionTrait("Ground connection (common ground for motor and logic)"),
    {
      // Shareability exemption: one ground net legally serves the motor
      // supply return, the logic return, and the controller's ground.
      type: "net_shareable",
      params: {
        net: "gnd",
        policy: "single_ground_instance_may_serve_all_members",
        rule: "Always connect grounds: the motor power source ground, control logic ground, and module ground must be common.",
        source: "ProtoPart design_rules",
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Control header — IN1-IN4 direction inputs, ENA/ENB enable/PWM inputs
// ---------------------------------------------------------------------------

/** Direction input pin (IN1-IN4): input-only 5 V TTL logic, pin header. */
function directionInput(config: {
  id: string;
  name: string;
  description: string;
}): InterfaceDef {
  const base = Pin({
    id: config.id,
    name: config.name,
    pin: config.name,
    voltageV: 5,
    capabilities: { inputOnly: true },
  });
  return {
    ...base,
    capabilities: [...(base.capabilities ?? []), "digital_in"],
    traits: [
      powerDomainTrait("logic5v"),
      connectorTrait("pin_header"),
      pinFunctionTrait(config.description),
      LOGIC_LEVEL_TRAIT,
    ],
  };
}

const in1 = directionInput({
  id: "in1",
  name: "IN1",
  description: "IN1 - Logic input for Motor A (controls OUT1, one direction)",
});
const in2 = directionInput({
  id: "in2",
  name: "IN2",
  description: "IN2 - Logic input for Motor A (controls OUT2, opposite direction)",
});
const in3 = directionInput({
  id: "in3",
  name: "IN3",
  description: "IN3 - Logic input for Motor B (controls OUT3, one direction)",
});
const in4 = directionInput({
  id: "in4",
  name: "IN4",
  description: "IN4 - Logic input for Motor B (controls OUT4, opposite direction)",
});

/**
 * Enable/PWM input (ENA/ENB). Hand-rolled: the PWM builder models PWM
 * *outputs*, whereas these pins are PWM sinks (JSON function `pwm_input`,
 * direction sink). Each is jumper-able HIGH on many modules.
 */
function enableInput(config: {
  id: string;
  name: string;
  motor: "A" | "B";
  description: string;
}): InterfaceDef {
  return {
    id: config.id,
    name: config.name,
    pin: config.name,
    domain: "electrical",
    exposed: true,
    default_active: true,
    protocols: [
      { type: "pwm", roles: ["input"] },
      { type: "digital", roles: ["input"] },
    ],
    capabilities: ["pwm_in", "digital_in"],
    parameters: [{ id: "voltage", unit: "V", value: 5 }],
    traits: [
      powerDomainTrait("logic5v"),
      connectorTrait("pin_header"),
      pinFunctionTrait(config.description),
      LOGIC_LEVEL_TRAIT,
      {
        type: "enable_jumper",
        params: {
          default: "jumper installed — pin tied HIGH, channel enabled",
          note: `The module includes enable jumpers that tie ENA/ENB HIGH by default: with jumpers installed, each channel is enabled (full-speed if IN pins demand it); remove a jumper to drive that EN pin from a PWM-capable MCU output.`,
          source: "ProtoPart metadata.has_enable_jumpers / usage_notes",
        },
      },
      {
        type: "co_requirement",
        params: {
          with: `motor_channel_${config.motor.toLowerCase()}_control`,
          condition: "PWM speed control desired",
          effect: `PWM speed control of Motor ${config.motor} requires this pin's onboard enable jumper to be removed; with the jumper fitted the pin is held HIGH (full speed / enabled only).`,
          source: "ProtoPart design_rules / usage_notes",
        },
      },
    ],
  };
}

const enA = enableInput({
  id: "ena",
  name: "ENA",
  motor: "A",
  description: "ENA - Enable/PWM input for Motor A (jumper-able HIGH on many modules)",
});
const enB = enableInput({
  id: "enb",
  name: "ENB",
  motor: "B",
  description: "ENB - Enable/PWM input for Motor B (jumper-able HIGH on many modules)",
});

// ---------------------------------------------------------------------------
// Motor output terminals — OUT1-OUT4 screw terminals, 2 A continuous each
// ---------------------------------------------------------------------------

function motorOutput(config: {
  id: string;
  name: string;
  description: string;
}): InterfaceDef {
  const base = PowerOut({
    id: config.id,
    name: config.name,
    pin: config.name,
    voltageV: VS_RANGE, // output stage swings on the vmotor domain (minus the Darlington drop)
    maxCurrentA: OUT_MAX_CONTINUOUS_A,
  });
  return {
    ...base,
    capabilities: ["power_out", "motor_out"],
    traits: [
      powerDomainTrait("vmotor"),
      connectorTrait("screw_terminal"),
      pinFunctionTrait(config.description),
      OUTPUT_DROP_TRAIT,
    ],
  };
}

const out1 = motorOutput({
  id: "out1",
  name: "OUT1",
  description: "Motor A Output 1 (connect one terminal of Motor A here)",
});
const out2 = motorOutput({
  id: "out2",
  name: "OUT2",
  description: "Motor A Output 2 (connect the other terminal of Motor A here)",
});
const out3 = motorOutput({
  id: "out3",
  name: "OUT3",
  description: "Motor B Output 1 (connect one terminal of Motor B here)",
});
const out4 = motorOutput({
  id: "out4",
  name: "OUT4",
  description: "Motor B Output 2 (connect the other terminal of Motor B here)",
});

// ---------------------------------------------------------------------------
// Composed power interfaces — JSON electrical `interfaces`
// ---------------------------------------------------------------------------

const motorPowerIn: InterfaceDef = {
  id: "motor_power_in",
  name: "Motor Power Input (Vs + GND)",
  domain: "electrical",
  exposed: true,
  default_active: true,
  protocols: [{ type: "power", roles: ["input"] }],
  parameters: [
    voltageRangeV(VS_RANGE[0], VS_RANGE[1], VS_NOMINAL_V),
    maxCurrentA(VS_MAX_CURRENT_A),
  ],
  slots: [
    { id: "vs", required: true, match: { protocol: "power", role: "input", capability: "motor_supply_in" } },
    { id: "gnd", required: true, match: { capability: "ground" } },
  ],
  profiles: [
    {
      id: "motor_power_terminals",
      label: "VS + GND screw terminals",
      default_active: true,
      bindings: { vs: "vs_in", gnd: "gnd" },
    },
  ],
  max_instances: 1,
  traits: [
    {
      type: "source_description",
      params: { description: "Motor power supply input interface (connect Vs/Vcc2 and GND)" },
    },
  ],
};

const logic5vIn: InterfaceDef = {
  id: "logic_5v_in",
  name: "Logic 5V Input (Vss)",
  domain: "electrical",
  exposed: true,
  default_active: false, // one_of with logic_5v_out — the regulator jumper state selects the mode
  protocols: [{ type: "power", roles: ["input"] }],
  parameters: [
    voltageRangeV(LOGIC_RANGE[0], LOGIC_RANGE[1], 5),
    maxCurrentA(LOGIC_MAX_CURRENT_A),
  ],
  slots: [
    { id: "vss", required: true, match: { protocol: "power", role: "input", capability: "logic_5v" } },
    { id: "gnd", required: true, match: { capability: "ground" } },
  ],
  profiles: [
    {
      id: "logic_5v_in_terminals",
      label: "5V + GND screw terminals",
      bindings: { vss: "vss_5v", gnd: "gnd" },
    },
  ],
  max_instances: 1, // JSON constraints.max_connections: 1
  traits: [
    {
      type: "source_description",
      params: {
        description:
          "5 V logic input interface (Vss). Used when the onboard regulator jumper is removed or Vs is high.",
      },
    },
    {
      type: "connection_constraints",
      params: { max_connections: 1, requires_matching_voltage_domain: false },
    },
    {
      type: "co_requirement",
      params: {
        with: "vs_in",
        condition: "Vs above ~12 V",
        effect:
          "If motor supply voltage exceeds ~12 V, remove the onboard regulator jumper and supply 5 V to the logic input pin externally to avoid overheating the regulator.",
        source: "ProtoPart design_rules",
      },
    },
  ],
};

const logic5vOut: InterfaceDef = {
  id: "logic_5v_out",
  name: "Logic 5V Output (regulated)",
  domain: "electrical",
  exposed: true,
  default_active: false, // one_of with logic_5v_in — the regulator jumper state selects the mode
  protocols: [{ type: "power", roles: ["output"] }],
  parameters: [
    // JSON power_delivery: max 5 V / 100 mA, 5% regulation, 100 mV ripple.
    { id: "voltage", unit: "V", value: 5, tolerance: { type: "percent", value: 5 } },
    maxCurrentA(0.1),
    { id: "ripple_voltage", name: "Ripple voltage (max)", unit: "V", value: 0.1 },
  ],
  slots: [
    { id: "vss", required: true, match: { protocol: "power", role: "output", capability: "logic_5v" } },
    { id: "gnd", required: true, match: { capability: "ground" } },
  ],
  profiles: [
    {
      id: "logic_5v_out_terminals",
      label: "5V + GND screw terminals",
      bindings: { vss: "vss_5v", gnd: "gnd" },
    },
  ],
  max_instances: 1, // JSON constraints.max_connections: 1
  traits: [
    {
      type: "source_description",
      params: {
        description:
          "5 V regulated power output interface (jumper enabled, Vs typically ≤12 V). Can power a microcontroller lightly (≈100 mA max).",
      },
    },
    {
      type: "connection_constraints",
      params: { max_connections: 1, requires_matching_voltage_domain: false },
    },
    {
      type: "co_requirement",
      params: {
        with: "vs_in",
        condition: "onboard regulator jumper installed",
        effect:
          "Available only with the regulator jumper fitted and Vs modest (typically ≤12 V). Do not draw more than ~100 mA; excessive current can overheat the 78M05 regulator.",
        source: "ProtoPart design_rules / warnings",
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// H-bridge channels — direction control (per channel) + motor output (paired)
// ---------------------------------------------------------------------------

function motorChannelControl(config: {
  id: string;
  motor: "A" | "B";
  inHigh: string; // slot -> first direction pin id
  inLow: string; //  slot -> second direction pin id
  en: string;
  description: string;
}): InterfaceDef {
  return {
    id: config.id,
    name: `Motor ${config.motor} Control (${config.inHigh.toUpperCase()}/${config.inLow.toUpperCase()} + ${config.en.toUpperCase()})`,
    domain: "electrical",
    exposed: true,
    default_active: true,
    protocols: [{ type: "digital", roles: ["input"] }],
    slots: [
      // JSON requires: digital_input ×2 + pwm_input ×1 (shareable_with digital_input).
      { id: "in_a", required: true, match: { protocol: "digital", role: "input", capability: "digital_in" } },
      { id: "in_b", required: true, match: { protocol: "digital", role: "input", capability: "digital_in" } },
      { id: "en", required: true, match: { protocol: "pwm", role: "input", capability: "pwm_in" } },
    ],
    profiles: [
      {
        id: `channel_${config.motor.toLowerCase()}_pins`,
        label: `${config.inHigh.toUpperCase()}/${config.inLow.toUpperCase()} + ${config.en.toUpperCase()} header pins`,
        default_active: true,
        bindings: { in_a: config.inHigh, in_b: config.inLow, en: config.en },
      },
    ],
    max_instances: 1,
    traits: [
      { type: "source_description", params: { description: config.description } },
      {
        type: "slot_shareability",
        params: {
          slot: "en",
          shareable_with: ["digital_input"],
          note: "The JSON marks the pwm_input requirement shareable with digital_input: the EN pin may be tied HIGH (onboard jumper) or driven as a plain digital enable instead of PWM.",
          source: "ProtoPart electrical interfaces (requires[].shareable_with)",
        },
      },
      {
        type: "usage_rule",
        params: {
          rule: "Use ENA and ENB for PWM speed control: you can tie them HIGH for full speed or feed a PWM signal for variable speed. Ensure they are enabled (HIGH) for the motor to run.",
          source: "ProtoPart design_rules",
        },
      },
    ],
    bridgesTo: ["dc_motor_output"],
  };
}

const motorChannelAControl = motorChannelControl({
  id: "motor_channel_a_control",
  motor: "A",
  inHigh: "in1",
  inLow: "in2",
  en: "ena",
  description: "Control for Motor A: IN1/IN2 for direction, ENA for PWM/enable.",
});

const motorChannelBControl = motorChannelControl({
  id: "motor_channel_b_control",
  motor: "B",
  inHigh: "in3",
  inLow: "in4",
  en: "enb",
  description: "Control for Motor B: IN3/IN4 for direction, ENB for PWM/enable.",
});

const dcMotorOutput: InterfaceDef = {
  id: "dc_motor_output",
  name: "DC Motor Output (OUT pair)",
  domain: "electrical",
  exposed: true,
  default_active: true,
  protocols: [{ type: "power", roles: ["output"] }],
  parameters: [
    voltageRangeV(VS_RANGE[0], VS_RANGE[1]),
    maxCurrentA(OUT_MAX_CONTINUOUS_A),
  ],
  slots: [
    { id: "phase_a", required: true, match: { protocol: "power", role: "output", capability: "motor_out" } },
    { id: "phase_b", required: true, match: { protocol: "power", role: "output", capability: "motor_out" } },
  ],
  profiles: [
    {
      id: "output_a",
      label: "Motor A (OUT1 + OUT2)",
      default_active: true,
      bindings: { phase_a: "out1", phase_b: "out2" },
    },
    {
      id: "output_b",
      label: "Motor B (OUT3 + OUT4)",
      default_active: true,
      bindings: { phase_a: "out3", phase_b: "out4" },
    },
  ],
  max_instances: 2, // JSON constraints.max_connections: 2 — one motor per output pair
  traits: [
    {
      type: "source_description",
      params: {
        description:
          "DC motor connection interface (each motor uses a pair: OUT1+OUT2 or OUT3+OUT4, 2 A/channel DC continuous).",
      },
    },
    {
      type: "connection_constraints",
      params: { max_connections: 2, requires_matching_voltage_domain: true },
    },
    {
      type: "data_note",
      params: {
        note: "RESOLVED (datasheet audit 2026-07-09): the ST L298 datasheet rates IO at 2 A DC per channel (repetitive peak 2.5 A, non-repetitive peak 3 A, total DC current up to 4 A). The former ~600 mA/channel figure does not appear in the L298 datasheet (likely confusion with the L293D) and was corrected to 2 A, matching the OUT1-OUT4 resource ratings (2000 mA max continuous per output).",
        source: "ST L298 datasheet, ABSOLUTE MAXIMUM RATINGS (IO Peak Output Current, each channel) and front-page 'TOTAL DC CURRENT UP TO 4 A'",
      },
    },
    {
      type: "usage_rule",
      params: {
        rule: "For each motor, use the designated pair of outputs: connect one motor to OUT1 & OUT2 (Motor A) and the other motor to OUT3 & OUT4 (Motor B). The motor should be the only load between each output pair.",
        source: "ProtoPart design_rules / validation_requirements",
      },
    },
    {
      type: "stepper_mode",
      params: {
        note: "Capable of driving two DC motors or one stepper motor (using both H-bridges together). Using both channels for a stepper increases dissipation; monitor temperature under load.",
        source: "ProtoPart metadata.description / application_examples / warnings",
      },
    },
    OUTPUT_DROP_TRAIT,
  ],
};

// ---------------------------------------------------------------------------
// Mechanical — four M3/#4 corner mounting holes (mechanical domain)
// ---------------------------------------------------------------------------

function mountingHole(n: 1 | 2 | 3 | 4): InterfaceDef {
  return {
    id: `mount${n}`,
    name: `Mounting Hole ${n}`,
    domain: "mechanical",
    exposed: true,
    default_active: true,
    protocols: [{ type: "threaded_connection", roles: ["mounting_point"] }],
    capabilities: ["mounting_hole"],
    parameters: [
      { id: "hole_diameter", unit: "mm", value: 3 },
      { id: "max_force", unit: "N", value: 100 },
    ],
    traits: [
      {
        type: "fastener",
        params: {
          connector_type: "through_hole",
          thread_spec: "M3 / #4",
          description: "Corner mounting hole",
        },
      },
    ],
  };
}

const moduleMounting: InterfaceDef = {
  id: "module_mounting",
  name: "PCB Mounting",
  domain: "mechanical",
  exposed: true,
  default_active: true,
  protocols: [{ type: "threaded_connection", roles: ["mounting_point"] }],
  slots: [
    { id: "hole", required: true, count: 4, match: { capability: "mounting_hole" } },
  ],
  profiles: [
    {
      id: "corner_holes",
      label: "Four M3/#4 corner holes",
      default_active: true,
      bindings: { hole: ["mount1", "mount2", "mount3", "mount4"] },
    },
  ],
  max_instances: 1,
  traits: [
    {
      type: "source_description",
      params: {
        description: "PCB module mounting interface (four M3/#4 screws at corners)",
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

export const L298N_MOTOR_DRIVER: ModuleDef = defineModule({
  id: "l298n-motor-driver",
  name: "L298N Dual H-Bridge Motor Driver Module",
  version: "0.3.0",
  manufacturer: "STMicroelectronics",
  part_number: "L298N",
  description:
    "Dual-channel H-bridge motor driver module based on the L298N IC. Capable of driving two DC motors (or one stepper motor) with up to ~2 A per channel and motor supply voltages from ~5 V up to ~35 V (board-dependent). Includes an onboard 5 V regulator (activated via jumper) that can power the logic circuitry and, within limits, an external controller. Provides directional control and speed (PWM) control for motors, with built-in clamp diodes and a heat sink for handling power dissipation. Widely used in robotics and motor control projects.",
  tags: [
    "motor",
    "driver",
    "H-bridge",
    "L298N",
    "DC motor",
    "stepper motor",
    "dual motor driver",
    "robotics",
  ],
  categories: ["motor_driver", "actuator.motor_controller"],

  interfaces: [
    // Power screw terminals — board designators VS / 5V / GND.
    vsIn,
    vss5v,
    gnd,

    // Control header — IN1-IN4 direction, ENA/ENB enable/PWM.
    in1,
    in2,
    in3,
    in4,
    enA,
    enB,

    // Motor output screw terminals — OUT1-OUT4.
    out1,
    out2,
    out3,
    out4,

    // Composed power interfaces
    motorPowerIn,
    logic5vIn,
    logic5vOut,

    // H-bridge channels
    motorChannelAControl,
    motorChannelBControl,
    dcMotorOutput,

    // Mechanical
    mountingHole(1),
    mountingHole(2),
    mountingHole(3),
    mountingHole(4),
    moduleMounting,
  ],

  interfaceGroups: [
    {
      id: "required_power_terminals",
      label: "Required Power Terminals",
      members: ["vs_in", "gnd"],
      policy: "all_of",
    },
    {
      // The 5V terminal is either the regulator's output or an external logic
      // input, selected by the onboard regulator jumper — never both.
      id: "logic_5v_modes",
      label: "5V Terminal Mode (regulator jumper state)",
      members: ["logic_5v_in", "logic_5v_out"],
      policy: "one_of",
    },
    {
      id: "control_header",
      label: "Control Header (ENA / IN1-IN4 / ENB)",
      members: ["ena", "in1", "in2", "in3", "in4", "enb"],
      policy: "any_of",
    },
    {
      id: "motor_a_output_pair",
      label: "Motor A Output Pair (OUT1 + OUT2)",
      members: ["out1", "out2"],
      policy: "all_of",
    },
    {
      id: "motor_b_output_pair",
      label: "Motor B Output Pair (OUT3 + OUT4)",
      members: ["out3", "out4"],
      policy: "all_of",
    },
  ],

  requirements: [
    {
      type: "power",
      description:
        "Motor supply (Vs) within 5-35 V (board-dependent; nominal 12 V), correctly connected to the Vs input terminal; up to ~2 A per channel (~4 A total). Validate that motor stall currents do not exceed ~2 A per channel.",
      voltage_V: VS_RANGE,
      current_mA: 4000,
    },
    {
      type: "power",
      description:
        "5 V TTL logic supply (~36 mA): either the onboard regulator (jumper fitted, Vs typically ≤12 V) or an external regulated 5 V on the Vss pin (jumper removed / Vs above ~12 V). All grounds (module, power source, microcontroller) must be common.",
      voltage_V: [4.5, 5.5],
      current_mA: 36,
    },
    {
      type: "interface",
      description:
        "A controller providing 0-5 V logic direction signals (IN1-IN4) and, for speed control, a PWM source on ENA/ENB (3.3 V logic typically accepted — input HIGH threshold ~2.3 V).",
      interface_protocol: "digital",
    },
  ],

  domains: [
    {
      domain: "electrical",
      power_domains: [
        {
          id: "vmotor",
          name: "Motor Supply (Vs)",
          nominal_voltage_V: 12,
          voltage_range_V: VS_RANGE,
          max_current_mA: 4000,
        },
        {
          id: "logic5v",
          name: "Logic 5V (Vss)",
          nominal_voltage_V: 5,
          voltage_range_V: LOGIC_RANGE,
          max_current_mA: 36,
        },
      ],
      metadata: {
        supply_voltage_V: VS_RANGE,
        power_consumption_mW: 180,
        // ProtoPart states pin_count 15 while 13 terminals are defined as
        // resources (the count likely includes onboard jumper positions,
        // which the JSON does not model as resources).
        pin_count: 15,
        modeled_terminals: 13,
        logic_input_high_threshold_V: V_IH_APPROX_V,
        isolation: "non_isolated, common ground reference (both power domains)",
        source: "ProtoPart definition.json, electrical domain",
      },
    },
    {
      domain: "mechanical",
      dimensions_mm: { length: 43, width: 43, height: 27 },
      weight_g: 26,
      metadata: {
        package_type: "PCB Module",
        mounting_method: "four M3/#4 screws at corners (3 mm through-holes, 100 N max each)",
      },
    },
    {
      domain: "thermal",
      operating_temperature_C: [-20, 85],
      metadata: {
        thermal_design_power_W: 5,
        requires_thermal_management: true,
        thermal_monitoring_available: false,
        cooling_method: "passive",
        note: "Built-in heat sink. Provide adequate heat sinking/airflow if running motors near 2 A continuously — the L298N dissipates significant heat (Darlington drop ~2 V+).",
      },
    },
  ],

  traits: [
    // Signal flow: the motor supply is switched onto the output pairs by the
    // H-bridges (fixture-convention bridge, consistent with vs_in.bridgesTo).
    { type: "can_bridge", params: { from: ["motor_power_in"], to: ["dc_motor_output"] } },
    {
      type: "provides_power",
      params: {
        interfaceId: "logic_5v_out",
        voltage: { id: "voltage", unit: "V", value: 5 },
        maxCurrent: { id: "max_current", unit: "A", value: 0.1 },
      },
    },
    // metadata.has_enable_jumpers — no structural OpenUHD home; per-pin
    // `enable_jumper` traits on ENA/ENB carry the behaviour.
    { type: "has_enable_jumpers", params: { value: true } },
    {
      type: "design_rules",
      params: {
        source: "ProtoPart definition.json, design_rules (verbatim)",
        rules: [
          "If motor supply voltage exceeds ~12 V, remove the onboard regulator jumper and supply 5 V to the logic input pin externally to avoid overheating the regulator.",
          "Do not draw more than ~100 mA from the module's 5 V output; excessive current can overheat the 78M05 regulator.",
          "Provide adequate heat sinking/airflow if running motors near 2 A continuously. The L298N dissipates significant heat (Darlington drop ~2 V+).",
          "Always connect grounds: the motor power source ground, control logic ground, and module ground must be common.",
          "For each motor, use the designated pair of outputs: connect one motor to OUT1 & OUT2 (Motor A) and the other motor to OUT3 & OUT4 (Motor B).",
          "Use ENA and ENB for PWM speed control: you can tie them HIGH for full speed or feed a PWM signal for variable speed. Ensure they are enabled (HIGH) for the motor to run.",
          "Logic input HIGH threshold is ~2.3 V, so 3.3 V control signals are typically acceptable, but the logic supply should still be 5 V.",
        ],
      },
    },
    {
      type: "validation_requirements",
      params: {
        source: "ProtoPart definition.json, validation_requirements (verbatim)",
        requirements: [
          "Verify motor supply (Vs) is within 5–35 V range and correctly connected to the Vs input terminal.",
          "If the 5 V regulator jumper is used, ensure motor supply does not exceed ~12 V. If motor supply is above 12 V, ensure jumper is removed and a stable 5 V is provided to the logic input pin.",
          "Confirm that all grounds (module, power source, microcontroller) are connected together (common ground).",
          "Validate that motor stall currents do not exceed ~2 A per channel (and consider using fuses or current limiting if motors can draw more).",
          "Check that each control input (IN1–IN4, ENA, ENB) from the microcontroller is properly assigned and within 0–5 V logic levels, and that at least one of ENA/ENB is enabled if you expect the motor to run.",
          "Ensure that no two outputs are shorted directly together or to supply/ground (other than through a motor); the motor should be the only load between each output pair.",
        ],
      },
    },
    {
      type: "usage_notes",
      params: {
        source: "ProtoPart definition.json, usage_notes (verbatim)",
        note: "This L298N motor driver module allows you to control two DC motors (or one stepper motor). Set IN1/IN2 (Motor A) and IN3/IN4 (Motor B) for direction; provide PWM on ENA/ENB for speed. The module includes enable jumpers that tie ENA/ENB HIGH by default: with jumpers installed, each channel is enabled (full-speed if IN pins demand it); remove a jumper to drive that EN pin from a PWM-capable MCU output. If the onboard 5 V regulator jumper is fitted and Vs is modest (typically ≤12 V), the 5 V pin can supply light external loads (~100 mA). For Vs above ~12 V or higher 5 V loads, remove the jumper and supply a regulated 5 V to the Vss pin. Expect ~2 V or more drop across the bipolar outputs under load, so size Vs accordingly.",
      },
    },
    {
      type: "compatibility_notes",
      params: {
        source: "ProtoPart definition.json, compatibility_notes (verbatim)",
        note: "The L298N module works with any microcontroller that can provide 5 V logic signals (TTL). It is directly compatible with Arduino Uno and other 5 V logic boards. It can also be controlled by 3.3 V logic (e.g., Raspberry Pi, ESP32) because 3.3 V is typically recognized as HIGH by the L298N (~2.3 V threshold), but you still need to provide a 5 V supply to the module's logic. Note this driver is less efficient than modern MOSFET drivers (TB6612FNG, DRV8833).",
      },
    },
    {
      type: "application_examples",
      params: {
        source: "ProtoPart definition.json, application_examples (verbatim)",
        examples: [
          "Arduino-based 2WD robot car (driving two DC gear motors for left/right wheels)",
          "Controlling a small bipolar stepper motor (using both H-bridges together)",
          "DIY RC tank or rover (two motor channels for track drive)",
          "Automating a curtain or conveyor using DC motors with forward/reverse control",
          "Educational projects and prototyping where a simple motor driver is needed for DC motors or solenoids",
        ],
      },
    },
    {
      type: "warnings",
      params: {
        source: "ProtoPart definition.json, warnings (verbatim)",
        warnings: [
          "The onboard regulator can overheat if you draw too much current from the 5 V pin or if Vs is high; use it only for light loads or provide an external 5 V.",
          "During operation, the L298N chip and heat sink can become very hot. Avoid touching the heat sink and provide ventilation if possible.",
          "A significant voltage drop (~2 V or more) occurs across the driver at high currents due to bipolar transistor outputs.",
          "Using both channels (e.g., for a stepper) increases dissipation; monitor temperature under load.",
          "Double-check wiring: ensure Vs is not connected to the 5 V logic pin and that grounds are common.",
        ],
      },
    },
  ],

  artifacts: [
    {
      id: "art_datasheet",
      name: "L298N Motor Driver Datasheet (components101 mirror)",
      type: "datasheet",
      url: "https://components101.com/sites/default/files/component_datasheet/L298N-Motor-Driver-Datasheet.pdf",
    },
    {
      // ProtoPart artifact type "image" is not an OpenUHD ArtifactType —
      // mapped to "custom" with an image tag; it is the ProtoPart preview
      // artifact (previewArtifactId: art_thumbnail).
      id: "art_thumbnail",
      name: "Thumbnail",
      type: "custom",
      filePath: "./ProtoPart/protoparts/l298n-motor-driver/thumbnail.png",
      mimeType: "image/png",
      tags: ["image", "thumbnail", "preview"],
    },
  ],
});
