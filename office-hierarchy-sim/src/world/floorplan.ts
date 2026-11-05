import type { Point, Rect, Room } from '../types';
export const WIDTH = 22, HEIGHT = 14, RADIUS = .3, GRID = .25;
export const walls: Rect[] = [];
function wall(x:number,y:number,w:number,h:number) { walls.push({x,y,w,h,kind:'wall',id:`wall-${walls.length}`}); }
function horizontal(y:number,x0:number,x1:number,doors:number[][]) {
  let start=x0; for(const [a,b] of doors) { wall(start,y-.06,a-start,.12);start=b; } wall(start,y-.06,x1-start,.12);
}
function vertical(x:number,y0:number,y1:number,doors:number[][]) {
  let start=y0; for(const [a,b] of doors) { wall(x-.06,start,.12,a-start);start=b; } wall(x-.06,start,.12,y1-start);
}
horizontal(11,0,14,[[10.25,11.75]]);
vertical(7,11,14,[[11.9,13.1]]);
vertical(14,0,14,[[2.75,4.25],[8.25,9.75],[11.9,13.1]]);
horizontal(7,14,22,[[18.25,19.75]]);
export const desks: Rect[] = [], workAnchors: Point[] = [];
for(let col=0;col<4;col++) for(let row=0;row<(col<2?6:5);row++) {
  const x=1.3+col*3,y=.8+row*1.7;
  desks.push({x,y,w:1.2,h:.6,kind:'desk',id:`desk-${desks.length+1}`});
  workAnchors.push({x:x+.6,y:y+1.05});
}
export const furniture: Rect[] = [
  {id:'meeting-table',x:16,y:9,w:4,h:2,kind:'furniture'},
  {id:'sofa-west',x:15.8,y:1.2,w:.8,h:3,kind:'furniture'},
  {id:'sofa-east',x:20.5,y:1.2,w:.8,h:3,kind:'furniture'},
  {id:'coffee-table',x:18,y:2,w:1.6,h:1.4,kind:'furniture'},
  ...[2.05,3.55,5.05].map((x,i)=>({id:`wc-divider-${i}`,x,y:13.1,w:.1,h:.9,kind:'furniture' as const}))
];
export const obstacles = [...walls,...desks,...furniture];
export const hideSlots: Point[] = [1.3,2.8,4.3,5.8].map(x=>({x,y:12.5}));
export const loungeAnchors: Point[] = [{x:17.2,y:1.5},{x:17.2,y:3.5},{x:19.9,y:1.5},{x:19.9,y:3.5},{x:18,y:5.5},{x:20,y:5.5}];
export function roomAt(p:Point): Room {
  if(p.x<7 && p.y>11) return 'WC';
  if(p.x<14 && p.y>11) return 'CORRIDOR';
  if(p.x>=14) return p.y>=7?'MEETING':'LOUNGE';
  return 'WORK';
}
export function segmentRect(a:Point,b:Point,r:Rect,pad=0): boolean {
  let lo=0,hi=1;
  for(const [start,delta,min,max] of [[a.x,b.x-a.x,r.x-pad,r.x+r.w+pad],[a.y,b.y-a.y,r.y-pad,r.y+r.h+pad]]) {
    if(Math.abs(delta)<1e-10) { if(start<min||start>max) return false; }
    else { let t0=(min-start)/delta,t1=(max-start)/delta;if(t0>t1)[t0,t1]=[t1,t0];lo=Math.max(lo,t0);hi=Math.min(hi,t1);if(lo>hi)return false; }
  }
  return true;
}
export function walkable(p:Point,allowWC=true): boolean {
  if(p.x<RADIUS||p.x>WIDTH-RADIUS||p.y<RADIUS||p.y>HEIGHT-RADIUS||(!allowWC&&roomAt(p)==='WC'))return false;
  return !obstacles.some(r=>p.x>=r.x-RADIUS&&p.x<=r.x+r.w+RADIUS&&p.y>=r.y-RADIUS&&p.y<=r.y+r.h+RADIUS);
}
export function clearMove(a:Point,b:Point,allowWC=true): boolean {
  return walkable(b,allowWC)&&!obstacles.some(r=>segmentRect(a,b,r,RADIUS));
}
export function sightBlocked(a:Point,b:Point,desksBlock=false,open=false) {
  // High visibility makes internal walls transparent; physical walls stay solid.
  return obstacles.some(r=>(r.kind==='wall'?!open:r.kind==='desk'?desksBlock:true)&&segmentRect(a,b,r));
}
