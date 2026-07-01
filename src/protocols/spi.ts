import type { InterfaceDef } from "../types/interface.js";
import type { Parameter } from "../types/parameter.js";
import { clockFreqHz, voltageV } from "./params.js";

/**
 * SPI bus interface builder.
 *
 * Emits a composed interface with `mosi`/`miso`/`sck` slots and an optional
 * `ss` (chip-select) slot. Pins qualify via the "spi_mosi" / "spi_miso" /
 * "spi_sck" / "spi_ss" capability tags set through the Pin builder.
 */
export type SPIRole = "master" | "slave";

export interface SPIProfile {
  id: string;
  label?: string;
  mosi: string;
  miso: string;
  sck: string;
  /** One or more chip-select pin interface IDs. */
  ss?: string | string[];
  defaultActive?: boolean;
}

export interface SPIConfig {
  id: string;
  name?: string;
  /** Roles this controller can take (default ["master"]). */
  roles?: SPIRole[];
  /** Clock frequency in Hz — fixed or [min, max] supported range. */
  clockFreqHz?: number | [number, number];
  voltageV?: number;
  profiles?: SPIProfile[];
  maxInstances?: number;
  exposed?: boolean;
  defaultActive?: boolean;
}

export function SPI(config: SPIConfig): InterfaceDef {
  const parameters: Parameter[] = [];
  if (config.clockFreqHz !== undefined) parameters.push(clockFreqHz(config.clockFreqHz));
  if (config.voltageV !== undefined) parameters.push(voltageV(config.voltageV));

  return {
    id: config.id,
    name: config.name,
    domain: "electrical",
    exposed: config.exposed ?? true,
    default_active: config.defaultActive ?? false,
    protocols: [{ type: "spi", roles: config.roles ?? ["master"] }],
    ...(parameters.length > 0 ? { parameters } : {}),
    slots: [
      { id: "mosi", required: true, match: { protocol: "spi", role: "data_out", capability: "spi_mosi" } },
      { id: "miso", required: true, match: { protocol: "spi", role: "data_in", capability: "spi_miso" } },
      { id: "sck", required: true, match: { protocol: "spi", role: "clock", capability: "spi_sck" } },
      { id: "ss", required: false, match: { protocol: "spi", role: "select", capability: "spi_ss" } },
    ],
    ...(config.profiles
      ? {
          profiles: config.profiles.map((p) => ({
            id: p.id,
            label: p.label,
            bindings: {
              mosi: p.mosi,
              miso: p.miso,
              sck: p.sck,
              ...(p.ss !== undefined ? { ss: p.ss } : {}),
            },
            ...(p.defaultActive !== undefined ? { default_active: p.defaultActive } : {}),
          })),
        }
      : {}),
    ...(config.maxInstances !== undefined ? { max_instances: config.maxInstances } : {}),
  };
}
