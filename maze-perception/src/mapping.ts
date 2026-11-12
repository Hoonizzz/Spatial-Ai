import { MAZE_HEIGHT, VOXEL_COUNT, center, key, type V, World } from "./world";
export class Memory {
  cells = new Map<string, 0 | 1>();
  current = new Set<string>();
  visits = new Map<string, number>();
  landmarks = new Map<string, { p: V; kind: string }>();
  floors = new Map<string, number>();
  forbidden = new Set<string>();
  observe(origin: V, end: V, occupied: boolean) {
    const d = Math.hypot(end.x - origin.x, end.y - origin.y, end.z - origin.z);
    for (let t = 0; t < d - 0.2; t += 0.35) {
      const p = {
        x: origin.x + ((end.x - origin.x) * t) / d,
        y: origin.y + ((end.y - origin.y) * t) / d,
        z: origin.z + ((end.z - origin.z) * t) / d,
      };
      if (
        p.x < 0 ||
        p.z < 0 ||
        p.y < 0 ||
        p.x >= 30 ||
        p.z >= 30 ||
        p.y >= MAZE_HEIGHT
      )
        continue;
      const k = key(p);
      this.cells.set(k, 0);
      this.current.add(k);
    }
    if (
      occupied &&
      end.x >= 0 &&
      end.z >= 0 &&
      end.y >= 0 &&
      end.x < 30 &&
      end.z < 30 &&
      end.y < MAZE_HEIGHT
    ) {
      const k = key(end);
      this.cells.set(k, 1);
      this.current.add(k);
      if (end.y < origin.y - 0.25)
        this.floors.set(`${Math.floor(end.x)},${Math.floor(end.z)}`, end.y);
    }
  }
  landmark(p: V, kind: string) {
    const k = `${kind}:${Math.floor(p.x / 2)},${Math.floor(p.y / 2)},${Math.floor(p.z / 2)}`;
    this.landmarks.set(k, { p: { ...p }, kind });
  }
  blocked(p: V) {
    return this.cells.get(key(p)) === 1 || this.forbidden.has(key(p));
  }
  metrics(world: World) {
    let correct = 0,
      falseOccupied = 0,
      falseFree = 0,
      observedFree = 0;
    for (const [k, v] of this.cells) {
      const actual = world.solid(center(k)) !== null;
      if (actual === (v === 1)) correct++;
      else if (v === 1) falseOccupied++;
      else falseFree++;
      if (!actual && v === 0) observedFree++;
    }
    return {
      accuracy: this.cells.size ? (100 * correct) / this.cells.size : 0,
      correct,
      falseOccupied,
      falseFree,
      unknown: VOXEL_COUNT - this.cells.size,
      observedFree,
    };
  }
}
