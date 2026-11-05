import { Simulation } from './simulation';
import { defaults, scenarioConfig, SCENARIOS, DT } from './config';
import type { Config } from './types';
import { Navigation } from './world/navigation';
export interface BatchRow { scenario:string; seed:number; counts:string; population:number; seconds:number; escapes:number; phonePercent:number; distance:number; wcUtilization:number; wcEscapeProbability:number; fov:number; attentionRadii:string; pretendProbability:number; speedMultiplier:number; avoidanceDuration:number; pursuitDuration:number; wcCapacity:number; openVisibility:boolean; desksBlockSight:boolean; closeReevaluate:boolean }
export function runExperiment(seed:number,scenario:number,seconds:number,base:Config=defaults(),nav?:Navigation):BatchRow {
  const c=scenarioConfig(scenario,{...structuredClone(base),seed});const s=new Simulation(c,nav);
  for(let i=0;i<Math.round(seconds/DT);i++)s.step();
  const m=s.metrics();return {scenario:SCENARIOS[scenario],seed,counts:Object.values(c.counts).join('/'),population:s.agents.length,seconds:s.time,fov:c.fov,wcEscapeProbability:c.wcEscapeProbability,attentionRadii:Object.values(c.radii).join('/'),pretendProbability:c.pretendProbability,speedMultiplier:c.speedMultiplier,avoidanceDuration:c.avoidanceDuration,pursuitDuration:c.pursuitDuration,wcCapacity:c.wcCapacity,openVisibility:c.openVisibility,desksBlockSight:c.desksBlockSight,closeReevaluate:c.closeReevaluate,escapes:m.reduce((n,a)=>n+a.wcEscape+a.roomEscape+a.officeEscape,0),phonePercent:s.agents.reduce((n,a)=>n+a.stateTime.PHONE,0)/Math.max(1,s.time*s.agents.length)*100,distance:m.reduce((n,a)=>n+a.distance,0),wcUtilization:s.exportData().wc.utilization};
}
export function summarize(rows:BatchRow[]) {
  return SCENARIOS.map(scenario=>{const r=rows.filter(r=>r.scenario===scenario);const stats=(key:'escapes'|'phonePercent'|'distance')=>{const mean=r.reduce((n,a)=>n+a[key],0)/r.length;return {mean,variance:r.reduce((n,a)=>n+(a[key]-mean)**2,0)/Math.max(1,r.length-1)};};return {scenario,n:r.length,escapes:stats('escapes'),phone:stats('phonePercent'),distance:stats('distance')};});
}
