import type { InterfaceDef } from "../types/interface.js";
import type { Parameter } from "../types/parameter.js";
import { clockFreqHz, voltageV } from "./params.js";

/**
 * I2C bus interface builder.
 *
 * Emits a composed interface with `sda`/`scl` slots. Slots bind to pin
 * interfaces on the same module via profiles; a pin qualifies for a slot
 * when it carries the matching capability tag ("i2c_sda" / "i2c_scl",
 * set through the Pin builder).
 */
export type I2CRole = "master" | "slave";

export interface I2CProfile {
  id: string;
  label?: string;
  /** Pin interface ID bound to the SDA slot. */
  sda: string;
  /** Pin interface ID bound to the SCL slot. */
  scl: string;
  defaultActive?: boolean;
}

export interface I2CConfig {
  id: string;
  name?: string;
  /** Roles this controller can take (default ["master"]). */
  roles?: I2CRole[];
  /** Max SCL clock in Hz (default 400 kHz Fast-mode). */
  clockFreqHz?: number | [number, number];
  /** Bus logic voltage. */
  voltageV?: number;
  /** 7-bit device address, for slave-only devices such as sensors. */
  address?: number;
  /** Named default pin routings (e.g. the conventional GPIO pair). */
  profiles?: I2CProfile[];
  /** Max simultaneous instances of this controller. */
  maxInstances?: number;
  exposed?: boolean;
  defaultActive?: boolean;
}

export function I2C(config: I2CConfig): InterfaceDef {
  const parameters: Parameter[] = [clockFreqHz(config.clockFreqHz ?? 400_000)];
  if (config.voltageV !== undefined) parameters.push(voltageV(config.voltageV));
  if (config.address !== undefined) {
    parameters.push({ id: "i2c_address", unit: "dimensionless", value: config.address });
  }

  return {
    id: config.id,
    name: config.name,
    domain: "electrical",
    exposed: config.exposed ?? true,
    default_active: config.defaultActive ?? false,
    protocols: [{ type: "i2c", roles: config.roles ?? ["master"] }],
    parameters,
    slots: [
      { id: "sda", required: true, match: { protocol: "i2c", role: "data", capability: "i2c_sda" } },
      { id: "scl", required: true, match: { protocol: "i2c", role: "clock", capability: "i2c_scl" } },
    ],
    ...(config.profiles
      ? {
          profiles: config.profiles.map((p) => ({
            id: p.id,
            label: p.label,
            bindings: { sda: p.sda, scl: p.scl },
            ...(p.defaultActive !== undefined ? { default_active: p.defaultActive } : {}),
          })),
        }
      : {}),
    ...(config.maxInstances !== undefined ? { max_instances: config.maxInstances } : {}),
  };
}
