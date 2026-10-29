import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeFacilities,facilityAvailability,classifyFacility,tripMetrics} from '../dist/proximity.js';
import {journey,search,fare,buildGraph} from '../dist/engine.js';
import {normalizeStations,loadStations} from '../dist/data.js';
function graph(points){
 const nodes=new Map(points.map(([id,x,y=0])=>[id,{p:[x,y]}])),edges=[],out=new Map();
 const add=(u,v,mode='walk',weight=1)=>{const e={id:edges.length,u,v,way:edges.length+1,mode,length:Math.hypot(nodes.get(u).p[0]-nodes.get(v).p[0],nodes.get(u).p[1]-nodes.get(v).p[1]),speed:15,delay:0,grade:0,slopeWeight:weight};edges.push(e);if(!out.has(u))out.set(u,[]);out.get(u).push(e);return e;};
 return {nodes,edges,out,add,restrictions:new Map(),area:{contains:p=>p[0]>=0&&p[0]<=6000},version:'test'};
}
const station=(id,x,extra={})=>({id,name:id,p:[x,0],installed:true,renting:true,returning:true,ebikes:2,docks:2,timestamp:Date.now()/1000,...extra});
function line(){const g=graph([...Array.from({length:11},(_,i)=>[i,i*80]),[99,5000],[100,5080]]);for(let i=0;i<10;i++){g.add(i,i+1);g.add(i+1,i);g.add(i,i+1,'ride');g.add(i+1,i,'ride');}g.add(99,100);g.add(100,99);return g;}
test('T02–T05: 2 min empty, 4 min usable, 7 min far, and zero return docks',()=>{
 const g=line(),stations=[station('empty',160,{ebikes:0}),station('four',320),station('seven',560),station('full',800,{docks:0})];
 const p=analyzeFacilities(g,[0,0],[800,0],stations,{walkThresholdMin:5});const by=new Map(p.origin.map(r=>[r.station_id,r]));
 assert.equal(by.get('empty').state,'NEAR_UNAVAILABLE');assert.equal(by.get('empty').proximity,'HIGH');
 assert.equal(by.get('four').state,'NEAR_AVAILABLE');assert.equal(by.get('four').walk_time_min,4);
 assert.equal(by.get('seven').state,'FAR_AVAILABLE');assert.equal(by.get('seven').eligible,true);
 assert.equal(p.destination.find(r=>r.station_id==='full').eligible,false);assert.equal(p.nearest.departure.station_id,'four');
 assert.equal(p.baseline.mode,'DIRECT_WALKING');assert.equal(p.baseline.distance_m,800);assert.equal(p.baseline.time_min,10);
});
test('T01/T08/T09: boundary, disconnected, missing and stale statuses stay explicit',()=>{
 const g=line(),stations=[station('disconnected',5000),station('stale',320,{timestamp:Date.now()/1000-301}),station('missing',160,{installed:null})];
 const p=analyzeFacilities(g,[0,0],[800,0],stations);assert.equal(p.origin.find(r=>r.station_id==='disconnected').state,'DISCONNECTED');
 for(const id of ['stale','missing']){const r=p.origin.find(r=>r.station_id===id);assert.equal(r.availability,'STATUS_UNKNOWN');assert.equal(r.state,'UNKNOWN');assert.equal(r.eligible,false);}
 assert.throws(()=>analyzeFacilities(g,[-1,0],[800,0],stations),/OUT_OF_STUDY_AREA/);
 const trip=tripMetrics({},p);assert.equal(trip.route_status,'NO_FEASIBLE_CITIBIKE_ROUTE');assert.equal(trip.estimated_cost_usd,null);
 assert.equal(facilityAvailability(station('failed-refresh',160,{status_error:'Network failed'}),'pickup').state,'STATUS_UNKNOWN');
 assert.equal(facilityAvailability(station('future',0,{timestamp:Date.now()/1000+100}),'pickup').state,'STATUS_UNKNOWN');
});
test('destination proximity follows station → B on directed pedestrian edges',()=>{
 const g=graph([[0,0],[1,80],[2,160]]);g.add(0,1);g.add(1,2);
 const p=analyzeFacilities(g,[160,0],[160,0],[station('middle',80)]);
 assert.equal(p.origin[0].state,'DISCONNECTED');assert.equal(p.destination[0].walk_time_min,1);assert.equal(p.destination[0].state,'NEAR_AVAILABLE');
});
test('T10–T12: threshold/status/weight changes reuse walking analysis and do not redefine proximity as a hard cap',()=>{
 const g=line(),s=[station('far',560)],cache={};
 const p=analyzeFacilities(g,[0,0],[800,0],s,{walkThresholdMin:5,mass:70},cache);
 const q=analyzeFacilities(g,[0,0],[800,0],s,{walkThresholdMin:10,mass:100},cache);
 assert.equal(p.origin[0].state,'FAR_AVAILABLE');assert.equal(q.origin[0].state,'NEAR_AVAILABLE');assert.equal(q.search_builds,p.search_builds);assert.ok(q.baseline.estimated_energy_kcal>p.baseline.estimated_energy_kcal);
 s[0].ebikes=0;const r=analyzeFacilities(g,[0,0],[800,0],s,{walkThresholdMin:10},cache);assert.equal(r.origin[0].state,'NEAR_UNAVAILABLE');assert.equal(r.search_builds,q.search_builds);
});
test('T07: nearest independent facilities need not be the optimal full station pair; pruning is reported',()=>{
 const g=graph([[0,0],[1,100],[2,200],[3,900],[4,1000],[5,100,1000]]);
 for(const [u,v] of [[0,1],[0,2],[3,4]]){g.add(u,v);g.add(v,u);}
 g.add(1,5,'ride');g.add(5,2,'ride');g.add(2,3,'ride');
 const stations=[station('nearest',100,{docks:0}),station('optimal',200,{docks:0}),station('return',900,{ebikes:0})];
 const p=analyzeFacilities(g,[0,0],[1000,0],stations);assert.equal(p.nearest.departure.station_id,'nearest');
 const all=journey(g,[0,0],[1000,0],stations,{routingObjective:'distance',maxStationCandidates:0});assert.equal(all.shortest.start.id,'optimal');assert.equal(all.shortest.length,1000);
 const capped=journey(g,[0,0],[1000,0],stations,{routingObjective:'distance',maxStationCandidates:1});assert.equal(capped.shortest.start.id,'nearest');assert.equal(capped.candidateSelection.truncated,true);
 const threshold=journey(g,[0,0],[1000,0],stations,{routingObjective:'distance',walkThresholdMin:.5});assert.equal(threshold.shortest.start.id,'optimal');
});
test('physical distance and slope-weighted distance are distinct, and reach bands use actual edge time',()=>{
 const g=graph([[0,0],[1,100],[2,200],[3,100,100]]);g.add(0,1,'ride',3);g.add(1,2,'ride',3);g.add(0,3,'ride');g.add(3,2,'ride');
 assert.equal(search(g,[0,0],'ride','distance').end([200,0]).length,200);assert.ok(search(g,[0,0],'ride','length').end([200,0]).length>200);
 const p=analyzeFacilities(line(),[0,0],[800,0],[]);for(const band of p.reachability.origin)assert.ok(band.points[1][0]<=band.minutes*80+1e-7);
});
test('GBFS joins by ID, keeps missing metadata status UNKNOWN, and uses vehicle type definitions',()=>{
 const info={data:{stations:[{station_id:'a',name:'A',lon:-73.97,lat:40.78},{station_id:'b',name:'B',lon:-73.971,lat:40.78}]}},status={last_updated:Date.now()/1000,data:{stations:[{station_id:'b',is_installed:1,is_renting:1,is_returning:1,num_docks_available:2,vehicle_types_available:[{vehicle_type_id:'opaque-2',count:3},{vehicle_type_id:'scooter',count:20}],num_bikes_disabled:50}]}};
 const types={data:{vehicle_types:[{vehicle_type_id:'opaque-2',form_factor:'bicycle',propulsion_type:'electric_assist'},{vehicle_type_id:'scooter',form_factor:'scooter',propulsion_type:'electric'}]}};
 const [a,b]=normalizeStations(info,status,{contains:()=>true},types);assert.equal(a.id,'a');assert.equal(a.installed,null);assert.equal(a.timestamp,null);assert.equal(b.ebikes,3);assert.equal(b.docks,2);
 assert.equal(normalizeStations(info,status,{contains:()=>true})[1].ebikes,null);
});
test('T13: 8 min 1 sec single e-bike fare bills 9 minutes = USD 8.68',()=>assert.equal(fare(481).total,868));

test('GBFS feed discovery supports direct feeds and preserves UNKNOWN on status outage',async()=>{
 const saved=globalThis.fetch;let outage=false;
 const info={data:{stations:[{station_id:'x',name:'X',lon:-73.97,lat:40.78}]}};
 globalThis.fetch=async url=>{
  if(String(url).includes('gbfs.json'))return new Response(JSON.stringify({version:'3.0',data:{feeds:[{name:'station_information',url:'https://fixture.invalid/info'},{name:'station_status',url:'https://fixture.invalid/status'},{name:'vehicle_types',url:'https://fixture.invalid/types'}]}}));
  if(String(url).endsWith('/info'))return new Response(JSON.stringify(info));
  if(String(url).endsWith('/types'))return new Response(JSON.stringify({data:{vehicle_types:[]}}));
  if(outage)return new Response('Unavailable',{status:503});
  return new Response(JSON.stringify({last_updated:new Date().toISOString(),data:{stations:[{station_id:'x',num_ebikes_available:2,num_docks_available:1,is_installed:true,is_renting:true,is_returning:true}]}}));
 };
 try{const a=await loadStations({contains:()=>true});assert.equal(a.stations[0].ebikes,2);assert.equal(facilityAvailability(a.stations[0],'pickup').state,'AVAILABLE');outage=true;const b=await loadStations({contains:()=>true});assert.equal(b.stations.length,1);assert.equal(b.stations[0].ebikes,null);assert.match(b.status_error,/503/);assert.equal(facilityAvailability(b.stations[0],'pickup').state,'STATUS_UNKNOWN');}finally{globalThis.fetch=saved;}
});

test('T06: bike-forbidden network cannot yield a fabricated multimodal route or fare',()=>{
 const g=line();g.edges=g.edges.filter(e=>e.mode==='walk');g.out=new Map();for(const e of g.edges){if(!g.out.has(e.u))g.out.set(e.u,[]);g.out.get(e.u).push(e);}
 const stations=[station('pickup',160,{docks:0}),station('return',720,{ebikes:0})];
 assert.throws(()=>journey(g,[0,0],[800,0],stations,{routingObjective:'distance'}),/NO_ROUTE_WITHIN_STUDY_AREA/);
 const p=analyzeFacilities(g,[0,0],[800,0],stations);assert.equal(p.baseline.mode,'DIRECT_WALKING');assert.equal(tripMetrics({},p).estimated_cost_usd,null);
});

test('pedestrian barriers and missing OSM nodes cannot create invented access edges',()=>{
 const area={contains:()=>true,park:()=>false},nodes=[{type:'node',id:1,lon:-73.97,lat:40.78},{type:'node',id:3,lon:-73.969,lat:40.78}];
 const missing=buildGraph({elements:[...nodes,{type:'way',id:1,nodes:[1,2,3],tags:{highway:'footway'}}]},area);assert.equal(missing.edges.length,0);
 for(const tags of [{foot:'no'},{barrier:'wall'},{access:'private'}]){const blocked=buildGraph({elements:[nodes[0],{...nodes[1],tags},{type:'way',id:1,nodes:[1,3],tags:{highway:'footway'}}]},area);assert.ok(blocked.edges.every(e=>e.mode!=='walk'));}
});
