import {fetchSchedule,REFRESH_MS} from './source.mjs';
let last=null,inFlight=null,lastAttempt=-Infinity,failure=null;
// Public schedule only. Reuse it across product-page navigation to avoid redundant reads.
try{const saved=JSON.parse(sessionStorage.getItem('rookline-public-schedule-v1'));if(saved&&Array.isArray(saved.snapshot?.races)&&Number.isFinite(saved.attemptedAt)&&saved.attemptedAt<=Date.now()){last=saved.snapshot;lastAttempt=saved.attemptedAt;}}catch{}
export async function loadSchedule(){
 if(inFlight)return inFlight;
 if(Date.now()-lastAttempt<REFRESH_MS){if(last)return last;throw failure??new Error('Please try again shortly.');}
 lastAttempt=Date.now();
 inFlight=fetchSchedule().then(data=>{failure=null;last={...data,error:null,cached:false};try{sessionStorage.setItem('rookline-public-schedule-v1',JSON.stringify({snapshot:last,attemptedAt:lastAttempt}));}catch{}return last;}).catch(error=>{
  failure=error;
  if(!last)throw error;
  last={...last,cached:true,error:'The schedule source could not be refreshed.'};return last;
 }).finally(()=>{inFlight=null;});
 return inFlight;
}
