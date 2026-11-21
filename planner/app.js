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
let snapshot, selectedId = new URLSearchParams(location.search).get('race') || undefined, activeSession = 'practice', showAllStarts = false;
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
const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
let zone = localZone;
try {
  const savedZone = localStorage.getItem('lmu-timezone');
  if (savedZone) {
    new Intl.DateTimeFormat('en',{timeZone:savedZone});
    zone = savedZone;
  }
} catch {}

const timezoneSelect = $('timezone');
for (const choice of new Set([localZone,zone])) {
  if (![...timezoneSelect.options].some(option=>option.value===choice)) {
    const label = choice.split('/').at(-1).replaceAll('_',' ');
    timezoneSelect.add(new Option(label,choice));
  }
}
timezoneSelect.value = zone;

function className(raw) {
  return CLASS_PRESENTATION[raw]?.[1] ?? raw;
}

function entryRatingFamily(raw) {
  const grade = typeof raw === 'string' && /^(Bronze|Silver|Gold|Platinum|Alien) \d+ SR$/i.exec(raw);
  return ratingFamily(grade ? grade[1] : raw);
}

function entryRating(raw) {
  const badge = ratingBadge(raw);
  badge.dataset.rating = entryRatingFamily(raw);
  if (typeof raw === 'string' && /\bSR\b/i.test(raw)) badge.textContent = raw;
  return badge;
}

let followNextRace = !selectedId;
let showForecastTimings = true;
document.querySelector('.filter-jump').href = location.pathname + location.search + '#race-filters';

function filteredRaces() {
  const query = $('search').value.trim().toLowerCase();
  const type = $('type').value, tier = $('tier').value, car = $('car-class').value;
  const now = Date.now();
  return (snapshot?.races || [])
    .map(race => ({ race, start: nextStart(race.starts, now) }))
    .filter(({race, start}) => start && (type === 'all' || race.type === type)
      && (tier === 'all' || race.tier === tier) && (!car || race.classes.some(raw => className(raw) === car))
      && [race.track, race.name, race.layout, ...race.classes, ...race.classes.map(className)].join(' ').toLowerCase().includes(query))
    .sort((a,b) => Date.parse(a.start) - Date.parse(b.start) || a.race.name.localeCompare(b.race.name))
    .map(entry => entry.race);
}

function chooseRace(id) {
  followNextRace = false;
  selectedId = id;
  activeSession = 'practice';
  showAllStarts = false;
  render();
}
$('mobile-race').addEventListener('change', e => chooseRace(e.target.value));
$('car-class').addEventListener('input', render);

function syncClasses() {
  const select = $('car-class'), selected = select.value;
  const names = new Set((snapshot?.races ?? []).flatMap(r => r.classes.map(className)));
  if (selected) names.add(selected);
  const list = [...names].sort((a,b) => a.localeCompare(b));
  if (list.length === select.options.length - 1 && list.every((name,i) => name === select.options[i+1].value)) return;
  select.replaceChildren(new Option('All classes',''), ...list.map(name => new Option(name,name)));
  select.value = selected;
}

function renderLineup(items) {
  syncClasses();
  $('count').textContent = items.length;
  const cards = document.createDocumentFragment(), options = document.createDocumentFragment();
  for (const race of items) {
    const next = nextStart(race.starts), circuit = race.track || 'Circuit to be announced';
    const day = fmt(next,{month:'short',day:'numeric'});
    const option = new Option(`${day} · ${time(next)} · ${circuit} · ${race.name}`,race.id);
    option.selected = race.id === selectedId;
    options.append(option);
    const card = el('button',null,'race-option');
    card.type = 'button';
    card.dataset.raceId = race.id;
    card.dataset.rating = entryRatingFamily(race.sr);
    card.dataset.nextStart = next || '';
    card.setAttribute('aria-pressed',String(option.selected));
    const meta = el('span',null,'entry-meta');
    meta.append(eventTypeBadge(race.type),entryRating(race.sr));
    const identity = el('span',null,'entry-identity');
    identity.append(el('strong',circuit),el('span',race.name));
    const clock = el('span',null,'entry-clock');
    clock.append(el('strong',time(next)),el('span',relative(next),'option-relative'));
    const entry = el('span',null,'entry-bottom');
    entry.append(classBadges(race.classes),el('span',duration(race.duration),'entry-duration'));
    card.append(meta,identity,clock,entry);
    card.addEventListener('click',()=>chooseRace(race.id));
    cards.append(card);
  }
  if (!items.length) {
    cards.append(el('p','No events match these filters.','empty'));
    options.append(new Option('No matching events',''));
  }
  $('race-list').replaceChildren(cards);
  $('mobile-race').replaceChildren(options);
  $('mobile-race').disabled = !items.length;
}

function fact(label, value) {
  const field = el('div',null,'fact');
  field.append(el('dt',label),el('dd'));
  field.lastElementChild.append(value);
  return field;
}

function raceBrief(race, next, firstRaceId) {
  const header = el('header',null,'brief-heading');
  const identity = el('div',null,'brief-identity'), tags = el('div',null,'brief-tags');
  tags.append(eventTypeBadge(race.type));
  if (race.tier && race.tier !== race.type) tags.append(el('span',cap(race.tier)));
  const isNext = race.id === firstRaceId;
  const designation = el('div',null,'brief-designation');
  designation.append(el('span',isNext ? 'Next race' : 'Selected race'));
  if (!isNext) {
    const button = el('button','Show next race','show-next-race');
    button.type = 'button';
    button.id = 'show-next-race';
    button.addEventListener('click',()=>{
      followNextRace = true;
      render();
      $('race-lead').querySelector('h2')?.focus();
    });
    designation.append(button);
  }
  const circuit = el('h2',race.track || 'Circuit to be announced','circuit-name');
  circuit.tabIndex = -1;
  identity.append(designation,circuit,el('p',race.name,'series-name'),tags);
  if (race.layout && race.layout.toLowerCase() !== race.track?.toLowerCase()) identity.append(el('p',race.layout.replaceAll('-',' '),'layout-name'));
  const clock = el('div',null,'brief-clock');
  const countdown = el('time',relative(next),'start-relative');
  countdown.dateTime = next;
  clock.append(el('span','Race starts'),countdown,el('strong',time(next)),
    el('span',fmt(next,{weekday:'short',month:'short',day:'numeric',timeZoneName:'short'}),'brief-date'));
  header.append(identity,clock);
  const facts = el('dl',null,'entry-facts');
  facts.append(fact('Allowed classes',classBadges(race.classes)),fact('Safety rating',entryRating(race.sr)),
    fact('Race length',duration(race.duration)),fact('Setup',race.setup ? cap(race.setup) : 'Not published'));
  const brief = el('article',null,'race-brief');
  brief.dataset.rating = entryRatingFamily(race.sr);
  brief.append(header,facts,weatherOverview('Race start forecast',periods(race.sessions.race)[0]));
  return brief;
}

function weatherOverview(title,row) {
  const summary = el('div',null,'weather-overview');
  summary.append(el('span',title,'weather-overview-label'));
  if (!row) {
    summary.append(el('span','Forecast unavailable','weather-overview-empty'));
    return summary;
  }
  const conditions = el('div',null,'weather-overview-conditions'), icon = weatherImage(row.sky);
  icon.setAttribute('aria-hidden','true');
  const readings = [number(row.temperature) == null ? null : `${row.temperature} °C`, sky(row.sky).label];
  const rain = percentValue(row.rain_change);
  if (rain !== null) readings.push(`${rain} rain chance`);
  const winds = publishedWind(row);
  if (winds) readings.push(`Wind ${winds}`);
  conditions.append(icon,el('span',readings.filter(Boolean).join(' · ')));
  summary.append(conditions);
  return summary;
}

function forecastTime(minutes) {
  if (minutes == null || minutes === 0 || Number.isInteger(minutes)) return offset(minutes);
  const seconds = Math.round(minutes * 60);
  const mins = Math.floor(seconds / 60), rest = seconds % 60;
  return mins ? `+${mins}m ${rest}s` : `+${rest}s`;
}

function sessionTabs(race) {
  const tabs = el('div',null,'session-tabs'), keys = ['practice','qualifying','race'];
  tabs.setAttribute('role','tablist'); tabs.setAttribute('aria-label','Forecast session');
  function select(key) {
    activeSession = key;
    renderOutlook(race);
    $(`tab-${key}`).focus();
  }
  keys.forEach((key,i) => {
    const tab = el('button',null);
    tab.type = 'button'; tab.id = `tab-${key}`; tab.tabIndex = key === activeSession ? 0 : -1;
    tab.setAttribute('role','tab'); tab.setAttribute('aria-selected',String(key === activeSession)); tab.setAttribute('aria-controls','session-forecast');
    tab.append(el('strong',cap(key)),el('small',number(race.sessions[key]?.duration) == null ? '—' : duration(race.sessions[key].duration)));
    tab.addEventListener('click',()=>select(key));
    tab.addEventListener('keydown',event=>{
      const dest = {Home:0,End:2,ArrowRight:(i+1)%3,ArrowLeft:(i+2)%3}[event.key];
      if (dest === undefined) return;
      event.preventDefault(); select(keys[dest]);
    });
    tabs.append(tab);
  });
  return tabs;
}

function publishedWind(row) {
  const value = wind(row.wind_direction,row.wind_speed);
  if (value.kph == null && !value.compass) return null;
  return [value.kph == null ? 'Speed unpublished' : `${value.kph} km/h`,value.compass ?? 'direction unpublished'].join(' ');
}
function percentValue(raw) {
  const value = percent(raw);
  return value === '—' ? null : value;
}
// Summarize only a complete five-point forecast with identical published readings.
function throughout(values) {
  return values.length === 5 && values[0] != null && values.every(value => value === values[0]);
}

function forecast(race) {
  const session = race.sessions[activeSession] ?? {}, rows = periods(session);
  const area = el('section',null,'weather-panel'), heading = el('div',null,'forecast-heading');
  heading.append(el('h3','Session forecast'),sessionTabs(race));
  const panel = el('div',null); panel.id = 'session-forecast';
  panel.setAttribute('role','tabpanel'); panel.setAttribute('aria-labelledby',`tab-${activeSession}`);
  area.append(heading,panel);
  if (!rows.length) {
    panel.append(el('p','No forecast published for this session.','weather-unavailable'));
    return area;
  }
  const metrics = [
    {label:'Rain chance',values:rows.map(r => percentValue(r.rain_change))},
    {label:'Wind',values:rows.map(publishedWind)},
    {label:'Humidity',values:rows.map(r => percentValue(r.humidity))}
  ];
  const steady = metrics.filter(m=>throughout(m.values) &&
    (m.label !== 'Wind' || rows.every(row => {
      const value = wind(row.wind_direction,row.wind_speed);
      return value.compass != null && value.kph != null;
    })));
  const varying = metrics.filter(m=>!steady.includes(m));
  const uniform = steady.length === metrics.length && throughout(rows.map(r=>number(r.temperature))) &&
    throughout(rows.map(r=>sky(r.sky).asset));
  panel.append(weatherOverview(uniform ? 'Same forecast at all five points' : 'At the start',rows[0]));
  const details = el('details',null,'forecast-timings');
  const disclosure = el('summary','Forecast timings');
  disclosure.id = 'forecast-timings';
  details.open = showForecastTimings;
  details.append(disclosure);
  const phases = el('div',null,'forecast-grid');
  for (const [i,row] of rows.entries()) {
    const phase = el('article',null,'forecast-period');
    const label = sky(row.sky).label;
    const at = forecastTime(timing(session.duration,i));
    phase.setAttribute('aria-label',`${at} · ${label}`);
    phase.append(el('span',at,'phase-time'),weatherImage(row.sky),el('strong',number(row.temperature)==null ? '—' : `${row.temperature} °C`,'phase-temp'),el('span',label,'phase-sky'));
    if (varying.length) {
      const detail = el('dl',null,'phase-detail');
      for (const m of varying) detail.append(fact(m.label,m.values[i] ?? 'Unpublished'));
      phase.append(detail);
    }
    phases.append(phase);
  }
  details.append(phases);
  if (steady.length) {
    const summary = el('div',null,'constant-weather');
    const facts = el('dl');
    for (const m of steady) facts.append(fact(m.label,m.values[0]));
    summary.append(el('span','All five forecast points'),facts);
    details.append(summary);
  }
  const notes = [];
  if (session.config?.time_of_day) notes.push(`In-game start ${session.config.time_of_day}`);
  if (session.config?.real_road === 'natural') notes.push('Natural track evolution');
  notes.push('Forecast times are relative to session start.');
  details.append(el('p',notes.join(' · '),'session-facts'));
  panel.append(details);
  return area;
}

function renderLead(race, firstRaceId) {
  const lead = $('race-lead');
  const next = nextStart(race?.starts);
  if (!race || !next) {
    const text = !snapshot ? 'Schedule unavailable' : 'No upcoming race matches these filters.';
    lead.replaceChildren(el('p',text,'empty-stage'));
    return;
  }
  lead.replaceChildren(raceBrief(race,next,firstRaceId));
}

function renderOutlook(race) {
  const previousTimings = $('forecast-timings')?.parentElement;
  if (previousTimings) showForecastTimings = previousTimings.open;
  if (!race) {
    $('outlook').replaceChildren(el('p','No upcoming event matches. Change a filter or clear your search.','empty-stage'));
    return;
  }
  const starts = nextStarts(race);
  if (!starts.length) { $('outlook').replaceChildren(el('p','No upcoming start.','empty-stage')); return; }
  const content = document.createDocumentFragment();
  if (race.scheduleNote || (race.scheduleStatus && race.scheduleStatus !== 'active')) content.append(el('p',race.scheduleNote || race.scheduleStatus,'warning'));
  content.append(forecast(race));
  const section = el('section',null,'starts-panel');
  section.append(el('h3','Upcoming starts'));
  const grid = el('div',null,'start-grid');
  for (const start of starts.slice(0,showAllStarts?160:6)) {
    const item = el('div',null,'start-time');
    item.append(el('span',fmt(start,{weekday:'short',month:'short',day:'numeric'})),el('strong',time(start)));
    grid.append(item);
  }
  section.append(grid);
  if (starts.length>6) {
    const button = el('button',showAllStarts?'Show fewer starts':`Show more starts (${starts.length} published)`,'more-starts');
    button.type = 'button'; button.setAttribute('aria-expanded',String(showAllStarts));
    button.addEventListener('click',()=>{showAllStarts=!showAllStarts;renderOutlook(race);$('outlook').querySelector('.more-starts')?.focus();});
    section.append(button);
    if (showAllStarts && starts.length>160) section.append(el('p','Showing the next 160 published starts.','provenance'));
  }
  content.append(section);
  const updated = race.sourceUpdatedAt ? ` · Source updated ${date(race.sourceUpdatedAt)}` : '';
  const old = !race.sourceUpdatedAt || Date.now()-Date.parse(race.sourceUpdatedAt)>86400000;
  content.append(el('p',`LMU Portal${updated}${old?' · Source details may be out of date.':''}`,'provenance'));
  $('outlook').replaceChildren(content);
}

function render() {
  const focused = document.activeElement, focusId = focused?.id, focusRace = focused?.dataset?.raceId;
  const list = $('race-list'), {scrollTop,scrollLeft} = list;
  const items = filteredRaces();
  const first = items[0];
  const previous = selectedId;
  if (!items.some(race=>race.id===selectedId)) followNextRace = true;
  if (followNextRace) selectedId = first?.id;
  if (previous !== selectedId) {
    activeSession = 'practice';
    showAllStarts = false;
  }
  const selected = items.find(race=>race.id===selectedId);
  renderLead(selected,first?.id);
  renderLineup(items);
  renderOutlook(selected);
  list.scrollTop = scrollTop;
  list.scrollLeft = scrollLeft;
  if (focusId && $(focusId) && $(focusId)!==focused) $(focusId).focus({preventScroll:true});
  else if (focusRace) {
    const cards = [...list.querySelectorAll('button')];
    (cards.find(card=>card.dataset.raceId===focusRace) || cards.find(card=>card.dataset.raceId===selectedId))?.focus({preventScroll:true});
  }
}


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
  }catch(error){$('warning').hidden=false;$('warning').textContent=error.message;$('status').textContent=snapshot?'Using the last loaded schedule':'Schedule unavailable';if(!snapshot){renderLead();$('race-list').replaceChildren(el('p','Couldn’t load the schedule. Use Refresh schedule to try again.','empty'));$('outlook').replaceChildren(el('div','Your outlook will appear when the schedule is available.','empty-stage'));}}
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
  const selected=races.get(selectedId),next=nextStart(selected?.starts,now),badge=$('race-lead').querySelector('.start-relative');
  if(badge&&next){const label=startLabel(next,now);if(badge.textContent!==label)badge.textContent=label;}
}
for(const id of ['search','type','tier'])$(id).addEventListener('input',render);
$('timezone').addEventListener('change',()=>{zone=$('timezone').value;localStorage.setItem('lmu-timezone',zone);tick(true);if(snapshot)render();});
$('refresh').addEventListener('click',()=>void load(true));
tick();void load();setInterval(refreshTime,1000);setInterval(()=>void load(),30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshTime();});
window.addEventListener('focus',refreshTime);
window.addEventListener('pageshow',refreshTime);
