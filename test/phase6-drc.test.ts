import { describe, it, expect } from "vitest";
import { validatePair } from "../src/drc/index.js";
import type { ModuleDef } from "../src/types/index.js";
import { ArduinoNano } from "./fixtures/arduino-nano.js";
import { VL53L0X } from "./fixtures/vl53l0x.js";

/** Minimal UART GPS: composed uart (device role) with rx/tx slots bound to pins. */
const GpsModule: ModuleDef = {
  id: "gps-neo6m",
  name: "u-blox NEO-6M GPS",
  interfaces: [
    {
      id: "power_in",
      name: "Power Input",
      domain: "electrical",
      exposed: true,
      protocols: [{ type: "power", roles: ["input"] }],
      parameters: [{ id: "voltage", unit: "V", range: [2.7, 3.6] }],
    },
    {
      id: "gnd",
      name: "Ground",
      domain: "electrical",
      exposed: true,
      protocols: [{ type: "power", roles: ["ground"] }],
    },
    {
      id: "pin_rx",
      name: "RX",
      domain: "electrical",
      exposed: true,
      protocols: [{ type: "uart", roles: ["receiver"] }],
      capabilities: ["uart_rx"],
    },
    {
      id: "pin_tx",
      name: "TX",
      domain: "electrical",
      exposed: true,
      protocols: [{ type: "uart", roles: ["transmitter"] }],
      capabilities: ["uart_tx"],
    },
    {
      id: "uart",
      name: "UART",
      domain: "electrical",
      exposed: true,
      protocols: [{ type: "uart", roles: ["device"] }],
      parameters: [{ id: "baud_rate", unit: "Hz", value: 9600 }],
      slots: [
        { id: "rx", required: true, match: { protocol: "uart", role: "receiver", capability: "uart_rx" } },
        { id: "tx", required: true, match: { protocol: "uart", role: "transmitter", capability: "uart_tx" } },
      ],
      profiles: [{ id: "uart_0", bindings: { rx: "pin_rx", tx: "pin_tx" } }],
    },
  ],
};

describe("Phase 6: validatePair (protocol tier)", () => {
  describe("arduino-nano + vl53l0x", () => {
    const result = validatePair(ArduinoNano, VL53L0X);
    const byId = (fragment: string) =>
      result.connections.find((c) => c.id.includes(fragment));

    it("connects i2c to i2c at the top level", () => {
      const i2c = byId(":i2c~vl53l0x:i2c");
      expect(i2c).toBeDefined();
      expect(i2c!.protocol).toBe("i2c");
      expect(i2c!.tier).toBe("protocol");
      expect(i2c!.a.altitude).toBe("top");
      expect(i2c!.a.role).toBe("master");
      expect(i2c!.b.role).toBe("slave");
    });

    it("flags the 5 V vs 2.6–3.5 V i2c voltage conflict", () => {
      const i2c = byId(":i2c~vl53l0x:i2c")!;
      expect(i2c.state).toBe("incompatible");
      expect(
        i2c.diagnostics.some((d) => d.code === "param_range_disjoint" && d.refs?.includes("voltage")),
      ).toBe(true);
    });

    it("picks the parametrically clean supply (3v3, not 5v)", () => {
      expect(byId("power_3v3_out~vl53l0x:power_in")).toBeDefined();
      expect(byId("power_5v_out~vl53l0x:power_in")).toBeUndefined();
      const alt = result.potentials.find(
        (p) => p.a.regionPath[0] === "power_5v_out" && p.b.regionPath[0] === "power_in",
      );
      expect(alt).toBeDefined();
      expect(alt!.clean).toBe(false);
    });

    it("does not compare capacity-semantics params as ranges", () => {
      const power = byId("power_3v3_out~vl53l0x:power_in")!;
      expect(power.state).toBe("valid");
      expect(power.diagnostics.some((d) => d.refs?.includes("max_current"))).toBe(false);
    });

    it("connects ground to ground", () => {
      expect(byId(":gnd~vl53l0x:gnd")).toBeDefined();
    });

    it("leaves ambiguous GPIO matches as potentials, not connections", () => {
      // xshut/gpio1 could be served by many nano pins — census says compatible
      const xshut = result.census.find(
        (e) => e.moduleId === "vl53l0x" && e.regionPath.join(".") === "xshut",
      );
      expect(xshut?.status).toBe("compatible");
      expect(result.connections.some((c) => c.b.regionPath[0] === "xshut")).toBe(false);
      expect(result.potentials.some((p) => p.b.regionPath[0] === "xshut")).toBe(true);
    });

    it("census covers every region of both modules", () => {
      const nanoEntries = result.census.filter((e) => e.moduleId === "arduino-nano");
      const vlEntries = result.census.filter((e) => e.moduleId === "vl53l0x");
      expect(nanoEntries.length).toBe(result.modules.a.interfaceCount);
      expect(vlEntries.length).toBe(result.modules.b.interfaceCount);
      // nested regions present with full paths
      expect(nanoEntries.some((e) => e.regionPath.join(".") === "i2c.a4")).toBe(true);
    });

    it("marks children of a connected parent as engaged via parent", () => {
      const a4 = result.census.find(
        (e) => e.moduleId === "arduino-nano" && e.regionPath.join(".") === "i2c.a4",
      );
      expect(a4?.status).toBe("connected");
      expect(a4?.reason).toBe("via parent");
    });

    it("reports no-counterpart interfaces neutrally", () => {
      const a6 = result.census.find(
        (e) => e.moduleId === "arduino-nano" && e.regionPath.join(".") === "a6",
      );
      expect(a6?.status).toBe("no_counterpart");
    });

    it("rolls the verdict up from connection states", () => {
      expect(result.verdict.state).toBe("incompatible"); // the i2c voltage conflict
      expect(result.verdict.counts.connections).toBe(result.connections.length);
      expect(result.verdict.counts.errors).toBeGreaterThanOrEqual(1);
    });

    it("is JSON-serializable and round-trips unchanged", () => {
      expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    });
  });

  describe("arduino-nano + gps (composed uart on both sides)", () => {
    const result = validatePair(ArduinoNano, GpsModule);
    const uart = result.connections.find((c) => c.protocol === "uart");

    it("connects the composed uart interfaces host↔device", () => {
      expect(uart).toBeDefined();
      expect(uart!.a.role).toBe("host");
      expect(uart!.b.role).toBe("device");
    });

    it("resolves slot-bound leaves into mirrored-row sub-links", () => {
      expect(uart!.subLinks.length).toBe(2);
      const rx = uart!.subLinks.find((l) => l.from.slotId === "rx")!;
      // nano rx (d0, receiver) wires to gps tx (pin_tx, transmitter)
      expect(rx.from.interfaceId).toBe("d0");
      expect(rx.to.interfaceId).toBe("pin_tx");
      expect(uart!.subLinks.map((l) => l.rowPair)).toEqual([0, 1]);
      expect(uart!.unresolvedSlots.length).toBe(0);
    });

    it("does not re-pair children of the connected uart", () => {
      // d0/d1 and pin_rx/pin_tx are consumed by the parent pairing
      expect(
        result.connections.some((c) => c.a.regionPath.join(".") === "uart.d0"),
      ).toBe(false);
      const d0 = result.census.find(
        (e) => e.moduleId === "arduino-nano" && e.regionPath.join(".") === "uart.d0",
      );
      expect(d0?.status).toBe("connected");
    });
  });

  describe("options", () => {
    it("omits potentials when includePotentials is false", () => {
      const result = validatePair(ArduinoNano, VL53L0X, { includePotentials: false });
      expect(result.potentials).toEqual([]);
    });

    it("returns not_configured for modules with nothing in common", () => {
      const inert: ModuleDef = {
        id: "inert",
        name: "Inert",
        interfaces: [
          {
            id: "hose",
            domain: "pneumatic",
            exposed: true,
            protocols: [{ type: "air", roles: ["source"] }],
          },
        ],
      };
      const result = validatePair(inert, VL53L0X);
      expect(result.connections).toEqual([]);
      expect(result.verdict.state).toBe("not_configured");
      expect(result.census.find((e) => e.moduleId === "inert")?.status).toBe("no_counterpart");
    });
  });
});
