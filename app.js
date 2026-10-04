const STORAGE_KEY = 'polished-business-v1';
const SETUP_KEY = 'polished-setup-complete-v1';
const blankState = () => ({ services: [], extras: [], inventory: [], calculations: [], appointments: [], goal: { targetProfit: 1000 } });
let state = loadState();
let setupComplete = localStorage.getItem(SETUP_KEY) === 'true' || localStorage.getItem(STORAGE_KEY) !== null;
let page = setupComplete ? 'schedule' : 'setup';
let setupStep = 0;
let catalogTab = 'services';
let calc = { serviceId: '', price: '', time: '', unit: 'Minutes', material: '', client: '', extras: [], adjustmentType: 'add', adjustmentAmount: '', adjustmentOpen: false, tweaksOpen: false, inputsOpen: true, breakdownOpen: false };
let calendar = { mode: 'week', date: new Date() };
let modalReturnFocus = null;
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const editIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>';
function loadState(){ try { const v=JSON.parse(localStorage.getItem(STORAGE_KEY)); if(!v||!Array.isArray(v.services))return blankState(); const migrated={...blankState(),...v,goal:v.goal||{targetProfit:1000},services:Array.isArray(v.services)?v.services:[],extras:Array.isArray(v.extras)?v.extras:[],inventory:Array.isArray(v.inventory)?v.inventory:[],calculations:Array.isArray(v.calculations)?v.calculations:[],appointments:Array.isArray(v.appointments)?v.appointments:[]}; const known=new Set(migrated.extras.map(e=>e.id)); for(const s of migrated.services){for(const e of s.extras||[]){if(!known.has(e.id)){migrated.extras.push({...e,serviceId:undefined});known.add(e.id)}}} return migrated; } catch { return blankState(); } }
function save(){
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (error) {
    console.error('Could not save Polished data.', error);
    toast('Your browser could not save this change. Free up storage and try again.');
    return false;
  }
}
function id(){ return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function money(v){ return Number.isFinite(Number(v)) ? '$'+Number(v).toFixed(2) : '$0.00'; }
function num(v){ if(v === '' || v === null || v === undefined) return null; const n=Number(v); return Number.isFinite(n) ? n : null; }
function localDate(d=new Date()){ const x=new Date(d.getTime()-d.getTimezoneOffset()*60000); return x.toISOString().slice(0,10); }
function dateFromISO(value){const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||''));if(!match)return null;const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]),date=new Date(year,month-1,day,12);return date.getFullYear()===year&&date.getMonth()===month-1&&date.getDate()===day?date:null}
function fmtDate(v, options={month:'short',day:'numeric',year:'numeric'}){ const d=new Date(`${v}T12:00:00`); return Number.isNaN(d.getTime())?'—':d.toLocaleDateString(undefined,options); }
function timeMins(value,unit){ const n=num(value); return n===null?null:n*(unit==='Hours'?60:1); }
function selectedService(){return state.services.find(s=>s.id===calc.serviceId)}
function durationInputParts(minutes){const value=Number(minutes)||0;return value>=60&&value%60===0?{value:value/60,unit:'Hours'}:{value,unit:'Minutes'}}
function inventoryUsageCost(usages=[]){return usages.reduce((sum,use)=>{const item=state.inventory.find(entry=>entry.id===use.itemId);return sum+(Number(item?.unitCost)||0)*(Number(use.quantity)||0)},0)}
function inventoryUsageDescription(usages=[]){return usages.map(use=>{const item=state.inventory.find(entry=>entry.id===use.itemId);const quantity=Number(use.quantity)||0;const shownQuantity=Number.isInteger(quantity)?String(quantity):String(Number(quantity.toFixed(3)));return `${item?.name||'Item'}: ${shownQuantity} ${item?.unit||'units'}`}).join(', ')}
function currentValues(){
  const s=selectedService()||null;
  const extras=state.extras.filter(e=>calc.extras.includes(e.id));
  const p=num(calc.price), t=timeMins(calc.time,calc.unit);
  const manual=!s&&(p!==null||t!==null);
  const servicePrice=s?(p===null?Number(s.defaultPrice)||0:p):(p||0);
  const serviceTime=s?(t===null?Number(s.defaultDurationMinutes)||0:t):(t||0);
  const extrasPrice=extras.reduce((a,e)=>a+(Number(e.price)||0),0);
  const extrasTime=extras.reduce((a,e)=>a+(Number(e.durationMinutes)||0),0);
  const inventoryUsage=[...(s?.inventoryUsage||[]),...extras.flatMap(e=>e.inventoryUsage||[])];
  const inventoryMaterial=inventoryUsageCost(inventoryUsage);
  const basePrice=servicePrice+extrasPrice;
  const amount=num(calc.adjustmentAmount);
  const adjustment=amount!==null&&amount>0?(calc.adjustmentType==='deduct'?-amount:amount):0;
  const price=basePrice+adjustment, minutes=serviceTime+extrasTime;
  const profit=price-inventoryMaterial, perHour=minutes>0?profit/(minutes/60):0, margin=price>0?(profit/price)*100:0;
  return s||extras.length||manual?{s,manual,extras,servicePrice,serviceTime,extrasPrice,extrasTime,inventoryUsage,inventoryMaterial,basePrice,adjustment,adjustmentAmount:Math.abs(adjustment),price,minutes,profit,perHour,margin}:null;
}
function render(){
  $$('.nav-item').forEach(b=>{const active=b.dataset.page===page;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});
  $('.app-shell').classList.toggle('setup-mode',page==='setup');
  const root=$('#main');
  if(page==='setup') root.innerHTML=renderSetup();
  if(page==='studio') root.innerHTML=renderCalculator();
  if(page==='schedule') root.innerHTML=renderSchedule();
  if(page==='catalog') root.innerHTML=renderCatalog();
  bindPage();
}
function renderSetup(){
  const serviceRows=state.services.length?state.services.map(s=>`<div class="setup-item"><div><strong>${esc(s.name)}</strong><small>${money(s.defaultPrice)} · ${formatDuration(s.defaultDurationMinutes)} · Supplies ${money(inventoryUsageCost(s.inventoryUsage||[]))}</small></div><div class="setup-item-actions"><button class="text-button" data-action="edit-service" data-id="${esc(s.id)}">Edit</button><button class="text-button setup-delete" data-action="delete-service-setup" data-id="${esc(s.id)}">Delete</button></div></div>`).join(''):'<p class="setup-empty">Your services will appear here.</p>';
  const extraRows=state.extras.length?state.extras.map(x=>`<div class="setup-item"><div><strong>${esc(x.name)}</strong><small>${money(x.price)} · ${formatDuration(x.durationMinutes)} · Supplies ${money(inventoryUsageCost(x.inventoryUsage||[]))}</small></div><div class="setup-item-actions"><button class="text-button" data-action="edit-extra" data-id="${esc(x.id)}">Edit</button><button class="text-button setup-delete" data-action="delete-extra-setup" data-id="${esc(x.id)}">Delete</button></div></div>`).join(''):'<p class="setup-empty">Your extras will appear here.</p>';
  const inventoryRows=state.inventory.length?state.inventory.map(item=>`<div class="setup-item"><div><strong>${esc(item.name)}</strong><small>${Number(item.quantity)||0} ${esc(item.unit||'units')} in stock${item.unitCost!==''&&item.unitCost!=null?` · ${money(item.unitCost)} each`:''}</small>${item.purchaseUrl?`<a class="setup-purchase-link" href="${esc(item.purchaseUrl)}" target="_blank" rel="noopener noreferrer">Purchase link ↗</a>`:''}</div><div class="setup-item-actions"><button class="text-button" data-action="edit-inventory" data-id="${esc(item.id)}">Edit</button><button class="text-button setup-delete" data-action="delete-inventory" data-id="${esc(item.id)}">Remove</button></div></div>`).join(''):'<p class="setup-empty">Your inventory items will appear here.</p>';
  let content='';
  if(setupStep===0) content=`<section class="setup-welcome"><p class="eyebrow">A FRESH START FOR YOUR BUSINESS</p><h1>Welcome! 👋</h1><p>This app helps you manage your services, extras, inventory, appointments and clients — and see what you make from each service.</p><p class="setup-how">Add your inventory, services and extras, set prices, times and costs, then use them in appointments. Track completed appointments and clients, and use the calculator to see profit, profit per hour and margin.</p><button class="btn btn-primary" data-action="setup-next">Let’s get started <span>→</span></button></section>`;
  if(setupStep===1) content=`<section class="setup-section setup-inventory"><div class="setup-intro"><p class="eyebrow">STEP 1 OF 3 · SUPPLIES</p><h1>Inventory</h1><p>Add the supplies you use. You can link them to services and extras in the next steps.</p></div><form class="setup-form" data-setup-form="inventory"><div class="setup-form-title">Add an inventory item</div><div class="setup-fields"><label class="field"><span>Item name</span><input class="input" name="name" required maxlength="80" placeholder="e.g. Builder Gel"></label><label class="field"><span>Quantity in stock</span><input class="input" name="quantity" type="number" min="0" step="any" required></label><label class="field"><span>Unit / type</span><input class="input" name="unit" required maxlength="30" value="units" placeholder="units, bottles…"></label><label class="field"><span>Alert me at</span><input class="input" name="threshold" type="number" min="0" step="any" value="2" required></label><div class="field setup-cost-field"><label for="setup-unit-cost">Cost per unit <span style="font-weight:400;color:#a2a29b">(optional)</span></label><span class="money-input"><span class="money-affix" aria-hidden="true">$</span><input class="input" id="setup-unit-cost" name="unitCost" type="number" min="0" step="0.01"></span><details class="unit-cost-calculator"><summary>Calculate from a purchase</summary><div class="unit-cost-fields"><label>Quantity purchased<input class="input" data-unit-quantity type="number" min="0.001" step="any" placeholder="e.g. 12"></label><label>Total spent<input class="input" data-unit-total type="number" min="0" step="0.01" placeholder="e.g. 36.00"></label></div><p data-unit-result>Enter quantity and total spent to calculate cost per unit.</p></details></div><label class="field setup-purchase-field"><span>Purchase link <span style="font-weight:400;color:#a2a29b">(optional)</span></span><input class="input" name="purchaseUrl" type="url" placeholder="https://…"></label></div><button class="btn btn-primary" type="submit">+ Add Item</button></form><div class="setup-list">${inventoryRows}</div><div class="setup-footer setup-footer-end"><button class="btn btn-primary" data-action="setup-next">Continue to Services <span>→</span></button></div></section>`;
  if(setupStep===2) content=`<section class="setup-section setup-services"><div class="setup-intro"><p class="eyebrow">STEP 2 OF 3 · WHAT YOU OFFER</p><h1>Services</h1><p>Services are the main things you offer your clients. For a nail technician, these might be Gel Extensions, BIAB, Acrylic Full Set or a Manicure.</p></div><form class="setup-form" data-setup-form="service"><div class="setup-form-title">Add a service</div><div class="setup-fields"><label class="field"><span>Service name</span><input class="input" name="name" required maxlength="60" placeholder="e.g. Gel Extensions"></label><label class="field"><span>Price</span><span class="money-input"><span class="money-affix" aria-hidden="true">$</span><input class="input" name="price" type="number" min="0" step="0.01" required></span></label><label class="field"><span>Duration</span><div class="input-group"><span class="duration-clock" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/></svg></span><input class="input" name="duration" type="number" min="0" step="1" required><select class="select" name="unit"><option>Minutes</option><option>Hours</option></select></div></label></div>${inventoryUsageEditor('service',null)}<button class="btn btn-primary" type="submit">+ Add Service</button></form><div class="setup-list">${serviceRows}</div><div class="setup-footer setup-footer-end"><button class="btn btn-primary" data-action="setup-next">Continue to Extras <span>→</span></button></div></section>`;
  if(setupStep===3) content=`<section class="setup-section setup-extras"><div class="setup-intro"><p class="eyebrow">STEP 3 OF 3 · FINISHING TOUCHES</p><h1>Extras</h1><p>Extras are optional additions you can offer alongside a service. Examples include Nail Art, French Tips, Chrome, Repairs or Soak Off. Extras work independently, too.</p></div><form class="setup-form" data-setup-form="extra"><div class="setup-form-title">Add an extra</div><div class="setup-fields"><label class="field"><span>Extra name</span><input class="input" name="name" required maxlength="60" placeholder="e.g. Nail Art"></label><label class="field"><span>Price</span><span class="money-input"><span class="money-affix" aria-hidden="true">$</span><input class="input" name="price" type="number" min="0" step="0.01" required></span></label><label class="field"><span>Duration</span><div class="input-group"><span class="duration-clock" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/></svg></span><input class="input" name="duration" type="number" min="0" step="1" required><select class="select" name="unit"><option>Minutes</option><option>Hours</option></select></div></label></div>${inventoryUsageEditor('extra',null)}<button class="btn btn-primary" type="submit">+ Add Extra</button></form><div class="setup-list">${extraRows}</div><div class="setup-footer"><button class="btn" data-action="setup-back">← Services</button><div class="setup-footer-right"><button class="btn btn-primary" data-action="setup-complete">Finish setup</button></div></div></section>`;
  if(setupStep===4) content=`<section class="setup-welcome setup-done"><div class="setup-success">✓</div><h1>You’re all set! 🎉</h1><p>Your inventory, services and extras are ready to use throughout the app.</p><button class="btn btn-primary" data-action="setup-start">Get Started <span>→</span></button></section>`;
  return `<div class="setup-top"><button class="btn btn-danger" data-action="reset-app">Reset App</button>${setupComplete?'<button class="text-button" data-action="setup-exit">Back to app</button>':''}</div>${content}${setupStep<4?'<button class="setup-skip-link" data-action="setup-skip">Skip for now</button>':''}`;
}
function header(kicker,title){return `<div class="page-heading"><div><h1>${title}</h1></div></div>`}
function renderCalculator(){
  const s=selectedService(), v=currentValues();
  const durationUnit=calc.unit;
  const serviceOptions=state.services.map(x=>`<option value="${esc(x.id)}" ${x.id===calc.serviceId?'selected':''}>${esc(x.name)}</option>`).join('');
  const input=`<details class="calc-input-details" ${calc.inputsOpen?'open':''}><summary>Inputs <span>▾</span></summary><div class="calc-input-content"><div class="field calc-service-field"><label>Service</label><div class="service-select-row"><select class="select" id="calc-service"><option value="">Choose a service</option>${serviceOptions}</select>${s?`<button class="icon-btn" aria-label="Edit service" title="Edit service" data-action="edit-service" data-id="${esc(s.id)}">${editIcon}</button>`:`<button class="icon-btn" aria-label="Add service" title="Add service" data-action="new-service">+</button>`}</div></div>
    ${!s?`<div class="tweak-disclosure"><button class="tweak-toggle" type="button" data-action="toggle-tweaks" aria-expanded="${calc.tweaksOpen}"><span>Custom service (one off service)</span><span class="tweak-chevron ${calc.tweaksOpen?'open':''}">⌄</span></button>${calc.tweaksOpen?`<div class="tweak-fields"><div class="form-grid"><div class="field"><label for="calc-price">Price</label><span class="money-input"><span class="money-affix" aria-hidden="true">$</span><input class="input" id="calc-price" type="number" min="0" step="0.01" value="${esc(calc.price)}"></span></div><div class="field"><label for="calc-time">Duration</label><div class="input-group duration-input"><span class="duration-clock" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/></svg></span><input class="input" id="calc-time" type="number" min="0" step="1" value="${esc(calc.time)}"><select class="select" id="calc-unit"><option ${durationUnit==='Minutes'?'selected':''}>Minutes</option><option ${durationUnit==='Hours'?'selected':''}>Hours</option></select></div></div></div></div>`:''}</div>`:''}
    <div class="extras-section"><div class="extras-heading"><h3>Extras</h3><button class="small-add" data-action="new-extra">+ Add Extra</button></div>
    ${state.extras.length?`<div class="extras-list">${state.extras.map(e=>`<div class="extra-option"><label class="extra-pill ${calc.extras.includes(e.id)?'selected':''}"><input class="calc-extra" type="checkbox" value="${esc(e.id)}" ${calc.extras.includes(e.id)?'checked':''}><span>${esc(e.name)}</span><strong>+${money(e.price)}</strong></label><button class="extra-manage" type="button" data-action="edit-extra" data-id="${esc(e.id)}">Edit</button></div>`).join('')}</div>`:`<div class="empty-inline">No extras yet.</div>`}</div></div></details>`;
  let results='';
  if(!v) results=`<div class="profit-label">ESTIMATED PROFIT</div><div class="profit-hero empty-profit">—</div><div class="result-pair"><div class="mini-result"><span>PROFIT PER HOUR</span><strong>—</strong></div><div class="mini-result"><span>PROFIT MARGIN</span><strong>—</strong></div></div>`;
  else if ((num(calc.price)!==null&&num(calc.price)<0)||(timeMins(calc.time,calc.unit)!==null&&timeMins(calc.time,calc.unit)<0)) results=`<div class="profit-label">ESTIMATED PROFIT</div><div class="profit-hero">—</div><div class="result-pair"><div class="mini-result"><span>PROFIT PER HOUR</span><strong>—</strong></div><div class="mini-result"><span>PROFIT MARGIN</span><strong>—</strong></div></div><div class="empty-hint">Use zero or positive values.</div>`;
  else {
    const adjustButton=calc.adjustmentOpen?'Close':v.adjustment!==0?`Edit adjustment · ${v.adjustment>0?'+':'−'}${money(v.adjustmentAmount)}`:'Adjust price';
    results=`<div class="result-topline"><div><div class="profit-label">ESTIMATED PROFIT</div><div class="profit-hero">${money(v.profit)}</div></div></div><div class="result-pair"><div class="mini-result"><span>PROFIT PER HOUR</span><strong>${money(v.perHour)}<small> /hr</small></strong></div><div class="mini-result"><span>PROFIT MARGIN</span><strong>${v.margin.toFixed(1)}%</strong></div></div><details class="breakdown-details" ${calc.breakdownOpen?'open':''}><summary>Show Breakdown <span>▾</span></summary><div class="result-breakdown"><div class="breakdown-row"><span>Client price</span><strong>${money(v.price)}</strong></div><div class="breakdown-row"><span>${s?'Service price':'Custom price'}</span><strong>${money(v.servicePrice)}</strong></div><div class="breakdown-row"><span>Extra prices${v.extras.length?` (${esc(v.extras.map(extra=>extra.name).join(', '))})`:""}</span><strong>${money(v.extrasPrice)}</strong></div>${v.adjustment!==0?`<div class="breakdown-row"><span>Price adjustment</span><strong>${v.adjustment>0?'+':'−'}${money(v.adjustmentAmount)}</strong></div>`:''}<div class="breakdown-row"><span>Supplies</span><strong>${money(v.inventoryMaterial)}</strong></div><div class="breakdown-row total"><span>Estimated profit</span><strong>${money(v.profit)}</strong></div><div class="breakdown-row"><span>Total time</span><strong>${formatDuration(v.minutes)}</strong></div><button type="button" class="text-button adjust-toggle" data-action="toggle-adjustment" aria-expanded="${calc.adjustmentOpen}">${adjustButton}</button>${calc.adjustmentOpen?`<div class="adjust-controls"><label class="sr-only" for="calc-adjust-type">Adjustment type</label><select class="select" id="calc-adjust-type"><option value="add" ${calc.adjustmentType==='add'?'selected':''}>Add an amount</option><option value="deduct" ${calc.adjustmentType==='deduct'?'selected':''}>Deduct an amount</option></select><label class="sr-only" for="calc-adjust-amount">Adjustment amount</label><div class="adjust-amount"><span>$</span><input class="input" id="calc-adjust-amount" type="number" min="0" step="0.01" placeholder="Amount" value="${esc(calc.adjustmentAmount)}"></div></div>`:''}</div></details>`;
  }
  return `${header('','Studio Log')}<div class="calc-layout"><section class="card results-card">${results}</section><section class="card input-card">${input}</section></div>${v?`<div class="save-bar"><label for="calc-client">Client name</label><input class="input" id="calc-client" placeholder="Enter client name" value="${esc(calc.client)}"><button class="btn btn-primary" data-action="save-calculation" ${!calc.client.trim()?'disabled':''}>Save to Log</button></div>`:''}<button class="fab" data-action="new-calculation" aria-label="New calculation">+</button>`;
}
function formatDuration(m){m=Math.max(0,Math.round(Number(m)||0));const h=Math.floor(m/60),r=m%60;return h?`${h} hr${h===1?'':'s'}${r?` ${r} min`:''}`:`${r} min`}
function renderClients(){
  const fab='<button class="fab" data-action="new-calculation" aria-label="New calculation">+</button>';
  if(!state.calculations.length)return `${header('','Clients')}<p class="empty-helper">No calculations yet. Tap + to create one.</p>${fab}`;
  return `${header('','Clients')}<div class="card list-card"><div class="list-toolbar"><input class="input search" id="client-search" aria-label="Search clients or services" placeholder="Search client or service…"><span style="color:#999;font-size:10px">${state.calculations.length} saved</span></div><div class="entry-list" id="client-entries">${renderCalculationRows(state.calculations)}</div></div>${fab}`;
}
function renderCalculationRows(items){return items.length?items.slice().sort((a,b)=>String(b.createdAt||b.date||'').localeCompare(String(a.createdAt||a.date||''))).map(c=>`<div class="log-entry" role="button" tabindex="0" aria-label="View ${esc(c.clientName)} · ${esc(c.serviceNameSnapshot)}" data-action="view-calculation" data-id="${esc(c.id)}"><div class="entry-main"><strong>${esc(c.clientName)}</strong><small>${esc(c.serviceNameSnapshot)}</small></div><div class="entry-service"><strong>${esc(c.extras?.length?c.extras.map(e=>e.name).join(', '):'No extras')}</strong><small>${c.extras?.length?'Selected extras':'Service only'}</small></div><div class="entry-meta entry-date">${fmtDate(c.date)}</div><div class="entry-money"><strong>${money(c.price)}</strong><small class="${Number(c.profit)<0?'profit-negative':'profit-positive'}">${money(c.profit)} profit</small></div></div>`).join(''):`<div class="empty-state"><h2>No matches</h2><p>Try a different client or service name.</p></div>`}
function renderScheduleClients(){return `<section class="schedule-clients"><div class="section-label"><h2>Clients</h2><span>${state.calculations.length} saved</span></div>${state.calculations.length?`<div class="card list-card"><div class="list-toolbar"><input class="input search" id="schedule-client-search" aria-label="Search clients or services" placeholder="Search client or service…"></div><div class="entry-list" id="schedule-client-entries">${renderCalculationRows(state.calculations)}</div></div>`:'<p class="empty-helper">No client records yet.</p>'}</section>`}
function renderGoals(embedded=false){
  const title=embedded?'':header('','Goals');
  if(!state.goal)return `${title}<p class="empty-helper">No goal set yet.</p><button class="btn" data-action="new-goal">Set goal</button>`;
  const target=Math.max(0,Number(state.goal.targetProfit)||0), logged=state.calculations.reduce((a,c)=>a+(Number(c.profit)||0),0), rem=Math.max(0,target-logged), pct=target>0?(logged/target)*100:0, visual=Math.max(0,Math.min(100,pct));
  return `${title}<section class="card goal-card"><button class="goal-edit" data-action="edit-goal">Adjust target</button><div class="progress-wrap"><div class="progress-ring"><svg viewBox="0 0 150 150"><circle class="ring-track" cx="75" cy="75" r="64"></circle><circle class="ring-value" cx="75" cy="75" r="64" stroke-dasharray="402.12" stroke-dashoffset="${402.12*(1-visual/100)}"></circle></svg><div class="ring-center"><strong>${Math.round(pct)}%</strong><span>PROGRESS</span></div></div>${pct>=100?'<span class="reached">Goal reached ✓</span>':`<span class="goal-remaining-hint">${money(rem)} to go</span>`}</div><div class="goal-stats"><div class="goal-stat"><span>PROFIT GOAL</span><strong>${money(target)}</strong></div><div class="goal-stat"><span>PROFIT LOGGED</span><strong>${money(logged)}</strong></div><div class="goal-stat remaining"><span>REMAINING</span><strong>${money(rem)}</strong></div></div></section>`;
}
function renderSchedule(){return `${header('','Schedule')}${renderGoals(true)}${renderAppointments({embedded:true})}`}
function renderCatalog(){
  const serviceRows=state.services.map(s=>`<article class="catalog-row"><div><strong>${esc(s.name)}</strong><small>${money(s.defaultPrice)} · ${formatDuration(s.defaultDurationMinutes)} · Supplies ${money(inventoryUsageCost(s.inventoryUsage||[]))}</small></div><div><button class="text-button" data-action="edit-service" data-id="${esc(s.id)}">Edit</button><button class="text-button" data-action="delete-service-setup" data-id="${esc(s.id)}">Remove</button></div></article>`).join('');
  const extraRows=state.extras.map(x=>`<article class="catalog-row"><div><strong>${esc(x.name)}</strong><small>${money(x.price)} · ${formatDuration(x.durationMinutes)} · Supplies ${money(inventoryUsageCost(x.inventoryUsage||[]))}</small></div><div><button class="text-button" data-action="edit-extra" data-id="${esc(x.id)}">Edit</button><button class="text-button" data-action="delete-extra-setup" data-id="${esc(x.id)}">Remove</button></div></article>`).join('');
  const body=catalogTab==='services'?(serviceRows||'<p class="empty-helper">No items added yet. Tap + to create one.</p>'):catalogTab==='extras'?(extraRows||'<p class="empty-helper">No items added yet. Tap + to create one.</p>'):renderInventoryRows(state.inventory);
  return `${header('','Catalog')}<div class="catalog-tabs">${[['services','Services'],['extras','Extras'],['supplies','Supplies']].map(([key,label])=>`<button class="catalog-tab ${catalogTab===key?'active':''}" data-catalog-tab="${key}">${label}</button>`).join('')}</div><section class="catalog-content">${body}</section><button class="fab" data-action="catalog-add" aria-label="Add item">+</button>`;
}
function stockState(item){const quantity=Number(item.quantity)||0,threshold=Number(item.lowStockThreshold??2);return quantity<=0?'out':quantity<=threshold?'low':'good'}
function renderInventoryRows(items){return items.length?items.map(item=>{const stock=stockState(item);return `<article class="inventory-row"><div class="inventory-main"><strong>${esc(item.name)}</strong><small>${Number(item.quantity)||0} ${esc(item.unit||'units')} in stock${item.unitCost!==''&&item.unitCost!=null?` · ${money(item.unitCost)} each`:''}</small>${item.notes?`<p>${esc(item.notes)}</p>`:''}${item.purchaseUrl?`<a class="inventory-purchase-link" href="${esc(item.purchaseUrl)}" target="_blank" rel="noopener noreferrer">Open purchase link ↗</a>`:''}</div><span class="stock-badge stock-${stock}">${stock==='out'?'Out of Stock':stock==='low'?'Low Stock':'In Stock'}</span><div class="inventory-actions"><button class="text-button" data-action="edit-inventory" data-id="${esc(item.id)}">Edit</button><button class="text-button inventory-delete" data-action="delete-inventory" data-id="${esc(item.id)}">Remove</button></div></article>`}).join(''):'<p class="empty-helper">No items added yet. Tap + to create one.</p>'}
function renderInventory(){return `${header('','Inventory')}${state.inventory.length?`<section class="card inventory-card"><div class="list-toolbar"><input class="input search" id="inventory-search" aria-label="Search inventory" placeholder="Search inventory…"></div><div class="inventory-list" id="inventory-entries">${renderInventoryRows(state.inventory)}</div></section>`:`<div class="inventory-list" id="inventory-entries">${renderInventoryRows(state.inventory)}</div>`}<button class="fab" data-action="new-inventory" aria-label="Add inventory item">+</button>`}
function inventoryUsageEditor(kind,record){const usages=Array.isArray(record?.inventoryUsage)?record.inventoryUsage:[];const rows=state.inventory.length?(usages.length?usages:[{itemId:'',quantity:1}]):[];return `<div class="field full inventory-usage-editor"><div class="inventory-usage-heading"><label>Inventory used <span style="font-weight:400;color:#a2a29b">(optional)</span></label>${state.inventory.length?'<button type="button" class="small-add" data-add-usage>+ Add item</button>':''}</div><div class="inventory-usage-rows">${rows.map(use=>inventoryUsageRow(use)).join('')}</div>${state.inventory.length?'':'<small class="usage-empty-hint">Add inventory items to link supplies here.</small>'}</div>`}
function inventoryUsageRow(use={}){return `<div class="inventory-usage-row"><select class="select usage-item" aria-label="Inventory item"><option value="">Choose item</option>${state.inventory.map(item=>`<option value="${esc(item.id)}" ${item.id===use.itemId?'selected':''}>${esc(item.name)} · ${Number(item.quantity)||0} ${esc(item.unit||'units')}</option>`).join('')}</select><input class="input usage-quantity" aria-label="Quantity used" type="number" min="0.001" step="any" value="${esc(use.quantity??1)}" placeholder="Qty"><button type="button" class="usage-remove" aria-label="Remove inventory item">×</button></div>`}
function readInventoryUsage(form){const rows=$$('.inventory-usage-row',form),result=[];for(const row of rows){const itemId=$('.usage-item',row).value,quantity=num($('.usage-quantity',row).value);if(!itemId)continue;if(quantity===null||quantity<=0)return null;if(result.some(entry=>entry.itemId===itemId))return null;result.push({itemId,quantity})}return result}
function bindUsageEditor(){const rows=$('.inventory-usage-rows');$('[data-add-usage]')?.addEventListener('click',()=>{rows.insertAdjacentHTML('beforeend',inventoryUsageRow());bindUsageRows()});bindUsageRows()}
function bindUsageRows(){$$('.usage-remove').forEach(button=>button.onclick=()=>{const rows=$$('.inventory-usage-row');if(rows.length>1)button.closest('.inventory-usage-row').remove();else{const row=button.closest('.inventory-usage-row');$('.usage-item',row).value='';$('.usage-quantity',row).value='1'}})}
function openInventory(itemId){const item=state.inventory.find(entry=>entry.id===itemId),editing=!!item;modal(editing?'Edit inventory item':'Add inventory item',`<form><div class="error-message"></div><div class="field"><label class="required">Item name</label><input class="input" name="name" required maxlength="80" placeholder="e.g. Builder Gel" value="${esc(item?.name||'')}"></div><div class="form-grid"><div class="field"><label class="required">Quantity in stock</label><input class="input" name="quantity" type="number" min="0" step="any" required value="${esc(item?.quantity??0)}"></div><div class="field"><label class="required">Unit / type</label><input class="input" name="unit" required maxlength="30" placeholder="units, sets, bottles…" value="${esc(item?.unit||'units')}"></div><div class="field"><label>Cost per unit <span style="font-weight:400;color:#a2a29b">(optional)</span></label><span class="money-input"><span class="money-affix" aria-hidden="true">$</span><input class="input" name="unitCost" type="number" min="0" step="0.01" value="${esc(item?.unitCost??'')}"></span></div><div class="field"><label>Low stock at</label><input class="input" name="threshold" type="number" min="0" step="any" value="${esc(item?.lowStockThreshold??2)}"></div><div class="field full"><label>Purchase link <span style="font-weight:400;color:#a2a29b">(optional)</span></label><input class="input" name="purchaseUrl" type="url" placeholder="https://…" value="${esc(item?.purchaseUrl||'')}"></div><div class="field full"><label>Notes <span style="font-weight:400;color:#a2a29b">(optional)</span></label><textarea class="textarea" name="notes" maxlength="300" placeholder="Supplier, shade, storage…">${esc(item?.notes||'')}</textarea></div></div>${formActions('Cancel',editing?'Save changes':'Save item')}</form>`,{subtitle:'Keep track of the products and materials you use in your studio.'});wireForm(fd=>{const name=String(fd.get('name')||'').trim(),quantity=num(fd.get('quantity')),unit=String(fd.get('unit')||'').trim(),cost=fd.get('unitCost')===''?null:num(fd.get('unitCost')),threshold=num(fd.get('threshold'));if(!name||!unit||quantity===null||quantity<0||threshold===null||threshold<0||(cost!==null&&cost<0))return err('Enter a name, unit, and valid non-negative quantities and cost.');const purchaseUrl=String(fd.get('purchaseUrl')||'').trim();if(purchaseUrl&&!/^https?:\/\//i.test(purchaseUrl))return err('Enter a link starting with http:// or https://.');const values={name,quantity,unit,unitCost:cost,lowStockThreshold:threshold,notes:String(fd.get('notes')||'').trim(),purchaseUrl};if(editing)Object.assign(item,values);else state.inventory.push({id:id(),...values});if(!save())return;closeModal();render()})}
function deleteInventory(itemId){const item=state.inventory.find(entry=>entry.id===itemId);if(!item||!confirm(`Remove “${item.name}” from inventory? Its links to services and extras will also be removed.`))return;state.inventory=state.inventory.filter(entry=>entry.id!==itemId);for(const record of [...state.services,...state.extras])record.inventoryUsage=(record.inventoryUsage||[]).filter(use=>use.itemId!==itemId);save();render()}
function weekStart(d){const x=new Date(d);x.setHours(0,0,0,0);x.setDate(x.getDate()-((x.getDay()+6)%7));return x}
function shiftDate(date,n){const d=new Date(date);d.setDate(d.getDate()+n);return d}
function appointmentExtras(a){
  return (Array.isArray(a?.selectedExtras)?a.selectedExtras:[])
    .map(extra=>typeof extra==='string'?state.extras.find(item=>item.id===extra)||{id:extra,name:'Saved extra',price:0,durationMinutes:0,materialCost:0}:{...extra})
    .filter(Boolean);
}
function appointmentServiceSnapshot(a){
  if(!a?.serviceId)return null;
  const service=state.services.find(item=>item.id===a.serviceId);
  return {
    id:a.serviceId,
    name:a.serviceNameSnapshot||service?.name||'Saved service',
    price:Number(a.servicePrice??service?.defaultPrice)||0,
    durationMinutes:Number(a.serviceDurationMinutes??service?.defaultDurationMinutes)||0,
  };
}
function appointmentInventoryUsage(serviceId,extras){const service=state.services.find(item=>item.id===serviceId);const combined=[...(service?.inventoryUsage||[]),...extras.flatMap(extra=>(state.extras.find(item=>item.id===extra.id)||extra).inventoryUsage||[])];const totals=new Map();for(const use of combined)totals.set(use.itemId,(totals.get(use.itemId)||0)+(Number(use.quantity)||0));return [...totals].map(([itemId,quantity])=>({itemId,quantity}))}
function renderAppointments({embedded=false}={}){
  const selectedDate=calendar.date instanceof Date?calendar.date:new Date();
  const weekDays=Array.from({length:7},(_,index)=>shiftDate(weekStart(selectedDate),index));
  const selectedISO=localDate(selectedDate);
  const appointments=state.appointments.filter(item=>item&&dateFromISO(item.date)).sort((a,b)=>String(a.time||'').localeCompare(String(b.time||''))||String(a.clientName||'').localeCompare(String(b.clientName||'')));
  const weekAppointments=appointments.filter(item=>weekDays.some(day=>localDate(day)===item.date));
  const dayAppointments=weekAppointments.filter(item=>item.date===selectedISO);
  const heading=weekDays[0].toLocaleDateString(undefined,{month:'short',day:'numeric'})+' – '+weekDays[6].toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
  const weekPicker=weekDays.map(day=>{
    const dayISO=localDate(day),isSelected=dayISO===selectedISO,isToday=dayISO===localDate();
    const count=weekAppointments.filter(item=>item.date===dayISO).length;
    return '<button class="planner-day '+(isSelected?'is-selected ':'')+(isToday?'is-today':'')+'" data-action="cal-select-day" data-id="'+dayISO+'" aria-label="'+day.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'})+', '+count+' appointments" aria-pressed="'+isSelected+'"><span>'+day.toLocaleDateString(undefined,{weekday:'short'})+'</span><strong>'+day.getDate()+'</strong><i class="planner-day-count '+(count?'has-bookings':'')+'" aria-hidden="true">'+(count||'')+'</i></button>';
  }).join('');
  const entries=dayAppointments.map(item=>{
    const extras=appointmentExtras(item);
    const description=[item.serviceNameSnapshot&&item.serviceNameSnapshot!=='Extras only'?item.serviceNameSnapshot:'',...extras.map(extra=>extra.name)].filter(Boolean).join(' · ')||'Appointment';
    const completed=item.status==='completed';
    return '<button class="planner-booking '+(completed?'is-completed':'')+'" data-action="view-appointment" data-id="'+esc(item.id)+'"><span class="planner-booking-time">'+esc(item.time||'')+'</span><span class="planner-booking-rule" aria-hidden="true"></span><span class="planner-booking-details"><strong>'+esc(item.clientName||'Client')+'</strong><small>'+esc(description)+'</small></span><span class="planner-booking-meta"><strong>'+money(item.price)+'</strong><small>'+(completed?'Completed':'Booked')+'</small></span><span class="planner-booking-arrow" aria-hidden="true">&rarr;</span></button>';
  }).join('');
  const selectedLabel=selectedDate.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'});
  const agenda=dayAppointments.length?'<div class="planner-bookings">'+entries+'</div>':'<p class="empty-helper">No appointments scheduled.</p>';
  return (embedded?'':header('','Schedule'))+'<section class="planner-card"><div class="planner-toolbar"><div class="planner-week-nav"><button class="planner-arrow" data-action="cal-prev" aria-label="Previous week">&lsaquo;</button><button class="planner-today" data-action="cal-today">Today</button><button class="planner-arrow" data-action="cal-next" aria-label="Next week">&rsaquo;</button><strong>'+heading+'</strong></div><span class="planner-week-total">'+weekAppointments.length+' <small>THIS WEEK</small></span></div><div class="planner-week" role="group" aria-label="Choose a day">'+weekPicker+'</div><div class="planner-agenda"><div class="planner-agenda-heading"><div><h2>'+selectedLabel+'</h2></div><span class="planner-day-total">'+dayAppointments.length+' '+(dayAppointments.length===1?'appointment':'appointments')+'</span></div>'+agenda+'</div></section>'+renderScheduleClients()+'<button class="fab" data-action="new-appointment" aria-label="Add appointment">+</button>';
}
function bindUnitCostCalculator(){const quantity=$('[data-unit-quantity]'),total=$('[data-unit-total]'),cost=$('#setup-unit-cost'),result=$('[data-unit-result]');if(!quantity||!total||!cost||!result)return;const update=()=>{const q=num(quantity.value),spent=num(total.value);if(q===null||q<=0||spent===null||spent<0){result.textContent='Enter quantity and total spent to calculate cost per unit.';return}const unit=spent/q;result.textContent=`Cost per unit: ${money(unit)}`;cost.value=unit.toFixed(2)};quantity.addEventListener('input',update);total.addEventListener('input',update)}
function bindPage(){
  $$('.nav-item,[data-page]').forEach(b=>{b.onclick=()=>{page=b.dataset.page;if(page==='setup'&&setupComplete)setupStep=1;render()}});
  $$('[data-catalog-tab]').forEach(button=>button.addEventListener('click',()=>{catalogTab=button.dataset.catalogTab;render()}));
  $$('[data-setup-form]').forEach(form=>form.addEventListener('submit',e=>{
    e.preventDefault();
    const fd=new FormData(form),kind=form.dataset.setupForm,name=String(fd.get('name')||'').trim();
    if(kind==='inventory'){
      const quantity=num(fd.get('quantity')),unit=String(fd.get('unit')||'').trim(),unitCost=num(fd.get('unitCost')||0),threshold=num(fd.get('threshold'));
      if(!name||quantity===null||quantity<0||!unit||unitCost<0||threshold===null||threshold<0)return;
      const purchaseUrl=String(fd.get('purchaseUrl')||'').trim();
      if(purchaseUrl&&!/^https?:\/\//i.test(purchaseUrl))return;
      const item={id:id(),name,quantity,unit,unitCost,lowStockThreshold:threshold,notes:'',purchaseUrl};
      state.inventory.push(item);
      if(!save()){state.inventory.pop();return}render();if(quantity<=threshold)showLowStockAlert([item]);return;
    }
    const inventoryUsage=readInventoryUsage(form);if(!inventoryUsage)return;
    const price=num(fd.get('price')),duration=num(fd.get('duration')),minutes=duration*(fd.get('unit')==='Hours'?60:1);
    if(!name||price===null||price<0||duration===null||duration<0||!Number.isFinite(minutes))return;
    if(kind==='service')state.services.push({id:id(),name,defaultPrice:price,defaultDurationMinutes:minutes,inventoryUsage,extras:[]});
    else state.extras.push({id:id(),name,price,durationMinutes:minutes,inventoryUsage});
    save();render();
  }));
  if($('[data-setup-form]'))bindUsageEditor();
  bindUnitCostCalculator();
  $('.breakdown-details')?.addEventListener('toggle',e=>{calc.breakdownOpen=e.currentTarget.open});
  $('.calc-input-details')?.addEventListener('toggle',e=>{calc.inputsOpen=e.currentTarget.open});
  $('#calc-service')?.addEventListener('change',e=>{calc.serviceId=e.target.value;calc.price='';calc.time='';calc.unit=durationInputParts(selectedService()?.defaultDurationMinutes).unit;calc.adjustmentType='add';calc.adjustmentAmount='';calc.adjustmentOpen=false;calc.tweaksOpen=false;render()});
  ['calc-price','calc-time'].forEach(k=>$('#'+k)?.addEventListener('input',e=>{if(k==='calc-price')calc.price=e.target.value;if(k==='calc-time')calc.time=e.target.value;updateLive()}));
  $('#calc-client')?.addEventListener('input',e=>{calc.client=e.target.value;const saveButton=$('[data-action="save-calculation"]');if(saveButton)saveButton.disabled=!calc.client.trim()});
  $('#calc-unit')?.addEventListener('change',e=>{calc.unit=e.target.value;updateLive()});
  $('#calc-adjust-type')?.addEventListener('change',e=>{calc.adjustmentType=e.target.value;updateLive()});
  $('#calc-adjust-amount')?.addEventListener('input',e=>{calc.adjustmentAmount=e.target.value;updateLive()});
  $$('.calc-extra').forEach(e=>e.addEventListener('change',()=>{calc.extras=$$('.calc-extra:checked').map(x=>x.value);render()}));
  $('#client-search')?.addEventListener('input',e=>{const q=e.target.value.toLowerCase();const items=state.calculations.filter(c=>`${c.clientName} ${c.serviceNameSnapshot} ${(c.extras||[]).map(x=>x.name).join('')}`.toLowerCase().includes(q));$('#client-entries').innerHTML=renderCalculationRows(items)});
  $('#schedule-client-search')?.addEventListener('input',e=>{const q=e.target.value.toLowerCase();const items=state.calculations.filter(c=>`${c.clientName} ${c.serviceNameSnapshot} ${(c.extras||[]).map(x=>x.name).join('')}`.toLowerCase().includes(q));$('#schedule-client-entries').innerHTML=renderCalculationRows(items);bindActions($('#schedule-client-entries'))});
  $('#inventory-search')?.addEventListener('input',e=>{const q=e.target.value.toLowerCase();$('#inventory-entries').innerHTML=renderInventoryRows(state.inventory.filter(item=>`${item.name} ${item.unit} ${item.notes||''}`.toLowerCase().includes(q)));bindActions($('#inventory-entries'))});
  bindActions(document);
}
function bindActions(container){container.querySelectorAll('[data-action]').forEach(b=>{b.addEventListener('click',e=>{if(e.target.closest('.extra-row')&&!e.target.closest('button'))return;const el=e.currentTarget;handleAction(el.dataset.action,el.dataset.id,el.dataset.mode)});if(b.getAttribute('role')==='button')b.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();b.click()}})})}
function updateLive(){const root=$('#main'),preview=document.createElement('div');preview.innerHTML=renderCalculator();const nextResults=preview.querySelector('.results-card'),currentResults=root.querySelector('.results-card');if(nextResults&&currentResults){currentResults.innerHTML=nextResults.innerHTML;bindActions(currentResults);$('.breakdown-details',currentResults)?.addEventListener('toggle',e=>{calc.breakdownOpen=e.currentTarget.open})}const currentSave=root.querySelector('.save-bar'),nextSave=preview.querySelector('.save-bar');if(!nextSave){currentSave?.remove()}else if(!currentSave){root.append(nextSave);bindActions(nextSave)}else{const button=currentSave.querySelector('[data-action="save-calculation"]');if(button)button.disabled=!calc.client.trim()}}
function handleAction(action,itemId,mode){
  if(action==='toggle-tweaks'){calc.tweaksOpen=!calc.tweaksOpen;render()}
  if(action==='setup-next'){setupStep=Math.min(3,setupStep+1);render()} if(action==='setup-back'){setupStep=2;render()} if(action==='setup-skip'||action==='setup-start'){setupComplete=true;localStorage.setItem(SETUP_KEY,'true');page='schedule';render()} if(action==='setup-complete'){setupStep=4;setupComplete=true;localStorage.setItem(SETUP_KEY,'true');render()} if(action==='setup-exit'){page='schedule';render()}
  if(action==='reset-app')confirmReset();
  if(action==='delete-service-setup'){const s=state.services.find(x=>x.id===itemId);if(s&&confirm(`Delete “${s.name}”?`)){state.services=state.services.filter(x=>x.id!==itemId);if(calc.serviceId===itemId){calc.serviceId='';calc.price='';calc.time='';calc.extras=[]}save();render()}}
  if(action==='delete-extra-setup'){const x=state.extras.find(e=>e.id===itemId);if(x&&confirm(`Delete “${x.name}”?`)){state.extras=state.extras.filter(e=>e.id!==itemId);calc.extras=calc.extras.filter(xid=>xid!==itemId);save();render()}}
  if(action==='new-service')openService(); if(action==='edit-service')openService(itemId); if(action==='new-extra')openExtra(); if(action==='edit-extra')openExtra(itemId); if(action==='save-calculation')saveCalculation();
  if(action==='new-calculation'){calc={serviceId:'',price:'',time:'',unit:'Minutes',material:'',client:'',extras:[],adjustmentType:'add',adjustmentAmount:'',adjustmentOpen:false,tweaksOpen:false,inputsOpen:true,breakdownOpen:false};page='studio';render()}
  if(action==='new-inventory')openInventory(); if(action==='edit-inventory')openInventory(itemId); if(action==='delete-inventory')deleteInventory(itemId);
  if(action==='catalog-add'){if(catalogTab==='services')openService();else if(catalogTab==='extras')openExtra();else openInventory()}
  if(action==='toggle-adjustment'){calc.adjustmentOpen=!calc.adjustmentOpen;updateLive()}
  if(action==='new-goal'||action==='edit-goal')openGoal(); if(action==='new-appointment')openAppointment();
  if(action==='view-calculation')openCalculationDetail(itemId); if(action==='view-appointment')openAppointmentDetail(itemId);
  if(action==='cal-prev'){calendar.date=shiftDate(calendar.date,calendar.mode==='day'?-1:-7);render()} if(action==='cal-next'){calendar.date=shiftDate(calendar.date,calendar.mode==='day'?1:7);render()} if(action==='cal-today'){calendar.date=new Date();render()} if(action==='cal-mode'){calendar.mode=mode;render()}
  if(action==='cal-select-day'){calendar.date=dateFromISO(itemId)||calendar.date;render()}
}
function confirmReset(){modal('Reset everything?',`<p class="confirm-copy">This will permanently delete all of your services, extras, appointments, client records and other saved data. This cannot be undone.</p><div class="modal-actions"><button class="btn" data-modal-cancel>Cancel</button><button class="btn btn-danger" data-reset-confirm>Reset Everything</button></div>`);$('[data-modal-cancel]').addEventListener('click',closeModal);$('[data-reset-confirm]').addEventListener('click',()=>{localStorage.removeItem(STORAGE_KEY);localStorage.removeItem(SETUP_KEY);state=blankState();calc={serviceId:'',price:'',time:'',unit:'Minutes',material:'',client:'',extras:[],adjustmentType:'add',adjustmentAmount:'',adjustmentOpen:false,tweaksOpen:false,inputsOpen:false,breakdownOpen:false};calendar={mode:'week',date:new Date()};setupComplete=false;setupStep=0;page='setup';closeModal();render()})}
function modal(title,content,{wide=false,subtitle=''}={}){
  const root=$('#modal-root');
  if(!$('.modal-backdrop',root))modalReturnFocus=document.activeElement;
  root.innerHTML=`<div class="modal-backdrop"><section class="modal ${wide?'wide':''}" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1"><div class="modal-header"><div><h2 id="modal-title">${title}</h2>${subtitle?`<p>${subtitle}</p>`:''}</div><button class="close-modal" aria-label="Close">×</button></div>${content}</section></div>`;
  document.body.classList.add('modal-open');
  $('.close-modal',root).onclick=closeModal;
  $('.modal-backdrop',root).addEventListener('click',e=>{if(e.target.classList.contains('modal-backdrop'))closeModal()});
  document.onkeydown=e=>{
    if(e.key==='Escape'){closeModal();return}
    if(e.key==='Tab'){
      const dialog=$('.modal',root),items=$$('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]',dialog).filter(el=>el.getClientRects().length);
      if(!items.length){e.preventDefault();dialog.focus();return}
      const first=items[0],last=items[items.length-1];
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
    }
  };
  requestAnimationFrame(()=>($('input:not([disabled]),select:not([disabled]),textarea:not([disabled]),button:not([disabled])',root)||$('.modal',root)).focus());
}
function closeModal(){ $('#modal-root').innerHTML=''; document.body.classList.remove('modal-open'); document.onkeydown=null;if(modalReturnFocus?.isConnected)modalReturnFocus.focus();modalReturnFocus=null }
function err(msg){const e=$('.error-message');if(e){e.textContent=msg;e.classList.add('show')}}
function formActions(cancel='Cancel',save='Save'){return `<div class="modal-actions"><button type="button" class="btn" data-modal-cancel>${cancel}</button><button type="submit" class="btn btn-primary">${save}</button></div>`}
function wireForm(onSubmit){const f=$('.modal form');if(!f)return;f.addEventListener('submit',e=>{e.preventDefault();onSubmit(new FormData(f))});$('[data-modal-cancel]')?.addEventListener('click',closeModal)}
function openService(serviceId){
  const s=state.services.find(x=>x.id===serviceId), editing=!!s;
  const duration=durationInputParts(s?.defaultDurationMinutes);
  modal(editing?'Edit service':'Add service',`<form><div class="error-message"></div><div class="field"><label class="required">Service name</label><input class="input" name="name" required maxlength="60" placeholder="Service name" value="${esc(s?.name||'')}"></div><div class="form-grid"><div class="field"><label class="required">Default price</label><span class="money-input"><span class="money-affix" aria-hidden="true">$</span><input class="input" name="price" type="number" min="0" step="0.01" required value="${esc(s?.defaultPrice??'')}"></span></div><div class="field"><label class="required">Default time</label><div class="input-group duration-input"><span class="duration-clock" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/></svg></span><input class="input" name="duration" type="number" min="0" step="1" required value="${editing?esc(duration.value):''}"><select class="select" name="unit"><option ${duration.unit==='Minutes'?'selected':''}>Minutes</option><option ${duration.unit==='Hours'?'selected':''}>Hours</option></select></div></div></div>${inventoryUsageEditor('service',s)}${editing?'<div class="modal-actions" style="justify-content:space-between"><button type="button" class="btn btn-danger" data-delete-service>Delete service</button><div style="display:flex;gap:8px"><button type="button" class="btn" data-modal-cancel>Cancel</button><button type="submit" class="btn btn-primary">Save changes</button></div></div>':formActions('Cancel','Save Service')}</form>`,{subtitle:editing?'Historical calculations keep their saved details.':'Enter your own service details.'});
  bindUsageEditor();
  $('[data-delete-service]')?.addEventListener('click',()=>{if(confirm(`Delete “${s.name}”? Saved calculations will keep their historical details.`)){state.services=state.services.filter(x=>x.id!==s.id);if(calc.serviceId===s.id){calc.serviceId='';calc.extras=[]}save();closeModal();render()}});
  wireForm(fd=>{const inventoryUsage=readInventoryUsage($('.modal form'));if(!inventoryUsage)return err('Choose a unique inventory item and enter a quantity greater than zero.');const name=fd.get('name').trim(),p=num(fd.get('price')),duration=num(fd.get('duration')),unit=fd.get('unit');if(!name)return err('Enter a service name.');if(p===null||p<0||duration===null||duration<0)return err('Enter valid zero or positive numbers for price and time.');const minutes=duration*(unit==='Hours'?60:1);if(!Number.isFinite(minutes))return err('Enter a valid service duration.');if(editing){Object.assign(s,{name,defaultPrice:p,defaultDurationMinutes:minutes,inventoryUsage})}else{const n={id:id(),name,defaultPrice:p,defaultDurationMinutes:minutes,inventoryUsage,extras:[]};state.services.push(n);calc.serviceId=n.id;calc.price='';calc.time='';calc.unit=unit;calc.extras=[]}save();closeModal();render()});
}
function openExtra(extraId){const e=state.extras.find(x=>x.id===extraId),editing=!!e,duration=durationInputParts(e?.durationMinutes);
  modal(editing?'Edit extra':'Add extra',`<form><div class="error-message"></div><div class="field"><label class="required">Extra name</label><input class="input" name="name" required maxlength="60" value="${esc(e?.name||'')}"></div><div class="form-grid"><div class="field"><label class="required">Extra price</label><span class="money-input"><span class="money-affix" aria-hidden="true">$</span><input class="input" name="price" type="number" min="0" step="0.01" required value="${esc(e?.price??'')}"></span></div><div class="field"><label class="required">Extra time</label><div class="input-group duration-input"><span class="duration-clock" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/></svg></span><input class="input" name="duration" type="number" min="0" step="1" required value="${editing?esc(duration.value):''}"><select class="select" name="unit"><option ${duration.unit==='Minutes'?'selected':''}>Minutes</option><option ${duration.unit==='Hours'?'selected':''}>Hours</option></select></div></div></div>${inventoryUsageEditor('extra',e)}${editing?'<div class="modal-actions" style="justify-content:space-between"><button type="button" class="btn btn-danger" data-delete-extra>Delete extra</button><div style="display:flex;gap:8px"><button type="button" class="btn" data-modal-cancel>Cancel</button><button type="submit" class="btn btn-primary">Save changes</button></div></div>':formActions('Cancel','Save Extra')}</form>`,{subtitle:'Extras can be used with any service or on their own.'});
  bindUsageEditor();
  $('[data-delete-extra]')?.addEventListener('click',()=>{if(confirm(`Delete “${e.name}”? Saved records keep their historical details.`)){state.extras=state.extras.filter(x=>x.id!==e.id);calc.extras=calc.extras.filter(x=>x!==e.id);save();closeModal();render()}});
  wireForm(fd=>{const inventoryUsage=readInventoryUsage($('.modal form'));if(!inventoryUsage)return err('Choose a unique inventory item and enter a quantity greater than zero.');const name=fd.get('name').trim(),p=num(fd.get('price')),d=num(fd.get('duration'));if(!name)return err('Enter an extra name.');if(p===null||p<0||d===null||d<0)return err('Enter valid zero or positive numbers for price and time.');const minutes=d*(fd.get('unit')==='Hours'?60:1);if(editing)Object.assign(e,{name,price:p,durationMinutes:minutes,inventoryUsage});else{const item={id:id(),name,price:p,durationMinutes:minutes,inventoryUsage};state.extras.push(item);calc.extras.push(item.id)}save();closeModal();render()});
}
function saveCalculation(){
  const v=currentValues();
  if(!v||!calc.client.trim())return;
  if(num(calc.price)!==null&&num(calc.price)<0||timeMins(calc.time,calc.unit)!==null&&timeMins(calc.time,calc.unit)<0){toast('Prices and time must be zero or more.');return}
  const inventoryUsageSnapshot=appointmentInventoryUsage(v.s?.id||null,v.extras);
  const totals=new Map();
  for(const use of inventoryUsageSnapshot)totals.set(use.itemId,(totals.get(use.itemId)||0)+(Number(use.quantity)||0));
  const short=[];
  for(const [itemId,quantity] of totals){const item=state.inventory.find(entry=>entry.id===itemId);if(item&&Number(item.quantity)<quantity)short.push(`${item.name} (need ${quantity}, have ${Number(item.quantity)||0})`)}
  if(short.length){toast(`Not enough stock to save: ${short.join(', ')}.`);return}
  const oldQuantities=[];
  for(const [itemId,quantity] of totals){const item=state.inventory.find(entry=>entry.id===itemId);if(item){oldQuantities.push([item,Number(item.quantity)||0]);item.quantity=(Number(item.quantity)||0)-quantity}}
  const record={id:id(),clientName:calc.client.trim(),serviceId:v.s?.id||null,serviceNameSnapshot:v.s?.name||(v.manual?'Custom service':'Extras only'),selectedExtras:v.extras.map(e=>({...e})),extras:v.extras.map(e=>({...e})),inventoryUsageSnapshot,servicePrice:v.servicePrice,extraPrices:v.extras.map(e=>({name:e.name,price:e.price})),adjustmentAmount:v.adjustmentAmount,adjustmentType:calc.adjustmentType,price:v.price,serviceTimeMinutes:v.serviceTime,extraTimeMinutes:v.extrasTime,totalTimeMinutes:v.minutes,inventoryMaterialCost:v.inventoryMaterial,materialCost:v.inventoryMaterial,profit:v.profit,profitPerHour:v.perHour,profitMargin:v.margin,date:localDate(),createdAt:new Date().toISOString()};
  state.calculations.push(record);
  if(!save()){state.calculations.pop();for(const [item,quantity] of oldQuantities)item.quantity=quantity;return}
  toast('Calculation saved to Client Log and inventory updated');calc.client='';render();
}
function openGoal(){modal(state.goal?'Edit profit goal':'Set profit goal',`<form><div class="error-message"></div><div class="field"><label class="required">Target profit</label><span class="money-input"><span class="money-affix" aria-hidden="true">$</span><input class="input" name="target" type="number" min="0.01" step="0.01" required value="${esc(state.goal?.targetProfit??'')}"></span></div>${formActions('Cancel',state.goal?'Save changes':'Save goal')}</form>`,{subtitle:'Your saved calculations will add to your logged profit.'});wireForm(fd=>{const t=num(fd.get('target'));if(t===null||t<=0)return err('Enter a target greater than zero.');state.goal={targetProfit:t};save();closeModal();render()})}
function openAppointment(appointmentId){
  const appointment=state.appointments.find(item=>item.id===appointmentId)||null;
  const editing=!!appointment;
  const originalService=appointmentServiceSnapshot(appointment);
  const originalExtras=appointmentExtras(appointment);
  const originalServiceId=appointment?.serviceId||'';
  const selectedExtras=new Map(originalExtras.map(extra=>[extra.id,{...extra}]));
  const initialDate=appointment?.date||localDate(calendar.date);
  const initialDateParts=dateFromISO(initialDate)||new Date();
  const initialYear=initialDateParts.getFullYear();
  const monthOptions=Array.from({length:12},(_,index)=>`<option value="${index+1}" ${initialDateParts.getMonth()===index?'selected':''}>${new Date(2024,index,1).toLocaleDateString(undefined,{month:'long'})}</option>`).join('');
  const yearStart=Math.min(new Date().getFullYear()-5,initialYear);
  const yearEnd=Math.max(new Date().getFullYear()+10,initialYear);
  const yearOptions=Array.from({length:yearEnd-yearStart+1},(_,index)=>yearStart+index).map(year=>`<option value="${year}" ${year===initialYear?'selected':''}>${year}</option>`).join('');
  const serviceOptions=state.services.map(service=>`<option value="${esc(service.id)}" ${service.id===originalServiceId?'selected':''}>${esc(service.name)}</option>`).join('');
  const deletedServiceOption=originalService&&!state.services.some(service=>service.id===originalService.id)
    ?`<option value="${esc(originalService.id)}" selected>${esc(originalService.name)} (saved)</option>`:'';
  const knownClients=[...new Set(state.calculations.map(record=>record.clientName).filter(Boolean))];
  modal(editing?'Edit appointment':'Add appointment',`<form><div class="error-message"></div><div class="form-grid">
    <div class="field"><label class="required">Client</label><input class="input" name="client" required maxlength="100" list="client-names" value="${esc(appointment?.clientName||'')}" placeholder="Select or enter client"><datalist id="client-names">${knownClients.map(name=>`<option value="${esc(name)}">`).join('')}</datalist></div>
    <div class="field"><label>Service <span style="font-weight:400;color:#a2a29b">(optional)</span></label><select class="select" name="service"><option value="">No service</option>${deletedServiceOption}${serviceOptions}</select></div>
    <div class="field full"><label>Extras <span style="font-weight:400;color:#a2a29b">(optional)</span></label><div id="appt-extras-list" class="extras-list"></div></div>
    <div class="field appointment-date-field"><label class="required">Date</label><div class="appointment-date-selects"><select class="select" name="dateMonth" aria-label="Month">${monthOptions}</select><select class="select" name="dateDay" aria-label="Day">${Array.from({length:new Date(initialYear,initialDateParts.getMonth()+1,0).getDate()},(_,index)=>index+1).map(day=>`<option value="${day}" ${day===initialDateParts.getDate()?'selected':''}>${day}</option>`).join('')}</select><select class="select" name="dateYear" aria-label="Year">${yearOptions}</select></div><input type="hidden" name="date" value="${esc(initialDate)}"><small class="appointment-date-preview" id="appointment-date-preview" aria-live="polite"></small></div>
    <div class="field"><label class="required">Time</label><input class="input" name="time" type="time" required value="${esc(appointment?.time||'09:00')}"></div>
    <div class="field"><label>Total duration</label><output class="input appt-total" id="appt-total-duration">0 min</output></div>
    <div class="field"><label>Total price</label><output class="input appt-total" id="appt-total-price">$0.00</output></div>
    <div class="field full"><label>Notes</label><textarea class="textarea" name="notes" maxlength="500" placeholder="Optional notes">${esc(appointment?.notes||'')}</textarea></div>
  </div>${formActions('Cancel',editing?'Save changes':'Save Appointment')}</form>`,{wide:true,subtitle:'Choose a client, time and the services for this booking.'});

  const form=$('.modal form');
  const serviceInput=$('[name="service"]',form);
  const dateInput=$('[name="date"]',form);
  const monthInput=$('[name="dateMonth"]',form);
  const dayInput=$('[name="dateDay"]',form);
  const yearInput=$('[name="dateYear"]',form);
  const datePreview=$('#appointment-date-preview');
  const extraList=$('#appt-extras-list');
  const selectedService=()=>{
    const serviceId=serviceInput.value;
    if(!serviceId)return null;
    if(editing&&serviceId===originalServiceId)return originalService;
    const service=state.services.find(item=>item.id===serviceId);
    return service?{id:service.id,name:service.name,price:Number(service.defaultPrice)||0,durationMinutes:Number(service.defaultDurationMinutes)||0,materialCost:Number(service.defaultMaterialCost)||0}:null;
  };
  const totals=()=>{
    const service=selectedService();
    const extras=[...selectedExtras.values()];
    return {
      service,
      extras,
      price:(Number(service?.price)||0)+extras.reduce((sum,extra)=>sum+(Number(extra.price)||0),0),
      durationMinutes:(Number(service?.durationMinutes)||0)+extras.reduce((sum,extra)=>sum+(Number(extra.durationMinutes)||0),0)
    };
  };
  const updateTotals=()=>{
    const result=totals();
    $('#appt-total-price').textContent=money(result.price);
    $('#appt-total-duration').textContent=formatDuration(result.durationMinutes);
    return result;
  };
  const renderExtras=()=>{
    const catalog=[...state.extras];
    for(const saved of originalExtras)if(!catalog.some(item=>item.id===saved.id))catalog.push(saved);
    extraList.innerHTML=catalog.length?catalog.map(extra=>{
      const display=selectedExtras.get(extra.id)||extra;
      return `<label class="extra-row"><input class="check appt-extra" type="checkbox" value="${esc(extra.id)}" ${selectedExtras.has(extra.id)?'checked':''}><span class="extra-copy"><strong>${esc(display.name)}</strong><small>+${money(display.price)} · ${formatDuration(display.durationMinutes)}</small></span></label>`;
    }).join(''):'<div class="empty-inline">Add an extra from Setup to include one here.</div>';
    $$('.appt-extra',extraList).forEach(input=>input.addEventListener('change',()=>{
      const extraId=input.value;
      if(input.checked){
        const item=state.extras.find(extra=>extra.id===extraId)||originalExtras.find(extra=>extra.id===extraId);
        if(item)selectedExtras.set(extraId,{...item});
      }else selectedExtras.delete(extraId);
      updateTotals();
    }));
    updateTotals();
  };
  const updateDatePreview=()=>{
    const year=Number(yearInput.value),month=Number(monthInput.value),day=Number(dayInput.value);
    const daysInMonth=new Date(year,month,0).getDate();
    const selectedDay=Math.min(day,daysInMonth);
    dayInput.innerHTML=Array.from({length:daysInMonth},(_,index)=>index+1).map(value=>`<option value="${value}" ${value===selectedDay?'selected':''}>${value}</option>`).join('');
    dateInput.value=`${year}-${String(month).padStart(2,'0')}-${String(Number(dayInput.value)).padStart(2,'0')}`;
    const parsed=dateFromISO(dateInput.value);
    datePreview.textContent=parsed?`Booking on ${parsed.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric',year:'numeric'})}`:'';
  };
  serviceInput.addEventListener('change',updateTotals);
  [monthInput,dayInput,yearInput].forEach(input=>input.addEventListener('change',updateDatePreview));
  renderExtras();
  updateDatePreview();

  wireForm(fd=>{
    const client=String(fd.get('client')||'').trim();
    const serviceId=String(fd.get('service')||'')||null;
    const date=String(fd.get('date')||'');
    const time=String(fd.get('time')||'');
    const result=updateTotals();
    if(!client)return err('Enter a client name.');
    if(!dateFromISO(date))return err('Choose a valid date.');
    if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))return err('Enter a valid appointment time.');
    if(!Number.isFinite(result.price)||result.price<0||!Number.isFinite(result.durationMinutes)||result.durationMinutes<0)return err('Check the selected service and extras.');
    const record={
      id:appointment?.id||id(),
      clientName:client,
      serviceId,
      serviceNameSnapshot:result.service?.name||(result.extras.length?'Extras only':'Appointment'),
      servicePrice:Number(result.service?.price)||0,
      serviceDurationMinutes:Number(result.service?.durationMinutes)||0,
      selectedExtras:result.extras.map(extra=>({...extra})),
      inventoryUsageSnapshot:appointmentInventoryUsage(serviceId,result.extras),
      date,time,
      durationMinutes:result.durationMinutes,
      price:result.price,
      notes:String(fd.get('notes')||'').trim(),
      status:appointment?.status||'scheduled'
    };
    if(appointment){
      const previous={...appointment};
      Object.assign(appointment,record);
      if(!save()){Object.assign(appointment,previous);return}
    }else{
      state.appointments.push(record);
      if(!save()){state.appointments.pop();return}
    }
    calendar.date=dateFromISO(date)||calendar.date;
    closeModal();
    render();
  });
}
function openCalculationDetail(cid){const c=state.calculations.find(x=>x.id===cid);if(!c)return;modal(`${esc(c.clientName)} · ${esc(c.serviceNameSnapshot)}`,`<div class="detail-grid"><div class="detail-item"><span>Client</span><strong>${esc(c.clientName)}</strong></div><div class="detail-item"><span>Date</span><strong>${fmtDate(c.date)}</strong></div>${c.appointmentTime?`<div class="detail-item"><span>Appointment time</span><strong>${esc(c.appointmentTime)}</strong></div>`:""}<div class="detail-item"><span>Service price</span><strong>${money(c.servicePrice)}</strong></div><div class="detail-item"><span>Extra prices</span><strong>${money((c.extras||[]).reduce((n,e)=>n+Number(e.price||0),0))}</strong></div>${Number(c.adjustmentAmount)>0?`<div class="detail-item"><span>Price adjustment</span><strong>${c.adjustmentType==='deduct'?'−':'+'}${money(c.adjustmentAmount)}</strong></div>`:''}<div class="detail-item"><span>Total client price</span><strong>${money(c.price)}</strong></div><div class="detail-item"><span>Supplies</span><strong>${money(inventoryUsageCost(c.inventoryUsageSnapshot||[]))}</strong></div><div class="detail-item"><span>Service time</span><strong>${formatDuration(c.serviceTimeMinutes)}</strong></div><div class="detail-item"><span>Extra time</span><strong>${formatDuration(c.extraTimeMinutes)}</strong></div><div class="detail-item"><span>Total time</span><strong>${formatDuration(c.totalTimeMinutes)}</strong></div><div class="detail-item"><span>Estimated profit</span><strong>${money(c.profit)}</strong></div><div class="detail-item"><span>Profit per hour</span><strong>${money(c.profitPerHour)} /hr</strong></div><div class="detail-item"><span>Profit margin</span><strong>${Number(c.profitMargin||0).toFixed(1)}%</strong></div></div><p class="detail-section-title">Selected extras</p><div class="detail-extras">${c.extras?.length?c.extras.map(e=>`<span>${esc(e.name)} · ${money(e.price)}</span>`).join(''):'<span>No extras</span>'}</div>${c.notes?`<p class="detail-section-title">Notes</p><p style="font-size:12px;line-height:1.5;color:#666;white-space:pre-wrap">${esc(c.notes)}</p>`:""}<div class="modal-actions"><button class="btn btn-danger" data-detail-delete>Delete</button><button class="btn" data-detail-notes>${c.notes?'Edit notes':'Add notes'}</button><button class="btn" data-detail-edit>Edit details</button><button class="btn btn-primary" data-modal-cancel>Done</button></div>`,{wide:true});$('[data-modal-cancel]').onclick=closeModal;$('[data-detail-notes]').onclick=()=>openCalculationNotes(cid);$('[data-detail-delete]').onclick=()=>{if(confirm('Delete this saved calculation?')){state.calculations=state.calculations.filter(x=>x.id!==cid);save();closeModal();render()}};$('[data-detail-edit]').onclick=()=>openCalculationEdit(cid)}
function openCalculationNotes(cid){const c=state.calculations.find(x=>x.id===cid);if(!c)return;modal('Client notes',`<form><div class="field"><label for="client-log-notes">Notes</label><textarea class="textarea" id="client-log-notes" name="notes" maxlength=1000 placeholder="Add a note about this client or appointment…">${esc(c.notes||'')}</textarea></div>${formActions('Cancel','Save notes')}</form>`,{subtitle:`${esc(c.clientName)} · ${esc(c.serviceNameSnapshot)}`});wireForm(fd=>{c.notes=String(fd.get('notes')||'').trim();save();closeModal();openCalculationDetail(cid)})}
function openCalculationEdit(cid){const c=state.calculations.find(x=>x.id===cid);if(!c)return;const duration=durationInputParts(c.totalTimeMinutes);modal('Edit calculation',`<form><div class="error-message"></div><div class="form-grid"><div class="field full"><label class="required">Service name</label><input class="input" name="serviceName" required maxlength="60" value="${esc(c.serviceNameSnapshot||'Custom service')}"></div><div class="field"><label class="required">Client name</label><input class="input" name="client" required value="${esc(c.clientName)}"></div><div class="field"><label class="required">Date</label><input class="input" name="date" type="date" required value="${esc(c.date)}"></div><div class="field"><label class="required">Client price</label><span class="money-input"><span class="money-affix" aria-hidden="true">$</span><input class="input" name="price" type="number" min="0" step="0.01" required value="${esc(c.price)}"></span></div><div class="field"><label class="required">Total time</label><div class="input-group duration-input"><span class="duration-clock" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/></svg></span><input class="input" name="duration" type="number" min="0" step="1" required value="${esc(duration.value)}"><select class="select" name="unit"><option ${duration.unit==='Minutes'?'selected':''}>Minutes</option><option ${duration.unit==='Hours'?'selected':''}>Hours</option></select></div></div></div>${formActions('Cancel','Save changes')}</form>`,{subtitle:'Rename the service and update the saved calculation details.'});wireForm(fd=>{const serviceName=fd.get('serviceName').trim(),client=fd.get('client').trim(),date=fd.get('date'),p=num(fd.get('price')),durationValue=num(fd.get('duration')),t=durationValue===null?null:durationValue*(fd.get('unit')==='Hours'?60:1);if(!serviceName||!client||!date||p===null||p<0||t===null||t<0)return err('Complete every field with valid non-negative values.');const extras=c.extras||c.selectedExtras||[],extraPrice=extras.reduce((sum,e)=>sum+(Number(e.price)||0),0),priceAdjustment=p-(Number(c.servicePrice)||0)-extraPrice,oldMinutes=Number(c.totalTimeMinutes)||0,extraTimeRatio=oldMinutes>0?Math.max(0,Math.min(1,(Number(c.extraTimeMinutes)||0)/oldMinutes)):0,extraMinutes=Math.round(t*extraTimeRatio),supplyCost=inventoryUsageCost(c.inventoryUsageSnapshot||[]);c.serviceNameSnapshot=serviceName;c.clientName=client;c.date=date;c.price=p;c.adjustmentType=priceAdjustment<0?'deduct':'add';c.adjustmentAmount=Math.abs(priceAdjustment);c.materialCost=supplyCost;c.inventoryMaterialCost=supplyCost;c.profit=p-supplyCost;c.totalTimeMinutes=t;c.serviceTimeMinutes=t-extraMinutes;c.extraTimeMinutes=extraMinutes;c.profitPerHour=t>0?c.profit/(t/60):0;c.profitMargin=p>0?c.profit/p*100:0;save();closeModal();render()})}
function appointmentLogExists(appointment){
  return state.calculations.some(record=>record.appointmentId===appointment.id);
}
function appointmentToCalculation(appointment){
  const extras=appointmentExtras(appointment);
  const price=Number(appointment.price)||0;
  const inventoryMaterial=inventoryUsageCost(Array.isArray(appointment.inventoryUsageSnapshot)?appointment.inventoryUsageSnapshot:appointmentInventoryUsage(appointment.serviceId,extras));
  const profit=price-inventoryMaterial;
  const minutes=Number(appointment.durationMinutes)||0;
  return {
    id:id(),
    appointmentId:appointment.id,
    clientName:appointment.clientName,
    serviceId:appointment.serviceId||null,
    serviceNameSnapshot:appointment.serviceNameSnapshot||'Extras only',
    selectedExtras:extras.map(extra=>({...extra})),
    extras:extras.map(extra=>({...extra})),
    servicePrice:Number(appointment.servicePrice)||0,
    extraPrices:extras.map(extra=>({name:extra.name,price:extra.price})),
    price,
    serviceTimeMinutes:Number(appointment.serviceDurationMinutes)||0,
    extraTimeMinutes:extras.reduce((sum,extra)=>sum+(Number(extra.durationMinutes)||0),0),
    totalTimeMinutes:minutes,
    inventoryMaterialCost:inventoryMaterial,
    materialCost:inventoryMaterial,
    profit,
    profitPerHour:minutes?profit/(minutes/60):0,
    profitMargin:price?profit/price*100:0,
    date:appointment.date,
    appointmentTime:appointment.time,
    notes:appointment.notes||'',
    createdAt:new Date().toISOString()
  };
}
function addAppointmentToLog(appointment){
  if(appointmentLogExists(appointment))return false;
  const record=appointmentToCalculation(appointment);
  state.calculations.push(record);
  if(save())return true;
  state.calculations.pop();
  return false;
}
function confirmAppointmentLog(appointment){
  if(appointmentLogExists(appointment)){toast('This appointment is already in the Client Log.');return}
  modal('Add to Client Log?',`<p class="confirm-copy">Save ${esc(appointment.clientName)}’s completed appointment with its service, extras, date, price, and duration?</p><div class="modal-actions"><button class="btn" data-modal-cancel>Not now</button><button class="btn btn-primary" data-confirm-log>Add to Client Log</button></div>`);
  $('[data-modal-cancel]').onclick=closeModal;
  $('[data-confirm-log]').onclick=()=>{
    if(!addAppointmentToLog(appointment)){closeModal();return}
    closeModal();render();toast('Appointment added to Client Log');
  };
}
function completeAppointment(appointmentId){
  const appointment=state.appointments.find(item=>item.id===appointmentId);
  if(!appointment||appointment.status==='completed')return;
  const usages=Array.isArray(appointment.inventoryUsageSnapshot)?appointment.inventoryUsageSnapshot:appointmentInventoryUsage(appointment.serviceId,appointmentExtras(appointment));
  const totals=new Map();for(const use of usages)totals.set(use.itemId,(totals.get(use.itemId)||0)+(Number(use.quantity)||0));
  const short=[];for(const [itemId,quantity] of totals){const item=state.inventory.find(entry=>entry.id===itemId);if(item&&Number(item.quantity)<quantity)short.push(`${item.name} (need ${quantity}, have ${Number(item.quantity)||0})`)}
  if(short.length){toast(`Not enough stock to complete: ${short.join(', ')}.`);return}
  const oldStatus=appointment.status,oldQuantities=[];
  for(const [itemId,quantity] of totals){const item=state.inventory.find(entry=>entry.id===itemId);if(item){oldQuantities.push([item,Number(item.quantity)||0]);item.quantity=(Number(item.quantity)||0)-quantity}}
  appointment.status='completed';
  appointment.inventoryDeducted=true;
  if(!save()){appointment.status=oldStatus;appointment.inventoryDeducted=false;for(const [item,quantity] of oldQuantities)item.quantity=quantity;return}
  closeModal();render();
  if(!appointmentLogExists(appointment))confirmAppointmentLog(appointment);
}
function openAppointmentDetail(appointmentId){
  const appointment=state.appointments.find(item=>item.id===appointmentId);
  if(!appointment)return;
  const extras=appointmentExtras(appointment);
  const status=appointment.status==='completed'?'completed':'scheduled';
  const logged=appointmentLogExists(appointment);
  const extraDetails=extras.length
    ?extras.map(extra=>`<span>${esc(extra.name)} · ${money(extra.price)} · ${formatDuration(extra.durationMinutes)}</span>`).join('')
    :'<span>No extras</span>';
  const statusAction=status==='completed'
    ?logged?'<button class="btn" disabled>Added to Client Log</button>':'<button class="btn btn-primary" data-appt-log>Add to Client Log</button>'
    :'<button class="btn btn-primary" data-appt-complete>Mark completed</button>';
  modal(esc(appointment.clientName||'Appointment'),`<div class="detail-grid">
    <div class="detail-item"><span>Client</span><strong>${esc(appointment.clientName||'—')}</strong></div>
    <div class="detail-item"><span>Service</span><strong>${esc(appointment.serviceNameSnapshot||'Appointment')}</strong></div>
    <div class="detail-item"><span>Date</span><strong>${fmtDate(appointment.date)}</strong></div>
    <div class="detail-item"><span>Time</span><strong>${esc(appointment.time||'—')}</strong></div>
    <div class="detail-item"><span>Total duration</span><strong>${formatDuration(appointment.durationMinutes)}</strong></div>
    <div class="detail-item"><span>Total price</span><strong>${money(appointment.price)}</strong></div>
    <div class="detail-item"><span>Status</span><strong class="status-label status-${status}">${status==='completed'?'Completed':'Scheduled'}</strong></div>
  </div><p class="detail-section-title">Selected extras</p><div class="detail-extras">${extraDetails}</div>
  ${appointment.notes?`<p class="detail-section-title">Notes</p><p style="font-size:12px;line-height:1.5;color:#666;white-space:pre-wrap">${esc(appointment.notes)}</p>`:''}
  <div class="modal-actions appointment-detail-actions"><button class="btn btn-danger" data-appt-delete>Delete</button><button class="btn" data-appt-notes>${appointment.notes?'Edit notes':'Add notes'}</button><button class="btn" data-appt-edit>Edit</button>${statusAction}<button class="btn" data-modal-cancel>Done</button></div>`,{wide:true});
  $('[data-modal-cancel]').onclick=closeModal;
  $('[data-appt-notes]').onclick=()=>openAppointmentNotes(appointmentId);
  $('[data-appt-edit]').onclick=()=>openAppointment(appointmentId);
  $('[data-appt-complete]')?.addEventListener('click',()=>completeAppointment(appointmentId));
  $('[data-appt-log]')?.addEventListener('click',()=>confirmAppointmentLog(appointment));
  $('[data-appt-delete]').onclick=()=>{
    if(!confirm('Delete this appointment?'))return;
    const previous=state.appointments;
    state.appointments=previous.filter(item=>item.id!==appointmentId);
    if(!save()){state.appointments=previous;return}
    closeModal();render();
  };
}

function openAppointmentNotes(appointmentId){
  const appointment=state.appointments.find(item=>item.id===appointmentId);
  if(!appointment)return;
  modal('Appointment notes',`<form><div class="field"><label for="appointment-notes">Notes</label><textarea class="textarea" id="appointment-notes" name="notes" maxlength="1000" placeholder="Add notes for this appointment…">${esc(appointment.notes||'')}</textarea></div>${formActions('Cancel','Save notes')}</form>`,{subtitle:`${esc(appointment.clientName||'Appointment')} · ${fmtDate(appointment.date)}`});
  wireForm(fd=>{
    const previous=appointment.notes||'';
    appointment.notes=String(fd.get('notes')||'').trim();
    if(!save()){appointment.notes=previous;return}
    closeModal();
    openAppointmentDetail(appointmentId);
  });
}

function toast(message){const old=$('.toast');old?.remove();const t=document.createElement('div');t.className='toast';t.setAttribute('role','status');t.setAttribute('aria-live','polite');t.textContent=message;document.body.append(t);setTimeout(()=>t.remove(),3000)}
render();
