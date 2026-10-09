export const RADIUS = 100;
export const CLEARANCE = 2.2;
export const TREES = [[-65,-30],[-65,-48],[-56,61],[-40,70],[63,20],[66,44],[43,-64],[59,-52],[-22,-66],[20,68]];
export const OBSTACLES = [
  { x: -43, z: -35, w: 20, d: 16 }, { x: 43, z: -35, w: 20, d: 16 },
  { x: -43, z: 36, w: 20, d: 18 }, { x: 44, z: 37, w: 22, d: 18 },
  { x: -25, z: 58, w: 10, d: 3 }, { x: 28, z: -60, w: 10, d: 3 },
  ...TREES.map(([x,z])=>({x,z,w:2,d:2}))
];
export const PEOPLE = [
  { id: 'A', role: 'office_worker', color: 0x304658, x: -17, z: 24 },
  { id: 'B', role: 'office_worker', color: 0x5b677a, x: -25, z: 11 },
  { id: 'C', role: 'office_worker', color: 0x3e5853, x: 20, z: -21 },
  { id: 'D', role: 'tourist', color: 0xe68d67, x: 29, z: 10 },
  { id: 'E', role: 'tourist', color: 0x6c9b96, x: 10, z: 36 },
  { id: 'F', role: 'tourist', color: 0xd8b365, x: -12, z: -32 }
];
export function validPoint(p) {
  return Number.isFinite(p.x) && Number.isFinite(p.z) && Math.hypot(p.x, p.z) <= RADIUS - CLEARANCE &&
    !OBSTACLES.some(o => Math.abs(p.x-o.x) <= o.w/2+CLEARANCE && Math.abs(p.z-o.z) <= o.d/2+CLEARANCE);
}
export function validSegment(a,b) {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/0.8));
  for(let i=0;i<=n;i++) if(!validPoint({x:a.x+(b.x-a.x)*i/n,z:a.z+(b.z-a.z)*i/n})) return false;
  return true;
}
// Local metric grid with segment validation, including diagonal corner clearance.
export function findRoute(start, end) {
  if(!validPoint(start)||!validPoint(end)) return null;
  if(validSegment(start,end)) return [{...end}];
  const step=4, key=(x,z)=>`${x},${z}`, point=(x,z)=>({x:x*step,z:z*step});
  const nearby=p=>{
    const out=[];const x=Math.round(p.x/step), z=Math.round(p.z/step);
    for(let dx=-2;dx<=2;dx++) for(let dz=-2;dz<=2;dz++) {
      const q=point(x+dx,z+dz);
      if(validSegment(p,q)) out.push({x:x+dx,z:z+dz,q});
    }
    return out;
  };
  const targets=new Set(nearby(end).map(n=>key(n.x,n.z)));
  if(!targets.size) return null;
  const open=[], best=new Map(), closed=new Set();
  const heuristic=q=>Math.hypot(q.x-end.x,q.z-end.z);
  for(const n of nearby(start)) {
    const g=Math.hypot(n.q.x-start.x,n.q.z-start.z), k=key(n.x,n.z);
    const node={...n,g,f:g+heuristic(n.q),parent:null};best.set(k,node);open.push(node);
  }
  while(open.length) {
    open.sort((a,b)=>b.f-a.f);const n=open.pop(), k=key(n.x,n.z);
    if(closed.has(k)) continue;
    closed.add(k);
    if(targets.has(k)) {
      const route=[{...end}];for(let node=n;node;node=node.parent) route.unshift(node.q);
      const smooth=[];let anchor=start,index=0;
      while(index<route.length) {
        let far=index;while(far+1<route.length&&validSegment(anchor,route[far+1])) far++;
        smooth.push(route[far]);anchor=route[far];index=far+1;
      }
      return smooth;
    }
    for(let dx=-1;dx<=1;dx++) for(let dz=-1;dz<=1;dz++) {
      if(!dx&&!dz) continue;
      const x=n.x+dx,z=n.z+dz,nk=key(x,z),q=point(x,z);
      if(closed.has(nk)||!validSegment(n.q,q)) continue;
      const g=n.g+step*Math.hypot(dx,dz);
      if(best.has(nk)&&best.get(nk).g<=g) continue;
      const node={x,z,q,g,f:g+heuristic(q),parent:n};best.set(nk,node);open.push(node);
    }
  }
  return null;
}
