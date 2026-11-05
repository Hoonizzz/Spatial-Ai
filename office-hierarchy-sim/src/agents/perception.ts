import type { Agent, Config, Perception } from '../types';
import { distance } from '../config';
import { sightBlocked } from '../world/floorplan';
export function canSee(a:Agent,b:Agent,c:Config):boolean {
  if(a.id===b.id)return false;const d=distance(a,b);if(d>a.visionRangeM)return false;
  if(d>1e-6&&(Math.cos(a.heading)*(b.x-a.x)+Math.sin(a.heading)*(b.y-a.y))/d<Math.cos(a.fovDeg*Math.PI/360))return false;
  return !sightBlocked(a,b,c.desksBlockSight,c.openVisibility);
}
export function perceive(agents:Agent[],c:Config,now:number,dt:number):Map<string,Perception> {
  const result=new Map<string,Perception>();
  for(const a of agents){const visible:Agent[]=[];for(const b of agents){if(a.id===b.id)continue;
    const currentlyVisible=canSee(a,b,c);
    if(currentlyVisible){const since=a.seen.get(b.id)??now;a.seen.set(b.id,since);if(now-since>=.15-1e-8)a.stable.add(b.id);}
    else {a.seen.delete(b.id);}
    // Separate last-visible timestamp from detection-start timestamp.
    const key=`last:${b.id}`;if(currentlyVisible)a.seen.set(key,now);
    if(a.stable.has(b.id)&&(now-(a.seen.get(key)??-Infinity))>.7)a.stable.delete(b.id);
    if(a.stable.has(b.id))visible.push(b);
  }
  const superiors=visible.filter(b=>b.rank>a.rank).sort((b,d)=>d.rank-b.rank||distance(a,b)-distance(a,d)||b.id.localeCompare(d.id));
  const inferiors=visible.filter(b=>b.rank<a.rank).sort((b,d)=>distance(a,b)-distance(a,d)||b.id.localeCompare(d.id));
  a.superiorIds=superiors.map(b=>b.id);a.inferiorIds=inferiors.map(b=>b.id);if(superiors.length)a.lastSeenSuperiorAt=now;
  result.set(a.id,{superiors,inferiors});}
  return result;
}
