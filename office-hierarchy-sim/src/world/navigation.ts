import type { Point, Room } from '../types';
import { GRID, WIDTH, HEIGHT, walkable, clearMove, roomAt } from './floorplan';
import { distance } from '../config';
export class Navigation {
  points: Point[]=[]; neighbors: Array<Array<[number,number]>>=[]; roomPoints: Record<Room,Point[]>={WORK:[],MEETING:[],LOUNGE:[],WC:[],CORRIDOR:[]};
  constructor() {
    const nx=WIDTH/GRID,ny=HEIGHT/GRID,lookup=new Map<string,number>();
    for(let y=0;y<ny;y++)for(let x=0;x<nx;x++) { const p={x:(x+.5)*GRID,y:(y+.5)*GRID}; if(walkable(p)){lookup.set(`${x},${y}`,this.points.length);this.points.push(p);this.roomPoints[roomAt(p)].push(p);} }
    this.neighbors=this.points.map(p=>{const out:Array<[number,number]>=[],x=Math.floor(p.x/GRID),y=Math.floor(p.y/GRID);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const n=lookup.get(`${x+dx},${y+dy}`);if(n!==undefined&&clearMove(p,this.points[n]))out.push([n,Math.hypot(dx,dy)*GRID]);}return out;});
  }
  nearest(p:Point,allowWC=true) { let best=-1,d=Infinity;for(let i=0;i<this.points.length;i++){const q=this.points[i];if(!allowWC&&roomAt(q)==='WC')continue;const v=distance(p,q);if(v<d&&clearMove(p,q,allowWC)){best=i;d=v;}}return best; }
  find(a:Point,b:Point,allowWC=false): Point[] {
    const s=this.nearest(a,allowWC),t=this.nearest(b,allowWC);if(s<0||t<0)return [];
    const cost=new Float64Array(this.points.length).fill(Infinity),parent=new Int32Array(this.points.length).fill(-1),closed=new Uint8Array(this.points.length);
    const heap:Array<[number,number]>=[];
    const push=(v:[number,number])=>{heap.push(v);let i=heap.length-1;while(i>0){const p=(i-1)>>1;if(heap[p][0]<=v[0])break;heap[i]=heap[p];i=p;}heap[i]=v;};
    const pop=()=>{const root=heap[0],v=heap.pop()!;if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1][0]<heap[c][0])c++;if(v[0]<=heap[c][0])break;heap[i]=heap[c];i=c;}heap[i]=v;}return root[1];};
    cost[s]=0;push([distance(this.points[s],this.points[t]),s]);
    while(heap.length){const u=pop();if(closed[u])continue;closed[u]=1;if(u===t)break;for(const [v,w] of this.neighbors[u]){if(!allowWC&&roomAt(this.points[v])==='WC')continue;const c=cost[u]+w;if(c<cost[v]){cost[v]=c;parent[v]=u;push([c+distance(this.points[v],this.points[t]),v]);}}}
    if(!Number.isFinite(cost[t]))return [];
    const route:Point[]=[];for(let u=t;u!==-1;u=parent[u])route.push(this.points[u]);route.reverse();
    if(clearMove(route[route.length-1],b,allowWC))route.push({...b});
    // String pulling uses the same inflated obstacles as motion, including door jambs.
    const out:Point[]=[];let p=a;for(let i=0;i<route.length;){let j=i;while(j+1<route.length&&clearMove(p,route[j+1],allowWC))j++;out.push({...route[j]});p=route[j];i=j+1;}return out;
  }
}
