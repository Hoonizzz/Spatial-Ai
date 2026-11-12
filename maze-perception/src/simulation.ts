import {
  World,
  RNG,
  dist,
  key,
  materials,
  type V,
  type Environment,
} from "./world";
import { Memory } from "./mapping";
import { plan } from "./navigation";
export type Config = {
  seed: number;
  environment: Environment;
  lidarRange: number;
  echoRange: number;
  soundRange: number;
  lidarInterval: number;
  echoInterval: number;
  lidarNoise: number;
  echoNoise: number;
  lidarFov: number;
  lidarVertical: number;
  echoFov: number;
  echoVertical: number;
  echoThreshold: number;
  humanSpeed: number;
  batSpeed: number;
  mouseSpeed: number;
  captureRadius: number;
  timeLimit: number;
};
export const defaults = (): Config => ({
  seed: 2026,
  environment: "C",
  lidarRange: 12,
  echoRange: 8,
  soundRange: 6,
  lidarInterval: 0.2,
  echoInterval: 0.5,
  lidarNoise: 0.025,
  echoNoise: 0.16,
  lidarFov: 120,
  lidarVertical: 60,
  echoFov: 100,
  echoVertical: 80,
  echoThreshold: 0.09,
  humanSpeed: 1.8,
  batSpeed: 2.2,
  mouseSpeed: 1.2,
  captureRadius: 0.8,
  timeLimit: 300,
});
export type Agent = {
  kind: "Human" | "Bat";
  p: V;
  heading: number;
  memory: Memory;
  path: V[];
  state: string;
  distance: number;
  collisions: number;
  failed: number;
  detections: number;
  nextScan: number;
  nextPlan: number;
  scanTime: number;
  rays: { a: V; b: V; hit: boolean }[];
  target?: V;
  targetUntil: number;
  trail: V[];
  rng: RNG;
  captureTime: number | null;
};
export type Sound = { p: V; time: number; heard: boolean };
export class Simulation {
  world: World;
  agents: Agent[];
  mouse: {
    p: V;
    moving: boolean;
    heading: number;
    goal: V;
    nextDecision: number;
    trail: V[];
  };
  mouseRng: RNG;
  time = 0;
  winner: string | null = null;
  running = false;
  sounds: Sound[] = [];
  nextSound = 0;
  freeCells = 0;
  constructor(public config: Config) {
    this.world = new World(config.seed, config.environment);
    this.mouseRng = new RNG(config.seed ^ 0xabcdef);
    this.agents = (["Human", "Bat"] as const).map((kind, i) => ({
      kind,
      p: { x: 3, y: i ? 2.5 : 0.55, z: 11 },
      heading: 0,
      memory: new Memory(),
      path: [],
      state: "Explore",
      distance: 0,
      collisions: 0,
      failed: 0,
      detections: 0,
      nextScan: 0,
      nextPlan: 0,
      scanTime: -10,
      rays: [],
      targetUntil: 0,
      trail: [],
      rng: new RNG(config.seed ^ ((i + 7) * 12345)),
      captureTime: null,
    }));
    this.mouse = {
      p: { x: 25, y: 0.35, z: 25 },
      moving: true,
      heading: 0,
      goal: { x: 25, y: 0.35, z: 25 },
      nextDecision: 0,
      trail: [],
    };
    // Select a valid deterministic spawn, independently of environment materials.
    const sites = [...this.world.open]
      .map((s) => s.split(",").map(Number))
      .filter(([x, z]) => x > 8 && z > 8);
    const [mx, mz] = this.mouseRng.pick(sites);
    this.mouse.p = { x: mx * 2 + 1, y: 0.35, z: mz * 2 + 1 };
    this.mouse.goal = { ...this.mouse.p };
    for (let x = 0; x < 30; x++)
      for (let y = 0; y < 12; y++)
        for (let z = 0; z < 30; z++)
          if (!this.world.solid({ x: x + 0.5, y: y + 0.5, z: z + 0.5 }))
            this.freeCells++;
  }
  scan(a: Agent) {
    const c = this.config,
      human = a.kind === "Human",
      range = human ? c.lidarRange : c.echoRange,
      hfov = ((human ? c.lidarFov : c.echoFov) * Math.PI) / 180,
      vfov = ((human ? c.lidarVertical : c.echoVertical) * Math.PI) / 180;
    a.memory.current.clear();
    a.rays = [];
    a.scanTime = this.time;
    const directions: V[] = [];
    for (let h = 0; h < 17; h++)
      for (let v = 0; v < 7; v++) {
        const yaw = a.heading + (h / 16 - 0.5) * hfov,
          pitch = (v / 6 - 0.5) * vfov;
        directions.push({
          x: Math.cos(yaw) * Math.cos(pitch),
          y: Math.sin(pitch),
          z: Math.sin(yaw) * Math.cos(pitch),
        });
      }
    // Short downward rays supply observed support heights, not hidden navigation data.
    directions.push(
      { x: 0, y: -1, z: 0 },
      { x: 0.6, y: -0.8, z: 0 },
      { x: -0.6, y: -0.8, z: 0 },
      { x: 0, y: -0.8, z: 0.6 },
      { x: 0, y: -0.8, z: -0.6 },
    );
    for (const direction of directions) {
      const hit = this.world.ray(a.p, direction, range);
      const end = hit?.p ?? {
        x: a.p.x + direction.x * range,
        y: a.p.y + direction.y * range,
        z: a.p.z + direction.z * range,
      };
      if (hit) {
        const m = materials[hit.material],
          falloff = 1 - 0.35 * (hit.d / range) ** 2,
          incidence =
            0.65 +
            0.35 *
              Math.max(
                Math.abs(direction.x),
                Math.abs(direction.z),
                Math.abs(direction.y),
              );
        const strength =
          (m.reflection * (1 - m.absorption) * incidence) /
          (1 + (hit.d / 4) ** 2);
        const chance = human
          ? m.optical * falloff * incidence
          : strength >= c.echoThreshold
            ? Math.min(0.98, strength / (c.echoThreshold * 2))
            : strength * 0.35;
        if (a.rng.next() > chance) {
          a.failed++;
          a.rays.push({ a: { ...a.p }, b: end, hit: false });
          continue;
        }
        const noise =
          (a.rng.next() * 2 - 1) *
          (human ? c.lidarNoise : c.echoNoise) *
          (hit.material === "metal" ? 1.7 : 1);
        const d = Math.max(0.1, Math.min(range, hit.d + noise));
        const measured = {
          x: a.p.x + direction.x * d,
          y: a.p.y + direction.y * d,
          z: a.p.z + direction.z * d,
        };
        a.memory.observe(a.p, measured, true);
        a.rays.push({ a: { ...a.p }, b: measured, hit: true });
      } else {
        a.memory.observe(a.p, end, false);
        a.rays.push({ a: { ...a.p }, b: end, hit: false });
      }
    }
    const d = dist(a.p, this.mouse.p),
      yaw = Math.atan2(this.mouse.p.z - a.p.z, this.mouse.p.x - a.p.x),
      angle = Math.abs(
        Math.atan2(Math.sin(yaw - a.heading), Math.cos(yaw - a.heading)),
      ),
      pitch = Math.abs(
        Math.atan2(
          this.mouse.p.y - a.p.y,
          Math.hypot(this.mouse.p.x - a.p.x, this.mouse.p.z - a.p.z),
        ),
      );
    const targetStrength = 0.65 / (1 + (d / 4) ** 2),
      targetChance = human
        ? 0.95 * (1 - 0.3 * (d / range) ** 2)
        : targetStrength >= c.echoThreshold
          ? Math.min(0.9, targetStrength / (2 * c.echoThreshold))
          : 0;
    if (
      d <= range &&
      angle <= hfov / 2 &&
      pitch <= vfov / 2 &&
      this.world.line(a.p, this.mouse.p) &&
      a.rng.next() < targetChance
    ) {
      a.target = { ...this.mouse.p };
      a.targetUntil = this.time + 3;
      a.state = "Pursue";
      a.detections++;
      a.memory.landmark(this.mouse.p, "mouse sighting");
      a.nextPlan = 0;
    }
    a.nextScan = this.time + (human ? c.lidarInterval : c.echoInterval);
  }
  updateMouse(dt: number) {
    const m = this.mouse;
    if (this.time >= m.nextDecision || dist(m.p, m.goal) < 0.12) {
      const pause = this.mouseRng.next() < 0.18;
      m.moving = !pause;
      m.nextDecision =
        this.time +
        (pause
          ? 0.5 + this.mouseRng.next() * 1.5
          : 2 + this.mouseRng.next() * 3);
      if (!pause) {
        const candidates = [
          [2, 0],
          [-2, 0],
          [0, 2],
          [0, -2],
        ]
          .map(([x, z]) => ({ x: m.p.x + x, y: 0, z: m.p.z + z }))
          .map((p) => ({ ...p, y: this.world.surface(p.x, p.z) + 0.35 }))
          .filter(
            (p) =>
              Math.abs(p.y - m.p.y) < 1.5 &&
              this.world.clear(p, 0.16) &&
              this.world.line(m.p, p),
          );
        candidates.sort(
          (a, b) =>
            Math.min(...this.agents.map((v) => dist(v.p, b))) -
            Math.min(...this.agents.map((v) => dist(v.p, a))),
        );
        m.goal = candidates.length
          ? this.mouseRng.next() < 0.65
            ? candidates[0]
            : this.mouseRng.pick(candidates)
          : { ...m.p };
      }
    }
    if (m.moving) {
      const d = dist(m.p, m.goal),
        s = Math.min(d, this.config.mouseSpeed * dt);
      if (d > 0.001) {
        const p = {
          x: m.p.x + ((m.goal.x - m.p.x) * s) / d,
          y: m.p.y,
          z: m.p.z + ((m.goal.z - m.p.z) * s) / d,
        };
        p.y = this.world.surface(p.x, p.z) + 0.35;
        if (this.world.clear(p, 0.16) && Math.abs(p.y - m.p.y) < 0.4) {
          m.heading = Math.atan2(p.z - m.p.z, p.x - m.p.x);
          m.p = p;
        } else {
          m.moving = false;
          m.nextDecision = 0;
        }
      } else m.moving = false;
    }
    if (m.moving && this.time >= this.nextSound) {
      this.sounds.push({ p: { ...m.p }, time: this.time, heard: false });
      this.nextSound = this.time + 0.35;
    }
    this.sounds = this.sounds.filter((s) => this.time - s.time < 0.8);
    if (Math.floor(this.time * 5) !== Math.floor((this.time - dt) * 5)) {
      m.trail.push({ ...m.p });
      if (m.trail.length > 1500) m.trail.shift();
    }
  }
  hear(a: Agent) {
    for (const sound of this.sounds) {
      const d = dist(a.p, sound.p);
      if (
        sound.heard ||
        d > this.config.soundRange ||
        this.time - sound.time < d / 343
      )
        continue;
      sound.heard = true;
      let strength = 1 / (1 + (d / 3) ** 2);
      const crossed = new Set<string>();
      for (let t = 0.25; t < d; t += 0.25) {
        const p = {
          x: a.p.x + ((sound.p.x - a.p.x) * t) / d,
          y: a.p.y + ((sound.p.y - a.p.y) * t) / d,
          z: a.p.z + ((sound.p.z - a.p.z) * t) / d,
        };
        const mat = this.world.solid(p),
          tile = `${Math.floor(p.x / 2)},${Math.floor(p.z / 2)}`;
        if (mat && !crossed.has(tile)) {
          crossed.add(tile);
          strength *= (1 - materials[mat].absorption) * 0.35;
        }
      }
      if (strength < 0.07) continue;
      const spread = 0.7 + (1 - strength) * 2;
      const p = {
        x: Math.max(
          1,
          Math.min(29, sound.p.x + (a.rng.next() - 0.5) * spread * 2),
        ),
        y: Math.max(1, sound.p.y + (a.rng.next() - 0.5) * spread),
        z: Math.max(
          1,
          Math.min(29, sound.p.z + (a.rng.next() - 0.5) * spread * 2),
        ),
      };
      a.memory.landmark(p, "sound cue");
      if (a.state !== "Pursue") {
        a.target = p;
        a.targetUntil = this.time + 4;
        a.state = "Investigate";
        a.nextPlan = 0;
      }
    }
  }
  step(dt = 0.05) {
    if (this.winner) return;
    this.time += dt;
    this.updateMouse(dt);
    for (const a of this.agents) {
      if (this.time >= a.nextScan) this.scan(a);
      if (a.kind === "Bat") this.hear(a);
      if (a.target && this.time > a.targetUntil) {
        a.target = undefined;
        a.state = "Replan";
        a.nextPlan = 0;
      }
      if (
        this.time >= a.nextPlan ||
        !a.path.length ||
        a.memory.blocked(a.path[0])
      ) {
        a.path = plan(a.memory, a.p, a.kind === "Bat", a.target);
        a.nextPlan = this.time + 1;
        if (!a.target) a.state = "Explore";
        const neighbors = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].map(([x, z]) => ({ x: a.p.x + x, y: a.p.y, z: a.p.z + z }));
        const free = neighbors.filter(
          (p) => a.memory.cells.get(key(p)) === 0,
        ).length;
        const blocked = neighbors.filter((p) => a.memory.blocked(p)).length;
        if (free === 1 && blocked === 3) a.memory.landmark(a.p, "dead end");
        else if (free >= 3) a.memory.landmark(a.p, "intersection");
      }
      const goal = a.path[0];
      if (goal) {
        const d = dist(a.p, goal);
        if (d < 0.12) a.path.shift();
        else {
          const speed =
              a.kind === "Human"
                ? this.config.humanSpeed
                : this.config.batSpeed,
            s = Math.min(d, speed * dt),
            p = {
              x: a.p.x + ((goal.x - a.p.x) * s) / d,
              y: a.p.y + ((goal.y - a.p.y) * s) / d,
              z: a.p.z + ((goal.z - a.p.z) * s) / d,
            };
          a.heading = Math.atan2(goal.z - a.p.z, goal.x - a.p.x);
          // Only the physical collision resolver can consult ground truth.
          if (a.kind === "Human") {
            p.y = this.world.surface(p.x, p.z) + 0.55;
          }
          if (
            this.world.clear(p) &&
            Math.abs(p.y - a.p.y) < (a.kind === "Human" ? 0.3 : 1)
          ) {
            const moved = dist(a.p, p);
            a.distance += moved;
            if (Math.abs(p.y - a.p.y) > 0.015)
              a.memory.landmark(p, "vertical connection");
            a.p = p;
          } else {
            a.collisions++;
            a.state = "Replan";
            a.memory.forbidden.add(key(goal));
            for (const dx of [-0.22, 0.22])
              for (const dy of [-0.22, 0.22])
                for (const dz of [-0.22, 0.22]) {
                  const contact = { x: p.x + dx, y: p.y + dy, z: p.z + dz };
                  if (this.world.solid(contact))
                    a.memory.cells.set(key(contact), 1);
                }
            a.memory.landmark(p, "contact");
            a.path = [];
            a.heading += Math.PI / 2;
            a.nextPlan = 0;
          }
        }
      } else a.heading += dt * 1.7;
      const k = key(a.p);
      a.memory.visits.set(k, (a.memory.visits.get(k) ?? 0) + dt);
      if (Math.floor(this.time * 5) !== Math.floor((this.time - dt) * 5)) {
        a.trail.push({ ...a.p });
        if (a.trail.length > 1500) a.trail.shift();
      }
    }
    const captors = this.agents.filter(
      (a) =>
        dist(a.p, this.mouse.p) <= this.config.captureRadius &&
        this.world.line(a.p, this.mouse.p),
    );
    if (captors.length) {
      captors.sort((a, b) => dist(a.p, this.mouse.p) - dist(b.p, this.mouse.p));
      this.winner =
        captors.length > 1 &&
        Math.abs(
          dist(captors[0].p, this.mouse.p) - dist(captors[1].p, this.mouse.p),
        ) < 1e-9
          ? "Tie"
          : captors[0].kind;
      for (const a of captors) {
        a.captureTime = this.time;
        a.state = "Capture";
      }
      this.running = false;
    } else if (this.time >= this.config.timeLimit) {
      this.winner = "Incomplete";
      this.running = false;
    }
  }
  metrics(a: Agent) {
    const m = a.memory.metrics(this.world);
    return {
      ...m,
      coverage: (100 * m.observedFree) / this.freeCells,
      distance: a.distance,
      collisions: a.collisions,
      failed: a.failed,
      detections: a.detections,
      landmarks: a.memory.landmarks.size,
      captureTime: a.captureTime,
    };
  }
  export() {
    return {
      config: this.config,
      time: this.time,
      winner: this.winner,
      mouse: this.mouse,
      agents: this.agents.map((a) => ({
        kind: a.kind,
        position: a.p,
        metrics: this.metrics(a),
        map: [...a.memory.cells],
        landmarks: [...a.memory.landmarks.values()],
        trail: a.trail,
      })),
    };
  }
}
