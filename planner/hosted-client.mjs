import {fetchSchedule,REFRESH_MS} from './source.mjs';
let last=null,inFlight=null,lastAttempt=-Infinity,failure=null;
export async function loadSchedule(){
 if(inFlight)return inFlight;
 if(Date.now()-lastAttempt<REFRESH_MS){if(last)return last;throw failure??new Error('Please try again shortly.');}
 lastAttempt=Date.now();
 inFlight=fetchSchedule().then(data=>{failure=null;last={...data,error:null,cached:false};return last;}).catch(error=>{
  failure=error;
  if(!last)throw error;
  last={...last,cached:true,error:'The schedule source could not be refreshed.'};return last;
 }).finally(()=>{inFlight=null;});
 return inFlight;
}
