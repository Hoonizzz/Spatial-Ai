import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRegionSurface,
  selectRegionCells,
  type RegionCell,
} from "../src/regions";
import { Memory } from "../src/mapping";
import { MAZE_HEIGHT, VOXEL_COUNT, World } from "../src/world";

const free: RegionCell = { occupied: false, owner: "human" };
const wall: RegionCell = { occupied: true, owner: "human" };
test("adjacent observed floor cells become one continuous rectangle, never a point cloud", () => {
  const cells = new Map<string, RegionCell>();
  for (let x = 0; x < 4; x++)
    for (let z = 0; z < 3; z++) cells.set(`${x},0,${z}`, free);
  const region = buildRegionSurface(cells, false);
  assert.equal(region.rectangles, 1);
  assert.equal(region.area, 12);
  assert.equal(region.positions.length, 18);
});
test("unknown gaps are never bridged when meshing perceived regions", () => {
  const cells = new Map<string, RegionCell>();
  for (let x = 0; x < 3; x++)
    for (let z = 0; z < 3; z++)
      if (x !== 1 || z !== 1) cells.set(`${x},0,${z}`, free);
  const region = buildRegionSurface(cells, false);
  assert.equal(region.area, 8);
  for (let i = 0; i < region.positions.length; i += 18) {
    const triangle = region.positions.slice(i, i + 18),
      xs = triangle.filter((_, j) => j % 3 === 0),
      zs = triangle.filter((_, j) => j % 3 === 2);
    assert(
      !(
        Math.min(...xs) < 2 &&
        Math.max(...xs) > 1 &&
        Math.min(...zs) < 2 &&
        Math.max(...zs) > 1
      ),
    );
  }
});
test("neighboring occupied cells share a surface; internal cube faces disappear", () => {
  const region = buildRegionSurface(
    new Map([
      ["0,0,0", wall],
      ["1,0,0", wall],
    ]),
    true,
  );
  assert.equal(region.rectangles, 6);
  assert.equal(region.area, 10);
  for (let i = 0; i < region.positions.length; i += 18)
    assert(
      !region.positions
        .slice(i, i + 18)
        .filter((_, j) => j % 3 === 0)
        .every((x) => x === 1),
    );
});
test("individual/current/overlap views retain only their own recorded classifications", () => {
  const h = new Memory(),
    b = new Memory();
  h.cells.set("2,0,2", 0);
  h.cells.set("3,0,2", 1);
  h.current.add("2,0,2");
  b.cells.set("2,0,2", 1);
  b.cells.set("8,0,8", 0);
  b.current.add("8,0,8");
  assert.deepEqual(
    [...selectRegionCells([h, b], "human").keys()],
    ["2,0,2", "3,0,2"],
  );
  assert.equal(
    selectRegionCells([h, b], "human").get("2,0,2")!.occupied,
    false,
  );
  assert.equal(selectRegionCells([h, b], "bat").get("2,0,2")!.occupied, true);
  assert.equal(selectRegionCells([h, b], "human", true).size, 1);
  assert.equal(selectRegionCells([h, b], "overlap", true).size, 0);
  assert.equal(selectRegionCells([h, b], "overlap").size, 1);
  assert.equal(selectRegionCells([h, b], "world", true).size, 2);
});
test("existing footprint and support deck are retained while the maze height triples", () => {
  const world = new World(2026, "C");
  assert.equal(MAZE_HEIGHT, 36);
  assert.equal(VOXEL_COUNT, 32400);
  for (const w of world.walls) {
    assert(w.height >= 6 && w.height <= 36);
    assert.equal(w.height % 6, 0);
  }
  assert.equal(world.surface(10, 4), 4);
  assert.equal(world.solid({ x: 3, y: 35, z: 11 }), null);
  assert.equal(world.solid({ x: 3, y: 36, z: 11 }), "concrete");
  assert(world.clear({ x: 3, y: 20, z: 11 }));
});
