export const WALK_SPEED = 1.4;
export const distance = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);
export const interpolate = (a, b, t) => ({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t});

export function createNetwork(data) {
  const nodes=data.nodes.map(([x,z])=>({x,z}));
  const edges=data.edges.map(([a,b])=>({a,b,length:distance(nodes[a],nodes[b])}));
  const adjacency=nodes.map(()=>[]);
  edges.forEach((edge,id)=>{
    adjacency[edge.a].push({to:edge.b,length:edge.length,edge:id,t0:0,t1:1});
    adjacency[edge.b].push({to:edge.a,length:edge.length,edge:id,t0:1,t1:0});
  });
  return {nodes,edges,adjacency,spawnEdges:data.spawnEdges};
}

export function randomTourist(network, random=Math.random) {
  const available=network.spawnEdges;
  if(!available?.length)throw new Error('No connected street positions are available.');
  const total=available.reduce((sum,id)=>sum+network.edges[id].length,0);
  let choice=Math.max(0,Math.min(.999999999,random()))*total,id=available.at(-1);
  for(const candidate of available){choice-=network.edges[candidate].length;if(choice<=0){id=candidate;break;}}
  const edge=network.edges[id],t=.1+.8*Math.max(0,Math.min(1,random()));
  return {edge:id,t,point:interpolate(network.nodes[edge.a],network.nodes[edge.b],t),accessId:null};
}

class MinHeap {
  values=[];
  push(value){
    const a=this.values;a.push(value);let i=a.length-1;
    while(i>0){const p=(i-1)>>1;if(a[p].cost<=value.cost)break;a[i]=a[p];i=p;}a[i]=value;
  }
  pop(){
    const a=this.values,first=a[0],last=a.pop();if(!a.length)return first;
    let i=0;
    while(i*2+1<a.length){let child=i*2+1;if(child+1<a.length&&a[child+1].cost<a[child].cost)child++;
      if(a[child].cost>=last.cost)break;a[i]=a[child];i=child;}
    a[i]=last;return first;
  }
  get length(){return this.values.length;}
}

// Exact Dijkstra shortest path on the bundled, weighted, bidirectional graph.
// Virtual nodes preserve fractional edge positions instead of jumping to nodes.
export function shortestRoute(network,tourist,building) {
  const entrance=building.entrance;
  if(!entrance||!network.edges[tourist.edge]||!network.edges[entrance.edge])return null;
  const nodes=network.nodes.slice(),adj=network.adjacency.map(list=>list.slice());
  const addNode=point=>{nodes.push({...point});adj.push([]);return nodes.length-1;};
  const connect=(a,b,meta={})=>{
    const length=distance(nodes[a],nodes[b]);
    adj[a].push({to:b,length,...meta});
    adj[b].push({to:a,length,...meta,t0:meta.t1,t1:meta.t0});
  };
  const attach=(edgeId,t)=>{
    const edge=network.edges[edgeId],point=interpolate(nodes[edge.a],nodes[edge.b],t),id=addNode(point);
    connect(id,edge.a,{edge:edgeId,t0:t,t1:0});connect(id,edge.b,{edge:edgeId,t0:t,t1:1});return id;
  };
  const source=addNode(tourist.point),start=attach(tourist.edge,tourist.t);
  const end=attach(entrance.edge,entrance.t),target=addNode(entrance.door);
  connect(source,start,{access:{edge:tourist.edge,t:tourist.t,id:tourist.accessId}});
  connect(end,target,{access:{edge:entrance.edge,t:entrance.t,id:building.id}});
  if(tourist.edge===entrance.edge)connect(start,end,{edge:tourist.edge,t0:tourist.t,t1:entrance.t});
  if(tourist.accessId===building.id)connect(source,target,{access:{edge:entrance.edge,t:entrance.t,id:building.id}});
  const costs=new Float64Array(nodes.length);costs.fill(Infinity);costs[source]=0;
  const previous=new Array(nodes.length),heap=new MinHeap();heap.push({node:source,cost:0});
  while(heap.length){
    const {node,cost}=heap.pop();if(cost>costs[node]+1e-9)continue;if(node===target)break;
    for(const link of adj[node]){
      const next=cost+link.length;
      if(next+1e-9<costs[link.to]){costs[link.to]=next;previous[link.to]={node,link};heap.push({node:link.to,cost:next});}
    }
  }
  if(!Number.isFinite(costs[target]))return null;
  const legs=[];
  for(let node=target;node!==source;){
    const parent=previous[node];if(!parent)return null;
    if(parent.link.length>1e-7)legs.unshift({...parent.link,from:nodes[parent.node],to:nodes[node]});
    node=parent.node;
  }
  const points=[{...tourist.point},...legs.map(leg=>({...leg.to}))];
  return {distance:costs[target],legs,points,buildingId:building.id,steps:directions(legs,building.name)};
}

export function locationOnLeg(leg,t){
  return {point:interpolate(leg.from,leg.to,t),edge:leg.edge??leg.access.edge,
    t:leg.edge===undefined?leg.access.t:leg.t0+(leg.t1-leg.t0)*t,
    accessId:leg.edge===undefined?leg.access.id:null};
}
export function coordinates(point,data){
  return {longitude:data.origin.longitude+point.x/data.metersPerDegree.x,
    latitude:data.origin.latitude-point.z/data.metersPerDegree.z};
}
export function compassBearing(a,b){return (Math.atan2(b.x-a.x,a.z-b.z)*180/Math.PI+360)%360;}
const headings=['north','northeast','east','southeast','south','southwest','west','northwest'];
export function directions(legs,name){
  // Simplify instruction headings only. Keep the exact route and its measured
  // lengths, but do not announce every staircase step of the metric grid.
  const points=legs.length?[legs[0].from,...legs.map(l=>l.to)]:[];
  const kept=new Set(points.length?[0,points.length-1]:[]);
  function simplify(a,b){
    if(b-a<2)return;
    const from=points[a],to=points[b],dx=to.x-from.x,dz=to.z-from.z,den=dx*dx+dz*dz;
    let far=0,index=a;
    for(let i=a+1;i<b;i++){
      const t=den?Math.max(0,Math.min(1,((points[i].x-from.x)*dx+(points[i].z-from.z)*dz)/den)):0;
      const d=distance(points[i],interpolate(from,to,t));if(d>far){far=d;index=i;}
    }
    if(far>2.5){kept.add(index);simplify(a,index);simplify(index,b);}
  }
  if(points.length)simplify(0,points.length-1);
  for(let i=1;i<legs.length;i++)if(!!legs[i].access!==!!legs[i-1].access)kept.add(i);
  const indices=[...kept].sort((a,b)=>a-b),cumulative=[0];
  legs.forEach(leg=>cumulative.push(cumulative.at(-1)+leg.length));
  const summarized=[];
  for(let i=1;i<indices.length;i++){
    const a=indices[i-1],b=indices[i];summarized.push({from:points[a],to:points[b],length:cumulative[b]-cumulative[a],access:legs[a].access});
  }
  const groups=[];
  for(const leg of summarized){
    const bearing=compassBearing(leg.from,leg.to),last=groups.at(-1);
    const delta=last?Math.abs(((bearing-last.bearing+540)%360)-180):180;
    if(last&&delta<20&&!!last.access===!!leg.access)last.distance+=leg.length;
    else groups.push({bearing,distance:leg.length,access:leg.access});
  }
  const result=groups.map((g,i)=>{
    const heading=headings[Math.round(g.bearing/45)%8];
    if(g.access&&i===groups.length-1)return {text:`Approach the modeled entrance of ${name}`,distance:g.distance};
    if(i===0)return {text:`Head ${heading}`,distance:g.distance};
    const delta=((g.bearing-groups[i-1].bearing+540)%360)-180;
    return {text:`${Math.abs(delta)<15?'Continue':Math.abs(delta)>150?'Turn back':delta>0?'Turn right':'Turn left'} · ${heading}`,distance:g.distance};
  });
  result.push({text:`Arrive at ${name}`,distance:0});return result;
}
