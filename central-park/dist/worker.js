import {buildGraph,makeArea,journey,coordinates,unproject} from './engine.js';
import {buildHorseGraph,horseJourney} from './horse.js';
let graph,horseGraph;
self.onmessage=({data})=>{try{
 if(data.type==='build'){
  const area=makeArea(data.geometry);graph=buildGraph(data.raw,area);horseGraph=buildHorseGraph(data.raw,area);
  postMessage({type:'built',stats:{nodes:graph.nodes.size,edges:graph.edges.length,omitted:graph.omitted,horseEdges:horseGraph.edges.length},roads:graph.roads,horseRoads:horseGraph.edges.filter(e=>!e.blocked).map(e=>[horseGraph.nodes.get(e.u).p,horseGraph.nodes.get(e.v).p])});
 }else if(data.type==='route'){
  const serialize=(j,g)=>j?{...j,legs:j.legs.map(l=>({...l,prev:undefined,edge:undefined,path:l.path.map(e=>({...e})),points:coordinates(g,l),geojson:{type:'Feature',properties:{mode:l.mode},geometry:{type:'LineString',coordinates:coordinates(g,l).map(unproject)}}}))}:null;
  let human={},horse=null,humanError=null,horseError=null;
  try{human=journey(graph,data.a,data.b,data.stations,data.settings);}catch(e){humanError=e.message;}
  try{horse=horseJourney(horseGraph,data.a,data.b,data.settings.horse);}catch(e){horseError=e.message;}
  postMessage({type:'route',id:data.id,result:{...human,shortest:serialize(human.shortest,graph),cheapest:serialize(human.cheapest,graph),horse:serialize(horse,horseGraph),humanError,horseError}});
 }
}catch(error){postMessage({type:'error',id:data.id,message:error.message});}};
