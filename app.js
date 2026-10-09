import * as THREE from './vendor/three.module.js';
import { RADIUS, OBSTACLES, TREES, PEOPLE, validPoint, findRoute } from './model.mjs';

const root=document.querySelector('#viewport'), status=document.querySelector('#status');
let renderer;
try {
  renderer=new THREE.WebGLRenderer({antialias:true});
} catch(error) {
  document.querySelector('#loading').textContent='3D 화면을 열 수 없습니다. WebGL을 지원하는 브라우저에서 다시 열어주세요.';
  throw error;
}
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=.85;
renderer.setClearColor(0xf4f3ed);
root.appendChild(renderer.domElement);
const scene=new THREE.Scene();
const camera=new THREE.OrthographicCamera();
let angle=Math.PI/4, zoom=1;
const viewTarget=new THREE.Vector3(0,0,0);
const sun=new THREE.DirectionalLight(0xfff5e7,2);sun.position.set(-70,130,60);sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-130;sun.shadow.camera.right=130;
sun.shadow.camera.top=130;sun.shadow.camera.bottom=-130;sun.shadow.camera.far=400;
sun.shadow.normalBias=0.2;scene.add(sun,new THREE.HemisphereLight(0xffffff,0x97aa9b,1.4));
const mat=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.88,...extra});
function box(w,h,d,color,x,y,z,parent=scene) {
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(color));mesh.position.set(x,y,z);
  mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
function cylinder(r,h,color,x,y,z,parent=scene,segments=24) {
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,segments),mat(color));mesh.position.set(x,y,z);
  mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
function label(text,color='#294e42',size=5) {
  const c=document.createElement('canvas');c.width=256;c.height=96;
  const ctx=c.getContext('2d');ctx.font='600 42px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillStyle=color;ctx.fillText(text,128,48);
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),depthTest:false}));
  sprite.scale.set(size*2.7,size,1);return sprite;
}
// A schematic urban ground; all ground except marked buildings/furniture is traversable.
const ground=new THREE.Mesh(new THREE.CircleGeometry(RADIUS,160),mat(0xdce5d8));
ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
cylinder(RADIUS,1.6,0xc7d3c4,0,-.85,0,scene,160);
function road(w,d,x,z) {const m=box(w,.12,d,0xd5d9d3,x,.08,z);m.castShadow=false;}
road(27,196,0,0);road(196,24,0,0);
for(let k=-80;k<=80;k+=12){
  if(Math.abs(k)<19) continue;
  box(.5,.02,5,0xf6f4df,0,.17,k);box(5,.02,.5,0xf6f4df,k,.17,0);
}
for(const sign of [-1,1]) for(let i=-10;i<=10;i+=4){
  box(2.5,.03,7,0xfaf9ed,i,.19,sign*23);
  box(7,.03,2.5,0xfaf9ed,sign*24,.19,i);
}
const boundaryPoints=[];
for(let i=0;i<256;i++){const a=i/255*Math.PI*2;boundaryPoints.push(new THREE.Vector3(Math.cos(a)*RADIUS,.25,Math.sin(a)*RADIUS));}
const boundary=new THREE.Line(new THREE.BufferGeometry().setFromPoints(boundaryPoints),new THREE.LineDashedMaterial({color:0x6d9e89,dashSize:2,gapSize:1.4}));
boundary.computeLineDistances();scene.add(boundary);
const boundaryLabel=label('R 100m','#6d8f7e',5);boundaryLabel.position.set(76,2,61);scene.add(boundaryLabel);
// Station marker at the exact local origin, outside the movement plane.
cylinder(4.8,.25,0xf4f1df,0,.3,0);
const station=label('강남역','#335b4e',5);station.position.set(0,3,0);scene.add(station);
const originRing=new THREE.Mesh(new THREE.RingGeometry(5.6,5.85,64),new THREE.MeshBasicMaterial({color:0x86a691,side:THREE.DoubleSide}));
originRing.rotation.x=-Math.PI/2;originRing.position.y=.2;scene.add(originRing);
OBSTACLES.slice(0,6).forEach((o,i)=>{
  if(i<4){
    const h=[18,24,13,20][i];
    box(o.w,h,o.d,0xe8e9dd,o.x,h/2,o.z);
    box(o.w+.8,.8,o.d+.8,0xc4ccbf,o.x,h,o.z);
    box(o.w-4,1,o.d-4,0xd4dbcc,o.x,h+.8,o.z);
    for(let y=5;y<h-2;y+=5)for(let x=-o.w/2+3;x<o.w/2;x+=4){
      box(1.8,2,.15,0xa7bbb2,o.x+x,y,o.z+o.d/2+.1);
    }
    const name=label(['OFFICE','WORKSPACE','CAFE','STAY'][i],'#94a496',3.2);name.position.set(o.x,h+4,o.z);scene.add(name);
  }else{
    box(o.w,.6,o.d,0xb59c78,o.x,2,o.z);box(o.w,.8,.5,0xb59c78,o.x,3,o.z-1);
    for(const s of [-1,1])box(.6,2,2,0x687f6c,o.x+s*3,1,o.z);
  }
});
// Small planted islands stay clear of primary movement lanes. Trees are visual ground cover.
for(const [x,z] of TREES){
  cylinder(.55,5,0x9d9475,x,2.5,z);
  const foliage=new THREE.Mesh(new THREE.IcosahedronGeometry(4.5,1),mat(0x9fb69c));foliage.position.set(x,7,z);foliage.castShadow=true;scene.add(foliage);
}

function floralTexture(color) {
  const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');
  ctx.fillStyle=`#${color.toString(16).padStart(6,'0')}`;ctx.fillRect(0,0,128,128);
  for(let y=12;y<128;y+=28)for(let x=12;x<128;x+=28){
    ctx.fillStyle='#fff2d6';
    for(let p=0;p<5;p++){const a=p*Math.PI*2/5;ctx.beginPath();ctx.ellipse(x+Math.cos(a)*4,y+Math.sin(a)*4,3,2,a,0,Math.PI*2);ctx.fill();}
    ctx.fillStyle='#5c8067';ctx.fillRect(x+6,y+6,2,5);
  }
  return new THREE.CanvasTexture(c);
}
const actors=[], hitMeshes=[];
function createPerson(data){
  const group=new THREE.Group();group.position.set(data.x,0,data.z);scene.add(group);
  const body=new THREE.Group();body.scale.setScalar(1.25);group.add(body);
  const office=data.role==='office_worker',pants=office?data.color:0xc4b18f;
  const legs=[box(.72,2,.85,pants,-.52,1.7,0,body),box(.72,2,.85,pants,.52,1.7,0,body)];
  for(const s of [-1,1])box(.85,.55,1.25,office?0x333f40:0xf0eee0,s*.52,.4,.17,body);
  const torso=box(2,2.2,1.15,data.color,0,3.75,0,body);
  if(!office){torso.material=mat(0xffffff,{map:floralTexture(data.color)});}
  for(const s of [-1,1]){
    box(.6,office?2:1.05,.85,data.color,s*1.32,office?3.5:4.1,0,body);
    box(.48,office?.45:1.15,.6,0xe0ba98,s*1.32,office?2.3:3.1,0,body);
  }
  if(office){
    box(.8,1.8,.08,0xf7f4e9,0,3.8,.61,body);
    box(.18,1.35,.08,0xb68971,0,3.85,.68,body);
  }else{
    box(1.65,1.9,.7,0x566a5e,0,3.65,-.9,body);
    for(const s of [-1,1])box(.15,2.05,.1,0x586b5f,s*.68,3.7,.66,body);
  }
  cylinder(.7,1.2,0xe0ba98,0,5.5,0,body);
  cylinder(.73,.4,0x4d4c40,0,6.05,0,body);
  const tag=label(data.id,office?'#3c5961':'#bb784e',6);tag.position.set(0,11,0);group.add(tag);
  const ring=new THREE.Mesh(new THREE.RingGeometry(2.35,2.65,48),new THREE.MeshBasicMaterial({color:0x477d67,side:THREE.DoubleSide,transparent:true,opacity:.85}));
  ring.rotation.x=-Math.PI/2;ring.position.y=.24;ring.visible=false;group.add(ring);
  group.traverse(o=>{if(o.isMesh||o.isSprite){o.userData.personId=data.id;if(o!==ring)hitMeshes.push(o);}});
  const person={...data,group,body,legs,ring,route:[],movement:'STOP',direction:0,speed:12};actors.push(person);
  const button=document.createElement('button');button.textContent=data.id;button.className='person-button';button.dataset.id=data.id;
  button.setAttribute('aria-pressed','false');button.setAttribute('aria-label',`${data.id} ${office?'회사원':'관광객'} 선택`);
  button.onclick=()=>selectPerson(data.id);
  document.querySelector(office?'#office':'#tourists').appendChild(button);
}
PEOPLE.forEach(createPerson);
let selected=null;
const destination=new THREE.Mesh(new THREE.RingGeometry(1.8,2.2,40),new THREE.MeshBasicMaterial({color:0xda9765,side:THREE.DoubleSide}));
destination.rotation.x=-Math.PI/2;destination.position.y=.3;destination.visible=false;scene.add(destination);
function showTarget(){
  const end=selected?.route.at(-1);destination.visible=!!end;
  if(end)destination.position.set(end.x,.3,end.z);
}
function selectPerson(id){
  selected=actors.find(p=>p.id===id);
  actors.forEach(p=>p.ring.visible=p===selected);
  document.querySelectorAll('.person-button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.id===id)));
  document.querySelector('#selected-title').textContent=`${id} · ${selected.role==='office_worker'?'회사원':'관광객'}`;
  document.querySelector('#stop').disabled=false;
  status.textContent=`${id} 선택됨 · 공간 안의 이동할 위치를 클릭하세요.`;showTarget();
}
function setDestination(point){
  if(!selected){status.textContent='먼저 이동할 사람 A–F를 선택하세요.';return false;}
  if(!validPoint(point)){status.textContent='이동 불가: 경계 밖이거나 건물·장애물과 너무 가까운 위치입니다.';return false;}
  const route=findRoute({x:selected.group.position.x,z:selected.group.position.z},point);
  if(!route){status.textContent='도달할 수 없는 위치입니다. 다른 위치를 선택하세요.';return false;}
  selected.route=route;selected.movement='MOVE';showTarget();status.textContent=`${selected.id}가 선택한 위치로 이동합니다.`;return true;
}
document.querySelector('#stop').onclick=()=>{
  if(!selected)return;selected.route=[];selected.movement='STOP';showTarget();status.textContent=`${selected.id}의 이동을 정지했습니다.`;
};
document.querySelector('#reset').onclick=()=>{
  actors.forEach(p=>{p.route=[];p.movement='STOP';p.group.position.set(p.x,0,p.z);p.body.rotation.y=0;});
  showTarget();status.textContent='모든 사람을 처음 위치로 되돌렸습니다.';
};
function resize(){
  const w=innerWidth,h=innerHeight,aspect=w/h;
  renderer.setSize(w,h);const size=(w<640?185:145)/zoom;
  camera.left=-size*aspect;camera.right=size*aspect;camera.top=size;camera.bottom=-size;camera.near=.1;camera.far=1000;
  camera.setViewOffset(w,h,w<640?0:Math.round(w*.025),w<640?Math.round(-h*.075):0,w,h);
  camera.position.set(Math.sin(angle)*200,205,Math.cos(angle)*200);camera.lookAt(viewTarget);camera.updateProjectionMatrix();
}
addEventListener('resize',resize);resize();
const raycaster=new THREE.Raycaster(),mouse=new THREE.Vector2();
const movementPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
let pointer=null;
const canvas=renderer.domElement;
canvas.addEventListener('pointerdown',e=>{
  if(e.button!==0)return;pointer={id:e.pointerId,x:e.clientX,y:e.clientY,lastX:e.clientX,dragged:false};canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove',e=>{
  if(!pointer||e.pointerId!==pointer.id)return;
  if(Math.hypot(e.clientX-pointer.x,e.clientY-pointer.y)>6)pointer.dragged=true;
  if(pointer.dragged){angle-=(e.clientX-pointer.lastX)*.006;resize();}
  pointer.lastX=e.clientX;
});
canvas.addEventListener('pointercancel',()=>pointer=null);
canvas.addEventListener('pointerup',e=>{
  if(!pointer||e.pointerId!==pointer.id)return;
  const dragged=pointer.dragged;pointer=null;if(dragged)return;
  const rect=canvas.getBoundingClientRect();mouse.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);
  raycaster.setFromCamera(mouse,camera);
  const hit=raycaster.intersectObjects(hitMeshes,false).find(intersection=>{
    if(!intersection.object.isSprite)return true;
    // Ignore the transparent canvas surrounding identifier letters.
    const image=intersection.object.material.map.image,uv=intersection.uv;
    if(!uv)return false;
    const x=Math.min(image.width-1,Math.max(0,Math.floor(uv.x*image.width)));
    const y=Math.min(image.height-1,Math.max(0,Math.floor((1-uv.y)*image.height)));
    return image.getContext('2d').getImageData(x,y,1,1).data[3]>64;
  });
  if(hit){selectPerson(hit.object.userData.personId);return;}
  const p=new THREE.Vector3();if(raycaster.ray.intersectPlane(movementPlane,p))setDestination({x:p.x,z:p.z});
});
canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=THREE.MathUtils.clamp(zoom-e.deltaY*.0007,.7,2);resize();},{passive:false});
let last=performance.now();
function tick(now){
  const dt=Math.min((now-last)/1000,.05);last=now;
  for(const p of actors){
    if(p.route.length){
      const target=p.route[0],dx=target.x-p.group.position.x,dz=target.z-p.group.position.z,distance=Math.hypot(dx,dz),step=p.speed*dt;
      if(distance<=step){p.group.position.x=target.x;p.group.position.z=target.z;p.route.shift();}
      else{p.group.position.x+=dx/distance*step;p.group.position.z+=dz/distance*step;}
      p.direction=Math.atan2(dx,dz);p.body.rotation.y=p.direction;
      p.legs.forEach((leg,i)=>leg.rotation.x=Math.sin(now*.009+i*Math.PI)*.2);
      if(!p.route.length){p.movement='STOP';if(p===selected){showTarget();status.textContent=`${p.id}가 목적지에 도착했습니다.`;}}
    }else p.legs.forEach(leg=>leg.rotation.x=0);
  }
  if(selected)document.querySelector('#position').textContent=`${selected.group.position.x.toFixed(1)}, ${selected.group.position.z.toFixed(1)} m`;
  renderer.render(scene,camera);requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
document.querySelector('#loading').remove();
document.documentElement.dataset.ready='true';
// Opt-in browser-test interface; absent in normal visits.
if(new URLSearchParams(location.search).has('test'))window.spatialTest={
  state:()=>actors.map(p=>({id:p.id,role:p.role,x:p.group.position.x,z:p.group.position.z,movement:p.movement,route:p.route.map(q=>({...q}))})),
  screen:(x,z,y=0)=>{const p=new THREE.Vector3(x,y,z).project(camera);return{x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2};},
  selectPerson,setDestination
};
