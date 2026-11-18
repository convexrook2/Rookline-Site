// lmu-live-drive-presentation.js - Drive DOM rendering for caller-admitted HUDs; no polling or lifecycle state.
(function () {
    'use strict';

    window.RooklineLmuLiveDrivePresentation = function (options) {
    var byId = options.byId;
    var setText = options.setText;
    var setHidden = options.setHidden;
    var setObservationState = options.setObservationState;
    var isText = options.isText;
    var isFiniteNumber = options.isFiniteNumber;
    var liveRenderClock = options.liveRenderClock;
    var hudLease = options.hudLease;
    var contextMatchesHud = options.contextMatchesHud;
    var isIsoTimestamp = options.isIsoTimestamp;
    var trackPresentation = options.trackPresentation;
    var retireVirtualEnergyPresentation = options.retireVirtualEnergyPresentation;
    var detachedWheelCorners = new Set();
    var tyrePanel = window.RooklineLmuLiveTyresPanel
        ? window.RooklineLmuLiveTyresPanel({ byId: byId, setText: setText, isFiniteNumber: isFiniteNumber, isText: isText })
        : null;
    var layeredHud = null;
    var layeredHudLease = '';
    var layeredHudMountStarted = false;
    var manufacturerAppearance = null;
    var manufacturerAppearanceFailed = false;
    function mountManufacturerAppearance() {
        if (manufacturerAppearanceFailed || !window.RooklineLmuDriveManufacturerAppearance) return;
        try {
            if (!manufacturerAppearance) manufacturerAppearance = window.RooklineLmuDriveManufacturerAppearance.create();
            if (manufacturerAppearance && layeredHud) manufacturerAppearance.attach(layeredHud.svg);
        } catch (_) {
            // Optional paint must never replace the working mounted HUD.
            manufacturerAppearanceFailed = true;
        }
    }
    function observeAppearanceCar(car) {
        mountManufacturerAppearance();
        if (manufacturerAppearance) manufacturerAppearance.observeCar(car);
    }
    mountManufacturerAppearance();
    function setDataset(element, key, value) {
        if (element.dataset[key] !== value) element.dataset[key] = value;
    }
    function setAttribute(element, key, value) {
        if (element.getAttribute(key) !== String(value)) element.setAttribute(key, String(value));
    }

    function mountLayeredHud() {
        var mount = byId('lmuLiveDriveLayeredHudMount');
        if (!mount || layeredHudMountStarted) return Promise.resolve();
        layeredHudMountStarted = true;
        // Only this fixed local drawing is loaded. No telemetry is requested here.
        return window.fetch('../speedometer/speedo.svg', { credentials: 'same-origin' })
            .then(function (response) {
                if (!response.ok) throw new Error('HUD drawing unavailable');
                return response.text();
            })
            .then(function (source) {
                var parsed = new DOMParser().parseFromString(source, 'image/svg+xml');
                var svg = parsed.documentElement;
                if (parsed.querySelector('parsererror') || svg.localName !== 'svg'
                    || svg.namespaceURI !== 'http://www.w3.org/2000/svg') throw new Error('Invalid HUD drawing');
                var detached = document.importNode(svg, true);
                var component = new window.LMUHud(detached);
                component.clear();
                // The approved drawing is complete; mounting never replaces or redraws artwork.
                detached.querySelector('title').textContent = 'Current driving HUD';
                // The controller owns the description, including fuel-only visibility.
                // Never replay a pre-load sample. HOLD/retirement cannot make the
                // completed asset load revive old data or interpolation.
                layeredHudLease = '';
                mount.replaceChildren(detached);
                layeredHud = component;
                mountManufacturerAppearance();
            })
            .catch(function () {
                mount.textContent = 'Driving instruments unavailable';
            });
    }

    function renderLayeredHud(hud, gameUnitsRaw, discreteContext, vehicleModelRaw) {
        mountManufacturerAppearance();
        if (manufacturerAppearance) manufacturerAppearance.observeHud(hud);
        if (!layeredHud) return;
        var adapter = window.RooklineLmuDrivingHudAdapter;
        if (adapter && typeof adapter.build === 'function' && typeof adapter.apply === 'function') {
            adapter.apply(layeredHud, adapter.build(hud, discreteContext, gameUnitsRaw, undefined, vehicleModelRaw));
            layeredHudLease = hudLease(hud);
            if (layeredHud.svg.getAttribute('data-availability') !== 'live') layeredHud.svg.setAttribute('data-availability', 'live');
            return;
        }
        // The local test fixture loads the base controller without the optional
        // adapter. Keep the existing admitted basic projection as its fallback.
        var player = hud.player;
        layeredHud.setTemperatureUnit(gameUnitsRaw === 1 ? 'F' : 'C');
        layeredHud.setValues({
            gear: player.gear,
            speedKph: player.speedKph,
            rpm: player.rpm,
            rpmFraction: window.LMUHud.rpmArcFraction(player.rpm, player.maxRpm),
            throttleFraction: player.throttleFraction,
            brakeFraction: player.brakeFraction,
            fuelLitres: player.fuelLitres,
            fuelFraction: player.fuelCapacityLitres > 0 ? player.fuelLitres / player.fuelCapacityLitres : null,
            energyPct: isFiniteNumber(player.virtualEnergyFraction) ? player.virtualEnergyFraction * 100 : null,
            coolantC: player.waterTemperatureCelsius,
            oilC: player.oilTemperatureCelsius,
            socPct: isFiniteNumber(player.batteryChargeFraction) && player.batteryChargeFraction >= 0 && player.batteryChargeFraction <= 1
                ? player.batteryChargeFraction * 100 : null
        });
        // Installed SDK: 0 unavailable, 1 inactive, 2 propulsion, 3 regeneration.
        // Motor state supplies activity only, never charge or a flow magnitude.
        layeredHud.setStates({
            shiftLightMode: 'rpm',
            hybridMode: player.electricBoostMotorStateRaw === 1 ? 'idle'
                : player.electricBoostMotorStateRaw === 2 ? 'deploying'
                : player.electricBoostMotorStateRaw === 3 ? 'charging' : null,
            headlights: player.headlightsRaw === 0 ? false : player.headlightsRaw === 1 ? true : null,
            pitLimiter: player.speedLimiterRaw === 0 ? false : player.speedLimiterRaw === 1 ? true : null
        });
        layeredHudLease = hudLease(hud);
        layeredHud.svg.setAttribute('data-availability', 'live');
    }

    function clearLayeredHud() {
        layeredHudLease = '';
        if (layeredHud) layeredHud.clear();
    }

    function markHudUnavailable() {
        clearLayeredHud();
        var meter = byId('lmuLiveHudSteering');
        if (!meter) return;
        meter.removeAttribute('aria-valuenow');
        meter.setAttribute('aria-valuetext', 'Unavailable');
    }

    function gameUnitsForHud(units, context, hud) {
        if (!units || typeof units !== 'object' || Array.isArray(units)
            || !context || !hud || !contextMatchesHud(context, hud)
            || units.source !== '/rest/options/settings'
            || (units.currentValueRaw !== 0 && units.currentValueRaw !== 1)
            || units.runtimeGeneration !== hud.runtimeGeneration
            || units.sharedSessionIndex !== hud.sharedSessionIndex
            || !isIsoTimestamp(units.capturedUtc)
            || Date.parse(units.capturedUtc) > Date.parse(context.capturedUtc)) return null;
        return { raw: units.currentValueRaw, hudLeaseKey: hudLease(hud) };
    }

    function renderDrivingInstruments(hud, gameUnitsRaw, discreteContext, garageOwnsTyres, vehicleModelRaw) {
        var player = hud.player;
        renderSessionClock(hud);
        // Reuse the caller's existing Garage wheel-owner boundary for the
        // compact drawing; retained on-car samples cannot describe fitted tyres.
        var drawingHud = garageOwnsTyres ? Object.assign({}, hud, { tyres: [] }) : hud;
        renderLayeredHud(drawingHud, gameUnitsRaw, discreteContext, vehicleModelRaw);
        setText('lmuLiveHudCurrentLap', formatLapTime(player.currentLapTimeSeconds));
        setText('lmuLiveHudLastLap', formatLapTime(player.lastLapTimeSeconds));
        setText('lmuLiveHudBestLap', formatLapTime(player.bestLapTimeSeconds));
        setText('lmuLiveHudSector1', formatLapTime(player.currentSector1Seconds));
        setText('lmuLiveHudSector2', formatLapTime(player.currentSector2Seconds));
        setText('lmuLiveHudSector3', formatLapTime(player.currentSector3Seconds));
    }

    function weatherView(weather, schema) {
        if (!weather || typeof weather !== 'object' || Array.isArray(weather)
            || weather.schemaVersion !== schema
            || String(weather.state || '').trim().toLowerCase() !== 'available'
            || !Array.isArray(weather.forecast)) return null;
        var forecast = Array.isArray(weather.forecast) ? weather.forecast.slice(0, 5) : [];
        while (forecast.length < 5) forecast.push(null);
        return { forecast: forecast };
    }

    function mountTyresPanel() {
        return tyrePanel ? tyrePanel.mount() : Promise.resolve();
    }

    function clearTyresPanel() {
        if (tyrePanel) tyrePanel.clear();
    }

    function renderGarageFittedTyres(tyres) {
        return tyrePanel ? tyrePanel.renderGarageFitted(tyres) : false;
    }

    function renderGaragePendingTyres() {
        return tyrePanel ? tyrePanel.renderGaragePending() : false;
    }

    function renderFittedOnlyTyres(tyres) {
        return tyrePanel ? tyrePanel.renderFittedOnly(tyres) : false;
    }

    function clearCompound(state, label) {
        setText('lmuLiveDriveFrontLeftTyre', '—');
        setText('lmuLiveDriveFrontRightTyre', '—');
        setText('lmuLiveDriveRearLeftTyre', '—');
        setText('lmuLiveDriveRearRightTyre', '—');
        setText('lmuLiveDriveFrontLeftTyreCondition', '—');
        setText('lmuLiveDriveFrontRightTyreCondition', '—');
        setText('lmuLiveDriveRearLeftTyreCondition', '—');
        setText('lmuLiveDriveRearRightTyreCondition', '—');
        ['FrontLeft', 'FrontRight', 'RearLeft', 'RearRight'].forEach(function (corner) {
            setText('lmuLiveHud' + corner + 'Temp', '—');
            setText('lmuLiveHud' + corner + 'Detail', '—');
            setText('lmuLiveHudCarStatus' + corner + 'Temp', '—');
        });
        ['front-left', 'front-right', 'rear-left', 'rear-right'].forEach(function (corner) {
            setCarStatusCompound(corner, null);
        });
        clearWheelStatePresentation();
        setObservationState('lmuLiveDriveTyres', 'lmuLiveDriveTyresState', state, label);
    }

    function wheelCornerLabel(corner) {
        return {
            'front-left': 'Front left',
            'front-right': 'Front right',
            'rear-left': 'Rear left',
            'rear-right': 'Rear right'
        }[corner] || 'Wheel';
    }

    function wheelCornerSuffix(corner) {
        return corner.split('-').map(function (part) {
            return part.charAt(0).toUpperCase() + part.slice(1);
        }).join('');
    }

    function wheelPieceState(value, trueState, falseState) {
        if (value === true) return trueState;
        if (value === false) return falseState;
        return 'unknown';
    }

    function setCarStatusCompound(corner, compound) {
        var element = byId('lmuLiveHudCarStatus' + wheelCornerSuffix(corner));
        if (!element) return;
        var name = isText(compound) ? compound.trim().toLowerCase() : '';
        setDataset(element, 'compound', ['soft', 'medium', 'hard', 'wet'].includes(name) ? name : 'unknown');
    }

    function wheelStateDescription(corner, wheelState) {
        var flat = wheelState && wheelState.flat;
        var detached = wheelState && wheelState.detached;
        var tyreText = flat === true ? 'tyre flat'
            : flat === false ? 'tyre not flat'
                : 'tyre state unavailable';
        var wheelText = detached === true ? 'wheel detached'
            : detached === false ? 'wheel not detached'
                : 'wheel state unavailable';
        return wheelCornerLabel(corner) + ': ' + tyreText + '; ' + wheelText;
    }

    function syncWarningPulsePhase(element) {
        if (!element || typeof element.getAnimations !== 'function') return;
        var timeline = element.ownerDocument && element.ownerDocument.timeline;
        if (!timeline) return;
        // The existing text/card warnings join the same phase as both SVGs.
        // This is presentation timing only, with no timer or lifecycle authority.
        element.getAnimations({ subtree: true }).forEach(function (animation) {
            if (animation.animationName === 'lmu-live-flat-warning-pulse' && animation.timeline === timeline
                && animation.playState !== 'paused' && animation.startTime !== 0) animation.startTime = 0;
        });
    }

    function renderCarStatusCorner(corner, wheelState) {
        var element = byId('lmuLiveHudCarStatus' + wheelCornerSuffix(corner));
        if (!element) return;
        var flat = wheelState && wheelState.flat;
        var detached = wheelState && wheelState.detached;
        setDataset(element, 'tyreState', wheelPieceState(flat, 'flat', 'not-flat'));
        setDataset(element, 'linkState', wheelPieceState(detached, 'detached', 'not-detached'));
        setDataset(element, 'wheelState', detached === true ? 'detached'
            : flat === true ? 'flat'
                : flat === false && detached === false ? 'not-flat-not-detached' : 'unknown');
        var temperature = byId('lmuLiveHud' + wheelCornerSuffix(corner) + 'Temp');
        var temperatureText = temperature && temperature.textContent !== '—'
            ? 'estimated rubber temperature ' + temperature.textContent
            : 'estimated rubber temperature unavailable';
        var label = wheelStateDescription(corner, wheelState) + '; ' + temperatureText;
        if (element.getAttribute('aria-label') !== label) element.setAttribute('aria-label', label);
        syncWarningPulsePhase(element);
    }

    function clearWheelStatePresentation() {
        detachedWheelCorners.clear();
        ['front-left', 'front-right', 'rear-left', 'rear-right'].forEach(function (corner) {
            var suffix = wheelCornerSuffix(corner);
            var element = byId('lmuLiveHud' + suffix + 'WheelState');
            if (element) {
                element.hidden = true;
                element.dataset.wheelState = 'none';
                element.textContent = '—';
            }
            renderCarStatusCorner(corner, null);
        });
        setText('lmuLiveHudWheelStateAnnouncement', '');
    }

    function renderWheelState(corner, wheelState) {
        var suffix = wheelCornerSuffix(corner);
        var element = byId('lmuLiveHud' + suffix + 'WheelState');
        var detached = wheelState && wheelState.detached === true;
        var flat = wheelState && wheelState.flat === true;
        renderCarStatusCorner(corner, wheelState);
        var wasDetached = detachedWheelCorners.has(corner);
        if (detached) detachedWheelCorners.add(corner);
        else detachedWheelCorners.delete(corner);
        if (detached && !wasDetached) {
            setText('lmuLiveHudWheelStateAnnouncement', wheelCornerLabel(corner) + ' wheel detached');
        }
        if (!element) return;
        var state = detached ? 'detached' : flat ? 'flat' : 'none';
        var label = detached && flat ? 'Detached · Flat' : detached ? 'Detached' : flat ? 'Flat' : '';
        if (element.hidden !== !label) element.hidden = !label;
        setDataset(element, 'wheelState', state);
        if (element.textContent !== (label || '—')) element.textContent = label || '—';
        syncWarningPulsePhase(element);
    }

    function clearElectronics(state, label) {
        setText('lmuLiveDriveTcLevel', '—');
        setText('lmuLiveDriveTcSlip', '—');
        setText('lmuLiveDriveTcCut', '—');
        setText('lmuLiveDriveAbsLevel', '—');
        setHidden('lmuLiveDriveTcIntervening', true);
        setHidden('lmuLiveDriveAbsIntervening', true);
        setHidden('lmuLiveDriveInterventions', true);
        setObservationState('lmuLiveDriveElectronics', 'lmuLiveDriveElectronicsState', state, label);
    }

    function clearWeather(state, label) {
        var helper = window.RooklineLivePresentation;
        if (helper && typeof helper.renderLmuWeatherStrip === 'function') {
            helper.renderLmuWeatherStrip(null, {
                current: byId('lmuLiveDriveCurrentWeather'),
                forecast: byId('lmuLiveDriveForecast'),
                accessible: byId('lmuLiveDriveWeatherDescription'),
            });
        } else {
            setText('lmuLiveDriveCurrentWeather', 'Current weather unavailable');
            replaceChildren('lmuLiveDriveForecast', []);
        }
        setObservationState('lmuLiveDriveWeather', 'lmuLiveDriveWeatherState', state, label);
    }

    function replaceChildren(id, children) {
        var element = byId(id);
        if (element) element.replaceChildren.apply(element, children || []);
    }

    function renderElectronics(observation) {
        setText('lmuLiveDriveTcLevel', String(observation.controls.tcLevel));
        setText('lmuLiveDriveTcSlip', String(observation.controls.tcSlipAngle));
        setText('lmuLiveDriveTcCut', String(observation.controls.tcCut));
        setText('lmuLiveDriveAbsLevel', String(observation.controls.absLevel));
        var tcActive = observation.tcIntervention === 'observed-active';
        var absActive = observation.absIntervention === 'observed-active';
        setHidden('lmuLiveDriveTcIntervening', !tcActive);
        setHidden('lmuLiveDriveAbsIntervening', !absActive);
        setHidden('lmuLiveDriveInterventions', !tcActive && !absActive);
        setObservationState('lmuLiveDriveElectronics', 'lmuLiveDriveElectronicsState', 'available', 'Current');
    }

    function formatClock(seconds) {
        if (!isFiniteNumber(seconds) || seconds < 0) return '—';
        // LMU presents a positive fractional remainder as the second still in
        // progress. Flooring it makes Drive visibly one second behind LMU.
        var whole = Math.ceil(seconds);
        var hours = Math.floor(whole / 3600);
        var minutes = Math.floor((whole % 3600) / 60);
        var remainder = whole % 60;
        return (hours > 0 ? hours + ':' + String(minutes).padStart(2, '0') : String(minutes))
            + ':' + String(remainder).padStart(2, '0');
    }

    function renderSessionClock(hud) {
        // Installed LMU InternalsPlugin.hpp: numeric 8 is Session over.
        // Session context never establishes an individual participant result.
        var finished = !!hud && hud.gamePhaseRaw === 8;
        var banner = byId('lmuLiveHudSessionBanner');
        if (banner) {
            setDataset(banner, 'finished', String(finished));
            setAttribute(banner, 'aria-label', finished ? 'Session finished' : 'Live session timing');
        }
        setHidden('lmuLiveHudSessionFinish', !finished);
        // Keep the ordinary clock's layout reservation underneath the takeover.
        // CSS visibility and aria-hidden remove it from view and accessibility.
        ['lmuLiveHudSessionType', 'lmuLiveHudSessionRemaining', 'drivingSessionPill'].forEach(function (id) {
            var element = byId(id);
            if (element) setAttribute(element, 'aria-hidden', String(finished));
        });
        setText('lmuLiveHudSessionType', hud ? hud.sessionType || String(hud.sessionCode) : '—');
        setText('lmuLiveHudSessionRemaining', hud ? formatClock(hud.sessionTimeRemainingSeconds) : '—');
    }

    function formatLapTime(seconds) {
        if (!isFiniteNumber(seconds) || seconds <= 0) return '—';
        var minutes = Math.floor(seconds / 60);
        return minutes + ':' + (seconds - minutes * 60).toFixed(3).padStart(6, '0');
    }

    function displayGear(value) {
        if (value < 0) return 'R';
        if (value === 0) return 'N';
        return String(value);
    }

    function renderPlayerVirtualEnergy(player) {
        if (layeredHud) layeredHud.setValues({
            energyPct: player && isFiniteNumber(player.virtualEnergyFraction) ? player.virtualEnergyFraction * 100 : null
        });
    }

    function setPercentWidth(id, fraction) {
        var element = byId(id);
        if (!element) return;
        var bounded = Math.max(0, Math.min(1, isFiniteNumber(fraction) ? fraction : 0));
        // Transform-only meter motion avoids forcing layout on every display
        // frame while the exact numeric text remains source-sample driven.
        var transform = 'scaleX(' + bounded.toFixed(3) + ')';
        if (element.style.transform !== transform) element.style.transform = transform;
        var percent = Math.round(bounded * 100);
        setAttribute(element, 'aria-valuenow', String(percent));
        setAttribute(element, 'aria-valuetext', percent + '%');
    }

    function setSignedPercentWidth(id, fraction) {
        var element = byId(id);
        if (!element) return;
        var clock = liveRenderClock();
        var bounded = clock && typeof clock.signedMeterScale === 'function'
            ? clock.signedMeterScale(fraction)
            : 0;
        // The steering element occupies the right half of its track. A signed
        // scale keeps zero at centre and mirrors negative input to the left.
        var transform = 'scaleX(' + bounded.toFixed(3) + ')';
        if (element.style.transform !== transform) element.style.transform = transform;
        var percent = Math.round(bounded * 100);
        setAttribute(element, 'aria-valuenow', String(percent));
        setAttribute(element, 'aria-valuetext', percent === 0
            ? 'Centered (0%)'
            : (percent < 0 ? 'Left ' : 'Right ') + Math.abs(percent) + '%');
    }

    function renderRelative(hud) {
        var panels = window.RooklineLmuLiveStandingPanels;
        if (panels) panels.renderRelative(hud);
    }

    function formatTyreTemperature(celsius, gameUnitsRaw) {
        if (!isFiniteNumber(celsius)) return '—';
        var fahrenheit = gameUnitsRaw === 1;
        var value = fahrenheit ? celsius * 1.8 + 32 : celsius;
        return value.toFixed(0) + (fahrenheit ? ' °F' : ' °C');
    }

    function displayedTyreTemperature(display, fallbackCelsius, gameUnitsRaw) {
        var valueC = display && isFiniteNumber(display.valueC) ? display.valueC : fallbackCelsius;
        var text = formatTyreTemperature(valueC, gameUnitsRaw);
        return display && display.mode === 'held-detached'
            ? text + ' · last known, detached'
            : text;
    }

    function tyreDetail(tyre, gameUnitsRaw) {
        var parts = [];
        var wheel = tyre && tyre.wheelState;
        if (wheel && isFiniteNumber(wheel.pressureKpa)) parts.push(wheel.pressureKpa.toFixed(0) + ' kPa');
        if (wheel && isFiniteNumber(wheel.brakeTemperatureCelsius)) {
            parts.push('Brake ' + formatTyreTemperature(wheel.brakeTemperatureCelsius, gameUnitsRaw));
        }
        return parts.length ? parts.join(' · ') : '—';
    }

    function renderHudTyres(tyres, gameUnitsRaw, hudContext, discreteContext) {
        var ids = {
            'front-left': ['FrontLeft', 'lmuLiveDriveFrontLeftTyre', 'lmuLiveDriveFrontLeftTyreCondition'],
            'front-right': ['FrontRight', 'lmuLiveDriveFrontRightTyre', 'lmuLiveDriveFrontRightTyreCondition'],
            'rear-left': ['RearLeft', 'lmuLiveDriveRearLeftTyre', 'lmuLiveDriveRearLeftTyreCondition'],
            'rear-right': ['RearRight', 'lmuLiveDriveRearRightTyre', 'lmuLiveDriveRearRightTyreCondition']
        };
        var seen = new Set();
        tyres.forEach(function (tyre) {
            var target = ids[tyre.corner];
            if (!target) return;
            seen.add(tyre.corner);
            setText(target[1], isText(tyre.compound) ? tyre.compound : '—');
            setText(target[2], isFiniteNumber(tyre.conditionPercent)
                ? tyre.conditionPercent.toFixed(0) + '%'
                : '—');
            var temperatureText = formatTyreTemperature(tyre.temperatureCelsius, gameUnitsRaw);
            setText('lmuLiveHud' + target[0] + 'Temp', temperatureText);
            setText('lmuLiveHudCarStatus' + target[0] + 'Temp', temperatureText.replace(/ °[CF]$/, '°'));
            setText('lmuLiveHud' + target[0] + 'Detail', tyreDetail(tyre, gameUnitsRaw));
            setCarStatusCompound(tyre.corner, tyre.compound);
            renderWheelState(tyre.corner, tyre.wheelState);
        });
        Object.keys(ids).forEach(function (corner) {
            if (!seen.has(corner)) {
                setText(ids[corner][1], '—');
                setText(ids[corner][2], '—');
                setText('lmuLiveHud' + ids[corner][0] + 'Temp', '—');
                setText('lmuLiveHud' + ids[corner][0] + 'Detail', '—');
                setText('lmuLiveHudCarStatus' + ids[corner][0] + 'Temp', '—');
                setCarStatusCompound(corner, null);
                renderWheelState(corner, null);
            }
        });
        if (tyres.length === 4) {
            setObservationState('lmuLiveDriveTyres', 'lmuLiveDriveTyresState', 'available', 'Current shared memory');
        }
        // The caller already admitted the HUD lease. The component receives no
        // REST, timer, or retained-frame state of its own.
        var panelResult = tyrePanel ? tyrePanel.render(tyres, gameUnitsRaw, hudContext, discreteContext) : null;
        var displayed = panelResult && panelResult.displayedTemperatures;
        if (displayed) tyres.forEach(function (tyre) {
            var target = ids[tyre.corner];
            if (!target) return;
            var temperatureText = displayedTyreTemperature(displayed[tyre.corner], tyre.temperatureCelsius, gameUnitsRaw);
            setText('lmuLiveHud' + target[0] + 'Temp', temperatureText);
            setText('lmuLiveHudCarStatus' + target[0] + 'Temp', temperatureText.replace(/ °[CF]( · .*)?$/, '°'));
            renderCarStatusCorner(tyre.corner, tyre.wheelState);
        });
    }

    function interpolatedPlayerValue(previous, current, key, progress) {
        var currentValue = current && current.player ? current.player[key] : null;
        if (!isFiniteNumber(currentValue)) return null;
        var previousValue = previous && previous.player ? previous.player[key] : null;
        return isFiniteNumber(previousValue)
            ? previousValue + (currentValue - previousValue) * progress
            : currentValue;
    }

    function renderHudPresentation(previous, hud, progress) {
        // The 20 Hz LMU sample stays the source cadence. Only values with two
        // exact samples in the same lease are smoothed for the 60 FPS paint;
        // labels and numbers remain the latest raw sample and never predict.
        var sameLease = previous && hudLease(previous) === hudLease(hud);
        var from = sameLease ? previous : null;
        var player = hud.player;
        var rpm = interpolatedPlayerValue(from, hud, 'rpm', progress);
        var throttle = interpolatedPlayerValue(from, hud, 'throttleFraction', progress);
        var brake = interpolatedPlayerValue(from, hud, 'brakeFraction', progress);
        var steering = interpolatedPlayerValue(from, hud, 'steeringFraction', progress);
        var fuel = interpolatedPlayerValue(from, hud, 'fuelLitres', progress);
        setSignedPercentWidth('lmuLiveHudSteering', steering);
        if (layeredHud && layeredHudLease === hudLease(hud)) layeredHud.renderGeometry({
            rpmFraction: window.LMUHud.rpmArcFraction(rpm, player.maxRpm),
            throttleFraction: throttle,
            brakeFraction: brake,
            fuelFraction: player.fuelCapacityLitres > 0 ? fuel / player.fuelCapacityLitres : null
        });
        trackPresentation.renderVehicleGeometry(hud, from, progress);
    }

    function countLapLabel(value) {
        var labels = {
            'do-not-count-lap-or-time': 'Does not count lap or time',
            'count-lap-but-not-time': 'Counts lap, not time',
            'count-lap-and-time': 'Counts lap and time'
        };
        return labels[value] || 'Unavailable';
    }

    function pitStateLabel(lap) {
        var labels = {
            requested: 'Pit stop requested',
            entering: 'Entering pit lane',
            stopped: 'Stopped in pit lane',
            exiting: 'Leaving pit lane'
        };
        if (lap.inGarageStall) return 'In garage stall';
        if (labels[lap.pitPhase]) return labels[lap.pitPhase];
        if (lap.inPits) return 'In pit lane';
        if (lap.pitPhase === 'none') return 'Not in pit lane';
        return 'Unavailable';
    }

    function clearHudPresentation() {
        renderSessionClock(null);
        setText('lmuLiveHudPosition', 'P—');
        clearLayeredHud();
        setText('lmuLiveHudCurrentLap', '—');
        setText('lmuLiveHudLastLap', '—');
        setText('lmuLiveHudBestLap', '—');
        setText('lmuLiveHudSector1', '—');
        setText('lmuLiveHudSector2', '—');
        setText('lmuLiveHudSector3', '—');
        retireVirtualEnergyPresentation();
        setSignedPercentWidth('lmuLiveHudSteering', 0);
        replaceChildren('lmuLiveHudClassification', []);
        replaceChildren('lmuLiveHudRelative', []);
        ['FrontLeft', 'FrontRight', 'RearLeft', 'RearRight'].forEach(function (corner) {
            setText('lmuLiveHud' + corner + 'Temp', '—');
            setText('lmuLiveHud' + corner + 'Detail', '—');
            setText('lmuLiveHudCarStatus' + corner + 'Temp', '—');
        });
        ['front-left', 'front-right', 'rear-left', 'rear-right'].forEach(function (corner) {
            setCarStatusCompound(corner, null);
        });
        clearWheelStatePresentation();
        clearTyresPanel();
    }

    function renderGarageTyreLabels(positions) {
        ['FrontLeft', 'FrontRight', 'RearLeft', 'RearRight'].forEach(function (suffix, index) {
            var position = positions[index], element = byId('lmuLiveDrive' + suffix + 'Tyre');
            setText('lmuLiveDrive' + suffix + 'Tyre', position.compound || '—');
            if (element) element.setAttribute('title', 'Garage source: ' + position.rawCompound);
        });
        ['front-left', 'front-right', 'rear-left', 'rear-right'].forEach(function (corner, index) { setCarStatusCompound(corner, positions[index].compound || '—'); });
        setText('lmuLiveDriveFrontLeftTyreCondition', positions[0].conditionPercent + '%');
        setText('lmuLiveDriveFrontRightTyreCondition', positions[1].conditionPercent + '%');
        setText('lmuLiveDriveRearLeftTyreCondition', positions[2].conditionPercent + '%');
        setText('lmuLiveDriveRearRightTyreCondition', positions[3].conditionPercent + '%');
    }

    function renderFittedTyreLabels(fitted) {
        ['FrontLeft', 'FrontRight', 'RearLeft', 'RearRight'].forEach(function (corner, index) {
            var tyre = fitted[index];
            setText('lmuLiveDrive' + corner + 'Tyre', tyre.compound || '—');
            setCarStatusCompound(tyre.corner, tyre.compound || '—');
            setText('lmuLiveDrive' + corner + 'TyreCondition', '—');
            setText('lmuLiveHud' + corner + 'Temp', '—');
            setText('lmuLiveHud' + corner + 'Detail', '—');
            setText('lmuLiveHudCarStatus' + corner + 'Temp', '—');
        });
        clearWheelStatePresentation();
        renderFittedOnlyTyres(fitted);
        var available = fitted.some(function (tyre) { return tyre.compound !== null; });
        setObservationState('lmuLiveDriveTyres', 'lmuLiveDriveTyresState',
            available ? 'available' : 'updating', available ? 'Current fitted compound' : 'Updating fitted tyres');
    }

    return {
        renderGarageTyreLabels: renderGarageTyreLabels,
        renderFittedTyreLabels: renderFittedTyreLabels,
        mountLayeredHud: mountLayeredHud,
        mountTyresPanel: mountTyresPanel,
        renderLayeredHud: renderLayeredHud,
        observeAppearanceCar: observeAppearanceCar,
        renderDrivingInstruments: renderDrivingInstruments,
        markHudUnavailable: markHudUnavailable,
        gameUnitsForHud: gameUnitsForHud,
        weatherView: weatherView,
        clearLayeredHud: clearLayeredHud,
        clearTyresPanel: clearTyresPanel,
        renderGarageFittedTyres: renderGarageFittedTyres,
        renderGaragePendingTyres: renderGaragePendingTyres,
        renderFittedOnlyTyres: renderFittedOnlyTyres,
        setPercentWidth: setPercentWidth,
        setSignedPercentWidth: setSignedPercentWidth,
        clearCompound: clearCompound,
        clearWheelStatePresentation: clearWheelStatePresentation,
        setCarStatusCompound: setCarStatusCompound,
        clearElectronics: clearElectronics,
        clearWeather: clearWeather,
        renderElectronics: renderElectronics,
        formatClock: formatClock,
        renderSessionClock: renderSessionClock,
        formatLapTime: formatLapTime,
        displayGear: displayGear,
        renderPlayerVirtualEnergy: renderPlayerVirtualEnergy,
        renderRelative: renderRelative,
        renderHudTyres: renderHudTyres,
        renderHudPresentation: renderHudPresentation,
        countLapLabel: countLapLabel,
        pitStateLabel: pitStateLabel,
        clearHudPresentation: clearHudPresentation
    };
    };
})();
