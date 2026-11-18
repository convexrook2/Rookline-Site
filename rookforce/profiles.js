import { createStoredZip } from './profiles-zip.mjs';

// Supplied profile-name presentation only; this does not identify a live car.
const profileManufacturers = ['ADESS', 'Alpine', 'Aston Martin', 'BMW', 'Cadillac', 'Chevrolet',
  'Duqueine', 'Ferrari', 'Ford', 'Genesis', 'Ginetta', 'Glickenhaus', 'Isotta Fraschini',
  'Lamborghini', 'Lexus', 'Ligier', 'McLaren', 'Mercedes-AMG', 'ORECA', 'Peugeot', 'Porsche', 'Toyota', 'Vanwall'];
const profileClassColours = { Hypercar: 'Hypercar', 'Hypercar (LMH/LMDh)': 'Hypercar',
  GT3: 'LMGT3', LMGT3: 'LMGT3', LMP2: 'LMP2', 'LMP2+': 'LMP2', LMP3: 'LMP3', GTE: 'GTE' };
function profileNameTone(profile) {
  if (profile.game !== 'Le Mans Ultimate') return null;
  if (profile.kind === 'Class preset') {
    const value = profileClassColours[profile.category];
    return value ? { key: 'classColour', value } : null;
  }
  if (profile.kind === 'Car preset') {
    const value = profileManufacturers.find(name => profile.displayName.startsWith(`${name} `));
    return value ? { key: 'manufacturer', value } : null;
  }
  return null;
}

const list = document.querySelector('#profile-list');
const search = document.querySelector('#profile-search');
const game = document.querySelector('#profile-game');
const status = document.querySelector('#profile-status');
const empty = document.querySelector('#profile-empty');
const count = document.querySelector('#selection-count');
const selectShown = document.querySelector('#select-shown');
const clear = document.querySelector('#clear-selection');
const download = document.querySelector('#download-selected');
const downloadStatus = document.querySelector('#download-status');
const previous = document.querySelector('#profiles-previous');
const next = document.querySelector('#profiles-next');
const pager = document.querySelector('#profiles-pager');
const pageCount = document.querySelector('#profiles-page-count');
const selected = new Set();
const pageSize = 9;
let profiles = [];
let matches = [];
let visible = [];
let pageIndex = 0;
let busy = false;
const node = (tag, text, className) => {
  const item = document.createElement(tag);
  if (text != null) item.textContent = text;
  if (className) item.className = className;
  return item;
};

function updateSelection() {
  count.textContent = `${selected.size} selected`;
  clear.disabled = busy || selected.size === 0;
  download.disabled = busy || selected.size === 0;
  selectShown.disabled = busy || visible.length === 0;
  search.disabled = game.disabled = busy;
  previous.disabled = busy || pageIndex === 0;
  next.disabled = busy || (pageIndex + 1) * pageSize >= matches.length;
  pageCount.textContent = `Page ${pageIndex + 1} of ${Math.max(1, Math.ceil(matches.length / pageSize))}`;
  pager.hidden = matches.length === 0;
  list.querySelectorAll('input').forEach(input => {
    input.checked = selected.has(input.value);
    input.disabled = busy;
    input.closest('.profile-row').classList.toggle('is-selected', input.checked);
  });
  const range = matches.length ? `${pageIndex * pageSize + 1}–${pageIndex * pageSize + visible.length} of ${matches.length} profiles` : '0 profiles';
  status.textContent = `${range}${matches.length !== profiles.length ? ` · ${profiles.length} total` : ''} · ${selected.size} selected.`;
}

function render() {
  const query = search.value.trim().toLocaleLowerCase();
  matches = profiles.filter(profile => (!game.value || profile.game === game.value)
    && (!query || `${profile.displayName} ${profile.game} ${profile.category} ${profile.kind} ${profile.deviceClass} ${profile.file}`.toLocaleLowerCase().includes(query)));
  pageIndex = Math.min(pageIndex, Math.max(0, Math.ceil(matches.length / pageSize) - 1));
  visible = matches.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
  list.replaceChildren();
  for (const profile of visible) {
    const card = node('li', null, 'profile-row');
    card.dataset.game = profile.game;
    const identity = node('div', null, 'profile-identity');
    const label = node('label');
    const input = node('input');
    input.type = 'checkbox'; input.value = profile.file;
    input.setAttribute('aria-label', `Select ${profile.displayName} — ${profile.game}`);
    input.addEventListener('change', () => {
      if (input.checked) selected.add(profile.file); else selected.delete(profile.file);
      updateSelection();
    });
    const copy = node('span', null, 'profile-copy');
    const title = node('span', profile.displayName, 'profile-title');
    const tone = profileNameTone(profile);
    if (tone) title.dataset[tone.key] = tone.value;
    title.setAttribute('role', 'heading'); title.setAttribute('aria-level', '3');
    copy.append(title);
    copy.append(node('span', profile.game, 'profile-game'));
    copy.append(node('span', `${profile.kind}${profile.category !== profile.kind && profile.category !== profile.displayName ? ` · ${profile.category}` : ''}`, 'profile-context'));
    copy.append(node('span', `${profile.deviceManufacturer} ${profile.deviceClass}`, 'profile-device'));
    label.append(input, copy); identity.append(label); card.append(identity);
    if (profile.note) copy.append(node('span', profile.note, 'profile-note'));
    const footer = node('div', null, 'profile-download');
    const link = node('a', 'Download XML'); link.href = profile.url; link.download = profile.file;
    link.setAttribute('aria-label', `Download ${profile.displayName} XML`);
    footer.append(link, node('span', `${(profile.bytes / 1024).toFixed(1)} KB`)); card.append(footer);
    list.append(card);
  }
  empty.hidden = visible.length !== 0;
  list.hidden = visible.length === 0;
  updateSelection();
}

search.addEventListener('input', () => { pageIndex = 0; render(); });
game.addEventListener('change', () => { pageIndex = 0; render(); });
function changePage(delta, control) {
  if (busy || control.disabled) return;
  pageIndex += delta; render();
  if (control.disabled) (delta > 0 ? previous : next).focus();
}
previous.addEventListener('click', () => changePage(-1, previous));
next.addEventListener('click', () => changePage(1, next));
selectShown.addEventListener('click', () => { visible.forEach(profile => selected.add(profile.file)); updateSelection(); });
clear.addEventListener('click', () => { selected.clear(); updateSelection(); downloadStatus.textContent = 'Selection cleared.'; });

download.addEventListener('click', async () => {
  if (busy || selected.size === 0) return;
  const collection = profiles.filter(profile => selected.has(profile.file));
  const returnFocus = document.activeElement === download;
  busy = true; updateSelection(); download.textContent = 'Preparing ZIP…';
  downloadStatus.textContent = `Preparing ${collection.length} selected profiles…`;
  try {
    const files = [];
    for (const profile of collection) {
      const response = await fetch(profile.url);
      if (!response.ok) throw new Error('A profile could not be fetched.');
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length !== profile.bytes) throw new Error('Incomplete profile file.');
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
      if (hash !== profile.sha256) throw new Error('Profile integrity mismatch.');
      files.push({ name: profile.file, bytes });
    }
    const blob = new Blob([createStoredZip(files)], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const anchor = node('a'); anchor.href = url; anchor.download = 'RookForce-Selected-Profiles.zip';
    document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    downloadStatus.textContent = `ZIP ready with ${collection.length} profiles. Your selection is kept.`;
  } catch {
    downloadStatus.textContent = 'The ZIP could not be prepared. Your selection is kept. Retry or download the XML files individually.';
  } finally {
    busy = false; updateSelection(); download.textContent = 'Download selected ZIP';
    if (returnFocus) download.focus();
  }
});

fetch('profiles/manifest.json').then(response => {
  if (!response.ok) throw new Error('Profile list unavailable.');
  return response.json();
}).then(manifest => {
  if (!Array.isArray(manifest.profiles) || manifest.profiles.length !== manifest.count || manifest.count === 0) throw new Error('Profile list incomplete.');
  const seen = new Set();
  for (const profile of manifest.profiles) {
    if (typeof profile.file !== 'string' || /[\\/\x00-\x1f<>:"|?*]/.test(profile.file) || !profile.file.endsWith('.xml')
      || profile.url !== `profiles/xml/${encodeURIComponent(profile.file)}` || !Number.isInteger(profile.bytes) || profile.bytes <= 0
      || !/^[a-f0-9]{64}$/.test(profile.sha256) || seen.has(profile.file.toLowerCase())) throw new Error('Invalid profile entry.');
    seen.add(profile.file.toLowerCase());
  }
  profiles = manifest.profiles; render();
}).catch(() => {
  status.textContent = 'The profile list could not be loaded. Reload to retry, or use Download all ZIP above.';
  search.disabled = game.disabled = true;
});
