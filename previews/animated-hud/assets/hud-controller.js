/* Layered HUD controller. No game connection, network requests, or dependencies. */
(function (global) {
  'use strict';
  const EMPTY_VALUES = Object.freeze({
    gear: null, speedKph: null, rpmFraction: null, rpm: null, fuelLitres: null,
    fuelFraction: null, fuelLaps: null, energyPct: null,
    energyLaps: null, coolantC: null, oilC: null, ffbFraction: null,
    brakeFraction: null, throttleFraction: null, socPct: null, hybridFlowFraction: null
  });
  const NUMERIC_VALUES = Object.freeze([
    'speedKph', 'rpmFraction', 'fuelLitres', 'fuelFraction', 'fuelLaps',
    'energyPct', 'energyLaps', 'coolantC', 'oilC', 'ffbFraction',
    'brakeFraction', 'throttleFraction', 'socPct', 'hybridFlowFraction'
  ]);
  const DAMAGE_PARTS = Object.freeze({
    front: 'vehicle-front-segment', left: 'vehicle-body-left', right: 'vehicle-body-right',
    rear: 'vehicle-rear-segment', wing: 'vehicle-lower-bar'
  });
  const DAMAGE_COLOURS = Object.freeze({
    none: '#565866', light: '#ffff00', medium: '#ff9a36', heavy: '#ef5350', missing: '#ef5350'
  });
  // Owner-approved body8 location order; codes remain independent raw values.
  const BODY_POSITIONS = Object.freeze([
    ['vehicle-front-segment', 'Front centre'], ['vehicle-front-segment', 'Front left'],
    ['vehicle-body-left', 'Left side'], ['vehicle-rear-segment', 'Rear left'],
    ['vehicle-rear-segment', 'Rear centre'], ['vehicle-rear-segment', 'Rear right'],
    ['vehicle-body-right', 'Right side'], ['vehicle-front-segment', 'Front right']
  ]);
  const BODY_DENT_COLOURS = Object.freeze(['#565866', '#ffff00', '#ff7f00']);
  const bodyDentKnown = value => value === 0 || value === 1 || value === 2;
  const INPUT_COLOURS = Object.freeze({
    'brake-input': '#ff1e44', 'throttle-input': '#00ff00',
    'hybrid-flow': '#437dbf', 'battery-soc': '#5788c1'
  });
  // Approximate paints sampled from the supplied decoded video; not asset constants.
  const HYBRID_ACTIVITY_COLOURS = Object.freeze({idle: '#565866', deploying: '#5788c1', charging: '#1df41e'});
  const SHIFT_PARTS = Object.freeze(['shift-light-left', 'shift-light-centre', 'shift-light-right']);
  const ENERGY_PARTS = Object.freeze(['energy-fill', 'energy-value', 'energy-label']);
  // Owner-approved common arc positions from the retained native crossings and
  // approved preview. Empirical presentation binding, not a native Boolean API.
  const DEFAULT_SHIFT_LIGHT_THRESHOLDS = Object.freeze([0.939, 0.9585, 0.9792]);
  const WHEELS = Object.freeze({fl: 'Front left', fr: 'Front right', rl: 'Rear left', rr: 'Rear right'});
  const SURFACE_ZONES = Object.freeze(['inner', 'middle', 'outer']);
  const THERMAL_STOPS = Object.freeze(['#427fc3', '#6dc9e2', '#74d398', '#f3cf58', '#ef5350']);
  const CORE_READOUTS = Object.freeze([
    'gear', 'speed', 'speed-unit', 'fuel-value', 'energy-value', 'energy-label',
    'coolant-value', 'oil-value', 'ffb-label'
  ]);
  const VALUE_PARTS = Object.freeze({
    gear: ['gear'], speedKph: ['speed', 'speed-unit'], rpmFraction: ['rpm-arc'],
    fuelLitres: ['fuel-value', 'fuel-pump'], fuelFraction: ['fuel-fill'], fuelLaps: ['fuel-value'],
    energyPct: ['energy-fill', 'energy-value', 'energy-label'], energyLaps: ['energy-value'],
    coolantC: ['coolant-value', 'coolant'], oilC: ['oil-value', 'oil'], ffbFraction: ['ffb-value', 'ffb-label'],
    brakeFraction: ['brake-input'], throttleFraction: ['throttle-input'], socPct: ['hybrid-flow']
  });
  let instanceCount = 0;
  const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const hex = value => typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
  const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
  const numeric = value => typeof value === 'number' && Number.isFinite(value);
  const validShiftLightThresholds = values => Array.isArray(values) && values.length === 3 &&
    [0, 1, 2].every(index => numeric(values[index]) && values[index] >= 0 && values[index] <= 1 &&
      (index === 0 || values[index] > values[index - 1]));
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const setAttribute = (element, name, value) => {
    if (!element) return;
    const text = String(value);
    if (element.getAttribute(name) !== text) element.setAttribute(name, text);
  };
  const toggleClass = (element, name, enabled) => {
    if (element.classList.contains(name) !== enabled) element.classList.toggle(name, enabled);
  };
  const copy = value => JSON.parse(JSON.stringify(value));
  function syncWarningPulsePhase(element) {
    if (!element || typeof element.getAnimations !== 'function') return;
    const timeline = element.ownerDocument && element.ownerDocument.timeline;
    if (!timeline) return;
    // Existing named warnings share the document origin, regardless of mount
    // or activation time. Never resume a paused animation or create a clock.
    for (const animation of element.getAnimations({subtree: true})) {
      if (animation.animationName === 'lmu-live-flat-warning-pulse' && animation.timeline === timeline &&
          animation.playState !== 'paused' && animation.startTime !== 0) animation.startTime = 0;
    }
  }
  const damageState = value => typeof value === 'string' && own(DAMAGE_COLOURS, value) ? value : null;
  const unknownStates = () => ({
    fuelOnly: false,
    pitLimiter: null, headlights: null, telemetryRecording: null, hybridMode: null, engineDamage: null, engineWarning: null,
    oilTemperature: null,
    shiftLightMode: null,
    shiftLights: [null, null, null],
    damage: Object.fromEntries(Object.keys(DAMAGE_PARTS).map(key => [key, null])),
    suspensionDamage: Object.fromEntries(Object.keys(WHEELS).map(key => [key, null])),
    tyreThermal: Object.fromEntries(Object.keys(WHEELS).map(key => [key, null])),
    tyreSurface: Object.fromEntries(Object.keys(WHEELS).map(wheel => [wheel,
      Object.fromEntries(SURFACE_ZONES.map(zone => [zone, null]))])),
    // Literal RGB and raw Celsius are supplied by the current-LMU adapter.
    // They are intentionally separate from the older normalized demo tints.
    tyreSurfaceRgb: Object.fromEntries(Object.keys(WHEELS).map(wheel => [wheel,
      Object.fromEntries(SURFACE_ZONES.map(zone => [zone, null]))])),
    tyreSurfaceCelsius: Object.fromEntries(Object.keys(WHEELS).map(wheel => [wheel,
      Object.fromEntries(SURFACE_ZONES.map(zone => [zone, null]))])),
    tyreSurfaceProfile: Object.fromEntries(Object.keys(WHEELS).map(wheel => [wheel, null])),
    tyreHealth: Object.fromEntries(Object.keys(WHEELS).map(wheel => [wheel, {flat: null, detached: null, wearFractionRaw: null}])),
    suspensionPaint: Object.fromEntries(Object.keys(WHEELS).map(wheel => [wheel, null])),
    suspensionRawFraction: Object.fromEntries(Object.keys(WHEELS).map(wheel => [wheel, null])),
    suspensionSeverity: Object.fromEntries(Object.keys(WHEELS).map(wheel => [wheel, null])),
    wingState: null,
    bodyPositions: null,
    brakePaint: Object.fromEntries(Object.keys(WHEELS).map(key => [key, null])),
    brakeCelsius: Object.fromEntries(Object.keys(WHEELS).map(key => [key, null])),
    brakeThermal: Object.fromEntries(Object.keys(WHEELS).map(key => [key, null]))
  });
  const thermalColour = value => {
    if (!numeric(value)) return null;
    const point = clamp(value, 0, 1) * (THERMAL_STOPS.length - 1);
    const lower = Math.floor(point), upper = Math.min(lower + 1, THERMAL_STOPS.length - 1);
    const ratio = point - lower;
    return '#' + [1, 3, 5].map(offset => {
      const a = parseInt(THERMAL_STOPS[lower].slice(offset, offset + 2), 16);
      const b = parseInt(THERMAL_STOPS[upper].slice(offset, offset + 2), 16);
      return Math.round(a + (b - a) * ratio).toString(16).padStart(2, '0');
    }).join('');
  };

  class LMUHud {
    // Owner-approved Step 3: one shared empirical conversion; no car identity,
    // lookup, observed-peak substitute or producer/source mutation.
    static rpmArcFraction(rpm, maxRpm) {
      return numeric(rpm) && numeric(maxRpm) && maxRpm > 0 ? rpm / (maxRpm * 0.98) : null;
    }

    constructor(svg, options = {}) {
      if (!(svg instanceof SVGElement) || svg.tagName.toLowerCase() !== 'svg') {
        throw new TypeError('LMUHud requires an inline SVG element.');
      }
      this.svg = svg;
      this.neutralColour = hex(options.neutralColour) ? options.neutralColour : '#565866';
      this.shiftLightThresholds = Object.freeze(validShiftLightThresholds(options.shiftLightThresholds) ?
        [...options.shiftLightThresholds] : [...DEFAULT_SHIFT_LIGHT_THRESHOLDS]);
      this.parts = new Map();
      this.layers = {};
      this.defaults = {};
      this.values = {...EMPTY_VALUES};
      this.states = unknownStates();
      this.temperatureUnit = 'C';
      // Availability is separate from the user's colour/visibility preferences.
      this.neutralized = new Set();
      // Keep clip paths and accessible names independent if several HUDs are mounted.
      const suffix = `--lmu${++instanceCount}`;
      const ids = new Map();
      for (const el of [svg, ...svg.querySelectorAll('[id]')]) {
        if (el.id) { const previous = el.id; el.id += suffix; ids.set(previous, el.id); }
      }
      for (const el of [svg, ...svg.querySelectorAll('*')]) {
        for (const attr of [...el.attributes]) {
          if (attr.name === 'id') continue;
          let value = attr.value.replace(/url\(#([^\)]+)\)/g, (all, id) => ids.has(id) ? `url(#${ids.get(id)})` : all);
          if ((attr.name === 'href' || attr.name === 'xlink:href') && value[0] === '#' && ids.has(value.slice(1))) {
            value = '#' + ids.get(value.slice(1));
          }
          if (attr.name === 'aria-labelledby' || attr.name === 'aria-describedby') {
            value = value.split(' ').map(id => ids.get(id) || id).join(' ');
          }
          if (value !== attr.value) el.setAttribute(attr.name, value);
        }
      }
      svg.querySelectorAll('[data-hud-part]').forEach(el => {
        const id = el.getAttribute('data-hud-part');
        const declaredColour = INPUT_COLOURS[id] || el.getAttribute('data-default-colour');
        const colour = hex(declaredColour) ? declaredColour.toLowerCase() : '#f3f3fa';
        const setting = {colour, colourMode: 'auto', enabled: true, visible: true, opacity: 1};
        this.parts.set(id, el);
        this.defaults[id] = {...setting};
        this.layers[id] = {...setting};
      });
      this.roles = {};
      svg.querySelectorAll('[data-role]').forEach(el => { this.roles[el.getAttribute('data-role')] = el; });
      this.rpmSegments = [...svg.querySelectorAll('[data-rpm-segment]')];
      this.clear();
    }

    setLayer(id, patch = {}) {
      if (!this.parts.has(id) || !isObject(patch)) return false;
      const next = {...this.layers[id]};
      if ('colourMode' in patch) {
        if (patch.colourMode !== 'auto' && patch.colourMode !== 'custom') return false;
        next.colourMode = patch.colourMode;
      }
      if ('colour' in patch) {
        if (!hex(patch.colour)) return false;
        next.colour = patch.colour.toLowerCase();
        // Replaying an exported auto layer must not silently turn it into a custom layer.
        next.colourMode = patch.colourMode === 'auto' ? 'auto' : 'custom';
      }
      if ('enabled' in patch) { if (typeof patch.enabled !== 'boolean') return false; next.enabled = patch.enabled; }
      if ('visible' in patch) { if (typeof patch.visible !== 'boolean') return false; next.visible = patch.visible; }
      if ('opacity' in patch) { if (!numeric(patch.opacity)) return false; next.opacity = clamp(patch.opacity, 0, 1); }
      this.layers[id] = next;
      // An explicit layer edit is also permitted in a disconnected drawing preview.
      if (['colour', 'colourMode', 'enabled', 'visible', 'opacity'].some(key => key in patch)) {
        this.neutralized.delete(id);
      }
      this.renderLayer(id);
      return true;
    }

    setShiftLightThresholds(thresholds) {
      if (!validShiftLightThresholds(thresholds)) return false;
      this.shiftLightThresholds = Object.freeze([...thresholds]);
      if (this.states.shiftLightMode === 'rpm') {
        this.resolveShiftLights();
        this.renderStates();
        this.renderLayers();
      }
      return true;
    }

    resolveShiftLights(rpm = this.values.rpmFraction) {
      if (this.states.shiftLightMode === 'rpm') {
        this.states.shiftLights = this.shiftLightThresholds.map(threshold => rpm == null ? null : rpm >= threshold);
      } else if (this.states.shiftLightMode !== 'manual') {
        this.states.shiftLights = [null, null, null];
      }
      SHIFT_PARTS.forEach((part, index) => this.markKnown([part], this.states.shiftLights[index] != null));
    }

    resetLayer(id) {
      if (!this.parts.has(id)) return false;
      this.layers[id] = {...this.defaults[id]};
      this.neutralized.delete(id);
      this.renderLayer(id);
      return true;
    }

    oilWarningLabel() {
      return this.states.oilTemperature?.overheatingRaw === 1 ? 'Overheating warning'
        : this.states.oilTemperature?.rgb === '#ff334f' ? 'Oil temperature warning' : '';
    }

    // The intended paint, before colour-disabled or unavailable neutral rendering.
    getEffectiveColour(id) {
      const layer = this.layers[id];
      if (!this.parts.has(id) || !layer) return null;
      if (layer.colourMode === 'custom') return layer.colour;
      const s = this.states;
      if (id === 'rpm-arc') {
        if (s.pitLimiter === true) return '#ffd500';
        if (this.roles['rpm-continuous-fill']) return this.rpmGeometryFraction >= 1 ? '#ff2148' : '#f3f4f8';
        return '#f3f3fa';
      }
      const approved = this.svg.getAttribute('data-approved-artwork') === '20261011';
      const shiftIndex = SHIFT_PARTS.indexOf(id);
      if (shiftIndex !== -1) return s.shiftLights[shiftIndex] === true ? approved ? '#ff2148' : '#fe254a' : approved ? '#171929' : '#1e1f2d';
      if (id === 'headlights') return s.headlights === true ? '#ffffff' : this.neutralColour;
      // Retain the legacy part ID for existing saved layer settings and integrations.
      if (id === 'traction-chip') return s.telemetryRecording === true ? '#f3f3fa' : this.neutralColour;
      if (id === 'speed-limiter') return s.pitLimiter === true ? '#ffff00' : this.neutralColour;
      const oilWarningColour = s.oilTemperature?.rgb;
      // Owner correction: flag1 is engine orange; only the failure latch is red.
      if (id === 'engine') return this.engineWarningBound ? (s.engineWarning === true ? '#ff334f'
        : s.oilTemperature?.overheatingRaw === 1 ? '#ff7f00' : this.neutralColour)
        : s.engineDamage == null ? this.neutralColour : DAMAGE_COLOURS[s.engineDamage];
      // Both oil layers share admitted warning paint; water keeps its base paint.
      if (id === 'oil' || id === 'oil-value') return oilWarningColour || layer.colour;
      if (id === 'vehicle-lower-bar') {
        return s.wingState === 'detached' ? '#ff334f' : s.wingState === 'attached' ? '#51525c' : this.neutralColour;
      }
      for (const [key, part] of Object.entries(DAMAGE_PARTS)) {
        if (key === 'wing') continue;
        if (id === part) return s.damage[key] == null ? this.neutralColour : DAMAGE_COLOURS[s.damage[key]];
      }
      for (const wheel of Object.keys(WHEELS)) {
        if (id === `vehicle-glyph-${wheel}`) return s.suspensionPaint[wheel] || (s.suspensionDamage[wheel] == null ?
          this.neutralColour : DAMAGE_COLOURS[s.suspensionDamage[wheel]]);
        if (id === `vehicle-tyre-${wheel}`) return this.getTyreSurfaceColour(wheel, 'middle');
        if (id === `vehicle-inset-${wheel}`) return s.brakePaint[wheel] || thermalColour(s.brakeThermal[wheel]) || this.neutralColour;
      }
      // Legacy IDs are retained: the right arc is SoC; both battery layers show activity.
      if (id === 'battery' || id === 'battery-soc') {
        return HYBRID_ACTIVITY_COLOURS[s.hybridMode] || this.neutralColour;
      }
      if (approved && id === 'throttle-input') return '#16ed0d';
      if (approved && id === 'hybrid-flow') return '#427fbe';
      if (own(INPUT_COLOURS, id)) return INPUT_COLOURS[id];
      return layer.colour;
    }

    // Literal paint from the admitted current-LMU adapter takes precedence over
    // normalized disconnected-preview tints. Celsius remains separate data.
    getTyreSurfaceColour(corner, zone) {
      if (!own(WHEELS, corner) || !SURFACE_ZONES.includes(zone)) return null;
      const layer = this.layers[`vehicle-tyre-${corner}`];
      if (layer && layer.colourMode === 'custom') return layer.colour;
      // Flat warning paint is a separate overlay: its transparent phase reveals
      // these current independent surface colours, rather than a saved tint.
      const literal = this.states.tyreSurfaceRgb[corner][zone];
      if (hex(literal)) return literal;
      const value = this.states.tyreSurface[corner][zone];
      return thermalColour(value) || thermalColour(this.states.tyreThermal[corner]) || this.neutralColour;
    }

    renderLayer(id) {
      if (this.deferRender) return;
      const el = this.parts.get(id), layer = this.layers[id];
      if (!el || !layer) return;
      const active = layer.enabled && !this.neutralized.has(id);
      const colour = active ? this.getEffectiveColour(id) : this.neutralColour;
      if (el.style.getPropertyValue('--part-color') !== colour) el.style.setProperty('--part-color', colour);
      const energyPart = ENERGY_PARTS.includes(id);
      const visible = layer.visible && !(energyPart && this.states.fuelOnly);
      const visibility = visible ? 'visible' : 'hidden';
      if (el.style.visibility !== visibility) el.style.visibility = visibility;
      if (el.style.opacity !== String(layer.opacity)) el.style.opacity = String(layer.opacity);
      setAttribute(el, 'data-colour-enabled', String(layer.enabled));
      setAttribute(el, 'data-colour-mode', layer.colourMode);
      setAttribute(el, 'data-paint-available', String(!this.neutralized.has(id)));
      setAttribute(el, 'aria-hidden', String(!visible));
      const sampleName = id === 'coolant-value' ? 'coolant-sample' : id === 'oil-value' ? 'oil-sample' : null;
      if (sampleName && this.roles[sampleName]) {
        const sample = this.roles[sampleName];
        sample.style.setProperty('--part-color', colour);
        sample.style.visibility = visibility;
        sample.style.opacity = String(layer.opacity);
      }
      if (id === 'rpm-arc' && this.roles['rpm-continuous-fill']) this.renderRpmArc(this.rpmGeometryFraction);
      const lampIndex = SHIFT_PARTS.indexOf(id);
      const lamp = lampIndex < 0 ? null : this.roles[`shift-lamp-${['left', 'centre', 'right'][lampIndex]}`];
      if (lamp) setAttribute(lamp, 'filter', active && layer.colourMode === 'auto' && this.states.shiftLights[lampIndex] === true
        ? lamp.getAttribute('data-live-glow') : 'none');
      if (energyPart) setAttribute(el, 'display', this.states.fuelOnly ? 'none' : 'inline');
      BODY_POSITIONS.forEach(([parent], index) => {
        if (parent !== id || !this.roles[`body-position-${index}`]) return;
        const value = this.states.bodyPositions && this.states.bodyPositions[index];
        setAttribute(this.roles[`body-position-${index}`], 'stroke', active ?
          layer.colourMode === 'custom' ? layer.colour :
            bodyDentKnown(value) ? BODY_DENT_COLOURS[value] : this.neutralColour : this.neutralColour);
      });
      const damageKey = Object.keys(DAMAGE_PARTS).find(key => DAMAGE_PARTS[key] === id);
      const suspensionWheel = Object.keys(WHEELS).find(wheel => `vehicle-glyph-${wheel}` === id);
      const missing = id === 'engine' ? !this.engineWarningBound && this.states.engineDamage === 'missing' :
        damageKey != null ? this.states.damage[damageKey] === 'missing' :
        suspensionWheel != null && this.states.suspensionDamage[suspensionWheel] === 'missing';
      toggleClass(el, 'hud-missing', Boolean(missing && active && layer.visible));
      const tyreWheel = Object.keys(WHEELS).find(wheel => `vehicle-tyre-${wheel}` === id);
      if (tyreWheel != null) {
        for (const zone of SURFACE_ZONES) {
          // The SVG supplies physical left/right ordering; no DOM ID is assumed.
          const stop = this.roles[`tyre-${tyreWheel}-${zone}`];
          if (!stop) continue;
          setAttribute(stop, 'stop-color', active ? this.getTyreSurfaceColour(tyreWheel, zone) : this.neutralColour);
          setAttribute(stop, 'stop-opacity', '1');
        }
        const warning = this.roles[`tyre-${tyreWheel}-flat-warning`];
        const health = this.states.tyreHealth[tyreWheel];
        // Owner October 10: raw remaining wear strictly below 5% shares the
        // flat orange overlay. Rounded display percent cannot decide this edge.
        if (warning) {
          setAttribute(warning, 'display', active && layer.colourMode === 'auto' &&
            (health.flat === true || (health.wearFractionRaw != null && health.wearFractionRaw < 0.05)) &&
            health.detached !== true ? 'inline' : 'none');
          // Owner October 11: low positive wear stays orange and steady;
          // Native flat, zero and the owner's exact observed fully-worn residue pulse.
          setAttribute(warning, 'data-warning-pulse', String(health.flat === true ||
            health.wearFractionRaw === 0 || health.wearFractionRaw === Number.EPSILON));
        }
      }
      const cornerWheel = tyreWheel || suspensionWheel || Object.keys(WHEELS).find(wheel => `vehicle-inset-${wheel}` === id);
      if (cornerWheel != null) {
        const detached = this.states.tyreHealth[cornerWheel].detached;
        setAttribute(el, 'data-wheel-detached', detached == null ? 'unknown' : String(detached));
        toggleClass(el, 'hud-detached', detached === true);
        const kind = tyreWheel ? 'tyre' : suspensionWheel ? 'suspension' : 'brake';
        const warning = this.roles[`${kind}-${cornerWheel}-detached-warning`];
        // Overlay animations keep running while hidden, so raw updates and
        // preference changes never restart the shared corner warning phase.
        if (warning) {
          if (warning.getAttribute('data-approved-node') != null) setAttribute(warning, 'display', 'inline');
          setAttribute(warning, 'data-warning-active', String(
            detached === true && layer.enabled && layer.visible && layer.colourMode === 'auto'));
        }
      }
      if (id === 'vehicle-lower-bar') {
        toggleClass(el, 'hud-detached', this.states.wingState === 'detached');
        const warning = this.roles['wing-detached-warning'];
        if (warning) setAttribute(warning, 'data-warning-active', String(
          this.states.wingState === 'detached' && active && layer.visible && layer.colourMode === 'auto'));
      }
      if (cornerWheel != null || id === 'vehicle-lower-bar') syncWarningPulsePhase(el);
    }

    renderLayers() {
      if (this.deferRender) return;
      for (const id of this.parts.keys()) this.renderLayer(id);
      for (const role of ['energy-track', 'energy-dividers']) {
        this.setRoleAttribute(role, 'display', this.states.fuelOnly ? 'none' : 'inline');
        this.setRoleAttribute(role, 'aria-hidden', String(this.states.fuelOnly));
      }
      this.describePart('bar-tracks', this.states.fuelOnly ? 'Fuel track' : 'Fuel and energy tracks');
      this.describePart('bar-dividers', this.states.fuelOnly ? 'Fuel bar divisions' : 'Bar divisions');
    }

    markKnown(ids, known) {
      for (const id of ids) {
        if (!this.parts.has(id)) continue;
        if (known) this.neutralized.delete(id);
        else if (this.parts.get(id).getAttribute('data-category') !== 'Structure') this.neutralized.add(id);
      }
    }

    markTyreKnown(wheel) {
      this.markKnown([`vehicle-tyre-${wheel}`], this.states.tyreThermal[wheel] != null ||
        SURFACE_ZONES.some(zone => this.states.tyreSurface[wheel][zone] != null ||
          this.states.tyreSurfaceRgb[wheel][zone] != null || this.states.tyreSurfaceCelsius[wheel][zone] != null) ||
        this.states.tyreHealth[wheel].flat != null || this.states.tyreHealth[wheel].detached != null ||
        this.states.tyreHealth[wheel].wearFractionRaw != null);
    }

    // V1/V2 semantic correction: socPct drives the right arc (legacy hybrid-flow).
    // hybridFlowFraction remains accepted/exported for saved-frame compatibility,
    // but has no visual or availability effect.
    setValues(patch = {}) {
      if (!isObject(patch)) return false;
      if ('gear' in patch) {
        const gear = patch.gear;
        this.values.gear = gear === 'R' || gear === 'N' ? gear :
          numeric(gear) && Number.isInteger(gear) ? gear : null;
      }
      for (const key of NUMERIC_VALUES) {
        // Bounds constrain drawing geometry, never a source reading.
        if (key in patch) this.values[key] = numeric(patch[key]) ? patch[key] : null;
      }
      if ('rpm' in patch) this.values.rpm = numeric(patch.rpm) ? patch.rpm : null;
      for (const [key, ids] of Object.entries(VALUE_PARTS)) {
        if (key in patch) this.markKnown(ids, this.values[key] != null);
      }
      // Each compound readout stays readable if either of its independent inputs is known.
      if ('fuelLitres' in patch || 'fuelLaps' in patch) {
        this.markKnown(['fuel-value'], this.values.fuelLitres != null || this.values.fuelLaps != null);
      }
      if ('energyPct' in patch || 'energyLaps' in patch) {
        this.markKnown(['energy-value'], this.values.energyPct != null || this.values.energyLaps != null);
      }
      const rpmShiftUpdate = 'rpmFraction' in patch && this.states.shiftLightMode === 'rpm';
      if (rpmShiftUpdate) this.resolveShiftLights();
      this.renderValues();
      if (rpmShiftUpdate) this.renderStates();
      this.renderLayers();
      return true;
    }

    setTemperatureUnit(unit) {
      if (unit !== 'C' && unit !== 'F') return false;
      this.temperatureUnit = unit;
      this.renderValues();
      this.renderStates();
      return true;
    }

    setStates(patch = {}) {
      if (!isObject(patch)) return false;
      if ('fuelOnly' in patch) this.states.fuelOnly = patch.fuelOnly === true;
      for (const [key, part] of [['pitLimiter', 'speed-limiter'], ['headlights', 'headlights'], ['telemetryRecording', 'traction-chip']]) {
        if (!(key in patch)) continue;
        this.states[key] = typeof patch[key] === 'boolean' ? patch[key] : null;
        this.markKnown([part], this.states[key] != null);
        if (key === 'pitLimiter') this.markKnown(['rpm-arc'], this.values.rpmFraction != null);
      }
      let shiftUpdate = 'shiftLightMode' in patch;
      if (shiftUpdate) {
        this.states.shiftLightMode = ['manual', 'rpm'].includes(patch.shiftLightMode) ? patch.shiftLightMode : null;
      }
      // A valid explicit array selects manual control unless this same patch asks
      // for RPM mode. Partial/invalid arrays are ignored; RPM mode resolves anew.
      if (Array.isArray(patch.shiftLights) && patch.shiftLights.length === 3 &&
          Array.from(patch.shiftLights).every(value => typeof value === 'boolean' || value === null)) {
        this.states.shiftLights = [...patch.shiftLights];
        this.states.shiftLightMode = patch.shiftLightMode === 'rpm' ? 'rpm' : 'manual';
        shiftUpdate = true;
      }
      if (shiftUpdate) this.resolveShiftLights();
      if ('hybridMode' in patch) {
        this.states.hybridMode = ['idle', 'deploying', 'charging'].includes(patch.hybridMode) ? patch.hybridMode : null;
        this.markKnown(['battery', 'battery-soc'], this.states.hybridMode != null);
      }
      if ('engineDamage' in patch) {
        if (!('engineWarning' in patch)) this.engineWarningBound = false;
        this.states.engineDamage = damageState(patch.engineDamage);
        this.markKnown(['engine'], this.states.engineDamage != null);
      }
      if ('engineWarning' in patch) {
        this.engineWarningBound = true;
        this.states.engineWarning = typeof patch.engineWarning === 'boolean' ? patch.engineWarning : null;
        this.markKnown(['engine'], this.states.engineWarning != null);
      }
      if ('damage' in patch) {
        for (const [key, part] of Object.entries(DAMAGE_PARTS)) {
          if (isObject(patch.damage) && !(key in patch.damage)) continue;
          this.states.damage[key] = isObject(patch.damage) ? damageState(patch.damage[key]) : null;
          this.markKnown([part], this.states.damage[key] != null);
        }
      }
      if ('suspensionDamage' in patch) {
        for (const wheel of Object.keys(WHEELS)) {
          if (isObject(patch.suspensionDamage) && !(wheel in patch.suspensionDamage)) continue;
          this.states.suspensionDamage[wheel] = isObject(patch.suspensionDamage) ?
            damageState(patch.suspensionDamage[wheel]) : null;
          this.markKnown([`vehicle-glyph-${wheel}`], this.states.suspensionDamage[wheel] != null);
        }
      }
      if ('tyreHealth' in patch) {
        for (const wheel of Object.keys(WHEELS)) {
          if (isObject(patch.tyreHealth) && !(wheel in patch.tyreHealth)) continue;
          const health = isObject(patch.tyreHealth) && isObject(patch.tyreHealth[wheel]) ? patch.tyreHealth[wheel] : null;
          this.states.tyreHealth[wheel] = {
            flat: health && typeof health.flat === 'boolean' ? health.flat : null,
            detached: health && typeof health.detached === 'boolean' ? health.detached : null,
            wearFractionRaw: health && numeric(health.wearFractionRaw) && health.wearFractionRaw >= 0 && health.wearFractionRaw <= 1
              ? health.wearFractionRaw : null
          };
          this.markTyreKnown(wheel);
        }
      }
      if ('wingState' in patch) {
        this.states.wingState = patch.wingState === 'attached' || patch.wingState === 'detached' ? patch.wingState : null;
        this.markKnown(['vehicle-lower-bar'], this.states.wingState != null);
      }
      for (const [key, prefix] of [['tyreThermal', 'vehicle-tyre-'], ['brakeThermal', 'vehicle-inset-']]) {
        if (!(key in patch)) continue;
        for (const wheel of Object.keys(WHEELS)) {
          if (isObject(patch[key]) && !(wheel in patch[key])) continue;
          const value = isObject(patch[key]) ? patch[key][wheel] : null;
          this.states[key][wheel] = numeric(value) ? clamp(value, 0, 1) : null;
          if (key === 'brakeThermal') {
            this.states.brakePaint[wheel] = null;
            this.states.brakeCelsius[wheel] = null;
          }
          if (key === 'tyreThermal') this.markTyreKnown(wheel);
          else this.markKnown([prefix + wheel], this.states[key][wheel] != null);
        }
      }
      if ('tyreSurface' in patch) {
        for (const wheel of Object.keys(WHEELS)) {
          if (isObject(patch.tyreSurface) && !(wheel in patch.tyreSurface)) continue;
          const zones = isObject(patch.tyreSurface) ? patch.tyreSurface[wheel] : null;
          for (const zone of SURFACE_ZONES) {
            if (isObject(zones) && !(zone in zones)) continue;
            const value = isObject(zones) ? zones[zone] : null;
            this.states.tyreSurface[wheel][zone] = numeric(value) ? clamp(value, 0, 1) : null;
          }
          this.markTyreKnown(wheel);
        }
      }
      this.renderValues();
      this.renderStates();
      this.renderLayers();
      return true;
    }

    // This accepts literal paint and raw source values only. It deliberately
    // does not convert Celsius into a normalized demo slider value.
    setRawPaint(patch = {}) {
      if (!isObject(patch)) return false;
      if ('oilTemperature' in patch) {
        const oil = isObject(patch.oilTemperature) ? patch.oilTemperature : null;
        this.states.oilTemperature = oil ? {...oil, rgb: hex(oil.rgb) ? oil.rgb.toLowerCase() : null} : null;
        const warningAvailable = this.states.oilTemperature?.rgb != null;
        this.markKnown(['oil', 'oil-value'], this.values.oilC != null || warningAvailable);
        this.markKnown(['engine'], this.states.engineWarning != null || this.states.oilTemperature?.overheatingRaw === 1);
      }
      if ('body' in patch) {
        const positions = isObject(patch.body) ? patch.body.positions : null;
        this.states.bodyPositions = Array.isArray(positions) && positions.length === 8 ? positions.slice() : null;
        for (const parent of new Set(BODY_POSITIONS.map(([id]) => id))) {
          this.markKnown([parent], BODY_POSITIONS.some(([id], index) => id === parent &&
            this.states.bodyPositions != null && bodyDentKnown(this.states.bodyPositions[index])));
        }
      }
      for (const wheel of Object.keys(WHEELS)) {
        const rgb = isObject(patch.tyreSurfaceRgb) && isObject(patch.tyreSurfaceRgb[wheel]) ? patch.tyreSurfaceRgb[wheel] : null;
        const celsius = isObject(patch.tyreSurfaceCelsius) && isObject(patch.tyreSurfaceCelsius[wheel]) ? patch.tyreSurfaceCelsius[wheel] : null;
        if ('tyreSurfaceProfile' in patch && (!isObject(patch.tyreSurfaceProfile) || wheel in patch.tyreSurfaceProfile)) {
          const profile = isObject(patch.tyreSurfaceProfile) ? patch.tyreSurfaceProfile[wheel] : null;
          this.states.tyreSurfaceProfile[wheel] = isObject(profile)
            && ['matched-empirical-profile', 'empirical-reference-fallback'].includes(profile.mode) ? {
              mode: profile.mode,
              profileId: typeof profile.profileId === 'string' ? profile.profileId : null,
              vehicleClassRaw: typeof profile.vehicleClassRaw === 'string' ? profile.vehicleClassRaw : null,
              compoundRaw: typeof profile.compoundRaw === 'string' ? profile.compoundRaw : null
            } : null;
        }
        for (const zone of SURFACE_ZONES) {
          if (rgb && zone in rgb) this.states.tyreSurfaceRgb[wheel][zone] = hex(rgb[zone]) ? rgb[zone].toLowerCase() : null;
          if (celsius && zone in celsius) this.states.tyreSurfaceCelsius[wheel][zone] = numeric(celsius[zone]) ? celsius[zone] : null;
        }
        const suspension = isObject(patch.suspension) && isObject(patch.suspension[wheel]) ? patch.suspension[wheel] : null;
        if (suspension) {
          this.states.suspensionPaint[wheel] = hex(suspension.rgb) ? suspension.rgb.toLowerCase() : null;
          this.states.suspensionRawFraction[wheel] = numeric(suspension.rawFraction) ? suspension.rawFraction : null;
          this.states.suspensionSeverity[wheel] = ['none', 'light', 'medium', 'severe'].includes(suspension.severity) ? suspension.severity : null;
          this.markKnown([`vehicle-glyph-${wheel}`], this.states.suspensionPaint[wheel] != null);
        }
        const brake = isObject(patch.brakeTemperature) && isObject(patch.brakeTemperature[wheel]) ? patch.brakeTemperature[wheel] : null;
        if (brake) {
          this.states.brakeCelsius[wheel] = numeric(brake.rawCelsius) ? brake.rawCelsius : null;
          this.states.brakePaint[wheel] = this.states.brakeCelsius[wheel] != null && hex(brake.rgb) ? brake.rgb.toLowerCase() : null;
          this.markKnown([`vehicle-inset-${wheel}`], this.states.brakePaint[wheel] != null || this.states.brakeThermal[wheel] != null);
        }
        this.markTyreKnown(wheel);
      }
      this.renderValues();
      this.renderStates();
      this.renderLayers();
      return true;
    }

    setRoleAttribute(role, name, value) {
      if (this.roles[role]) setAttribute(this.roles[role], name, String(value));
    }

    setRoleText(role, value) {
      const element = this.roles[role];
      if (element && element.textContent !== String(value)) element.textContent = value;
    }

    renderGeometry(values) {
      const fraction = key => numeric(values[key]) ? clamp(values[key], 0, 1) : 0;
      if ('rpmFraction' in values) {
        this.renderRpmArc(values.rpmFraction);
        this.renderLayer('rpm-arc');
        if (this.states.shiftLightMode === 'rpm') {
          // Use the same interpolated, unforced fraction as the arc. Yellow
          // limiter extent never substitutes for measured engine progress.
          this.resolveShiftLights(values.rpmFraction);
          this.renderStates();
          SHIFT_PARTS.forEach(part => this.renderLayer(part));
        }
      }
      if ('fuelFraction' in values) this.renderResourceFill('fuel', fraction('fuelFraction'));
      for (const [key, role] of [['throttleFraction', 'throttle-clip'], ['brakeFraction', 'brake-clip']]) {
        if (!(key in values)) continue;
        const height = fraction(key) * 115;
        this.setRoleAttribute(role, 'y', 225 - height);
        this.setRoleAttribute(role, 'height', height);
      }
      if ('throttleFraction' in values) this.renderInputArc('throttle', values.throttleFraction);
      if ('brakeFraction' in values) this.renderInputArc('brake', values.brakeFraction);
    }

    renderResourceFill(name, fraction) {
      const clip = this.roles[name + '-fill'];
      const width = clip && Number(clip.getAttribute('data-full-width'));
      this.setRoleAttribute(name + '-fill', 'width', fraction * (width > 0 ? width : 168));
      this.setRoleAttribute(name + '-sample', 'display', 'none');
      this.setRoleAttribute(name + '-active-fill', 'display', fraction > 0 ? 'inline' : 'none');
    }

    renderInputArc(name, value) {
      this.setRoleAttribute(name + '-sample', 'display', 'none');
      this.setRoleAttribute(name + '-arc', 'stroke-dasharray', `${numeric(value) ? clamp(value, 0, 1) : 0} 1`);
      this.setRoleAttribute(name + '-arc', 'display', numeric(value) && value > 0 ? 'inline' : 'none');
    }

    renderApprovedReadout(name, value) {
      const sample = this.roles[name + '-value-sample'];
      if (!sample) return;
      // Owner: live numeric text uses Roboto consistently, including exact
      // preview values and unavailable placeholders. Traced artwork is retained.
      this.setRoleAttribute(name + '-value-sample', 'display', 'none');
      this.setRoleAttribute(name + '-value', 'display', 'inline');
    }

    renderRpmArc(value) {
      this.rpmGeometryFraction = numeric(value) ? value : null;
      const p = numeric(value) ? this.states.pitLimiter === true ? 1 : clamp(value, 0, 1) : 0;
      const white = this.roles['rpm-continuous-fill'];
      if (!white) {
        const lit = Math.round(p * this.rpmSegments.length);
        this.rpmSegments.forEach((el, i) => setAttribute(el, 'display', i < lit ? 'inline' : 'none'));
        return;
      }
      const layer = this.layers['rpm-arc'];
      const nativePaint = layer.enabled && layer.colourMode === 'auto' && !this.neutralized.has('rpm-arc') && this.states.pitLimiter !== true;
      const red = nativePaint && numeric(value) && value >= 1;
      const warning = nativePaint && !red && p > 0.875;
      setAttribute(white, 'stroke-dasharray', `${nativePaint ? Math.min(p, 0.875) : p} 1`);
      setAttribute(white, 'display', red ? 'none' : 'inline');
      this.setRoleAttribute('rpm-full-red', 'display', red ? 'inline' : 'none');
      this.setRoleAttribute('rpm-warning-fill', 'display', warning ? 'inline' : 'none');
      if (warning) {
        const g = this.roles['rpm-warning-fill'];
        const cx = Number(g.getAttribute('data-cx')), cy = Number(g.getAttribute('data-cy')), r = Number(g.getAttribute('data-radius'));
        const angle = (-210 + 240 * p) * Math.PI / 180;
        this.setRoleAttribute('rpm-warning-path', 'd', `M${cx+r},${cy} A${r},${r} 0 0,1 ${cx+r*Math.cos(angle)},${cy+r*Math.sin(angle)}`);
      }
      const arc = this.parts.get('rpm-arc');
      setAttribute(arc, 'data-presented-fraction', this.rpmGeometryFraction == null ? 'unavailable' : this.rpmGeometryFraction);
      setAttribute(arc, 'data-full-red', String(red));
    }

    describePart(id, label, attributes = {}) {
      const part = this.parts.get(id);
      if (!part) return;
      const wheel = Object.keys(WHEELS).find(key => id === `vehicle-inset-${key}` || id === `vehicle-glyph-${key}`);
      const warning = wheel && this.states.tyreHealth[wheel].detached === true ? `; ${WHEELS[wheel]} wheel detached warning` : '';
      setAttribute(part, 'aria-label', label + warning);
      for (const [key, value] of Object.entries(attributes)) {
        setAttribute(part, key, value == null ? 'unknown' : String(value));
      }
    }

    renderValues() {
      if (this.deferRender) return;
      const v = this.values;
      const attr = (role, name, value) => this.setRoleAttribute(role, name, value);
      const text = (role, value) => this.setRoleText(role, value);
      const gear = v.gear === -1 ? 'R' : v.gear === 0 ? 'N' : v.gear == null ? '—' : String(v.gear);
      attr('gear-one', 'display', gear === '1' ? 'inline' : 'none');
      attr('gear-neutral', 'display', gear === 'N' ? 'inline' : 'none');
      attr('gear-value', 'display', gear === '1' || (gear === 'N' && this.roles['gear-neutral']) ? 'none' : 'inline');
      text('gear-value', gear);
      this.describePart('gear', `Gear ${gear}`, {'data-value': v.gear});
      const speed = v.speedKph == null ? '—' : String(Math.round(v.speedKph));
      text('speed-value', speed);
      attr('speed-zero', 'display', 'none');
      attr('speed-value', 'display', 'inline');
      this.describePart('speed', `Speed ${speed} kilometres per hour`, {'data-value': v.speedKph});
      this.renderRpmArc(v.rpmFraction);
      this.describePart('rpm-arc', v.rpm == null ? 'RPM unavailable' :
        `Engine speed ${Math.round(v.rpm)} RPM`, {'data-value': v.rpmFraction, 'data-rpm': v.rpm});
      const laps = value => value == null ? '—' : value.toFixed(1);
      const fuelText = `${v.fuelLitres == null ? '—' : v.fuelLitres.toFixed(1)}L (${laps(v.fuelLaps)} laps)`;
      const energyText = `${v.energyPct == null ? '—' : v.energyPct.toFixed(1)}% (${laps(v.energyLaps)} laps)`;
      text('fuel-value', fuelText);
      text('energy-value', energyText);
      this.renderApprovedReadout('fuel', fuelText);
      this.renderApprovedReadout('energy', energyText);
      this.renderResourceFill('fuel', clamp(v.fuelFraction ?? 0, 0, 1));
      this.renderResourceFill('energy', clamp(v.energyPct ?? 0, 0, 100) / 100);
      this.describePart('fuel-value', `Fuel ${fuelText}`, {'data-value': v.fuelLitres, 'data-laps': v.fuelLaps});
      this.describePart('energy-value', `Virtual energy ${energyText}`, {'data-value': v.energyPct, 'data-laps': v.energyLaps});
      this.describePart('energy-fill', v.energyPct == null ? 'Virtual energy unavailable' :
        `Virtual energy ${v.energyPct.toFixed(1)} percent`, {'data-value': v.energyPct, 'data-hud-meaning': 'virtual-energy'});
      const temperature = value => value == null ? null : this.temperatureUnit === 'F' ? value * 1.8 + 32 : value;
      const temperatureName = this.temperatureUnit === 'F' ? 'Fahrenheit' : 'Celsius';
      text('coolant-value', `${v.coolantC == null ? '—' : temperature(v.coolantC).toFixed(1)}°${this.temperatureUnit}`);
      text('oil-value', `${v.oilC == null ? '—' : temperature(v.oilC).toFixed(1)}°${this.temperatureUnit}`);
      for (const name of ['coolant', 'oil']) {
        if (this.roles[name + '-sample']) {
          const valuePart = this.parts.get(name + '-value');
          // The approved preview hid these ancestors in favour of traced sample
          // glyphs. Live text must reveal its parent as well as its own role.
          setAttribute(valuePart, 'display', 'inline');
          attr(name + '-sample', 'display', 'none');
          attr(name + '-value', 'display', 'inline');
        }
      }
      for (const [key, part, label] of [['coolantC', 'coolant-value', 'Water'], ['oilC', 'oil-value', 'Oil']]) {
        const oilWarning = key === 'oilC' ? this.oilWarningLabel() : '';
        const temperatureLabel = v[key] == null ? `${label} temperature unavailable` :
          `${label} temperature ${temperature(v[key]).toFixed(1)} degrees ${temperatureName}`;
        this.describePart(part, temperatureLabel + (oilWarning ? '; ' + oilWarning : ''),
          {'data-value': v[key], 'data-source-unit': 'Celsius'});
      }
      this.describePart('oil', this.oilWarningLabel() || (v.oilC == null ? 'Oil temperature unavailable' :
        `Oil temperature ${temperature(v.oilC).toFixed(1)} degrees ${temperatureName}`), {'data-hud-meaning': 'oil-temperature'});
      const negative = v.ffbFraction != null && v.ffbFraction < 0 ? -v.ffbFraction * 35.3 : v.ffbFraction === 0 ? 0.8 : 0;
      attr('ffb-negative', 'x', 213.1 - negative);
      attr('ffb-negative', 'width', negative);
      attr('ffb-positive', 'width', v.ffbFraction != null && v.ffbFraction > 0 ? v.ffbFraction * 35.3 : 0);
      this.describePart('ffb-value', v.ffbFraction == null ? 'Force feedback unavailable' :
        `Force feedback ${Math.round(v.ffbFraction * 100)} percent`, {'data-value': v.ffbFraction});
      for (const [key, role, part, label] of [
        ['brakeFraction', 'brake-clip', 'brake-input', 'Brake input'],
        ['throttleFraction', 'throttle-clip', 'throttle-input', 'Throttle input']
      ]) {
        const height = clamp(v[key] ?? 0, 0, 1) * 115;
        attr(role, 'y', 225 - height);
        attr(role, 'height', height);
        this.describePart(part, v[key] == null ? `${label} unavailable` :
          `${label} ${Math.round(v[key] * 100)} percent`, {'data-value': v[key]});
      }
      const socHeight = clamp(v.socPct ?? 0, 0, 100) / 100 * 115;
      this.renderInputArc('throttle', v.throttleFraction);
      this.renderInputArc('brake', v.brakeFraction);
      attr('hybrid-flow-clip', 'height', socHeight);
      attr('hybrid-flow-clip', 'y', 225 - socHeight);
      const socFraction = v.socPct == null ? 0 : clamp(v.socPct, 0, 100) / 100;
      // A zero-length leading dash creates a round-cap dot. Offset one real
      // dash to the trailing extent instead; the fixed backing is independent.
      attr('soc-arc', 'stroke-dasharray', `${socFraction} 1`);
      attr('soc-arc', 'stroke-dashoffset', socFraction - 1);
      attr('soc-arc', 'display', socFraction > 0 ? 'inline' : 'none');
      this.describeStateOfCharge();
      this.describePart('left-outer-rail', 'Brake input track', {'data-hud-meaning': 'brake-input-track'});
      this.describePart('left-inner-rail', 'Throttle input track', {'data-hud-meaning': 'throttle-input-track'});
      this.describePart('right-rail', 'Battery state of charge track', {'data-hud-meaning': 'battery-soc-track'});
      this.describeHybridActivity();
      const number = (value, suffix) => value == null ? 'unavailable' : `${value}${suffix}`;
      setAttribute(this.svg, 'aria-label', [
        `Gear ${gear === '—' ? 'unavailable' : gear}`,
        `Speed ${number(v.speedKph, ' kilometres per hour')}`,
        `Engine speed ${number(v.rpm, ' RPM')}`,
        `Throttle ${number(v.throttleFraction == null ? null : v.throttleFraction * 100, ' percent')}`,
        `Brake ${number(v.brakeFraction == null ? null : v.brakeFraction * 100, ' percent')}`,
        `Fuel ${number(v.fuelLitres, ' litres')}`,
        ...(this.states.fuelOnly ? [] : [`Virtual energy ${number(v.energyPct, ' percent')}`]),
        `Water temperature ${number(temperature(v.coolantC), ` degrees ${temperatureName}`)}`,
        `Oil temperature ${number(temperature(v.oilC), ` degrees ${temperatureName}`)}`,
        `Battery state of charge ${number(v.socPct, ' percent')}`,
        `Hybrid battery activity ${this.states.hybridMode || 'unavailable'}`,
        `Headlights ${this.states.headlights == null ? 'unknown' : this.states.headlights ? 'on' : 'off'}`,
        `Pit speed limiter ${this.states.pitLimiter == null ? 'unknown' : this.states.pitLimiter ? 'on' : 'off'}`,
        'Other instruments unavailable'
      ].join('. '));
      const description = this.svg.querySelector('desc');
      if (description) {
        const text = 'Gear, speed in kilometres per hour, engine speed, driver inputs, fuel, ' +
          (this.states.fuelOnly ? '' : 'virtual energy, ') +
          'water and oil temperatures, battery charge and activity, headlights and pit limiter. Other instruments are unavailable.';
        if (description.textContent !== text) description.textContent = text;
      }
    }

    describeStateOfCharge() {
      const soc = this.values.socPct;
      this.describePart('hybrid-flow', soc == null ? 'Battery state of charge unavailable' :
        `Battery state of charge ${Math.round(soc)} percent`, {'data-value': soc, 'data-hud-meaning': 'battery-soc'});
      // Remove stale activity metadata when reopening an export from the earlier mapping.
      const arc = this.parts.get('hybrid-flow');
      if (arc) arc.removeAttribute('data-state');
    }

    describeHybridActivity() {
      const mode = this.states.hybridMode;
      for (const id of ['battery', 'battery-soc']) {
        this.describePart(id, mode == null ? 'Hybrid battery activity unavailable' : `Hybrid battery activity ${mode}`,
          {'data-state': mode, 'data-hud-meaning': 'hybrid-activity'});
        const part = this.parts.get(id);
        if (part) part.removeAttribute('data-value');
      }
      this.setRoleAttribute('battery-deploy-chevrons', 'display', mode === 'deploying' ? 'inline' : 'none');
      this.setRoleAttribute('battery-charge-chevrons', 'display', mode === 'charging' ? 'inline' : 'none');
      // Older drawings may retain the retired proportional rectangle; never display it.
      this.setRoleAttribute('battery-soc-fill', 'display', 'none');
    }

    describeTyreSurface(wheel) {
      const surface = this.states.tyreSurface[wheel], literal = this.states.tyreSurfaceRgb[wheel];
      const celsius = this.states.tyreSurfaceCelsius[wheel], aggregate = this.states.tyreThermal[wheel];
      const health = this.states.tyreHealth[wheel];
      const known = aggregate != null || SURFACE_ZONES.some(zone => surface[zone] != null || literal[zone] != null || celsius[zone] != null) ||
        health.flat != null || health.detached != null || health.wearFractionRaw != null;
      const zones = SURFACE_ZONES.map(zone => celsius[zone] != null ?
        `${zone} ${celsius[zone].toFixed(1)} degrees Celsius` : literal[zone] != null ?
          `${zone} literal paint with source temperature unavailable` : surface[zone] != null ?
            `${zone} ${Math.round(surface[zone] * 100)} percent disconnected-preview tint` : aggregate != null ?
              `${zone} aggregate fallback ${Math.round(aggregate * 100)} percent` : `${zone} unknown`);
      const fault = health.detached === true ? 'detached' : health.flat === true ? 'flat' :
        health.flat === false && health.detached === false ? 'no tyre fault observed' : 'tyre fault state unknown';
      const wearWarning = health.detached !== true && health.wearFractionRaw != null && health.wearFractionRaw < 0.05
        ? '; tyre wear below 5 percent remaining' : '';
      const profile = this.states.tyreSurfaceProfile[wheel];
      const calibration = !profile || !SURFACE_ZONES.some(zone => celsius[zone] != null) ? ''
        : profile.mode === 'matched-empirical-profile' ? '; colours from a matching recorded surface profile'
          : '; empirical reference colours, class and compound surface calibration pending';
      this.describePart(`vehicle-tyre-${wheel}`,
        `${WHEELS[wheel]} tyre surface paint, ${zones.join(', ')}; ${fault}${wearWarning}${calibration}`, {
          'data-state': known ? 'available' : 'unknown',
          'data-thermal-fraction': aggregate,
          'data-surface-inner-celsius': celsius.inner,
          'data-surface-middle-celsius': celsius.middle,
          'data-surface-outer-celsius': celsius.outer,
          'data-flat': health.flat,
          'data-detached': health.detached,
          'data-wear-fraction-raw': health.wearFractionRaw,
          'data-surface-profile': profile && profile.profileId,
          'data-surface-calibration': profile && profile.mode,
          'data-vehicle-class-raw': profile && profile.vehicleClassRaw,
          'data-compound-raw': profile && profile.compoundRaw,
          'data-hud-meaning': 'tyre-surface-paint'
        });
    }

    renderStates() {
      if (this.deferRender) return;
      const s = this.states;
      for (const [key, part, label] of [
        ['pitLimiter', 'speed-limiter', 'Pit speed limiter'], ['headlights', 'headlights', 'Headlights'],
        ['telemetryRecording', 'traction-chip', 'Telemetry recording']
      ]) {
        const state = s[key] == null ? 'unknown' : s[key] ? 'on' : 'off';
        this.describePart(part, `${label} ${state}`, {'data-state': state});
      }
      SHIFT_PARTS.forEach((part, index) => {
        const value = s.shiftLights[index], state = value == null ? 'unknown' : value ? 'on' : 'off';
        const mode = s.shiftLightMode == null ? 'mode unknown' : `${s.shiftLightMode} mode`;
        this.describePart(part, `${['Left', 'Centre', 'Right'][index]} upshift indicator ${state}, ${mode}`,
          {'data-state': state, 'data-shift-light-mode': s.shiftLightMode, 'data-hud-meaning': 'upshift-indicator'});
      });
      for (const [part, value, label] of [
        ['engine', s.engineDamage, 'Engine damage'],
        ...Object.entries(DAMAGE_PARTS).map(([key, id]) => [id, s.damage[key], `${key[0].toUpperCase() + key.slice(1)} damage`]),
        ...Object.entries(WHEELS).map(([wheel, label]) => [`vehicle-glyph-${wheel}`, s.suspensionDamage[wheel], `${label} suspension damage`])
      ]) {
        if (part === 'vehicle-lower-bar') continue;
        if (part === 'engine' && this.engineWarningBound) {
          const overheating = s.oilTemperature?.overheatingRaw === 1;
          this.describePart(part, s.engineWarning === true ? 'Engine warning on'
            : overheating ? 'Engine overheating warning'
              : s.engineWarning == null ? 'Engine warning data unavailable' : 'Engine warning off',
            {'data-hud-meaning': 'engine-warning'});
          const engine = this.parts.get(part);
          engine?.removeAttribute('data-damage');
          if (s.engineWarning == null && !overheating) engine?.removeAttribute('data-state');
          else setAttribute(engine, 'data-state', s.engineWarning === true || overheating ? 'on' : 'off');
          continue;
        }
        // Raw body positions and raw suspension supply the final description.
        // Do not briefly write their older categorical description first.
        const rawSuspension = Object.keys(WHEELS).some(wheel => part === `vehicle-glyph-${wheel}` && s.suspensionRawFraction[wheel] != null);
        if (rawSuspension || BODY_POSITIONS.some(([id]) => id === part)) {
          setAttribute(this.parts.get(part), 'data-damage', value == null ? 'unknown' : value);
          continue;
        }
        this.describePart(part, `${label} ${value == null ? 'unknown' : value}`,
          {'data-state': value, 'data-damage': value});
      }
      this.describePart('vehicle-lower-bar', s.wingState ? `Rear wing ${s.wingState}` : 'Rear wing data unavailable',
        s.wingState == null ? {'data-hud-meaning': 'rear-wing-presence'} : {'data-state': s.wingState, 'data-hud-meaning': 'rear-wing-presence'});
      // No source group means no physical-state attribute, not a third state.
      if (s.wingState == null) this.parts.get('vehicle-lower-bar')?.removeAttribute('data-state');
      for (const parent of new Set(BODY_POSITIONS.map(([id]) => id))) {
        const descriptions = [];
        BODY_POSITIONS.forEach(([id, label], index) => {
          if (id !== parent) return;
          const value = s.bodyPositions && s.bodyPositions[index];
          const state = bodyDentKnown(value) ? ['muted damage indicator', 'yellow damage indicator', 'orange damage indicator'][value] : 'unknown';
          descriptions.push(`${label} bodywork ${state}`);
          const path = this.roles[`body-position-${index}`];
          if (path) {
            setAttribute(path, 'data-dent-code', value == null ? 'unknown' : String(value));
            setAttribute(path, 'data-state', state);
            setAttribute(path, 'aria-label', `${label} bodywork ${state}`);
          }
        });
        const known = s.bodyPositions != null && BODY_POSITIONS.some(([id], index) =>
          id === parent && bodyDentKnown(s.bodyPositions[index]));
        this.describePart(parent, descriptions.join('; '), {
          'data-state': known ? 'available' : 'unknown', 'data-hud-meaning': 'body-dent-positions'});
      }
      for (const wheel of Object.keys(WHEELS)) {
        const fraction = s.suspensionRawFraction[wheel];
        const severity = s.suspensionSeverity[wheel];
        const glyph = this.parts.get(`vehicle-glyph-${wheel}`);
        if (glyph && fraction == null) {
          glyph.removeAttribute('data-suspension-severity');
          glyph.removeAttribute('data-raw-fraction');
        }
        if (fraction != null) this.describePart(`vehicle-glyph-${wheel}`,
          `${WHEELS[wheel]} suspension ${severity === 'none' ? 'undamaged' : severity == null ? 'damage unavailable' : severity + ' damage'}`,
          {'data-state': s.tyreHealth[wheel].detached === true ? 'detached' : severity,
            'data-suspension-severity': severity, 'data-raw-fraction': fraction, 'data-hud-meaning': 'suspension-damage'});
      }
      for (const [key, prefix, kind] of [
        ['tyreThermal', 'vehicle-tyre-', 'tyre'], ['brakeThermal', 'vehicle-inset-', 'brake']
      ]) {
        for (const [wheel, label] of Object.entries(WHEELS)) {
          if (key === 'tyreThermal') { this.describeTyreSurface(wheel); continue; }
          if (s.brakeCelsius[wheel] != null) {
            const celsius = s.brakeCelsius[wheel];
            const fahrenheit = this.temperatureUnit === 'F';
            const shown = fahrenheit ? celsius * 9 / 5 + 32 : celsius;
            this.describePart(prefix + wheel, `${label} brake temperature ${shown.toFixed(1)} degrees ${fahrenheit ? 'Fahrenheit' : 'Celsius'}`,
              {'data-state': 'temperature', 'data-temperature-celsius': celsius, 'data-thermal-fraction': null});
            continue;
          }
          const value = s[key][wheel];
          this.describePart(prefix + wheel, value == null ? `${label} ${kind} thermal tint unknown` :
            `${label} ${kind} thermal tint ${Math.round(value * 100)} percent on the normalized colour scale`,
          {'data-state': value == null ? 'unknown' : 'normalized', 'data-thermal-fraction': value, 'data-temperature-celsius': null});
        }
      }
      this.describeHybridActivity();
    }

    // One admitted sample commits after values, states and literal paint agree.
    // Intermediate categorical resets must never reach the displayed DOM.
    updateLive(values, states, paint, unit) {
      this.deferRender = true;
      try {
        this.setTemperatureUnit(unit);
        this.setValues(values);
        this.setStates(states);
        this.setRawPaint(paint);
      } finally {
        this.deferRender = false;
      }
      this.renderValues();
      this.renderStates();
      this.renderLayers();
      if (this.svg.getAttribute('data-availability') !== 'live') this.svg.setAttribute('data-availability', 'live');
      return true;
    }

    clear() {
      this.values = {...EMPTY_VALUES};
      this.states = unknownStates();
      this.neutralized.clear();
      for (const [id, element] of this.parts) {
        if (element.getAttribute('data-category') !== 'Structure') this.neutralized.add(id);
      }
      this.renderValues();
      this.renderStates();
      this.renderLayers();
      this.svg.setAttribute('data-availability', 'unavailable');
    }


    // A complete normalized frame is expected. Missing measurements/states become unknown.
    // V1 envelopes remain accepted; V2 adds semantic states and independent input/SoC values.
    applyFrame(frame) {
      if (!isObject(frame) || frame.type !== 'lmu-hud-frame' ||
          (frame.version !== 1 && frame.version !== 2) || !isObject(frame.values)) return false;
      this.clear();
      this.setValues(frame.values);
      if (isObject(frame.states)) this.setStates(frame.states);
      if (isObject(frame.layers)) {
        // Restoring saved preferences cannot supply a missing measurement/state.
        // Direct setLayer edits remain available to the disconnected drawing API.
        const unavailable = new Set(this.neutralized);
        for (const [id, patch] of Object.entries(frame.layers)) this.setLayer(id, patch);
        this.neutralized = unavailable;
      }
      // Core readouts use explicit unknown markers and remain readable. This never
      // re-enables a user-disabled colour or makes an explicitly hidden layer visible.
      for (const id of CORE_READOUTS) this.neutralized.delete(id);
      this.renderLayers();
      this.svg.setAttribute('data-availability', 'frame');
      return true;
    }

    getState() {
      return {version: 2, values: {...this.values}, states: copy(this.states), layers: copy(this.layers)};
    }

    exportSvg() {
      const clone = this.svg.cloneNode(true);
      clone.querySelectorAll('[data-editor-only]').forEach(el => el.remove());
      clone.style.opacity = '';
      clone.style.display = '';
      const description = clone.querySelector('desc');
      if (description) description.textContent = 'Editable vector HUD exported with the currently displayed preview values, semantic states, and layer settings. This export does not certify telemetry provenance.';
      return new XMLSerializer().serializeToString(clone);
    }
  }

  LMUHud.defaultShiftLightThresholds = DEFAULT_SHIFT_LIGHT_THRESHOLDS;
  global.LMUHud = LMUHud;
})(window);
