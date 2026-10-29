import {search,reverseWalkingGraph,coordinates,unproject,energy,slopeSeconds} from './engine.js';

export function facilityAvailability(s,role,now=Date.now()/1000){
 if(s.status_present===false||s.status_error)return {state:'STATUS_UNKNOWN',eligible:false,reason:'Status feed record unavailable or refresh failed'};
 const count=role==='pickup'?s.ebikes:s.docks,open=role==='pickup'?s.renting:s.returning;
 if(!Number.isFinite(s.timestamp)||now-s.timestamp>300||s.timestamp-now>=60)return {state:'STATUS_UNKNOWN',eligible:false,reason:'Status missing, stale (>5 min), or clock invalid'};
 if(typeof s.installed!=='boolean'||typeof open!=='boolean'||(!Number.isFinite(count)||count<0))return {state:'STATUS_UNKNOWN',eligible:false,reason:'Required operating flags or role-specific count unknown'};
 if(!s.installed)return {state:'UNAVAILABLE',eligible:false,reason:'Station not installed'};
 if(!open)return {state:'UNAVAILABLE',eligible:false,reason:role==='pickup'?'Renting disabled':'Returning disabled'};
 if(count<1)return {state:'UNAVAILABLE',eligible:false,reason:role==='pickup'?'No available e-bike':'No available dock'};
 return {state:'AVAILABLE',eligible:true,reason:role==='pickup'?'Installed, renting, e-bike count ≥1':'Installed, returning, dock count ≥1'};
}
export function classifyFacility(seconds,availability,threshold){
 const proximity=seconds===null?'DISCONNECTED':seconds<=threshold*60+1e-8?'HIGH':'LOW';
 const state=proximity==='DISCONNECTED'?'DISCONNECTED':availability.state==='STATUS_UNKNOWN'?'UNKNOWN':proximity==='HIGH'?(availability.eligible?'NEAR_AVAILABLE':'NEAR_UNAVAILABLE'):(availability.eligible?'FAR_AVAILABLE':'FAR_UNAVAILABLE_OR_UNKNOWN');
 return {proximity,state};
}
// Directed reachable portions of real edges, not circles or inferred polygons.
export function networkReach(g,tree,minutes=[3,5,10]){
 if(!tree)return [];
 const best=new Map();for(const lab of tree.labels.values())best.set(lab.node,Math.min(best.get(lab.node)??Infinity,lab.seconds));
 const segments=[];
 const add=(a,b,start,seconds)=>{for(const min of minutes){const fraction=seconds>0?Math.max(0,Math.min(1,(min*60-start)/seconds)):0;if(fraction>0)segments.push({minutes:min,points:[a,[a[0]+fraction*(b[0]-a[0]),a[1]+fraction*(b[1]-a[1])]]});}};
 for(const e of g.edges)if(e.mode==='walk'){const start=best.get(e.u);if(Number.isFinite(start))add(g.nodes.get(e.u).p,g.nodes.get(e.v).p,start,slopeSeconds(e,tree.walkSpeed));}
 // Include the fractional origin edge even when neither endpoint is reached.
 for(const lab of tree.labels.values())if(!lab.prev&&lab.edge?.fromPoint)add(lab.edge.fromPoint,g.nodes.get(lab.edge.v).p,0,lab.seconds);
 return segments;
}
export function analyzeFacilities(g,a,b,stations,settings={},cache={}){
 const threshold=settings.walkThresholdMin??5,walkSpeed=settings.walkSpeed??4.8;
 if(!Number.isFinite(threshold)||threshold<=0||threshold>60||!Number.isFinite(walkSpeed)||walkSpeed<1||walkSpeed>8)throw new Error('INVALID_PROXIMITY_SETTINGS');
 if(!g.area.contains(a)||!g.area.contains(b))throw new Error('OUT_OF_STUDY_AREA');
 const key=JSON.stringify([a,b,walkSpeed,stations.map(s=>[s.id,s.p])]);
 if(cache.key!==key){
  const reverse=reverseWalkingGraph(g),opt={walkSpeed};let origin=null,destination=null,baseline=null;
  try{origin=search(g,a,'walk','time',opt);origin.walkSpeed=walkSpeed;}catch(e){if(e.message!=='SNAP_TOO_FAR')throw e;}
  try{destination=search(reverse,b,'walk','time',opt);destination.walkSpeed=walkSpeed;}catch(e){if(e.message!=='SNAP_TOO_FAR')throw e;}
  const ends=(tree,p)=>{try{const r=tree?.end(p);return r?{seconds:r.seconds,length:r.length,snap_distance_m:r.snapEnd.distance}:null;}catch(e){if(e.message!=='SNAP_TOO_FAR')throw e;return null;}};
  const walking=new Map(stations.map(s=>[s.id,{origin:ends(origin,s.p),destination:ends(destination,s.p)}]));
  try{const r=search(g,a,'walk','distance',opt).end(b);if(r){const points=coordinates(g,r);baseline={mode:'DIRECT_WALKING',distance_m:r.length,time_min:r.seconds/60,points,cost_usd:0,geojson:{type:'Feature',properties:{mode:'walk',baseline:true},geometry:{type:'LineString',coordinates:points.map(unproject)}}};}}catch(e){if(e.message!=='SNAP_TOO_FAR')throw e;}
  Object.assign(cache,{key,walking,baseline,reachability:{origin:networkReach(g,origin),destination:networkReach(reverse,destination)},searchBuilds:(cache.searchBuilds??0)+1});
 }
 const rows=which=>stations.map(s=>{
  const r=cache.walking.get(s.id)?.[which]??null,availability=facilityAvailability(s,which==='origin'?'pickup':'dropoff');
  return {station_id:s.id,name:s.name,role:which==='origin'?'pickup':'dropoff',point:s.p,walk_distance_m:r?.length??null,walk_time_min:r?r.seconds/60:null,snap_distance_m:r?.snap_distance_m??null,...classifyFacility(r?.seconds??null,availability,threshold),availability:availability.state,eligible:availability.eligible,reason:availability.reason,ebikes:s.ebikes,docks:s.docks,installed:s.installed,renting:s.renting,returning:s.returning,status_timestamp:Number.isFinite(s.recorded_timestamp)?s.recorded_timestamp:s.timestamp};
 }).sort((x,y)=>(x.walk_time_min??Infinity)-(y.walk_time_min??Infinity)||String(x.station_id).localeCompare(String(y.station_id)));
 const origin=rows('origin'),destination=rows('destination'),nearest=list=>list.find(r=>r.eligible&&r.walk_time_min!==null)??null;
 return {origin,destination,nearest:{departure:nearest(origin),arrival:nearest(destination)},baseline:cache.baseline?{...cache.baseline,estimated_energy_kcal:energy(cache.baseline.time_min,settings.mass??70,settings.walkMet??3.5).gross}:null,reachability:cache.reachability,data_quality:settings.dataQuality??'LIVE_SNAPSHOT',settings:{walk_threshold_min:threshold,walking_speed_kmh:walkSpeed,hard_walk_distance_m:settings.walkLimit??800,max_walk_access_min:settings.maxWalkAccessMin??null,max_station_candidates:settings.maxStationCandidates??10,routing_objective:settings.routingObjective??'distance'},search_builds:cache.searchBuilds,projection_note:'Network projections ≤50 m. Projected connectors are not verified or added to distance. Network may use a 300 m routing margin outside the study boundary.'};
}
export function tripMetrics(result,proximity){
 const j=result?.shortest;if(!j)return {route_status:proximity?.error??'NO_FEASIBLE_CITIBIKE_ROUTE',estimated_cost_usd:null,estimated_energy_kcal:null,data_quality:proximity?.data_quality};
 return {route_status:'FEASIBLE',departure_station_id:j.start?.id??null,arrival_station_id:j.end?.id??null,walk_to_pickup_m:j.legs[0]?.length??0,ride_m:j.rideLength,walk_from_dropoff_m:j.legs[2]?.length??0,total_distance_m:j.length,walk_access_time_min:((j.legs[0]?.seconds??0)+(j.legs[2]?.seconds??0))/60,ride_time_min:(j.legs[1]?.seconds??0)/60,total_time_min:j.totalSeconds/60,estimated_cost_usd:j.fare.total/100,estimated_energy_kcal:j.kcal,origin_station_proximity:proximity?.origin.find(s=>s.station_id===j.start?.id)?.proximity??null,destination_station_proximity:proximity?.destination.find(s=>s.station_id===j.end?.id)?.proximity??null,data_quality:proximity?.data_quality,status_timestamp:Number.isFinite(j.start?.recorded_timestamp??j.start?.timestamp)?new Date((j.start.recorded_timestamp??j.start.timestamp)*1000).toISOString():null};
}
