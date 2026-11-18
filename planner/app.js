import { number, sky, wind, periods, timing, offset, outlookSummary, futureStarts, nextStart, startLabel } from './weather.mjs';
import { loadSchedule } from './hosted-client.mjs';
const $ = id => document.getElementById(id);
const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
// Presentation-only mappings. Preserve the exact schedule identities in source.mjs.
// Rating colours follow Portal; class colours follow LMU's existing Broadcast palette.
function ratingFamily(raw) {
  if(typeof raw!=='string')return '';
  for(const [family,pattern] of [['bronze',/^(?:Bronze|B\d+)$/i],['silver',/^(?:Silver|S\d+)$/i],['gold',/^(?:Gold|G\d+)$/i],['platinum',/^(?:Platinum|P\d+)$/i],['alien',/^(?:Alien|A\d+)$/i]])if(pattern.test(raw))return family;
  return '';
}
const CLASS_PRESENTATION = Object.freeze({
  Hypercar:['hypercar','Hypercar'], Hyper:['hypercar','Hypercar'],
  LMP2:['lmp2','LMP2'], LMP2_ELMS:['lmp2-elms','LMP2 (ELMS)'], 'LMP2 (ELMS)':['lmp2-elms','LMP2 (ELMS)'],
  LMP3:['lmp3','LMP3'], LMGT3:['lmgt3','LMGT3'], GT3:['lmgt3','LMGT3'], GTE:['gte','GTE']
});
function classBadges(classes) {
  const group=el('div',null,'class-badges');group.setAttribute('aria-label','Allowed car classes');
  for(const raw of classes){const presentation=CLASS_PRESENTATION[raw];const badge=el('span',presentation?.[1]??raw,'class-badge');if(presentation)badge.dataset.carClass=presentation[0];badge.dataset.classRaw=raw;group.append(badge);}
  if(!classes.length)group.append(el('span','Not published','quiet-label'));
  return group;
}
function ratingBadge(raw) {
  const badge=el('span',raw==null?'SR not published':`SR ${raw}`,'rating-badge');badge.dataset.rating=ratingFamily(raw);badge.setAttribute('aria-label',raw==null?'Safety rating not published':`Safety rating requirement: ${raw}`);return badge;
}
function eventTypeBadge(raw) {
  const badge=el('span',cap(raw),'event-type');if(['daily','weekly','championship','special'].includes(raw))badge.dataset.eventType=raw;return badge;
}
function applyTheme(theme) {
  document.documentElement.dataset.theme=theme;
  document.querySelectorAll('[data-theme-choice]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.themeChoice===theme)));
  document.querySelector('meta[name="theme-color"]').content=theme==='dark'?'#0b1420':'#101f32';
}
let savedTheme;try{savedTheme=localStorage.getItem('lmu-theme');}catch{}
applyTheme(['light','dark'].includes(savedTheme)?savedTheme:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
document.querySelectorAll('[data-theme-choice]').forEach(button=>button.addEventListener('click',()=>{const theme=button.dataset.themeChoice;applyTheme(theme);try{localStorage.setItem('lmu-theme',theme);}catch{}}));
let snapshot, selectedId, activeSession = 'practice', showAllStarts = false;
let zone = localStorage.getItem('lmu-timezone') || 'America/Toronto';
const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
if (!['America/Toronto','UTC'].includes(localZone)) $('timezone').add(new Option(localZone,localZone));
if (![...$('timezone').options].some(o => o.value === zone)) zone = 'America/Toronto';
$('timezone').value = zone;
const fmt = (t, opts) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, ...opts }).format(new Date(t));
const date = t => fmt(t, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
const time = t => fmt(t, { hour: 'numeric', minute: '2-digit' });
const cap = s => s ? s.charAt(0).toUpperCase()+s.slice(1) : '';
const duration = n => number(n) == null ? 'Length not published' : n >= 60 ? `${Math.floor(n/60)} hr${n%60 ? ` ${n%60} min` : ''}` : `${n} min`;
const nextStarts = race => futureStarts(race.starts);
const relative = t => startLabel(t);
function weatherImage(value, cls='weather-icon') {
  const s = sky(value);
  if (!s.asset) { const missing=el('span','—',`${cls} no-weather`); missing.setAttribute('aria-label',s.label); return missing; }
  const image = el('img',null,cls); image.src=s.asset; image.alt=s.label; image.width=96; image.height=96; return image;
}
function windText(row) {
  const w=wind(row?.wind_direction,row?.wind_speed);
  if(w.compass==null&&w.kph==null)return 'Not published';
  return `${w.compass ?? '—'} · ${w.kph == null ? 'Speed not published' : `${w.kph} km/h`}`;
}
const percent = v => { const n=number(v); return n != null && n>=0 && n<=100 ? `${n}%` : '—'; };
const temp = v => {const n=number(v);return n==null?'—':`${n}°`;};
function filteredRaces() {
  const q=$('search').value.trim().toLowerCase(), now=Date.now();
  return (snapshot?.races||[]).map(r=>({race:r,next:nextStart(r.starts,now)})).filter(({race:r,next})=>next&&($('type').value==='all'||r.type===$('type').value)&&($('tier').value==='all'||r.tier===$('tier').value)&&[r.name,r.track,r.layout,...r.classes].join(' ').toLowerCase().includes(q))
    .sort((a,b)=>Date.parse(a.next)-Date.parse(b.next)||a.race.name.localeCompare(b.race.name)).map(x=>x.race);
}
function renderLineup(items) {
  $('count').textContent=items.length;
  const list=document.createDocumentFragment();
  for (const race of items) {
    const next=nextStarts(race)[0], rows=periods(race.sessions.race);
    const b=el('button',null,`race-option${race.id===selectedId?' selected':''}`); b.type='button'; b.dataset.raceId=race.id;b.dataset.nextStart=next||''; b.dataset.rating=ratingFamily(race.sr);b.setAttribute('aria-pressed',String(race.id===selectedId));
    const top=el('div',null,'option-top'); top.append(eventTypeBadge(race.type),el('span',next?time(next):'Coming soon','option-start'));
    const middle=el('div',null,'option-middle'), identity=el('span',null,'option-identity'); identity.append(el('strong',race.track||'Circuit to be announced'),el('span',race.name));middle.append(identity,weatherImage(rows[0]?.sky,'option-weather'));
    const bottom=el('div',null,'option-bottom'); bottom.append(el('span',duration(race.duration)),ratingBadge(race.sr),el('span',next?relative(next):'Starts not published','option-relative'));
    b.append(top,middle,classBadges(race.classes),bottom); b.addEventListener('click',()=>{selectedId=race.id;activeSession='practice';showAllStarts=false;render();});list.append(b);
  }
  if(!items.length) list.append(el('p','No upcoming starts match. Try another circuit or clear your filters.','empty'));
  $('race-list').replaceChildren(list);
}
function renderOutlook(race) {
  if(!race){$('outlook').replaceChildren(el('div','No future starts are available for these filters. New published starts will appear automatically.','empty-stage'));return;}
  const next=nextStarts(race)[0], session=race.sessions[activeSession]||{}, rows=periods(session), first=rows[0], weather=sky(first?.sky), fragment=document.createDocumentFragment();
  const hero=el('article',null,'forecast-hero');hero.dataset.rating=ratingFamily(race.sr);
  const info=el('div',null,'hero-info');
  const tags=el('div',null,'hero-tags');tags.append(eventTypeBadge(race.type),ratingBadge(race.sr));if(race.tier&&race.tier!==race.type)tags.append(el('span',cap(race.tier)));info.append(tags,el('p',race.name,'series-name'),el('h2',race.track||'Circuit to be announced','circuit-name'));
  if(race.layout&&race.layout.toLowerCase()!==race.track?.toLowerCase()) info.append(el('p',race.layout.replaceAll('-',' '),'layout-name'));
  const start=el('div',null,'hero-start'); start.append(el('span',next?'NEXT RACE START':'SCHEDULE TO FOLLOW','micro-label'),el('strong',next?time(next):'Coming soon'),el('span',next?date(next):'Dated starts have not been published.','start-date')); if(next)start.append(el('span',relative(next),'start-relative'));info.append(start);
  const current=el('div',null,'hero-weather');current.append(el('span',`${cap(activeSession)} opening outlook`,'micro-label'),weatherImage(first?.sky,'hero-icon'));
  const temperature=el('div',null,'hero-temperature');temperature.append(el('strong',temp(first?.temperature)));if(number(first?.temperature)!=null)temperature.append(el('span','C'));current.append(temperature,el('p',weather.label,'hero-condition'),el('p',`Wind ${windText(first)}`,'hero-wind'));
  hero.append(info,current);fragment.append(hero);
  const strip=el('div',null,'event-strip');strip.dataset.rating=ratingFamily(race.sr);
  for(const [label,content] of [['Race length',el('strong',duration(race.duration))],['Car classes',classBadges(race.classes)],['Setup',el('strong',race.setup?cap(race.setup):'Not published')],['Safety rating',ratingBadge(race.sr)]]){const f=el('div');f.append(el('span',label),content);strip.append(f);}fragment.append(strip);
  if(race.scheduleNote||(race.scheduleStatus&&race.scheduleStatus!=='active'))fragment.append(el('p',race.scheduleNote||race.scheduleStatus,'warning'));
  const weatherPanel=el('section',null,'weather-panel');weatherPanel.setAttribute('aria-label','Session weather outlook');
  const panelHead=el('div',null,'panel-heading');const titles=el('div');titles.append(el('p','THE CONDITIONS AHEAD','eyebrow'),el('h3','Your session forecast'));
  const tabs=el('div',null,'session-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Forecast session');
  const keys=['practice','qualifying','race'];
  for(const key of keys){const tab=el('button',null,key===activeSession?'active':'');tab.type='button';tab.id=`tab-${key}`;tab.setAttribute('role','tab');tab.setAttribute('aria-selected',String(key===activeSession));tab.setAttribute('aria-controls','session-forecast');tab.tabIndex=key===activeSession?0:-1;tab.append(el('span',cap(key)),el('small',number(race.sessions[key]?.duration)!=null?duration(race.sessions[key].duration):'—'));tab.addEventListener('click',()=>{activeSession=key;renderOutlook(race);$(`tab-${key}`).focus();});tab.addEventListener('keydown',e=>{if(['ArrowRight','ArrowLeft','Home','End'].includes(e.key)){e.preventDefault();const index=e.key==='Home'?0:e.key==='End'?2:(keys.indexOf(key)+(e.key==='ArrowRight'?1:2))%3;activeSession=keys[index];renderOutlook(race);$(`tab-${activeSession}`).focus();}});tabs.append(tab);}
  panelHead.append(titles,tabs);weatherPanel.append(panelHead);
  const panel=el('div');panel.id='session-forecast';panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',`tab-${activeSession}`);
  if(!rows.length){panel.append(el('div','The weather for this session hasn’t been published yet. Check back when the event details are updated.','weather-unavailable'));}
  else {
    panel.append(el('p',outlookSummary(rows),'forecast-story'));
    const grid=el('div',null,'forecast-grid');
    rows.forEach((row,i)=>{const col=el('article',null,'forecast-period');const condition=sky(row.sky);col.setAttribute('aria-label',`${offset(timing(session.duration,i))}: ${condition.label}`);col.append(weatherImage(row.sky),el('p',offset(timing(session.duration,i)),'period-time'),el('strong',temp(row.temperature),'period-temperature'),el('p',condition.label,'period-condition'));
      const rain=el('p',null,'period-rain');rain.append(el('span','◒','rain-drop'),el('strong',percent(row.rain_change)),el('span',' rain chance'));col.append(rain);
      const w=wind(row.wind_direction,row.wind_speed), windLine=el('p',windText(row),'period-wind');windLine.title=w.direction?`${w.direction}; configured wind`:'Wind direction not published';col.append(windLine,el('p',`Humidity ${percent(row.humidity)}`,'period-humidity'));grid.append(col);});panel.append(grid);
    const note=el('div',null,'forecast-note');note.append(el('span','◷','note-icon'),el('p','Planning points use five equal parts of the published session length. Times are measured from the session start.'));panel.append(note);
    const config=session.config;
    if(config?.time_of_day){const sessionFacts=el('p',`In-game start ${config.time_of_day}${config.real_road==='natural'?' · Natural track evolution':''}`,'session-facts');panel.append(sessionFacts);}
  }
  weatherPanel.append(panel);fragment.append(weatherPanel);
  const starts=nextStarts(race), startPanel=el('section',null,'starts-panel');const startHead=el('div',null,'starts-heading');startHead.append(el('h3','Find your next start'),el('span','Shown in your selected timezone'));startPanel.append(startHead);
  if(starts.length){const grid=el('div',null,'start-grid');starts.slice(0,showAllStarts?160:6).forEach((t,i)=>{const item=el('div',null,i===0?'start-time nearest':'start-time');item.append(el('span',fmt(t,{weekday:'short',month:'short',day:'numeric'})),el('strong',time(t)));grid.append(item);});startPanel.append(grid);if(starts.length>6){const b=el('button',showAllStarts?'Show fewer starts':`View all ${starts.length} published starts`,'more-starts');b.type='button';b.setAttribute('aria-expanded',String(showAllStarts));b.addEventListener('click',()=>{showAllStarts=!showAllStarts;renderOutlook(race);$('outlook').querySelector('.more-starts')?.focus();});startPanel.append(b);if(showAllStarts&&starts.length>160)startPanel.append(el('p',`Showing the next 160 of ${starts.length} starts. More are available from LMU Portal.`,'quiet'));}}
  else startPanel.append(el('p','Dated starts will appear here when they are published.','quiet'));
  fragment.append(startPanel);
  const age=race.sourceUpdatedAt?Date.now()-Date.parse(race.sourceUpdatedAt):Infinity;
  fragment.append(el('p',`Published by LMU Portal${race.sourceUpdatedAt?` · Source updated ${date(race.sourceUpdatedAt)}`:''}${age>86400000?' · Source details may be out of date.':''}`,'provenance'));
  $('outlook').replaceChildren(fragment);
}
function render(){const focused=document.activeElement,focusId=focused?.id,focusRace=focused?.dataset?.raceId,listTop=$('race-list').scrollTop,listLeft=$('race-list').scrollLeft;const items=filteredRaces();if(!items.some(r=>r.id===selectedId)){selectedId=items[0]?.id;activeSession='practice';showAllStarts=false;}renderLineup(items);renderOutlook(items.find(r=>r.id===selectedId));$('race-list').scrollTop=listTop;$('race-list').scrollLeft=listLeft;if(focusId&&$(focusId)&&$(focusId)!==focused)$(focusId).focus({preventScroll:true});else if(focusRace){const buttons=[...$('race-list').querySelectorAll('button')];(buttons.find(b=>b.dataset.raceId===focusRace)||buttons.find(b=>b.dataset.raceId===selectedId))?.focus({preventScroll:true});}}
async function load(manual=false){
  $('refresh').disabled=true;$('refresh').setAttribute('aria-busy','true');
  try{
    const data=await loadSchedule();
    if(!Array.isArray(data.races))throw new Error('The schedule is unavailable. Please try again shortly.');
    const changed=snapshot?.fetchedAt!==data.fetchedAt;snapshot=data;
    $('status').textContent=`${data.cached?'Saved schedule from':'Checked'} ${fmt(data.fetchedAt,{hour:'numeric',minute:'2-digit',second:'2-digit'})} · updates every 30 sec`;
    $('warning').hidden=!data.error;$('warning').textContent=data.error?`${data.error} Showing the last saved schedule.`:'';
    $('notices').replaceChildren(...(data.notices||[]).filter(n=>!n.includes('Sky, wind-direction')).map(n=>el('li',n)));
    if(changed||manual)render();
  }catch(error){$('warning').hidden=false;$('warning').textContent=error.message;$('status').textContent=snapshot?'Using the last loaded schedule':'Schedule unavailable';if(!snapshot){$('race-list').replaceChildren(el('p','Couldn’t load the schedule. Use Refresh schedule to try again.','empty'));$('outlook').replaceChildren(el('div','Your outlook will appear when the schedule is available.','empty-stage'));}}
  finally{$('refresh').disabled=false;$('refresh').removeAttribute('aria-busy');}
}
let clockMinute;
function tick(force=false){const now=Date.now(),minute=Math.floor(now/60000);if(!force&&minute===clockMinute)return;clockMinute=minute;$('clock').textContent=fmt(now,{hour:'numeric',minute:'2-digit'});$('edition-date').textContent=fmt(now,{weekday:'long',month:'long',day:'numeric'});}
function refreshTime(){
  tick();if(!snapshot)return;
  const now=Date.now(),races=new Map(snapshot.races.map(r=>[r.id,r]));
  for(const card of $('race-list').querySelectorAll('.race-option')){
    const race=races.get(card.dataset.raceId),next=nextStart(race?.starts,now);
    // Rebuild only when a start expires/advances, not on every clock tick.
    if(next!==card.dataset.nextStart){render();return;}
    const label=startLabel(next,now),badge=card.querySelector('.option-relative');
    if(badge.textContent!==label)badge.textContent=label;
  }
  const selected=races.get(selectedId),next=nextStart(selected?.starts,now),badge=$('outlook').querySelector('.start-relative');
  if(badge&&next){const label=startLabel(next,now);if(badge.textContent!==label)badge.textContent=label;}
}
for(const id of ['search','type','tier'])$(id).addEventListener('input',render);
$('timezone').addEventListener('change',()=>{zone=$('timezone').value;localStorage.setItem('lmu-timezone',zone);tick(true);if(snapshot)render();});
$('refresh').addEventListener('click',()=>void load(true));
tick();void load();setInterval(refreshTime,1000);setInterval(()=>void load(),30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshTime();});
window.addEventListener('focus',refreshTime);
window.addEventListener('pageshow',refreshTime);
