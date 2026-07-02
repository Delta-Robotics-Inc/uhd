import type { InterfaceDef, ProtocolDef } from "../types/interface.js";
import type { Parameter } from "../types/parameter.js";
import { clockFreqHz, resolutionBits, voltageV } from "./params.js";
import { signalPin, type SignalSpec } from "./signal.js";

/**
 * PWM output interface builder.
 *
 * For dedicated PWM peripherals (LEDC/MCPWM units, servo/LED driver
 * channels). Channels may be declared inline (pin number, display name,
 * V/mA/Hz, channel number) or reference already-declared pin interface
 * ids. Returns generated channel pins + the unit — spread into the
 * module's interfaces. Use `instance` for parts with multiple PWM units.
 * Plain MCU pins that merely support PWM should instead set `pwm: true`
 * on the Pin builder.
 */
export type PWMChannel = string | (SignalSpec & { channel?: number });

const PWM_PROTO: ProtocolDef[] = [{ type: "pwm", roles: ["output"] }];

export interface PWMConfig {
  /** Interface id. Defaults to "pwm<instance>" (e.g. "pwm0"). */
  id?: string;
  /** Instance number for multi-unit parts; also prefixes default channel names. */
  instance?: number;
  name?: string;
  /** Output frequency in Hz — fixed or [min, max] supported range. */
  freqHz?: number | [number, number];
  /** Duty-cycle resolution in bits. */
  resolutionBits?: number;
  voltageV?: number;
  /** Channels: inline specs (pin number, name, params) or existing pin interface ids. */
  channels?: PWMChannel[];
  maxInstances?: number;
  exposed?: boolean;
  defaultActive?: boolean;
}

export function PWM(config: PWMConfig): InterfaceDef[] {
  const instance = config.instance;
  const id = config.id ?? `pwm${instance ?? 0}`;
  const label = `PWM${instance !== undefined ? instance : ""}`;

  const generated: InterfaceDef[] = [];
  const channelIds: string[] = [];

  (config.channels ?? []).forEach((channel, index) => {
    if (typeof channel === "string") {
      channelIds.push(channel);
      return;
    }
    const n = channel.channel ?? index;
    const pin = signalPin({
      id: `${id}_ch${n}`,
      defaultName: `${label}_CH${n}`,
      capability: "pwm_out",
      protocols: PWM_PROTO,
      spec: channel,
    });
    generated.push(pin);
    channelIds.push(pin.id);
  });

  const parameters: Parameter[] = [];
  if (config.freqHz !== undefined) parameters.push(clockFreqHz(config.freqHz));
  if (config.resolutionBits !== undefined) parameters.push(resolutionBits(config.resolutionBits));
  if (config.voltageV !== undefined) parameters.push(voltageV(config.voltageV));

  const unit: InterfaceDef = {
    id,
    name: config.name ?? label,
    domain: "electrical",
    exposed: config.exposed ?? true,
    default_active: config.defaultActive ?? false,
    protocols: [{ type: "pwm", roles: ["output"] }],
    ...(parameters.length > 0 ? { parameters } : {}),
    ...(channelIds.length > 0
      ? {
          slots: [
            {
              id: "channel",
              required: true,
              count: channelIds.length,
              match: { protocol: "pwm", role: "output", capability: "pwm_out" },
            },
          ],
          profiles: [{ id: `${id}_channels`, bindings: { channel: channelIds } }],
        }
      : {}),
    ...(config.maxInstances !== undefined ? { max_instances: config.maxInstances } : {}),
  };

  return [...generated, unit];
}
