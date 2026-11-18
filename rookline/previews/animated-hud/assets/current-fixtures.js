/* Explicit simulated demonstrations. No telemetry acquisition or game controls. */
'use strict';
window.RooklineCurrentPreview = {
  names: {
    detached:'Body damage · front-left detached · current readings continue',
    pulse:'Flat, detached and fully worn warnings share one pulse phase',
    flat:'Front-left flat · surface colours remain visible under the warning',
    wear:'Positive low wear is steady · zero wear pulses',
    wing:'Rear wing detached · original rear-wing path pulses red',
    heat:'Overheating · oil red · engine orange',
    engine:'Engine failure warning red',
    clear:'Warnings cleared'
  },
  sample(mode='clear') {
    const source = {
      schemaVersion:'rookline.lmu-live-hud.v1',state:'available',source:'shared-memory',sourceSchemaVersion:'rF2SM',
      lmuDataInterfaceVersion:14200,sourceInstanceId:'synthetic-damage-fixture',connectionGeneration:2,
      runtimeGeneration:7,sharedSessionIndex:3,capturedUtc:'2026-10-12T14:00:00.000Z',
      vehicleName:'Explicit simulated sample',trackName:'Synthetic',nativeTelemetryRecording:false,
      player:{gear:1,speedKph:201,rpm:7000,maxRpm:8500,throttleFraction:.75,brakeFraction:.2,
        fuelLitres:30,fuelCapacityLitres:75,virtualEnergyFraction:.68,batteryChargeFraction:.45,
        waterTemperatureCelsius:92.4,oilTemperatureCelsius:107.1,headlightsRaw:0,speedLimiterRaw:0,electricBoostMotorStateRaw:1},
      classification:[{id:17,isPlayer:true,vehicleClass:'Hyper'}],bodyDamage:{detached:false,dentSeverity:[0,1,2,0,1,2,0,2]},
      engineWarning:{active:false,overheatingRaw:0},
      tyres:['front-left','front-right','rear-left','rear-right'].map((corner,i)=>({corner,compound:null,
        wearFractionRaw:1,conditionPercent:100,temperatureCelsius:40+i*10,
        wheelState:{surfaceTemperatureLeftCelsius:30+i*10,surfaceTemperatureCentreCelsius:40+i*10,
          surfaceTemperatureRightCelsius:50+i*10,brakeTemperatureCelsius:300+i*150,flat:false,detached:false}}))
    };
    const discrete = {
      schemaVersion:'rookline.lmu-live-hud-discrete-context.v1',state:'available',reason:'available',
      capturedUtc:'2026-10-12T14:00:00.020Z',hudLease:{source:source.source,sourceSchemaVersion:source.sourceSchemaVersion,
        lmuDataInterfaceVersion:14200,sourceInstanceId:source.sourceInstanceId,connectionGeneration:2,runtimeGeneration:7,
        sharedSessionIndex:3,playerId:17,exactVehicleName:source.vehicleName,exactTrackName:source.trackName},
      suspensionDamage:{fl:.31,fr:.36,rl:.48,rr:.18},rearWing:{presentRaw:true}
    };
    if(mode==='detached')source.tyres[0].wheelState.detached=true;
    if(mode==='wing')source.bodyDamage.detached=true;
    if(mode==='heat'){source.engineWarning={active:false,overheatingRaw:1};source.player.oilTemperatureCelsius=130;}
    if(mode==='engine'){source.engineWarning={active:true,overheatingRaw:0};source.player.oilTemperatureCelsius=80;}
    if(mode==='clear'){source.bodyDamage.dentSeverity=[0,0,0,0,0,0,0,0];discrete.suspensionDamage={fl:0,fr:0,rl:0,rr:0};}
    if(['pulse','wear','flat'].includes(mode)){
      const fractions=mode==='pulse'?[.0499,.8,0,Number.EPSILON]:mode==='wear'?[.0499,.05,0,.05001]:[0,1,1,1];
      source.tyres.forEach((t,i)=>{
        Object.assign(t,{compound:'Medium',wearFractionRaw:fractions[i],conditionPercent:fractions[i]*100,temperatureCelsius:65});
        Object.assign(t.wheelState,{pressureKpa:170,brakeTemperatureCelsius:700,
          surfaceTemperatureLeftCelsius:50,surfaceTemperatureCentreCelsius:60,surfaceTemperatureRightCelsius:70});
      });
      if(mode==='pulse'){
        source.tyres[0].wheelState.flat=true;source.tyres[1].wheelState.flat=true;
        source.tyres[1].wheelState.detached=true;source.tyres[2].wheelState.flat=true;
      }
      if(mode==='flat'){source.tyres[0].wheelState.flat=true;source.tyres[0].wheelState.pressureKpa=0;}
    }
    return {source,discrete};
  },
  presenter() {
    const byId=id=>document.getElementById(id);
    return window.RooklineLmuLiveDrivePresentation({byId,setText:(id,t)=>{const e=byId(id);if(e)e.textContent=t;},
      setHidden:()=>{},setObservationState:()=>{},isText:v=>typeof v==='string'&&v.length>0,
      isFiniteNumber:v=>typeof v==='number'&&Number.isFinite(v),liveRenderClock:{},
      hudLease:h=>h.sourceInstanceId,contextMatchesHud:()=>true,isIsoTimestamp:v=>Number.isFinite(Date.parse(v)),
      trackPresentation:{renderVehicleGeometry:()=>{}},retireVirtualEnergyPresentation:()=>{}});
  },
  tyreFrame(source) {
    const wheels={};
    source.tyres.forEach((t,i)=>{wheels[['fl','fr','rl','rr'][i]]={lifeFraction:t.conditionPercent/100,
      wearFractionRaw:t.wearFractionRaw,flat:t.wheelState.flat,detached:t.wheelState.detached,
      wearWarning:t.wearFractionRaw<=.2,compoundLabel:t.compound,compoundColour:t.compound==='Medium'?'#ffe000':null,
      pressureKPa:t.wheelState.pressureKpa??null,tyreDisplayTempC:t.temperatureCelsius,
      brakeDisplayTempC:t.wheelState.brakeTemperatureCelsius};});
    return {type:'lmu-tyres-frame',version:1,availableTyres:null,source:{kind:'explicit simulated preview'},wheels};
  }
};
