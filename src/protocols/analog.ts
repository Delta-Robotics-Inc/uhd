import type { InterfaceDef } from "../types/interface.js";
import type { Parameter } from "../types/parameter.js";
import { voltageV, voltageRangeV, resolutionBits } from "./params.js";

/**
 * Analog converter interface builders (ADC inputs, DAC outputs).
 *
 * These describe a converter peripheral as a composed interface with a
 * channel slot; the measurable pins themselves are declared with the Pin
 * builder using the "analog_in" / "analog_out" capability.
 */
export interface AnalogConfig {
  id: string;
  name?: string;
  /** Converter resolution in bits. */
  resolutionBits?: number;
  /** Measurable input range (ADC) or output range (DAC). */
  rangeV?: [number, number];
  voltageV?: number;
  /** Pin interface IDs that can serve as channels for this converter. */
  channels?: string[];
  exposed?: boolean;
  defaultActive?: boolean;
}

function analog(config: AnalogConfig, role: "input" | "output", capability: string): InterfaceDef {
  const parameters: Parameter[] = [];
  if (config.resolutionBits !== undefined) parameters.push(resolutionBits(config.resolutionBits));
  if (config.rangeV) parameters.push(voltageRangeV(config.rangeV[0], config.rangeV[1]));
  else if (config.voltageV !== undefined) parameters.push(voltageV(config.voltageV));

  return {
    id: config.id,
    name: config.name,
    domain: "electrical",
    exposed: config.exposed ?? true,
    default_active: config.defaultActive ?? false,
    protocols: [{ type: "analog", roles: [role] }],
    ...(parameters.length > 0 ? { parameters } : {}),
    ...(config.channels
      ? {
          slots: [
            {
              id: "channel",
              required: true,
              count: config.channels.length,
              match: { protocol: "analog", role, capability },
            },
          ],
          profiles: [
            {
              id: `${config.id}_channels`,
              bindings: { channel: config.channels },
            },
          ],
        }
      : {}),
  };
}

/** An ADC peripheral: analog input converter with optional channel pins. */
export function ADC(config: AnalogConfig): InterfaceDef {
  return analog(config, "input", "analog_in");
}

/** A DAC peripheral: analog output converter with optional channel pins. */
export function DAC(config: AnalogConfig): InterfaceDef {
  return analog(config, "output", "analog_out");
}
