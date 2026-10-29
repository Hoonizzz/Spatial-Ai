// Public Mapzen/AWS Terrarium DEM. Heights are metres; source resolution limits grades.
import {distance, project} from './engine.js';
import {cacheGet, cachePut} from './data.js';
export const decodeHeight=(r,g,b)=>r*256+g+b/256-32768;
export function tilePoint(lon,lat,z=14){const n=2**z,x=(lon+180)/360*n,y=(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*n;return {x:Math.floor(x),y:Math.floor(y),px:(x-Math.floor(x))*256,py:(y-Math.floor(y))*256,z};}
export async function loadTerrain(raw){
 const data=structuredClone(raw),nodes=new Map(data.elements.filter(n=>n.type==='node').map(n=>[n.id,n]));let next=-1;
 // Sample long ways every 30 m, retaining original intersections and restriction nodes.
 for(const w of data.elements.filter(w=>w.type==='way'&&w.tags?.highway)){
  const ids=[];for(let i=0;i<w.nodes.length;i++){const a=nodes.get(w.nodes[i]);if(!a)continue;ids.push(a.id);const b=nodes.get(w.nodes[i+1]);if(!b)continue;const steps=Math.ceil(distance(project([a.lon,a.lat]),project([b.lon,b.lat]))/30);
   for(let k=1;k<steps;k++){while(nodes.has(next))next--;const t=k/steps,n={type:'node',id:next--,lon:a.lon+(b.lon-a.lon)*t,lat:a.lat+(b.lat-a.lat)*t};nodes.set(n.id,n);data.elements.push(n);ids.push(n.id);}}
  w.nodes=ids;
 }
 const needed=new Set(data.elements.filter(w=>w.type==='way'&&w.tags?.highway).flatMap(w=>w.nodes)),groups=new Map();
 for(const id of needed){const n=nodes.get(id);if(!n)continue;const t=tilePoint(n.lon,n.lat),key=`${t.z}/${t.x}/${t.y}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push({n,t});}
 const queue=[...groups];await Promise.all(Array.from({length:4},async()=>{while(queue.length){const [key,points]=queue.pop();let pixels=await cacheGet('dem-v1-'+key);if(!pixels){const url=`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${key}.png`,r=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error('Terrain unavailable: HTTP '+r.status);const bitmap=await createImageBitmap(await r.blob()),canvas=new OffscreenCanvas(256,256),ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);pixels=ctx.getImageData(0,0,256,256).data;bitmap.close();await cachePut('dem-v1-'+key,pixels);}
 for(const {n,t} of points){const x=Math.max(0,Math.min(255,t.px)),y=Math.max(0,Math.min(255,t.py)),x0=Math.floor(x),y0=Math.floor(y),dx=x-x0,dy=y-y0;const height=(x,y)=>{const i=(Math.min(255,y)*256+Math.min(255,x))*4;return decodeHeight(pixels[i],pixels[i+1],pixels[i+2]);};const h=(1-dy)*((1-dx)*height(x0,y0)+dx*height(x0+1,y0))+dy*((1-dx)*height(x0,y0+1)+dx*height(x0+1,y0+1));n.tags={...n.tags,ele:h};}
 }}));
 data.terrain={source:'Mapzen Terrarium / AWS Open Data',url:'https://registry.opendata.aws/terrain-tiles/',zoom:14,sample_m:30,fetched:new Date().toISOString()};return data;
}
