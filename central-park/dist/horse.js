import {slopeSeconds} from './engine.js';
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
// Reuse the selected human geometry, then recompute time and energy for the horse.
export function horseJourney(human,values={}){
 const opt=horseSettings(values);if(!human)throw new Error('NO_SHARED_HUMAN_ROUTE');
 const legs=human.legs.map(leg=>{
  const path=leg.path.map(edge=>({...edge,mode:'horse',speed:opt.speed,delay:0}));
  return {mode:'horse',path,length:leg.length,seconds:path.reduce((n,e)=>n+slopeSeconds(e,opt.speed),0),snapStart:leg.snapStart?{point:[...leg.snapStart.point]}:undefined,snapEnd:leg.snapEnd?{point:[...leg.snapEnd.point]}:undefined};
 });
 const r={path:legs.flatMap(l=>l.path),length:human.length};r.cost=r.path.reduce((n,e)=>n+e.length*(e.slopeWeight??1),0);
 const energy=r.path.map(e=>horseEdgeEnergy(e,opt));
 const totals=energy.reduce((s,e)=>({gross:s.gross+e.gross,active:s.active+e.active,resting:s.resting+e.resting,locomotion:s.locomotion+e.locomotion,climbing:s.climbing+e.climbing,seconds:s.seconds+e.seconds}),{gross:0,active:0,resting:0,locomotion:0,climbing:0,seconds:0});
 return {agent:'horse',settings:opt,length:r.length,weightedDistance:r.cost,totalSeconds:totals.seconds,kcal:totals.gross,active:totals.active,energy:totals,fare:null,rental:0,walkLength:0,rideLength:0,elevation:{known:r.path.every(e=>Number.isFinite(e.grade)),ascent:r.path.reduce((n,e)=>n+Math.max(0,(e.grade??0)*e.length),0),maxGrade:Math.max(0,...r.path.map(e=>Math.abs(e.grade??0)))},legs,model:{route_policy:'shared-human-geometry',id:'horse-o2-scenario-1',calibrated:false,oxygen_kcal_per_litre:5,gravity:9.80665,joules_per_kcal:4184,notes:'Editable oxygen transport and uphill work scenario; not human MET, feed/digestible energy, or a veterinary prediction.'}};
}
