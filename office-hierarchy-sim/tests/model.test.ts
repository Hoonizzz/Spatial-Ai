import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/simulation';
import { defaults,DT,distance,ROLE,scenarioConfig } from '../src/config';
import { canSee } from '../src/agents/perception';
import { WCManager } from '../src/world/occupancy';
import { Navigation } from '../src/world/navigation';
import { clearMove,walkable,workAnchors,roomAt,hideSlots,WIDTH,HEIGHT,AREA,HEAT_COLS,HEAT_ROWS,desks,scaled,roomBounds } from '../src/world/floorplan';
import { desiredPosition,resolveCollisions } from '../src/agents/movement';
import { runExperiment,summarize } from '../src/experiment-core';
import {freshSeed} from '../src/reset';
import {visionFan} from '../src/render/vision';
import type { Agent } from '../src/types';
const nav=new Navigation();
const sim=()=>new Simulation(defaults(),nav);
function pair(s:Simulation) {const a=s.agents[0],b=s.agents[1];Object.assign(a,{...scaled({x:11,y:7}),heading:0});Object.assign(b,{...scaled({x:13,y:7}),heading:Math.PI});return [a,b];}
test('22 safely placed agents, common FOV, correct role radii and fixed speeds',()=>{
  const s=sim();assert.equal(s.agents.length,22);for(const a of s.agents){assert.equal(a.fovDeg,110);assert.equal(a.visionRangeM,defaults().radii[a.role]);assert(walkable(a));for(const b of s.agents)if(a!==b)assert(distance(a,b)>=.75);}
  assert.deepEqual([ROLE.CEO.base,ROLE.CEO.approach,ROLE.JUNIOR.base,ROLE.JUNIOR.flee],[1,2,3,5]);
  for(const role of ['CEO','LEAD','ASSOCIATE','JUNIOR'] as const)assert.equal(s.agents.filter(a=>a.role===role).length,ROLE[role].count);
});
test('observer-specific distance, angle, walls, doors, desks, transparent-wall experiment',()=>{
  const s=sim(),[a,b]=pair(s),c=s.config;assert(canSee(a,b,c));a.heading=Math.PI;assert(!canSee(a,b,c));
  const wall=roomBounds.WORK.w;
  Object.assign(a,{x:wall-1,y:scaled({x:0,y:6}).y,heading:0,visionRangeM:5});Object.assign(b,{x:wall+1,y:a.y});assert(!canSee(a,b,c));assert(canSee(a,b,{...c,openVisibility:true}));
  a.y=b.y=scaled({x:0,y:9}).y;assert(canSee(a,b,c));
  const desk=desks[0];Object.assign(a,{x:desk.x+.6,y:desk.y-.4,heading:Math.PI/2,visionRangeM:5});Object.assign(b,{x:a.x,y:desk.y+1});assert(canSee(a,b,c));assert(!canSee(a,b,{...c,desksBlockSight:true}));
  Object.assign(a,{x:wall-1,y:scaled({x:0,y:6}).y,heading:0,visionRangeM:3});Object.assign(b,{x:wall+3,y:a.y,heading:Math.PI,visionRangeM:5});assert(!canSee(a,b,{...c,openVisibility:true}));assert(canSee(b,a,{...c,openVisibility:true}));
});
test('all 22 desk anchors and all room connections are reachable through inflated doors',()=>{
  const start=scaled({x:12.5,y:6});for(const p of [...workAnchors,scaled({x:17,y:12}),scaled({x:19,y:5}),scaled({x:11,y:12.5}),...hideSlots]){
    const route=nav.find(start,p,true);assert(route.length,JSON.stringify(p));let prev=start;for(const q of route){assert(clearMove(prev,q,true));prev=q;}assert(distance(route.at(-1)!,p)<.01);
  }
  assert(!clearMove(scaled({x:13,y:6}),scaled({x:15,y:6})));assert(clearMove(scaled({x:13,y:9}),scaled({x:15,y:9})));
});
test('perception is asymmetric: higher rank approaches, lower rank reacts once per episode',()=>{
  const s=sim(),[a,b]=pair(s);s.agents=[a,b];s.config.pretendProbability=1;s.config.speedMultiplier=0;
  for(let i=0;i<6;i++)s.step();assert.equal(s.agents[0].state,'APPROACH');assert.equal(s.agents[1].state,'PRETEND_WORK');assert.equal(s.agents[1].events.PRETEND_WORK,1);
  for(let i=0;i<10;i++)s.step();assert.equal(s.agents[1].events.PRETEND_WORK,1);
});
test('avoiding a CEO overrides a lead pursuing a junior; cooldown is interruptible',()=>{
  const s=sim(),lead=s.agents[1],ceo=s.agents[0],junior=s.agents.at(-1)!;s.config.pretendProbability=1;
  lead.state='APPROACH';lead.targetAgentId=junior.id;s.decide(lead,{superiors:[ceo],inferiors:[junior]});assert.equal(lead.state,'PRETEND_WORK');assert.equal(lead.targetAgentId,ceo.id);
  lead.state='COOLDOWN';lead.episode=null;s.decide(lead,{superiors:[ceo],inferiors:[]});assert.equal(lead.state,'PRETEND_WORK');
});
test('WC admission includes reservations; ten simultaneous requests admit only four',()=>{
  const wc=new WCManager();for(let i=0;i<10;i++)assert.equal(wc.tryReserve(`a${i}`,0),i<4);assert.equal(wc.reservations.size,4);assert.equal(wc.full,6);
  assert(wc.enter('a0'));assert(!wc.enter('a9'));assert.equal(wc.occupants.size+wc.reservations.size,4);wc.exitOrCancel('a0');assert(wc.tryReserve('a9',1));assert.equal(new Set(wc.slots.values()).size,4);
});
test('full WC sends agents to meeting/lounge, expired and cancelled bookings do not leak',()=>{
  const s=sim();s.config.pretendProbability=0;s.config.wcEscapeProbability=1;s.wc.capacity=4;for(let i=0;i<4;i++)s.wc.tryReserve(`occupied-${i}`,0);
  const a=s.agents[1],ceo=s.agents[0];s.react(a,ceo);assert.equal(a.state,'FLEE_TO_WC');s.step();assert.equal(s.agents[1].state,'FLEE_TO_ROOM');assert.equal(s.wc.reservations.size,4);
  const t=sim(),b=t.agents[1];assert(t.wc.tryReserve(b.id,-13));b.state='FLEE_TO_WC';b.wcReservation=true;t.step();assert.equal(t.wc.reservations.size,0);assert.equal(b.wcReservation,true); // b was the old snapshot; current record has been replaced.
  assert.equal(t.agents[1].wcReservation,false);assert.equal(t.agents[1].state,'FLEE_TO_ROOM');
  const u=sim(),d=u.agents[1];u.wc.tryReserve(d.id,0);d.wcReservation=true;d.state='FLEE_TO_WC';u.transition(d,'COOLDOWN','test cancel');assert(!u.wc.reservations.has(d.id));
});
test('motion respects physical walls and swept mutual separation',()=>{
  const s=sim(),[a,b]=pair(s);Object.assign(a,{x:roomBounds.WORK.w-.5,y:scaled({x:0,y:6}).y,path:[scaled({x:15,y:6})],speedLevel:5});const p=desiredPosition(a,[a],DT,1);assert(clearMove(a,p));
  Object.assign(a,{x:11,y:6});Object.assign(b,{x:11.7,y:6});const out=resolveCollisions([a,b],[{x:11.2,y:6},{x:11.5,y:6}]);assert(distance(out[0],out[1])>=.6);
});
test('same seed and settings produce identical state after 1,000 fixed steps',()=>{
  const a=sim(),b=sim();for(let i=0;i<1000;i++){a.step();b.step();}assert.deepEqual(a.exportData(),b.exportData());
  assert.equal(a.agents[0].stateTime.PHONE,0);assert(a.metrics().some(m=>m.phonePercent>0));
});
test('scenario initial positions remain identical; only the chosen experimental parameter changes',()=>{
  const a=sim();for(let i=1;i<5;i++){const b=new Simulation(scenarioConfig(i),nav);assert.deepEqual(a.agents.map(a=>[a.x,a.y,a.heading]),b.agents.map(a=>[a.x,a.y,a.heading]));}
  const rows=[runExperiment(42,0,1,undefined,nav),runExperiment(43,0,1,undefined,nav)];const m=summarize(rows)[0];assert.equal(m.n,2);assert(Number.isFinite(m.distance.variance));
});
test('area doubles with physical agent and desk sizes unchanged; heat covers the enlarged world',()=>{
  const s=sim();assert(Math.abs(AREA-616)<1e-8);assert(Math.abs(WIDTH*HEIGHT-2*308)<1e-8);assert.equal(desks.length,22);assert.equal(desks[0].w,1.2);assert.equal(s.agents[0].radius,.3);assert.equal(s.heat.length,HEAT_COLS*HEAT_ROWS);
});
test('room escape supports meeting and lounge, reachable routes, room holds and exposed-refuge relocation',()=>{
  const s=sim(),a=s.agents.at(-1)!,superior=s.agents[0];s.config.pretendProbability=0;s.config.wcEscapeProbability=0;
  s.react(a,superior);assert.equal(a.state,'FLEE_TO_ROOM');assert(['MEETING','LOUNGE'].includes(a.targetRoom!));assert(a.path.length);let prev=a;for(const p of a.path){assert(clearMove(prev,p));prev={...a,...p};}
  for(const room of ['MEETING','LOUNGE'] as const){
    Object.assign(a,nav.roomPoints[room][Math.floor(nav.roomPoints[room].length/2)]);a.path=[];a.targetRoom=room;a.state='FLEE_TO_ROOM';s.decide(a,{superiors:[],inferiors:[]});assert.equal(a.state,'ROOM_HIDE');assert.equal(a.targetRoom,room);
    s.time+=3;s.decide(a,{superiors:[superior],inferiors:[]});assert.equal(a.state,'FLEE_TO_ROOM');assert.notEqual(a.targetRoom,room);assert(a.path.length);
  }
});
test('zero-WC-share never reserves WC, and a closed WC still permits room refuges',()=>{
  const s=sim();s.config.pretendProbability=0;s.config.wcEscapeProbability=0;
  for(const a of s.agents.filter(a=>a.role==='JUNIOR')){s.react(a,s.agents[0]);assert.equal(a.state,'FLEE_TO_ROOM');}
  assert.equal(s.wc.reservations.size,0);s.wc.capacity=0;s.config.wcEscapeProbability=1;s.beginEscape(s.agents[1],s.agents[0]);assert.equal(s.agents[1].state,'FLEE_TO_ROOM');
});
test('fresh reset seeds differ; replaying the resulting seed reproduces a safe layout',()=>{
  const original=defaults(),next=freshSeed(original.seed);assert.notEqual(next,original.seed);assert(next>=0&&next<=4294967295);const a=new Simulation({...original,seed:next},nav),b=new Simulation({...original,seed:next},nav);assert.deepEqual(a.exportData(),b.exportData());assert.notDeepEqual(a.agents.map(a=>[a.x,a.y]),sim().agents.map(a=>[a.x,a.y]));
});
test('every rank has a clipped visual field matching its actual range and walls',()=>{
  const s=sim();for(const a of s.agents){const fan=visionFan(a,s.config);assert.equal(fan.length,49);for(const p of fan){assert(distance(a,p)<=a.visionRangeM+1e-8);assert(p.x>=-1e-7&&p.x<=WIDTH+1e-7&&p.y>=-1e-7&&p.y<=HEIGHT+1e-7);}}
});
test('30-minute run: no wall penetration, WC overflow, overlapping agents or permanent immobilization', {timeout:360000},()=>{
  const s=sim(),recent=new Map<string,number>();let checkpoints=0;
  for(let n=0;n<36000;n++){
    const old=s.agents.map(a=>({x:a.x,y:a.y}));s.step();
    assert(s.wc.occupants.size+s.wc.reservations.size<=4);assert(s.agents.filter(a=>roomAt(a)==='WC').length<=4);
    for(let i=0;i<s.agents.length;i++){
      const a=s.agents[i];assert(clearMove(old[i],a,true),`${a.id} wall collision at ${s.time}`);
      for(let j=i+1;j<s.agents.length;j++)assert(distance(a,s.agents[j])>=.6-1e-7,`overlap at ${s.time}`);
      assert(!(a.role==='CEO'&&a.state==='PHONE'));
    }
    if(n%6000===5999){checkpoints++;for(const a of s.agents){assert(a.distance-(recent.get(a.id)??0)>1,`${a.id} immobilized over 300 seconds`);recent.set(a.id,a.distance);}}
  }
  assert.equal(checkpoints,6);for(const room of ['WORK','MEETING','LOUNGE'] as const)assert(s.agents.some(a=>a.roomTime[room]>0));
});
