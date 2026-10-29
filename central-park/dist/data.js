import {makeArea,project,distance} from './engine.js';
const DB='cp-distance-v1';
async function db(){return new Promise((res,rej)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore('cache');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
export async function cacheGet(key){try{const d=await db();return await new Promise((res,rej)=>{const tx=d.transaction('cache'),r=tx.objectStore('cache').get(key);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);tx.oncomplete=()=>d.close();});}catch{return null;}}
export async function cachePut(key,value){try{const d=await db();await new Promise((res,rej)=>{const tx=d.transaction('cache','readwrite');tx.objectStore('cache').put(value,key);tx.oncomplete=()=>{d.close();res();};tx.onerror=()=>rej(tx.error);});}catch{/* Private browser modes may disable storage. */}}
export async function getJSON(url,options={}){const response=await fetch(url,{...options,signal:options.signal??AbortSignal.timeout(110000)});if(!response.ok)throw new Error('HTTP '+response.status+' · '+new URL(url).hostname);return response.json();}
export function selectPark(data){const features=data.features??[],matches=features.filter(f=>{const p=f.properties??{};return Object.values(p).some(v=>typeof v==='string'&&(v==='M010'||/^central park$/i.test(v)));});const valid=(matches.length?matches:features).filter(f=>['Polygon','MultiPolygon'].includes(f.geometry?.type));if(!valid.length)throw new Error('Park boundary unavailable.');valid.sort((a,b)=>{const size=f=>{const ar=makeArea(f.geometry);return (ar.bounds[2]-ar.bounds[0])*(ar.bounds[3]-ar.bounds[1]);};return size(b)-size(a);});const selected=valid[0],area=makeArea(selected.geometry),w=area.bounds[2]-area.bounds[0],h=area.bounds[3]-area.bounds[1];if(w<2500||h<5000||w>6500||h>8000)throw new Error('Unexpected park boundary extent.');return selected;}
export async function loadBoundary(){const old=await cacheGet('park');if(old)return {...old,cached:true};const url="https://data.cityofnewyork.us/resource/enfh-gkve.geojson?$where="+encodeURIComponent("gispropnum='M010'")+"&$limit=100";const data=await getJSON(url);const feature=selectPark(data);const value={feature,source:url,fetched:new Date().toISOString()};await cachePut('park',value);return value;}
export async function loadRoads(area,force=false,endpoint=0){const old=await cacheGet('osm');if(old&&!force&&Date.now()-old.fetched<7*86400000)return {...old,cached:true};const corners=[[area.bounds[0]-300,area.bounds[1]-300],[area.bounds[2]+300,area.bounds[3]+300]];const {unproject}=await import('./engine.js'),a=unproject(corners[0]),b=unproject(corners[1]);const bbox=[a[1],a[0],b[1],b[0]].join(',');const query=`[out:json][timeout:90];(way["highway"](${bbox});relation["type"="restriction"](${bbox});way["natural"="water"](${bbox}););(._;>;);out body;`;const urls=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter'];try{const raw=await getJSON(urls[endpoint]??urls[0],{method:'POST',body:'data='+encodeURIComponent(query),headers:{'Content-Type':'application/x-www-form-urlencoded'}});if(raw.remark||!raw.elements?.length)throw new Error(raw.remark??'Road data is empty.');const value={raw,source:urls[endpoint]??urls[0],fetched:Date.now(),timestamp:raw.osm3s?.timestamp_osm_base};await cachePut('osm',value);return value;}catch(error){if(old)return {...old,cached:true,outdated:true};throw error;}}
const number=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
const timestamp=v=>{if(typeof v==='number')return number(v);if(typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v)){const t=Date.parse(v)/1000;return Number.isFinite(t)&&t>=0?t:null;}return null;};
const flag=v=>v===true||v===1?true:v===false||v===0?false:null;
export function normalizeStations(info,status,area,vehicleTypes=null){
 const byID=new Map((status?.data?.stations??[]).map(s=>[String(s.station_id),s]));
 const electric=new Set((vehicleTypes?.data?.vehicle_types??[]).filter(v=>v.form_factor==='bicycle'&&['electric_assist','electric'].includes(v.propulsion_type)).map(v=>String(v.vehicle_type_id)));
 return (info?.data?.stations??[]).map(i=>{
  if(!['string','number'].includes(typeof i.station_id)||String(i.station_id).trim()===''||!Number.isFinite(i.lon)||!Number.isFinite(i.lat))return null;const p=project([i.lon,i.lat]);if(!area.contains(p))return null;
  const found=byID.get(String(i.station_id)),s=found??{};let ebikes=number(s.num_ebikes_available);
  if(ebikes===null&&Array.isArray(s.vehicle_types_available)&&electric.size){
   const known=s.vehicle_types_available.filter(v=>electric.has(String(v.vehicle_type_id)));
   if(known.length&&known.every(v=>number(v.count)!==null))ebikes=known.reduce((n,v)=>n+v.count,0);
  }
  return {id:String(i.station_id),name:i.name??String(i.station_id),p,lon:i.lon,lat:i.lat,ebikes,docks:number(s.num_docks_available),installed:flag(s.is_installed),renting:flag(s.is_renting),returning:flag(s.is_returning),timestamp:found?(timestamp(s.last_reported)??timestamp(status?.last_updated)):null,status_present:!!found,battery:'unknown'};
 }).filter(Boolean);
}
export async function loadStations(area){
 const index=await getJSON('https://gbfs.citibikenyc.com/gbfs/gbfs.json');
 const feeds=index.data?.en?.feeds??index.data?.feeds??Object.values(index.data??{}).find(v=>Array.isArray(v?.feeds))?.feeds;
 if(!Array.isArray(feeds))throw new Error('Unsupported GBFS version');
 const get=name=>{const u=feeds.find(f=>f.name===name)?.url;if(!u)throw new Error('GBFS '+name+' missing');return getJSON(u);};
 let statusError=null;
 const [info,status,types]=await Promise.all([get('station_information'),get('station_status').catch(e=>{statusError=e.message;return null;}),feeds.some(f=>f.name==='vehicle_types')?get('vehicle_types').catch(()=>null):null]);
 if(!Array.isArray(info.data?.stations))throw new Error('Invalid GBFS station_information schema');
 const validStatus=Array.isArray(status?.data?.stations)?status:null;if(!validStatus&&!statusError)statusError='Invalid or missing station_status schema';
 const stations=normalizeStations(info,validStatus,area,types);if(!stations.length)throw new Error('No station metadata in the study area.');
 const value={stations,version:index.version,ttl:Math.max(60,Number(validStatus?.ttl)||60),fetched:Date.now(),source_timestamp:validStatus?.last_updated??null,status_error:statusError};await cachePut('stations',value);return value;
}
export async function hashJSON(value){const bytes=new TextEncoder().encode(JSON.stringify(value));const digest=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');}
