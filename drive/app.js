'use strict';
const INSTRUMENTS=[
  {
    "id": "speedo",
    "name": "The driving instrument.",
    "category": "CAR STATE",
    "image": "assets/speedo.jpg",
    "alt": "Drive Speedo with gear, speed, fuel, virtual energy, electronics and temperature values.",
    "description": "Speed, gear and RPM up front, with fuel, energy and car information close by.",
    "takeaway": "Keep the essentials close."
  },
  {
    "id": "tyres",
    "name": "Four corners, understood.",
    "category": "TYRES + BRAKES",
    "image": "assets/tyres.jpg",
    "alt": "Drive tyre panel showing four soft tyres with wear, pressure, estimated rubber temperature and brake temperatures.",
    "description": "Wear, compound, pressure and temperatures, together at all four corners.",
    "takeaway": "Stay on top of your tyres."
  },
  {
    "id": "timing",
    "name": "The lap, in context.",
    "category": "TIMING + FEEDBACK",
    "image": "assets/timing.jpg",
    "alt": "Drive lap timing panel with lap times, sectors and a green negative delta.",
    "description": "Lap times, sectors and delta, ready for a quick glance.",
    "takeaway": "Chase the next tenth."
  },
  {
    "id": "standings",
    "name": "Your place in the field.",
    "category": "RACE POSITION",
    "image": "assets/standings.jpg",
    "alt": "Drive standings tower with Hypercar entries, the highlighted player in position 4, tyre and energy indicators.",
    "description": "The multiclass tower shows nearby cars in your class and the leaders of the other classes. See timing, tyres, energy and penalties, and switch views with your bindings.",
    "takeaway": "Keep race context within a glance."
  },
  {
    "id": "map",
    "name": "Traffic and track conditions.",
    "category": "TRACK AWARENESS",
    "image": "assets/track-map.jpg",
    "alt": "Long Beach circuit map with traffic and a cyan player marker.",
    "description": "All cars, Your class and Follow your car provide three perspectives. In Follow mode the player points up while the circuit and traffic move together. Choose a player marker style, follow estimated wetting and drying, compare online pace patterns and spot active yellow sectors.",
    "takeaway": "Know what is around the next corner."
  },
  {
    "id": "weather",
    "name": "Weather and road conditions.",
    "category": "WEATHER + FORECAST",
    "image": "assets/weather.jpg",
    "alt": "Drive weather panel with current conditions and a five-part forecast.",
    "description": "Current conditions and the session forecast, side by side.",
    "takeaway": "Keep one eye on the sky."
  },
  {
    "id": "flags",
    "name": "Signals that earn their space.",
    "category": "FLAGS + MESSAGES",
    "image": "assets/compact-flags.png",
    "alt": "Race flags, a green pit-service wrench and a Leader Finished message.",
    "description": "Race warnings and pit-service updates appear when you need them. Follow your stop with elapsed time and each job’s progress.",
    "takeaway": "A quick glance, then back to the race.",
    "compact": true
  }
];
const RESEARCH=[
  {
    "id": "engine-context",
    "title": "That doesn’t sound right.",
    "image": "assets/damage-engine.jpg",
    "alt": "Drive engine and oil warnings.",
    "copy": "Heat and suspected engine failure get their own cues."
  },
  {
    "id": "tyre-research",
    "title": "Four little contact patches.",
    "image": "assets/tyres.jpg",
    "alt": "Drive tyre panel showing wear and temperatures at all four corners.",
    "copy": "A quick glance at the rubber doing all the hard work."
  },
  {
    "id": "wetness-evolution",
    "title": "When the sky changes its mind.",
    "image": "assets/imola-wetness-comparison.png",
    "alt": "Historical Imola comparison: LMU wetness in steps, Drive's recorded track average and a weather-only reference. The lower plot shows the contribution of recorded tyre observations.",
    "copy": "An earlier Imola storm, seen two ways. Game-reported stages alongside Drive’s smooth estimate.",
    "chart": true
  }
];
const el=id=>document.getElementById(id);
let activePanel=0;
const tabs=[...document.querySelectorAll('[data-panel]')];
const stage=document.querySelector('.instrument-stage');
stage.id='instrument-panel';stage.setAttribute('role','tabpanel');stage.setAttribute('aria-labelledby','instrument-speedo');
tabs.forEach(tab=>tab.setAttribute('aria-controls','instrument-panel'));
function choosePanel(index,focus=false){
  activePanel=(index+INSTRUMENTS.length)%INSTRUMENTS.length;
  const item=INSTRUMENTS[activePanel];
  tabs.forEach((tab,i)=>{const active=i===activePanel;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;if(active&&focus)tab.focus();});
  stage.setAttribute('aria-labelledby','instrument-'+item.id);
  el('plate-number').textContent='INSTRUMENT '+String(activePanel+1).padStart(2,'0')+' / 07';
  el('plate-category').textContent=item.category;
  el('plate-image').src=item.image;el('plate-image').alt=item.alt;el('plate-image').classList.toggle('compact',!!item.compact);
  el('plate-title').textContent=item.name;el('plate-description').textContent=item.description;
  el('plate-takeaway').textContent=item.takeaway;
  el('open-image').setAttribute('aria-label','Enlarge '+item.name.replace(/\.$/,'')+' screenshot');
}
tabs.forEach((tab,index)=>{
  tab.addEventListener('click',()=>choosePanel(index));
  tab.addEventListener('keydown',event=>{
    let next;
    if(event.key==='ArrowRight'||event.key==='ArrowDown')next=index+1;
    if(event.key==='ArrowLeft'||event.key==='ArrowUp')next=index-1;
    if(event.key==='Home')next=0;if(event.key==='End')next=INSTRUMENTS.length-1;
    if(next!==undefined){event.preventDefault();choosePanel(next,true);}
  });
});
el('previous-panel').addEventListener('click',()=>choosePanel(activePanel-1));
el('next-panel').addEventListener('click',()=>choosePanel(activePanel+1));
function node(tag,className,text){const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n;}
for(const note of RESEARCH){
 const article=node('article','visual-note');article.id='research-'+note.id;
 const image=node('img');image.src=note.image;image.alt=note.alt;image.loading='lazy';
 image.width=1363;image.height=936;
 if(note.chart){
  article.classList.add('visual-note--chart');image.width=1540;image.height=1050;
  const link=node('a','research-chart-open');link.href=note.image;link.target='_blank';link.rel='noopener noreferrer';
  link.setAttribute('aria-label','View the full Imola comparison (opens in a new tab)');
  link.append(image,node('span','research-chart-action','View full comparison ↗'));
  const caption=node('div','research-chart-copy');caption.append(node('span','micro','IMOLA / 7 NOVEMBER 2026 / EARLIER MODEL'),node('h3','',note.title),node('p','',note.copy));
  article.append(link,caption);
 }else article.append(image,node('h3','',note.title),node('p','',note.copy));
 el('research-notes').append(article);
}
const indexDialog=el('index-dialog'),imageDialog=el('image-dialog');
function lockScroll(){document.body.style.overflow='hidden';}
function unlockScroll(){if(!indexDialog.open&&!imageDialog.open)document.body.style.overflow='';}
document.querySelector('.index-trigger').addEventListener('click',()=>{indexDialog.showModal();lockScroll();});
el('close-index').addEventListener('click',()=>indexDialog.close());
indexDialog.addEventListener('close',unlockScroll);
indexDialog.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>indexDialog.close()));
el('open-image').addEventListener('click',()=>{
 const item=INSTRUMENTS[activePanel];el('image-title').textContent=item.name.toUpperCase();el('dialog-image').src=item.image;el('dialog-image').alt=item.alt;el('dialog-image').classList.toggle('compact',!!item.compact);
 el('dialog-caption').textContent=item.name;
 imageDialog.showModal();lockScroll();
});
el('close-image').addEventListener('click',()=>imageDialog.close());
imageDialog.addEventListener('close',unlockScroll);
imageDialog.addEventListener('click',event=>{if(event.target===imageDialog){const r=imageDialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)imageDialog.close();}});
function openEvidenceForHash(hash){
 const target=document.getElementById(hash.slice(1));if(!target)return;
 let parent=target.parentElement;while(parent){if(parent.tagName==='DETAILS')parent.open=true;parent=parent.parentElement;}
 if(target.tagName==='DETAILS')target.open=true;
}
document.addEventListener('click',event=>{
 const a=event.target.closest('a[href^="#"]');if(a)openEvidenceForHash(a.getAttribute('href'));
});
window.addEventListener('hashchange',()=>openEvidenceForHash(location.hash));
if(location.hash)openEvidenceForHash(location.hash);
const railLinks=[...document.querySelectorAll('.chapter-rail nav a')];
if('IntersectionObserver' in window){
 const observer=new IntersectionObserver(entries=>{const visible=entries.filter(e=>e.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];if(visible){railLinks.forEach(a=>{const active=a.dataset.section===visible.target.id;a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current');});}},{rootMargin:'-12% 0px -45% 0px',threshold:0});
 document.querySelectorAll('section[id]').forEach(section=>observer.observe(section));
}
let scrollQueued=false;
function updateProgress(){const max=document.documentElement.scrollHeight-window.innerHeight;document.querySelector('.reading-progress').style.transform='scaleX('+(max>0?Math.min(1,Math.max(0,window.scrollY/max)):0)+')';scrollQueued=false;}
window.addEventListener('scroll',()=>{if(!scrollQueued){scrollQueued=true;requestAnimationFrame(updateProgress);}},{passive:true});window.addEventListener('resize',updateProgress);updateProgress();
choosePanel(0);


// Portfolio-only image comparisons; all images are captures of the production renderer.
const CONDITION_STATES=[
 {id:'corners',title:'Localise the damage.',image:'assets/damage-corners.jpg',alt:'Drive car diagram with front and left body damage plus independently coloured suspension corners.',description:'Spot bodywork and suspension damage at a glance, right down to the affected corner.',takeaway:'Know which corner needs attention.'},
 {id:'puncture',title:'Recognise a puncture.',image:'assets/damage-puncture.jpg',alt:'Drive Speedo with an amber warning on the front-left tyre, with a pulsing puncture warning.',description:'A pulsing amber warning highlights the punctured tyre. Low wear has its own steady warning.',takeaway:'Find the tyre that needs a closer look.'},
 {id:'detachment',title:'See the whole affected corner.',image:'assets/damage-detachment.jpg',alt:'Drive Speedo with coordinated red front-left tyre, brake and suspension warnings and a separate rear-wing warning.',description:'A missing wheel highlights the affected tyre, brake and suspension in red. A separate warning calls out a lost rear wing.',takeaway:'See the damage before heading back out.'},
 {id:'overheating',title:'Read the thermal warning.',image:'assets/damage-overheating.jpg',alt:'Drive Speedo with an orange engine indicator and red oil-temperature indication for overheating.',description:'An orange engine symbol and red oil feedback call out overheating. Suspected engine failure has its own red engine warning.',takeaway:'See which engine warning needs your attention.'},
 {id:'engine',title:'Interpret the stopped engine.',image:'assets/damage-engine.jpg',alt:'Drive Speedo at zero speed and neutral with a red engine warning.',description:'A red engine warning flags a suspected failure. Read it alongside the temperature and damage warnings.',takeaway:'Know when to head back to the pits.'}
];
const SPEEDO_STYLES=[
 {id:'bmw',title:'BMW M Hybrid V8',design:'72 ANGLED SEGMENTS',description:'Angled segments and a blue/cyan palette give the BMW profile its character. Speed, gear and warning cues stay in familiar places.'},
 {id:'ferrari',title:'Ferrari 499P',design:'60 CIRCULAR LEDS',description:'Circular LEDs move through yellow, amber, orange and red, paired with the Ferrari profile’s warm rim and shift-light palette.'},
 {id:'aston',title:'Aston Martin Valkyrie',design:'CONTINUOUS COLOUR BAND',description:'An unbroken arc uses green, lime, amber and red zones. Its continuous geometry gives the same driving information a different visual rhythm.'},
 {id:'porsche',title:'Porsche 963',design:'60 FINE ROUNDED BLOCKS',description:'Fine rounded blocks progress from silver through cyan to blue. The manufacturer identity changes the appearance while the warning and RPM states retain their meaning.'},
 {id:'cadillac',title:'Cadillac V-Series.R',design:'40 BROAD CURVED BLOCKS',description:'Broad curved blocks and a silver, gold, amber and red palette create a more widely spaced instrument treatment.'},
 {id:'alpine',title:'Alpine A424',design:'120 FINE RADIAL TICKS',description:'A dense set of fine radial ticks uses blue, white and red, for a crisp, detailed arc.'}
].map(s=>({...s,image:'assets/custom-speedo-'+s.id+'.jpg',alt:s.title+' Speedo with '+s.design.toLowerCase()+'.'}));
let conditionIndex=0,skinIndex=0;
function setChoiceTabs(selector,index,panelId,focus=false){
 const list=[...document.querySelectorAll(selector)];
 list.forEach((tab,i)=>{tab.setAttribute('aria-selected',String(i===index));tab.setAttribute('aria-controls',panelId);tab.tabIndex=i===index?0:-1;if(i===index&&focus)tab.focus();});
 el(panelId).setAttribute('aria-labelledby',list[index].id);
}
function chooseCondition(index,focus=false){
 conditionIndex=(index+CONDITION_STATES.length)%CONDITION_STATES.length;const c=CONDITION_STATES[conditionIndex];
 setChoiceTabs('[data-condition]',conditionIndex,'condition-panel',focus);
 el('condition-image').src=c.image;el('condition-image').alt=c.alt;el('condition-title').textContent=c.title;el('condition-description').textContent=c.description;
 el('condition-takeaway').textContent=c.takeaway;
}
function chooseSkin(index,focus=false){
 skinIndex=(index+SPEEDO_STYLES.length)%SPEEDO_STYLES.length;const c=SPEEDO_STYLES[skinIndex];
 setChoiceTabs('[data-skin]',skinIndex,'custom-speedo-panel',focus);
 el('skin-image').src=c.image;el('skin-image').alt=c.alt;el('skin-title').textContent=c.title;el('skin-design').textContent=c.design;el('skin-description').textContent=c.description;
}
function bindChoiceTabs(selector,choose){
 const list=[...document.querySelectorAll(selector)];list.forEach((tab,i)=>{
  tab.addEventListener('click',()=>choose(i));
  tab.addEventListener('keydown',e=>{let n;if(['ArrowRight','ArrowDown'].includes(e.key))n=i+1;if(['ArrowLeft','ArrowUp'].includes(e.key))n=i-1;if(e.key==='Home')n=0;if(e.key==='End')n=list.length-1;if(n!==undefined){e.preventDefault();choose(n,true);}});
 });
}
bindChoiceTabs('[data-condition]',chooseCondition);bindChoiceTabs('[data-skin]',chooseSkin);
function inspectPortfolioImage(item,caption){el('image-title').textContent=item.title.toUpperCase();el('dialog-image').src=item.image;el('dialog-image').alt=item.alt;el('dialog-image').classList.remove('compact');el('dialog-caption').textContent=caption;imageDialog.showModal();lockScroll();}
el('open-condition').addEventListener('click',()=>inspectPortfolioImage(CONDITION_STATES[conditionIndex],CONDITION_STATES[conditionIndex].title));
el('open-skin').addEventListener('click',()=>inspectPortfolioImage(SPEEDO_STYLES[skinIndex],SPEEDO_STYLES[skinIndex].title));
chooseCondition(0);chooseSkin(0);
