/*
 * Pure current-LMU HUD presentation adapter.
 *
 * This module owns no requests, clocks, retained frames, or lifecycle state.
 * Callers must pass an already-admitted Live HUD plus, when available, an
 * independently fenced discrete-context response. Raw source values remain in
 * the projection beside the presentation paint that was derived from them.
 */
(function (global) {
    'use strict';

    const CONTRACT_VERSION = 1;
    const HUD_CONTRACT = 'rookline.lmu-live-hud.v1';
    const DISCRETE_CONTRACT = 'rookline.lmu-live-hud-discrete-context.v1';
    const CORNERS = Object.freeze({
        'front-left': 'fl', 'front-right': 'fr', 'rear-left': 'rl', 'rear-right': 'rr',
        fl: 'fl', fr: 'fr', rl: 'rl', rr: 'rr'
    });
    const DISPLAY_CORNERS = Object.freeze(['fl', 'fr', 'rl', 'rr']);
    const ZONES = Object.freeze(['inner', 'middle', 'outer']);
    const SURFACE_ANCHORS = Object.freeze([
        [30.460725347388745, [80, 141, 195]],
        [34.21507297327892, [97, 166, 206]],
        [38.122728349380765, [109, 191, 219]],
        [42.288662899524184, [111, 211, 210]],
        [46.042824058929455, [99, 224, 183]],
        [49.93957087856546, [86, 237, 153]],
        [53.62817683849107, [74, 248, 126]],
        [58.574664112487085, [60, 255, 94]],
        [69.58056688737824, [38, 255, 32]],
        [87.6077680349415, [117, 255, 12]],
        [109.02403475181825, [227, 214, 15]],
        [140.23802550265438, [230, 14, 68]],
        [169.0219253079164, [232, 11, 66]],
        [283.2165358084797, [235, 6, 68]]
    ].map(function (entry) { return Object.freeze({ celsius: entry[0], rgb: Object.freeze(entry[1]) }); }));
    const SURFACE_PALETTE_PROVENANCE = Object.freeze({
        kind: 'empirical-rendered-pixel-interpolation',
        source: 'BMWMH Custom Team 2026 #397 / Soft / Michelin Raceway Road Atlanta / 2026-10-08 retained native observation',
        anchors: SURFACE_ANCHORS.length,
        boundary: 'Raw Celsius is retained. Endpoint saturation is paint-only; anchors are not thermal categories, operating targets, or native thresholds.'
    });
    // Native surface paint is distinct from a published operating window.
    // Add curves here only after calibration for the exact raw identities.
    // Retained hud.ndjson line 1 identifies this BMW's raw class as Hyper.
    const SURFACE_PROFILES = Object.freeze([Object.freeze({
        id: 'bmw-soft-surface-20261008',
        exactVehicleName: 'BMWMH Custom Team 2026 #397',
        vehicleClassRaw: 'Hyper',
        compoundRaw: 'Soft',
        anchors: SURFACE_ANCHORS,
        provenance: SURFACE_PALETTE_PROVENANCE
    })]);
    // Owner-approved interim temperature-only paint. These are pooled native
    // Ferrari inset pixels, not fade/wear/lockup rules or physical limits.
    const BRAKE_ANCHORS = Object.freeze([
        [25.891877537238372, [63, 119, 183]],
        [48.00895391570316, [64, 121, 182]],
        [81.99138947256472, [66, 130, 176]],
        [99.22473987768217, [67, 136, 170]],
        [123.49297270207694, [66, 145, 165]],
        [150.4885753676512, [65, 154, 158]],
        [172.1974436849024, [62, 162, 155]],
        [203.70605092392645, [64, 174, 151]],
        [216.83865469885342, [65, 180, 147]],
        [248.56570855889345, [64, 190, 140]],
        [274.51872607127126, [65, 199, 135]],
        [297.0199532883425, [63, 208, 124]],
        [319.14112936158097, [65, 210, 118]],
        [351.76680236089305, [66, 210, 113]],
        [380.014992952313, [67, 212, 108]],
        [400.0883650802966, [68, 213, 99]],
        [427.3453538614608, [78, 213, 93]],
        [451.9173062062273, [76, 213, 86]],
        [474.23677744124086, [82, 213, 80]],
        [502.8223547366089, [86, 214, 73]],
        [527.6844284128003, [86, 214, 68]],
        [544.8519912512897, [86, 215, 63]],
        [580.983598833947, [94, 216, 54]],
        [601.2783733288287, [93, 216, 49]],
        [630.5019254576225, [99, 216, 38]],
        [643.098452155651, [102, 217, 34]],
        [675.4050121290655, [99, 218, 28]],
        [698.6283899494326, [104.5, 217, 20]],
        [726.1834468724315, [102, 218, 12]],
        [749.9576897110818, [112, 217, 9]],
        [775.3216287595118, [125, 216, 8]],
        [800.194239591768, [137, 213, 7]],
        [825.1747189904294, [151, 209, 6]],
        [851.7864992756539, [164, 207, 6]],
        [874.4401452529715, [176, 205, 6]],
        [900.447506706235, [186, 203, 6]],
        [924.5446089129706, [200, 200, 6]],
        [949.069525540123, [211, 198, 5]],
        [974.61085634988, [224, 195, 4]],
        [1000.083338752382, [238, 190, 6]],
        [1025.8467054425369, [239, 175, 13]],
        [1050.3439733190821, [239, 159, 17]],
        [1074.1626675283865, [239, 144, 26]],
        [1095.6112666010608, [238, 132, 27]]
    ].map(function (entry) { return Object.freeze({ celsius: entry[0], rgbArray: Object.freeze(entry[1]) }); }));
    const BRAKE_PALETTE_PROVENANCE = Object.freeze({
        kind: 'interim-temperature-only-rendered-pixel-interpolation',
        source: 'Ferrari AF Corse 2026 #50:LM / Daytona International Speedway Road Course / 2026-10-08 23-59-27 recording',
        anchors: BRAKE_ANCHORS.length,
        boundary: 'Owner-approved shared four-corner temperature presentation. Cross-car native parity and other LMU HUD inputs are unresolved. Endpoint paint holds blue/orange; no red threshold or thermal maximum is inferred.'
    });
    // Owner-approved 2026-10-09 provisional bands, pending native thresholds.
    // Detachment is independently supplied by wheelState.detached, never damage.
    const SUSPENSION_COLOURS = Object.freeze({
        none: '#696b79', light: '#ffff00', medium: '#ff7f00', severe: '#ff334f'
    });
    const SUSPENSION_PAINT_PROVENANCE = Object.freeze({
        kind: 'owner-approved-provisional-severity-bands',
        boundary: 'Raw REST fractions remain raw. Zero is undamaged; positive below 0.33 light; 0.33 to below 0.66 medium; 0.66 through 1 severe. These are temporary presentation bands, not measured LMU thresholds. Only the explicit wheel-detached flag establishes detachment.'
    });
    const FLAT_RGB = '#ff7f00';
    const DETACHED_RGB = '#ff334f';

    function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
    function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
    function nullableBoolean(value) { return typeof value === 'boolean' ? value : null; }
    function nullableFinite(value) { return finite(value) ? value : null; }
    function same(a, b) { return a !== undefined && b !== undefined && a === b; }
    function clamp(value, lower, upper) { return Math.min(upper, Math.max(lower, value)); }
    function cloneCorners(factory) {
        return Object.fromEntries(DISPLAY_CORNERS.map(function (corner) { return [corner, factory(corner)]; }));
    }
    function hex(rgb) {
        return '#' + rgb.map(function (channel) {
            return Math.round(clamp(channel, 0, 255)).toString(16).padStart(2, '0');
        }).join('');
    }
    function interpolateRgb(anchors, value, key) {
        if (!finite(value)) return null;
        if (value <= anchors[0][key]) return anchors[0].rgb || hex(anchors[0].rgbArray);
        if (value >= anchors[anchors.length - 1][key]) return anchors[anchors.length - 1].rgb || hex(anchors[anchors.length - 1].rgbArray);
        for (let index = 1; index < anchors.length; index += 1) {
            const upper = anchors[index];
            if (value > upper[key]) continue;
            const lower = anchors[index - 1];
            const amount = (value - lower[key]) / (upper[key] - lower[key]);
            const low = lower.rgbArray || lower.rgb;
            const high = upper.rgbArray || upper.rgb;
            if (typeof low === 'string' || typeof high === 'string') {
                const parse = function (colour) {
                    return [1, 3, 5].map(function (offset) { return parseInt(colour.slice(offset, offset + 2), 16); });
                };
                return hex(parse(low).map(function (channel, channelIndex) {
                    return channel + (parse(high)[channelIndex] - channel) * amount;
                }));
            }
            return hex(low.map(function (channel, channelIndex) {
                return channel + (high[channelIndex] - channel) * amount;
            }));
        }
        return null;
    }
    function validSurfaceProfile(profile) {
        return object(profile) && ['id', 'exactVehicleName', 'vehicleClassRaw', 'compoundRaw'].every(function (key) {
            return typeof profile[key] === 'string' && profile[key].length > 0;
        }) && object(profile.provenance) && typeof profile.provenance.source === 'string'
            && profile.provenance.source.length > 0 && Array.isArray(profile.anchors) && profile.anchors.length >= 2
            && profile.anchors.every(function (entry, index, anchors) {
                return object(entry) && finite(entry.celsius) && (index === 0 || entry.celsius > anchors[index - 1].celsius)
                    && Array.isArray(entry.rgb) && entry.rgb.length === 3
                    && entry.rgb.every(function (channel) { return finite(channel) && channel >= 0 && channel <= 255; });
            });
    }
    function surfaceProfileFor(hud, tyre, profiles) {
        const players = object(hud) && Array.isArray(hud.classification)
            ? hud.classification.filter(function (entry) { return object(entry) && entry.isPlayer === true; }) : [];
        const player = players.length === 1 && players[0].vehicleName === hud.vehicleName ? players[0] : null;
        const vehicleClassRaw = player && typeof player.vehicleClass === 'string' ? player.vehicleClass : null;
        const compoundRaw = object(tyre) && typeof tyre.compound === 'string' ? tyre.compound : null;
        const matches = Array.isArray(profiles) ? profiles.filter(function (profile) {
            return object(profile) && profile.exactVehicleName === (hud && hud.vehicleName)
                && profile.vehicleClassRaw === vehicleClassRaw && profile.compoundRaw === compoundRaw;
        }) : [];
        const selected = matches.length === 1 && validSurfaceProfile(matches[0]) ? matches[0] : null;
        return {
            vehicleClassRaw: vehicleClassRaw,
            compoundRaw: compoundRaw,
            profileId: selected ? selected.id : null,
            mode: selected ? 'matched-empirical-profile' : 'empirical-reference-fallback',
            reason: selected ? null : matches.length > 1 ? 'conflicting-profiles'
                : matches.length === 1 ? 'invalid-profile' : !vehicleClassRaw ? 'class-unavailable'
                    : !compoundRaw ? 'fitted-compound-unavailable' : 'calibration-pending',
            anchors: selected ? selected.anchors : SURFACE_ANCHORS,
            provenance: selected ? selected.provenance : SURFACE_PALETTE_PROVENANCE
        };
    }
    function surfaceRgb(celsius, anchors = SURFACE_ANCHORS) {
        return interpolateRgb(anchors.map(function (entry) {
            return { celsius: entry.celsius, rgbArray: entry.rgb };
        }), celsius, 'celsius');
    }
    function suspensionSeverity(fraction) {
        if (!finite(fraction) || fraction < 0 || fraction > 1) return null;
        return fraction === 0 ? 'none' : fraction < 0.33 ? 'light' : fraction < 0.66 ? 'medium' : 'severe';
    }
    function suspensionRgb(fraction) {
        return SUSPENSION_COLOURS[suspensionSeverity(fraction)] || null;
    }
    function brakeRgb(celsius) {
        return interpolateRgb(BRAKE_ANCHORS, celsius, 'celsius');
    }
    function playerOf(hud) { return object(hud) && object(hud.player) ? hud.player : {}; }
    function lookupTyres(hud) {
        const result = {};
        if (!object(hud) || !Array.isArray(hud.tyres)) return result;
        for (const tyre of hud.tyres) {
            if (!object(tyre) || typeof tyre.corner !== 'string' || !CORNERS[tyre.corner] || result[CORNERS[tyre.corner]]) continue;
            result[CORNERS[tyre.corner]] = tyre;
        }
        return result;
    }
    function surfaceForWheel(wheelState, displayCorner, profile) {
        const left = nullableFinite(wheelState && wheelState.surfaceTemperatureLeftCelsius);
        const middle = nullableFinite(wheelState && wheelState.surfaceTemperatureCentreCelsius);
        const right = nullableFinite(wheelState && wheelState.surfaceTemperatureRightCelsius);
        // The retained native BMW/Soft plate is mirrored: source L/C/R stays
        // screen L/C/R while named inner/outer is mirrored by side.
        const rightSide = displayCorner === 'fr' || displayCorner === 'rr';
        const rawCelsius = {
            inner: rightSide ? left : right,
            middle: middle,
            outer: rightSide ? right : left
        };
        return {
            rawCelsius: rawCelsius,
            rgb: Object.fromEntries(ZONES.map(function (zone) { return [zone, surfaceRgb(rawCelsius[zone], profile.anchors)]; })),
            profile: {
                profileId: profile.profileId, mode: profile.mode, reason: profile.reason,
                vehicleClassRaw: profile.vehicleClassRaw, compoundRaw: profile.compoundRaw,
                provenance: profile.provenance
            }
        };
    }
    function tyreHealth(wheelState, wearFractionRaw) {
        const flat = nullableBoolean(wheelState && wheelState.flat);
        const detached = nullableBoolean(wheelState && wheelState.detached);
        return {
            flat: flat,
            detached: detached,
            wearFractionRaw: finite(wearFractionRaw) && wearFractionRaw >= 0 && wearFractionRaw <= 1
                ? wearFractionRaw : null,
            presentation: detached === true ? 'detached' : flat === true ? 'flat' :
                flat === false && detached === false ? 'nominal' : 'unknown',
            rgb: detached === true ? DETACHED_RGB : flat === true ? FLAT_RGB : null
        };
    }
    function contextMatchesHud(hud, context) {
        if (!object(hud) || !object(context) || context.schemaVersion !== DISCRETE_CONTRACT || context.state !== 'available') return false;
        const lease = object(context.hudLease) ? context.hudLease : null;
        if (!lease) return false;
        const player = playerOf(hud);
        const classifiedPlayer = Array.isArray(hud.classification)
            ? hud.classification.find(function (entry) { return object(entry) && entry.isPlayer === true; }) : null;
        const playerId = classifiedPlayer && classifiedPlayer.id;
        const expected = [
            ['source', hud.source], ['sourceSchemaVersion', hud.sourceSchemaVersion],
            ['lmuDataInterfaceVersion', hud.lmuDataInterfaceVersion],
            ['sourceInstanceId', hud.sourceInstanceId], ['connectionGeneration', hud.connectionGeneration],
            ['runtimeGeneration', hud.runtimeGeneration], ['sharedSessionIndex', hud.sharedSessionIndex],
            ['playerId', playerId],
            ['exactVehicleName', hud.vehicleName], ['exactTrackName', hud.trackName]
        ];
        for (const entry of expected) {
            const key = entry[0], value = entry[1];
            if (!same(lease[key], value)) return false;
        }
        return object(player);
    }
    function finiteResource(value) { return finite(value) && value >= 0 ? value : null; }
    function valuesFor(hud, discrete) {
        const player = playerOf(hud);
        const virtualEnergyFraction = nullableFinite(player.virtualEnergyFraction);
        const accepted = contextMatchesHud(hud, discrete);
        const supported = accepted && object(discrete.resourceSupportedLaps) ? discrete.resourceSupportedLaps : {};
        return {
            gear: Number.isInteger(player.gear) ? player.gear : null,
            speedKph: nullableFinite(player.speedKph),
            rpm: nullableFinite(player.rpm),
            rpmFraction: global.LMUHud.rpmArcFraction(player.rpm, player.maxRpm),
            // These are raw same-snapshot driver inputs. Never substitute filtered telemetry.
            throttleFraction: nullableFinite(player.throttleFraction),
            brakeFraction: nullableFinite(player.brakeFraction),
            fuelLitres: nullableFinite(player.fuelLitres),
            fuelFraction: finite(player.fuelLitres) && finite(player.fuelCapacityLitres) && player.fuelCapacityLitres > 0
                ? player.fuelLitres / player.fuelCapacityLitres : null,
            fuelLaps: finiteResource(supported.fuel),
            energyPct: virtualEnergyFraction == null ? null : virtualEnergyFraction * 100,
            energyLaps: finiteResource(supported.virtualEnergy),
            coolantC: nullableFinite(player.waterTemperatureCelsius),
            oilC: nullableFinite(player.oilTemperatureCelsius),
            // The source publishes raw FFB torque only. Its visual scale remains unknown.
            ffbFraction: null,
            socPct: finite(player.batteryChargeFraction) && player.batteryChargeFraction >= 0 && player.batteryChargeFraction <= 1
                ? player.batteryChargeFraction * 100 : null,
            hybridFlowFraction: null
        };
    }
    function statesFor(hud, tyreState) {
        const player = playerOf(hud);
        // Owner October 10: these exact raw classes show fuel only. VE is
        // independent of battery hardware and temporary resource availability.
        const classifiedPlayer = object(hud) && Array.isArray(hud.classification)
            ? hud.classification.find(function (entry) { return object(entry) && entry.isPlayer === true; }) : null;
        const fuelOnly = classifiedPlayer && ['LMP2', 'LMP2_ELMS', 'LMP3', 'GTE'].includes(classifiedPlayer.vehicleClass);
        // Owner October 10: live mDetached identifies rear-wing detachment.
        // REST D5 remains rear-wing-only raw evidence, not a paint prerequisite.
        // No car catalogue or first-poll baseline; missing data stays unavailable.
        const nonWheelDetached = nullableBoolean(hud && hud.bodyDamage && hud.bodyDamage.detached);
        const wingState = nonWheelDetached == null ? null : nonWheelDetached ? 'detached' : 'attached';
        return {
            fuelOnly: fuelOnly === true,
            hybridMode: player.electricBoostMotorStateRaw === 1 ? 'idle'
                : player.electricBoostMotorStateRaw === 2 ? 'deploying'
                    : player.electricBoostMotorStateRaw === 3 ? 'charging' : null,
            headlights: player.headlightsRaw === 0 ? false : player.headlightsRaw === 1 ? true : null,
            pitLimiter: player.speedLimiterRaw === 0 ? false : player.speedLimiterRaw === 1 ? true : null,
            telemetryRecording: nullableBoolean(hud && hud.nativeTelemetryRecording),
            engineDamage: null,
            engineWarning: nullableBoolean(hud && hud.engineWarning && hud.engineWarning.active),
            // Owner-approved preview positions resolve from the same shared
            // RPM arc fraction in LMUHud; no car lookup or limiter shortcut.
            shiftLightMode: 'rpm',
            shiftLights: [null, null, null],
            damage: null,
            suspensionDamage: null,
            tyreThermal: null,
            brakeThermal: null,
            tyreHealth: tyreState,
            wingState: wingState
        };
    }
    function suspensionFor(discrete) {
        const raw = object(discrete) && object(discrete.suspensionDamage) ? discrete.suspensionDamage : {};
        return cloneCorners(function (corner) {
            const rawFraction = nullableFinite(raw[corner]);
            return { rawFraction: rawFraction, severity: suspensionSeverity(rawFraction), rgb: suspensionRgb(rawFraction) };
        });
    }
    function oilTemperatureFor(hud, vehicleModelRaw) {
        const classifiedPlayer = object(hud) && Array.isArray(hud.classification)
            ? hud.classification.find(function (entry) { return object(entry) && entry.isPlayer === true; }) : null;
        const vehicleClassRaw = classifiedPlayer && typeof classifiedPlayer.vehicleClass === 'string'
            ? classifiedPlayer.vehicleClass : null;
        const model = typeof vehicleModelRaw === 'string' && vehicleModelRaw.length > 0 ? vehicleModelRaw : null;
        let redBoundaryCelsius = null;
        // Owner-tested October 10 mappings. No normal/cold band is approved.
        switch (vehicleClassRaw) {
            case 'LMP2': case 'LMP2_ELMS': redBoundaryCelsius = 141.2; break;
            case 'GT3': redBoundaryCelsius = 141.0; break;
            case 'GTE': redBoundaryCelsius = 141.1; break;
            case 'LMP3': redBoundaryCelsius = 144.0; break;
            case 'Hyper':
                if (model != null) redBoundaryCelsius = model === 'Vanwall 680' ? 183.6 : 142.1;
                break;
        }
        const rawCelsius = nullableFinite(playerOf(hud).oilTemperatureCelsius);
        const overheatingRaw = nullableFinite(hud && hud.engineWarning && hud.engineWarning.overheatingRaw);
        return {
            rawCelsius: rawCelsius, overheatingRaw: overheatingRaw,
            vehicleClassRaw: vehicleClassRaw, vehicleModelRaw: model,
            redBoundaryCelsius: redBoundaryCelsius,
            rgb: overheatingRaw === 1 || (rawCelsius != null && redBoundaryCelsius != null && rawCelsius >= redBoundaryCelsius)
                ? '#ff334f' : null
        };
    }
    function build(hud, discreteContext, gameUnits, surfaceProfiles = SURFACE_PROFILES, vehicleModelRaw = null) {
        const admittedHud = object(hud) && hud.schemaVersion === HUD_CONTRACT ? hud : null;
        const tyres = lookupTyres(admittedHud);
        const surface = cloneCorners(function (corner) {
            const tyre = tyres[corner];
            return surfaceForWheel(tyre && tyre.wheelState, corner, surfaceProfileFor(admittedHud, tyre, surfaceProfiles));
        });
        const health = cloneCorners(function (corner) {
            const tyre = tyres[corner];
            return tyreHealth(tyre && tyre.wheelState, tyre && tyre.wearFractionRaw);
        });
        const brakes = cloneCorners(function (corner) {
            const tyre = tyres[corner];
            const rawCelsius = nullableFinite(tyre && tyre.wheelState && tyre.wheelState.brakeTemperatureCelsius);
            return { rawCelsius: rawCelsius, rgb: brakeRgb(rawCelsius) };
        });
        const discreteAccepted = contextMatchesHud(admittedHud, discreteContext);
        const body = object(admittedHud) && object(admittedHud.bodyDamage) ? admittedHud.bodyDamage : null;
        const dentSeverity = body && Array.isArray(body.dentSeverity) && body.dentSeverity.length === 8
            ? body.dentSeverity.slice() : null;
        const suspension = suspensionFor(discreteAccepted ? discreteContext : null);
        const rearWing = discreteAccepted && object(discreteContext.rearWing)
            && typeof discreteContext.rearWing.presentRaw === 'boolean' ? discreteContext.rearWing : null;
        const states = statesFor(admittedHud, health);
        const oilTemperature = oilTemperatureFor(admittedHud, admittedHud ? vehicleModelRaw : null);
        return {
            contractVersion: CONTRACT_VERSION,
            gameUnits: gameUnits,
            source: {
                hud: object(admittedHud) ? {
                    schemaVersion: admittedHud.schemaVersion || null,
                    sourceInstanceId: admittedHud.sourceInstanceId || null,
                    connectionGeneration: admittedHud.connectionGeneration ?? null,
                    runtimeGeneration: admittedHud.runtimeGeneration ?? null,
                    sharedSessionIndex: admittedHud.sharedSessionIndex ?? null,
                    capturedUtc: admittedHud.capturedUtc || null
                } : null,
                discreteContext: object(discreteContext) ? {
                    schemaVersion: discreteContext.schemaVersion || null,
                    state: discreteContext.state || null,
                    reason: discreteContext.reason || null,
                    capturedUtc: discreteContext.capturedUtc || null,
                    acceptedForHud: discreteAccepted
                } : null
            },
            values: valuesFor(admittedHud, discreteAccepted ? discreteContext : null),
            states: states,
            raw: {
                ffbTorqueRaw: nullableFinite(playerOf(admittedHud).ffbTorqueRaw),
                // The three exact nullable REST integers remain unrendered
                // until their native on-screen count/meaning is established.
                tyreAllocationRaw: discreteAccepted && object(discreteContext.tyreAllocationRaw)
                    ? {
                        maxAvailableTires: discreteContext.tyreAllocationRaw.maxAvailableTires ?? null,
                        newTires: discreteContext.tyreAllocationRaw.newTires ?? null,
                        newTiresRemaining: discreteContext.tyreAllocationRaw.newTiresRemaining ?? null
                    } : null,
                bodyDamage: body ? { detached: nullableBoolean(body.detached), dentSeverity: dentSeverity } : null,
                rearWing: rearWing ? { presentRaw: rearWing.presentRaw, source: rearWing.source } : null,
                resourceSupportedLaps: discreteAccepted && object(discreteContext.resourceSupportedLaps)
                    ? { fuel: finiteResource(discreteContext.resourceSupportedLaps.fuel), virtualEnergy: finiteResource(discreteContext.resourceSupportedLaps.virtualEnergy) }
                    : { fuel: null, virtualEnergy: null }
            },
            components: {
                brakeTemperature: brakes,
                tyreSurface: surface,
                tyreHealth: health,
                suspension: suspension,
                body: {
                    positions: dentSeverity,
                    compactPanels: dentSeverity,
                    wing: { state: states.wingState, sourceField: 'bodyDamage.detached' }
                }
            },
            paint: {
                oilTemperature: oilTemperature,
                body: { positions: dentSeverity },
                brakeTemperature: brakes,
                tyreSurfaceRgb: cloneCorners(function (corner) { return surface[corner].rgb; }),
                tyreSurfaceCelsius: cloneCorners(function (corner) { return surface[corner].rawCelsius; }),
                tyreSurfaceProfile: cloneCorners(function (corner) { return surface[corner].profile; }),
                suspension: suspension,
                tyreHealth: cloneCorners(function (corner) { return health[corner].rgb; })
            },
            provenance: {
                oilTemperature: 'Owner-tested October 10 class red cutoffs in raw Celsius; exact admitted Vanwall 680 model exception. Raw overheating 1 makes oil red and engine orange; only the independent backend engine warning latch makes engine red. No normal/cold band.',
                brakeTemperature: BRAKE_PALETTE_PROVENANCE,
                tyreSurface: SURFACE_PALETTE_PROVENANCE,
                suspension: SUSPENSION_PAINT_PROVENANCE,
                tyreFaults: 'Per-wheel shared-memory flags; Rookline presentation keeps flat amber and detached red distinct.',
                wing: 'Owner-approved live shared-memory mDetached rear-wing paint: false muted, true red. REST D5 remains raw rear-wing evidence.'
            }
        };
    }
    function apply(component, projection) {
        if (!component || !object(projection) || projection.contractVersion !== CONTRACT_VERSION) return false;
        if (typeof component.updateLive === 'function') {
            return component.updateLive(projection.values, projection.states, projection.paint, gameUnitsUnit(projection.gameUnits));
        }
        if (typeof component.setTemperatureUnit === 'function') component.setTemperatureUnit(gameUnitsUnit(projection.gameUnits));
        if (typeof component.setValues === 'function') component.setValues(projection.values);
        if (typeof component.setStates === 'function') component.setStates(projection.states);
        // Categorical unknowns arrive first. Literal raw suspension paint then
        // establishes the glyph's availability without being neutralized.
        if (typeof component.setRawPaint === 'function') component.setRawPaint(projection.paint);
        if (component.svg && typeof component.svg.setAttribute === 'function') component.svg.setAttribute('data-availability', 'live');
        return true;
    }
    function gameUnitsUnit(gameUnits) { return gameUnits === 1 ? 'F' : 'C'; }
    function create() { return Object.freeze({ build: build, apply: apply }); }

    global.RooklineLmuDrivingHudAdapter = Object.freeze({
        contractVersion: CONTRACT_VERSION,
        create: create,
        build: build,
        apply: apply,
        surfaceRgb: surfaceRgb,
        surfaceProfiles: SURFACE_PROFILES,
        brakeRgb: brakeRgb,
        brakePaletteProvenance: BRAKE_PALETTE_PROVENANCE,
        suspensionRgb: suspensionRgb,
        surfacePaletteProvenance: SURFACE_PALETTE_PROVENANCE
    });
})(window);
