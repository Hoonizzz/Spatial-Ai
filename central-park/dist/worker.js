import {buildGraph,makeArea,journey,evaluateJourneys,coordinates,unproject} from './engine.js';
import {horseJourney} from './horse.js';
import {analyzeFacilities,tripMetrics} from './proximity.js';
let graph,routeCache=null,facilityCache={},routeSearchBuilds=0;
self.onmessage=({data})=>{try{
 if(data.type==='build'){
  const study=makeArea(data.geometry);graph=buildGraph(data.raw,makeArea(data.geometry,1300));graph.area=study;
  routeCache=null;facilityCache={};routeSearchBuilds=0;
  postMessage({type:'built',stats:{nodes:graph.nodes.size,edges:graph.edges.length,omitted:graph.omitted},roads:graph.roads});
 }else if(data.type==='route'){
  const opt=data.settings;
  const serialize=(j,g)=>j?{...j,legs:j.legs.map(l=>({...l,prev:undefined,edge:undefined,path:l.path.map(e=>({...e})),points:coordinates(g,l),geojson:{type:'Feature',properties:{mode:l.mode},geometry:{type:'LineString',coordinates:coordinates(g,l).map(unproject)}}}))}:null;
  let human={},horse=null,humanError=null,horseError=null,proximity=null,cacheHit=false;
  try{proximity=analyzeFacilities(graph,data.a,data.b,data.stations,opt,facilityCache);}catch(e){proximity={error:e.message,origin:[],destination:[],nearest:{},baseline:null,reachability:{origin:[],destination:[]},data_quality:opt.dataQuality};}
  const now=Date.now()/1000;
  const key=JSON.stringify([data.a,data.b,data.stations.map(s=>[s.id,s.p,s.ebikes,s.docks,s.installed,s.renting,s.returning,s.status_present,s.status_error,Number.isFinite(s.timestamp)&&now-s.timestamp<=300&&s.timestamp-now<60]),opt.walkLimit,opt.walkSpeed,opt.maxWalkAccessMin,opt.maxStationCandidates,opt.routingObjective,opt.speed,opt.pause]);
  try{
   if(routeCache?.key===key&&routeCache.human._routeCandidates?.length){
    const old=routeCache.human,latest=new Map(data.stations.map(s=>[s.id,s])),candidates=old._routeCandidates.map(c=>({...c,S:{...c.S,s:latest.get(c.S.s.id)},T:{...c.T,s:latest.get(c.T.s.id)}}));human=evaluateJourneys(candidates,{...old.shortest.settings,...opt},{candidates:old.candidates,starts:old.starts,ends:old.ends,candidateSelection:old.candidateSelection,comparison:old.comparison,versions:old.versions});cacheHit=true;
   }else{routeSearchBuilds++;human=journey(graph,data.a,data.b,data.stations,opt);routeCache={key,human};}
  }catch(e){humanError=e.message;}
  try{horse=horseJourney(human.shortest,opt.horse);}catch(e){horseError=e.message;}
  const {_routeCandidates,...publicHuman}=human;
  const result={...publicHuman,shortest:serialize(human.shortest,graph),cheapest:serialize(human.cheapest,graph),horse:serialize(horse,graph),humanError,horseError,proximity,trip:{...tripMetrics(human,proximity),origin:{lon:unproject(data.a)[0],lat:unproject(data.a)[1]},destination:{lon:unproject(data.b)[0],lat:unproject(data.b)[1]}},diagnostics:{route_search_builds:routeSearchBuilds,proximity_search_builds:facilityCache.searchBuilds??0,route_cache_hit:cacheHit}};
  postMessage({type:'route',id:data.id,result});
 }
}catch(error){postMessage({type:'error',id:data.id,message:error.message});}};
