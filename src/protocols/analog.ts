import type { InterfaceDef, ProtocolDef } from "../types/interface.js";
import type { Parameter } from "../types/parameter.js";
import { voltageV, voltageRangeV, resolutionBits } from "./params.js";
import { signalPin, type SignalSpec } from "./signal.js";

/**
 * Analog converter interface builders (ADC inputs, DAC outputs).
 *
 * Channels may be declared inline (pin number, display name, V/mA/Hz,
 * channel number) or reference already-declared pin interface ids.
 * Returns generated channel pins + the converter — spread into the
 * module's interfaces. Use `instance` for parts with multiple converters
 * (ADC1, ADC2, ...), which also prefixes default channel names
 * (ADC1_CH0, ADC2_CH3, ...).
 */
export type AnalogChannel = string | (SignalSpec & { channel?: number });

export interface AnalogConfig {
  /** Interface id. Defaults to "<adc|dac><instance>" (e.g. "adc1"). */
  id?: string;
  /** Instance number for multi-converter parts; also prefixes default channel names. */
  instance?: number;
  name?: string;
  /** Converter resolution in bits. */
  resolutionBits?: number;
  /** Measurable input range (ADC) or output range (DAC). */
  rangeV?: [number, number];
  voltageV?: number;
  /** Channels: inline specs (pin number, name, params) or existing pin interface ids. */
  channels?: AnalogChannel[];
  exposed?: boolean;
  defaultActive?: boolean;
}

function analog(
  config: AnalogConfig,
  kind: "adc" | "dac",
  role: "input" | "output",
  capability: string,
): InterfaceDef[] {
  const instance = config.instance;
  const id = config.id ?? `${kind}${instance ?? 0}`;
  const label = `${kind.toUpperCase()}${instance !== undefined ? instance : ""}`;
  const channelProto: ProtocolDef[] = [{ type: "analog", roles: [role] }];

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
      capability,
      protocols: channelProto,
      spec: channel,
    });
    generated.push(pin);
    channelIds.push(pin.id);
  });

  const parameters: Parameter[] = [];
  if (config.resolutionBits !== undefined) parameters.push(resolutionBits(config.resolutionBits));
  if (config.rangeV) parameters.push(voltageRangeV(config.rangeV[0], config.rangeV[1]));
  else if (config.voltageV !== undefined) parameters.push(voltageV(config.voltageV));

  const converter: InterfaceDef = {
    id,
    name: config.name ?? label,
    domain: "electrical",
    exposed: config.exposed ?? true,
    default_active: config.defaultActive ?? false,
    protocols: [{ type: "analog", roles: [role] }],
    ...(parameters.length > 0 ? { parameters } : {}),
    ...(channelIds.length > 0
      ? {
          slots: [
            {
              id: "channel",
              required: true,
              count: channelIds.length,
              match: { protocol: "analog", role, capability },
            },
          ],
          profiles: [{ id: `${id}_channels`, bindings: { channel: channelIds } }],
        }
      : {}),
  };

  return [...generated, converter];
}

/** An ADC peripheral: analog input converter with optional channel pins. */
export function ADC(config: AnalogConfig): InterfaceDef[] {
  return analog(config, "adc", "input", "analog_in");
}

/** A DAC peripheral: analog output converter with optional channel pins. */
export function DAC(config: AnalogConfig): InterfaceDef[] {
  return analog(config, "dac", "output", "analog_out");
}
