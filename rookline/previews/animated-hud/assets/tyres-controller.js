/* LMU-style tyre page, renderer only. These field names are INTERNAL inputs,
   not an LMU API schema. No shared-memory reader, REST client or game writes.
   Version 1.1.0. No third-party runtime dependencies. */
(function (global) {
  'use strict';
  const WHEELS = Object.freeze(['fl', 'fr', 'rl', 'rr']);
  const LABELS = {fl:'Front left',fr:'Front right',rl:'Rear left',rr:'Rear right'};
  // Owner-approved display marks; the complete source label remains in wheel state.
  const COMPOUND_MARKS = Object.freeze({Soft:'S',Medium:'M',Hard:'H',Wet:'W'});
  const FIELDS = Object.freeze(['lifeFraction','wearFractionRaw','flat','detached','wearWarning',
    'compoundLabel','compoundColour','pressureKPa','tyreDisplayTempC','brakeDisplayTempC']);
  const DEFAULTS = Object.freeze({warningPeriodMs:1000,detachedPeriodMs:2200,
    motion:'system',startAngleDeg:-90,clockwise:true,lifeDecimals:0,
    temperatureUnit:'C',pressureUnit:'kPa',staleAfterMs:2500});
  let serial=0;
  const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
  const isObject=o=>o!==null && typeof o==='object' && !Array.isArray(o);
  const number=n=>typeof n==='number' && Number.isFinite(n);
  const clone=o=>JSON.parse(JSON.stringify(o));
  const blank=()=>Object.fromEntries(FIELDS.map(k=>[k,null]));
  const wheelsBlank=()=>Object.fromEntries(WHEELS.map(k=>[k,blank()]));
  const tempMemory=()=>({lastKnownC:null,heldC:null,holding:false});
  const allTempMemory=()=>Object.fromEntries(WHEELS.map(k=>[k,tempMemory()]));
  const allocation=v=>v==='unlimited'?v:Number.isSafeInteger(v)&&v>=0?v:null;
  const bool=v=>typeof v==='boolean'?v:null;
  const hex=v=>typeof v==='string' && /^#[a-f\d]{6}$/i.test(v);
  const round=n=>String(Number(n.toFixed(5)));
  function syncWarningPulsePhase(element){
    if(!element||typeof element.getAnimations!=='function')return;
    const timeline=element.ownerDocument&&element.ownerDocument.timeline;
    if(!timeline)return;
    // One document origin for existing CSS warnings, including late remounts.
    // No timer or current-data clock; reduced/muted warnings have no animation.
    for(const animation of element.getAnimations({subtree:true})){
      if(animation.animationName==='lmu-live-flat-warning-pulse'&&animation.timeline===timeline&&
          animation.playState!=='paused'&&animation.startTime!==0)animation.startTime=0;
    }
  }
  function point(cx,cy,r,a){const t=a*Math.PI/180;return [cx+r*Math.cos(t),cy+r*Math.sin(t)].map(round).join(' ');}
  // Build exact circular arcs. Full circles are two arcs, avoiding a zero-length seam.
  function arc(cx,cy,r,start,sweep){
    if(Math.abs(sweep)<1e-7)return '';
    const sign=sweep>=0?1:0,abs=Math.abs(sweep),p0=point(cx,cy,r,start);
    if(abs>=359.999999) return `M${p0} A${r} ${r} 0 1 ${sign} ${point(cx,cy,r,start+sweep/2)} A${r} ${r} 0 1 ${sign} ${p0}`;
    return `M${p0} A${r} ${r} 0 ${abs>180?1:0} ${sign} ${point(cx,cy,r,start+sweep)}`;
  }
  function band(cx,cy,inner,outer,start,sweep){
    if(Math.abs(sweep)<1e-7)return '';
    if(Math.abs(sweep)>=359.999999) return `${arc(cx,cy,outer,start,sweep)}Z ${arc(cx,cy,inner,start,-sweep)}Z`;
    const end=start+sweep,sign=sweep>=0?1:0,large=Math.abs(sweep)>180?1:0;
    return `${arc(cx,cy,outer,start,sweep)} L${point(cx,cy,inner,end)} A${inner} ${inner} 0 ${large} ${1-sign} ${point(cx,cy,inner,start)}Z`;
  }
  function normalize(key,value){
    if(['flat','detached','wearWarning'].includes(key))return bool(value);
    if(key==='lifeFraction'||key==='wearFractionRaw')return number(value)&&value>=0&&value<=1?value:null;
    if(key==='pressureKPa')return number(value)&&value>=0?value:null;
    if(key.endsWith('TempC'))return number(value)&&value>=-273.15?value:null;
    if(key==='compoundLabel')return typeof value==='string'&&value.trim()?value:null;
    if(key==='compoundColour')return hex(value)?value:null;
    return null;
  }
  function validatePatch(patch){
    if(!isObject(patch))throw new TypeError('Wheel patch must be an object.');
    for(const key of Object.keys(patch))if(!FIELDS.includes(key))throw new TypeError('Unknown renderer input: '+key);
  }
  class LMUTyreHUD {
    constructor(svg,options={}){
      if(!svg||svg.namespaceURI!=='http://www.w3.org/2000/svg'||!svg.classList.contains('lmu-tyres-hud'))throw new TypeError('Pass the inline tyres.svg SVG element.');
      this.svg=svg;this.parts=new Map();this.wheels=wheelsBlank();this.layers={};
      this.options={...DEFAULTS};this.availableTyres=null;this.source=null;
      this._temperatureMemory=allTempMemory();
      this.lastFrameAt=null;this._destroyed=false;
      // Per-instance IDs: references stay local when several panels are mounted.
      const prefix='lmu-tyres-'+(++serial)+'-'; const ids=new Map();
      svg.querySelectorAll('[id]').forEach(el=>ids.set(el.id,prefix+el.id));
      svg.querySelectorAll('*').forEach(el=>{
        if(el.id)el.id=ids.get(el.id)||el.id;
        for(const attr of Array.from(el.attributes)){
          let value=attr.value.replace(/url\(#([^)]*)\)/g,(m,id)=>ids.has(id)?'url(#'+ids.get(id)+')':m);
          if((attr.name==='href'||attr.name==='xlink:href')&&value.startsWith('#')&&ids.has(value.slice(1)))value='#'+ids.get(value.slice(1));
          if(value!==attr.value)el.setAttribute(attr.name,value);
        }
      });
      svg.querySelectorAll('[data-hud-part]').forEach(el=>{
        const id=el.dataset.hudPart;if(this.parts.has(id))throw new Error('Duplicate part '+id);
        this.parts.set(id,el);el.dataset.defaultColour=el.dataset.defaultColour||el.style.color;
        this.layers[id]={colour:null,enabled:true,visible:true,opacity:1};
      });
      this.setOptions(options);
      // Rookline owns source freshness. Its production integration disables
      // this optional preview watchdog, so do not create a background timer.
      this._timer=this.options.staleAfterMs>0?setInterval(()=>this.checkStale(),200):null;
    }
    _assert(){if(this._destroyed)throw new Error('HUD instance is destroyed.');}
    setOptions(patch){
      this._assert();if(!isObject(patch))throw new TypeError('Options must be an object.');
      const next={...this.options};
      for(const [k,v] of Object.entries(patch)){
        if(!own(DEFAULTS,k))throw new TypeError('Unknown option: '+k);
        if(['warningPeriodMs','detachedPeriodMs'].includes(k)&&(!number(v)||v<400||v>15000))throw new RangeError('Pulse periods must be 400–15000 milliseconds.');
        if(k==='staleAfterMs'&&(!number(v)||v<0||v>600000))throw new RangeError('Invalid staleAfterMs.');
        if(k==='startAngleDeg'&&(!number(v)||Math.abs(v)>360))throw new RangeError('Invalid start angle.');
        if(k==='clockwise'&&typeof v!=='boolean')throw new TypeError('clockwise must be Boolean.');
        if(k==='lifeDecimals'&&![0,1,2].includes(v))throw new RangeError('lifeDecimals must be 0, 1 or 2.');
        if(k==='motion'&&!['system','reduce','animate'].includes(v))throw new RangeError('Invalid motion preference.');
        if(k==='temperatureUnit'&&!['C','F'].includes(v))throw new RangeError('Invalid temperature unit.');
        if(k==='pressureUnit'&&!['kPa','psi'].includes(v))throw new RangeError('Invalid pressure unit.');
        next[k]=v;
      }
      this.options=next;
      this.svg.style.setProperty('--wear-period',next.warningPeriodMs+'ms');
      this.svg.style.setProperty('--detach-period',next.detachedPeriodMs+'ms');
      this.svg.dataset.motion=next.motion;
      this.render();return this;
    }
    setWheel(corner,patch){
      this._assert();if(!WHEELS.includes(corner))throw new RangeError('Unknown wheel '+corner);
      validatePatch(patch);const next={...this.wheels[corner]};
      for(const [k,v] of Object.entries(patch))next[k]=normalize(k,v);
      this._updateTemperature(corner,next,own(patch,'tyreDisplayTempC'));
      this.wheels[corner]=next;this.render();return this;
    }
    // Cache is PRESENTATION history, not a replacement for the current source reading.
    // Only a positively known detached state enables the held display. Keep raw inputs
    // untouched while detached, so getState() cannot label held data as a fresh sample.
    _updateTemperature(corner,next,hasTemperature){
      const memory=this._temperatureMemory[corner];
      if(next.detached===true){
        if(!memory.holding){
          memory.holding=true;
          memory.heldC=memory.lastKnownC;
        }
        // Cold mount: a first explicitly supplied, valid game display value can seed
        // the latch. Once latched, later null/zero/changing samples cannot overwrite it.
        if(memory.heldC===null&&hasTemperature&&next.tyreDisplayTempC!==null)
          memory.heldC=next.tyreDisplayTempC;
        return;
      }
      if(memory.holding){
        // Reattachment, replacement or loss of the detach state ends the hold. An
        // omitted temperature in a partial patch is not a new attached measurement.
        this._temperatureMemory[corner]=tempMemory();
        if(!hasTemperature)next.tyreDisplayTempC=null;
      }
      if(hasTemperature&&next.tyreDisplayTempC!==null)
        this._temperatureMemory[corner].lastKnownC=next.tyreDisplayTempC;
    }
    temperatureOf(corner){
      this._assert();if(!WHEELS.includes(corner))throw new RangeError('Unknown wheel '+corner);
      const w=this.wheels[corner],memory=this._temperatureMemory[corner];
      if(w.detached===true){
        const valueC=memory.holding?memory.heldC:null;
        return {valueC,mode:valueC===null?'unknown':'held-detached'};
      }
      return {valueC:w.tyreDisplayTempC,mode:w.tyreDisplayTempC===null?'unknown':'current'};
    }
    resetWheel(corner){
      this._assert();if(!WHEELS.includes(corner))throw new RangeError('Unknown wheel '+corner);
      // Call on a confirmed new tyre/wheel at this corner, before supplying its data.
      // Whole player/car/session changes must call clear() instead.
      this.wheels[corner]=blank();this._temperatureMemory[corner]=tempMemory();
      this.render();return this;
    }
    setAvailableTyres(value){
      this._assert();this.availableTyres=allocation(value);
      this.render();return this;
    }
    setLayer(id,patch){
      this._assert();if(!this.parts.has(id))throw new RangeError('Unknown layer '+id);
      if(!isObject(patch))throw new TypeError('Layer patch must be an object.');
      const next={...this.layers[id]};
      for(const [k,v] of Object.entries(patch)){
        if(!['colour','enabled','visible','opacity'].includes(k))throw new TypeError('Unknown layer property '+k);
        if(k==='colour'&&v!==null&&!hex(v))throw new TypeError('Colour must be #RRGGBB or null (automatic).');
        if(['enabled','visible'].includes(k)&&typeof v!=='boolean')throw new TypeError(k+' must be Boolean.');
        if(k==='opacity'&&(!number(v)||v<0||v>1))throw new RangeError('Opacity must be between 0 and 1.');
        next[k]=v;
      }
      this.layers[id]=next;this.render();return this;
    }
    restoreLayer(id){return this.setLayer(id,{colour:null,enabled:true,visible:true,opacity:1});}
    clear(reason='cleared'){
      this._assert();this.wheels=wheelsBlank();this._temperatureMemory=allTempMemory();this.availableTyres=null;this.source=null;this.lastFrameAt=null;
      this.svg.dataset.status=reason;this.render();return this;
    }
    applyFrame(frame){
      this._assert();
      if(!isObject(frame)||frame.type!=='lmu-tyres-frame'||frame.version!==1||!isObject(frame.wheels))throw new TypeError('Expected {type:"lmu-tyres-frame",version:1,wheels:{...}}.');
      const next=wheelsBlank();
      for(const [corner,wheel] of Object.entries(frame.wheels)){
        if(!WHEELS.includes(corner))throw new RangeError('Unknown wheel '+corner);
        validatePatch(wheel);
        for(const [k,v] of Object.entries(wheel))next[corner][k]=normalize(k,v);
      }
      const source=isObject(frame.source)?clone(frame.source):null;
      // All validation above is complete before the history is changed.
      for(const corner of WHEELS){
        if(!own(frame.wheels,corner))this._temperatureMemory[corner]=tempMemory();
        this._updateTemperature(corner,next[corner],own(frame.wheels[corner]||{},'tyreDisplayTempC'));
      }
      this.wheels=next;
      this.availableTyres=allocation(frame.availableTyres);
      this.source=source;
      this.lastFrameAt=performance.now();this.svg.dataset.status='frame-received';this.render();return this;
    }
    checkStale(now=performance.now()){
      if(!this._destroyed&&this.lastFrameAt!==null&&this.options.staleAfterMs>0&&now-this.lastFrameAt>this.options.staleAfterMs){this.clear('stale');return true;}return false;
    }
    stateOf(corner){
      const w=this.wheels[corner];if(!w)throw new RangeError('Unknown wheel '+corner);
      // Positive evidence has precedence; absent flags do not assert health.
      if(w.detached===true)return 'detached';
      if(w.flat===true)return 'flat';
      if(w.wearWarning===true)return 'worn';
      if(w.detached===false&&w.flat===false&&w.wearWarning===false)return 'normal';
      return 'unknown';
    }
    _part(id,shown=true,autoColour=null){
      const el=this.parts.get(id),s=this.layers[id];if(!el||!s)return;
      el.dataset.runtimeVisible=String(shown);
      el.style.display=(s.visible&&shown)?'':'none';
      el.style.opacity=String(s.opacity);
      el.style.color=s.enabled?(s.colour||autoColour||el.dataset.defaultColour):'#686b7b';
      el.dataset.colourEnabled=String(s.enabled);
      // A user-muted warning is neutral and non-pulsing, not a coloured warning.
      el.querySelectorAll('.wear-pulse,.detach-pulse,.flat-pulse').forEach(child=>{child.style.animation=s.enabled?'':'none';});
      el.removeAttribute('visibility');
    }
    render(){
      if(this._destroyed)return;
      // Source receipt/freshness bookkeeping still advances on every frame.
      // Only renderer inputs decide whether the existing drawing changes.
      const renderKey=JSON.stringify([this.wheels,this.availableTyres,this.layers,this.options,this._temperatureMemory]);
      if(this._renderKey===renderKey&&this._renderMarkup===this.svg.innerHTML){
        syncWarningPulsePhase(this.svg);return;
      }
      // A cleared or replaced drawing must restore from the same admitted inputs.
      this.svg.querySelectorAll('[data-hud-part]').forEach(el=>this.parts.set(el.dataset.hudPart,el));
      for(const id of ['tyres-backing','tyres-separators','tyres-heading','tyres-availability'])this._part(id);
      const count=this.availableTyres,slot=this.svg.querySelector('[data-role="availability"]');
      const finiteCount=count!==null&&count!=='unlimited';
      // Owner October 11: the finite inventory count reads "New tyres".
      this.svg.querySelector('[data-role="heading"]').textContent=finiteCount?'New tyres':'Tyres';
      slot.setAttribute('x',finiteCount?'166':'183');
      slot.textContent=count==='unlimited'?'∞':count===null?'—':String(count);
      const countPart=this.parts.get('tyres-availability');
      countPart.dataset.allocationState=count==='unlimited'?'unlimited':count===null?'unknown':'count';
      countPart.setAttribute('aria-label',count==='unlimited'?'Unlimited tyres remaining':count===null?'Remaining tyre count unavailable':count+' new tyres remaining');
      // Keep longer native counts inside the slot beside the allocation label.
      if(slot.textContent.length>3){slot.setAttribute('textLength','26');slot.setAttribute('lengthAdjust','spacingAndGlyphs');}
      else{slot.removeAttribute('textLength');slot.removeAttribute('lengthAdjust');}
      const o=this.options;
      for(const c of WHEELS){
        const w=this.wheels[c],group=this.svg.querySelector('[data-wheel="'+c+'"]'),state=this.stateOf(c);
        const x=Number(group.dataset.cx),y=Number(group.dataset.cy),f=w.lifeFraction;
        const known=f!==null,critical=state==='flat'||state==='detached',sweep=o.clockwise?360:-360;
        // clockwise is the DEPLETION direction, not the direction of a shrinking
        // remaining-length arc anchored at twelve. The empty section grows clockwise.
        const consumed=known?sweep*(1-f):0;
        const life=known?arc(x,y,37,o.startAngleDeg+consumed,sweep*f):'';
        const used=known?band(x,y,34,40,o.startAngleDeg,consumed):'';
        group.dataset.state=state;group.dataset.lifeKnown=String(known);
        group.setAttribute('aria-label',LABELS[c]+', '+(known?(f*100).toFixed(o.lifeDecimals)+' percent life':'life unavailable')+', '+state);
        group.querySelector('[data-role="life-arc"]').setAttribute('d',life);
        group.querySelector('[data-role="used-band"]').setAttribute('d',used);
        group.querySelector('[data-role="wear-warning-path"]').setAttribute('d',used);
        const pre='tyres-'+c+'-';
        this._part(pre+'track',!critical);
        this._part(pre+'life',known&&!critical);
        this._part(pre+'used',known&&f<1&&!critical,state==='worn'?'#ff2548':null);
        this._part(pre+'wear-warning',state==='worn'&&known&&f<1);
        // Owner October 11: zero and the exact observed fully-worn residue pulse.
        // Other positive wear stays steady, even when displayed as 0%.
        this.parts.get(pre+'wear-warning').dataset.warningPulse=String(w.wearFractionRaw===0||w.wearFractionRaw===Number.EPSILON);
        this._part(pre+'flat',state==='flat','#ff7f00');
        this._part(pre+'detached',state==='detached','#ff334f');
        this._part(pre+'percent');
        this._part(pre+'compound-ring',true,w.compoundLabel?(w.compoundColour||'#e0e1e8'):'#686b7b');
        this._part(pre+'compound-text',true,w.compoundLabel?(w.compoundColour||'#e0e1e8'):'#686b7b');
        for(const k of ['pressure','temperature','brake-temperature','brake-icon'])this._part(pre+k);
        const txt=(role,value)=>group.querySelector('[data-role="'+role+'"]').textContent=value;
        txt('life-label',known?(f*100).toFixed(o.lifeDecimals)+'%':'—');
        txt('compound-label',own(COMPOUND_MARKS,w.compoundLabel)?COMPOUND_MARKS[w.compoundLabel]:w.compoundLabel||'—');
        const formatTemp=value=>(value===null?'—':(o.temperatureUnit==='F'?value*9/5+32:value).toFixed(1))+'°'+o.temperatureUnit;
        txt('pressure',(w.pressureKPa===null?'—':(o.pressureUnit==='psi'?w.pressureKPa/6.894757293168:w.pressureKPa).toFixed(1))+o.pressureUnit);
        const displayedTemperature=this.temperatureOf(c);
        txt('tyre-temperature',formatTemp(displayedTemperature.valueC));
        const tempPart=this.parts.get(pre+'temperature');
        tempPart.dataset.temperatureMode=displayedTemperature.mode;
        tempPart.setAttribute('aria-label',LABELS[c]+' tyre temperature '+formatTemp(displayedTemperature.valueC)+(displayedTemperature.mode==='held-detached'?' (last known, detached)':''));
        txt('brake-temperature',formatTemp(w.brakeDisplayTempC));
      }
      this._renderKey=renderKey;
      this._renderMarkup=this.svg.innerHTML;
      syncWarningPulsePhase(this.svg);
    }
    getState(){return clone({type:'lmu-tyres-frame',version:1,wheels:this.wheels,availableTyres:this.availableTyres,source:this.source});}
    getSettings(){return clone({module:'lmu-tyres',version:1,options:this.options,layers:this.layers});}
    exportSvg(){this._assert();return new XMLSerializer().serializeToString(this.svg);}
    destroy(){if(this._destroyed)return;clearInterval(this._timer);this._destroyed=true;}
  }
  LMUTyreHUD.WHEELS=WHEELS;LMUTyreHUD.DEFAULTS=DEFAULTS;LMUTyreHUD.VERSION='1.1.0';
  global.LMUTyreHUD=LMUTyreHUD;
})(typeof window!=='undefined'?window:globalThis);
