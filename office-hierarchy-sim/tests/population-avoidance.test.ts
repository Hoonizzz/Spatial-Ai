import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../src/simulation';
import {defaults,distance,DT,segmentDistance} from '../src/config';
import {Navigation} from '../src/world/navigation';
import {clearMove,walkable,desks,RADIUS} from '../src/world/floorplan';
import {canSee} from '../src/agents/perception';
import {desiredPosition,resolveCollisions} from '../src/agents/movement';
import type {Agent} from '../src/types';
const nav=new Navigation();

test('role populations are independent, including multiple CEOs, missing roles and empty offices',()=>{
  const c={...defaults(),counts:{CEO:2,LEAD:5,ASSOCIATE:0,JUNIOR:7}},s=new Simulation(c,nav);
  assert.equal(s.agents.length,14);for(const role of Object.keys(c.counts) as Array<keyof typeof c.counts>)assert.equal(s.agents.filter(a=>a.role===role).length,c.counts[role]);
  assert.equal(new Set(s.agents.map(a=>a.id)).size,14);
  for(const counts of [{CEO:0,LEAD:1,ASSOCIATE:1,JUNIOR:2},{CEO:0,LEAD:0,ASSOCIATE:0,JUNIOR:0}]) {
    const t=new Simulation({...defaults(),counts},nav);for(let i=0;i<20;i++)t.step();assert(t.metrics().every(m=>m.ceoDistance===null));assert.equal(t.exportData().agents.length,Object.values(counts).reduce((a,b)=>a+b));
  }
});
test('population bounds reject invalid values and 120 agents spawn without overlap',()=>{
  for(const counts of [{CEO:-1,LEAD:0,ASSOCIATE:0,JUNIOR:0},{CEO:1.5,LEAD:0,ASSOCIATE:0,JUNIOR:0},{CEO:41,LEAD:0,ASSOCIATE:0,JUNIOR:0},{CEO:40,LEAD:40,ASSOCIATE:40,JUNIOR:1}])assert.throws(()=>new Simulation({...defaults(),counts},nav));
  const s=new Simulation({...defaults(),counts:{CEO:40,LEAD:40,ASSOCIATE:40,JUNIOR:0}},nav);assert.equal(s.agents.length,120);for(let i=0;i<s.agents.length;i++){assert(walkable(s.agents[i]));for(let j=i+1;j<s.agents.length;j++)assert(distance(s.agents[i],s.agents[j])>=.75);}
});
test('baseline keeps 110 degrees and CEO 3 m, halves other attention ranges',()=>{
  const c=defaults();assert.equal(c.fov,110);assert.deepEqual(c.radii,{CEO:3,LEAD:2.5,ASSOCIATE:3.5,JUNIOR:4.5});
  const s=new Simulation(c,nav),lead=s.agents.find(a=>a.role==='LEAD')!,ceo=s.agents[0];Object.assign(lead,{x:24,y:18,heading:0});Object.assign(ceo,{x:26,y:18});assert(canSee(lead,ceo,c));ceo.x=27;assert(!canSee(lead,ceo,c));
});
test('a lead using a phone turns away when a CEO enters confirmed FOV',()=>{
  const s=new Simulation({...defaults(),counts:{CEO:1,LEAD:1,ASSOCIATE:0,JUNIOR:0},pretendProbability:0,wcEscapeProbability:0},nav),[ceo,lead]=s.agents;
  Object.assign(ceo,{x:26,y:18,heading:Math.PI,path:[{x:24,y:18}]});Object.assign(lead,{x:24,y:18,heading:0,state:'PHONE',until:10,path:[{x:29,y:18}]});
  assert(canSee(lead,ceo,s.config));for(let i=0;i<10;i++)s.step();
  const next=s.agents[1];assert.equal(next.state,'FLEE_TO_ROOM');assert.equal(next.targetAgentId,ceo.id);assert(Math.cos(next.heading)<.2,`did not turn: ${next.heading}`);assert(next.x<24.05,'continued toward CEO');
});
test('a new CEO overrides a lead’s existing escape route instead of hitting the early return',()=>{
  const s=new Simulation({...defaults(),counts:{CEO:2,LEAD:1,ASSOCIATE:0,JUNIOR:0},pretendProbability:0,wcEscapeProbability:0},nav),[oldCEO,newCEO,lead]=s.agents;
  Object.assign(oldCEO,{x:21,y:17});Object.assign(newCEO,{x:26,y:18});Object.assign(lead,{x:24,y:18,heading:0,state:'FLEE_TO_ROOM',episode:oldCEO.id,targetAgentId:oldCEO.id,targetRoom:'MEETING',targetPoint:{x:29,y:18},path:[{x:29,y:18}]});
  s.decide(lead,{superiors:[newCEO],inferiors:[]});assert.equal(lead.targetAgentId,newCEO.id);const first=lead.path.find(p=>distance(lead,p)>.08)!;assert(first.x<=lead.x+.05,'kept the old path toward the new CEO');assert(lead.path.length);
});
test('work reactions also replace stale pursuit routes and choose a turning waypoint',()=>{
  const s=new Simulation({...defaults(),counts:{CEO:1,LEAD:1,ASSOCIATE:0,JUNIOR:0},pretendProbability:1},nav),[ceo,lead]=s.agents;
  Object.assign(ceo,{x:26,y:18});Object.assign(lead,{x:24,y:18,heading:0,state:'APPROACH',path:[{x:29,y:18}],targetPoint:{x:29,y:18}});
  s.decide(lead,{superiors:[ceo],inferiors:[]});assert.equal(lead.state,'PRETEND_WORK');assert.equal(lead.targetAgentId,ceo.id);assert(lead.path.find(p=>distance(lead,p)>.08)!.x<24.05);
});
test('same-rank threat switches respect the planning interval; a higher-ranked threat interrupts immediately',()=>{
  const s=new Simulation({...defaults(),counts:{CEO:2,LEAD:1,ASSOCIATE:1,JUNIOR:0},pretendProbability:0},nav),[oldCEO,newCEO,lead,associate]=s.agents;
  lead.episode=oldCEO.id;lead.reactionMode='escape';lead.lastThreatPlan=0;s.time=.1;
  s.decide(lead,{superiors:[newCEO],inferiors:[]});assert.equal(lead.episode,oldCEO.id);
  s.time=.6;s.decide(lead,{superiors:[newCEO],inferiors:[]});assert.equal(lead.episode,newCEO.id);
  associate.episode=lead.id;associate.lastThreatPlan=.6;s.time=.7;s.decide(associate,{superiors:[newCEO],inferiors:[]});assert.equal(associate.targetAgentId,newCEO.id);
});
function moveOnly(agents:Agent[],steps=400) {
  let separation=Infinity;
  for(let k=0;k<steps;k++) {
    const desired=agents.map(a=>desiredPosition(a,agents,DT,1)),next=resolveCollisions(agents,desired);
    const velocities=next.map((p,i)=>({x:(p.x-agents[i].x)/DT,y:(p.y-agents[i].y)/DT}));
    for(let i=0;i<agents.length;i++){assert(clearMove(agents[i],next[i]));Object.assign(agents[i],next[i],{velocity:velocities[i]});}
    for(let i=0;i<agents.length;i++)for(let j=i+1;j<agents.length;j++){separation=Math.min(separation,distance(agents[i],agents[j]));assert(separation>=.6-1e-7);}
  }
  return separation;
}
function movers() {const s=new Simulation(defaults(),nav);return [structuredClone(s.agents[0]),structuredClone(s.agents[1])].map(a=>Object.assign(a,{state:'WANDER' as const,speedLevel:2,until:0,velocity:{x:0,y:0}}));}
test('opposing paths automatically form passing lanes without overlap or a stand-off',()=>{
  const [a,b]=movers();Object.assign(a,{x:23,y:18,path:[{x:29,y:18}]});Object.assign(b,{x:29,y:18,path:[{x:23,y:18}]});moveOnly([a,b]);assert(a.x>28.5,`a stopped at ${a.x}, ${a.y}`);assert(b.x<23.5,`b stopped at ${b.x}, ${b.y}`);
});
test('perpendicular crossing paths yield and pass without overlap',()=>{
  const [a,b]=movers();Object.assign(a,{x:24,y:17.5,path:[{x:28,y:17.5}]});Object.assign(b,{x:26,y:15.5,path:[{x:26,y:19.2}]});moveOnly([a,b]);assert(a.x>27.5,`a: ${a.x},${a.y}`);assert(b.y>18.8,`b: ${b.x},${b.y}`);
});
test('walkers route around a stationary person rather than stopping on their centerline',()=>{
  const [a,b]=movers();Object.assign(a,{x:23,y:18,path:[{x:29,y:18}]});Object.assign(b,{x:26,y:18,path:[]});moveOnly([a,b]);assert(a.x>28.5,`stopped at ${a.x}, ${a.y}`);assert.equal(b.x,26);
});
test('congestion-aware A* smoothing respects dynamic obstacles as well as walls',()=>{
  const start={x:23,y:18},goal={x:29,y:18},person={x:26,y:18},route=nav.find(start,goal,false,[person]);assert(route.length);let p=start;for(const q of route){assert(clearMove(p,q));assert(segmentDistance(person,p,q)>=.68-1e-8);p=q;}assert(distance(p,goal)<.01);
});

test('close corner waypoints are retained until the following segment clears the furniture',()=>{
  const [a]=movers(),desk=desks.find(r=>r.id==='desk-10')!,right=desk.x+desk.w+RADIUS,top=desk.y+desk.h+RADIUS;
  const start={x:right+.0045,y:top-.044},corner={x:right+.05,y:top+.02},goal={x:right-.2,y:top+.02};
  Object.assign(a,start,{path:[corner,goal]});assert(distance(a,corner)<.08);assert(clearMove(a,corner));assert(!clearMove(a,goal));moveOnly([a],100);assert(distance(a,goal)<.08,`corner stand-off at ${a.x},${a.y}`);
});
