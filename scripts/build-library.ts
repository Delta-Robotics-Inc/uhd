/**
 * Library manifest build step (docs/showcase-plan.md § 2.3).
 *
 * Compiles the TS part definitions in library/parts/ into:
 *   - library/dist/index.json             search manifest (id, name, taxonomy,
 *                                         protocols, domains, thumbnail)
 *   - library/dist/parts/<id>.json        full ModuleDef, one file per part
 *   - library/dist/thumbnails/<id>.png    self-hosted thumbnails, copied from
 *                                         library/parts/<id>/artifacts/thumbnail.png
 *
 * The website statically imports these — no database needed at this scale.
 *
 * Run: npm run build:library   (npx tsx scripts/build-library.ts)
 */

import { copyFileSync, existsSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { fileURLToPath } from "url";
import { join } from "path";

import type { ModuleDef } from "../src/types/index.js";
import * as parts from "../library/parts/index.js";

/** One search-manifest row per part — the fields /parts and /validate filter on. */
interface ManifestEntry {
  id: string;
  name: string;
  description?: string;
  version?: string;
  manufacturer?: string;
  part_number?: string;
  /** tags + categories from the ModuleDef, merged and deduped */
  taxonomy: string[];
  /** unique protocol types across exposed interfaces (e.g. "i2c", "power") */
  protocols: string[];
  /** unique domain kinds across interfaces + domain metadata */
  domains: string[];
  /** URL/path of the first image-like artifact, if any */
  thumbnail?: string;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function collectTaxonomy(def: ModuleDef): string[] {
  return uniqueSorted([...(def.tags ?? []), ...(def.categories ?? [])]);
}

function collectProtocols(def: ModuleDef): string[] {
  const types = def.interfaces
    .filter((iface) => iface.exposed)
    .flatMap((iface) => iface.protocols.map((p) => p.type));
  return uniqueSorted(types);
}

function collectDomains(def: ModuleDef): string[] {
  const fromInterfaces = def.interfaces.map((iface) => iface.domain);
  const fromMetadata = (def.domains ?? []).map((d) => d.domain);
  return uniqueSorted([...fromInterfaces, ...fromMetadata]);
}

/**
 * Self-hosted thumbnail (docs/showcase-plan.md § 2.3 artifacts): a part may
 * ship library/parts/<id>/artifacts/thumbnail.png; it is copied into
 * library/dist/thumbnails/<id>.png and referenced dist-relative. Falls back
 * to an externally-hosted image artifact URL on the ModuleDef.
 */
function findThumbnail(def: ModuleDef): string | undefined {
  if (existsSync(hostedThumbnailSource(def.id))) {
    return `thumbnails/${def.id}.png`;
  }
  const artifact = (def.artifacts ?? []).find(
    (a) =>
      a.url !== undefined &&
      (a.tags?.includes("thumbnail") || a.mimeType?.startsWith("image/")),
  );
  return artifact?.url;
}

function hostedThumbnailSource(id: string): string {
  return join(partsSrcDir, id, "artifacts", "thumbnail.png");
}

function toManifestEntry(def: ModuleDef): ManifestEntry {
  return {
    id: def.id,
    name: def.name,
    description: def.description,
    version: def.version,
    manufacturer: def.manufacturer,
    part_number: def.part_number,
    taxonomy: collectTaxonomy(def),
    protocols: collectProtocols(def),
    domains: collectDomains(def),
    thumbnail: findThumbnail(def),
  };
}

function assertUniqueIds(defs: ModuleDef[]): void {
  const seen = new Map<string, number>();
  for (const def of defs) {
    seen.set(def.id, (seen.get(def.id) ?? 0) + 1);
  }
  const duplicates = [...seen.entries()].filter(([, count]) => count > 1);
  if (duplicates.length > 0) {
    const ids = duplicates.map(([id]) => id).join(", ");
    throw new Error(`Duplicate part ids in library/parts: ${ids}`);
  }
}

const distDir = fileURLToPath(new URL("../library/dist", import.meta.url));
const partsDir = join(distDir, "parts");
const thumbsDir = join(distDir, "thumbnails");
const partsSrcDir = fileURLToPath(new URL("../library/parts", import.meta.url));

const defs = Object.values(parts) as ModuleDef[];
if (defs.length === 0) {
  throw new Error("No parts exported from library/parts/index.ts");
}
assertUniqueIds(defs);

rmSync(distDir, { recursive: true, force: true });
mkdirSync(partsDir, { recursive: true });

const manifest = defs
  .map(toManifestEntry)
  .sort((a, b) => a.id.localeCompare(b.id));

writeFileSync(
  join(distDir, "index.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
for (const def of defs) {
  writeFileSync(
    join(partsDir, `${def.id}.json`),
    JSON.stringify(def, null, 2) + "\n",
  );
}

mkdirSync(thumbsDir, { recursive: true });
let thumbnailCount = 0;
for (const def of defs) {
  const source = hostedThumbnailSource(def.id);
  if (existsSync(source)) {
    copyFileSync(source, join(thumbsDir, `${def.id}.png`));
    thumbnailCount += 1;
  }
}

console.log(
  `library/dist: wrote index.json (${manifest.length} parts) + ${defs.length} part files + ${thumbnailCount} thumbnails`,
);
for (const entry of manifest) {
  console.log(
    `  ${entry.id}  [${entry.domains.join(", ")}]  protocols: ${entry.protocols.join(", ") || "—"}`,
  );
}
