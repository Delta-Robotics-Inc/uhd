/**
 * FRC Pneumatic Piston (generic double-acting cylinder) — source-honest part
 * definition.
 *
 * Primary source: ProtoPart definition `frc-pneumatic-piston`
 *   (ProtoPart/protoparts/frc-pneumatic-piston/definition.json,
 *   schema 1.4.0, part version 0.1.0)
 *   - domains[pneumatic].resources  Port A (Extend) / Port B (Retract):
 *     quick-connect fittings, 8.3 bar working = max pressure, one
 *     fluid-class sink function each (AIR_IN_A / AIR_IN_B)
 *   - domains[pneumatic].interfaces  Air Inlet A (Extend) / Air Inlet B
 *     (Retract): pneumatic sink, one function each, max_instances 1
 *   - domains[pneumatic].metadata  working_medium: compressed_air
 * Secondary source: WPILib Control System Hardware — Pneumatics
 *   (the definition's datasheet_url; generic FRC pneumatics reference).
 *
 * Architecture notes honoured by this file:
 *   - Port-honest like a plumbing diagram: both physical air ports are leaf
 *     interfaces carrying the source definition's resource ids and names;
 *     each verbatim function record (name, direction, signal_class) lives in
 *     a `piston_port_functions` trait, mirroring the pin-function convention.
 *   - The two ProtoPart pneumatic interfaces map to composed interfaces with
 *     one required slot each and a fixed default profile — a cylinder port
 *     has exactly one plumbing combination, so the combination space is 1.
 *   - Double-acting semantics: extend/retract roles are `actuation_role`
 *     traits; both inlets form an `all_of` interface group because a
 *     double-acting cylinder is actuated by pressurising one port while the
 *     other vents.
 *   - No fabrication: the source definition is generic. Bore, stroke, rod
 *     thread, port thread spec, flow rating, and mounting interfaces
 *     (rod end / body) are NOT specified there and are deliberately absent
 *     here — see the `generic_part` trait.
 */

import type {
  InterfaceDef,
  ModuleDef,
  TraitDef,
} from "../../src/types/index.js";
import { defineModule } from "../../src/protocols/index.js";

// ---------------------------------------------------------------------------
// Pneumatic constants — definition.json domains[pneumatic].resources
// ---------------------------------------------------------------------------

/**
 * Both ports: working_pressure_bar, kept verbatim from the source definition
 * (which rates working = max = 8.3 bar). Audit note: 8.3 bar ≈ 120 psi is the
 * FRC STORED-pressure ceiling (compressor cutoff, FRC R806 / WPILib
 * pneumatics docs) — read it as a pressure RATING. Actual FRC working
 * pressure at a cylinder is capped at 60 psi (~4.1 bar) by the primary
 * regulator (FRC R807); the source's "working" label overstates the FRC
 * operating pressure.
 */
const WORKING_PRESSURE_BAR = 8.3;
/** Both ports: max_pressure_bar — the source rates working = max. */
const MAX_PRESSURE_BAR = 8.3;

const SOURCE = "ProtoPart frc-pneumatic-piston definition.json (schema 1.4.0)";

// ---------------------------------------------------------------------------
// Physical air ports — domains[pneumatic].resources, port-honest
// ---------------------------------------------------------------------------

interface PistonPortSpec {
  /** ProtoPart resource id — kept verbatim as the leaf interface id. */
  id: string;
  /** ProtoPart resource name — used as the displayed interface name. */
  name: string;
  /** Verbatim function name from the resource's function list. */
  functionName: string;
  /** Capability tag for slot matching by the composed air-inlet interface. */
  capability: string;
}

/** Build one plumbing-honest air port from its source resource record. */
function pistonPort(spec: PistonPortSpec): InterfaceDef {
  return {
    id: spec.id,
    name: spec.name,
    domain: "pneumatic",
    exposed: true,
    default_active: true,
    // Resource function direction "sink": the port consumes supplied air.
    protocols: [{ type: "pneumatic", roles: ["sink"] }],
    capabilities: [spec.capability, "quick_connect"],
    parameters: [
      { id: "working_pressure", name: "Working pressure", unit: "bar", value: WORKING_PRESSURE_BAR },
      { id: "max_pressure", name: "Max pressure", unit: "bar", value: MAX_PRESSURE_BAR },
    ],
    traits: [
      {
        type: "piston_port_functions",
        params: {
          source: SOURCE,
          functions: [{ name: spec.functionName, direction: "sink", signal_class: "fluid" }],
        },
      },
      {
        type: "connector",
        params: { connector_type: "quick_connect", source: SOURCE },
      },
    ],
  };
}

const portA = pistonPort({
  id: "port-a-res",
  name: "Port A (Extend)",
  functionName: "AIR_IN_A",
  capability: "air_in_a",
});

const portB = pistonPort({
  id: "port-b-res",
  name: "Port B (Retract)",
  functionName: "AIR_IN_B",
  capability: "air_in_b",
});

// ---------------------------------------------------------------------------
// Air inlets — domains[pneumatic].interfaces
// ---------------------------------------------------------------------------

interface AirInletSpec {
  /** ProtoPart interface id — kept verbatim. */
  id: string;
  name: string;
  /** ProtoPart interface description (verbatim actuation semantics). */
  description: string;
  action: "extend" | "retract";
  portId: string;
  portCapability: string;
}

/** Build one composed air inlet from its source interface record. */
function airInlet(spec: AirInletSpec): InterfaceDef {
  const traits: TraitDef[] = [
    {
      type: "actuation_role",
      params: { action: spec.action, description: spec.description, source: SOURCE },
    },
  ];
  return {
    id: spec.id,
    name: spec.name,
    domain: "pneumatic",
    exposed: true,
    default_active: true,
    protocols: [{ type: "pneumatic", roles: ["sink"] }],
    slots: [
      {
        id: "supply",
        required: true,
        match: { protocol: "pneumatic", role: "sink", capability: spec.portCapability },
      },
    ],
    profiles: [
      {
        id: `${spec.id.replace(/-/g, "_")}_port`,
        label: spec.name,
        default_active: true,
        bindings: { supply: spec.portId },
      },
    ],
    max_instances: 1, // definition.json: max_instances 1 per inlet
    traits,
  };
}

const airInA = airInlet({
  id: "air-in-a",
  name: "Air Inlet A (Extend)",
  description: "Air supply to extend piston",
  action: "extend",
  portId: "port-a-res",
  portCapability: "air_in_a",
});

const airInB = airInlet({
  id: "air-in-b",
  name: "Air Inlet B (Retract)",
  description: "Air supply to retract piston",
  action: "retract",
  portId: "port-b-res",
  portCapability: "air_in_b",
});

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

export const FRC_PNEUMATIC_PISTON: ModuleDef = defineModule({
  id: "frc-pneumatic-piston",
  name: "Pneumatic Piston",
  version: "0.1.0",
  manufacturer: "Various (Bimba, SMC)",
  part_number: "Pneumatic Cylinder",
  description:
    "Generic double-acting pneumatic piston/cylinder for FRC. Provides linear motion when air pressure is applied.",
  tags: ["FRC", "pneumatic", "piston", "cylinder", "actuator"],
  categories: ["actuator.linear_actuator", "robotics.frc"],

  interfaces: [
    // Physical air ports — plumbing-honest.
    portA,
    portB,

    // Composed air inlets (the ProtoPart pneumatic interfaces).
    airInA,
    airInB,
  ],

  interfaceGroups: [
    {
      // "Double-acting" (module description): pressurising one inlet while
      // the other vents produces motion — both must be plumbed.
      id: "double_acting_inlets",
      label: "Double-Acting Air Inlets (extend + retract)",
      members: ["air-in-a", "air-in-b"],
      policy: "all_of",
    },
  ],

  requirements: [
    {
      type: "interface",
      description:
        "Double-acting: each port needs a compressed-air supply path (working medium: compressed_air) rated to the 8.3 bar max port pressure. In FRC this is a solenoid valve on the working-pressure circuit, downstream of the primary regulator (working pressure capped at 60 psi / ~4.1 bar per FRC R807; 8.3 bar ≈ 120 psi is the stored-pressure ceiling, FRC R806).",
      interface_protocol: "pneumatic",
    },
  ],

  domains: [
    {
      domain: "pneumatic",
      metadata: {
        working_medium: "compressed_air", // domains[pneumatic].metadata, verbatim
        working_pressure_bar: WORKING_PRESSURE_BAR,
        max_pressure_bar: MAX_PRESSURE_BAR,
        source: SOURCE,
      },
    },
  ],

  traits: [
    {
      // Honest-gap record: what the generic source definition does NOT specify.
      type: "generic_part",
      params: {
        note: "Generic catalogue placeholder (part_number 'Pneumatic Cylinder', manufacturer 'Various'). Bore, stroke, rod thread, port thread spec, flow rating, and mechanical mounting interfaces (rod end / body) are not specified by the source definition and are intentionally not modelled.",
        source: SOURCE,
      },
    },
    {
      type: "protopart_provenance",
      params: { protopart_id: "frc-pneumatic-piston", schema_version: "1.4.0", part_type: "actuator" },
    },
    {
      // definition.json previewArtifactId — no ModuleDef field exists for it.
      type: "preview_artifact",
      params: { artifactId: "art_thumbnail" },
    },
  ],

  artifacts: [
    {
      // metadata.datasheet_url — a docs page, not a true datasheet.
      id: "art_wpilib_pneumatics",
      name: "WPILib Control System Hardware — Pneumatics",
      type: "documentation",
      url: "https://docs.wpilib.org/en/stable/docs/controls-overviews/control-system-hardware.html#pneumatics",
    },
    {
      id: "art_thumbnail",
      name: "Thumbnail",
      type: "custom", // source type "image" has no ArtifactType equivalent
      filePath: "./ProtoPart/protoparts/frc-pneumatic-piston/thumbnail.png",
      mimeType: "image/png",
      tags: ["image", "thumbnail"],
    },
  ],

  geometry: {
    xScale: 1.5,
    yScale: 0.5,
    outline: { preset: "rounded_rectangle" },
  },
});
