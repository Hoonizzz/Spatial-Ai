import {runExperiment,summarize,type BatchRow} from './experiment-core';
import { Navigation } from './world/navigation';
const seeds=Number(process.argv[2]??20),seconds=Number(process.argv[3]??60);
if(!Number.isInteger(seeds)||seeds<20||seeds>100||!Number.isFinite(seconds)||seconds<10||seconds>1800)throw new Error('Usage: npm run experiment -- [seeds 20..100] [seconds 10..1800]');
const rows:BatchRow[]=[],nav=new Navigation();for(let i=0;i<seeds;i++)for(let j=0;j<5;j++){rows.push(runExperiment(42+i,j,seconds,undefined,nav));process.stderr.write(`\r${rows.length}/${seeds*5}`);}console.log(JSON.stringify({rows,summary:summarize(rows)},null,2));
