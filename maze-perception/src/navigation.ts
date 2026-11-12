import { Memory } from "./mapping";
import { dist, key, type V } from "./world";
// Planner deliberately receives memory only, never the physical world.
export function plan(
  memory: Memory,
  start: V,
  flying: boolean,
  target?: V,
): V[] {
  const step = flying ? 2 : 1;
  const snap = (p: V): V => ({
    x: Math.floor(p.x / step) * step + step / 2,
    y: flying ? Math.floor(p.y / 2) * 2 + 1 : p.y,
    z: Math.floor(p.z / step) * step + step / 2,
  });
  const root = snap(start),
    id = (p: V) => (flying ? key(p) : `${Math.floor(p.x)},${Math.floor(p.z)}`);
  const nodes = [root],
    parents = new Map<string, string>(),
    positions = new Map<string, V>([[id(root), root]]),
    depth = new Map([[id(root), 0]]);
  let best = root,
    bestScore = -Infinity;
  for (let i = 0; i < nodes.length && i < 2400; i++) {
    const p = nodes[i],
      k = id(p),
      d = depth.get(k)!;
    const unknown = memory.cells.has(key(p)) ? 0 : 1;
    const visits = memory.visits.get(key(p)) ?? 0;
    let score = target
      ? -dist(p, target) * 3 - d * 0.025
      : unknown * 9 - d * 0.12 - visits * 2;
    if (!target)
      for (const l of memory.landmarks.values())
        if (l.kind === "dead end" && dist(l.p, p) < 2) score -= 12;
    if (d > 0 && score > bestScore) {
      best = p;
      bestScore = score;
    }
    const offsets = flying
      ? [
          [step, 0, 0],
          [-step, 0, 0],
          [0, 0, step],
          [0, 0, -step],
          [0, 2, 0],
          [0, -2, 0],
        ]
      : [
          [1, 0, 0],
          [-1, 0, 0],
          [0, 0, 1],
          [0, 0, -1],
        ];
    for (const [dx, dy, dz] of offsets) {
      let q = { x: p.x + dx, y: p.y + dy, z: p.z + dz };
      if (!flying) {
        const h = memory.floors.get(`${Math.floor(q.x)},${Math.floor(q.z)}`);
        if (h !== undefined) q.y = h + 0.55;
      }
      if (
        q.x < 1 ||
        q.z < 1 ||
        q.x > 29 ||
        q.z > 29 ||
        q.y < 0.4 ||
        q.y > 11 ||
        (!flying && Math.abs(q.y - p.y) > 1.1)
      )
        continue;
      const qk = id(q);
      if (
        positions.has(qk) ||
        memory.blocked(q) ||
        memory.blocked({
          x: (p.x + q.x) / 2,
          y: (p.y + q.y) / 2,
          z: (p.z + q.z) / 2,
        })
      )
        continue;
      positions.set(qk, q);
      parents.set(qk, k);
      depth.set(qk, d + 1);
      nodes.push(q);
    }
  }
  const path: V[] = [];
  let k = id(best);
  while (parents.has(k)) {
    path.push(positions.get(k)!);
    k = parents.get(k)!;
  }
  return path.reverse();
}
