import type { Parameter } from "../types/parameter.js";
import { getEffectiveRange, rangesOverlap } from "../parameters/range.js";
import type { Diagnostic } from "./types.js";

/**
 * Parameters whose semantics are aggregation (sum of draws vs. a limit), not
 * range overlap — comparing a supply's max_current to a sink's draw as ranges
 * produces false errors. These are evaluated by the capacity engine (Phase 6,
 * scoped rule packs), so the pairwise overlap check skips them.
 */
export const CAPACITY_PARAM_IDS = new Set([
  "max_current",
  "current_draw",
  "max_flow",
  "flow_rate",
]);

/** SI-prefix normalization so 40 mA and 0.04 A compare in the same base unit. */
const UNIT_SCALE: Record<string, { base: string; scale: number }> = {
  mA: { base: "A", scale: 1e-3 },
  µA: { base: "A", scale: 1e-6 },
  uA: { base: "A", scale: 1e-6 },
  mV: { base: "V", scale: 1e-3 },
  kV: { base: "V", scale: 1e3 },
  kHz: { base: "Hz", scale: 1e3 },
  MHz: { base: "Hz", scale: 1e6 },
  GHz: { base: "Hz", scale: 1e9 },
  ms: { base: "s", scale: 1e-3 },
  µs: { base: "s", scale: 1e-6 },
  us: { base: "s", scale: 1e-6 },
  mm: { base: "m", scale: 1e-3 },
  kΩ: { base: "Ω", scale: 1e3 },
  MΩ: { base: "Ω", scale: 1e6 },
  kPa: { base: "Pa", scale: 1e3 },
  bar: { base: "Pa", scale: 1e5 },
  mW: { base: "W", scale: 1e-3 },
  kW: { base: "W", scale: 1e3 },
};

function normalized(param: Parameter): { base: string; range: [number, number] | null } {
  const scale = UNIT_SCALE[param.unit as string];
  const range = getEffectiveRange(param);
  if (!scale) return { base: param.unit as string, range };
  return {
    base: scale.base,
    range: range ? [range[0] * scale.scale, range[1] * scale.scale] : null,
  };
}

/**
 * Pairwise parameter check between two matched regions: for every parameter id
 * present on both sides (excluding capacity-semantics params), the effective
 * ranges must overlap in a common base unit.
 */
export function checkPairParameters(
  paramsA: Parameter[] | undefined,
  paramsB: Parameter[] | undefined,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const pA of paramsA ?? []) {
    if (CAPACITY_PARAM_IDS.has(pA.id)) continue;
    const pB = (paramsB ?? []).find((p) => p.id === pA.id);
    if (!pB) continue;

    const nA = normalized(pA);
    const nB = normalized(pB);

    if (nA.base !== nB.base) {
      diagnostics.push({
        severity: "error",
        code: "param_unit_mismatch",
        message: `${pA.id}: unit "${pA.unit}" is not comparable with "${pB.unit}"`,
        refs: [pA.id],
      });
      continue;
    }
    if (!nA.range || !nB.range) continue; // no determinable range — not checkable

    if (!rangesOverlap(nA.range, nB.range)) {
      diagnostics.push({
        severity: "error",
        code: "param_range_disjoint",
        message: `${pA.id}: ${fmt(nA.range)} ∩ ${fmt(nB.range)} = ∅ ${nA.base}`,
        refs: [pA.id],
      });
    }
  }

  return diagnostics;
}

function fmt(range: [number, number]): string {
  return range[0] === range[1] ? `${range[0]}` : `${range[0]}–${range[1]}`;
}
