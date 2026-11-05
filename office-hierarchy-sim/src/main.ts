import './style.css';
import { Simulation } from './simulation';
import { defaults,DT,ROLE,ROLES,SCENARIOS,scenarioConfig,distance } from './config';
import { draw,type View } from './render/canvas';
import { OfficeScene } from './render/scene';
import { WIDTH, HEIGHT, AREA, roomAt } from './world/floorplan';
import { freshSeed } from './reset';
import type { Config } from './types';
import type { BatchRow } from './experiment-core';
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const input=(id:string)=>$<HTMLInputElement>(id);
let sim=new Simulation(),running=true,accumulator=0,last=performance.now(),lastUi=0,batch:Worker|null=null,batchRows:BatchRow[]=[];
const view:View={selected:'CEO-1',fov:true,allFov:true,paths:true,trails:true,heat:false,blockers:false};
const canvas=$<HTMLCanvasElement>('office'),planCanvas=$<HTMLCanvasElement>('plan');
let scene:OfficeScene|null=null,mode:'3d'|'2d'='3d';
try{scene=new OfficeScene(canvas);}catch{mode='2d';canvas.hidden=true;planCanvas.hidden=false;$('viewMode').setAttribute('disabled','');$('viewNote').textContent='WebGL is unavailable: showing the 2D plan.';}
function drawView(){if(mode==='3d'&&scene)scene.draw(sim,view);else draw(planCanvas,sim,view);}
$('spaceSize').textContent=`${WIDTH.toFixed(1)} × ${HEIGHT.toFixed(1)} m · ${AREA.toFixed(0)} m² · 2× original floor area`;
$('viewMode').onchange=()=>{mode=$<HTMLSelectElement>('viewMode').value as '3d'|'2d';canvas.hidden=mode!=='3d';planCanvas.hidden=mode!=='2d';drawView();};
$('cameraHome').onclick=()=>scene?.resetCamera();
$('legend').innerHTML=ROLES.map(r=>`<span><i class="swatch" style="background:${ROLE[r].color}"></i>${ROLE[r].label} · ${ROLE[r].count}</span>`).join('');
$('radii').innerHTML=ROLES.map(r=>`<label>${ROLE[r].label}<input id="radius-${r}" type="number" min="1" max="15" step="0.5" value="${sim.config.radii[r]}"></label>`).join('');
$('agentSelect').innerHTML=sim.agents.map(a=>`<option value="${a.id}">${a.id}</option>`).join('');
const time=(t:number)=>`${Math.floor(t/60).toString().padStart(2,'0')}:${Math.floor(t%60).toString().padStart(2,'0')}`;
function syncForm(c:Config){input('seed').value=String(c.seed);input('fov').value=String(c.fov);input('pretend').value=String(c.pretendProbability*100);input('speed').value=String(c.speedMultiplier);input('wcShare').value=String(c.wcEscapeProbability*100);input('avoid').value=String(c.avoidanceDuration);input('pursuit').value=String(c.pursuitDuration);input('desksBlock').checked=c.desksBlockSight;input('reevaluate').checked=c.closeReevaluate;for(const r of ROLES)input(`radius-${r}`).value=String(c.radii[r]);updateOutputs();}
function updateOutputs(){$('fovValue').textContent=`${input('fov').value}°`;$('pretendValue').textContent=`${input('pretend').value}%`;$('wcShareValue').textContent=`${input('wcShare').value}%`;}
function settings():Config {
  for(const id of ['seed','fov','pretend','wcShare','speed','avoid','pursuit',...ROLES.map(r=>`radius-${r}`)])if(!input(id).checkValidity()||!input(id).value.trim())throw new Error(`Check ${id.replace('radius-','')} value.`);
  const c=defaults();c.seed=Number(input('seed').value);c.fov=+input('fov').value;c.pretendProbability=+input('pretend').value/100;c.wcEscapeProbability=+input('wcShare').value/100;c.speedMultiplier=+input('speed').value;c.avoidanceDuration=+input('avoid').value;c.pursuitDuration=+input('pursuit').value;c.desksBlockSight=input('desksBlock').checked;c.closeReevaluate=input('reevaluate').checked;for(const r of ROLES)c.radii[r]=+input(`radius-${r}`).value;
  const scenario=+$<HTMLSelectElement>('scenario').value;
  // Only spatial visibility and capacity are scenario flags; custom radii remain editable.
  c.wcCapacity=scenario===3?0:4;c.openVisibility=scenario===4;return c;
}
$<HTMLSelectElement>('scenario').innerHTML=SCENARIOS.map((s,i)=>`<option value="${i}">${s}</option>`).join('');
function restart(c=sim.config){sim=new Simulation(c,sim.nav);accumulator=0;last=performance.now();refresh();drawView();}
$('apply').onclick=()=>{try{restart(settings());$('settingsStatus').textContent='Applied · restarted with the displayed seed.';$('settingsStatus').classList.remove('error');}catch(e){$('settingsStatus').textContent=(e as Error).message;$('settingsStatus').classList.add('error');}};
$('scenario').onchange=()=>{let c:Config;try{c=settings();}catch{c=defaults();}const base={...c,radii:defaults().radii,wcCapacity:4,openVisibility:false};c=scenarioConfig(+$<HTMLSelectElement>('scenario').value,base);syncForm(c);restart(c);$('settingsStatus').textContent='Scenario applied · starting positions preserved for this seed.';};
$('fov').oninput=updateOutputs;$('pretend').oninput=updateOutputs;$('wcShare').oninput=updateOutputs;
$('reset').onclick=()=>{const c={...structuredClone(sim.config),seed:freshSeed(sim.config.seed)};syncForm(c);restart(c);$('settingsStatus').textContent=`Random layout · seed ${c.seed}. Use Replay seed to repeat it.`;};
$('replaySeed').onclick=()=>{if(!input('seed').checkValidity()||!input('seed').value.trim()){$('settingsStatus').textContent='Enter a valid integer seed.';return;}const c={...structuredClone(sim.config),seed:+input('seed').value};restart(c);$('settingsStatus').textContent=`Replaying seed ${c.seed}.`;};
$('run').onclick=()=>{running=!running;last=performance.now();accumulator=0;refresh();};
$('agentSelect').onchange=()=>{view.selected=$<HTMLSelectElement>('agentSelect').value;refresh();};
for(const [id,key] of [['showFov','fov'],['allFov','allFov'],['paths','paths'],['trails','trails'],['heat','heat'],['blockers','blockers']] as const)input(id).onchange=()=>{view[key]=input(id).checked;};
function selectAgent(id:string){view.selected=id;$<HTMLSelectElement>('agentSelect').value=id;refresh();drawView();}
canvas.onclick=e=>{const id=scene?.pick(e);if(id)selectAgent(id);};
planCanvas.onclick=e=>{const rect=planCanvas.getBoundingClientRect(),p={x:(e.clientX-rect.left)/rect.width*WIDTH,y:HEIGHT-(e.clientY-rect.top)/rect.height*HEIGHT};const a=sim.agents.slice().sort((a,b)=>distance(a,p)-distance(b,p))[0];if(distance(a,p)<.8)selectAgent(a.id);};
function refresh(){
  $('clock').textContent=time(sim.time);$('occupancy').textContent=`${sim.wc.occupants.size} / ${sim.wc.capacity}`;$('reserved').textContent=`${sim.wc.reservations.size} / ${sim.wc.capacity}`;$('full').textContent=String(sim.wc.full);
  $('run').textContent=running?'Pause':'Run';$('runStatus').textContent=`${running?'Running':'Paused'} · fixed 0.05 s timestep`;
  const a=sim.agents.find(a=>a.id===view.selected)!;
  const values=[['Role',ROLE[a.role].label],['State',a.state],['Attention radius',`${a.visionRangeM} m / ${a.fovDeg}°`],['Superior detected',a.superiorIds.join(', ')||'None'],['Lower ranks',String(a.inferiorIds.length)],['Refuge',a.targetRoom??'None'],['Target',a.targetAgentId??(a.targetPoint?`${a.targetPoint.x.toFixed(1)}, ${a.targetPoint.y.toFixed(1)} m`:'None')],['Speed level',`${a.speedLevel} · ${(a.speedLevel*.5*sim.config.speedMultiplier).toFixed(2)} m/s desired`],['Mean actual speed',`${(a.distance/(sim.time||1)).toFixed(2)} m/s`],['Distance',`${a.distance.toFixed(1)} m`]];
  $('inspector').replaceChildren(...values.flatMap(([key,value])=>{const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=key;dd.textContent=value;return [dt,dd];}));
  $('metrics').innerHTML=sim.metrics().map(m=>`<tr><td style="color:${ROLE[m.role].color}">${ROLE[m.role].label}</td><td>${m.phonePercent.toFixed(1)}%</td><td>${m.pretend}</td><td>${m.wcEscape}</td><td>${m.roomEscape}</td><td>${m.officeEscape}</td><td>${m.meanSpeed.toFixed(2)} m/s</td><td>${m.distance.toFixed(1)} m</td><td>${m.superiorPercent.toFixed(1)}%</td><td>${m.ceoDistance.toFixed(1)} m</td></tr>`).join('');
  const wc=sim.exportData().wc;$('wcStats').textContent=`WC utilization ${(wc.utilization*100).toFixed(1)}% · Reservation success ${wc.successes}/${wc.attempts} (${(100*wc.successes/(wc.attempts||1)).toFixed(1)}%) · Full-capacity office escapes ${wc.full} · Stuck-path recoveries ${sim.recoveries}. Mean speed includes stationary time.`;
  $('roomStats').innerHTML=['WORK','MEETING','LOUNGE','CORRIDOR','WC'].map(room=>{const n=sim.agents.filter(a=>roomAt(a)===room).length;const t=sim.agents.reduce((n,a)=>n+a.roomTime[room as keyof typeof a.roomTime],0);return `<span>${room} · ${n} now / ${t.toFixed(0)} person-s</span>`;}).join('');
  $('events').replaceChildren(...sim.events.slice(-30).reverse().map(e=>{const p=document.createElement('div');p.className='event';p.textContent=`${time(e.t)} ${e.agent}: ${e.from} → ${e.to} · ${e.reason}`;return p;}));
}
function download(name:string,content:string,type='text/csv'){const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function csv(rows:object[]){if(!rows.length)return '';const keys=Object.keys(rows[0]);return [keys.join(','),...rows.map(row=>keys.map(key=>`"${String((row as Record<string,unknown>)[key]).replaceAll('"','""')}"`).join(','))].join('\r\n');}
$('csv').onclick=()=>download('office-metrics.csv',csv(sim.metrics().map(m=>({seed:sim.config.seed,seconds:sim.time,...m}))));
$('json').onclick=()=>download('office-simulation.json',JSON.stringify(sim.exportData(),null,2),'application/json');
function batchCleanup(){batch?.terminate();batch=null;$<HTMLButtonElement>('compare').disabled=false;$('cancelBatch').hidden=true;}
$('compare').onclick=()=>{
  if(!input('batchSeeds').checkValidity()||!input('batchSeconds').checkValidity()||!input('batchSeeds').value||!input('batchSeconds').value){$('batchStatus').textContent='Use 20–100 seeds and 10–1800 seconds per run.';return;}
  batchCleanup();batchRows=[];$('batchResults').textContent='';$<HTMLButtonElement>('batchExport').disabled=true;$<HTMLButtonElement>('compare').disabled=true;$('cancelBatch').hidden=false;
  // Normalize the baseline before applying one scenario variable per run.
  const base={...structuredClone(sim.config),radii:defaults().radii,wcCapacity:4,openVisibility:false};
  batch=new Worker(new URL('./experiment-worker.ts',import.meta.url),{type:'module'});
  batch.onmessage=e=>{const m=e.data;if(m.type==='progress')$('batchStatus').textContent=`Completed ${m.done} / ${m.total} runs · simulation seconds, not wall time.`;
    else {batchRows=m.rows;$('batchResults').innerHTML=m.summary.map((r:{scenario:string;n:number;escapes:{mean:number;variance:number};phone:{mean:number;variance:number};distance:{mean:number;variance:number}})=>`<tr><td>${r.scenario} (n=${r.n})</td>${[r.escapes,r.phone,r.distance].map(s=>`<td>${s.mean.toFixed(2)} / ${s.variance.toFixed(2)}</td>`).join('')}</tr>`).join('');$('batchStatus').textContent=`Completed ${batchRows.length} runs. μ = mean; s² = sample variance. Baseline radii 3/5/7/9; other behavior controls held fixed.`;$<HTMLButtonElement>('batchExport').disabled=false;batchCleanup();}};
  batch.onerror=()=>{$('batchStatus').textContent='Comparison failed. Reduce run length and retry.';batchCleanup();};
  batch.postMessage({seed:sim.config.seed,seeds:+input('batchSeeds').value,seconds:+input('batchSeconds').value,base});
};
$('cancelBatch').onclick=()=>{batchCleanup();$('batchStatus').textContent='Comparison cancelled.';};
$('batchExport').onclick=()=>download('office-comparison.csv',csv(batchRows));
function frame(now:number){const elapsed=Math.min(.25,(now-last)/1000);last=now;if(running){accumulator+=elapsed*+$<HTMLSelectElement>('timeScale').value;let n=0;while(accumulator>=DT&&n++<40){sim.step();accumulator-=DT;}}
  drawView();if(now-lastUi>250){refresh();lastUi=now;}requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange',()=>{last=performance.now();accumulator=0;});
if(new URLSearchParams(location.search).has('test'))Object.assign(window,{officeTest:{get sim(){return sim;},get running(){return running;},step:(n:number)=>{running=false;for(let i=0;i<n;i++)sim.step();refresh();drawView();},reset:()=>restart(),get view(){return view;},get scene(){return scene;},get mode(){return mode;},project:(id:string)=>scene?.project(id)}});
refresh();requestAnimationFrame(frame);
