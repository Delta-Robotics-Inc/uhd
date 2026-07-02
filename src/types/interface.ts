import type { DomainKind } from "./domain.js";
import type { Parameter } from "./parameter.js";
import type { TraitDef } from "./trait.js";

export interface ProtocolDef {
  type: string;        // "digital", "pwm", "i2c", "spi", "uart", "power", "motor_control"
  roles: string[];     // ["input", "output", "bidirectional", "master", "slave"]
  version?: string;
}

export interface SlotMatch {
  /** For inter-module compositional matching: protocol type to match */
  protocol?: string;
  /** For inter-module compositional matching: role within that protocol */
  role?: string;
  /** For intra-module slot binding: capability tag to match against leaf interface capabilities */
  capability?: string;
}

export interface SlotDef {
  id: string;
  label?: string;
  required: boolean;
  count?: number; // default 1
  match: SlotMatch;
}

export interface InterfaceProfile {
  id: string;
  label?: string;
  /** Maps slot IDs to interface IDs on the same module */
  bindings: Record<string, string | string[]>;
  /** Per-profile activation. If omitted, inherits from parent InterfaceDef.default_active */
  default_active?: boolean;
}

export interface InterfaceDef {
  id: string;
  name?: string;
  domain: DomainKind;
  exposed: boolean;

  /** Physical package pin/pad designator (e.g. 42 or "A7"), for leaf pin interfaces */
  pin?: number | string;

  /** What this interface speaks — used for ALL inter-module matching */
  protocols: ProtocolDef[];

  /** Hardware capabilities — used for intra-module slot binding validation only */
  capabilities?: string[];

  /** Composition: slots this interface is built from */
  slots?: SlotDef[];

  /** Named slot-binding configurations. Each active profile is an instance. */
  profiles?: InterfaceProfile[];

  /** Typed parameters with units */
  parameters?: Parameter[];

  /** Is this interface active by default? */
  default_active?: boolean;

  /** Max simultaneous instances (profiles) of this interface */
  max_instances?: number;

  /** Structured behaviors */
  traits?: TraitDef[];

  /** Signal flow: IDs of other interfaces on the same module this bridges to */
  bridgesTo?: string[];
}
