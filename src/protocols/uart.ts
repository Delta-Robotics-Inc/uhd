import type { InterfaceDef } from "../types/interface.js";
import type { Parameter } from "../types/parameter.js";
import { baudRate, voltageV } from "./params.js";

/**
 * UART/serial interface builder.
 *
 * Emits a composed interface with `rx`/`tx` slots and optional `rts`/`cts`
 * flow-control slots. Pins qualify via the "uart_rx" / "uart_tx" /
 * "uart_rts" / "uart_cts" capability tags set through the Pin builder.
 */
export type UARTRole = "host" | "device";

export interface UARTProfile {
  id: string;
  label?: string;
  rx: string;
  tx: string;
  rts?: string;
  cts?: string;
  defaultActive?: boolean;
}

export interface UARTConfig {
  id: string;
  name?: string;
  /** Roles this port can take (default ["host", "device"]). */
  roles?: UARTRole[];
  /** Baud rate in Hz — fixed or [min, max] supported range. */
  baudRate?: number | [number, number];
  voltageV?: number;
  /** Include rts/cts flow-control slots (default false). */
  flowControl?: boolean;
  profiles?: UARTProfile[];
  maxInstances?: number;
  exposed?: boolean;
  defaultActive?: boolean;
}

export function UART(config: UARTConfig): InterfaceDef {
  const parameters: Parameter[] = [];
  if (config.baudRate !== undefined) parameters.push(baudRate(config.baudRate));
  if (config.voltageV !== undefined) parameters.push(voltageV(config.voltageV));

  const slots = [
    { id: "rx", required: true, match: { protocol: "uart", role: "receiver", capability: "uart_rx" } },
    { id: "tx", required: true, match: { protocol: "uart", role: "transmitter", capability: "uart_tx" } },
  ];
  if (config.flowControl) {
    slots.push(
      { id: "rts", required: false, match: { protocol: "uart", role: "transmitter", capability: "uart_rts" } },
      { id: "cts", required: false, match: { protocol: "uart", role: "receiver", capability: "uart_cts" } },
    );
  }

  return {
    id: config.id,
    name: config.name,
    domain: "electrical",
    exposed: config.exposed ?? true,
    default_active: config.defaultActive ?? false,
    protocols: [{ type: "uart", roles: config.roles ?? ["host", "device"] }],
    ...(parameters.length > 0 ? { parameters } : {}),
    slots,
    ...(config.profiles
      ? {
          profiles: config.profiles.map((p) => ({
            id: p.id,
            label: p.label,
            bindings: {
              rx: p.rx,
              tx: p.tx,
              ...(p.rts !== undefined ? { rts: p.rts } : {}),
              ...(p.cts !== undefined ? { cts: p.cts } : {}),
            },
            ...(p.defaultActive !== undefined ? { default_active: p.defaultActive } : {}),
          })),
        }
      : {}),
    ...(config.maxInstances !== undefined ? { max_instances: config.maxInstances } : {}),
  };
}
