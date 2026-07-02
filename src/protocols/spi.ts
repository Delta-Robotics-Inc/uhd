import type { InterfaceDef } from "../types/interface.js";
import type { Parameter } from "../types/parameter.js";
import { clockFreqHz, voltageV } from "./params.js";
import { resolveSignal, DIGITAL_BIDIR, type SignalRef } from "./signal.js";

/**
 * SPI bus interface builder.
 *
 * Signals may be declared inline (pin number, display name, V/mA/Hz) or
 * reference already-declared pin interface ids. Returns generated pins +
 * the bus — spread into the module's interfaces. Use `instance` for parts
 * with multiple SPI controllers (SPI1, SPI2, ...).
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
  /** Interface id. Defaults to "spi<instance>" (e.g. "spi0"). */
  id?: string;
  /** Instance number for multi-controller parts; also suffixes default signal names. */
  instance?: number;
  name?: string;
  /** Roles this controller can take (default ["master"]). */
  roles?: SPIRole[];
  /** Clock frequency in Hz — fixed or [min, max] supported range. */
  clockFreqHz?: number | [number, number];
  voltageV?: number;
  /** MOSI signal: inline spec or existing pin interface id. */
  mosi?: SignalRef;
  /** MISO signal: inline spec or existing pin interface id. */
  miso?: SignalRef;
  /** SCK signal: inline spec or existing pin interface id. */
  sck?: SignalRef;
  /** Chip select: inline spec or existing pin interface id (optional). */
  ss?: SignalRef;
  /** Extra named pin routings beyond the auto-generated default. */
  profiles?: SPIProfile[];
  maxInstances?: number;
  exposed?: boolean;
  defaultActive?: boolean;
}

export function SPI(config: SPIConfig): InterfaceDef[] {
  const instance = config.instance;
  const id = config.id ?? `spi${instance ?? 0}`;
  const sfx = instance !== undefined ? String(instance) : "";

  const generated: InterfaceDef[] = [];
  const profiles = [...(config.profiles ?? [])];

  if (config.mosi !== undefined && config.miso !== undefined && config.sck !== undefined) {
    const mosiId = resolveSignal(
      config.mosi,
      { id: `${id}_mosi`, defaultName: `MOSI${sfx}`, capability: "spi_mosi", protocols: DIGITAL_BIDIR },
      generated,
    );
    const misoId = resolveSignal(
      config.miso,
      { id: `${id}_miso`, defaultName: `MISO${sfx}`, capability: "spi_miso", protocols: DIGITAL_BIDIR },
      generated,
    );
    const sckId = resolveSignal(
      config.sck,
      { id: `${id}_sck`, defaultName: `SCK${sfx}`, capability: "spi_sck", protocols: DIGITAL_BIDIR },
      generated,
    );
    const ssId =
      config.ss !== undefined
        ? resolveSignal(
            config.ss,
            { id: `${id}_ss`, defaultName: `SS${sfx}`, capability: "spi_ss", protocols: DIGITAL_BIDIR },
            generated,
          )
        : undefined;
    profiles.unshift({
      id: `${id}_default`,
      label: config.name ?? id.toUpperCase(),
      mosi: mosiId,
      miso: misoId,
      sck: sckId,
      ...(ssId !== undefined ? { ss: ssId } : {}),
    });
  }

  const parameters: Parameter[] = [];
  if (config.clockFreqHz !== undefined) parameters.push(clockFreqHz(config.clockFreqHz));
  if (config.voltageV !== undefined) parameters.push(voltageV(config.voltageV));

  const bus: InterfaceDef = {
    id,
    name: config.name ?? `SPI${sfx}`,
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
    ...(profiles.length > 0
      ? {
          profiles: profiles.map((p) => ({
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

  return [...generated, bus];
}
