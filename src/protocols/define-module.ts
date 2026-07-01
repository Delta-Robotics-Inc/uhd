import type { ModuleDef } from "../types/module.js";
import { validateProfile } from "../binding/profile.js";

/**
 * Validating constructor for part definitions.
 *
 * Wrap every part file's ModuleDef in this call. TypeScript checks the
 * shape at compile time; this adds the referential checks the type system
 * cannot express:
 *   - interface IDs are unique
 *   - every declared profile passes validateProfile (bindings exist,
 *     required slots are bound, bound pins carry the slot's capability)
 *   - interfaceGroups members reference existing interfaces
 *
 * Throws an Error listing every problem found, so a bad part fails at
 * import time rather than after it reaches the database.
 */
export function defineModule(def: ModuleDef): ModuleDef {
  const problems: string[] = [];
  const interfaceIds = new Set<string>();

  for (const iface of def.interfaces) {
    if (interfaceIds.has(iface.id)) {
      problems.push(`duplicate interface id "${iface.id}"`);
    }
    interfaceIds.add(iface.id);
  }

  for (const iface of def.interfaces) {
    for (const profile of iface.profiles ?? []) {
      const result = validateProfile(def, iface.id, profile);
      for (const error of result.errors) {
        problems.push(`interface "${iface.id}" profile "${profile.id}": ${error}`);
      }
    }
  }

  for (const group of def.interfaceGroups ?? []) {
    for (const member of group.members) {
      if (!interfaceIds.has(member)) {
        problems.push(`interface group "${group.id}" references missing interface "${member}"`);
      }
    }
  }

  if (problems.length > 0) {
    throw new Error(`Invalid module "${def.id}":\n  - ${problems.join("\n  - ")}`);
  }

  return def;
}
