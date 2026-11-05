import type { Agent, Point } from '../types';
import { distance } from '../config';
import { clearMove, roomAt } from '../world/floorplan';
export function desiredPosition(a:Agent,agents:Agent[],dt:number,multiplier:number):Point {
  const allowWC=roomAt(a)==='WC'||a.state==='FLEE_TO_WC'||a.state==='WC_HIDE';
  while(a.path.length&&distance(a,a.path[0])<.08)a.path.shift();
  if(!a.path.length||(a.state==='WC_HIDE'||a.state==='ROOM_HIDE')||((a.state==='COOLDOWN'||a.state==='PHONE')&&a.until>0))return {x:a.x,y:a.y};
  const target=a.path[0],d=distance(a,target),step=Math.min(d,a.speedLevel*.5*multiplier*dt);
  const ux=(target.x-a.x)/d,uy=(target.y-a.y)/d;let vx=ux,vy=uy;
  for(const b of agents){if(a.id===b.id)continue;const gap=distance(a,b);if(gap<1.1&&gap>.001){const force=Math.max(0,(.9-gap)/.3)*.6;vx+=(a.x-b.x)/gap*force;vy+=(a.y-b.y)/gap*force;
    if((b.x-a.x)*ux+(b.y-a.y)*uy>0){vx+=uy*.45*(1.1-gap);vy-=ux*.45*(1.1-gap);}
  }}
  const norm=Math.hypot(vx,vy)||1;
  const p={x:a.x+vx/norm*step,y:a.y+vy/norm*step};
  if(clearMove(a,p,allowWC))return p;
  const direct={x:a.x+ux*step,y:a.y+uy*step};return clearMove(a,direct,allowWC)?direct:{x:a.x,y:a.y};
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
