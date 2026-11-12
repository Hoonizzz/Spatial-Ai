import test from "node:test";
import assert from "node:assert/strict";
import {
  mergePlanRegions,
  selectRegionCells,
  type RegionCell,
} from "../src/regions";
import { Memory } from "../src/mapping";
const free: RegionCell = { occupied: false, owner: "human" };
test("observed neighbors become a connected filled region", () => {
  const cells = new Map<string, RegionCell>();
  for (let x = 0; x < 4; x++)
    for (let z = 0; z < 3; z++) cells.set(`${x},0,${z}`, free);
  assert.deepEqual(mergePlanRegions(cells), [
    { ...free, x: 0, z: 0, width: 4, depth: 3 },
  ]);
});
test("unknown holes stay unpainted instead of being filled by a bounding region", () => {
  const cells = new Map<string, RegionCell>();
  for (let x = 0; x < 3; x++)
    for (let z = 0; z < 3; z++)
      if (x !== 1 || z !== 1) cells.set(`${x},0,${z}`, free);
  const regions = mergePlanRegions(cells);
  assert.equal(
    regions.reduce((a, r) => a + r.width * r.depth, 0),
    8,
  );
  for (const r of regions)
    assert(!(r.x < 2 && r.x + r.width > 1 && r.z < 2 && r.z + r.depth > 1));
});
test("individual/current/shared views do not borrow another agent classification", () => {
  const h = new Memory(),
    b = new Memory();
  h.cells.set("2,0,2", 0);
  h.cells.set("3,0,2", 1);
  h.current.add("2,0,2");
  b.cells.set("2,0,2", 1);
  b.cells.set("8,0,8", 0);
  b.current.add("8,0,8");
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
