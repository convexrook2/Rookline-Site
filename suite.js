import {loadSchedule} from './planner/hosted-client.mjs';
import {nextStart,startLabel} from './planner/weather.mjs';
const ticker=document.querySelector('#rs-race-ticker'),rail=ticker?.querySelector('.rs-ticker-rail'),base=new URL('./',import.meta.url);
let snapshot=null,shown=null,paused=false,loading=false;
const make=(tag,text,cls)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e;};
function frameHeight(){const h=document.querySelector('#rooksuite-header')?.getBoundingClientRect().height??0;document.body.style.setProperty('--rs-frame-height',`${h+(ticker?.getBoundingClientRect().height??0)+(document.querySelector('.rs-product-status')?.getBoundingClientRect().height??0)}px`);}
const section=document.body.dataset.suitePage;
if(['rookforce','drive'].includes(section)&&/\/(?:index\.html)?$/.test(location.pathname)){
 const box=make('aside',null,'rs-product-status');box.setAttribute('aria-label','Product availability');
 const statuses={rookforce:['RELEASED / ASETEK FORTE','Full Forte wheelbase support. Other wheelbases have partial support.'],drive:['FREE / AVAILABLE NOW','Built for LMU. VR first: SteamVR, with OpenXR through SteamVR. Desktop HUD included.']};
 box.append(make('strong',statuses[section][0]),make('span',statuses[section][1]));ticker?.after(box);
}
function tick(){
 if(!snapshot||!rail)return;
 const races=snapshot.races.map(r=>({race:r,at:nextStart(r.starts)})).filter(x=>x.at).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)).slice(0,6);
 const signature=races.map(x=>x.race.id+'@'+x.at).join('|');
 if(signature!==shown){shown=signature;const group=make('div',null,'rs-ticker-group');
  for(const {race,at} of races){const a=make('a',null,'rs-race'),url=new URL('planner/',base);url.searchParams.set('race',race.id);a.href=url.href;a.append(make('strong',race.track),make('small',race.name));const time=make('time',startLabel(at));time.dateTime=at;a.append(time);group.append(a);}
  if(races.length){const duplicate=group.cloneNode(true);duplicate.setAttribute('aria-hidden','true');duplicate.querySelectorAll('a').forEach(a=>a.tabIndex=-1);rail.replaceChildren(group,duplicate);rail.classList.add('is-ready');}
  else{rail.replaceChildren(make('p','No dated starts are currently published. Open the Planner for details.','rs-ticker-message'));rail.classList.remove('is-ready');}
 }
 rail.querySelectorAll('time').forEach(e=>{const t=startLabel(e.dateTime);if(t&&e.textContent!==t)e.textContent=t;});
 ticker.title=snapshot.cached?'Showing the last loaded published schedule.':'Community-published schedule · checked every30seconds';
}
async function refresh(){if(loading||!ticker)return;loading=true;try{snapshot=await loadSchedule();tick();}catch{if(!snapshot){rail.replaceChildren(make('p','Race schedule temporarily unavailable. Open the Planner to retry.','rs-ticker-message'));rail.classList.remove('is-ready');}}finally{loading=false;}}
const pause=ticker?.querySelector('.rs-ticker-pause');pause?.addEventListener('click',()=>{paused=!paused;ticker.classList.toggle('is-paused',paused);pause.setAttribute('aria-pressed',String(paused));pause.setAttribute('aria-label',paused?'Resume race ticker':'Pause race ticker');pause.textContent=paused?'▶':'Ⅱ';});
frameHeight();window.addEventListener('resize',frameHeight);void refresh();setInterval(refresh,30000);setInterval(tick,1000);document.addEventListener('visibilitychange',()=>{if(!document.hidden){tick();void refresh();}});
