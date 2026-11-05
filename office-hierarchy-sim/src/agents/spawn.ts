import { ROLE, ROLES, STATES, ROOMS, distance } from '../config';
import type { Agent, Config, Room } from '../types';
import { SPACE_SCALE } from '../world/floorplan';
import type { Navigation } from '../world/navigation';
export function spawn(nav:Navigation,c:Config,rng:()=>number):Agent[] {
  const distribution:Record<string,Room[]>={CEO:['WORK'],LEAD:['WORK','WORK','MEETING'],ASSOCIATE:['WORK','WORK','WORK','WORK','LOUNGE','MEETING'],JUNIOR:[...Array(9).fill('WORK'),'LOUNGE','LOUNGE','MEETING']};
  const agents:Agent[]=[];
  for(const role of ROLES)for(let i=0;i<c.counts[role];i++){
    const points=nav.roomPoints[distribution[role][i%distribution[role].length]].filter(p=>role!=='CEO'||p.y>7.5*SPACE_SCALE);let p=points[0];let found=false;
    for(let attempt=0;attempt<10000;attempt++){p=points[Math.floor(rng()*points.length)];if(agents.every(a=>distance(a,p)>=.75)){found=true;break;}}
    if(!found)throw new Error('Cannot place agents with safe separation');
    agents.push({...p,id:`${role}-${i+1}`,role,rank:ROLE[role].rank,heading:rng()*Math.PI*2,radius:.3,fovDeg:c.fov,visionRangeM:c.radii[role],velocity:{x:0,y:0},lastThreatPlan:-Infinity,speedLevel:ROLE[role].base,state:'WANDER',targetAgentId:null,targetPoint:null,path:[],lastSeenSuperiorAt:null,stateStartedAt:0,wcReservation:false,targetRoom:null,episode:null,reactionMode:null,pursuitCooldowns:new Map(),seen:new Map(),stable:new Set(),superiorIds:[],inferiorIds:[],until:0,arrivedAt:null,lastPlan:-Infinity,lastTargetSeen:0,stuck:0,trail:[],distance:0,movingTime:0,stateTime:Object.fromEntries(STATES.map(s=>[s,0])) as Agent['stateTime'],events:Object.fromEntries(STATES.map(s=>[s,0])) as Agent['events'],superiorTime:0,ceoDistance:0,roomTime:Object.fromEntries(ROOMS.map(s=>[s,0])) as Agent['roomTime']});
  }
  return agents;
}
