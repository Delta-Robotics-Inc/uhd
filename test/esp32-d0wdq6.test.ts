import { describe, expect, it } from "vitest";
import { applyProfile } from "../src/binding/profile.js";
import { getClaimedInterfaces } from "../src/binding/claims.js";
import { instantiateModule } from "../src/instance/instantiate.js";
import { resolveAllInterfaces } from "../src/instance/resolve.js";
import { ESP32D0WDQ6 } from "./fixtures/esp32-d0wdq6.js";

function iface(id: string) {
  const found = ESP32D0WDQ6.interfaces.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Missing interface ${id}`);
  return found;
}

describe("ESP32-D0WDQ6 OpenUHD definition", () => {
  it("defines identity, domains, and physical package pins", () => {
    expect(ESP32D0WDQ6.id).toBe("esp32-d0wdq6");
    expect(ESP32D0WDQ6.manufacturer).toBe("Espressif Systems");
    expect(ESP32D0WDQ6.part_number).toBe("ESP32-D0WDQ6");
    expect(ESP32D0WDQ6.domains?.map((domain) => domain.domain)).toEqual([
      "electrical",
      "mechanical",
      "thermal",
      "network",
    ]);

    const physicalPads = new Set(
      ESP32D0WDQ6.interfaces
        .map((interfaceDef) => interfaceDef.pin)
        .filter((pin) => pin !== undefined),
    );
    expect(physicalPads.size).toBe(49);
  });

  it("models input-only GPIO34-GPIO39 without output roles", () => {
    const sensorVp = iface("sensor_vp");

    expect(sensorVp.protocols.find((protocol) => protocol.type === "digital")?.roles).toEqual(["input"]);
    expect(sensorVp.capabilities).toContain("analog_in");
    expect(sensorVp.capabilities).toContain("adc1_ch0");
    expect(sensorVp.capabilities).not.toContain("pwm_out");
  });

  it("validates default I2C, SPI, UART, ADC, and JTAG profiles", () => {
    expect(applyProfile(ESP32D0WDQ6, "i2c", "i2c0_default")?.validation.valid).toBe(true);
    expect(applyProfile(ESP32D0WDQ6, "spi", "hspi_default")?.validation.valid).toBe(true);
    expect(applyProfile(ESP32D0WDQ6, "spi", "vspi_default")?.validation.valid).toBe(true);
    expect(applyProfile(ESP32D0WDQ6, "uart", "uart0_default")?.validation.valid).toBe(true);
    expect(applyProfile(ESP32D0WDQ6, "adc1", "adc1_channels")?.validation.valid).toBe(true);
    expect(applyProfile(ESP32D0WDQ6, "adc2", "adc2_channels")?.validation.valid).toBe(true);
    expect(applyProfile(ESP32D0WDQ6, "jtag", "jtag_default")?.validation.valid).toBe(true);
  });

  it("activates and claims the external SPI flash pads by default", () => {
    const instance = instantiateModule(ESP32D0WDQ6);
    const claimed = getClaimedInterfaces(instance.interfaceStates);

    expect(instance.interfaceStates.qspi_flash.instances.spi0_flash_default.active).toBe(true);
    expect(claimed.has("sd_clk")).toBe(true);
    expect(claimed.has("sd_cmd")).toBe(true);
    expect(claimed.has("sd_data_0")).toBe(true);
    expect(claimed.has("sd_data_1")).toBe(true);
    expect(claimed.has("sd_data_2")).toBe(true);
    expect(claimed.has("sd_data_3")).toBe(true);
  });

  it("keeps optional buses inactive until a profile is selected", () => {
    const instance = instantiateModule(ESP32D0WDQ6);
    const resolved = resolveAllInterfaces(ESP32D0WDQ6, instance);

    expect(resolved.find((entry) => entry.interfaceDef.id === "i2c")?.active).toBe(false);
    expect(resolved.find((entry) => entry.interfaceDef.id === "spi")?.active).toBe(false);
    expect(resolved.find((entry) => entry.interfaceDef.id === "uart")?.active).toBe(false);
    expect(resolved.find((entry) => entry.interfaceDef.id === "qspi_flash")?.active).toBe(true);
  });

  it("bridges the wireless radios to the shared LNA_IN RF feed", () => {
    expect(iface("wifi_radio").bridgesTo).toContain("lna_in");
    expect(iface("bluetooth_radio").bridgesTo).toContain("lna_in");
    expect(iface("lna_in").bridgesTo).toEqual(["wifi_radio", "bluetooth_radio"]);
  });
});

