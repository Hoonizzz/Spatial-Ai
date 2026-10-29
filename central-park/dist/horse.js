import {buildGraph,search,coordinates,slopeSeconds} from './engine.js';
export const HORSE_DEFAULTS={mass:500,speed:6,restO2:3,costO2:.1,efficiency:.25};
export function horseSettings(values={}){
 const opt={...HORSE_DEFAULTS,...values};
 for(const [name,min,max] of [['mass',100,1200],['speed',2,12],['restO2',1,10],['costO2',.01,1],['efficiency',.1,.4]])if(!Number.isFinite(opt[name])||opt[name]<min||opt[name]>max)throw new Error('INVALID_HORSE_SETTINGS');
 return opt;
}
// Scenario model, not a fitted veterinary equation. O2 coefficients are editable.
// restO2: ml O2/kg/min; costO2: ml O2/kg/m; 5 kcal per litre O2.
export function horseEdgeEnergy(edge,values={}){
 const o=horseSettings(values),seconds=slopeSeconds(edge,o.speed),minutes=seconds/60;
 const resting=o.mass*o.restO2*minutes*5/1000;
 const locomotion=o.mass*o.costO2*edge.length*5/1000;
 const ascent=Math.max(0,(edge.grade??0)*edge.length);
 const climbing=o.mass*9.80665*ascent/(o.efficiency*4184);
 return {gross:resting+locomotion+climbing,active:locomotion+climbing,resting,locomotion,climbing,seconds};
}
export function buildHorseGraph(raw,area){
 const originals=new Map();
 const elements=raw.elements.filter(e=>{
  if(e.type==='relation')return false;
  if(e.type!=='way')return true;
  const t=e.tags??{},permitted=['yes','designated','permissive'].includes(t.horse)||(t.highway==='bridleway'&&!['no','private','dismount'].includes(t.horse));
  if(!permitted||!t.highway||['steps','motorway','motorway_link','construction','proposed'].includes(t.highway)||t['horse:conditional']||t['access:conditional']||t['oneway:horse:conditional']||t['oneway:conditional']||['no','private'].includes(t.access))return false;
  originals.set(e.id,e);return true;
 }).map(e=>e.type==='way'?{...e,tags:{highway:'path',foot:'yes'}}:e);
 const base=buildGraph({elements},area),edges=[],out=new Map();
 for(const e of base.edges){
  const way=originals.get(e.way),dir=way.tags['oneway:horse'];
  const forward=way.nodes.indexOf(e.u)<way.nodes.indexOf(e.v);
  if((['yes','1','true'].includes(dir)&&!forward)||(dir==='-1'&&forward))continue;
  // Do not route a horse through an unverified gate or barrier.
  if([e.u,e.v].some(id=>{const t=base.nodes.get(id).tags??{};return t['horse:conditional']||t['access:conditional']||['no','private','dismount'].includes(t.horse)||(t.barrier&&!['entrance'].includes(t.barrier)&&!['yes','designated','permissive'].includes(t.horse));}))continue;
  const edge={...e,id:edges.length,mode:'horse',speed:12,delay:0};edges.push(edge);if(!out.has(edge.u))out.set(edge.u,[]);out.get(edge.u).push(edge);
 }
 // Explicit horse turn restrictions; unknown via-way restrictions block entry.
 const restrictions=new Map();for(const r of raw.elements.filter(e=>e.type==='relation'&&e.tags?.['restriction:horse'])){
  if(r.tags.except?.split(';').includes('horse'))continue;
  const via=r.members?.find(m=>m.role==='via'),from=r.members?.find(m=>m.role==='from'),to=r.members?.find(m=>m.role==='to');if(!via||!from||!to)continue;
  if(via.type!=='node'){for(const e of edges)if(e.way===from.ref)e.blocked=true;continue;}
  const key=via.ref+':'+from.ref;if(!restrictions.has(key))restrictions.set(key,[]);restrictions.get(key).push({to:to.ref,type:r.tags['restriction:horse']});
 }
 return {...base,edges,out,restrictions};
}
export function horseJourney(g,a,b,values={}){
 const opt=horseSettings(values);if(![...a,...b].every(Number.isFinite))throw new Error('INVALID_COORDINATE');
 if(!g.area.contains(a)||!g.area.contains(b))throw new Error('OUTSIDE_AREA');
 if(!g.edges.length)throw new Error('NO_HORSE_NETWORK');
 const r=search(g,a,'horse','length',opt).end(b);if(!r)throw new Error('NO_HORSE_ROUTE');
 const energy=r.path.map(e=>horseEdgeEnergy(e,opt));
 const totals=energy.reduce((s,e)=>({gross:s.gross+e.gross,active:s.active+e.active,resting:s.resting+e.resting,locomotion:s.locomotion+e.locomotion,climbing:s.climbing+e.climbing,seconds:s.seconds+e.seconds}),{gross:0,active:0,resting:0,locomotion:0,climbing:0,seconds:0});
 return {agent:'horse',settings:opt,length:r.length,weightedDistance:r.cost,totalSeconds:totals.seconds,kcal:totals.gross,active:totals.active,energy:totals,fare:null,rental:0,walkLength:0,rideLength:0,elevation:{known:r.path.every(e=>Number.isFinite(e.grade)),ascent:r.path.reduce((n,e)=>n+Math.max(0,(e.grade??0)*e.length),0),maxGrade:Math.max(0,...r.path.map(e=>Math.abs(e.grade??0)))},legs:[r],model:{id:'horse-o2-scenario-1',calibrated:false,oxygen_kcal_per_litre:5,gravity:9.80665,joules_per_kcal:4184,notes:'Editable oxygen transport and uphill work scenario; not human MET, feed/digestible energy, or a veterinary prediction.'}};
}
