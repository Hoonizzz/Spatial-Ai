import type { Simulation } from '../simulation';
import { ROLE } from '../config';
import { walls,desks,furniture,hideSlots,workAnchors,loungeAnchors, WIDTH, HEIGHT, roomBounds, HEAT_COLS, SPACE_SCALE } from '../world/floorplan';
import { visionFan } from './vision';
export interface View { selected:string; fov:boolean; allFov:boolean; paths:boolean; trails:boolean; heat:boolean; blockers:boolean }
export function draw(canvas:HTMLCanvasElement,s:Simulation,v:View,renderScale=window.devicePixelRatio||1) {
  const rect=canvas.getBoundingClientRect(),dpr=Math.max(1,renderScale);
  if(canvas.width!==Math.round(rect.width*dpr)||canvas.height!==Math.round(rect.height*dpr)){canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);}
  const c=canvas.getContext('2d')!,scale=canvas.width/WIDTH;c.setTransform(scale,0,0,-scale,0,canvas.height);c.clearRect(0,0,WIDTH,HEIGHT);
  const box=(x:number,y:number,w:number,h:number,color:string)=>{c.fillStyle=color;c.fillRect(x,y,w,h);};
  for(const [room,color] of Object.entries({WORK:'#f4f6ef',MEETING:'#edf2f2',LOUNGE:'#f7f0e7',WC:'#eaf0f3',CORRIDOR:'#f2f1ec'})){const r=roomBounds[room as keyof typeof roomBounds];box(r.x,r.y,r.w,r.h,color);}
  const text=(t:string,x:number,y:number,size:number,color='#9ba79b')=>{c.save();c.translate(x,y);c.scale(1,-1);c.font=`${size}px Arial`;c.fillStyle=color;c.fillText(t,0,0);c.restore();};
  if(v.heat){const max=Math.max(1,...s.heat);s.heat.forEach((n,i)=>{box(i%HEAT_COLS,Math.floor(i/HEAT_COLS),1,1,`rgba(197,105,51,${n/max*.65})`);});}
  for(const [label,x,y] of [['WORK / 22 DESKS',.6,.35],['MEETING',14.6,13.5],['LOUNGE',14.6,.4],['WC',.5,13.5],['CORRIDOR',8,13.5]] as const)text(label,x*SPACE_SCALE,y*SPACE_SCALE,.3);
  for(const r of desks){box(r.x,r.y,r.w,r.h,'#d4dfcb');c.strokeStyle='#b8c6b0';c.lineWidth=.025;c.strokeRect(r.x,r.y,r.w,r.h);}
  for(const p of workAnchors){c.beginPath();c.arc(p.x,p.y,.16,0,Math.PI*2);c.fillStyle='#c5d0be';c.fill();}
  for(const r of furniture)box(r.x,r.y,r.w,r.h,r.id.startsWith('wc')?'#bccdd0':'#ccd6d3');
  for(let i=0;i<12;i++){const x=16.3+(i%6)*.65,y=i<6?8.5:11.5;c.beginPath();c.arc(x*SPACE_SCALE,y*SPACE_SCALE,.18,0,Math.PI*2);c.fillStyle='#b7c8c6';c.fill();}
  for(const p of loungeAnchors){c.beginPath();c.arc(p.x,p.y,.18,0,Math.PI*2);c.fillStyle='#dbccb5';c.fill();}
  for(let i=0;i<hideSlots.length;i++){const p=hideSlots[i],taken=[...s.wc.slots.values()].includes(i);c.strokeStyle=taken?'#a35b3c':'#b2c4c8';c.lineWidth=.035;c.strokeRect(p.x-.42,p.y-.42,.84,.84);text(String(i+1),p.x-.07,p.y-.08,.21);}
  for(const r of walls)box(r.x,r.y,r.w,r.h,s.config.openVisibility?'#a3b5ad':'#47635a');
  c.strokeStyle='#47635a';c.lineWidth=.1;c.strokeRect(.05,.05,WIDTH-.1,HEIGHT-.1);
  if(v.blockers){c.strokeStyle='#d36143';c.lineWidth=.06;for(const r of [...(s.config.openVisibility?[]:walls),...furniture,...(s.config.desksBlockSight?desks:[])])c.strokeRect(r.x,r.y,r.w,r.h);}
  for(const a of s.agents){
    const color=ROLE[a.role].color;
    if(v.allFov||(v.fov&&a.id===v.selected)){
      // Ray-clipped fan shows actual wall occlusion rather than sight through walls.
      c.beginPath();c.moveTo(a.x,a.y);
      for(const p of visionFan(a,s.config))c.lineTo(p.x,p.y);
      c.closePath();c.fillStyle=color+(a.id===v.selected?'2a':'16');c.fill();c.strokeStyle=color+'55';c.lineWidth=.025;c.stroke();
    }
    if(v.trails&&a.trail.length){c.beginPath();a.trail.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.strokeStyle=color+'45';c.lineWidth=.055;c.stroke();}
    if(v.paths&&a.path.length){c.beginPath();c.moveTo(a.x,a.y);a.path.forEach(p=>c.lineTo(p.x,p.y));c.setLineDash([.12,.12]);c.strokeStyle=color+'55';c.lineWidth=.025;c.stroke();c.setLineDash([]);}
    if(a.state==='APPROACH'||a.state.startsWith('FLEE')){
      const target=a.state==='APPROACH'?s.agents.find(b=>b.id===a.targetAgentId):a.targetPoint;
      if(target){c.beginPath();c.moveTo(a.x,a.y);c.lineTo(target.x,target.y);c.strokeStyle=color+'aa';c.lineWidth=.035;c.setLineDash(a.state==='APPROACH'?[]:[.15,.15]);c.stroke();c.setLineDash([]);}
    }
  }
  for(const a of s.agents){const color=ROLE[a.role].color;
    if(a.id===v.selected){c.beginPath();c.arc(a.x,a.y,.42,0,Math.PI*2);c.strokeStyle=color;c.lineWidth=.05;c.stroke();}
    c.beginPath();c.arc(a.x,a.y,a.radius,0,Math.PI*2);c.fillStyle=color;c.fill();c.strokeStyle='white';c.lineWidth=.035;c.stroke();
    c.beginPath();c.moveTo(a.x+Math.cos(a.heading)*.12,a.y+Math.sin(a.heading)*.12);c.lineTo(a.x+Math.cos(a.heading)*.39,a.y+Math.sin(a.heading)*.39);c.strokeStyle='#fff';c.lineWidth=.065;c.stroke();
    const labels:Record<string,string>={PHONE:'PHONE',APPROACH:'APPROACH',PRETEND_WORK:'WORK',FLEE_TO_WC:'ESCAPE → WC',FLEE_IN_OFFICE:'ESCAPE',WC_HIDE:'HIDE',FLEE_TO_ROOM:`ESCAPE → ${a.targetRoom??'ROOM'}`,ROOM_HIDE:`REFUGE · ${a.targetRoom??'ROOM'}`};
    if(labels[a.state])text(labels[a.state],a.x-.35,a.y+.48,.15,color);
  }
}
