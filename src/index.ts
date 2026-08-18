// Types
export * from "./types/index.js";

// Protocol interface builders (one file per protocol) + defineModule
export * from "./protocols/index.js";

// Matching
export { areRolesCompatible, getCompatibleRoles } from "./matching/roles.js";
export { matchProtocols } from "./matching/protocol-match.js";
export type { ProtocolMatchResult } from "./matching/protocol-match.js";
export { findCompatiblePairs } from "./matching/compatibility.js";
export type { CompatiblePair } from "./matching/compatibility.js";
export { findCompositionalMatch } from "./matching/composition.js";
export type { CompositionalMatchResult, SlotFiller } from "./matching/composition.js";
export { deriveInferredInterface } from "./matching/inferred.js";
export type { InferredInterface } from "./matching/inferred.js";

// Binding
export { validateBinding } from "./binding/capability-check.js";
export { validateProfile, applyProfile } from "./binding/profile.js";
export type { ProfileValidationResult } from "./binding/profile.js";
export { getClaimedInterfaces, isInterfaceAvailable, findClaimConflicts } from "./binding/claims.js";
export { validateInterfaceGroups } from "./binding/groups.js";
export type { GroupValidationResult } from "./binding/groups.js";

// Parameters
export {
  getEffectiveRange,
  rangesOverlap,
  parameterCompatible,
  checkParameterCompatibility,
} from "./parameters/range.js";
export type { ParameterCompatibilityResult } from "./parameters/range.js";
export { evaluateConstraints } from "./parameters/constraints.js";

// Instance
export { instantiateModule } from "./instance/instantiate.js";
export type { InstantiateOptions } from "./instance/instantiate.js";
export { resolveInterfaceState, resolveAllInterfaces } from "./instance/resolve.js";
export type { ResolvedInterfaceState } from "./instance/resolve.js";

// Visualize
export { renderAscii } from "./visualize/ascii.js";
export { renderVisualization } from "./visualize/render.js";
export { generateVisualization } from "./visualize/cli.js";

// DRC
export * from "./drc/index.js";
