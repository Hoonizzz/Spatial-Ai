import * as THREE from './vendor/three.module.js';
import {createNetwork,randomTourist,shortestRoute,locationOnLeg,coordinates,distance,WALK_SPEED} from './model.mjs?v=soho-1';

const $=id=>document.getElementById(id),status=$('status');
async function boot(){
  const response=await fetch('./data/soho.json?v=soho-1');
  if(!response.ok)throw new Error(`Map data could not be loaded (${response.status}).`);
  const data=await response.json(),network=createNetwork(data);
  const renderer=new THREE.WebGLRenderer({antialias:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
  renderer.setClearColor(0xf5f3ed);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  $('viewport').appendChild(renderer.domElement);
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera();
  const light=new THREE.DirectionalLight(0xfff3e5,2.3);light.position.set(-450,900,350);light.castShadow=true;
  light.shadow.mapSize.set(1024,1024);light.shadow.camera.left=-750;light.shadow.camera.right=750;
  light.shadow.camera.top=750;light.shadow.camera.bottom=-750;light.shadow.camera.far=2000;light.shadow.normalBias=.5;
  scene.add(light,new THREE.HemisphereLight(0xffffff,0x9ca88d,1.5));
  const material=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.92,...extra});
  let dirty=true,angle=Math.PI*.8,zoom=1,selected=null,tourist=randomTourist(network),route=null,walking=false,legIndex=0,legDistance=0,traveled=0;
  const shapeFor=(points,holes=[])=>{
    const shape=new THREE.Shape(points.map(p=>new THREE.Vector2(p.x??p[0],-(p.z??p[1]))));
    for(const hole of holes)shape.holes.push(new THREE.Path(hole.map(([x,z])=>new THREE.Vector2(x,-z))));
    return shape;
  };
  const ground=new THREE.Mesh(new THREE.ExtrudeGeometry(shapeFor(data.boundary),{depth:3,bevelEnabled:false}),material(0xe7e5d9));
  ground.geometry.rotateX(-Math.PI/2);ground.position.y=-3;ground.receiveShadow=true;scene.add(ground);
  function stripGeometry(segments,width,y){
    const values=[];
    for(const [a,b] of segments){
      const len=distance(a,b);if(len<.001)continue;
      const dx=-(b.z-a.z)/len*width/2,dz=(b.x-a.x)/len*width/2;
      const p=[[a.x+dx,y,a.z+dz],[a.x-dx,y,a.z-dz],[b.x+dx,y,b.z+dz],[b.x-dx,y,b.z-dz]];
      for(const i of [0,1,2,2,1,3])values.push(...p[i]);
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(values,3));geo.computeVertexNormals();return geo;
  }
  const roads=new THREE.Mesh(stripGeometry(data.streetSegments,11,.12),material(0xd2d2c7,{side:THREE.DoubleSide}));
  roads.receiveShadow=true;scene.add(roads);
  const borderPoints=[...data.boundary,data.boundary[0]].map(p=>new THREE.Vector3(p.x,.25,p.z));
  const border=new THREE.Line(new THREE.BufferGeometry().setFromPoints(borderPoints),new THREE.LineDashedMaterial({color:0x879b7b,dashSize:7,gapSize:5}));
  border.computeLineDistances();scene.add(border);

  // Batch all building surfaces into one draw call while retaining face-to-ID ranges.
  const geometries=[],ranges=[],positions=[],normals=[],colors=[];
  const palette=[0xb69a87,0xc6b6a1,0xd6c9b3,0xa5aca0,0xb6b49f,0xc2a896];
  let vertexCount=0;
  data.buildings.forEach((building,i)=>{
    let geo=new THREE.ExtrudeGeometry(shapeFor(building.footprint,building.holes),{depth:building.height,bevelEnabled:false});
    geo.rotateX(-Math.PI/2);if(geo.index)geo=geo.toNonIndexed();geometries.push(geo);
    const p=geo.getAttribute('position').array,n=geo.getAttribute('normal').array,c=new Float32Array(p.length);
    const wall=new THREE.Color(palette[i%palette.length]),roof=new THREE.Color(0xdedbcc);
    for(let k=0;k<p.length;k+=3){const color=n[k+1]>.7?roof:wall;c[k]=color.r;c[k+1]=color.g;c[k+2]=color.b;}
    positions.push(p);normals.push(n);colors.push(c);vertexCount+=p.length/3;
    ranges.push(vertexCount/3);
  });
  const concat=arrays=>{const result=new Float32Array(arrays.reduce((sum,a)=>sum+a.length,0));let offset=0;for(const a of arrays){result.set(a,offset);offset+=a.length;}return result;};
  const cityGeo=new THREE.BufferGeometry();
  cityGeo.setAttribute('position',new THREE.BufferAttribute(concat(positions),3));
  cityGeo.setAttribute('normal',new THREE.BufferAttribute(concat(normals),3));
  cityGeo.setAttribute('color',new THREE.BufferAttribute(concat(colors),3));
  const city=new THREE.Mesh(cityGeo,material(0xffffff,{vertexColors:true}));city.castShadow=true;city.receiveShadow=true;scene.add(city);
  function buildingAtFace(face){
    let low=0,high=ranges.length-1;
    while(low<high){const mid=(low+high)>>1;if(face<ranges[mid])high=mid;else low=mid+1;}
    return data.buildings[low];
  }
  const selectedMesh=new THREE.Mesh(new THREE.BufferGeometry(),material(0xa49abb,{polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
  selectedMesh.visible=false;scene.add(selectedMesh);

  function label(text,color,size=22){
    const c=document.createElement('canvas');c.width=256;c.height=96;const ctx=c.getContext('2d');
    ctx.font='600 40px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=color;ctx.fillText(text,128,48);
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),depthTest:false}));sprite.scale.set(size*2.6,size,1);return sprite;
  }
  const destinationLabel=label('','#8574a8');destinationLabel.visible=false;scene.add(destinationLabel);
  function updateDestinationLabel(text){
    const old=destinationLabel.material.map,replacement=label(text,'#78678f',20);
    destinationLabel.material.map=replacement.material.map;destinationLabel.material.needsUpdate=true;old.dispose();replacement.material.dispose();
  }
  // Navigation marker is deliberately enlarged; metric city geometry is unchanged.
  const person=new THREE.Group(),body=new THREE.Group();person.add(body);scene.add(person);body.scale.setScalar(3);
  function box(w,h,d,color,x,y,z){
    const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material(color));m.position.set(x,y,z);m.castShadow=true;body.add(m);return m;
  }
  const legs=[box(.7,2,.8,0x8c997c,-.5,1.5,0),box(.7,2,.8,0x8c997c,.5,1.5,0)];
  for(const s of [-1,1]){box(.8,.5,1.2,0xe8e4d6,s*.5,.4,.1);box(.6,1,.8,0xd68d62,s*1.3,3.8,0);box(.45,1.1,.6,0xd6ad87,s*1.3,2.9,0);}
  const shirt=box(2,2.1,1.2,0xd68d62,0,3.5,0);
  const shirtCanvas=document.createElement('canvas');shirtCanvas.width=shirtCanvas.height=128;
  const ctx=shirtCanvas.getContext('2d');ctx.fillStyle='#d68d62';ctx.fillRect(0,0,128,128);
  for(let x=10;x<128;x+=25)for(let y=10;y<128;y+=25){ctx.fillStyle='#fff0c9';for(let a=0;a<5;a++){ctx.beginPath();ctx.arc(x+Math.cos(a*1.256)*4,y+Math.sin(a*1.256)*4,3,0,Math.PI*2);ctx.fill();}}
  shirt.material=material(0xffffff,{map:new THREE.CanvasTexture(shirtCanvas)});
  box(1.6,2,.8,0x586c57,0,3.4,-1);for(const s of [-1,1])box(.16,2,.1,0x586c57,s*.7,3.5,.65);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.75,12,8),material(0xd6ad87));head.position.y=5.15;body.add(head);
  const hair=box(1.3,.45,1.25,0x494b3d,0,5.65,0);
  const personLabel=label('T','#b47750',40);personLabel.position.y=43;person.add(personLabel);
  const marker=new THREE.Mesh(new THREE.RingGeometry(4.5,6.5,40),new THREE.MeshBasicMaterial({color:0xd68d62,side:THREE.DoubleSide,depthTest:false}));
  marker.rotation.x=-Math.PI/2;marker.position.y=.5;person.add(marker);
  const origin=label('0, 0','#8b9b80',12);origin.position.set(0,.5,0);scene.add(origin);
  const originCross=new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-6,.3,0),new THREE.Vector3(6,.3,0),new THREE.Vector3(0,.3,-6),new THREE.Vector3(0,.3,6)
  ]),new THREE.LineBasicMaterial({color:0x899a7b}));scene.add(originCross);
  let routeMesh=null;
  function drawRoute(){
    if(routeMesh){scene.remove(routeMesh);routeMesh.geometry.dispose();routeMesh.material.dispose();routeMesh=null;}
    if(route?.legs.length){
      routeMesh=new THREE.Mesh(stripGeometry(route.legs.map(leg=>[leg.from,leg.to]),3.2,.55),new THREE.MeshBasicMaterial({color:0xd38959,side:THREE.DoubleSide,depthTest:false}));
      routeMesh.renderOrder=4;scene.add(routeMesh);
    }
    dirty=true;
  }
  function formatGeo(point){const c=coordinates(point,data);return `${c.latitude.toFixed(6)}° N · ${Math.abs(c.longitude).toFixed(6)}° W`;}
  $('local-origin').textContent=`Origin · ${formatGeo({x:0,z:0})}`;
  function updatePosition(){
    person.position.set(tourist.point.x,0,tourist.point.z);
    $('position-x').textContent=tourist.point.x.toFixed(1);$('position-z').textContent=tourist.point.z.toFixed(1);
    $('geo-position').textContent=formatGeo(tourist.point);dirty=true;
  }
  const select=$('destination');
  for(const building of data.buildings){
    const option=document.createElement('option');option.value=building.id;option.textContent=`${building.id} · ${building.name}${building.entrance?'':' · No modeled access'}`;select.appendChild(option);
  }
  select.disabled=false;$('building-count').textContent=data.buildings.length;
  function showRoute(){
    $('route-distance').textContent=route?route.distance.toFixed(0):'—';
    $('route-time').textContent=route?(route.distance/WALK_SPEED/60).toFixed(1):'—';
    $('route-badge').textContent=route?'Route ready':selected?'No modeled access':'Choose destination';
    $('walk').disabled=!route||route.distance<.01;$('pause').disabled=true;
    $('walk').innerHTML='Start walk <span>→</span>';$('walk-progress').style.width='0%';
    $('directions').replaceChildren();
    if(route){
      for(const step of route.steps){const li=document.createElement('li'),text=document.createElement('span'),length=document.createElement('small');
        text.textContent=step.text;length.textContent=step.distance?`${step.distance.toFixed(0)} m`:'';li.append(text,length);$('directions').appendChild(li);}
    }else{const li=document.createElement('li');li.className='empty-directions';li.textContent=selected?'No connected entrance exists for this building in the model.':'Your route and directions will appear here.';$('directions').appendChild(li);}
    drawRoute();
  }
  function selectBuilding(id){
    const building=data.buildings.find(b=>b.id===id);walking=false;legIndex=0;legDistance=0;traveled=0;selected=building??null;select.value=building?.id??'';
    selectedMesh.visible=!!building;destinationLabel.visible=!!building;$('building-details').hidden=!building;
    if(building){
      const index=data.buildings.indexOf(building);selectedMesh.geometry=geometries[index];
      updateDestinationLabel(building.id);destinationLabel.position.set(building.center.x,building.height+20,building.center.z);
      $('building-name').textContent=`${building.id} · ${building.name}`;$('building-height').textContent=`${building.height.toFixed(1)} m high`;
      const p=building.entrance?.door??building.center;
      $('building-position').textContent=`${building.entrance?'Entrance':'Center'} · X ${p.x.toFixed(1)}, Z ${p.z.toFixed(1)} m`;
      $('building-geo').textContent=formatGeo(p);
      route=shortestRoute(network,tourist,building);
      status.textContent=route?`Shortest modeled walk from Tourist T to ${building.id}. Follow the orange route.`:'This building has no connected modeled entrance. Choose a different building.';
    }else{route=null;status.textContent='Select any 3D building to plan a walk.';}
    $('tourist-state').textContent=tourist.accessId?'At a modeled entrance':'On a SoHo street';showRoute();return !!route;
  }
  select.addEventListener('change',()=>selectBuilding(select.value));
  $('respawn').onclick=()=>{tourist=randomTourist(network);updatePosition();selectBuilding(selected?.id);status.textContent=selected&&route?'New street position generated. The shortest route has been recalculated.':'New street position generated. Select a building to plan a walk.';};
  $('walk').onclick=()=>{
    if(!route||route.distance<.01)return;
    if(legIndex>=route.legs.length)selectBuilding(selected.id);
    walking=true;$('walk').disabled=true;$('pause').disabled=false;$('tourist-state').textContent='Walking · 20× playback';$('route-badge').textContent='Walking';status.textContent='Tourist T is following the route. Coordinates update as the tourist moves.';
  };
  $('pause').onclick=()=>{walking=false;$('walk').disabled=false;$('walk').innerHTML='Resume walk <span>→</span>';$('pause').disabled=true;$('tourist-state').textContent='Paused';$('route-badge').textContent='Paused';status.textContent='Walk paused. Resume, or choose another building to replan from this position.';dirty=true;};
  function advanceWalk(seconds){
    if(!walking||!route)return;
    let budget=seconds*WALK_SPEED*20;
    while(budget>0&&legIndex<route.legs.length){
      const leg=route.legs[legIndex],step=Math.min(budget,leg.length-legDistance);
      legDistance+=step;traveled+=step;budget-=step;tourist=locationOnLeg(leg,Math.min(1,legDistance/leg.length));
      body.rotation.y=Math.atan2(leg.to.x-leg.from.x,leg.to.z-leg.from.z);
      if(legDistance>=leg.length-1e-8){legIndex++;legDistance=0;}
    }
    updatePosition();$('walk-progress').style.width=`${Math.min(100,traveled/route.distance*100)}%`;
    if(legIndex>=route.legs.length){walking=false;traveled=route.distance;$('walk-progress').style.width='100%';$('walk').disabled=true;$('pause').disabled=true;$('tourist-state').textContent=`Arrived at ${selected.id}`;$('route-badge').textContent='Arrived';status.textContent=`Arrived at the modeled entrance of ${selected.name}. Select another building to continue.`;}
  }

  function resize(){
    const w=innerWidth,h=innerHeight,aspect=w/h,size=(w<=760?780:560)/zoom;
    renderer.setSize(w,h);camera.left=-size*aspect;camera.right=size*aspect;camera.top=size;camera.bottom=-size;camera.near=.1;camera.far=4000;
    // Reserve the mobile bottom panel without changing geographic positions.
    camera.setViewOffset(w,h,w<=760?0:Math.round(w*.025),w<=760?Math.round(h*.13):0,w,h);
    camera.position.set(Math.sin(angle)*1100,1050,Math.cos(angle)*1100);camera.lookAt(0,0,0);camera.updateProjectionMatrix();camera.updateMatrixWorld();
    $('north-arrow').style.transform=`rotate(${angle*180/Math.PI}deg)`;dirty=true;
  }
  addEventListener('resize',resize);resize();
  const changeZoom=delta=>{zoom=THREE.MathUtils.clamp(zoom+delta,.65,3);resize();};
  $('zoom-in').onclick=()=>changeZoom(.2);$('zoom-out').onclick=()=>changeZoom(-.2);
  $('reset-view').onclick=()=>{angle=Math.PI*.8;zoom=1;resize();};
  const raycaster=new THREE.Raycaster(),mouse=new THREE.Vector2(),canvas=renderer.domElement;
  let pointer=null;
  canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;pointer={id:e.pointerId,x:e.clientX,y:e.clientY,lastX:e.clientX,dragged:false};canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{
    if(!pointer||e.pointerId!==pointer.id)return;
    if(Math.hypot(e.clientX-pointer.x,e.clientY-pointer.y)>6)pointer.dragged=true;
    if(pointer.dragged){angle-=(e.clientX-pointer.lastX)*.005;resize();}pointer.lastX=e.clientX;
  });
  canvas.addEventListener('pointercancel',()=>pointer=null);
  canvas.addEventListener('pointerup',e=>{
    if(!pointer||e.pointerId!==pointer.id)return;
    const dragged=pointer.dragged;pointer=null;if(dragged)return;
    const rect=canvas.getBoundingClientRect();mouse.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(mouse,camera);
    const hit=raycaster.intersectObject(city,false)[0];
    if(hit)selectBuilding(buildingAtFace(hit.faceIndex).id);
    else status.textContent='Click a building, or choose one from the destination list. Use ↻ to generate a new starting point.';
  });
  canvas.addEventListener('wheel',e=>{e.preventDefault();changeZoom(-e.deltaY*.0008);},{passive:false});
  updatePosition();
  let last=performance.now();
  function tick(now){const dt=Math.min((now-last)/1000,.1);last=now;
    if(walking){advanceWalk(dt);legs.forEach((leg,i)=>leg.rotation.x=Math.sin(now*.009+i*Math.PI)*.2);}
    else legs.forEach(leg=>leg.rotation.x=0);
    if(dirty){renderer.render(scene,camera);dirty=false;}requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);$('loading').remove();document.documentElement.dataset.ready='true';
  if(new URLSearchParams(location.search).has('test'))window.spatialTest={
    state:()=>({tourist:structuredClone(tourist),selected:selected?.id??null,walking,route:route?structuredClone(route):null,buildingCount:data.buildings.length}),
    selectBuilding,advanceWalk,
    buildings:()=>data.buildings,
    screen:(x,z,y=0)=>{const p=new THREE.Vector3(x,y,z).project(camera);return{x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2};}
  };
}
boot().catch(error=>{console.error(error);$('loading').textContent='Unable to open the 3D map. Reload, or use a browser with WebGL enabled.';status.textContent=error.message;});
