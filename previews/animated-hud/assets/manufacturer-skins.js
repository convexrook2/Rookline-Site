/* Rookline manufacturer styling / dynamic logo slot.
 * Appearance extension for the OWNER-SUPPLIED October 12 SVG.
 * v1.3 adds six appearance shapes, full presented-fraction reveal and optional lamp palettes.
 * Retains the accepted source-transform, live identity and concentric shift-slot contracts.
 * No telemetry acquisition, data conversion, thresholds, matching aliases,
 * asset discovery, native settings changes or preference persistence.
 */
(function (global) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const instances = new WeakMap();
  let serial = 0;
  const clone = o => JSON.parse(JSON.stringify(o));
  const hex = s => typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s);
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  function node(tag, attrs = {}) {
    const e = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, String(v)));
    return e;
  }
  function attr(e, k, v) {
    if (v == null) { if (e.hasAttribute(k)) e.removeAttribute(k); }
    else if (e.getAttribute(k) !== String(v)) e.setAttribute(k, String(v));
  }
  // Permanent artwork uses the SVG's supplied transform lists, never a screen
  // matrix sampled before layout. The common root's viewBox/CSS scale cancels.
  function artworkMatrix(element, svg) {
    const chain=[];
    for(let e=element;e!==svg;e=e.parentElement) {
      if(!e)throw new Error('Artwork must share the supplied SVG root.');
      chain.unshift(e);
    }
    let matrix=svg.createSVGMatrix();
    for(const e of chain) {
      const transforms=e.transform.baseVal;
      for(let i=0;i<transforms.numberOfItems;i++)matrix=matrix.multiply(transforms.getItem(i).matrix);
    }
    return matrix;
  }
  function artworkTransform(from, to, svg) {
    const m=artworkMatrix(to,svg).inverse().multiply(artworkMatrix(from,svg));
    if(![m.a,m.b,m.c,m.d,m.e,m.f].every(finite))throw new Error('Invalid source artwork transform.');
    return `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`;
  }
  const SHAPES = Object.freeze(['angled_segments','fine_blocks','round_dots','fine_ticks','wide_blocks','continuous_band']);
  function validProfile(p) {
    return p && SHAPES.includes(p.shapeMode) && Number.isInteger(p.segmentCount) && p.segmentCount >= 24 && p.segmentCount <= 160 &&
      finite(p.gapSvgUnits) && p.gapSvgUnits >= .5 && p.gapSvgUnits <= 5 &&
      finite(p.slantDegrees) && Math.abs(p.slantDegrees) <= .6 &&
      Number.isInteger(p.majorEvery) && p.majorEvery >= 0 && p.majorEvery <= 20 &&
      finite(p.majorGapMultiplier) && p.majorGapMultiplier >= 1 && p.majorGapMultiplier <= 2 &&
      Array.isArray(p.palette) && p.palette.length === 4 && p.palette.every(hex) &&
      Array.isArray(p.shiftPalette) && p.shiftPalette.length === 3 && p.shiftPalette.every(hex) &&
      Array.isArray(p.colourZones) && p.colourZones.length === 4 &&
      p.colourZones.every((z,i)=>hex(z.colour) && z.fromFraction === [0,.45,.7,.88][i] && z.toFraction === [.45,.7,.88,1][i]) &&
      [p.accent, p.trackColour, p.rimColour, p.plateColour].every(hex);
  }
  /** Restore only the missing battery glyphs. State and colour stay source-owned.
   * The current SVG has an empty battery-soc group, although its controller
   * already publishes idle/deploying/charging on that group. No new data binding.
   */
  function restoreBatteryActivityArtwork(svg, uid) {
    const activity=svg.querySelector('[data-hud-part="battery-soc"]');
    const outline=svg.querySelector('[data-hud-part="battery"]');
    const body=outline?.querySelector('rect');
    if(!activity || !outline || !body) throw new Error('Missing source battery layers.');
    if(svg.querySelector('[data-role="battery-deploy-chevrons"], [data-role="battery-charge-chevrons"]')) return [];
    const x=Number(body.getAttribute('x')), y=Number(body.getAttribute('y'));
    const w=Number(body.getAttribute('width')), h=Number(body.getAttribute('height'));
    if(![x,y,w,h].every(finite) || w<=0 || h<=0) throw new Error('Invalid source battery bounds.');
    // Convert outline-local coordinates into the EXISTING activity layer space.
    // This avoids drawing old small-coordinate artwork at the SVG root by mistake.
    const glyphs=node('g',{'data-battery-activity-artwork':'filled-chevrons-v1',
      'data-skin-owned':uid,transform:artworkTransform(body,activity,svg),
      'pointer-events':'none','aria-hidden':'true'});
    // Four SOLID chevrons occupy the interior, not a SoC-proportional rectangle.
    const left=x+w*.16, right=x+w*.84, mid=x+w*.5;
    const top=y+h*.12, pitch=h*.198, depth=h*.116, thickness=h*.071;
    const pathFor=up=>Array.from({length:4},(_,i)=>{
      const yy=top+i*pitch;
      const points=[[left,yy],[mid,yy+depth],[right,yy],
        [right,yy+thickness],[mid,yy+depth+thickness],[left,yy+thickness]];
      return points.map(([xx,py],j)=>`${j?'L':'M'}${xx.toFixed(4)} ${(up?2*y+h-py:py).toFixed(4)}`).join(' ')+' Z';
    }).join(' ');
    glyphs.append(node('path',{'data-role':'battery-deploy-chevrons',d:pathFor(false),
      fill:'var(--part-color, #5788c1)',stroke:'none'}),
      node('path',{'data-role':'battery-charge-chevrons',d:pathFor(true),
      fill:'var(--part-color, #1df41e)',stroke:'none'}));
    // The host's external stylesheet follows the existing activity state. Keep
    // CSP intact and leave the controller's cached part/role tables untouched.
    activity.append(glyphs);
    return [glyphs];
  }
  /** v1.2: align the three reserved shift-light slots to the current RPM circle.
   * The retained decorative rim was a scaled ellipse, whereas RPM and lamps were
   * already circular. That made the rim/slot clearance vary and cross at the ends.
   * Only two rim paths and three lamp paths are corrected; IDs and state stay put.
   */
  function alignShiftLightSlots(svg, uid, cx, cy, rpmRadius, reference) {
    const rims=[...svg.querySelectorAll('[data-hud-part="outer-rim"] > path')];
    const lamps=['left','centre','right'].map(side=>svg.querySelector(`[data-role="shift-lamp-${side}"]`));
    if(rims.length!==2 || lamps.some(e=>!e)) throw new Error('Expected two rim paths and three source shift lamps.');
    const saved=[], additions=[];
    const remember=(e,k)=>{saved.push([e,k,e.getAttribute(k)]);};
    const f=n=>Number(n).toFixed(5);
    const pt=(radius,angle)=>[cx+radius*Math.cos(angle*Math.PI/180),cy+radius*Math.sin(angle*Math.PI/180)];
    function arcD(radius,a,b) {
      const p=pt(radius,a),q=pt(radius,b);
      return `M${f(p[0])},${f(p[1])} A${f(radius)},${f(radius)} 0 ${b-a>180?1:0},1 ${f(q[0])},${f(q[1])}`;
    }
    function intoParent(e) {
      return artworkTransform(reference,e.parentElement,svg);
    }
    // Exact filled circular capsule for clipping the glow INSIDE its recessed slot.
    function capsuleD(radius,a,b,halfWidth) {
      const outer=radius+halfWidth,inner=radius-halfWidth;
      const p=pt(outer,a),q=pt(outer,b),u=pt(inner,b),v=pt(inner,a);
      return `M${f(p[0])},${f(p[1])} A${f(outer)},${f(outer)} 0 0,1 ${f(q[0])},${f(q[1])} `+
        `A${f(halfWidth)},${f(halfWidth)} 0 0,1 ${f(u[0])},${f(u[1])} `+
        `A${f(inner)},${f(inner)} 0 0,0 ${f(v[0])},${f(v[1])} `+
        `A${f(halfWidth)},${f(halfWidth)} 0 0,1 ${f(p[0])},${f(p[1])} Z`;
    }
    // The permanent fascia occupies the same upper band, outside the RPM ticks.
    // Source RPM outer backing edge is R+11. Inner rim is R+13; outer rim R+28.
    const slotRadius=rpmRadius+21, slotWidth=9, borderWidth=10;
    const slotSpan=28, betweenSlots=3, start=-135;
    const rimRadii=[rpmRadius+28,rpmRadius+13];
    rims.forEach((e,i)=>{
      ['d','transform','stroke-width'].forEach(k=>remember(e,k));
      attr(e,'d',arcD(rimRadii[i],-210,30));
      attr(e,'transform',intoParent(e));
      attr(e,'stroke-width',i===0?1.2:1);
    });
    const outerGroup=rims[0].parentElement;
    const bed=node('path',{'data-role':'shift-light-reserved-band','data-skin-owned':uid,
      d:arcD(slotRadius,start-.3,-45+.3),transform:intoParent(rims[0]),fill:'none',
      stroke:'#111521','stroke-width':12,'stroke-linecap':'round','pointer-events':'none','aria-hidden':'true'});
    outerGroup.insertBefore(bed,outerGroup.firstChild);additions.push(bed);
    const defs=svg.querySelector('defs');
    lamps.forEach((lamp,i)=>{
      const a=start+i*(slotSpan+betweenSlots),b=a+slotSpan;
      const localTransform=intoParent(lamp), slotPath=arcD(slotRadius,a,b);
      // Source .lamp nodes are retained so cached controller roles still work.
      ['d','transform','clip-path','data-shift-slot-aligned'].forEach(k=>remember(lamp,k));
      const clip=node('clipPath',{id:`${uid}-shift-slot-${i}`,clipPathUnits:'userSpaceOnUse','data-skin-owned':uid});
      clip.append(node('path',{d:capsuleD(slotRadius,a,b,slotWidth/2)}));defs.append(clip);additions.push(clip);
      const backing=node('g',{'data-role':`shift-slot-${['left','centre','right'][i]}`,
        'data-skin-owned':uid,'data-slot-radius':slotRadius,'data-slot-start':a,'data-slot-end':b,
        transform:localTransform,'pointer-events':'none','aria-hidden':'true'});
      backing.append(node('path',{d:slotPath,fill:'none',stroke:'#292D40','stroke-width':borderWidth,'stroke-linecap':'round'}),
        node('path',{d:slotPath,fill:'none',stroke:'#0B0E19','stroke-width':slotWidth,'stroke-linecap':'round'}));
      lamp.parentElement.insertBefore(backing,lamp);additions.push(backing);
      // Shortening each core equally leaves both rounded ends within their slot.
      attr(lamp,'d',arcD(slotRadius,a+.35,b-.35));attr(lamp,'transform',localTransform);
      attr(lamp,'clip-path',`url(#${uid}-shift-slot-${i})`);attr(lamp,'data-shift-slot-aligned','v1');
    });
    remember(svg,'data-shift-slot-alignment');attr(svg,'data-shift-slot-alignment','concentric-v1');
    // destroy() restores all five original paths/attributes byte-for-byte.
    return {nodes:additions,restore(){for(const [e,k,value] of saved)attr(e,k,value);},
      geometry:{version:1,cx,cy,rpmRadius,slotRadius,slotWidth,borderWidth,
        slotSpanDegrees:slotSpan,gapDegrees:betweenSlots,startDegrees:start,
        coreInsetDegrees:.35,rimRadii,sourceThresholdsChanged:false}};
  }
  /** Attach AFTER the existing LMUHud has mounted. Do not construct a second HUD. */
  global.installRooklineManufacturerStyle = function (svg, options = {}) {
    if (!(svg instanceof SVGElement) || svg.localName !== 'svg') throw new TypeError('An inline SVG root is required.');
    if (instances.has(svg)) return instances.get(svg);
    const catalogue = options.catalogue || global.RooklineManufacturerCatalogue;
    if (!catalogue || !Array.isArray(catalogue.styles) || !Array.isArray(catalogue.cars)) throw new Error('Load catalogue.js first.');
    const profiles = new Map(catalogue.styles.map(p => [p.id, clone(p)]));
    const cars = new Map(catalogue.cars.map(c => [c.id, clone(c)]));
    if ([...profiles.values()].some(p => !validProfile(p))) throw new Error('Invalid manufacturer profile.');
    const part = id => svg.querySelector(`[data-hud-part="${id}"]`);
    const role = id => svg.querySelector(`[data-role="${id}"]`);
    const arc = part('rpm-arc'), track = part('rpm-track');
    const white = role('rpm-continuous-fill'), warning = role('rpm-warning-fill');
    if (!arc || !track || !white || !warning || svg.getAttribute('viewBox') !== '25 120 855 580')
      throw new Error('Requires the supplied 855 × 580 current speedometer, not the old 375 × 269 widget.');
    const d = white.getAttribute('d');
    const cx = Number(warning.dataset.cx), cy = Number(warning.dataset.cy), r = Number(warning.dataset.radius);
    if (![cx, cy, r].every(Number.isFinite) || r <= 0 || !d) throw new Error('Source RPM geometry unavailable.');
    const uid = `rl-skin-${++serial}`;
    const previous = {
      appearance:svg.getAttribute('data-manufacturer-style'), selection:svg.getAttribute('data-selected-car'),
      shiftAppearance:svg.getAttribute('data-shift-appearance'), instance:svg.getAttribute('data-manufacturer-skin-instance'),
      arcMask: arc.getAttribute('mask'), trackMask: track.getAttribute('mask'),
      vars: Object.fromEntries(['--skin-accent','--skin-rim','--skin-plate','--skin-track',
        '--skin-lamp-0','--skin-lamp-1','--skin-lamp-2','--skin-lamp-filter-0','--skin-lamp-filter-1','--skin-lamp-filter-2'].map(k => [k,svg.style.getPropertyValue(k)]))
    };
    let destroyed = false, original = false, profile = null, identity = null, logoResolver = null;
    let assetEpoch = 0, assetState = 'empty', guide = false;
    let shiftAppearance=options.shiftLightAppearance || 'manufacturer';
    if(!['manufacturer','native'].includes(shiftAppearance))throw new TypeError('Shift appearance must be manufacturer or native.');
    attr(svg,'data-manufacturer-skin-instance',uid);
    const defs = svg.querySelector('defs');
    if (!defs) throw new Error('Missing SVG definitions.');
    // A FULL source-progress reveal: not the capped rpm-continuous-fill path.
    // The controller publishes data-presented-fraction after each interpolated render.
    const reveal = node('mask',{id:uid+'-reveal',maskUnits:'userSpaceOnUse',x:25,y:120,width:855,height:580,'data-skin-owned':uid});
    const revealPath = node('path',{d,fill:'none',stroke:'white','stroke-width':24,pathLength:1,
      'stroke-dasharray':'0 1','stroke-dashoffset':0,'stroke-linecap':'butt','data-role':'manufacturer-full-reveal'});
    reveal.append(revealPath);defs.append(reveal);
    const paint = node('g',{'data-skin-owned':uid,'data-role':'manufacturer-rpm-paint',mask:`url(#${uid}-reveal)`,'pointer-events':'none','aria-hidden':'true'});
    const cellsTrack = node('g',{'data-skin-owned':uid,'data-role':'manufacturer-rpm-track','pointer-events':'none','aria-hidden':'true'});
    arc.append(paint);track.append(cellsTrack);
    // Colour-specific glow stays clipped by the existing v1.2 shift-slot capsules.
    const lampFloods=[], lampFilters=[];
    for(let i=0;i<3;i++) {
      const filter=node('filter',{id:`${uid}-lamp-glow-${i}`,x:'-30%',y:'-150%',width:'160%',height:'400%',
        'color-interpolation-filters':'sRGB','data-skin-owned':uid});
      const shadow=node('feDropShadow',{dx:0,dy:0,stdDeviation:1.8,'flood-opacity':.75,'flood-color':'#ff2148'});
      filter.append(shadow);defs.append(filter);lampFloods.push(shadow);lampFilters.push(filter);
    }
    // Owner-marked slot INSIDE the dial: beside gear, above the battery icon.
    // This is a runtime image only; neither logos nor URLs are baked into presets.
    const slotBounds = Object.freeze({x:628,y:296,width:118,height:98});
    const brand = node('g',{'data-skin-owned':uid,'data-role':'manufacturer-brand-section','pointer-events':'none',display:'none'});
    const slot = node('g',{'data-role':'manufacturer-logo-slot','aria-label':'Manufacturer logo supplied by the host','data-asset-state':'empty'});
    const slotFrame = node('rect',{...slotBounds,rx:6,fill:'none',stroke:'#536376','stroke-width':1.2,'stroke-dasharray':'4 4','data-role':'manufacturer-logo-guide',display:'none'});
    const guideLabel = node('text',{x:687,y:348,'text-anchor':'middle',fill:'#91A2B4','font-size':8.5,'letter-spacing':.65,'font-family':'system-ui,sans-serif',display:'none','data-role':'manufacturer-logo-placeholder'});
    guideLabel.textContent='LIVE LOGO ASSET';
    const image = node('image',{...slotBounds,preserveAspectRatio:'xMidYMid meet',display:'none','data-role':'manufacturer-logo-image'});
    const name = node('text',{x:slotBounds.x+slotBounds.width/2,y:414,'text-anchor':'middle',fill:'#DCE5F0','font-size':15,'font-weight':600,'font-family':'RooklineLmuLiveNumerals,Arial,sans-serif','data-role':'manufacturer-name'});
    const model = node('text',{x:slotBounds.x+slotBounds.width/2,y:433,'text-anchor':'middle',fill:'#92A4B9','font-size':12,'font-family':'RooklineLmuLiveNumerals,Arial,sans-serif','data-role':'manufacturer-car-name'});
    slot.append(slotFrame,guideLabel,image);brand.append(slot,name,model);svg.append(brand);
    const batteryArtwork = restoreBatteryActivityArtwork(svg, uid);
    const shiftAlignment = alignShiftLightSlots(svg, uid, cx, cy, r, white);
    const owned = [reveal,paint,cellsTrack,brand,...lampFilters,...batteryArtwork,...shiftAlignment.nodes];
    const emit = () => svg.dispatchEvent(new CustomEvent('rookline-logo-state',{detail:{state:assetState,identity:identity ? {...identity} : null}}));
    const ensureAlive = () => { if (destroyed) throw new Error('Manufacturer style has been destroyed.'); };
    function updateGuide() {
      const empty = assetState !== 'ready';
      attr(slotFrame,'display',guide && empty ? 'inline':'none');
      attr(guideLabel,'display',guide && empty ? 'inline':'none');
    }
    function invalidateLogo() {
      ++assetEpoch;assetState='empty';attr(image,'href',null);attr(image,'display','none');
      attr(slot,'data-asset-state',assetState);updateGuide();emit();
    }
    function safeAssetUrl(source) {
      if (typeof source !== 'string' || !source.trim() || source.length > 5_000_000) throw new TypeError('Logo source must be a URL string or null.');
      const value=source.trim();
      if (/^data:/i.test(value) && !/^data:image\/(png|jpeg|webp|gif|svg\+xml);/i.test(value)) throw new TypeError('Only image data URLs are accepted.');
      const parsed = new URL(value,document.baseURI);
      if (!['https:','http:','blob:','data:','file:'].includes(parsed.protocol)) throw new TypeError('Unsupported logo URL protocol.');
      return parsed.href;
    }
    async function loadLogo(source, alt, token) {
      if (source == null || source === '') return false;
      let url;
      try { url=safeAssetUrl(source); } catch(error) {
        if (token===assetEpoch) {assetState='error';attr(slot,'data-asset-state','error');updateGuide();emit();}
        throw error;
      }
      if (destroyed || token!==assetEpoch) return false;
      assetState='loading';attr(slot,'data-asset-state','loading');updateGuide();emit();
      return new Promise(resolve => {
        const loader = new Image();
        let settled=false;
        const timeout=setTimeout(()=>finish(false),10000);
        function finish(ok) {
          if (settled) return;settled=true;clearTimeout(timeout);loader.onload=null;loader.onerror=null;
          if (destroyed || token!==assetEpoch) return resolve(false);
          if (ok && loader.naturalWidth>0 && loader.naturalHeight>0) {
            attr(image,'href',url);attr(image,'display','inline');attr(image,'aria-label',alt || 'Live manufacturer logo');assetState='ready';
          } else {attr(image,'href',null);attr(image,'display','none');assetState='error';}
          attr(slot,'data-asset-state',assetState);updateGuide();emit();resolve(assetState==='ready');
        }
        loader.onload=()=>finish(true);loader.onerror=()=>finish(false);loader.src=url;
      });
    }
    function setLogoSource(source, alt='Live manufacturer logo') {
      ensureAlive();invalidateLogo();return loadLogo(source,alt,assetEpoch);
    }
    async function requestLogo() {
      const token=assetEpoch;
      if (!logoResolver || !identity) return false;
      try {
        const result=await logoResolver({...identity});
        if (destroyed || token!==assetEpoch) return false;
        const value=typeof result==='string' ? {src:result} : result;
        return await loadLogo(value?.src ?? null,value?.alt,token);
      } catch(error) {
        if (!destroyed && token===assetEpoch) {assetState='error';attr(slot,'data-asset-state','error');updateGuide();emit();}
        return false;
      }
    }
    function fitText(e, value, normalSize) {
      e.textContent=value;attr(e,'font-size',normalSize);
      attr(e,'textLength',null);attr(e,'lengthAdjust',null);
      // Resize label typography only. Never move the HUD fields to fit a name.
      const length=e.getComputedTextLength();
      const labelWidth=slotBounds.width-4; // keep glyph bearings inside the reserved slot
      if (length>labelWidth) attr(e,'font-size',Math.max(7,normalSize*labelWidth/length));
      if(e.getComputedTextLength()>labelWidth){attr(e,'textLength',labelWidth);attr(e,'lengthAdjust','spacingAndGlyphs');}
    }
    const degrees = n=>n*Math.PI/180;
    const pt = (radius,angle)=>[cx+radius*Math.cos(degrees(angle)),cy+radius*Math.sin(degrees(angle))];
    const pointText = p=>p.map(n=>n.toFixed(5)).join(',');
    function colourAt(f) {
      return (profile.colourZones.find(z=>f>=z.fromFraction && f<z.toFraction)||profile.colourZones[3]).colour;
    }
    function annularCell(a,b,halfWidth,slant=0) {
      const ro=r+halfWidth,ri=r-halfWidth;
      return `M${pointText(pt(ro,a+slant))} A${ro},${ro} 0 0,1 ${pointText(pt(ro,b+slant))} `+
        `L${pointText(pt(ri,b-slant))} A${ri},${ri} 0 0,0 ${pointText(pt(ri,a-slant))} Z`;
    }
    function makeCell(i,n) {
      const pitch=240/n, angle=-210+pitch*(i+.5), length=degrees(pitch)*r;
      const group=profile.majorEvery>0;
      const gapA=profile.gapSvgUnits*((group && i>0 && i%profile.majorEvery===0)?profile.majorGapMultiplier:1);
      const gapB=profile.gapSvgUnits*((group && i<n-1 && (i+1)%profile.majorEvery===0)?profile.majorGapMultiplier:1);
      const a=-210+pitch*i+gapA/(2*r)*180/Math.PI;
      const b=-210+pitch*(i+1)-gapB/(2*r)*180/Math.PI;
      const [x,y]=pt(r,angle), mode=profile.shapeMode;
      let e;
      if(mode==='round_dots') {
        // Actual circles. Diameter is bounded by both arc pitch and band width.
        e=node('circle',{cx:x,cy:y,r:Math.max(1,Math.min(9,(length-Math.max(gapA,gapB))/2))});
      } else if(mode==='fine_blocks') {
        const width=Math.max(1,length-(gapA+gapB)/2);
        // Keep all four rectangular corners WITHIN the original RPM band.
        const height=Math.min(18,2*(Math.sqrt((r+9.5)**2-(width/2)**2)-r));
        e=node('rect',{x:-width/2,y:-height/2,width,height,rx:1.6,
          transform:`translate(${x} ${y}) rotate(${angle+90})`});
      } else if(mode==='fine_ticks') {
        const p=pt(r-9,angle),q=pt(r+9,angle);
        e=node('line',{x1:p[0],y1:p[1],x2:q[0],y2:q[1],
          'stroke-width':Math.max(1,Math.min(3.2,length-Math.max(gapA,gapB))),'stroke-linecap':'butt'});
      } else {
        const slant=mode==='angled_segments'?profile.slantDegrees:0;
        e=node('path',{d:annularCell(a,b,9.5,slant)});
      }
      attr(e,'class',mode==='fine_ticks'?'rpm-tick':'rpm-cell');
      attr(e,'data-rpm-cell',i);attr(e,'data-cell-fraction',(i+.5)/n);
      attr(e,'data-shape-mode',mode);
      return e;
    }
    function buildPaint() {
      paint.replaceChildren();cellsTrack.replaceChildren();
      if(profile.shapeMode==='continuous_band') {
        // Four contiguous annular shapes, not a sliced band or a masked tick pattern.
        profile.colourZones.forEach((z,i)=>{
          const e=node('path',{d:annularCell(-210+240*z.fromFraction,-210+240*z.toFraction,9.5),
            class:'rpm-cell','data-rpm-cell':i,'data-shape-mode':'continuous_band'});
          e.style.setProperty('--cell-colour',z.colour);paint.append(e);
        });
        // Only the muted source backing is needed for a continuous band.
      } else {
        for(let i=0;i<profile.segmentCount;i++) {
          const e=makeCell(i,profile.segmentCount),base=e.cloneNode(true);
          e.style.setProperty('--cell-colour',colourAt((i+.5)/profile.segmentCount));
          // 0.875 is the RETAINED source's static red BACKING extent, never a reveal cap.
          attr(base,'data-track-red-zone',String((i+.5)/profile.segmentCount>=.875));
          cellsTrack.append(base);paint.append(e);
        }
      }
      for(const [key,value] of Object.entries({'--skin-accent':profile.accent,'--skin-rim':profile.rimColour,'--skin-plate':profile.plateColour,'--skin-track':profile.trackColour}))svg.style.setProperty(key,value);
      profile.shiftPalette.forEach((c,i)=>attr(lampFloods[i],'flood-color',c));
      // External CSS owns the rules; per-instance custom properties keep CSP
      // intact without changing the source lamps' own styles or activation.
      profile.shiftPalette.forEach((colour,i)=>{
        svg.style.setProperty(`--skin-lamp-${i}`,colour);
        svg.style.setProperty(`--skin-lamp-filter-${i}`,`url(#${uid}-lamp-glow-${i})`);
      });
      refresh();
    }
    function refresh() {
      if(destroyed || !profile)return;
      attr(svg,'data-manufacturer-style',original?'original':profile.id);
      attr(svg,'data-shift-appearance',shiftAppearance);
      attr(brand,'display',original?'none':'inline');
      attr(arc,'mask',previous.arcMask);attr(track,'mask',previous.trackMask);
      const raw=arc.getAttribute('data-presented-fraction');
      const measured=raw!==null && raw.trim()!=='' && raw!=='unavailable' && Number.isFinite(Number(raw));
      const available=arc.getAttribute('data-paint-available')!=='false';
      const auto=arc.getAttribute('data-colour-mode')!=='custom';
      const enabled=arc.getAttribute('data-colour-enabled')!=='false';
      const limiter=part('speed-limiter')?.getAttribute('data-state')==='on';
      const fullRed=arc.getAttribute('data-full-red')==='true';
      const fraction=measured?(limiter?1:Math.max(0,Math.min(1,Number(raw)))):0;
      attr(paint,'display',!original && measured && fraction>0?'inline':'none');
      attr(paint,'data-rpm-paint-mode',!available||!auto||!enabled||limiter?'source':fullRed?'full-red':'brand');
      attr(paint,'data-reveal-fraction',fraction);
      attr(paint,'data-source-progress',measured?'available':'unavailable');
      attr(revealPath,'stroke-dasharray',`${fraction} 1`);
      attr(revealPath,'display',fraction>0?'inline':'none');
      // No RPM normalization, no new thresholds, no controller state or roles mutation.
    }
    function setSelection(selection) {
      ensureAlive();
      if(!selection || typeof selection.carId!=='string')throw new TypeError('An explicit preview carId is required.');
      const car=cars.get(selection.carId);
      if(!car)throw new Error('Unknown preview carId; no alias matching is performed.');
      const manufacturerId=selection.manufacturerId ?? car.manufacturerId;
      if(car.manufacturerId!==manufacturerId)throw new Error('The selected car does not belong to this manufacturer.');
      const next=profiles.get(manufacturerId);if(!next)throw new Error('Unknown manufacturer.');
      const changed=!identity || identity.carId!==car.id || identity.manufacturerId!==manufacturerId;
      identity={manufacturerId,carId:car.id};profile=clone(next);original=false;
      attr(svg,'data-selected-car',car.id);
      fitText(name,next.name,15);fitText(model,car.name.replace(next.name+' ',''),12);
      buildPaint();
      if(changed) {invalidateLogo();void requestLogo();}
      return getConfiguration();
    }
    // Production selects paint by admitted raw manufacturer, never by a preview
    // car ID. Caption text and the raw VEH stay unchanged; identity is renderer
    // context only and cannot admit telemetry or operations.
    function setLiveManufacturer(profileId, manufacturer, vehicleModel, vehicleFileName) {
      ensureAlive();
      const next=profiles.get(profileId);
      if(!next || typeof manufacturer!=='string' || typeof vehicleModel!=='string' ||
          typeof vehicleFileName!=='string') throw new TypeError('Explicit host appearance context required.');
      const changed=!identity || identity.carId!==vehicleFileName || identity.manufacturer!==manufacturer;
      identity={manufacturerId:profileId,carId:vehicleFileName,manufacturer};
      profile=clone(next);original=false;
      attr(svg,'data-selected-car',vehicleFileName);
      fitText(name,manufacturer,15);fitText(model,vehicleModel,12);
      buildPaint();
      if(changed)invalidateLogo();
      return getConfiguration();
    }
    function clearLiveManufacturer() {
      ensureAlive();invalidateLogo();identity=null;profile=null;original=false;
      paint.replaceChildren();cellsTrack.replaceChildren();
      attr(paint,'display','none');attr(svg,'data-shift-appearance',previous.shiftAppearance);
      attr(arc,'mask',previous.arcMask);attr(track,'mask',previous.trackMask);
      attr(svg,'data-manufacturer-style',null);attr(svg,'data-selected-car',null);
      name.textContent='';model.textContent='';
      attr(brand,'display','none');
      Object.entries(previous.vars).forEach(([k,v])=>v?svg.style.setProperty(k,v):svg.style.removeProperty(k));
    }
    function setProfilePatch(patch) {
      ensureAlive();if(!profile)throw new Error('Select a car first.');
      if(!patch || typeof patch!=='object')throw new TypeError('Expected a profile patch.');
      const allowed=['shapeMode','segmentCount','gapSvgUnits','slantDegrees','majorEvery','palette','shiftPalette'];
      if(Object.keys(patch).some(k=>!allowed.includes(k)))throw new Error('Only appearance geometry and RPM/shift palettes may be edited.');
      const next={...profile,...clone(patch)};
      next.majorGapMultiplier = next.majorEvery > 0 ? 1.5 : 1;
      if(!validProfile(next))throw new Error('Invalid appearance shape, geometry or four RPM/three shift colours.');
      // Bound every cut to less than one segment's arc pitch.
      const pitch=2*Math.PI*r*(240/360)/next.segmentCount;
      if(next.gapSvgUnits*next.majorGapMultiplier >= pitch*.75)throw new Error('Gap would consume too much of an RPM segment.');
      next.colourZones=next.colourZones.map((z,i)=>({...z,colour:next.palette[i]}));
      profile=next;buildPaint();return clone(profile);
    }
    function getConfiguration(){return {schemaVersion:2,build:'2026-10-13-switcher-v1.3',catalogueBuild:catalogue.build,identity:identity?{...identity}:null,appearance:original?'original':'manufacturer',shiftLightAppearance:shiftAppearance,profile:profile?clone(profile):null,logoSlot:{...slotBounds,fit:'contain',source:'host-supplied-runtime-asset',embeddedLogo:false},shiftSlotGeometry:clone(shiftAlignment.geometry),note:'Style data only; no measured values, native thresholds, logo URLs or saved aliases.'};}
    const observer=new MutationObserver(records=>{
      if(records.some(record=>!record.target.closest?.('[data-skin-owned]')))refresh();
    });
    observer.observe(svg,{subtree:true,attributes:true,attributeFilter:['display','stroke-dasharray','data-paint-available','data-colour-mode','data-colour-enabled','data-state','data-full-red','data-presented-fraction','style']});
    const api={
      svg,setSelection,setLiveManufacturer,clearLiveManufacturer,setProfilePatch,refresh,setLogoSource,getConfiguration,
      getProfile:()=>profile?clone(profile):null,
      getLogoState:()=>({state:assetState,identity:identity?{...identity}:null}),
      setOriginal(value){ensureAlive();original=Boolean(value);refresh();},
      setLogoGuide(value){ensureAlive();guide=Boolean(value);updateGuide();},
      setLogoResolver(resolver){ensureAlive();if(resolver!==null && typeof resolver!=='function')throw new TypeError('A function or null is required.');logoResolver=resolver;invalidateLogo();return requestLogo();},
      setShiftLightAppearance(mode){ensureAlive();if(!['manufacturer','native'].includes(mode))throw new TypeError('Shift appearance must be manufacturer or native.');shiftAppearance=mode;refresh();},
      resetProfile(){ensureAlive();if(identity) {profile=clone(profiles.get(identity.manufacturerId));buildPaint();}},
      destroy(){if(destroyed)return;destroyed=true;observer.disconnect();++assetEpoch;shiftAlignment.restore();owned.forEach(e=>e.remove());attr(arc,'mask',previous.arcMask);attr(track,'mask',previous.trackMask);attr(svg,'data-manufacturer-style',previous.appearance);attr(svg,'data-selected-car',previous.selection);attr(svg,'data-shift-appearance',previous.shiftAppearance);attr(svg,'data-manufacturer-skin-instance',previous.instance);Object.entries(previous.vars).forEach(([k,v])=>v?svg.style.setProperty(k,v):svg.style.removeProperty(k));instances.delete(svg);}
    };
    instances.set(svg,api);
    // The default belongs solely to the attachment's manual preview. A live
    // host installs geometry without inventing a manufacturer or car selection.
    try {if(!options.live)setSelection(options.selection || {carId:'bmw-m-hybrid-v8'});} catch(error){api.destroy();throw error;}
    return api;
  };
})(window);
