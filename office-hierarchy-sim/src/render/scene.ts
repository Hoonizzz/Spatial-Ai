import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Agent, Point } from '../types';
import type { Simulation } from '../simulation';
import type { View } from './canvas';
import { ROLE, random } from '../config';
import { WIDTH, HEIGHT, roomBounds, walls, desks, furniture, workAnchors, loungeAnchors, hideSlots, HEAT_COLS } from '../world/floorplan';
import { visionFan } from './vision';

const world=(p:Point,y=0)=>new THREE.Vector3(p.x,y,HEIGHT-p.y);
const geometry=new THREE.BoxGeometry(1,1,1);
const materials=new Map<string,THREE.MeshStandardMaterial>();
function material(color:string) {
  let m=materials.get(color);if(!m){m=new THREE.MeshStandardMaterial({color,roughness:.9,flatShading:true});materials.set(color,m);}return m;
}
function block(parent:THREE.Object3D,w:number,h:number,d:number,x:number,y:number,z:number,m:THREE.Material|THREE.Material[]) {
  const mesh=new THREE.Mesh(geometry,m);mesh.scale.set(w,h,d);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
function label(text:string,color='#476359',width=3.5) {
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=160;
  const c=canvas.getContext('2d')!;c.clearRect(0,0,1024,160);c.fillStyle=color;c.font='600 72px Arial';c.textAlign='center';c.textBaseline='middle';c.fillText(text,512,80);
  const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,depthWrite:false,transparent:true}));sprite.scale.set(width,width*80/512,1);return sprite;
}
function pixelTexture(base:string,seed:number,face=false,hair='#37281f',longHair=false) {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=16;const c=canvas.getContext('2d')!,rng=random(seed);
  const color=new THREE.Color(base);
  for(let y=0;y<16;y++)for(let x=0;x<16;x++){const k=.86+rng()*.25;c.fillStyle=`#${color.clone().multiplyScalar(k).getHexString()}`;c.fillRect(x,y,1,1);}
  if(face){
    c.fillStyle=hair;c.fillRect(0,0,16,4);c.fillRect(0,4,longHair?3:1,longHair?12:3);c.fillRect(longHair?13:15,4,longHair?3:1,longHair?12:3);
    c.fillStyle='#f3eedb';c.fillRect(3,7,4,2);c.fillRect(9,7,4,2);c.fillStyle=longHair?'#4b794b':'#374e87';c.fillRect(5,7,2,2);c.fillRect(9,7,2,2);
    c.fillStyle='#a97150';c.fillRect(7,9,2,2);c.fillStyle=longHair?'#ad735e':'#664533';c.fillRect(5,12,6,2);
  }
  const texture=new THREE.CanvasTexture(canvas);texture.magFilter=texture.minFilter=THREE.NearestFilter;texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
interface Actor { root:THREE.Group; leftArm:THREE.Group;rightArm:THREE.Group;leftLeg:THREE.Group;rightLeg:THREE.Group; ring:THREE.Mesh; name:THREE.Sprite; fan:THREE.Mesh<THREE.BufferGeometry,THREE.MeshBasicMaterial>; outline:THREE.Line; path:THREE.Line; trail:THREE.Line; lastDistance:number }
function character(a:Agent,index:number):Actor {
  const root=new THREE.Group();root.name=`voxel-${a.id}`;root.userData.agentId=a.id;
  const skins=['#bd916d','#d3ac86','#9b684d','#e0bf96'],hairs=['#34271e','#a96c2b','#4d3529','#d18c36'];const skin=skins[index%4],hair=hairs[index%4],longHair=index%2===1;
  const skinMat=new THREE.MeshStandardMaterial({map:pixelTexture(skin,90+index),roughness:1});
  const faceMat=new THREE.MeshStandardMaterial({map:pixelTexture(skin,150+index,true,hair,longHair),roughness:1});
  const hairMat=material(hair),shirt=new THREE.MeshStandardMaterial({map:pixelTexture(ROLE[a.role].color,200+index),roughness:1});
  const pants=material(index%2?'#5a4638':'#343f7a'),shoe=material('#323c39');
  block(root,.42,.42,.42,0,1.45,0,[skinMat,skinMat,hairMat,skinMat,faceMat,hairMat]);
  if(longHair)block(root,.43,.34,.11,0,1.25,-.18,hairMat);
  block(root,.36,.55,.22,0,.975,0,shirt);block(root,.15,.1,.23,0,1.23,0,skinMat);
  const arm=(side:number)=>{const g=new THREE.Group();g.position.set(side*.26,1.23,0);block(g,.14,.2,.2,0,-.1,0,shirt);block(g,.14,.35,.18,0,-.375,0,skinMat);root.add(g);return g;};
  const leg=(side:number)=>{const g=new THREE.Group();g.position.set(side*.095,.7,0);block(g,.17,.55,.21,0,-.275,0,pants);block(g,.18,.15,.25,0,-.625,.025,shoe);root.add(g);return g;};
  const leftArm=arm(-1),rightArm=arm(1),leftLeg=leg(-1),rightLeg=leg(1);
  const ring=new THREE.Mesh(new THREE.RingGeometry(.38,.44,32),new THREE.MeshBasicMaterial({color:ROLE[a.role].color,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=.018;root.add(ring);
  const name=label(a.id,ROLE[a.role].color,1.5);name.position.set(0,1.95,0);root.add(name);
  const fan=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial({color:ROLE[a.role].color,transparent:true,opacity:.07,depthWrite:false,side:THREE.DoubleSide}));fan.frustumCulled=false;fan.renderOrder=1;
  const outline=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:ROLE[a.role].color,transparent:true,opacity:.32,depthWrite:false}));outline.frustumCulled=false;
  const path=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:ROLE[a.role].color,transparent:true,opacity:.35}));path.frustumCulled=false;
  const trail=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:ROLE[a.role].color,transparent:true,opacity:.4}));trail.frustumCulled=false;
  return {root,leftArm,rightArm,leftLeg,rightLeg,ring,name,fan,outline,path,trail,lastDistance:0};
}
function linePoints(line:THREE.Line,points:THREE.Vector3[]) {line.geometry.dispose();line.geometry=new THREE.BufferGeometry().setFromPoints(points);}
export class OfficeScene {
  renderer:THREE.WebGLRenderer; scene=new THREE.Scene();camera=new THREE.OrthographicCamera();controls:OrbitControls;
  actors=new Map<string,Actor>();blockerEdges=new THREE.Group();heat:THREE.InstancedMesh;wcPads:THREE.Mesh[]=[];visibleFovCount=0;
  quality:'balanced'|'high'|'ultra'='high';private qualityDirty=true;private shadowLight:THREE.DirectionalLight;private lastCamera='';
  private lastSimulation:Simulation|null=null;private lastTime=-1;private lastSelected='';private lastFlags='';private down={x:0,y:0};
  constructor(public canvas:HTMLCanvasElement) {
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});this.renderer.setPixelRatio(1);this.renderer.setClearColor('#f1f4ed');
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.1;this.renderer.shadowMap.autoUpdate=false;
    this.scene.add(new THREE.HemisphereLight('#fff9e7','#869e8d',1.8));const light=new THREE.DirectionalLight('#fff3d5',2);light.position.set(8,32,5);light.castShadow=true;light.shadow.mapSize.set(2048,2048);Object.assign(light.shadow.camera,{left:-30,right:30,top:30,bottom:-30,near:1,far:90});light.shadow.bias=-.0005;this.scene.add(light);this.shadowLight=light;
    this.controls=new OrbitControls(this.camera,canvas);this.controls.enableDamping=true;this.controls.minPolarAngle=.15;this.controls.maxPolarAngle=Math.PI*.47;this.controls.minZoom=.6;this.controls.maxZoom=5;
    this.resetCamera();
    block(this.scene,WIDTH+.8,.3,HEIGHT+.8,WIDTH/2,-.2,HEIGHT/2,material('#b8c7b9'));
    const roomColors={WORK:'#e9efdc',MEETING:'#dbe9eb',LOUNGE:'#f1e2ca',WC:'#d4e4e9',CORRIDOR:'#e6e4d9'};
    for(const [room,r] of Object.entries(roomBounds)){
      block(this.scene,r.w,.06,r.h,r.x+r.w/2,-.02,HEIGHT-r.y-r.h/2,material(roomColors[room as keyof typeof roomColors]));
      const name=label(room==='WORK'?'WORK · 22 DESKS':room,'#697e72',room==='WORK'?5:3.5);name.position.copy(world({x:r.x+r.w/2,y:r.y+r.h-.6},.22));this.scene.add(name);
    }
    const addWall=(x:number,y:number,w:number,h:number)=>block(this.scene,w,.8,h,x+w/2,.4,HEIGHT-y-h/2,material('#bdcdbb'));
    for(const r of walls)addWall(r.x,r.y,r.w,r.h);
    addWall(-.1,-.1,WIDTH+.2,.1);addWall(-.1,HEIGHT,WIDTH+.2,.1);addWall(-.1,0,.1,HEIGHT);addWall(WIDTH,0,.1,HEIGHT);
    for(const r of desks){const x=r.x+r.w/2,z=HEIGHT-r.y-r.h/2;block(this.scene,r.w,.12,r.h,x,.72,z,material('#b9bd91'));for(const sx of [-1,1])for(const sz of [-1,1])block(this.scene,.06,.66,.06,x+sx*(r.w/2-.1),.33,z+sz*(r.h/2-.08),material('#687d6d'));block(this.scene,.34,.24,.04,x,.93,z,material('#465e59'));}
    for(const p of workAnchors){const pos=world(p);block(this.scene,.34,.12,.32,pos.x,.38,pos.z,material('#849b82'));block(this.scene,.34,.35,.06,pos.x,.6,pos.z+.14,material('#849b82'));}
    for(const r of furniture){const height=r.id.startsWith('wc')?.85:r.id.includes('sofa')?.65:.65;block(this.scene,r.w,height,r.h,r.x+r.w/2,height/2,HEIGHT-r.y-r.h/2,material(r.id.includes('sofa')?'#d5af7e':'#b3c4bc'));}
    for(const p of loungeAnchors){const pos=world(p);block(this.scene,.4,.35,.4,pos.x,.175,pos.z,material('#d6b58e'));}
    for(let i=0;i<hideSlots.length;i++){const pos=world(hideSlots[i]);const pad=block(this.scene,.8,.06,.8,pos.x,.04,pos.z,material('#99b8ba'));this.wcPads.push(pad);const name=label(`WC ${i+1}`,'#6e8c8d',1);name.position.copy(pos).y=.8;this.scene.add(name);}
    for(const r of [...walls,...furniture,...desks]){const edge=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(r.w,.9,r.h)),new THREE.LineBasicMaterial({color:'#bc603e'}));edge.position.set(r.x+r.w/2,.45,HEIGHT-r.y-r.h/2);edge.userData.kind=r.kind;this.blockerEdges.add(edge);}this.scene.add(this.blockerEdges);
    this.heat=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({color:'white',transparent:true,opacity:.48,depthWrite:false,side:THREE.DoubleSide}),HEAT_COLS*Math.ceil(HEIGHT));this.heat.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.heat.frustumCulled=false;this.scene.add(this.heat);
    this.setQuality('high');
    canvas.addEventListener('pointerdown',e=>{this.down={x:e.clientX,y:e.clientY};});
  }
  setQuality(quality:'balanced'|'high'|'ultra') {
    this.quality=quality;const factor={balanced:1,high:2,ultra:3}[quality];
    const rect=this.canvas.getBoundingClientRect();
    const limit=this.renderer.getContext().getParameter(this.renderer.getContext().MAX_RENDERBUFFER_SIZE) as number;
    const ratio=Math.min(Math.max(devicePixelRatio,factor),3,limit/Math.max(1,rect.width,rect.height));
    this.renderer.setPixelRatio(ratio);
    const resolution=Math.min(this.renderer.capabilities.maxTextureSize,quality==='balanced'?2048:4096);
    this.shadowLight.shadow.mapSize.set(resolution,resolution);this.shadowLight.shadow.map?.dispose();this.shadowLight.shadow.map=null;
    this.qualityDirty=true;this.canvas.dataset.quality=quality;this.canvas.dataset.pixelRatio=String(ratio);this.canvas.dataset.shadowResolution=String(resolution);
  }
  private removeActor(id:string,actor:Actor) {
    const shared=new Set(materials.values()),disposedMaterials=new Set<THREE.Material>(),disposedTextures=new Set<THREE.Texture>();
    for(const root of [actor.root,actor.fan,actor.outline,actor.path,actor.trail]) {
      this.scene.remove(root);root.traverse(object=>{
        const mesh=object as THREE.Mesh;if(mesh.geometry&&mesh.geometry!==geometry&&!((object as THREE.Sprite).isSprite))mesh.geometry.dispose();
        if(!mesh.material)return;
        for(const mat of Array.isArray(mesh.material)?mesh.material:[mesh.material]) {
          if(shared.has(mat as THREE.MeshStandardMaterial)||disposedMaterials.has(mat))continue;
          const map=(mat as THREE.MeshStandardMaterial).map;if(map&&!disposedTextures.has(map)){map.dispose();disposedTextures.add(map);}
          mat.dispose();disposedMaterials.add(mat);
        }
      });
    }
    this.actors.delete(id);
  }
  resetCamera(){this.controls?.target.set(WIDTH/2,0,HEIGHT/2);this.camera.position.set(WIDTH/2+21,29,HEIGHT/2+27);this.camera.zoom=1;this.camera.lookAt(WIDTH/2,0,HEIGHT/2);this.camera.updateProjectionMatrix();this.controls?.update();}
  pick(event:MouseEvent):string|null {
    if(Math.hypot(event.clientX-this.down.x,event.clientY-this.down.y)>6)return null;
    const r=this.canvas.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1),this.camera);
    const hits=ray.intersectObjects([...this.actors.values()].map(a=>a.root),true);
    for(const hit of hits){let obj:THREE.Object3D|null=hit.object;while(obj){if(obj.userData.agentId)return obj.userData.agentId;obj=obj.parent;}}return null;
  }
  project(id:string) {const actor=this.actors.get(id);if(!actor)return null;const p=actor.root.position.clone();p.y=1;p.project(this.camera);const r=this.canvas.getBoundingClientRect();return {x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};}
  draw(s:Simulation,v:View) {
    const rect=this.canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;
    const width=Math.round(rect.width),height=Math.round(rect.height);
    const size=this.renderer.getSize(new THREE.Vector2()),resized=size.x!==width||size.y!==height;if(resized){this.renderer.setSize(width,height,false);const span=HEIGHT*1.65,aspect=width/height;this.camera.left=-span*aspect/2;this.camera.right=span*aspect/2;this.camera.top=span/2;this.camera.bottom=-span/2;this.camera.updateProjectionMatrix();}
    this.controls.update();const flags=JSON.stringify(v),changed=s!==this.lastSimulation||s.time!==this.lastTime||v.selected!==this.lastSelected||flags!==this.lastFlags;
    const cameraState=JSON.stringify([this.camera.position.toArray(),this.camera.quaternion.toArray(),this.camera.zoom,this.controls.target.toArray()]);
    if(!changed&&!resized&&!this.qualityDirty&&cameraState===this.lastCamera)return;
    const ids=new Set(s.agents.map(a=>a.id));for(const [id,actor] of this.actors)if(!ids.has(id))this.removeActor(id,actor);
    this.visibleFovCount=0;
    for(let i=0;i<s.agents.length;i++){
      const a=s.agents[i];let actor=this.actors.get(a.id);if(!actor){actor=character(a,i);this.actors.set(a.id,actor);this.scene.add(actor.root,actor.fan,actor.outline,actor.path,actor.trail);}
      actor.root.position.copy(world(a));actor.root.rotation.y=a.heading+Math.PI/2;actor.ring.visible=a.id===v.selected;
      const moving=a.distance>actor.lastDistance+1e-7;const phase=a.distance*7;
      // No wall-clock animation: pause freezes gait and gestures with simulation time.
      if(changed){const swing=moving?Math.sin(phase)*.55:0;actor.leftLeg.rotation.x=swing;actor.rightLeg.rotation.x=-swing;actor.leftArm.rotation.x=-swing;actor.rightArm.rotation.x=swing;
        if(a.state==='PHONE'){actor.rightArm.rotation.x=-1.2;actor.leftArm.rotation.x=-.5;}else if(a.state==='PRETEND_WORK'&&!a.path.length){actor.rightArm.rotation.x=-.8+Math.sin(s.time*4)*.1;actor.leftArm.rotation.x=-.8;}
      }
      actor.lastDistance=a.distance;
      const fov=v.allFov||(v.fov&&a.id===v.selected);actor.fan.visible=actor.outline.visible=fov;if(fov)this.visibleFovCount++;
      actor.fan.material.opacity=a.id===v.selected?.17:.075;(actor.outline.material as THREE.LineBasicMaterial).opacity=a.id===v.selected?.85:.32;
      if(changed&&fov){const edge=visionFan(a,s.config),vertices:number[]=[];for(let j=0;j<edge.length-1;j++){for(const p of [a,edge[j],edge[j+1]])vertices.push(p.x,.06+i*.0002,HEIGHT-p.y);}actor.fan.geometry.dispose();actor.fan.geometry=new THREE.BufferGeometry();actor.fan.geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));linePoints(actor.outline,[a,...edge,a].map(p=>world(p,.075+i*.0002)));}
      actor.path.visible=v.paths&&a.path.length>0;actor.trail.visible=v.trails&&a.trail.length>0;
      if(changed){if(actor.path.visible)linePoints(actor.path,[a,...a.path].map(p=>world(p,.1)));if(actor.trail.visible)linePoints(actor.trail,a.trail.map(p=>world(p,.09)));}
    }
    this.blockerEdges.visible=v.blockers;for(const edge of this.blockerEdges.children)edge.visible=edge.userData.kind==='wall'?!s.config.openVisibility:edge.userData.kind==='desk'?s.config.desksBlockSight:true;
    this.heat.visible=v.heat;
    if(changed&&v.heat){const max=Math.max(1,...s.heat),dummy=new THREE.Object3D();s.heat.forEach((n,i)=>{const x=i%HEAT_COLS,y=Math.floor(i/HEAT_COLS),w=Math.min(1,WIDTH-x),h=Math.min(1,HEIGHT-y);dummy.position.set(x+w/2,.04,HEIGHT-y-h/2);dummy.rotation.x=-Math.PI/2;dummy.scale.set(w,h,1);dummy.updateMatrix();this.heat.setMatrixAt(i,dummy.matrix);this.heat.setColorAt(i,new THREE.Color('#f4efdf').lerp(new THREE.Color('#b86335'),n/max));});this.heat.instanceMatrix.needsUpdate=true;if(this.heat.instanceColor)this.heat.instanceColor.needsUpdate=true;}
    for(let i=0;i<this.wcPads.length;i++)this.wcPads[i].material=[...s.wc.slots.values()].includes(i)?material('#be8456'):material('#99b8ba');
    this.lastSimulation=s;this.lastTime=s.time;this.lastSelected=v.selected;this.lastFlags=flags;this.lastCamera=cameraState;this.renderer.shadowMap.needsUpdate=changed||this.qualityDirty;this.qualityDirty=false;this.renderer.render(this.scene,this.camera);
    this.canvas.dataset.agents=String(this.actors.size);this.canvas.dataset.fovCount=String(this.visibleFovCount);this.canvas.dataset.renderer='three-voxel';
  }
}
