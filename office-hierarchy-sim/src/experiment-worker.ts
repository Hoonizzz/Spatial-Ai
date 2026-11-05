import {runExperiment,summarize,type BatchRow} from './experiment-core';
import { Navigation } from './world/navigation';
self.onmessage=e=>{const {seed,seeds,seconds,base}=e.data,rows:BatchRow[]=[],nav=new Navigation();
  for(let i=0;i<seeds;i++)for(let scenario=0;scenario<5;scenario++){rows.push(runExperiment((seed+i)>>>0,scenario,seconds,base,nav));self.postMessage({type:'progress',done:rows.length,total:seeds*5});}
  self.postMessage({type:'done',rows,summary:summarize(rows)});
};
