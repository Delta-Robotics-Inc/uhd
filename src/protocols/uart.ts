import type { InterfaceDef, ProtocolDef } from "../types/interface.js";
import type { Parameter } from "../types/parameter.js";
import { baudRate, voltageV } from "./params.js";
import { resolveSignal, type SignalRef } from "./signal.js";

/**
 * UART/serial interface builder.
 *
 * Signals may be declared inline (pin number, display name, V/mA/Hz) or
 * reference already-declared pin interface ids. Returns generated pins +
 * the port — spread into the module's interfaces. Use `instance` for
 * parts with multiple ports (UART0, UART1, ...), which also suffixes
 * default signal names (TX1/RX1).
 */
export type UARTRole = "host" | "device";

const RX_PROTO: ProtocolDef[] = [{ type: "uart", roles: ["receiver"] }];
const TX_PROTO: ProtocolDef[] = [{ type: "uart", roles: ["transmitter"] }];

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
  /** Interface id. Defaults to "uart<instance>" (e.g. "uart0"). */
  id?: string;
  /** Instance number for multi-port parts; also suffixes default signal names. */
  instance?: number;
  name?: string;
  /** Roles this port can take (default ["host", "device"]). */
  roles?: UARTRole[];
  /** Baud rate in Hz — fixed or [min, max] supported range. */
  baudRate?: number | [number, number];
  voltageV?: number;
  /** RX signal: inline spec or existing pin interface id. */
  rx?: SignalRef;
  /** TX signal: inline spec or existing pin interface id. */
  tx?: SignalRef;
  /** RTS flow control: inline spec or existing pin interface id (optional). */
  rts?: SignalRef;
  /** CTS flow control: inline spec or existing pin interface id (optional). */
  cts?: SignalRef;
  /** Extra named pin routings beyond the auto-generated default. */
  profiles?: UARTProfile[];
  maxInstances?: number;
  exposed?: boolean;
  defaultActive?: boolean;
}

export function UART(config: UARTConfig): InterfaceDef[] {
  const instance = config.instance;
  const id = config.id ?? `uart${instance ?? 0}`;
  const sfx = instance !== undefined ? String(instance) : "";

  const generated: InterfaceDef[] = [];
  const profiles = [...(config.profiles ?? [])];
  const hasFlowControl =
    config.rts !== undefined || config.cts !== undefined ||
    profiles.some((p) => p.rts !== undefined || p.cts !== undefined);

  if (config.rx !== undefined && config.tx !== undefined) {
    const rxId = resolveSignal(
      config.rx,
      { id: `${id}_rx`, defaultName: `RX${sfx}`, capability: "uart_rx", protocols: RX_PROTO },
      generated,
    );
    const txId = resolveSignal(
      config.tx,
      { id: `${id}_tx`, defaultName: `TX${sfx}`, capability: "uart_tx", protocols: TX_PROTO },
      generated,
    );
    const rtsId =
      config.rts !== undefined
        ? resolveSignal(
            config.rts,
            { id: `${id}_rts`, defaultName: `RTS${sfx}`, capability: "uart_rts", protocols: TX_PROTO },
            generated,
          )
        : undefined;
    const ctsId =
      config.cts !== undefined
        ? resolveSignal(
            config.cts,
            { id: `${id}_cts`, defaultName: `CTS${sfx}`, capability: "uart_cts", protocols: RX_PROTO },
            generated,
          )
        : undefined;
    profiles.unshift({
      id: `${id}_default`,
      label: config.name ?? id.toUpperCase(),
      rx: rxId,
      tx: txId,
      ...(rtsId !== undefined ? { rts: rtsId } : {}),
      ...(ctsId !== undefined ? { cts: ctsId } : {}),
    });
  }

  const parameters: Parameter[] = [];
  if (config.baudRate !== undefined) parameters.push(baudRate(config.baudRate));
  if (config.voltageV !== undefined) parameters.push(voltageV(config.voltageV));

  const slots = [
    { id: "rx", required: true, match: { protocol: "uart", role: "receiver", capability: "uart_rx" } },
    { id: "tx", required: true, match: { protocol: "uart", role: "transmitter", capability: "uart_tx" } },
  ];
  if (hasFlowControl) {
    slots.push(
      { id: "rts", required: false, match: { protocol: "uart", role: "transmitter", capability: "uart_rts" } },
      { id: "cts", required: false, match: { protocol: "uart", role: "receiver", capability: "uart_cts" } },
    );
  }

  const port: InterfaceDef = {
    id,
    name: config.name ?? `UART${sfx}`,
    domain: "electrical",
    exposed: config.exposed ?? true,
    default_active: config.defaultActive ?? false,
    protocols: [{ type: "uart", roles: config.roles ?? ["host", "device"] }],
    ...(parameters.length > 0 ? { parameters } : {}),
    slots,
    ...(profiles.length > 0
      ? {
          profiles: profiles.map((p) => ({
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

  return [...generated, port];
}
