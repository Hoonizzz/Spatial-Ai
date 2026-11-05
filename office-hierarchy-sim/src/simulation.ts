import type { Agent, Config, Perception, Point, Role, Room, SimEvent, State } from './types';
import { defaults, distance, DT, random, ROLE, ROLES, STATES, ROOMS } from './config';
import { Navigation } from './world/navigation';
import { WCManager } from './world/occupancy';
import { hideSlots, workAnchors, roomAt, sightBlocked, clearMove, WIDTH, HEIGHT, HEAT_COLS, HEAT_ROWS, AREA } from './world/floorplan';
import { spawn } from './agents/spawn';
import { perceive } from './agents/perception';
import { desiredPosition, resolveCollisions } from './agents/movement';

export class Simulation {
  config:Config; nav:Navigation; wc:WCManager; agents:Agent[]; rng:()=>number; time=0; steps=0;
  events:SimEvent[]=[]; heat=new Float64Array(HEAT_COLS*HEAT_ROWS); recoveries=0;
  constructor(c=defaults(),nav?:Navigation) { this.config=structuredClone(c);this.nav=nav??new Navigation();this.rng=random(c.seed);this.wc=new WCManager(c.wcCapacity);this.agents=spawn(this.nav,c,this.rng); }
  transition(a:Agent,to:State,reason:string) {
    if(a.state===to)return;
    this.events.push({t:this.time,agent:a.id,from:a.state,to,reason});if(this.events.length>500)this.events.shift();
    if(to!=='FLEE_TO_ROOM'&&to!=='ROOM_HIDE')a.targetRoom=to==='FLEE_TO_WC'||to==='WC_HIDE'?'WC':null;
    a.state=to;a.stateStartedAt=this.time;a.events[to]++;a.arrivedAt=null;a.until=0;a.path=[];a.targetPoint=null;a.targetAgentId=null;
    if(to!=='FLEE_TO_WC'&&to!=='WC_HIDE'&&roomAt(a)!=='WC'){this.wc.exitOrCancel(a.id);a.wcReservation=false;}
  }
  plan(a:Agent,p:Point,allowWC=roomAt(a)==='WC'||a.state==='FLEE_TO_WC') {
    a.targetPoint={...p};a.path=this.nav.find(a,p,allowWC);a.lastPlan=this.time;return a.path.length>0;
  }
  patrol(a:Agent) {
    const r=this.rng(),room:Room=r<.6?'WORK':r<.8?'MEETING':'LOUNGE';const points=this.nav.roomPoints[room];
    for(let i=0;i<12;i++){const p=points[Math.floor(this.rng()*points.length)];if(distance(a,p)>1&&this.plan(a,p))return;}
  }
  escape(a:Agent,superior:Agent) {
    const points=this.nav.roomPoints.WORK;let best:Point|null=null,bestScore=-Infinity;
    for(let i=0;i<24;i++){
      const p=points[Math.floor((i+.5)*points.length/24)];if(distance(a,p)<1)continue;
      const path=this.nav.find(a,p,roomAt(a)==='WC');if(!path.length)continue;
      const score=this.escapeScore(a,p,path,superior);
      if(score>bestScore){best=p;bestScore=score;}
    }
    if(best)this.plan(a,best);else this.patrol(a);
  }
  escapeScore(a:Agent,p:Point,path:Point[],superior:Agent) {
    let travel=0,prev:Point=a;for(const q of path){travel+=distance(prev,q);prev=q;}
    const diagonal=Math.hypot(WIDTH,HEIGHT);
    const crowd=this.agents.reduce((n,b)=>n+(b.id!==a.id?Math.max(0,1-distance(p,b)/2)+(b.targetPoint?Math.max(0,1-distance(p,b.targetPoint)/2):0):0),0);
    return 2*distance(p,superior)/diagonal+2.5*Number(sightBlocked(superior,p,this.config.desksBlockSight,this.config.openVisibility))-.8*travel/diagonal-crowd;
  }
  escapeRoom(a:Agent,superior:Agent,leaveCurrent=false):boolean {
    let best:{room:Room;point:Point;path:Point[]}|null=null,score=-Infinity;
    for(const room of ['MEETING','LOUNGE'] as const){
      if(leaveCurrent&&roomAt(a)===room)continue;
      const points=this.nav.roomPoints[room];
      const occupants=this.agents.filter(b=>b.id!==a.id&&(roomAt(b)===room||b.targetRoom===room)).length;
      for(let i=0;i<8;i++){
        const point=points[Math.floor((i+.5)*points.length/8)];if(distance(a,point)<1)continue;
        const path=this.nav.find(a,point,roomAt(a)==='WC');if(!path.length)continue;
        const value=this.escapeScore(a,point,path,superior)-occupants*.12;
        if(value>score){score=value;best={room,point,path};}
      }
    }
    if(!best)return false;
    a.targetRoom=best.room;a.targetPoint=best.point;a.path=best.path;a.lastPlan=this.time;a.targetAgentId=superior.id;return true;
  }
  divertFromWC(a:Agent,superior:Agent,reason:string) {
    this.transition(a,'FLEE_TO_ROOM',reason);
    if(!this.escapeRoom(a,superior)){this.transition(a,'FLEE_IN_OFFICE','No reachable room refuge');this.escape(a,superior);}
  }
  beginEscape(a:Agent,superior:Agent) {
    if(this.wc.capacity>0&&this.rng()<this.config.wcEscapeProbability)this.transition(a,'FLEE_TO_WC',`Avoiding ${superior.id} via WC`);
    else this.divertFromWC(a,superior,`Avoiding ${superior.id} via meeting room / lounge`);
    a.targetAgentId=superior.id;
  }
  react(a:Agent,superior:Agent) {
    a.episode=superior.id;
    if(this.rng()<this.config.pretendProbability){
      this.transition(a,'PRETEND_WORK',`Detected ${superior.id}`);
      const free=workAnchors.filter(p=>!this.agents.some(b=>b.id!==a.id&&(distance(b,p)<.65||(b.state==='PRETEND_WORK'&&b.targetPoint&&distance(b.targetPoint,p)<.65))));
      const anchors=(free.length?free:workAnchors).map(p=>({p,path:this.nav.find(a,p,roomAt(a)==='WC')})).filter(o=>o.path.length).map(o=>{let len=0,prev:Point=a;for(const p of o.path){len+=distance(prev,p);prev=p;}return {...o,len};}).sort((b,c)=>b.len-c.len);
      if(anchors.length){a.path=anchors[0].path;a.targetPoint=anchors[0].p;a.lastPlan=this.time;}
      else {this.transition(a,'FLEE_IN_OFFICE','No reachable work anchor');this.escape(a,superior);}
    } else this.beginEscape(a,superior);
    a.targetAgentId=superior.id;
  }
  cooldown(a:Agent,seconds=1+this.rng()) {if(a.state==='APPROACH'&&a.targetAgentId)a.pursuitCooldowns.set(a.targetAgentId,this.time+8);this.transition(a,'COOLDOWN','Reaction finished');a.until=this.time+seconds;if(roomAt(a)==='WC')this.patrol(a);}
  decide(a:Agent,p:Perception) {
    const superior=p.superiors[0],age=this.time-a.stateStartedAt;
    if(!superior)a.episode=null;
    if(a.state==='WC_HIDE'){if(this.time>=a.until){this.cooldown(a);a.until=0;}return;}
    if(a.state==='ROOM_HIDE'){
      if(superior&&age>=this.config.avoidanceDuration){this.transition(a,'FLEE_TO_ROOM','Refuge exposed; move to another room');if(!this.escapeRoom(a,superior,true))this.escapeRoom(a,superior);}
      else if(this.time>=a.until)this.cooldown(a);
      return;
    }
    if(a.state==='FLEE_TO_ROOM'){
      if(!a.path.length){
        if(roomAt(a)===a.targetRoom){this.transition(a,'ROOM_HIDE','Reached room refuge');a.until=this.time+4+this.rng()*4;}
        else if(this.time-a.lastPlan>=.5){const threat=superior??this.agents.find(b=>b.id===a.targetAgentId)??this.agents[0];if(!this.escapeRoom(a,threat)){this.transition(a,'FLEE_IN_OFFICE','Room route unavailable');this.escape(a,threat);}}
      }
      return;
    }
    if(a.state==='FLEE_TO_WC')return;
    // A new superior interrupts cooldown and pursuit, but never rerolls each frame.
    if(superior&&!a.episode&&a.state!=='PRETEND_WORK'&&a.state!=='FLEE_IN_OFFICE'){this.react(a,superior);return;}
    if(a.state==='PRETEND_WORK'){
      if(!a.path.length&&a.arrivedAt===null){a.arrivedAt=this.time;a.until=this.time+3+this.rng()*3;}
      if(this.config.closeReevaluate&&superior&&distance(a,superior)<1.5&&a.arrivedAt!==null&&this.time>=a.until){
        a.until=this.time+3;if(this.rng()<.7){this.beginEscape(a,superior);return;}}
      if(a.arrivedAt!==null&&this.time>=a.until&&(!superior||this.time-a.arrivedAt>=12))this.cooldown(a);
      return;
    }
    if(a.state==='FLEE_IN_OFFICE'){
      if(!a.path.length&&superior&&this.time-a.lastPlan>=.5)this.escape(a,superior);
      if(!superior&&age>=this.config.avoidanceDuration&&this.time-(a.lastSeenSuperiorAt??a.stateStartedAt)>=2)this.cooldown(a);
      return;
    }
    if(a.state==='COOLDOWN'){
      if(roomAt(a)==='WC'){if(!a.path.length)this.patrol(a);return;}
      if(this.time<a.until)return;this.transition(a,'WANDER','Cooldown ended');this.patrol(a);
    }
    if(a.state==='APPROACH'){
      const target=this.agents.find(b=>b.id===a.targetAgentId);
      if(p.inferiors.some(b=>b.id===a.targetAgentId))a.lastTargetSeen=this.time;
      if(!target||age>=this.config.pursuitDuration||this.time-a.lastTargetSeen>2){this.cooldown(a);return;}
      if(distance(a,target)<=1.2){this.cooldown(a,2);return;}
      if(this.time-a.lastPlan>=.5)this.plan(a,target);
      return;
    }
    const eligibleInferiors=p.inferiors.filter(b=>(a.pursuitCooldowns.get(b.id)??0)<=this.time);
    if(!superior&&eligibleInferiors.length){const target=eligibleInferiors[0];this.transition(a,'APPROACH',`Detected ${target.id}`);a.targetAgentId=target.id;a.lastTargetSeen=this.time;this.plan(a,target);return;}
    if(a.state==='PHONE'&&age>3){this.transition(a,'WANDER','Phone interval ended');this.patrol(a);}
    if(a.state==='WANDER'&&!a.path.length){if(a.role!=='CEO'&&!superior&&this.rng()<.6){this.transition(a,'PHONE','No superior detected');a.until=this.rng()<.4?this.time+1+this.rng()*2:0;}this.patrol(a);}
    if(a.state==='PHONE'&&a.until&&this.time>=a.until)a.until=0;
  }
  step(dt=DT) {
    this.time=++this.steps*dt;
    const snapshot=this.agents.map(a=>({...a,path:a.path.map(p=>({...p})),pursuitCooldowns:new Map(a.pursuitCooldowns),seen:new Map(a.seen),stable:new Set(a.stable)}));
    const perceptions=perceive(snapshot,this.config,this.time,dt);
    // Decide against the same positions; reserve slots after all decisions.
    this.agents=snapshot;
    for(const a of snapshot)this.decide(a,perceptions.get(a.id)!);
    const requests=snapshot.filter(a=>a.state==='FLEE_TO_WC'&&!a.wcReservation).sort((a,b)=>a.stateStartedAt-b.stateStartedAt||a.id.localeCompare(b.id));
    for(const a of requests){
      if(this.wc.tryReserve(a.id,this.time)){
        a.wcReservation=true;const slot=this.wc.slots.get(a.id)!;
        if(!this.plan(a,hideSlots[slot],true)){this.wc.exitOrCancel(a.id);a.wcReservation=false;const s=perceptions.get(a.id)!.superiors[0]??this.agents.find(b=>b.id===a.targetAgentId)??this.agents[0];this.divertFromWC(a,s,'WC unreachable; use a room refuge');}
      }else {const s=perceptions.get(a.id)!.superiors[0]??this.agents.find(b=>b.id===a.targetAgentId)??this.agents[0];this.divertFromWC(a,s,'WC full; use meeting room / lounge, no queue');}
    }
    for(const a of snapshot){
      const booking=this.wc.reservations.get(a.id);
      if(booking&&this.time-booking.at>=12){this.wc.exitOrCancel(a.id);a.wcReservation=false;const s=perceptions.get(a.id)!.superiors[0]??this.agents.find(b=>b.id===a.targetAgentId)??this.agents[0];this.divertFromWC(a,s,'WC reservation expired; use a room refuge');}
      a.speedLevel=a.state==='APPROACH'?ROLE[a.role].approach:a.state.startsWith('FLEE')?ROLE[a.role].flee:ROLE[a.role].base;
    }
    const desired=snapshot.map(a=>desiredPosition(a,snapshot,dt,this.config.speedMultiplier));
    const next=resolveCollisions(snapshot,desired);
    for(let i=0;i<snapshot.length;i++){
      const a=snapshot[i],p=next[i],moved=distance(a,p);
      if(moved>1e-8){const h=Math.atan2(p.y-a.y,p.x-a.x),delta=Math.atan2(Math.sin(h-a.heading),Math.cos(h-a.heading));a.heading+=delta*Math.min(1,dt*10);a.distance+=moved;a.movingTime+=dt;a.stuck=0;}
      else if(a.path.length&&a.state!=='WC_HIDE'&&!(a.state==='PHONE'&&a.until))a.stuck+=dt;
      Object.assign(a,p);
      if(a.stuck>2){
        // A reachable local detour breaks symmetric door/corridor stand-offs.
        const candidates=this.nav.points.filter(p=>distance(a,p)>.7&&distance(a,p)<2&&roomAt(p)===roomAt(a)&&clearMove(a,p,roomAt(a)==='WC'));
        if(candidates.length){const q=candidates[Math.floor(this.rng()*candidates.length)],target=a.targetPoint;const rest=target?this.nav.find(q,target,a.state==='FLEE_TO_WC'||roomAt(a)==='WC'):[];a.path=[q,...rest];}
        a.stuck=0;this.recoveries++;
      }
      if(roomAt(a)==='WC'&&a.state==='FLEE_TO_WC'&&this.wc.reservations.has(a.id))this.wc.enter(a.id);
      if(a.state==='FLEE_TO_WC'&&this.wc.occupants.has(a.id)&&!a.path.length){this.transition(a,'WC_HIDE','Reached reserved slot');a.until=this.time+4+this.rng()*4;}
      if(roomAt(a)!=='WC'&&this.wc.occupants.has(a.id)){this.wc.exitOrCancel(a.id);a.wcReservation=false;}
      if(a.wcReservation&&a.state!=='FLEE_TO_WC'&&a.state!=='WC_HIDE'&&roomAt(a)!=='WC'){this.wc.exitOrCancel(a.id);a.wcReservation=false;}
      a.stateTime[a.state]+=dt;a.roomTime[roomAt(a)]+=dt;if(a.superiorIds.length)a.superiorTime+=dt;
      const ceo=snapshot.find(b=>b.role==='CEO')!;a.ceoDistance+=distance(a,ceo)*dt;
      this.heat[Math.min(HEAT_ROWS-1,Math.floor(a.y))*HEAT_COLS+Math.min(HEAT_COLS-1,Math.floor(a.x))]+=dt;
      if(this.steps%4===0){a.trail.push({x:a.x,y:a.y,t:this.time});while(a.trail.length&&a.trail[0].t<this.time-20)a.trail.shift();}
    }
    this.wc.occupiedTime+=this.wc.occupants.size*dt;
  }
  metrics() {
    return ROLES.map(role=>{
      const group=this.agents.filter(a=>a.role===role),denom=Math.max(.0001,this.time*group.length);
      return {role,count:group.length,phonePercent:100*group.reduce((n,a)=>n+a.stateTime.PHONE,0)/denom,pretend:group.reduce((n,a)=>n+a.events.PRETEND_WORK,0),wcEscape:group.reduce((n,a)=>n+a.events.FLEE_TO_WC,0),roomEscape:group.reduce((n,a)=>n+a.events.FLEE_TO_ROOM,0),officeEscape:group.reduce((n,a)=>n+a.events.FLEE_IN_OFFICE,0),meanSpeed:group.reduce((n,a)=>n+a.distance,0)/denom,distance:group.reduce((n,a)=>n+a.distance,0),superiorPercent:100*group.reduce((n,a)=>n+a.superiorTime,0)/denom,ceoDistance:group.reduce((n,a)=>n+a.ceoDistance,0)/denom};
    });
  }
  exportData() {return {model:'Office hierarchy v2',world:{width:WIDTH,height:HEIGHT,area:AREA,heatCols:HEAT_COLS,heatRows:HEAT_ROWS},time:this.time,config:this.config,metrics:this.metrics(),wc:{occupied:this.wc.occupants.size,reserved:this.wc.reservations.size,attempts:this.wc.attempts,successes:this.wc.successes,full:this.wc.full,utilization:this.config.wcCapacity?this.wc.occupiedTime/(this.time*this.config.wcCapacity||1):0},agents:this.agents.map(a=>({id:a.id,state:a.state,targetRoom:a.targetRoom,x:a.x,y:a.y,distance:a.distance,stateTime:a.stateTime,roomTime:a.roomTime})),heat:[...this.heat],events:this.events};}
}
