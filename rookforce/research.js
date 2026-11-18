(() => {
  'use strict';
  const search = document.querySelector('#car-search');
  const classFilter = document.querySelector('#class-filter');
  const evidenceFilter = document.querySelector('#evidence-filter');
  const rows = document.querySelector('#car-rows');
  const detail = document.querySelector('#car-detail');
  const status = document.querySelector('#car-status');
  const empty = document.querySelector('#empty-cars');
  const sourceList = document.querySelector('#source-list');
  let data;
  let selectedId;

  const element = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const category = car => car.evidence.includes('documented') ? 'documented'
    : car.evidence === 'Evidence gap' ? 'gap' : 'related';
  const labeledParagraph = (parent, label, value, className) => {
    parent.append(element('span', label, 'detail-label'), element('p', value, className));
  };
  const sourceLink = source => {
    const link = element('a', source.title);
    link.href = source.url;
    return link;
  };

  function showCar(car) {
    detail.replaceChildren();
    detail.append(element('span', `${car.class} · ${car.evidence}`, 'eyebrow'));
    const heading = element('h3', car.name);
    heading.id = 'selected-car-title';
    detail.setAttribute('aria-labelledby', heading.id);
    detail.append(heading);
    const base = element('div', null, 'base-line');
    const number = element('span', String(car.base), 'base-number');
    number.append(element('small', '%'));
    const explanation = element('p');
    explanation.append(element('strong', 'Stored Real base'), document.createTextNode('18 Nm reference · 100% profile gain. Your projected LMU target may differ.'));
    base.append(number, explanation);
    detail.append(base, element('p', car.fact, 'car-fact'));
    car.sourceIds.forEach(id => {
      const source = data.sources.find(item => item.id === id);
      const line = element('p');
      line.append(sourceLink(source), document.createTextNode(` · ${source.access}`));
      detail.append(line);
    });
    detail.append(element('p', car.interpretation));
    const disclosure = element('details', null, 'car-disclosure');
    disclosure.append(element('summary', 'Targets, history & evidence limits'));
    const controls = element('dl');
    data.controls.forEach(control => {
      const item = element('div');
      item.append(element('dt', control.label), element('dd', `${car.targets[control.key]}${control.unit === '%' ? '%' : ' level'}`));
      controls.append(item);
    });
    disclosure.append(controls);
    labeledParagraph(disclosure, 'Historical lineage · Strength', `Original ${car.history.original}% → corrected workbook ${car.history.workbook}% → stored exact-car base ${car.history.stored}%.`, 'history-line');
    labeledParagraph(disclosure, 'Historical architecture note', `${car.historicalArchitecture}. Scope recorded in the workbook: ${car.historicalScope}. This is historical source interpretation, not a fresh force measurement.`);
    labeledParagraph(disclosure, 'Implemented behavior', car.adoption);
    labeledParagraph(disclosure, 'Identity & application', `${car.identityNote} The six values above are stored inputs. Current capability, gain, settings authority and verified readback are separate.`);
    if (car.differences.length) {
      const labels = Object.fromEntries(data.controls.map(control => [control.key, control.label]));
      labeledParagraph(disclosure, 'Workbook differences · retained for review', car.differences.map(value => value.replace(/^[^:]+/, key => labels[key])).join('; ') + '. Production values were not changed by this audit.', 'car-differences');
    }
    labeledParagraph(disclosure, 'Next evidence question', car.nextQuestion);
    labeledParagraph(disclosure, 'Unresolved physical claim', 'No matched, calibrated real-car handwheel torque or vibration trace was recovered for this review. A published architecture does not validate the numerical sliders.');
    const limitsLink = element('a', 'Read the full method & limits');
    limitsLink.href = '#method';
    disclosure.append(limitsLink);
    detail.append(disclosure);
  }

  function render() {
    const query = search.value.trim().toLocaleLowerCase();
    const visible = data.cars.filter(car => (!query || `${car.name} ${car.class}`.toLocaleLowerCase().includes(query))
      && (!classFilter.value || car.class === classFilter.value)
      && (!evidenceFilter.value || category(car) === evidenceFilter.value));
    if (!visible.some(car => car.id === selectedId)) selectedId = visible[0]?.id;
    rows.replaceChildren();
    visible.forEach(car => {
      const row = element('tr', null, car.id === selectedId ? 'is-selected' : '');
      const nameCell = element('td');
      const button = element('button', car.name, 'car-select');
      button.type = 'button';
      button.setAttribute('aria-pressed', String(car.id === selectedId));
      button.addEventListener('click', () => {
        selectedId = car.id;
        // Update the detail and row states without replacing the focused button.
        rows.querySelectorAll('tr').forEach(item => item.classList.remove('is-selected'));
        rows.querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', 'false'));
        row.classList.add('is-selected');
        button.setAttribute('aria-pressed', 'true');
        showCar(car);
        status.textContent = `${visible.length} of ${data.cars.length} cars · selected ${car.name}. Research appears ${window.matchMedia('(max-width: 1000px)').matches ? 'below the list' : 'beside the list'}.`;
        history.replaceState(null, '', `#${car.id}`);
      });
      nameCell.append(button, element('span', car.class, 'car-class'));
      const evidenceCell = element('td');
      evidenceCell.append(element('span', car.evidence, `evidence-tag ${category(car)}`));
      row.append(nameCell, element('td', `${car.base}%`), evidenceCell);
      rows.append(row);
    });
    empty.hidden = visible.length !== 0;
    status.textContent = `${visible.length} of ${data.cars.length} cars${selectedId ? ` · selected ${visible.find(car => car.id === selectedId).name}` : ' · no matching car'}.`;
    const selected = visible.find(car => car.id === selectedId);
    if (selected) showCar(selected);
    else {
      detail.removeAttribute('aria-labelledby');
      detail.replaceChildren(element('h3', 'No matching car'), element('p', 'Clear the search or change the filters to read a car’s research.'));
    }
  }

  function renderSources() {
    data.sources.forEach(source => {
      const disclosure = element('details');
      disclosure.id = `source-${source.id}`;
      disclosure.append(element('summary', source.title));
      const body = element('div', null, 'source-body');
      body.append(element('p', `${source.date} · ${source.access}`, 'source-meta'));
      [['Supports', source.claim], ['Limits', source.limits], ['Adoption', source.adoption]].forEach(([label, text]) => {
        const paragraph = element('p');
        paragraph.append(element('strong', `${label}: `), document.createTextNode(text));
        body.append(paragraph);
      });
      body.append(sourceLink(source));
      disclosure.append(body);
      sourceList.append(disclosure);
    });
  }

  [search, classFilter, evidenceFilter].forEach(control => control.addEventListener(control === search ? 'input' : 'change', () => {
    if (data) render();
  }));
  fetch('research-data.json').then(response => {
    if (!response.ok) throw new Error('Research snapshot could not be loaded.');
    return response.json();
  }).then(snapshot => {
    if (!Array.isArray(snapshot.cars) || snapshot.cars.length === 0 || !Array.isArray(snapshot.sources)) throw new Error('Research snapshot is incomplete.');
    data = snapshot;
    const linkedId = location.hash.slice(1);
    selectedId = data.cars.some(car => car.id === linkedId) ? linkedId : data.cars.find(car => car.name === 'Porsche 963')?.id;
    renderSources();
    render();
  }).catch(() => {
    status.textContent = 'The car snapshot could not be loaded. Reload this page to retry; the methodology and official references below remain available.';
    detail.replaceChildren(element('p', 'Car research is unavailable until the snapshot loads.'));
  });
})();
