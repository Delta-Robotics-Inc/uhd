import type { InterfaceDef } from "../types/interface.js";
import type { Parameter } from "../types/parameter.js";
import { voltageV, voltageRangeV, maxCurrentA } from "./params.js";

/**
 * Power interface builders: supply inputs, regulated outputs, and ground.
 * Compatibility is role-based ("input" pairs with "output", see matching/roles.ts).
 */
export interface PowerConfig {
  id: string;
  name?: string;
  /** Nominal voltage or [min, max] acceptable range. */
  voltageV: number | [number, number];
  /** Nominal value when voltageV is a range. */
  nominalV?: number;
  /** Max continuous current in amps. */
  maxCurrentA?: number;
  exposed?: boolean;
  defaultActive?: boolean;
}

function power(config: PowerConfig, role: "input" | "output"): InterfaceDef {
  const parameters: Parameter[] = [
    Array.isArray(config.voltageV)
      ? voltageRangeV(config.voltageV[0], config.voltageV[1], config.nominalV)
      : voltageV(config.voltageV),
  ];
  if (config.maxCurrentA !== undefined) parameters.push(maxCurrentA(config.maxCurrentA));

  return {
    id: config.id,
    name: config.name,
    domain: "electrical",
    exposed: config.exposed ?? true,
    default_active: config.defaultActive ?? true,
    protocols: [{ type: "power", roles: [role] }],
    parameters,
  };
}

/** A supply rail this part consumes (e.g. VDD input pins). */
export function PowerIn(config: PowerConfig): InterfaceDef {
  return power(config, "input");
}

/** A supply rail this part provides (e.g. a regulator output). */
export function PowerOut(config: PowerConfig): InterfaceDef {
  return power(config, "output");
}

export interface GroundConfig {
  id?: string;
  name?: string;
  /** Max cumulative return current in amps, if the datasheet specifies one. */
  maxCurrentA?: number;
}

/** Common ground return. */
export function Ground(config: GroundConfig = {}): InterfaceDef {
  return {
    id: config.id ?? "gnd",
    name: config.name ?? "Ground",
    domain: "electrical",
    exposed: true,
    default_active: true,
    protocols: [{ type: "power", roles: ["ground"] }],
    capabilities: ["ground"],
    ...(config.maxCurrentA !== undefined
      ? { parameters: [maxCurrentA(config.maxCurrentA)] }
      : {}),
  };
}
