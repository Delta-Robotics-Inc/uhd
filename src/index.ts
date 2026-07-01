// Types
export * from "./types/index.js";

// Protocol interface builders (one file per protocol) + defineModule
export * from "./protocols/index.js";

// Matching
export { areRolesCompatible, getCompatibleRoles } from "./matching/roles.js";
export { matchProtocols } from "./matching/protocol-match.js";
export type { ProtocolMatchResult } from "./matching/protocol-match.js";
