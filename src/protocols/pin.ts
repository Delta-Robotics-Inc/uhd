import type { InterfaceDef, ProtocolDef } from "../types/interface.js";
import type { Parameter } from "../types/parameter.js";
import { voltageV, voltageRangeV, driveCurrentmA } from "./params.js";

/**
 * Physical pin builder.
 *
 * A pin is a leaf electrical interface. Composed bus interfaces (I2C, SPI,
 * UART, ...) never own pins directly — they declare slots that bind to pin
 * IDs, and the capability tags set here are what slot matching checks.
 *
 * Capability tag names are canonical and must match SlotDef.match.capability
 * values used by the bus builders in this folder.
 */
export interface PinCapabilities {
  /** General-purpose digital I/O (default true). */
  digital?: boolean;
  /** Pin is input-only (e.g. ESP32 GPIO34-39): drops output/bidirectional roles. */
  inputOnly?: boolean;
  pwm?: boolean;
  interrupt?: boolean;
  analogIn?: boolean;
  analogOut?: boolean;
  touch?: boolean;
  i2cSda?: boolean;
  i2cScl?: boolean;
  spiMosi?: boolean;
  spiMiso?: boolean;
  spiSck?: boolean;
  spiSs?: boolean;
  uartRx?: boolean;
  uartTx?: boolean;
  uartRts?: boolean;
  uartCts?: boolean;
}

export interface PinConfig {
  id: string;
  /** Human label, e.g. "GPIO21 (QFN pin 42)". */
  name?: string;
  /** Logic-level voltage: a nominal value or [min, max] range. */
  voltageV?: number | [number, number];
  /** Max continuous source/sink current in mA. */
  driveCurrentmA?: number;
  capabilities?: PinCapabilities;
  exposed?: boolean;
  defaultActive?: boolean;
}

export function Pin(config: PinConfig): InterfaceDef {
  const caps = config.capabilities ?? {};
  const protocols: ProtocolDef[] = [];
  const capabilities: string[] = [];

  const digital = caps.digital ?? true;
  if (digital) {
    protocols.push({
      type: "digital",
      roles: caps.inputOnly ? ["input"] : ["input", "output", "bidirectional"],
    });
    capabilities.push("digital_io");
  }
  if (caps.pwm) {
    protocols.push({ type: "pwm", roles: ["output"] });
    capabilities.push("pwm_out");
  }
  if (caps.interrupt) {
    protocols.push({ type: "interrupt", roles: ["input"] });
    capabilities.push("interrupt");
  }
  if (caps.analogIn) {
    protocols.push({ type: "analog", roles: ["input"] });
    capabilities.push("analog_in");
  }
  if (caps.analogOut) {
    protocols.push({ type: "analog", roles: ["output"] });
    capabilities.push("analog_out");
  }
  if (caps.touch) capabilities.push("touch");
  if (caps.i2cSda) capabilities.push("i2c_sda");
  if (caps.i2cScl) capabilities.push("i2c_scl");
  if (caps.spiMosi) capabilities.push("spi_mosi");
  if (caps.spiMiso) capabilities.push("spi_miso");
  if (caps.spiSck) capabilities.push("spi_sck");
  if (caps.spiSs) capabilities.push("spi_ss");
  if (caps.uartRx) capabilities.push("uart_rx");
  if (caps.uartTx) capabilities.push("uart_tx");
  if (caps.uartRts) capabilities.push("uart_rts");
  if (caps.uartCts) capabilities.push("uart_cts");

  const parameters: Parameter[] = [];
  if (config.voltageV !== undefined) {
    parameters.push(
      Array.isArray(config.voltageV)
        ? voltageRangeV(config.voltageV[0], config.voltageV[1])
        : voltageV(config.voltageV),
    );
  }
  if (config.driveCurrentmA !== undefined) {
    parameters.push(driveCurrentmA(config.driveCurrentmA));
  }

  return {
    id: config.id,
    name: config.name,
    domain: "electrical",
    exposed: config.exposed ?? true,
    default_active: config.defaultActive ?? true,
    protocols,
    capabilities,
    ...(parameters.length > 0 ? { parameters } : {}),
  };
}
