import type { InterfaceDef } from "../types/interface.js";
import { Pin, type PinConfig } from "./pin.js";

/**
 * GPIO builders.
 *
 * `GPIO` is the per-pin form — identical to `Pin` but named for part files
 * that think in terms of "a GPIO" rather than "a physical pin".
 *
 * `GPIOBank` builds many pins that share electrical characteristics in one
 * call (voltage/drive current applied to each), which keeps MCU part files
 * short when 30+ pins differ only by id and capability flags.
 */
export function GPIO(config: PinConfig): InterfaceDef {
  return Pin(config);
}

export interface GPIOBankConfig {
  /** Electrical defaults applied to every pin in the bank. */
  voltageV?: number | [number, number];
  driveCurrentmA?: number;
  /** Per-pin configs; each may override the bank defaults. */
  pins: PinConfig[];
}

export function GPIOBank(config: GPIOBankConfig): InterfaceDef[] {
  return config.pins.map((pin) =>
    Pin({
      voltageV: config.voltageV,
      driveCurrentmA: config.driveCurrentmA,
      ...pin,
    }),
  );
}
