/**
 * Protocol role pair compatibility table.
 *
 * Generic pairs apply to any protocol type unless overridden
 * by protocol-specific entries.
 */

const GENERIC_ROLE_PAIRS: Record<string, string[]> = {
  input: ["output"],
  output: ["input"],
  bidirectional: ["input", "output", "bidirectional"],
  master: ["slave"],
  slave: ["master"],
  host: ["device", "peripheral"],
  device: ["host", "controller"],
  peripheral: ["host", "controller"],
  controller: ["device", "peripheral"],
  source: ["sink"],
  sink: ["source"],
  transmitter: ["receiver"],
  receiver: ["transmitter"],
  transceiver: ["transmitter", "receiver", "transceiver"],
  peer: ["peer"],
  primary: ["secondary"],
  secondary: ["primary"],
  target: ["controller", "source", "master", "host"],
};

/**
 * Protocol-specific role pair overrides.
 * Only needed when the generic pairs are wrong or insufficient.
 */
const PROTOCOL_ROLE_PAIRS: Record<string, Record<string, string[]>> = {
  i2c: {
    master: ["slave"],
    slave: ["master"],
    // Sub-roles for slot matching within composed interfaces
    data: ["data"],
    clock: ["clock"],
  },
  spi: {
    master: ["slave"],
    slave: ["master"],
    data_out: ["data_in"],
    data_in: ["data_out"],
    clock: ["clock"],
    select: ["select"],
  },
  uart: {
    host: ["device"],
    device: ["host"],
    transmitter: ["receiver"],
    receiver: ["transmitter"],
    transceiver: ["transmitter", "receiver", "transceiver"],
  },
  power: {
    input: ["output"],
    output: ["input"],
    ground: ["ground"],
  },
  motor_control: {
    controller: ["target"],
    target: ["controller"],
    source: ["target"],
  },
};

/**
 * Check whether two roles are compatible for a given protocol type.
 * Uses protocol-specific pairs first, falls back to generic pairs.
 */
export function areRolesCompatible(
  protocolType: string,
  roleA: string,
  roleB: string,
): boolean {
  const normalA = roleA.toLowerCase();
  const normalB = roleB.toLowerCase();

  if (normalA === normalB && normalA === "peer") return true;
  if (normalA === normalB && normalA === "bidirectional") return true;

  // Check protocol-specific pairs
  const protocolPairs = PROTOCOL_ROLE_PAIRS[protocolType.toLowerCase()];
  if (protocolPairs) {
    const compatA = protocolPairs[normalA];
    if (compatA?.includes(normalB)) return true;

    const compatB = protocolPairs[normalB];
    if (compatB?.includes(normalA)) return true;
  }

  // Fall back to generic pairs
  const genericA = GENERIC_ROLE_PAIRS[normalA];
  if (genericA?.includes(normalB)) return true;

  const genericB = GENERIC_ROLE_PAIRS[normalB];
  if (genericB?.includes(normalA)) return true;

  return false;
}

/**
 * Return all roles compatible with the given role under a protocol type.
 */
export function getCompatibleRoles(
  protocolType: string,
  role: string,
): string[] {
  const normal = role.toLowerCase();
  const result = new Set<string>();

  const protocolPairs = PROTOCOL_ROLE_PAIRS[protocolType.toLowerCase()];
  if (protocolPairs?.[normal]) {
    for (const r of protocolPairs[normal]) result.add(r);
  }

  if (GENERIC_ROLE_PAIRS[normal]) {
    for (const r of GENERIC_ROLE_PAIRS[normal]) result.add(r);
  }

  return [...result];
}
