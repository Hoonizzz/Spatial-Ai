import type { Agent, Point } from '../types';
import { distance } from '../config';
import { clearMove, roomAt } from '../world/floorplan';
const priorities=new Map<string,number>();
function trafficPriority(id:string){let value=priorities.get(id);if(value===undefined){value=2166136261;for(const c of id)value=Math.imul(value^c.charCodeAt(0),16777619)>>>0;priorities.set(id,value);}return value;}

/** Predictive local velocity sampling; physical swept collision rejection remains final. */
export function desiredPosition(a:Agent,agents:Agent[],dt:number,multiplier:number):Point {
  const allowWC=roomAt(a)==='WC'||a.state==='FLEE_TO_WC'||a.state==='WC_HIDE';
  while(a.path.length&&distance(a,a.path[0])<.08){
    if(a.path.length>1&&!clearMove(a,a.path[1],allowWC))break;
    a.path.shift();
  }
  if(!a.path.length||a.state==='WC_HIDE'||a.state==='ROOM_HIDE'||((a.state==='COOLDOWN'||a.state==='PHONE')&&a.until>0))return {x:a.x,y:a.y};
  const goal=a.path[0],d=distance(a,goal);if(d<1e-8)return {x:a.x,y:a.y};
  const speed=Math.min(a.speedLevel*.5*multiplier,d/dt),ux=(goal.x-a.x)/d,uy=(goal.y-a.y)/d;
  const neighbors=agents.filter(b=>b.id!==a.id&&distance(a,b)<3.5).map(b=>{
    const next=b.path.find(p=>distance(b,p)>1e-6),active=next&&b.state!=='WC_HIDE'&&b.state!=='ROOM_HIDE'&&!((b.state==='PHONE'||b.state==='COOLDOWN')&&b.until>0);
    const pa=trafficPriority(a.id),pb=trafficPriority(b.id),yields=active&&(pa>pb||(pa===pb&&a.id>b.id));
    const d=next?distance(b,next):1,otherSpeed=Math.min(b.speedLevel*.5*multiplier,d/dt);
    return {agent:b,velocity:yields&&next?{x:(next.x-b.x)/d*otherSpeed,y:(next.y-b.y)/d*otherSpeed}:b.velocity,risk:active&&!yields?8:30};
  });
  const direct={x:a.x+ux*speed*dt,y:a.y+uy*speed*dt};
  if(!neighbors.length&&clearMove(a,direct,allowWC))return direct;
  let best={x:a.x,y:a.y},bestCost=Infinity;
  // Both agents favor their own right side, producing opposite world-space lanes
  // in a head-on encounter. Crossing traffic also evaluates slowing and yielding.
  for(const fraction of [1,.55,.2,0])for(const degrees of fraction?[0,-20,20,-45,45,-70,70,-95,95,-135,135,180]:[0]) {
    const angle=Math.atan2(uy,ux)+degrees*Math.PI/180,vx=Math.cos(angle)*speed*fraction,vy=Math.sin(angle)*speed*fraction;
    const p={x:a.x+vx*dt,y:a.y+vy*dt};if(!clearMove(a,p,allowWC))continue;
    const wallHorizon=Math.min(.45,d/(speed*fraction||1)),horizonEnd={x:a.x+vx*wallHorizon,y:a.y+vy*wallHorizon};
    if(fraction&&!clearMove(a,horizonEnd,allowWC))continue;
    let cost=((vx-ux*speed)**2+(vy-uy*speed)**2)/(speed*speed||1)+Math.abs(degrees)*.0004+(degrees>0?.025:0);
    for(const neighbor of neighbors) {
      const b=neighbor.agent;
      const rx=b.x-a.x,ry=b.y-a.y,rvx=vx-neighbor.velocity.x,rvy=vy-neighbor.velocity.y,v2=rvx*rvx+rvy*rvy;
      const t=v2?Math.max(0,Math.min(1.25,(rx*rvx+ry*rvy)/v2)):0;
      const gap=Math.hypot(rx-rvx*t,ry-rvy*t);
      if(gap<.76)cost+=(.76-gap)*neighbor.risk/(.35+t);
      if(sweptDistance(a,b,p,{x:b.x+b.velocity.x*dt,y:b.y+b.velocity.y*dt})<.61)cost+=100;
      // Keep usable personal space even while the other person is stationary.
      const immediate=distance(p,b);if(immediate<.85)cost+=(.85-immediate)*2;
    }
    if(cost<bestCost){bestCost=cost;best=p;}
  }
  return best;
}
export function sweptDistance(a:Point,b:Point,p:Point,q:Point) {
  const dx=a.x-b.x,dy=a.y-b.y,vx=(p.x-a.x)-(q.x-b.x),vy=(p.y-a.y)-(q.y-b.y),v=vx*vx+vy*vy;
  const t=v?Math.max(0,Math.min(1,-(dx*vx+dy*vy)/v)):0;
  return Math.hypot(dx+vx*t,dy+vy*t);
}
export function resolveCollisions(agents:Agent[],desired:Point[]):Point[] {
  const next=desired.map(p=>({...p}));
  // Reject both conflicting proposals together. Recheck after each rejection:
  // a reverted agent must not be penetrated by a third agent's proposal.
  for(let pass=0;pass<=agents.length;pass++){
    let changed=false;
    for(let i=0;i<agents.length;i++)for(let j=i+1;j<agents.length;j++)if(sweptDistance(agents[i],agents[j],next[i],next[j])<.6-1e-8){
      for(const k of [i,j])if(distance(next[k],agents[k])>1e-10){next[k]={x:agents[k].x,y:agents[k].y};changed=true;}
    }
    if(!changed)break;
  }
  return next;
}
