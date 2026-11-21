// Personal read-only client of the public schedule used by lmuportal.com.
// No Steam account, player token, LMU installation, or RaceOS requests.
export const PORTAL = 'https://lmuportal.com';
const DATABASE = 'https://db.lmuportal.space';
export const REFRESH_MS = 30 * 1000;
const DAY_MS = 86_400_000;
import { publicClient } from './public-client.mjs';

async function request(url, headers = {}) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(20000), redirect: 'error' });
  if (!response.ok) throw new Error(`Schedule source returned HTTP ${response.status}`);
  return response;
}

async function publicClientHeaders() {
  // Only the Portal's already-public anonymous read client is shipped. No personal token.
  if(publicClient.database!==DATABASE||publicClient.role!=='anon')throw new Error('Public schedule client unavailable.');
  return {apikey:publicClient.key,Authorization:`Bearer ${publicClient.key}`};
}

async function table(name, params, headers) {
  const rows = [];
  for (let offset = 0; offset < 20000; offset += 1000) {
    const query = new URLSearchParams({ ...params, limit: '1000', offset: String(offset) });
    const page = await (await request(`${DATABASE}/rest/v1/${name}?${query}`, headers)).json();
    if (!Array.isArray(page)) throw new Error('Unexpected public schedule response.');
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
  throw new Error('The public schedule exceeded the bounded page limit.');
}

function publishedSlots(series, week, events, now) {
  if (week.status !== 'live' || !['daily', 'weekly'].includes(series.type)) return [];
  if (series.schedule_status && series.schedule_status !== 'active') return [];
  const weekStart = Date.parse(`${week.start_date || week.week_key}T00:00:00Z`);
  if (!Number.isFinite(weekStart)) return [];

  const times = series.type === 'daily' && series.todays_start_times_utc?.length
    ? series.todays_start_times_utc : series.times_utc;
  const slots = (Array.isArray(times) ? times : [])
    .filter(time => typeof time === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time));
  const days = Array.isArray(series.race_days) ? series.race_days : [];
  const datedDays = new Set(events.map(event => Date.parse(event.race_starts_at))
    .filter(Number.isFinite).map(at => Math.floor(at / DAY_MS)));

  // Dated event records take priority on their UTC day. Use the published
  // daily or weekday slots for the remaining dates within the live week.
  const starts = [];
  for (let day = Math.max(weekStart, Math.floor(now / DAY_MS) * DAY_MS); day < weekStart + 7 * DAY_MS; day += DAY_MS) {
    if (datedDays.has(day / DAY_MS)) continue;
    if ((series.type === 'weekly' || days.length) && !days.includes(new Date(day).getUTCDay())) continue;
    const date = new Date(day).toISOString().slice(0, 10);
    for (const slot of slots) {
      const race_starts_at = `${date}T${slot.length === 5 ? slot + ':00' : slot}Z`;
      starts.push({ race_starts_at });
    }
  }
  return starts;
}

export function buildSnapshot({ weeks, series, events, seasons = [], championshipSeries = [], rounds = [], championshipEvents = [] }, now = new Date()) {
  const upcoming = list => [...new Set(list.map(e => e.race_starts_at)
    .filter(t => typeof t === 'string' && Number.isFinite(Date.parse(t)) && Date.parse(t) >= now.getTime()))]
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  const selectedWeeks = new Map(weeks.filter(w => w.visible !== false && ['live', 'upcoming'].includes(w.status)).map(w => [w.week_key, w]));
  const races = series.filter(s => !s.hidden && selectedWeeks.has(s.week_key)).map(s => {
    const week = selectedWeeks.get(s.week_key);
    const dated = events.filter(e => e.series_id === s.series_id);
    return {
    id: s.series_id, name: s.series_name, type: s.type, tier: s.tier_name,
    week: s.week_key, weekStatus: selectedWeeks.get(s.week_key).status,
    track: s.track_friendly || s.track_name, layout: s.track_config,
    classes: s.car_classes || [], sr: s.sr_requirement, setup: s.setup,
    duration: s.race_duration_minutes,
    sessions: {
      race: { duration: s.race_duration_minutes, config: s.race_weather },
      qualifying: { duration: s.qualifying_duration_minutes, config: s.qualifying_weather },
      practice: { duration: s.practice_duration_minutes, config: s.practice_weather }
    },
    starts: upcoming([...dated, ...publishedSlots(s, week, dated, now)]),
    sourceUpdatedAt: s.source_updated_at || s.updated_at, upstreamSource: s.source,
    scheduleStatus: s.schedule_status, scheduleNote: s.schedule_status_note,
    sourceUrl: PORTAL + '/schedule'
    };
  });
  // Championship starts are joined to their exact round; never borrow another round's weather.
  for (const s of championshipSeries) {
    const season = seasons.find(x => x.season_id === s.season_id);
    if (!season) continue;
    for (const round of rounds.filter(r => r.championship_series_id === s.championship_series_id)) {
      const starts = upcoming(championshipEvents.filter(e => e.championship_round_id === round.championship_round_id));
      if (!starts.length) continue;
      races.push({
        id: round.championship_round_id, name: s.series_name, type: 'championship', tier: 'championship',
        week: `${season.season_name} · ${round.round_name || `Week ${round.week_number}`}`, weekStatus: season.status,
        track: round.track_friendly_name, layout: round.track_config, classes: s.car_classes || [],
        sr: s.sr_requirement, setup: s.setup, duration: round.race_duration_override_minutes ?? s.race_duration_minutes,
        sessions: Object.fromEntries(['race', 'qualifying', 'practice'].map(key => [key, {
          duration: key === 'race' ? round.race_duration_override_minutes ?? s.race_duration_minutes : s[`${key}_duration_minutes`],
          config: round[`${key}_weather`] ?? null
        }])), starts, sourceUpdatedAt: round.updated_at || season.last_source_updated_at,
        upstreamSource: 'LMU Portal championship publication', sourceUrl: PORTAL + '/championships'
      });
    }
  }
  return { version: 1, fetchedAt: now.toISOString(), source: 'LMU Portal public schedule', sourceUrl: PORTAL,
    nextRefreshAt: new Date(now.getTime() + REFRESH_MS).toISOString(), races,
    notices: ['Community-published event configuration; not independently verified against the game.',
      'Starts use dated events and published UTC slots for the live week. Missing start times and weather are left blank.',
      'Sky, wind-direction and water-depth values retain the source’s raw presets and values.'] };
}

export async function fetchSchedule(now = new Date()) {
  const headers = await publicClientHeaders();
  const weeks = await table('week', { select: 'week_key,status,visible,start_date,updated_at,source', visible: 'eq.true', status: 'in.(live,upcoming)', order: 'week_key.asc' }, headers);
  if (!weeks.length) throw new Error('No current or upcoming schedule weeks were published.');
  const weekKeys = `in.(${weeks.map(w => w.week_key).join(',')})`;
  const from = now.toISOString();
  const utcMidnight = new Date(Math.floor(now / DAY_MS) * DAY_MS).toISOString();
  const until = new Date(now.getTime() + 60 * DAY_MS).toISOString();
  const [series, events, seasons] = await Promise.all([
    table('race_series', { select: 'series_id,week_key,type,tier_name,series_name,sr_requirement,track_name,track_friendly,track_config,car_classes,race_duration_minutes,race_weather,practice_duration_minutes,practice_weather,qualifying_duration_minutes,qualifying_weather,setup,source,source_updated_at,updated_at,hidden,schedule_status,schedule_status_note,todays_start_times_utc,times_utc,race_days', week_key: weekKeys, hidden: 'eq.false', order: 'series_id.asc' }, headers),
    table('race_event', { select: 'series_id,race_starts_at', week_key: weekKeys, race_starts_at: `gte.${utcMidnight}`, and: `(race_starts_at.lte.${until})`, order: 'race_starts_at.asc,event_id.asc' }, headers),
    table('championship_season', { select: 'season_id,season_name,status,last_source_updated_at', status: 'in.(active,upcoming)', order: 'season_id.asc' }, headers)
  ]);
  let championshipSeries = [], rounds = [], championshipEvents = [];
  let championshipError = null;
  if (seasons.length) {
    try {
      championshipSeries = await table('championship_series', { select: 'championship_series_id,season_id,series_name,car_classes,sr_requirement,setup,race_duration_minutes,qualifying_duration_minutes,practice_duration_minutes', season_id: `in.(${seasons.map(s => s.season_id).join(',')})`, order: 'championship_series_id.asc' }, headers);
      if (championshipSeries.length) {
        const ids = `in.(${championshipSeries.map(s => s.championship_series_id).join(',')})`;
        [rounds, championshipEvents] = await Promise.all([
          table('championship_round', { select: 'championship_round_id,championship_series_id,round_name,week_number,track_friendly_name,track_config,race_duration_override_minutes,race_weather,qualifying_weather,practice_weather,updated_at', championship_series_id: ids, order: 'championship_round_id.asc' }, headers),
          table('championship_event', { select: 'championship_round_id,race_starts_at', championship_series_id: ids, race_starts_at: `gte.${from}`, and: `(race_starts_at.lte.${until})`, order: 'race_starts_at.asc,event_id.asc' }, headers)
        ]);
      }
    } catch { championshipError = 'Championship data could not be refreshed; daily, weekly and special events are shown.'; }
  }
  const snapshot = buildSnapshot({ weeks, series, events, seasons, championshipSeries, rounds, championshipEvents }, now);
  if (championshipError) snapshot.notices.push(championshipError);
  return snapshot;
}
