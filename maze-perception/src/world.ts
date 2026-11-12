export const MAZE_HEIGHT = 36;
export const VOXEL_COUNT = 30 * 30 * MAZE_HEIGHT;
export type V = { x: number; y: number; z: number };
export type Material = "foam" | "glass" | "concrete" | "metal";
export type Environment = "A" | "B" | "C";
export const materials: Record<
  Material,
  { optical: number; reflection: number; absorption: number; color: number }
> = {
  foam: { optical: 0.95, reflection: 0.15, absorption: 0.85, color: 0xd68c91 },
  glass: { optical: 0.3, reflection: 0.85, absorption: 0.12, color: 0x8fd5e8 },
  concrete: {
    optical: 0.95,
    reflection: 0.8,
    absorption: 0.2,
    color: 0xf2dbb5,
  },
  metal: { optical: 0.85, reflection: 0.9, absorption: 0.08, color: 0x9bafc9 },
};
export class RNG {
  constructor(public state: number) {}
  next() {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  pick<T>(a: T[]) {
    return a[Math.floor(this.next() * a.length)];
  }
}
export const dist = (a: V, b: V) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const key = (p: V) =>
  `${Math.floor(p.x)},${Math.floor(p.y)},${Math.floor(p.z)}`;
export const center = (s: string): V => {
  const [x, y, z] = s.split(",").map(Number);
  return { x: x + 0.5, y: y + 0.5, z: z + 0.5 };
};
export type Wall = { x: number; z: number; height: number; material: Material };
export class World {
  walls: Wall[] = [];
  tiles = new Map<string, Wall>();
  open = new Set<string>();
  constructor(
    public seed: number,
    public environment: Environment,
  ) {
    const r = new RNG(seed),
      seen = new Set<string>(),
      stack: [[number, number]] = [[1, 1]];
    seen.add("1,1");
    this.open.add("1,1");
    while (stack.length) {
      const [x, z] = stack[stack.length - 1];
      const next = [
        [2, 0],
        [-2, 0],
        [0, 2],
        [0, -2],
      ]
        .map(([dx, dz]) => [x + dx, z + dz])
        .filter(
          ([a, b]) =>
            a > 0 && b > 0 && a < 14 && b < 14 && !seen.has(`${a},${b}`),
        );
      if (!next.length) {
        stack.pop();
        continue;
      }
      const [a, b] = r.pick(next);
      seen.add(`${a},${b}`);
      this.open.add(`${a},${b}`);
      this.open.add(`${(a + x) / 2},${(b + z) / 2}`);
      stack.push([a, b]);
    }
    // A connected chamber contains a physical ramp and raised deck.
    for (let x = 1; x <= 6; x++)
      for (let z = 1; z <= 5; z++) this.open.add(`${x},${z}`);
    for (let x = 0; x < 15; x++)
      for (let z = 0; z < 15; z++)
        if (!this.open.has(`${x},${z}`)) {
          const height =
            x === 0 || z === 0 || x === 14 || z === 14
              ? MAZE_HEIGHT
              : r.pick([6, 12, 18, 24, 30]);
          const w: Wall = { x: x * 2, z: z * 2, height, material: "concrete" };
          this.walls.push(w);
          this.tiles.set(`${x},${z}`, w);
        }
    this.assign(environment);
  }
  assign(env: Environment) {
    this.environment = env;
    const r = new RNG(this.seed ^ 0x1234567);
    for (const w of this.walls) {
      const n = r.next();
      w.material =
        env === "A"
          ? n < 0.7
            ? "foam"
            : n < 0.8
              ? "glass"
              : n < 0.95
                ? "concrete"
                : "metal"
          : env === "B"
            ? n < 0.1
              ? "foam"
              : n < 0.8
                ? "glass"
                : n < 0.95
                  ? "concrete"
                  : "metal"
            : n < 0.1
              ? "foam"
              : n < 0.2
                ? "glass"
                : n < 0.95
                  ? "concrete"
                  : "metal";
    }
  }
  surface(x: number, z: number) {
    if (x >= 3 && x < 9 && z >= 3 && z < 5) return ((x - 3) * 2) / 3;
    if (x >= 9 && x < 13 && z >= 3 && z < 9) return 4;
    return 0;
  }
  solid(p: V): Material | null {
    if (
      p.x < 0 ||
      p.x >= 30 ||
      p.z < 0 ||
      p.z >= 30 ||
      p.y < 0 ||
      p.y >= MAZE_HEIGHT
    )
      return "concrete";
    const wall = this.tiles.get(
      `${Math.floor(p.x / 2)},${Math.floor(p.z / 2)}`,
    );
    if (wall && p.y < wall.height) return wall.material;
    if (
      p.x >= 3 &&
      p.x < 9 &&
      p.z >= 3 &&
      p.z < 5 &&
      p.y < this.surface(p.x, p.z)
    )
      return "concrete";
    if (p.x >= 9 && p.x < 13 && p.z >= 3 && p.z < 9 && p.y >= 3.7 && p.y < 4)
      return "metal";
    return null;
  }
  clear(p: V, r = 0.22) {
    for (const dx of [-r, r])
      for (const dz of [-r, r])
        for (const dy of [-r, r])
          if (this.solid({ x: p.x + dx, y: p.y + dy, z: p.z + dz }))
            return false;
    return true;
  }
  ray(origin: V, direction: V, range: number) {
    for (let d = 0.15; d <= range; d += 0.16) {
      const p = {
        x: origin.x + direction.x * d,
        y: origin.y + direction.y * d,
        z: origin.z + direction.z * d,
      };
      const material = this.solid(p);
      if (material) return { p, d, material };
    }
    return null;
  }
  line(a: V, b: V) {
    const d = dist(a, b);
    if (d === 0) return true;
    return !this.ray(
      a,
      { x: (b.x - a.x) / d, y: (b.y - a.y) / d, z: (b.z - a.z) / d },
      Math.max(0, d - 0.18),
    );
  }
}
