import type { Memory } from "./mapping";

export type KnowledgeMode = "world" | "human" | "bat" | "overlap";
export type RegionCell = { occupied: boolean; owner: "human" | "bat" | "both" };
export type RegionSurface = {
  positions: number[];
  colors: number[];
  rectangles: number;
  area: number;
};
const palette = {
  human: [0x246bcc, 0xb9d9fb],
  bat: [0xd96f20, 0xf7cea9],
  both: [0x8544b5, 0xd6bce9],
};

// Presentation reads memory only. No physical world, interpolation or hull fill.
export function selectRegionCells(
  memories: Memory[],
  mode: KnowledgeMode,
  currentOnly = false,
) {
  const selected = new Map<string, RegionCell>();
  const keys = new Set([
    ...memories[0].cells.keys(),
    ...memories[1].cells.keys(),
  ]);
  for (const k of keys) {
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
    } else if (mode !== "overlap" || (h !== undefined && b !== undefined)) {
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
  }
  return selected;
}

// Merge coplanar neighboring observed faces into rectangles. Unknown holes remain holes.
export function buildRegionSurface(
  cells: Map<string, RegionCell>,
  occupied: boolean,
): RegionSurface {
  const planes = new Map<
    string,
    {
      axis: number;
      plane: number;
      owner: RegionCell["owner"];
      tiles: Set<string>;
    }
  >();
  function face(
    axis: number,
    plane: number,
    u: number,
    v: number,
    owner: RegionCell["owner"],
    sign: number,
  ) {
    const k = `${axis}/${plane}/${owner}/${sign}`;
    if (!planes.has(k)) planes.set(k, { axis, plane, owner, tiles: new Set() });
    planes.get(k)!.tiles.add(`${u},${v}`);
  }
  for (const [k, cell] of cells) {
    if (cell.occupied !== occupied) continue;
    const p = k.split(",").map(Number);
    if (!occupied) {
      // A ground-region view, not an inflated 3D cloud of free air samples.
      if (p[1] === 0) face(1, 0.035, p[0], p[2], cell.owner, 1);
      continue;
    }
    for (let axis = 0; axis < 3; axis++)
      for (const sign of [-1, 1]) {
        const neighbor = [...p];
        neighbor[axis] += sign;
        if (cells.get(neighbor.join(","))?.occupied) continue;
        const other = [0, 1, 2].filter((a) => a !== axis);
        face(
          axis,
          p[axis] + (sign > 0 ? 1 : 0),
          p[other[0]],
          p[other[1]],
          cell.owner,
          sign,
        );
      }
  }
  const result: RegionSurface = {
    positions: [],
    colors: [],
    rectangles: 0,
    area: 0,
  };
  for (const { axis, plane, owner, tiles } of planes.values()) {
    const other = [0, 1, 2].filter((a) => a !== axis);
    const color = palette[owner][occupied ? 0 : 1];
    const rgb = [
      ((color >> 16) & 255) / 255,
      ((color >> 8) & 255) / 255,
      (color & 255) / 255,
    ];
    for (const start of [...tiles].sort((a, b) => {
      const [ax, ay] = a.split(",").map(Number),
        [bx, by] = b.split(",").map(Number);
      return ay - by || ax - bx;
    })) {
      if (!tiles.has(start)) continue;
      const [u, v] = start.split(",").map(Number);
      let width = 1,
        height = 1;
      while (tiles.has(`${u + width},${v}`)) width++;
      while (
        Array.from({ length: width }, (_, i) =>
          tiles.has(`${u + i},${v + height}`),
        ).every(Boolean)
      )
        height++;
      for (let i = 0; i < width; i++)
        for (let j = 0; j < height; j++) tiles.delete(`${u + i},${v + j}`);
      const corners = [
        [u, v],
        [u + width, v],
        [u + width, v + height],
        [u, v + height],
      ];
      for (const i of [0, 1, 2, 0, 2, 3]) {
        const p = [0, 0, 0];
        p[axis] = plane;
        p[other[0]] = corners[i][0];
        p[other[1]] = corners[i][1];
        result.positions.push(...p);
        result.colors.push(...rgb);
      }
      result.rectangles++;
      result.area += width * height;
    }
  }
  return result;
}
