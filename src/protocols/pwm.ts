import type { InterfaceDef } from "../types/interface.js";
import type { Parameter } from "../types/parameter.js";
import { clockFreqHz, resolutionBits, voltageV } from "./params.js";

/**
 * PWM output interface builder.
 *
 * For dedicated PWM peripherals (LEDC/MCPWM units, servo/LED driver
 * channels). Plain MCU pins that merely support PWM should instead set
 * `pwm: true` on the Pin builder, which adds the pwm protocol to the pin.
 */
export interface PWMConfig {
  id: string;
  name?: string;
  /** Output frequency in Hz — fixed or [min, max] supported range. */
  freqHz?: number | [number, number];
  /** Duty-cycle resolution in bits. */
  resolutionBits?: number;
  voltageV?: number;
  /** Pin interface IDs this PWM unit can drive. */
  channels?: string[];
  maxInstances?: number;
  exposed?: boolean;
  defaultActive?: boolean;
}

export function PWM(config: PWMConfig): InterfaceDef {
  const parameters: Parameter[] = [];
  if (config.freqHz !== undefined) parameters.push(clockFreqHz(config.freqHz));
  if (config.resolutionBits !== undefined) parameters.push(resolutionBits(config.resolutionBits));
  if (config.voltageV !== undefined) parameters.push(voltageV(config.voltageV));

  return {
    id: config.id,
    name: config.name,
    domain: "electrical",
    exposed: config.exposed ?? true,
    default_active: config.defaultActive ?? false,
    protocols: [{ type: "pwm", roles: ["output"] }],
    ...(parameters.length > 0 ? { parameters } : {}),
    ...(config.channels
      ? {
          slots: [
            {
              id: "channel",
              required: true,
              count: config.channels.length,
              match: { protocol: "pwm", role: "output", capability: "pwm_out" },
            },
          ],
          profiles: [{ id: `${config.id}_channels`, bindings: { channel: config.channels } }],
        }
      : {}),
    ...(config.maxInstances !== undefined ? { max_instances: config.maxInstances } : {}),
  };
}
