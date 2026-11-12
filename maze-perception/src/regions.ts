import type { Memory } from "./mapping";
export type KnowledgeMode = "world" | "human" | "bat" | "overlap";
export type RegionCell = { occupied: boolean; owner: "human" | "bat" | "both" };
export type RegionRect = RegionCell & {
  x: number;
  z: number;
  width: number;
  depth: number;
};
export function selectRegionCells(
  memories: Memory[],
  mode: KnowledgeMode,
  currentOnly = false,
) {
  const selected = new Map<string, RegionCell>();
  for (const k of new Set([
    ...memories[0].cells.keys(),
    ...memories[1].cells.keys(),
  ])) {
    const h =
      !currentOnly || memories[0].current.has(k)
        ? memories[0].cells.get(k)
        : undefined;
    const b =
      !currentOnly || memories[1].current.has(k)
        ? memories[1].cells.get(k)
        : undefined;
    if (h === undefined && b === undefined) continue;
    if (mode === "human") {
      if (h !== undefined)
        selected.set(k, { occupied: h === 1, owner: "human" });
    } else if (mode === "bat") {
      if (b !== undefined) selected.set(k, { occupied: b === 1, owner: "bat" });
    } else if (mode !== "overlap" || (h !== undefined && b !== undefined))
      selected.set(k, {
        occupied: h === 1 || b === 1,
        owner:
          h !== undefined && b !== undefined
            ? "both"
            : h !== undefined
              ? "human"
              : "bat",
      });
  }
  return selected;
}
// Merge only observed neighbors of the same class. Unknown holes stay blank.
export function mergePlanRegions(cells: Map<string, RegionCell>): RegionRect[] {
  const groups = new Map<string, { cell: RegionCell; tiles: Set<string> }>();
  for (const [k, cell] of cells) {
    const [x, , z] = k.split(",").map(Number),
      id = `${cell.owner}/${cell.occupied}`;
    if (!groups.has(id)) groups.set(id, { cell, tiles: new Set() });
    groups.get(id)!.tiles.add(`${x},${z}`);
  }
  const regions: RegionRect[] = [];
  for (const { cell, tiles } of groups.values())
    for (const start of [...tiles].sort((a, b) => {
      const [ax, az] = a.split(",").map(Number),
        [bx, bz] = b.split(",").map(Number);
      return az - bz || ax - bx;
    })) {
      if (!tiles.has(start)) continue;
      const [x, z] = start.split(",").map(Number);
      let width = 1,
        depth = 1;
      while (tiles.has(`${x + width},${z}`)) width++;
      while (
        Array.from({ length: width }, (_, i) =>
          tiles.has(`${x + i},${z + depth}`),
        ).every(Boolean)
      )
        depth++;
      for (let i = 0; i < width; i++)
        for (let j = 0; j < depth; j++) tiles.delete(`${x + i},${z + j}`);
      regions.push({ ...cell, x, z, width, depth });
    }
  return regions;
}
