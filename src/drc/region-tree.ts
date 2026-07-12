import type { ModuleDef } from "../types/module.js";
import type { InterfaceDef, InterfaceProfile } from "../types/interface.js";
import type { RegionPath } from "./types.js";

/**
 * A module's interfaces as a region tree (visualizer-spec §2.2). An interface
 * bound into another interface's active profile is a child region of it; every
 * other exposed interface is a root region.
 */
export interface RegionNode {
  iface: InterfaceDef;
  path: RegionPath;
  depth: number;
  parent?: RegionNode;
  children: RegionNode[];
  /** slot the parent's profile binds this region to (undefined at roots) */
  slotId?: string;
}

/** The profile whose bindings define the region tree: first default-active, else first. */
export function pickProfile(iface: InterfaceDef): InterfaceProfile | undefined {
  const profiles = iface.profiles ?? [];
  return profiles.find((p) => p.default_active !== false) ?? profiles[0];
}

function bindingTargets(profile: InterfaceProfile): { slotId: string; interfaceId: string }[] {
  const out: { slotId: string; interfaceId: string }[] = [];
  for (const [slotId, value] of Object.entries(profile.bindings)) {
    for (const interfaceId of Array.isArray(value) ? value : [value]) {
      out.push({ slotId, interfaceId });
    }
  }
  return out;
}

export function buildRegionTree(module: ModuleDef): RegionNode[] {
  const byId = new Map(module.interfaces.map((i) => [i.id, i]));

  const boundIds = new Set<string>();
  for (const iface of module.interfaces) {
    const profile = pickProfile(iface);
    if (!profile) continue;
    for (const { interfaceId } of bindingTargets(profile)) boundIds.add(interfaceId);
  }

  const build = (
    iface: InterfaceDef,
    parent: RegionNode | undefined,
    slotId: string | undefined,
    visited: Set<string>,
  ): RegionNode => {
    const node: RegionNode = {
      iface,
      path: [...(parent?.path ?? []), iface.id],
      depth: parent ? parent.depth + 1 : 0,
      parent,
      children: [],
      slotId,
    };
    const profile = pickProfile(iface);
    if (profile) {
      for (const target of bindingTargets(profile)) {
        if (visited.has(target.interfaceId)) continue; // guard against binding cycles
        const child = byId.get(target.interfaceId);
        if (!child) continue;
        node.children.push(
          build(child, node, target.slotId, new Set([...visited, target.interfaceId])),
        );
      }
    }
    return node;
  };

  return module.interfaces
    .filter((i) => i.exposed && !boundIds.has(i.id))
    .map((i) => build(i, undefined, undefined, new Set([i.id])));
}

export function flattenTree(roots: RegionNode[]): RegionNode[] {
  const out: RegionNode[] = [];
  const walk = (node: RegionNode) => {
    out.push(node);
    node.children.forEach(walk);
  };
  roots.forEach(walk);
  return out;
}

export function descendants(node: RegionNode): RegionNode[] {
  const out: RegionNode[] = [];
  const walk = (n: RegionNode) => {
    for (const child of n.children) {
      out.push(child);
      walk(child);
    }
  };
  walk(node);
  return out;
}

export function ancestors(node: RegionNode): RegionNode[] {
  const out: RegionNode[] = [];
  let current = node.parent;
  while (current) {
    out.push(current);
    current = current.parent;
  }
  return out;
}
