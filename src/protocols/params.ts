import type { Parameter } from "../types/parameter.js";

/**
 * Canonical parameter builders.
 *
 * Every protocol builder emits parameters through these helpers so that
 * parameter IDs and units stay identical across all part definitions
 * ("voltage" is always volts, "clock_freq" is always Hz, etc.).
 * The matching/constraint engines key off these IDs.
 */

/** Fixed operating voltage, optionally with an allowed range. */
export function voltageV(value: number, range?: [number, number]): Parameter {
  return range
    ? { id: "voltage", unit: "V", value, range }
    : { id: "voltage", unit: "V", value };
}

/** Voltage specified only as a min/max range (no single nominal value). */
export function voltageRangeV(min: number, max: number, nominal?: number): Parameter {
  return nominal !== undefined
    ? { id: "voltage", unit: "V", value: nominal, range: [min, max] }
    : { id: "voltage", unit: "V", range: [min, max] };
}

/** Maximum continuous supply current in amps (power interfaces). */
export function maxCurrentA(value: number): Parameter {
  return { id: "max_current", unit: "A", value };
}

/** Per-pin drive/sink current in milliamps (signal pins). */
export function driveCurrentmA(value: number): Parameter {
  return { id: "drive_current", unit: "mA", value };
}

/** Bus clock frequency in Hz — a fixed value or a supported range. */
export function clockFreqHz(value: number | [number, number]): Parameter {
  return Array.isArray(value)
    ? { id: "clock_freq", unit: "Hz", range: value }
    : { id: "clock_freq", unit: "Hz", value };
}

/** UART baud rate — a fixed value or a supported range. */
export function baudRate(value: number | [number, number]): Parameter {
  return Array.isArray(value)
    ? { id: "baud_rate", unit: "Hz", range: value }
    : { id: "baud_rate", unit: "Hz", value };
}

/** Maximum signal frequency a pin supports, in Hz — fixed or [min, max]. */
export function maxFrequencyHz(value: number | [number, number]): Parameter {
  return Array.isArray(value)
    ? { id: "max_frequency", unit: "Hz", range: value }
    : { id: "max_frequency", unit: "Hz", value };
}

/** Converter resolution in bits (ADC/DAC/PWM). */
export function resolutionBits(value: number): Parameter {
  return { id: "resolution", unit: "dimensionless", value };
}
