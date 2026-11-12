import test from "node:test";
import assert from "node:assert/strict";
import { Simulation, defaults } from "../src/simulation";
import { World, dist, center, materials, VOXEL_COUNT } from "../src/world";
import { Memory } from "../src/mapping";
import { plan } from "../src/navigation";

test("A/B/C use the same connected planar maze, initial positions and mouse random stream", () => {
  const sims = (["A", "B", "C"] as const).map(
    (environment) => new Simulation({ ...defaults(), environment }),
  );
  for (const s of sims) {
    assert.deepEqual(
      s.world.walls.map((w) => [w.x, w.z]),
      sims[0].world.walls.map((w) => [w.x, w.z]),
    );
    assert.deepEqual(
      s.agents.map((a) => a.p),
      sims[0].agents.map((a) => a.p),
    );
    assert.equal(s.config.humanSpeed, s.config.batSpeed);
  }
  assert.notDeepEqual(
    sims[0].world.walls.map((w) => w.material),
    sims[1].world.walls.map((w) => w.material),
  );
  for (let n = 0; n < 100; n++)
    for (const s of sims) {
      s.time += 0.05;
      s.updateMouse(0.05);
    }
  assert.deepEqual(sims[0].mouse, sims[1].mouse);
  assert.deepEqual(sims[1].mouse, sims[2].mouse);
  const w = sims[0].world,
    seen = new Set(["1,1"]),
    queue = ["1,1"];
  for (const k of queue) {
    const [x, z] = k.split(",").map(Number);
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const q = `${x + dx},${z + dz}`;
      if (w.open.has(q) && !seen.has(q)) {
        seen.add(q);
        queue.push(q);
      }
    }
  }
  assert.equal(seen.size, w.open.size);
});
test("finite horizontal sensing does not reveal distant space and retains independent memories", () => {
  const s = new Simulation({ ...defaults(), lidarRange: 3, echoRange: 3 });
  for (const a of s.agents) {
    s.scan(a);
    assert(a.memory.cells.size > 0);
    for (const k of a.memory.cells.keys()) {
      assert.equal(k.split(",")[1], "0");
      assert(dist(a.p, center(k)) <= 3 + Math.sqrt(2));
    }
    for (const r of a.rays) {
      assert.equal(r.a.y, 0.5);
      assert.equal(r.b.y, 0.5);
      assert(dist(r.a, r.b) <= 3.001);
    }
    const previous = [...a.memory.cells.keys()];
    a.p = { x: 25, y: 0.5, z: 25 };
    s.scan(a);
    assert(previous.every((k) => a.memory.cells.has(k)));
    assert(previous.some((k) => !a.memory.current.has(k)));
  }
  assert.notEqual(s.agents[0].memory, s.agents[1].memory);
});
test("glass reduces optical returns and foam reduces acoustic returns through real coefficients", () => {
  const hits = (
    kind: "Human" | "Bat",
    material: "concrete" | "glass" | "foam",
  ) => {
    const s = new Simulation(defaults()),
      a = s.agents[kind === "Human" ? 0 : 1];
    a.p = { x: 3, y: 0.5, z: 3 };
    a.heading = Math.PI;
    for (const w of s.world.walls) w.material = material;
    let total = 0;
    for (let n = 0; n < 30; n++) {
      s.scan(a);
      total += a.rays.filter((r) => r.hit).length;
    }
    return total;
  };
  assert(hits("Human", "concrete") > hits("Human", "glass") * 1.5);
  assert(hits("Bat", "concrete") > hits("Bat", "foam") * 1.5);
  const s = new Simulation(defaults()),
    a = s.agents[0],
    old = materials.concrete.optical;
  try {
    materials.concrete.optical = 0;
    for (const w of s.world.walls) w.material = "concrete";
    a.p = { x: 3, y: 0.5, z: 15 };
    a.heading = Math.PI;
    s.scan(a);
    assert(a.rays.every((r) => !r.hit));
    assert.equal([...a.memory.cells.values()].filter((v) => v === 1).length, 0);
  } finally {
    materials.concrete.optical = old;
  }
});
test("passive hearing is delayed, bounded, uncertain, wall attenuated and exclusive to the bat", () => {
  const s = new Simulation(defaults()),
    bat = s.agents[1];
  bat.p = { x: 5, y: 0.5, z: 11 };
  s.time = 1;
  s.sounds = [{ p: { x: 6, y: 0.5, z: 11 }, time: 1, heard: false }];
  s.hear(bat);
  assert.equal(bat.memory.landmarks.size, 0);
  s.time += 0.01;
  s.hear(bat);
  assert.equal(bat.state, "Investigate");
  assert.equal(bat.target!.y, 0.5);
  assert.notDeepEqual(bat.target, s.sounds[0].p);
  assert.equal(s.agents[0].memory.landmarks.size, 0);
  const count = bat.memory.landmarks.size;
  s.sounds = [{ p: { x: 27, y: 0.5, z: 27 }, time: 0, heard: false }];
  s.hear(bat);
  assert.equal(bat.memory.landmarks.size, count);
  s.world.tiles.set("3,5", { x: 6, z: 10, height: 1, material: "foam" });
  s.sounds = [{ p: { x: 9, y: 0.5, z: 11 }, time: 0, heard: false }];
  s.hear(bat);
  assert.equal(bat.memory.landmarks.size, count);
});
test("only a moving mouse emits new intermittent sound", () => {
  const s = new Simulation(defaults());
  s.mouse.moving = false;
  s.mouse.nextDecision = 20;
  s.updateMouse(0.05);
  assert.equal(s.sounds.length, 0);
  s.mouse.p = { x: 5, y: 0.5, z: 11 };
  s.mouse.goal = { x: 6, y: 0.5, z: 11 };
  s.mouse.moving = true;
  s.updateMouse(0.05);
  assert.equal(s.sounds.length, 1);
  assert(s.mouse.p.x > 5);
});
test("both agents plan within their own flat known map and cannot route through a remembered barrier", () => {
  const m = new Memory();
  for (let z = 0; z < 30; z++) m.cells.set(`4,0,${z}`, 1);
  const path = plan(m, { x: 3, y: 0.5, z: 3 }, { x: 8, y: 0.5, z: 3 });
  assert(path.length > 0);
  assert(path.every((p) => p.x < 4 && p.y === 0.5));
  assert.equal(m.cells.size, 30);
});
test("coverage and accuracy use floor cells, with unknown and wrong classifications separate", () => {
  const m = new Memory(),
    w = new World(1, "C");
  m.cells.set("0,0,0", 0);
  m.cells.set("3,0,3", 1);
  const r = m.metrics(w);
  assert.equal(VOXEL_COUNT, 900);
  assert.equal(r.falseFree, 1);
  assert.equal(r.falseOccupied, 1);
  assert.equal(r.unknown, 898);
  assert.equal(r.accuracy, 0);
});
test("fixed steps reproduce trajectories, map updates and planar collision constraints", () => {
  const a = new Simulation(defaults()),
    b = new Simulation(defaults());
  for (let n = 0; n < 200; n++) {
    a.step();
    b.step();
    for (const agent of a.agents) {
      assert.equal(agent.p.y, 0.5);
      assert(a.world.clear(agent.p));
    }
    assert.equal(a.mouse.p.y, 0.5);
    assert(a.world.clear(a.mouse.p, 0.16));
  }
  assert.deepEqual(a.export(), b.export());
  for (const agent of a.agents) {
    assert(agent.distance > 1);
    assert(agent.memory.cells.size > 10);
  }
  assert.notDeepEqual(
    [...a.agents[0].memory.cells],
    [...a.agents[1].memory.cells],
  );
});
test("complete planar experiments preserve collisions and report real capture or timeout", () => {
  let captures = 0;
  for (const environment of ["A", "B", "C"] as const) {
    const s = new Simulation({ ...defaults(), environment });
    for (let n = 0; n < 6001 && !s.winner; n++) {
      s.step();
      if (n % 50 === 0) {
        for (const a of s.agents) {
          assert.equal(a.p.y, 0.5);
          assert(s.world.clear(a.p));
        }
        assert(s.world.clear(s.mouse.p, 0.16));
      }
    }
    assert(s.winner);
    for (const a of s.agents) {
      assert(a.distance > 1);
      const m = s.metrics(a);
      assert(m.coverage > 0 && m.coverage <= 100);
      assert(m.accuracy > 50 && m.accuracy <= 100);
    }
    if (s.winner === "Incomplete") assert(s.time >= s.config.timeLimit);
    else {
      captures++;
      const a = s.agents.find((a) => a.captureTime !== null)!;
      assert(dist(a.p, s.mouse.p) <= s.config.captureRadius);
      assert(s.world.line(a.p, s.mouse.p));
    }
  }
  assert(captures > 0);
});
test("capture requires physically accessible proximity and timeout remains incomplete", () => {
  const s = new Simulation(defaults());
  s.mouse.p = { x: 5, y: 0.5, z: 11 };
  s.mouse.moving = false;
  s.mouse.nextDecision = 100;
  s.agents[0].p = { ...s.mouse.p };
  s.agents[1].p = { x: 3, y: 0.5, z: 11 };
  s.step();
  assert.equal(s.winner, "Human");
  assert(s.agents[0].captureTime !== null);
  assert(!s.running);
  const t = new Simulation({ ...defaults(), timeLimit: 0.05 });
  t.step();
  assert.equal(t.winner, "Incomplete");
});
