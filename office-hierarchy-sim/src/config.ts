import type { Config, Role, State, Room } from './types';
export const DT = .05;
export const ROLES: Role[] = ['CEO', 'LEAD', 'ASSOCIATE', 'JUNIOR'];
export const STATES: State[] = ['WANDER','PHONE','APPROACH','PRETEND_WORK','FLEE_TO_WC','FLEE_IN_OFFICE','WC_HIDE','FLEE_TO_ROOM','ROOM_HIDE','COOLDOWN'];
export const ROOMS: Room[] = ['WORK','MEETING','LOUNGE','WC','CORRIDOR'];
export const ROLE = {
  CEO: { rank: 4, count: 1, base: 1, approach: 2, flee: 2, color: '#ac4b32', label: 'CEO' },
  LEAD: { rank: 3, count: 3, base: 2, approach: 3, flee: 4, color: '#946524', label: 'Lead' },
  ASSOCIATE: { rank: 2, count: 6, base: 2, approach: 3, flee: 4, color: '#286d78', label: 'Associate' },
  JUNIOR: { rank: 1, count: 12, base: 3, approach: 3, flee: 5, color: '#6653a3', label: 'Junior' }
};
export const defaults = (): Config => ({ counts: {CEO:1,LEAD:3,ASSOCIATE:6,JUNIOR:12}, seed: 42, fov: 110, radii: { CEO:3, LEAD:2.5, ASSOCIATE:3.5, JUNIOR:4.5 }, pretendProbability:.45, wcCapacity:4, avoidanceDuration:2, pursuitDuration:8, speedMultiplier:1, desksBlockSight:false, openVisibility:false, closeReevaluate:false, wcEscapeProbability:.25 });
export const SCENARIOS = ['Baseline','Equal vision','Strong hierarchy','No WC escape','High visibility'];
export function scenarioConfig(index: number, base = defaults()): Config {
  const c = structuredClone(base);
  if (index === 1) c.radii = {CEO:6,LEAD:6,ASSOCIATE:6,JUNIOR:6};
  if (index === 2) c.radii = {CEO:2,LEAD:4,ASSOCIATE:7,JUNIOR:11};
  if (index === 3) c.wcCapacity = 0;
  if (index === 4) c.openVisibility = true;
  return c;
}
export function random(seed: number) {
  let n = seed >>> 0;
  return () => { n += 0x6D2B79F5; let t = n; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export const distance = (a: {x:number;y:number}, b: {x:number;y:number}) => Math.hypot(a.x-b.x,a.y-b.y);

export function validatePopulation(counts:Record<Role,number>) {
  for(const role of ROLES)if(!Number.isInteger(counts[role])||counts[role]<0||counts[role]>40)throw new Error(`${ROLE[role].label} population must be an integer from 0 to 40.`);
  if(ROLES.reduce((n,r)=>n+counts[r],0)>120)throw new Error('Total population must not exceed 120.');
}
export function segmentDistance(p:{x:number;y:number},a:{x:number;y:number},b:{x:number;y:number}) {
 const dx=b.x-a.x,dy=b.y-a.y,d=dx*dx+dy*dy,t=d?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/d)):0;
 return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
}
