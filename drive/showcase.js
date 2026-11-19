const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const featureFind = document.getElementById('feature-find');
if (featureFind) {
  featureFind.closest('.guide-search').hidden = false;
  const searchFeatures = () => {
    const query = featureFind.value.trim().toLowerCase();
    let count = 0;
    for (const topic of document.querySelectorAll('.topic')) {
      let matches = 0;
      const title = topic.querySelector('h2').textContent.toLowerCase();
      for (const row of topic.querySelectorAll('.topic-row')) {
        const hit = (title + ' ' + row.textContent.toLowerCase()).includes(query);
        row.hidden = !hit;
        if (hit) matches++;
      }
      topic.hidden = !matches;
      document.querySelector('.topic-nav a[href="#' + topic.id + '"]').hidden = !matches;
      count += matches;
    }
    document.getElementById('feature-count').textContent = query ? count + (count === 1 ? ' match' : ' matches') : '';
    document.getElementById('empty-features').hidden = count > 0;
  };
  featureFind.addEventListener('input', searchFeatures);
  searchFeatures();
}
const campaignFilm = document.getElementById('campaign-film');
if (campaignFilm) {
  const start = document.getElementById('start-campaign');
  function showPoster() {
    campaignFilm.poster = 'assets/one-sector-cover' + (matchMedia('(max-width:700px)').matches ? '-portrait' : '') + '.jpg';
    campaignFilm.controls = false;
    start.hidden = false;
  }
  async function playFilm(focusPlayer) {
    campaignFilm.controls = true;
    start.hidden = true;
    try {
      await campaignFilm.play();
      if (focusPlayer) campaignFilm.focus();
    } catch {
      showPoster();
    }
  }
  showPoster();
  start.addEventListener('click', () => playFilm(true));
  if (!campaignFilm.loop) {
    campaignFilm.addEventListener('ended', () => { campaignFilm.load(); showPoster(); });
  }
  if (campaignFilm.hasAttribute('data-autoplay-muted') && !reduceMotion.matches) playFilm(false);
}
