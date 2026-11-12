import { Memory } from "./mapping";
import { dist, key, type V } from "./world";
// The planner receives its own observations only, never the physical maze.
export function plan(memory: Memory, start: V, target?: V): V[] {
  const root = {
    x: Math.floor(start.x) + 0.5,
    y: 0.5,
    z: Math.floor(start.z) + 0.5,
  };
  const nodes = [root],
    parents = new Map<string, string>(),
    positions = new Map([[key(root), root]]),
    depth = new Map([[key(root), 0]]);
  let best = root,
    bestScore = -Infinity;
  for (let i = 0; i < nodes.length; i++) {
    const p = nodes[i],
      k = key(p),
      d = depth.get(k)!;
    let score = target
      ? -dist(p, target) * 3 - d * 0.025
      : (memory.cells.has(k) ? 0 : 9) -
        d * 0.12 -
        (memory.visits.get(k) ?? 0) * 2;
    if (!target)
      for (const landmark of memory.landmarks.values())
        if (landmark.kind === "dead end" && dist(landmark.p, p) < 2)
          score -= 12;
    if (d > 0 && score > bestScore) {
      best = p;
      bestScore = score;
    }
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const q = { x: p.x + dx, y: 0.5, z: p.z + dz },
        qk = key(q);
      if (
        q.x < 1 ||
        q.z < 1 ||
        q.x > 29 ||
        q.z > 29 ||
        positions.has(qk) ||
        memory.blocked(q)
      )
        continue;
      positions.set(qk, q);
      parents.set(qk, k);
      depth.set(qk, d + 1);
      nodes.push(q);
    }
  }
  const path: V[] = [];
  let k = key(best);
  while (parents.has(k)) {
    path.push(positions.get(k)!);
    k = parents.get(k)!;
  }
  return path.reverse();
}
