// Display mapping copied from Drive's reviewed LMU sky catalog and icon symbols.
// Source values are retained untouched by source.mjs. Missing is not a zero preset.
export const SKY = Object.freeze([
  ['Clear', 'clear-day'], ['Light Clouds', 'mostly-clear-day'],
  ['Partially Cloudy', 'partly-cloudy-day'], ['Mostly Cloudy', 'cloudy'],
  ['Overcast', 'overcast'], ['Cloudy & Drizzle', 'drizzle'],
  ['Cloudy & Light Rain', 'rain'], ['Overcast & Light Rain', 'overcast-drizzle'],
  ['Overcast & Rain', 'overcast-rain'], ['Overcast & Heavy Rain', 'extreme-rain'],
  ['Overcast & Storm', 'thunderstorms-overcast-rain']
]);
export const COMPASS = Object.freeze(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']);
const DIRECTIONS = ['North', 'North East', 'East', 'South East', 'South', 'South West', 'West', 'North West'];
export function number(value) {
  if (value == null || typeof value === 'boolean' || (typeof value === 'string' && !value.trim())) return null;
  if (!['number', 'string'].includes(typeof value)) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
export function sky(value) {
  const code = number(value);
  return Number.isInteger(code) && SKY[code] ? { label: SKY[code][0], asset: `./assets/weather/${SKY[code][1]}.svg` } : { label: 'Weather not published', asset: null };
}
export function wind(direction, speed) {
  const code = number(direction), raw = number(speed);
  const known = Number.isInteger(code) && code >= 0 && code < COMPASS.length;
  return { compass: known ? COMPASS[code] : null, direction: known ? DIRECTIONS[code] : null,
    // This source is LMU Portal: its public Xp() display formatter labels the
    // stored value directly as km/h. Do not transfer REST's m/s conversion.
    kph: raw != null && raw >= 0 ? Math.round(raw * 10) / 10 : null };
}
export function periods(session) {
  const config = session?.config;
  return Array.isArray(config) ? config : Array.isArray(config?.weather) ? config.weather : [];
}
export function timing(durationMinutes, index) {
  const d = number(durationMinutes);
  return d != null && d > 0 && Number.isInteger(index) && index >= 0 && index < 5 ? d * index / 5 : null;
}
export function offset(minutes) {
  if (minutes == null) return 'Time not published';
  if (minutes === 0) return 'At the start';
  if (minutes >= 60 && Number.isInteger(minutes)) return `+${Math.floor(minutes/60)} hr${minutes%60 ? ` ${minutes%60} min` : ''}`;
  return `+${Number(minutes.toFixed(1))} min`;
}
// Wall-clock race starts are separate from the relative forecast planning points.
// A published start stops being upcoming at its exact timestamp, even in old cache.
export function futureStarts(starts, now = Date.now()) {
  return (Array.isArray(starts) ? starts : []).filter(t => typeof t === 'string' && Date.parse(t) > now)
    .sort((a,b) => Date.parse(a)-Date.parse(b));
}
export function nextStart(starts, now = Date.now()) {
  let next = null, closest = Infinity;
  for(const t of Array.isArray(starts) ? starts : []) {
    const at = typeof t === 'string' ? Date.parse(t) : NaN;
    if(at > now && at < closest){next=t;closest=at;}
  }
  return next;
}
export function startLabel(t, now = Date.now()) {
  const at = typeof t === 'string' ? Date.parse(t) : NaN;
  if(!Number.isFinite(at) || at <= now)return null;
  if(at-now < 30*60000){
    const seconds=Math.ceil((at-now)/1000);
    return `in ${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
  }
  const m = Math.ceil((at-now)/60000);
  return m < 60 ? `in ${m} min` : m < 1440 ? `in ${Math.floor(m/60)} hr${m%60 ? ` ${m%60} min` : ''}` : `in ${Math.floor(m/1440)} ${Math.floor(m/1440)===1?'day':'days'}`;
}
export function outlookSummary(rows) {
  if (!rows.length) return 'The weather outlook has not been published yet.';
  const chances = rows.map(r => number(r.rain_change)).filter(n => n != null && n >= 0 && n <= 100);
  const start = sky(rows[0].sky), end = sky(rows.at(-1).sky);
  const temps = rows.map(r => number(r.temperature)).filter(n => n != null);
  if (chances.some(n => n > 0)) {
    const first = chances[0], last = chances.at(-1);
    return last > first ? 'Rain chances rise as the session unfolds.' : last < first ? 'Rain chances ease through the session.' : 'Keep an eye on the rain chance throughout.';
  }
  if (chances.length === rows.length && chances.every(n => n === 0)) {
    if (temps.length > 1 && temps.at(-1) < temps[0]) return 'No rain forecast, with temperatures easing later.';
    if (start.label !== end.label && end.asset) return `No rain forecast. ${end.label} later on.`;
    return 'No rain forecast across the session.';
  }
  return 'Your published outlook, from the start to the closing stages.';
}
