import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import {createNetwork,randomTourist,shortestRoute,locationOnLeg,coordinates,compassBearing,distance,interpolate,directions} from '../model.mjs';

const data=JSON.parse(readFileSync(new URL('../data/soho.json',import.meta.url)));
const network=createNetwork(data);
const fixture={nodes:[[0,0],[10,0],[10,10],[0,10],[30,0],[40,0]],edges:[[0,1],[1,2],[2,3],[3,0],[4,5]],spawnEdges:[0,1,2,3]};
const square=createNetwork(fixture);
function person(edge,t,graph=square){const e=graph.edges[edge];return {edge,t,point:interpolate(graph.nodes[e.a],graph.nodes[e.b],t),accessId:null};}
function building(edge,t,door,id='B001'){return {id,name:'Test building',entrance:{edge,t,door}};}
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} should equal ${b}`);

test('all 696 footprints and courtyard holes triangulate into finite 3D buildings',()=>{
  for(const building of data.buildings){
    const shape=new THREE.Shape(building.footprint.map(([x,z])=>new THREE.Vector2(x,-z)));
    for(const hole of building.holes)shape.holes.push(new THREE.Path(hole.map(([x,z])=>new THREE.Vector2(x,-z))));
    const geo=new THREE.ExtrudeGeometry(shape,{depth:building.height,bevelEnabled:false});
    assert.ok(geo.getAttribute('position').count>0,building.id);
    assert.ok(geo.getAttribute('position').array.every(Number.isFinite),building.id);geo.dispose();
  }
});

test('Dijkstra picks the shorter street alternative and includes the entrance connector',()=>{
  const r=shortestRoute(square,person(0,.3),building(2,.6,{x:4,z:12}));
  close(r.distance,19);assert.deepEqual(r.points[0],{x:3,z:0});assert.deepEqual(r.points.at(-1),{x:4,z:12});
  close(r.legs.reduce((sum,l)=>sum+l.length,0),r.distance);assert.match(r.steps.at(-1).text,/Arrive/);
});
test('fractional positions on the same street route directly without a node detour',()=>{
  const r=shortestRoute(square,person(0,.2),building(0,.8,{x:8,z:2}));close(r.distance,8);
  assert.deepEqual(r.points,[{x:2,z:0},{x:8,z:0},{x:8,z:2}]);
});
test('street instructions suppress tiny grid zigzags while retaining their exact distance',()=>{
  const legs=[];let point={x:0,z:0};
  for(let i=0;i<10;i++){
    const to={x:point.x+(i%2?5:0),z:point.z-5};legs.push({from:point,to,length:distance(point,to)});point=to;
  }
  const steps=directions(legs,'Destination');assert.ok(steps.length<5);
  close(steps.reduce((sum,s)=>sum+s.distance,0),legs.reduce((sum,l)=>sum+l.length,0));
});
test('shortest paths match an independent Floyd–Warshall oracle for every square edge pair',()=>{
  const matrix=Array.from({length:4},(_,i)=>Array.from({length:4},(_,j)=>i===j?0:Infinity));
  for(const e of square.edges.slice(0,4))matrix[e.a][e.b]=matrix[e.b][e.a]=e.length;
  for(let k=0;k<4;k++)for(let i=0;i<4;i++)for(let j=0;j<4;j++)matrix[i][j]=Math.min(matrix[i][j],matrix[i][k]+matrix[k][j]);
  for(let a=0;a<4;a++)for(let b=0;b<4;b++)for(const t of [.15,.5,.85]){
    const from=person(a,t),target=person(b,.4),ea=square.edges[a],eb=square.edges[b];
    let expected=Infinity;
    for(const [i,costA] of [[ea.a,t*ea.length],[ea.b,(1-t)*ea.length]])
      for(const [j,costB] of [[eb.a,.4*eb.length],[eb.b,.6*eb.length]])expected=Math.min(expected,costA+matrix[i][j]+costB);
    if(a===b)expected=Math.min(expected,Math.abs(t-.4)*ea.length);
    close(shortestRoute(square,from,building(b,.4,target.point)).distance,expected);
  }
});
test('missing modeled entrances and disconnected networks return no route',()=>{
  assert.equal(shortestRoute(square,person(0,.2),{id:'x',entrance:null}),null);
  assert.equal(shortestRoute(square,person(0,.2),building(4,.2,{x:32,z:0})),null);
});
test('replanning during a walk starts at the actual fractional position',()=>{
  const first=shortestRoute(square,person(0,.2),building(1,.8,{x:12,z:8}));
  const location=locationOnLeg(first.legs[0],.4);
  const next=shortestRoute(square,location,building(2,.6,{x:4,z:12}));
  assert.deepEqual(next.points[0],location.point);assert.notDeepEqual(location.point,person(0,.2).point);
});
test('replanning on an entrance connector preserves the exact location and handles the same building',()=>{
  const target=building(0,.8,{x:8,z:4});const r=shortestRoute(square,person(0,.2),target);
  const location=locationOnLeg(r.legs.at(-1),.5);
  close(shortestRoute(square,location,target).distance,2);
  const other=shortestRoute(square,location,building(0,.2,{x:2,z:2},'B002'));
  close(other.distance,10);assert.deepEqual(other.points[0],{x:8,z:2});
});
test('zero-distance arrival is handled without movement or NaN',()=>{
  const p=person(0,.2);p.accessId='B001';const r=shortestRoute(square,p,building(0,.2,p.point));
  close(r.distance,0);assert.equal(r.legs.length,0);
});
test('metric axes map to WGS84 in the correct east and south directions',()=>{
  const zero=coordinates({x:0,z:0},data);assert.deepEqual(zero,data.origin);
  const offset=coordinates({x:100,z:100},data);assert.ok(offset.longitude>zero.longitude);assert.ok(offset.latitude<zero.latitude);
  close(compassBearing({x:0,z:0},{x:0,z:-10}),0);close(compassBearing({x:0,z:0},{x:10,z:0}),90);
});
test('the bundled SoHo graph is connected and identifies buildings and estimated entrances consistently',()=>{
  assert.equal(data.buildings.length,696);assert.equal(new Set(data.buildings.map(b=>b.id)).size,696);
  const visited=new Set([0]),todo=[0];while(todo.length){const n=todo.pop();for(const link of network.adjacency[n])if(!visited.has(link.to)){visited.add(link.to);todo.push(link.to);}}
  assert.equal(visited.size,network.nodes.length);
  assert.equal(data.buildings.filter(b=>b.entrance).length,680);
  for(const b of data.buildings.filter(b=>b.entrance)){
    const e=network.edges[b.entrance.edge];assert.ok(e);assert.ok(b.entrance.t>=0&&b.entrance.t<=1);
    assert.ok(distance(interpolate(network.nodes[e.a],network.nodes[e.b],b.entrance.t),b.entrance.point)<.01,'Stored centimeter-rounded entrance anchor must match its street edge');
  }
});
test('random spawning stays on connected modeled street edges',()=>{
  const positions=new Set();let state=147;
  const rng=()=>{state=(state*1664525+1013904223)>>>0;return state/4294967296;};
  for(let i=0;i<100;i++){
    const p=randomTourist(network,rng),edge=network.edges[p.edge];assert.ok(data.spawnEdges.includes(p.edge));
    assert.ok(p.t>=.1&&p.t<=.9);close(distance(p.point,interpolate(network.nodes[edge.a],network.nodes[edge.b],p.t)),0);
    positions.add(`${p.point.x},${p.point.z}`);
  }
  assert.equal(positions.size,100);
});
test('representative SoHo destinations produce continuous measured routes from the tourist',()=>{
  const tourist=randomTourist(network,()=>.41),destinations=data.buildings.filter(b=>b.entrance);
  for(let i=0;i<destinations.length;i+=53){
    const building=destinations[i],route=shortestRoute(network,tourist,building);assert.ok(route);
    assert.deepEqual(route.points[0],tourist.point);assert.deepEqual(route.points.at(-1),building.entrance.door);
    close(route.legs.reduce((sum,l)=>sum+distance(l.from,l.to),0),route.distance);
    for(let j=1;j<route.legs.length;j++)assert.deepEqual(route.legs[j-1].to,route.legs[j].from);
  }
});
