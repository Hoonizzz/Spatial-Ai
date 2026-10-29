import test from 'node:test';
import assert from 'node:assert/strict';
import {horseFare,horseJourney,horseEdgeEnergy,horseSettings} from '../dist/horse.js';
import {makeArea,journey,buildGraph} from '../dist/engine.js';
import {exampleData} from '../dist/example.js';
test('horse oxygen/work units: 1 km level, rest versus active, no human MET',()=>{
 const e={length:1000,grade:0,slopeWeight:1};const r=horseEdgeEnergy(e);
 assert.equal(r.seconds,600);assert.equal(r.resting,75);assert.equal(r.locomotion,250);assert.equal(r.gross,325);assert.equal(r.active,250);
 assert.equal(horseEdgeEnergy(e,{mass:1000}).gross,650);
 assert.equal(horseEdgeEnergy(e,{speed:12}).resting,37.5);
 const up=horseEdgeEnergy({...e,grade:.1,slopeWeight:1.8});
 assert.ok(Math.abs(up.climbing-500*9.80665*100/(.25*4184))<1e-8);
 const down=horseEdgeEnergy({...e,grade:-.1,slopeWeight:1.8});assert.equal(down.climbing,0);assert.equal(down.seconds,1080);
 assert.throws(()=>horseSettings({mass:0}),/INVALID_HORSE/);
});
test('horse shares all human walking/riding edges without mutating the human route',()=>{
 const d=exampleData();for(const n of d.raw.elements)if(n.type==='node')n.tags={...n.tags,ele:20+(n.lat-40.78)*100};
 for(const w of d.raw.elements)if(w.type==='way')w.tags.horse='no';
 const g=buildGraph(d.raw,makeArea(d.geometry)),human=journey(g,d.a,d.b,d.stations).shortest;
 const before=JSON.stringify(human),horse=horseJourney(human);
 assert.equal(horse.length,human.length);assert.equal(horse.legs.length,human.legs.length);
 for(let i=0;i<horse.legs.length;i++){
  assert.deepEqual(horse.legs[i].path.map(e=>[e.u,e.v,e.length,e.grade,e.fromPoint,e.toPoint]),human.legs[i].path.map(e=>[e.u,e.v,e.length,e.grade,e.fromPoint,e.toPoint]));
  assert.ok(horse.legs[i].path.every(e=>e.mode==='horse'&&e.delay===0));
 }
 assert.equal(JSON.stringify(human),before);assert.equal(horse.model.route_policy,'shared-human-geometry');
 assert.equal(horse.fare,null);assert.notEqual(horse.totalSeconds,human.totalSeconds);
 const total=horse.legs.flatMap(l=>l.path).map(e=>horseEdgeEnergy(e));
 for(const field of ['gross','active','resting','locomotion','climbing','seconds'])assert.ok(Math.abs(horse.energy[field]-total.reduce((n,e)=>n+e[field],0))<1e-8);
 const slow=horseJourney(human,{speed:3});assert.ok(Math.abs(slow.totalSeconds-2*horse.totalSeconds)<1e-6);assert.equal(slow.length,horse.length);
});
test('horse cannot fabricate a route when the shared human route is missing',()=>{
 assert.throws(()=>horseJourney(null),/NO_SHARED_HUMAN_ROUTE/);
 const zero=horseJourney({length:0,legs:[]});assert.equal(zero.totalSeconds,0);assert.equal(zero.kcal,0);assert.equal(zero.fare,null);
});

test('entered carriage tariff rounds extra time units, keeps provenance and never invents a market rate',()=>{
 assert.equal(horseFare(3600),null);
 const q={ridePrice:100,rideMinutes:60,extraPrice:25,extraMinutes:10,fareSource:'Controlled test quote'};
 assert.equal(horseFare(3601,{...q,extraPrice:null}),null);assert.equal(horseFare(1,q).price_basis,'per_carriage');assert.equal(horseFare(0,q).total,0);assert.equal(horseFare(60,q).total,10000);
 assert.equal(horseFare(3600,q).total,10000);assert.equal(horseFare(3600.1,q).total,12500);
 assert.equal(horseFare(3600,q).source,q.fareSource);assert.equal(horseFare(3600,q).market_verified,false);
 assert.equal(horseFare(1801,{...q,ridePrice:75,rideMinutes:30}).total,10000);
 assert.throws(()=>horseFare(-1,q),/INVALID_DURATION/);
 assert.throws(()=>horseFare(1,{ridePrice:-10}),/INVALID_HORSE_FARE/);
 const human={length:1000,legs:[{length:1000,path:[{length:1000,grade:0,slopeWeight:1}]}]};
 const plain=horseJourney(human),priced=horseJourney(human,q);
 assert.deepEqual(plain.energy,priced.energy);assert.equal(plain.weightedDistance,priced.weightedDistance);
 assert.equal(priced.fare.total,10000);
});
