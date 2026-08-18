import type { InterfaceDef, ProtocolDef } from "../types/interface.js";
import type { Parameter } from "../types/parameter.js";
import { voltageV, voltageRangeV, driveCurrentmA, maxFrequencyHz } from "./params.js";

/**
 * Inline signal declaration for bus builders.
 *
 * Lets a part file describe a bus signal (SDA, SCL, MOSI, TX, an ADC
 * channel, ...) directly inside the protocol call: physical pin number,
 * display name, and electrical parameters. The builder turns each spec
 * into a leaf pin InterfaceDef carrying the signal's canonical capability
 * tag and auto-binds it into the bus's default profile.
 */
export interface SignalSpec {
  /** Physical package pin/pad designator (e.g. 42 or "A7"). */
  pin: number | string;
  /** Display name, e.g. "SDA1" or "GPIO21 / SDA". Defaults to the signal role + instance. */
  name?: string;
  /** Interface id override. Defaults to `<busId>_<signal>`. */
  id?: string;
  /** Logic-level voltage: nominal or [min, max]. */
  voltageV?: number | [number, number];
  /** Max continuous source/sink current in mA. */
  maxCurrentmA?: number;
  /** Max signal frequency in Hz — fixed or [min, max]. */
  maxFrequencyHz?: number | [number, number];
}

/** A bus signal is either a reference to an existing pin interface id, or an inline spec. */
export type SignalRef = string | SignalSpec;

export interface SignalPinOptions {
  /** Generated interface id (used when spec.id is absent). */
  id: string;
  /** Display name fallback (used when spec.name is absent), e.g. "SDA1". */
  defaultName: string;
  /** Canonical capability tag for slot matching, e.g. "i2c_sda". */
  capability: string;
  /** Protocols the generated pin speaks, e.g. digital bidirectional. */
  protocols: ProtocolDef[];
  spec: SignalSpec;
}

/** Build a leaf pin InterfaceDef from an inline signal spec. */
export function signalPin(opts: SignalPinOptions): InterfaceDef {
  const { spec } = opts;
  const parameters: Parameter[] = [];
  if (spec.voltageV !== undefined) {
    parameters.push(
      Array.isArray(spec.voltageV)
        ? voltageRangeV(spec.voltageV[0], spec.voltageV[1])
        : voltageV(spec.voltageV),
    );
  }
  if (spec.maxCurrentmA !== undefined) parameters.push(driveCurrentmA(spec.maxCurrentmA));
  if (spec.maxFrequencyHz !== undefined) parameters.push(maxFrequencyHz(spec.maxFrequencyHz));

  return {
    id: spec.id ?? opts.id,
    name: spec.name ?? opts.defaultName,
    pin: spec.pin,
    domain: "electrical",
    exposed: true,
    default_active: true,
    protocols: opts.protocols,
    capabilities: [opts.capability],
    ...(parameters.length > 0 ? { parameters } : {}),
  };
}

/**
 * Resolve one signal of a bus: returns the pin interface id to bind, and
 * appends a generated pin InterfaceDef when the signal was declared inline.
 */
export function resolveSignal(
  ref: SignalRef,
  opts: Omit<SignalPinOptions, "spec">,
  generated: InterfaceDef[],
): string {
  if (typeof ref === "string") return ref;
  const pin = signalPin({ ...opts, spec: ref });
  generated.push(pin);
  return pin.id;
}

/** Bidirectional digital pin protocol — the default for generated bus signal pins. */
export const DIGITAL_BIDIR: ProtocolDef[] = [
  { type: "digital", roles: ["input", "output", "bidirectional"] },
];
