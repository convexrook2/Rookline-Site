/* Manual simulated appearance controls only. No live sources or persistence. */
(function () {
  'use strict';
  window.RooklineManufacturerPreview = function (root) {
    const car = document.getElementById('preview-car');
    const appearance = document.getElementById('preview-style');
    const lamps = document.getElementById('preview-shift-style');
    const logo = document.getElementById('preview-logo');
    const status = document.getElementById('preview-logo-status');
    const theme = window.installRooklineManufacturerStyle(root, { live: true });
    const readout = document.getElementById('readout');
    const arc = root.querySelector('[data-hud-part="rpm-arc"]');
    function describeAppearance() {
      if (!readout) return;
      readout.textContent = arc.getAttribute('data-full-red') === 'true'
        ? 'Full red · arc endpoint reached'
        : appearance.value === 'default'
          ? Number(arc.getAttribute('data-presented-fraction')) > .875
            ? 'Continuous white fill · coloured endpoint tip' : 'Continuous white fill'
          : 'Car-specific RPM appearance · simulated data';
    }
    const observer = new MutationObserver(describeAppearance);
    if (readout) observer.observe(arc, { attributes: true, attributeFilter: ['data-presented-fraction', 'data-full-red'] });
    const gear = document.getElementById('gear');
    const progress = document.getElementById('progress');
    const presets = new Set(document.querySelectorAll('button[data-progress]'));
    function describeControlRender(event) {
      // The event bubbles after the speedometer's target render handler, even
      // when unchanged RPM/full-red attributes produce no observer callback.
      const rendered = event.type === 'change' && event.target === gear
        || event.type === 'input' && event.target === progress
        || event.type === 'click' && presets.has(event.target.closest?.('button'));
      if (rendered && appearance.value === 'car-specific') describeAppearance();
    }
    if (readout) for (const type of ['change', 'input', 'click']) document.addEventListener(type, describeControlRender);
    let blob = null;
    for (const sample of window.RooklineManufacturerCatalogue.cars) {
      const option = document.createElement('option');
      option.value = sample.id; option.textContent = sample.name;
      car.append(option);
    }
    car.value = 'ferrari-499p';
    function clearLogo() {
      theme.setLogoSource(null);
      if (blob) URL.revokeObjectURL(blob);
      blob = null; logo.value = ''; status.textContent = '';
    }
    function selectCar() {
      clearLogo();
      theme.setSelection({ carId: car.value });
      theme.setOriginal(appearance.value === 'default');
      describeAppearance();
    }
    car.addEventListener('change', selectCar);
    appearance.addEventListener('change', () => { theme.setOriginal(appearance.value === 'default'); describeAppearance(); });
    lamps.addEventListener('change', () => theme.setShiftLightAppearance(lamps.value));
    logo.addEventListener('change', async () => {
      const file = logo.files[0];
      clearLogo();
      if (!file) return;
      blob = URL.createObjectURL(file);
      const pending = blob;
      status.textContent = 'Loading preview logo';
      const loaded = await theme.setLogoSource(blob, car.selectedOptions[0].textContent + ' preview logo');
      if (pending !== blob) return;
      status.textContent = loaded ? 'Preview logo loaded.' : 'Preview logo could not be loaded.';
    });
    window.addEventListener('pagehide', () => { observer.disconnect(); if (readout) for (const type of ['change', 'input', 'click']) document.removeEventListener(type, describeControlRender); if (blob) URL.revokeObjectURL(blob); });
    selectCar();
    return theme;
  };
})();
