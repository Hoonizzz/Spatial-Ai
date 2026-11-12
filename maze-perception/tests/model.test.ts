import test from "node:test";
import assert from "node:assert/strict";
import { Simulation, defaults } from "../src/simulation";
import { World, dist, center, key, materials } from "../src/world";
import { Memory } from "../src/mapping";
import { plan } from "../src/navigation";

test("complete A/B/C experiments retain physical invariants and record genuine terminal outcomes", () => {
  let captures = 0;
  let elevatedHuman = false;
  for (const environment of ["A", "B", "C"] as const) {
    const s = new Simulation({ ...defaults(), environment });
    for (let n = 0; n < 6001 && !s.winner; n++) {
      s.step();
      if (s.agents[0].p.y > 4) elevatedHuman = true;
      if (n % 50 === 0) {
        for (const a of s.agents) assert(s.world.clear(a.p));
        assert(s.world.clear(s.mouse.p, 0.16));
      }
    }
    assert(s.winner);
    assert(!s.running);
    for (const a of s.agents) {
      const m = s.metrics(a);
      assert(a.distance > 20);
      assert(m.coverage > 5 && m.coverage <= 100);
      assert(m.accuracy > 50 && m.accuracy <= 100);
    }
    if (s.winner === "Incomplete") assert(s.time >= s.config.timeLimit);
    else {
      captures++;
      const a = s.agents.find((a) => a.kind === s.winner)!;
      assert(a.captureTime !== null);
      assert(dist(a.p, s.mouse.p) <= s.config.captureRadius);
      assert(s.world.line(a.p, s.mouse.p));
    }
  }
  assert(
    captures > 0,
    "default experiments must demonstrate actual mouse capture",
  );
  assert(
    elevatedHuman,
    "human must actually reach the raised deck through its ramp",
  );
});

test("environments share geometry, start positions and mouse random stream; materials differ", () => {
  const sims = (["A", "B", "C"] as const).map(
    (environment) => new Simulation({ ...defaults(), environment }),
  );
  const geometry = (w: World) =>
    w.walls.map(({ x, z, height }) => [x, z, height]);
  assert.deepEqual(geometry(sims[0].world), geometry(sims[1].world));
  assert.deepEqual(geometry(sims[1].world), geometry(sims[2].world));
  assert.notDeepEqual(
    sims[0].world.walls.map((w) => w.material),
    sims[1].world.walls.map((w) => w.material),
  );
  for (const s of sims) {
    assert.deepEqual(
      s.agents.map((a) => a.p),
      sims[0].agents.map((a) => a.p),
    );
    assert.deepEqual(s.mouse.p, sims[0].mouse.p);
  }
  for (let n = 0; n < 200; n++)
    for (const s of sims) {
      s.time += 0.05;
      s.updateMouse(0.05);
    }
  assert.deepEqual(sims[0].mouse, sims[1].mouse);
  assert.deepEqual(sims[1].mouse, sims[2].mouse);
});
test("generated ground corridors are connected and ramp reaches a raised platform", () => {
  for (const seed of [1, 2026, 99]) {
    const w = new World(seed, "C"),
      open = [...w.open],
      seen = new Set([open[0]]),
      queue = [open[0]];
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
    assert.equal(w.surface(3, 4), 0);
    assert(w.surface(8.9, 4) > 3.9);
    assert.equal(w.surface(10, 4), 4);
    assert(w.solid({ x: 10, y: 3.8, z: 4 }));
    assert(w.clear({ x: 10, y: 4.55, z: 4 }));
  }
});
test("finite sensing bounds all observed voxels and preserves memory beyond current range", () => {
  const s = new Simulation({ ...defaults(), lidarRange: 3, echoRange: 3 });
  for (const a of s.agents) {
    s.scan(a);
    assert(a.memory.cells.size > 0);
    for (const k of a.memory.cells.keys())
      assert(dist(a.p, center(k)) <= 3 + Math.sqrt(3));
    for (const ray of a.rays) assert(dist(ray.a, ray.b) <= 3.001);
    const old = [...a.memory.cells.keys()];
    a.p = { x: 25, y: 5, z: 25 };
    s.scan(a);
    assert(old.every((k) => a.memory.cells.has(k)));
    assert(old.some((k) => !a.memory.current.has(k)));
  }
  assert.notEqual(s.agents[0].memory, s.agents[1].memory);
});
test("material coefficients change actual sensor returns; missed rays do not reveal obstacles", () => {
  const count = (
    kind: "Human" | "Bat",
    material: "glass" | "foam" | "concrete",
  ) => {
    const s = new Simulation(defaults());
    const a = s.agents[kind === "Human" ? 0 : 1];
    a.p = { x: 3, y: 1, z: 3 };
    a.heading = Math.PI;
    for (const w of s.world.walls) w.material = material;
    let hits = 0;
    for (let n = 0; n < 30; n++) {
      s.scan(a);
      hits += a.rays.filter((r) => r.hit).length;
    }
    return hits;
  };
  assert(count("Human", "concrete") > count("Human", "glass") * 1.5);
  assert(count("Bat", "concrete") > count("Bat", "foam") * 1.5);
  const s = new Simulation(defaults()),
    a = s.agents[0];
  a.p = { x: 3, y: 1, z: 15 };
  a.heading = Math.PI;
  const previous = materials.concrete.optical;
  try {
    materials.concrete.optical = 0;
    for (const w of s.world.walls) w.material = "concrete";
    s.scan(a);
    for (const ray of a.rays.filter((r) =>
      s.world.ray(
        r.a,
        {
          x: (r.b.x - r.a.x) / dist(r.a, r.b),
          y: (r.b.y - r.a.y) / dist(r.a, r.b),
          z: (r.b.z - r.a.z) / dist(r.a, r.b),
        },
        dist(r.a, r.b),
      ),
    ))
      assert(!ray.hit);
  } finally {
    materials.concrete.optical = previous;
  }
});
test("passive hearing is range limited, uncertain, delayed and attenuated by walls", () => {
  const s = new Simulation(defaults()),
    bat = s.agents[1];
  bat.p = { x: 5, y: 1, z: 11 };
  s.time = 1;
  s.sounds = [{ p: { x: 6, y: 1, z: 11 }, time: 1, heard: false }];
  s.hear(bat);
  assert.equal(bat.memory.landmarks.size, 0);
  s.time += 0.01;
  s.hear(bat);
  assert.equal(bat.state, "Investigate");
  assert.notDeepEqual(bat.target, s.sounds[0].p);
  assert.equal(s.agents[0].memory.landmarks.size, 0);
  const previous = bat.memory.landmarks.size;
  s.sounds = [{ p: { x: 27, y: 1, z: 27 }, time: 0, heard: false }];
  s.hear(bat);
  assert.equal(bat.memory.landmarks.size, previous);
  bat.p = { x: 5, y: 1, z: 11 };
  s.world.tiles.set("3,5", { x: 6, z: 10, height: 12, material: "foam" });
  s.sounds = [{ p: { x: 9, y: 1, z: 11 }, time: 0, heard: false }];
  s.hear(bat);
  assert.equal(bat.memory.landmarks.size, previous);
});
test("stationary mouse emits no new sound; moving mouse emits intermittent events", () => {
  const s = new Simulation(defaults());
  s.mouse.moving = false;
  s.mouse.nextDecision = 20;
  s.updateMouse(0.05);
  assert.equal(s.sounds.length, 0);
  s.mouse.p = { x: 5, y: 0.35, z: 11 };
  s.mouse.goal = { x: 6, y: 0.35, z: 11 };
  s.mouse.moving = true;
  s.updateMouse(0.05);
  assert.equal(s.sounds.length, 1);
  assert(dist(s.mouse.p, { x: 5, y: 0.35, z: 11 }) > 0);
});
test("navigation uses only its own map, obeys known barriers, and supports vertical flight", () => {
  const m = new Memory(),
    start = { x: 3, y: 1, z: 3 };
  for (let z = 0; z < 30; z++)
    for (let y = 0; y < 12; y++) m.cells.set(`4,${y},${z}`, 1);
  const path = plan(m, start, false, { x: 8, y: 1, z: 3 });
  assert(path.every((p) => p.x < 4));
  const flight = plan(new Memory(), start, true, { x: 3, y: 9, z: 3 });
  assert(flight.some((p) => p.y > 3));
  assert.equal(m.cells.size, 360);
});
test("accuracy is separate from coverage and reports classification errors", () => {
  const m = new Memory(),
    w = new World(1, "C");
  m.cells.set("0,0,0", 0);
  m.cells.set("3,8,3", 1);
  const result = m.metrics(w);
  assert.equal(result.falseFree, 1);
  assert.equal(result.falseOccupied, 1);
  assert.equal(result.unknown, 10798);
  assert.equal(result.accuracy, 0);
});
test("fixed step run is reproducible, agents move, maps grow and physical bodies stay clear", () => {
  const a = new Simulation(defaults()),
    b = new Simulation(defaults());
  for (let n = 0; n < 160; n++) {
    a.step();
    b.step();
    for (const agent of a.agents) assert(a.world.clear(agent.p));
    assert(a.world.clear(a.mouse.p, 0.16));
  }
  assert.deepEqual(a.export(), b.export());
  for (const agent of a.agents) {
    assert(agent.distance > 1);
    assert(agent.memory.cells.size > 50);
    assert(agent.trail.length > 0);
  }
  assert(a.agents[1].p.y !== 2.5);
  assert.notDeepEqual(
    [...a.agents[0].memory.cells],
    [...a.agents[1].memory.cells],
  );
});
test("capture needs accessible 3D distance and time limit marks incomplete", () => {
  const s = new Simulation(defaults());
  s.mouse.moving = false;
  s.mouse.nextDecision = 100;
  s.mouse.p = { x: 5, y: 0.35, z: 11 };
  s.agents[0].p = { x: 5, y: 0.55, z: 11 };
  s.step();
  assert.equal(s.winner, "Human");
  assert.equal(s.running, false);
  assert(s.agents[0].captureTime !== null);
  const t = new Simulation({ ...defaults(), timeLimit: 0.05 });
  t.step();
  assert.equal(t.winner, "Incomplete");
  const u = new Simulation(defaults());
  u.mouse.p = { x: 5, y: 0.35, z: 11 };
  u.mouse.moving = false;
  u.mouse.nextDecision = 100;
  u.agents[1].p = { x: 5, y: 6, z: 11 };
  u.step();
  assert.equal(u.winner, null);
});
