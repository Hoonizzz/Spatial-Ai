import type { Agent, Config, Point } from '../types';
import { walls, furniture, desks, WIDTH, HEIGHT } from '../world/floorplan';

/** Same opaque rectangles as canSee, clipped ray by ray to the office boundary. */
export function visionFan(a:Agent,c:Config,segments=48):Point[] {
  const blockers=[...(c.openVisibility?[]:walls),...furniture,...(c.desksBlockSight?desks:[])];
  const points:Point[]=[];
  for(let k=0;k<=segments;k++) {
    const angle=a.heading+(k/segments-.5)*a.fovDeg*Math.PI/180;
    const dx=Math.cos(angle),dy=Math.sin(angle);let radius=a.visionRangeM;
    for(const r of blockers) {
      for(const x of [r.x,r.x+r.w]) {const t=(x-a.x)/dx,y=a.y+t*dy;if(t>=0&&t<radius&&y>=r.y&&y<=r.y+r.h)radius=t;}
      for(const y of [r.y,r.y+r.h]) {const t=(y-a.y)/dy,x=a.x+t*dx;if(t>=0&&t<radius&&x>=r.x&&x<=r.x+r.w)radius=t;}
    }
    for(const t of [dx>0?(WIDTH-a.x)/dx:-a.x/dx,dy>0?(HEIGHT-a.y)/dy:-a.y/dy])if(t>0)radius=Math.min(radius,t);
    points.push({x:a.x+dx*radius,y:a.y+dy*radius});
  }
  return points;
}
