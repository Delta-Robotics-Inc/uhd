/**
 * Standardized protocol interface builders.
 *
 * One file per protocol. Part definition files import these builders and
 * supply part-specific parameters (pins, voltages, currents, frequencies);
 * the builders emit InterfaceDef objects with the canonical protocol types,
 * roles, capability tags, and parameter IDs that the matching engine
 * (matching/roles.ts) and slot binding (binding/) understand.
 */
export * from "./params.js";
export * from "./signal.js";
export * from "./pin.js";
export * from "./gpio.js";
export * from "./power.js";
export * from "./i2c.js";
export * from "./spi.js";
export * from "./uart.js";
export * from "./pwm.js";
export * from "./analog.js";
export * from "./define-module.js";
