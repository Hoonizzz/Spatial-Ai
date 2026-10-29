import test from 'node:test';
import assert from 'node:assert/strict';
import {buildHorseGraph,horseJourney,horseEdgeEnergy,horseSettings} from '../dist/horse.js';
import {project,unproject,makeArea,journey,buildGraph} from '../dist/engine.js';
import {exampleData} from '../dist/example.js';
const area={park:()=>true,contains:()=>true};
function raw(tags={highway:'bridleway'}){return {elements:[{type:'node',id:1,lon:-73.97,lat:40.78,tags:{ele:10}},{type:'node',id:2,lon:-73.969,lat:40.78,tags:{ele:15}},{type:'way',id:10,nodes:[1,2],tags}]};}
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
test('horse route requires explicit mapped access, respects bans, steps and barriers',()=>{
 for(const tags of [{highway:'path',bicycle:'yes'},{highway:'bridleway',horse:'no'},{highway:'steps',horse:'yes'},{highway:'bridleway','horse:conditional':'yes @ (sunrise-sunset)'}])assert.equal(buildHorseGraph(raw(tags),area).edges.length,0);
 assert.equal(buildHorseGraph(raw(),area).edges.length,2);
 const d=raw({highway:'path',horse:'designated'});d.elements[1].tags.barrier='gate';assert.equal(buildHorseGraph(d,area).edges.length,0);d.elements[1].tags.horse='yes';assert.equal(buildHorseGraph(d,area).edges.length,2);
});
test('horse one-way, partial edge timing and no fallback to bike-only routes',()=>{
 const d=raw({highway:'path',horse:'yes','oneway:horse':'yes'}),g=buildHorseGraph(d,area);
 const a=project([-73.9699,40.78]),b=project([-73.9692,40.78]);
 const j=horseJourney(g,a,b);assert.ok(j.length>50);assert.ok(Math.abs(j.totalSeconds-j.length/(6/3.6)*g.edges[0].slopeWeight)<1e-8);assert.equal(j.fare,null);assert.equal(j.model.calibrated,false);
 assert.throws(()=>horseJourney(g,b,a),/NO_HORSE_ROUTE/);
 assert.throws(()=>horseJourney(buildHorseGraph(raw({highway:'cycleway'}),area),a,b),/NO_HORSE_NETWORK/);
 const far=project([-73.96,40.78]);assert.throws(()=>horseJourney(g,a,far),/SNAP_TOO_FAR/);
});
test('synthetic horse route is independent of bike stations, has different path/time and energy',()=>{
 const d=exampleData(),a=makeArea(d.geometry),g=buildHorseGraph(d.raw,a),h=horseJourney(g,d.a,d.b);
 const person=journey(buildGraph(d.raw,a),d.a,d.b,d.stations);
 assert.notEqual(h.totalSeconds,person.shortest.totalSeconds);assert.notEqual(h.length,person.shortest.length);
 assert.ok(h.legs[0].path.some(e=>g.nodes.has(e.u)));assert.equal(h.settings.mass,500);assert.equal(h.settings.speed,6);assert.ok(h.kcal>0);assert.ok(h.active<h.kcal);
 const slow=horseJourney(g,d.a,d.b,{speed:3});assert.ok(Math.abs(slow.totalSeconds-2*h.totalSeconds)<1e-6);
});
