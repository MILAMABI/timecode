/*!
 * Playhead
 * © 2026 MILAMABI. Все права защищены. Проприетарное ПО — см. LICENSE.
 * Копирование, изменение и распространение без разрешения автора запрещены.
 */

const PALETTE=["c1","c2","c3","c4","c5","c6","c7","c8"];
const DEFAULT_STAGES=[
  {id:"edit",name:"Монтаж",color:"c1"},
  {id:"color",name:"Цветкор",color:"c2"},
  {id:"sound",name:"Саунд-дизайн",color:"c3"},
  {id:"vfx",name:"VFX",color:"c4"},
  {id:"render",name:"Рендер",color:"c8"},
  {id:"revisions",name:"Правки клиента",color:"c5"}
];
const SUGGEST=["Разбор материала","Моушн-дизайн","Субтитры","Экспорт и доставка","Созвоны с клиентом","Сценарий и раскадровка","Синхрон звука"];
const MAX_ACTIVE=12;
const LST="rt-tab";
let tab="timer", projFilter=null, focusState={phase:"idle"}, pauseState=null, breaks=[];
const VIEWS={timer:"Таймер",stats:"Статистика",projects:"Проекты",sessions:"Сессии",settings:"Настройки"};
const FPS=25, LS="rt-sessions-v1", LSS="rt-stages-v1", LSP="rt-period", LSPRJ="rt-project";
let sessions=[], stages=DEFAULT_STAGES.map(s=>({...s})), period="week", settings={auto:true,idleMinutes:5}, override=null, live={}, platform="darwin";
const $=id=>document.getElementById(id);
const active=()=>stages.filter(s=>!s.archived);
const stageOf=id=>stages.find(s=>s.id===id)||{id,name:"Удалённый этап",color:null};
const cvar=s=>s.color?`var(--${s.color})`:"var(--muted)";

/* ---------- storage (через приложение) ---------- */
function lsGet(k,d){try{const v=localStorage.getItem(k);return v==null?d:v}catch{return d}}
function lsSet(k,v){try{localStorage.setItem(k,v)}catch{}}
function newId(){return Date.now().toString(36)+Math.random().toString(36).slice(2,8)}
const store={
  add:s=>api.addSession(s),
  update:(id,patch)=>api.updateSession(id,patch),
  put:(id,data)=>api.addSession({...data,id}),
  remove:id=>api.removeSession(id)
};
function saveStages(){render();safe(()=>api.setStages(stages.map(s=>({...s}))))}
async function safe(fn){try{await fn()}catch(e){console.error(e);toast("Не получилось сохранить. Попробуй ещё раз.")}}

/* ---------- time helpers ---------- */
const running=()=>sessions.find(s=>s.end==null&&(s.source!=="auto"||s.id===live.sessionId));
function endOf(s){
  if(s.end!=null)return s.end;
  if(s.source==="auto"){
    if(s.id!==live.sessionId)return s.lastSeen||s.start;
    return live.inGrace?(live.last||Date.now()):Date.now();
  }
  return Date.now();
}
// away — время, когда отвлёкся на другие программы внутри сессии; оно не считается
const awayOf=s=>s.end==null&&s.source==="auto"&&s.id===live.sessionId?(live.away||0):(s.away||0);
const dur=s=>Math.max(0,endOf(s)-s.start-awayOf(s));
function startOfDay(t){const d=new Date(t);d.setHours(0,0,0,0);return d.getTime()}
function periodStart(p){
  const now=new Date();
  if(p==="today")return startOfDay(now);
  if(p==="week"){const d=new Date(startOfDay(now));const wd=(d.getDay()+6)%7;d.setDate(d.getDate()-wd);return d.getTime()}
  if(p==="month")return new Date(now.getFullYear(),now.getMonth(),1).getTime();
  return 0;
}
function fmtHM(ms){
  const m=Math.floor(ms/60000);
  if(m<1)return ms>0?"<1 мин":"0 мин";
  const h=Math.floor(m/60),mm=m%60;
  return h?`${h} ч ${String(mm).padStart(2,"0")} мин`:`${mm} мин`;
}
function fmtTC(ms){
  const s=Math.floor(ms/1000),h=Math.floor(s/3600),m=Math.floor(s%3600/60),sec=s%60,f=Math.floor(ms%1000/(1000/FPS));
  const p=n=>String(n).padStart(2,"0");
  return `${p(h)}:${p(m)}:${p(sec)}<span class="ff">:${p(f)}</span>`;
}
const fmtClock=t=>new Date(t).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"});
const DOW=["Вс","Пн","Вт","Ср","Чт","Пт","Сб"];
function dayLabel(t){
  const d0=startOfDay(Date.now());
  if(t===d0)return "Сегодня";
  if(t===d0-864e5)return "Вчера";
  return new Date(t).toLocaleDateString("ru-RU",{weekday:"short",day:"numeric",month:"long"});
}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function plural(n,a,b,c){const m=n%10,h=n%100;if(m===1&&h!==11)return a;if(m>=2&&m<=4&&(h<12||h>14))return b;return c}

/* ---------- timer actions ---------- */
async function toggle(cat){await safe(()=>api.toggleTimer(cat,$("project").value.trim()))}
async function stop(){if(settings.auto)return;await safe(()=>api.stopTimer())}

/* ---------- stage editing ---------- */
const nameTaken=(name,exceptId)=>stages.some(s=>s.id!==exceptId&&!s.archived&&s.name.toLowerCase()===name.toLowerCase());
function addStage(name){
  name=name.trim();
  if(!name){toast("Напиши название этапа");return false}
  if(active().length>=MAX_ACTIVE){toast(`Максимум ${MAX_ACTIVE} этапов. Убери ненужный, чтобы добавить новый.`);return false}
  const old=stages.find(s=>s.archived&&s.name.toLowerCase()===name.toLowerCase());
  if(old){old.archived=false;saveStages();toast(`Этап «${old.name}» вернулся вместе со старой статистикой`);return true}
  if(nameTaken(name)){toast("Такой этап уже есть");return false}
  const used=new Set(active().map(s=>s.color));
  const color=PALETTE.find(c=>!used.has(c))||PALETTE[stages.length%PALETTE.length];
  stages.push({id:newId(),name,color});
  saveStages();toast(`Этап «${name}» добавлен`);return true;
}
let armedStage=null;
function renderEditor(){
  const box=$("slist");
  if(box.contains(document.activeElement)&&document.activeElement.tagName==="INPUT")return;
  const act=active(),arch=stages.filter(s=>s.archived);
  box.innerHTML=act.map((s,i)=>`<div class="srow" data-id="${s.id}">
      <button type="button" class="swatch" data-act="color" style="background:${cvar(s)}" aria-label="Сменить цвет этапа ${esc(s.name)}"></button>
      <input data-act="name" value="${esc(s.name)}" maxlength="30" aria-label="Название этапа">
      <button type="button" class="ghost" data-act="up" ${i===0?"disabled":""} aria-label="Поднять выше">↑</button>
      <button type="button" class="ghost ${armedStage===s.id?"armed":""}" data-act="arch">${armedStage===s.id?"Точно убрать?":"Убрать"}</button>
    </div>`).join("")+
    (arch.length?`<p class="slabel">Убранные этапы (их часы остаются в статистике):</p>`+arch.map(s=>`<div class="srow arch" data-id="${s.id}">
      <span class="swatch" style="background:${cvar(s)}"></span><span>${esc(s.name)}</span><span></span>
      <button type="button" class="ghost" data-act="restore">Вернуть</button></div>`).join(""):"");
  const names=new Set(act.map(s=>s.name.toLowerCase()));
  const sug=SUGGEST.filter(n=>!names.has(n.toLowerCase()));
  $("chips").innerHTML=sug.map(n=>`<button type="button" class="chip" data-sug="${esc(n)}">+ ${esc(n)}</button>`).join("");
  $("chipsLabel").hidden=!sug.length;
}
$("slist").addEventListener("click",e=>{
  const b=e.target.closest("[data-act]");if(!b)return;
  const row=b.closest("[data-id]"),s=stages.find(x=>x.id===row.dataset.id);if(!s)return;
  const act=b.dataset.act;
  if(act==="color"){
    const used=new Set(active().filter(x=>x!==s).map(x=>x.color));
    let i=PALETTE.indexOf(s.color);
    for(let k=1;k<=PALETTE.length;k++){const c=PALETTE[(i+k)%PALETTE.length];if(!used.has(c)||k===PALETTE.length){s.color=c;break}}
    saveStages();
  }else if(act==="up"){
    const act_=active(),i=act_.indexOf(s);if(i<1)return;
    const a=stages.indexOf(act_[i-1]),b2=stages.indexOf(s);[stages[a],stages[b2]]=[stages[b2],stages[a]];saveStages();
  }else if(act==="arch"){
    if(active().length<=1){toast("Должен остаться хотя бы один этап");return}
    if(armedStage!==s.id){armedStage=s.id;renderEditor();setTimeout(()=>{if(armedStage===s.id){armedStage=null;renderEditor()}},3000);return}
    armedStage=null;
    const run=running();if(run&&run.cat===s.id)stop();
    s.archived=true;saveStages();
  }else if(act==="restore"){
    if(active().length>=MAX_ACTIVE){toast(`Максимум ${MAX_ACTIVE} этапов`);return}
    s.archived=false;saveStages();
  }
});
$("slist").addEventListener("change",e=>{
  const inp=e.target.closest('[data-act="name"]');if(!inp)return;
  const s=stages.find(x=>x.id===inp.closest("[data-id]").dataset.id);if(!s)return;
  const v=inp.value.trim();
  if(!v){inp.value=s.name;toast("У этапа должно быть название");return}
  if(nameTaken(v,s.id)){inp.value=s.name;toast("Такой этап уже есть");return}
  if(v!==s.name){s.name=v;inp.blur();saveStages()}
});
$("slist").addEventListener("keydown",e=>{if(e.key==="Enter"&&e.target.matches("input")){e.preventDefault();e.target.blur()}});
$("sadd").addEventListener("submit",e=>{e.preventDefault();if(addStage($("sName").value))$("sName").value=""});
$("chips").addEventListener("click",e=>{const b=e.target.closest("[data-sug]");if(b)addStage(b.dataset.sug)});

/* ---------- render ---------- */
function renderClips(){
  const run=running(),today=startOfDay(Date.now());
  $("clips").innerHTML=active().map((c,i)=>{
    const t=sessions.filter(s=>s.cat===c.id&&s.start>=today).reduce((a,s)=>a+dur(s),0);
    const on=run&&run.cat===c.id,ovr=settings.auto&&override===c.id;
    const ico=on?'<svg viewBox="0 0 12 12"><rect x="2" y="1.5" width="3" height="9" rx="1"/><rect x="7" y="1.5" width="3" height="9" rx="1"/></svg>':'<svg viewBox="0 0 12 12"><path d="M3 1.8v8.4a.6.6 0 0 0 .9.5l7-4.2a.6.6 0 0 0 0-1L3.9 1.3a.6.6 0 0 0-.9.5z"/></svg>';
    return `<button class="clip" style="--c:${cvar(c)}" data-cat="${c.id}" aria-pressed="${!!on}">
      <span class="ico" aria-hidden="true">${ico}</span>
      <span class="txt"><span class="name">${esc(c.name)}${i<9?` <kbd>${i+1}</kbd>`:""}</span>
      <span class="meta num">${ovr?"вручную · ":on?"идёт · ":""}сегодня ${fmtHM(t)}</span></span></button>`;
  }).join("");
}
let catalog=[];
const PROF_COLOR={video:"var(--c1)",photo:"var(--c2)",design:"var(--c4)",motion:"var(--c7)",audio:"var(--c3)",print3d:"var(--c6)"};
const profColor=id=>PROF_COLOR[id]||"var(--c5)";
const PROF_ICON={
  video:'<svg viewBox="0 0 24 24"><rect x="3" y="6" width="13" height="12" rx="2.5"/><path d="M16 10.5l5-3v9l-5-3"/></svg>',
  photo:'<svg viewBox="0 0 24 24"><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H8l1.5-2h5L16 6h1.5A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z"/><circle cx="12" cy="12.5" r="3.5"/></svg>',
  design:'<svg viewBox="0 0 24 24"><path d="M12 3l7 7-4 9H9l-4-9z"/><circle cx="12" cy="11" r="1.6"/><path d="M12 3v6.4M9 19h6"/></svg>',
  motion:'<svg viewBox="0 0 24 24"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/></svg>',
  audio:'<svg viewBox="0 0 24 24"><path d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4"/></svg>',
  print3d:'<svg viewBox="0 0 24 24"><path d="M4 4h16v4H4z"/><path d="M12 8v4"/><path d="M9 12h6l-1 2h-4z"/><path d="M6 20h12M8 20l1-3h6l1 3"/></svg>'
};
const myProfs=()=>settings.professions&&settings.professions.length?settings.professions:["video"];
// встроенные направления + свои
const fullCatalog=()=>catalog.filter(p=>!p.custom).concat((settings.customProfessions||[]).map(p=>({...p,custom:true,desc:"Своё направление",apps:[]})));
function trackedApps(){const set=(settings.customApps||[]).map(a=>a.label);fullCatalog().filter(p=>myProfs().includes(p.id)).forEach(p=>p.apps.forEach(a=>{if(!set.includes(a))set.push(a)}));return set}
function appsLine(list,max=4){return list.length>max?`${list.slice(0,max).join(", ")} и ещё ${list.length-max}`:list.join(", ")}
function renderStatus(){
  const run=running();
  document.documentElement.style.setProperty("--glow",pauseState?"var(--c2)":run?cvar(stageOf(run.cat)):"var(--c1)");
  $("transport").className="card transport "+(pauseState?"paused":run?"running":"idle");
  const pb=$("pauseBtn");
  pb.innerHTML=pauseState?'<svg viewBox="0 0 24 24"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.4-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z"/></svg>':'<svg viewBox="0 0 24 24"><rect x="5.5" y="4" width="4.5" height="16" rx="1.4"/><rect x="14" y="4" width="4.5" height="16" rx="1.4"/></svg>';
  pb.setAttribute("aria-label",pauseState?"Вернуться к работе":"Пауза");
  pb.title=pauseState?"Вернуться к работе":"Пауза — трекер перестанет записывать время";
  let text;
  if(pauseState)text=pauseState.endsAt?`Перерыв · вернёмся в ${fmtClock(pauseState.endsAt)}`:"Пауза · трекер не пишет время";
  else if(run)text=`${stageOf(run.cat).name}${run.project?" · "+run.project:""}${run.app?" ("+run.app+")":""}${live.inGrace?" · отвлёкся":""}`;
  else if(settings.auto)text=live.idle?"Пауза: тебя нет за компом":"Ждёт рабочую программу";
  else text="Таймер стоит";
  $("statusText").textContent=text;
  $("autoToggle").checked=!!settings.auto;
  $("autoInfo").textContent=settings.auto?`Следит за: ${appsLine(trackedApps())}`:"Запускай таймер кнопками этапов";$("autoInfo").title=trackedApps().join(", ");
  $("hint").textContent=settings.auto
    ?"Этап определяется по программе. Занялся другим этапом в той же программе — нажми его."
    :"Нажми этап, чтобы запустить. Тот же этап — стоп.";
  const acc=settings.auto&&!pauseState&&live.needsAccess&&!accessHidden;
  $("accessBanner").hidden=!acc;
  if(acc)$("accessText").textContent=live.needsAccess==="automation"
    ?"Время пишется, но без названия проекта: разреши Playhead управлять «System Events» в Настройках → Конфиденциальность → Автоматизация."
    :"Время пишется, но без названия проекта: включи Playhead в Настройках → Конфиденциальность → Универсальный доступ. Если он уже включён — выключи и включи заново.";
  const ob=settings.auto&&override;
  $("overrideBanner").hidden=!ob;
  if(ob)$("overrideText").textContent=`Этап выбран вручную: «${stageOf(override).name}». Сбросится сам после 30 минут без работы.`;
  const rs={no_python:"Страницы DaVinci Resolve не определяются: на компьютере не найден Python 3. Время в Resolve пишется как «Монтаж».",
    no_api:"Страницы DaVinci Resolve не определяются: не найден скриптовый модуль Resolve. Время в Resolve пишется как «Монтаж».",
    no_connect:"Resolve не отвечает скриптам. Включи Preferences → System → General → External scripting using: Local. В бесплатной версии это может не работать.",
    ok:"DaVinci Resolve подключён: этап определяется по открытой странице."}[live.resolve];
  $("resolveRow").hidden=!myProfs().includes("video");
  $("resolveNote").textContent=rs||"DaVinci Resolve: этап определяется по открытой странице (Edit, Color, Fairlight, Fusion, Deliver), если Resolve пускает скрипты.";
}
function totalsBy(list){
  const by={};list.forEach(s=>{by[s.cat]=(by[s.cat]||0)+dur(s)});return by;
}
function shownStages(by){
  const known=stages.filter(s=>!s.archived||by[s.id]>0);
  const orphan=Object.keys(by).filter(id=>by[id]>0&&!stages.some(s=>s.id===id)).map(stageOf);
  return known.concat(orphan);
}
function renderSummary(){
  const from=periodStart(period);
  const list=sessions.filter(s=>s.start>=from);
  const by=totalsBy(list),shown=shownStages(by);
  const total=Object.values(by).reduce((a,b)=>a+b,0);
  $("total").textContent=fmtHM(total);
  const days=new Set(list.map(s=>startOfDay(s.start))).size;
  const brk=breaks.filter(b=>b.start>=from).reduce((a,b)=>a+Math.max(0,b.end-b.start),0);
  $("totalSub").textContent=(list.length?`${list.length} ${plural(list.length,"сессия","сессии","сессий")} · ${days} ${plural(days,"рабочий день","рабочих дня","рабочих дней")}`:"нет сессий за период")+(brk?` · перерывы ${fmtHM(brk)}`:"");
  $("track").innerHTML=total?shown.filter(c=>by[c.id]>0).map(c=>`<span style="background:${cvar(c)};width:${by[c.id]/total*100}%" title="${esc(c.name)}"></span>`).join(""):"";
  $("legend").innerHTML=shown.filter(c=>!total||by[c.id]>0).map(c=>{
    const v=by[c.id]||0,pct=total?Math.round(v/total*100):0;
    return `<div class="leg" style="--c:${cvar(c)}"><span class="lname">${esc(c.name)}${c.archived?" (убран)":""}</span><span class="lval num">${fmtHM(v)}</span><span class="lpct num">${pct}%</span></div>`;
  }).join("");
}
function renderChart(){
  const today=startOfDay(Date.now());
  const days=[...Array(7)].map((_,i)=>today-(6-i)*864e5);
  const data=days.map(d=>totalsBy(sessions.filter(s=>startOfDay(s.start)===d)));
  const totals=data.map(o=>Object.values(o).reduce((a,b)=>a+b,0));
  const order=shownStages(totalsBy(sessions.filter(s=>s.start>=days[0])));
  const maxH=Math.max(2,Math.ceil(Math.max(...totals)/36e5));
  const step=maxH<=4?1:maxH<=8?2:maxH<=16?4:6;
  const top=Math.ceil(maxH/step)*step;
  const W=700,H=230,L=40,R=10,T=24,B=30,pw=W-L-R,ph=H-T-B,bw=pw/7;
  const y=ms=>T+ph-(ms/36e5)/top*ph;
  let g="";
  for(let h=0;h<=top;h+=step){g+=`<line class="grid" x1="${L}" x2="${W-R}" y1="${y(h*36e5)}" y2="${y(h*36e5)}"/><text x="${L-8}" y="${y(h*36e5)+4}" text-anchor="end">${h}ч</text>`}
  data.forEach((o,i)=>{
    let acc=0;const x=L+i*bw+bw*.2,w=bw*.6;
    order.forEach(c=>{if(!o[c.id])return;const y0=y(acc),y1=y(acc+o[c.id]);g+=`<rect x="${x}" y="${y1}" width="${w}" height="${Math.max(2,y0-y1-2)}" rx="5" fill="${cvar(c)}"><title>${esc(c.name)}: ${fmtHM(o[c.id])}</title></rect>`;acc+=o[c.id]});
    if(totals[i])g+=`<text x="${x+w/2}" y="${y(acc)-6}" text-anchor="middle">${(totals[i]/36e5).toFixed(1).replace(".",",")}</text>`;
    const d=new Date(days[i]);
    g+=`<text x="${x+w/2}" y="${H-10}" text-anchor="middle" class="${i===6?"today":""}">${DOW[d.getDay()]} ${d.getDate()}</text>`;
  });
  $("chart").innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Часы работы по дням за последние 7 дней">${g}</svg>`;
}
let armed=null;
function renderLog(){
  const from=periodStart(period);
  const list=sessions.filter(s=>s.start>=from&&(!projFilter||projKey(s)===projFilter)).sort((a,b)=>b.start-a.start);
  const pf=$("pfilter");
  if(projFilter){const g=sessions.find(s=>projKey(s)===projFilter);pf.hidden=false;pf.textContent=`${projFilter==="__none"?"Без проекта":(g?g.project.trim():"проект")} ✕`;pf.title="Показать все сессии"}else pf.hidden=true;
  if(!list.length){
    $("log").innerHTML=`<div class="empty">${sessions.length?"За этот период сессий нет.":"Пока пусто. Выбери проект, нажми «Монтаж» или любой этап — и время пошло. Забыл включить таймер? Добавь сессию вручную."}</div>`;
    return;
  }
  const groups=new Map();
  list.forEach(s=>{const d=startOfDay(s.start);if(!groups.has(d))groups.set(d,[]);groups.get(d).push(s)});
  let html="";
  groups.forEach((arr,d)=>{
    const sum=arr.reduce((a,s)=>a+dur(s),0);
    html+=`<div class="day"><h3><span>${esc(dayLabel(d))}</span><span class="num">${fmtHM(sum)}</span></h3><div class="entries">`;
    arr.forEach(s=>{
      const c=stageOf(s.cat),live=s.end==null;
      html+=`<div class="entry" style="--c:${cvar(c)}"><span class="bar"></span>
        <div class="what"><select class="stagesel" data-sess="${s.id}" aria-label="Этап сессии">${stageOptions(s.cat)}</select><small class="num">${fmtClock(s.start)}–${live?"сейчас":fmtClock(s.end)}${s.project?" · "+esc(s.project):""}${s.source==="auto"?` · <span class="tag">авто${s.app?", "+esc(s.app):""}</span>`:""}</small></div>
        <span class="dur num ${live?"live":""}" ${live?'data-live="1"':""}>${fmtHM(dur(s))}</span>
        <button class="del ${armed===s.id?"armed":""}" data-del="${s.id}" aria-label="Удалить сессию">${armed===s.id?"Удалить?":"✕"}</button></div>`;
    });
    html+=`</div></div>`;
  });
  $("log").innerHTML=html;
}
function stageOptions(cur){
  const list=active().slice();const c=stageOf(cur);if(!list.some(x=>x.id===cur))list.push(c);
  return list.map(x=>`<option value="${esc(x.id)}" ${x.id===cur?"selected":""}>${esc(x.name)}</option>`).join("");
}
function renderManualSelect(){
  const sel=$("mCat"),cur=sel.value;
  sel.innerHTML=active().map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("");
  if(active().some(c=>c.id===cur))sel.value=cur;
}
/* ---------- projects ---------- */
const projKey=s=>(s.project||"").trim().toLowerCase()||"__none";
function groupProjects(list){
  const m=new Map();
  list.slice().sort((a,b)=>b.start-a.start).forEach(s=>{
    const k=projKey(s);
    if(!m.has(k))m.set(k,{key:k,name:k==="__none"?"Без проекта":s.project.trim(),sessions:[],last:s.start});
    m.get(k).sessions.push(s);
  });
  return [...m.values()].map(p=>{
    p.by=totalsBy(p.sessions);p.total=Object.values(p.by).reduce((a,b)=>a+b,0);
    p.days=new Set(p.sessions.map(s=>startOfDay(s.start))).size;p.live=p.sessions.some(s=>s.end==null);
    return p;
  }).sort((a,b)=>(a.key==="__none")-(b.key==="__none")||b.total-a.total);
}
function renderProjects(){
  // пока вводишь новое название — не перерисовываем, чтобы не сбить ввод
  if(editKey&&document.activeElement&&document.activeElement.closest&&document.activeElement.closest(".pedit"))return;
  const list=sessions.filter(s=>s.start>=periodStart(period));
  const ps=groupProjects(list);
  if(!ps.length){$("plist").innerHTML=`<div class="empty">${sessions.length?"За этот период проектов нет.":"Впиши название проекта перед запуском таймера — и здесь появится разбивка по каждому проекту."}</div>`;return}
  const grand=ps.reduce((a,p)=>a+p.total,0);
  $("plist").innerHTML=ps.map(p=>{
    const shown=shownStages(p.by).filter(c=>p.by[c.id]>0);
    const share=grand?Math.round(p.total/grand*100):0;
    const editing=editKey===p.key;
    return `<div class="card pcard" data-proj="${esc(p.key)}" role="button" tabindex="0" aria-pressed="${projFilter===p.key}">
      <div class="phead"><span class="pname ${p.key==="__none"?"none":""}">${esc(p.name)}</span>
        <span class="pright">${p.key!=="__none"&&!editing?`<button type="button" class="pedit-btn" data-edit="${esc(p.key)}" title="Переименовать или объединить" aria-label="Переименовать проект ${esc(p.name)}"><svg viewBox="0 0 16 16"><path d="M10.5 2.5l3 3L6 13H3v-3z"/></svg></button>`:""}<span class="ptotal num">${fmtHM(p.total)}</span></span></div>
      ${editing?`<form class="pedit" data-from="${esc(p.key)}">
        <input class="field" id="peditInput" value="${esc(p.name)}" list="projList" maxlength="80" autocomplete="off" aria-label="Новое название проекта">
        <button type="submit" class="pill primary" id="peditGo">Сохранить</button><button type="button" class="pill" data-cancel="1">Отмена</button>
        <p class="pmeta" id="peditHint">Впиши новое название или выбери существующий проект, чтобы объединить.</p></form>`:""}
      <div class="track" aria-hidden="true">${shown.map(c=>`<span style="background:${cvar(c)};width:${p.by[c.id]/p.total*100}%"></span>`).join("")}</div>
      <div class="pstages">${shown.map(c=>`<span style="--c:${cvar(c)}"><i></i>${esc(c.name)} <b class="num">${fmtHM(p.by[c.id])}</b> <em class="num">${Math.round(p.by[c.id]/p.total*100)}%</em></span>`).join("")}</div>
      <div class="pmeta num">${p.live?"идёт сейчас · ":""}${p.sessions.length} ${plural(p.sessions.length,"сессия","сессии","сессий")} · ${p.days} ${plural(p.days,"день","дня","дней")} · ${share}% времени за период · последняя работа: ${esc(dayLabel(startOfDay(p.last)).toLowerCase())}</div>
    </div>`;
  }).join("")+renderAliases();
  if(editKey){const i=$("peditInput");if(i&&document.activeElement!==i){i.focus();i.select()}updateEditHint()}
}
function renderAliases(){
  const al=Object.entries(projectAliases||{});
  if(!al.length)return "";
  return `<div class="aliases"><h3>Связанные названия</h3><p class="pmeta">Файлы с такими названиями автоматически попадают в нужный проект.</p>
    ${al.map(([from,to])=>`<span class="alias"><span>${esc(from)}</span><svg viewBox="0 0 16 10" aria-hidden="true"><path d="M1 5h13M10 1l4 4-4 4"/></svg><b>${esc(to)}</b><button type="button" data-unalias="${esc(from)}" aria-label="Отвязать ${esc(from)}" title="Отвязать">×</button></span>`).join("")}</div>`;
}
function projectNameByKey(k){const s=sessions.find(x=>projKey(x)===k);return s?s.project.trim():""}
function updateEditHint(){
  const i=$("peditInput");if(!i)return;
  const v=i.value.trim(),k=v.toLowerCase(),other=v&&k!==editKey&&sessions.some(s=>projKey(s)===k);
  $("peditGo").textContent=other?"Объединить":"Сохранить";
  $("peditGo").disabled=!v;
  $("peditHint").textContent=!v?"Название не может быть пустым.":other
    ?`Все сессии переедут в «${projectNameByKey(k)}». Файлы с названием «${projectNameByKey(editKey)}» дальше тоже будут попадать туда.`
    :k===editKey?"Можно поменять регистр или написать название аккуратнее.":"Новые сессии из файла со старым названием тоже будут записываться под новым.";
}
function renderAllTime(){
  if(!sessions.length){$("alltime").textContent="Здесь появится общее время в трекере";return}
  const total=sessions.reduce((a,s)=>a+dur(s),0);
  const projects=new Set(sessions.map(projKey).filter(k=>k!=="__none")).size;
  const first=Math.min(...sessions.map(s=>s.start));
  const since=new Date(first).toLocaleDateString("ru-RU",{day:"numeric",month:"short",year:new Date(first).getFullYear()===new Date().getFullYear()?undefined:"numeric"});
  $("alltime").innerHTML=`Всего в трекере <b>${fmtHM(total)}</b><br>${sessions.length} ${plural(sessions.length,"сессия","сессии","сессий")} · ${projects} ${plural(projects,"проект","проекта","проектов")} · с ${esc(since)}`;
}

function renderProjList(){
  const seen=new Map();
  sessions.slice().sort((a,b)=>b.start-a.start).forEach(s=>{const k=projKey(s);if(k!=="__none"&&!seen.has(k))seen.set(k,s.project.trim())});
  $("projList").innerHTML=[...seen.values()].slice(0,40).map(n=>`<option value="${esc(n)}"></option>`).join("");
}
function renderTabs(){
  document.querySelectorAll("#tabs button").forEach(x=>{if(x.dataset.t===tab)x.setAttribute("aria-current","page");else x.removeAttribute("aria-current")});
  document.querySelectorAll("[data-view]").forEach(v=>v.hidden=v.dataset.view!==tab);
  $("viewTitle").textContent=VIEWS[tab];
  $("period").hidden=!["stats","projects","sessions"].includes(tab);
  renderSideNow();
}
function renderSideNow(){
  const run=running(),show=!!run&&tab!=="timer";
  $("sideNow").hidden=!show;
  if(show){$("sideNowL").textContent=stageOf(run.cat).name+(run.project?" · "+run.project:"");const t=Math.floor(dur(run)/1000);$("sideNowV").textContent=`${Math.floor(t/3600)}:${String(Math.floor(t%3600/60)).padStart(2,"0")}:${String(t%60).padStart(2,"0")}`}
}
function render(){if(!booted)return;renderOnboard();renderProfSettings();renderFocus();renderStatus();renderClips();renderTabs();renderSummary();renderChart();renderProjects();renderLog();renderEditor();renderManualSelect();renderAllTime();renderProjList();tick()}

function tick(){
  const run=running();
  if(pauseState)$("tc").innerHTML=fmtTC(pauseState.endsAt?Math.max(0,pauseState.endsAt-Date.now()):Date.now()-pauseState.start);
  else $("tc").innerHTML=fmtTC(run?dur(run):0);
  renderSideNow();renderRing();
}
/* ---------- фокус и перерывы ---------- */
const RING=326.73;
function mmss(ms){const t=Math.max(0,Math.round(ms/1000)),h=Math.floor(t/3600),m=Math.floor(t%3600/60),sec=t%60,p=n=>String(n).padStart(2,"0");return h?`${h}:${p(m)}:${p(sec)}`:`${p(m)}:${p(sec)}`}
function ringModel(){
  const now=Date.now(),f=focusState||{phase:"idle"},p=pauseState;
  if(p){
    if(p.endsAt){const total=(p.minutes||1)*6e4,left=Math.max(0,p.endsAt-now);return{pct:1-left/total,val:mmss(left),label:"Перерыв",color:"var(--c2)",done:false}}
    return{pct:0,val:mmss(now-p.start),label:"Пауза",color:"var(--c2)",done:false};
  }
  if(f.phase==="work"){const total=f.minutes*6e4,left=Math.max(0,f.endsAt-now);const run=running();return{pct:1-left/total,val:mmss(left),label:"Фокус",color:run?cvar(stageOf(run.cat)):"var(--accent)",done:false}}
  if(f.phase==="done")return{pct:1,val:"00:00",label:"Готово",color:"var(--ok)",done:true};
  return{pct:0,val:mmss((settings.focusMinutes||50)*6e4),label:"Фокус",color:"var(--accent)",done:false};
}
function renderRing(){
  const m=ringModel();
  $("ringP").style.strokeDashoffset=String(RING*(1-Math.min(1,Math.max(0,m.pct))));
  $("ring").style.setProperty("--ring",m.color);
  $("ring").classList.toggle("done",m.done);
  if($("ringV").textContent!==m.val)$("ringV").textContent=m.val;
  $("ringL").textContent=m.label;
}
function renderFocus(){
  const f=focusState||{phase:"idle"},p=pauseState,fm=settings.focusMinutes||50,bm=settings.breakMinutes||10;
  const chips=(act,list,cur,cls="")=>list.map(n=>`<button type="button" class="pill ${n===cur?"tint":""} ${cls}" data-act="${act}" data-min="${n}">${n} мин</button>`).join("");
  let title,sub,btns;
  if(p){
    title=p.endsAt?"Перерыв":"Пауза";
    sub=p.endsAt?`Трекер стоит. В ${fmtClock(p.endsAt)} напомню и продолжу запись сама.`:"Трекер не пишет время, пока не вернёшься. Можно поставить таймер на перерыв.";
    btns=`<button type="button" class="pill primary" data-act="resume" style="--c:var(--ok)">Вернуться к работе</button>`+
      (p.endsAt?`<button type="button" class="pill" data-act="extend" data-min="5">+5 мин</button>`:`<span class="fgroup"><span>Таймер</span>${chips("break",[5,10,15],0)}</span>`);
  }else if(f.phase==="work"){
    title=`Фокус-блок · ${f.minutes} мин`;
    sub=`Закончится в ${fmtClock(f.endsAt)}. Потом напомню отдохнуть.`;
    btns=`<button type="button" class="pill tint" data-act="break" data-min="${bm}" style="--c:var(--c2)">Перерыв ${bm} мин сейчас</button><button type="button" class="pill" data-act="stopfocus">Остановить блок</button>`;
  }else if(f.phase==="done"){
    title="Блок закончен";
    sub="Встань, разомнись, дай глазам отдохнуть от монитора.";
    btns=`<span class="fgroup"><span>Перерыв</span>${[5,10,15].map(n=>`<button type="button" class="pill ${n===bm?"primary":"tint"}" data-act="break" data-min="${n}" style="--c:var(--c2)">${n} мин</button>`).join("")}</span><button type="button" class="pill" data-act="focus" data-min="${fm}">Ещё блок ${fm} мин</button>`;
  }else{
    title="Фокус и перерывы";
    sub="Засеки блок работы — по окончании напомню сделать перерыв. Во время перерыва трекер не пишет время.";
    btns=`<span class="fgroup"><span>Фокус</span>${chips("focus",[25,50,90],fm)}</span><span class="fgroup"><span>Перерыв</span>${chips("break",[5,10,15],0,"")}</span>`;
  }
  $("focusTitle").textContent=title;$("focusSub").textContent=sub;$("focusBtns").innerHTML=btns;
  renderRing();
}
$("focusBtns").addEventListener("click",e=>{
  const b=e.target.closest("[data-act]");if(!b)return;const m=+b.dataset.min||null;
  ({focus:()=>api.startFocus(m),break:()=>api.startPause(m),resume:()=>api.resume(),extend:()=>api.extendPause(m||5),stopfocus:()=>api.stopFocus()})[b.dataset.act]?.();
});
$("pauseBtn").addEventListener("click",()=>pauseState?api.resume():api.startPause(null));
setInterval(()=>{if(booted&&(running()||pauseState||(focusState&&focusState.phase==="work")))tick()},1000/FPS);
setInterval(()=>{if(booted&&running()){renderClips();renderSummary();renderChart();renderProjects();renderAllTime();document.querySelectorAll("[data-live]").forEach(el=>el.textContent=fmtHM(dur(running())))}},5000);

/* ---------- events ---------- */
$("clips").addEventListener("click",e=>{const b=e.target.closest("[data-cat]");if(b)toggle(b.dataset.cat)});
$("period").addEventListener("click",e=>{
  const b=e.target.closest("[data-p]");if(!b)return;period=b.dataset.p;lsSet(LSP,period);
  document.querySelectorAll("#period button").forEach(x=>x.setAttribute("aria-pressed",x===b));render();
});
$("tabs").addEventListener("click",e=>{const b=e.target.closest("[data-t]");if(!b)return;tab=b.dataset.t;lsSet(LST,tab);renderTabs();$("content").scrollTop=0});
let editKey=null,projectAliases={};
$("plist").addEventListener("input",e=>{if(e.target.id==="peditInput")updateEditHint()});
$("plist").addEventListener("submit",async e=>{
  e.preventDefault();const f=e.target.closest(".pedit");if(!f)return;
  const to=$("peditInput").value.trim();if(!to)return;
  const r=await api.renameProject(f.dataset.from,to);editKey=null;
  if(projFilter===f.dataset.from)projFilter=to.toLowerCase();
  toast(r&&r.merged?`Объединено с «${to}»`:r&&r.changed?`Проект переименован в «${to}»`:"Ничего не изменилось");
  renderProjects();
});
$("plist").addEventListener("keydown",e=>{
  if(e.target.id==="peditInput"&&e.key==="Escape"){editKey=null;renderProjects();return}
  if((e.key==="Enter"||e.key===" ")&&e.target.classList.contains("pcard")){e.preventDefault();e.target.click()}
});
$("plist").addEventListener("click",e=>{
  const un=e.target.closest("[data-unalias]");if(un){api.removeAlias(un.dataset.unalias);toast("Названия отвязаны");return}
  const ed=e.target.closest("[data-edit]");if(ed){e.stopPropagation();editKey=ed.dataset.edit;renderProjects();return}
  if(e.target.closest("[data-cancel]")){editKey=null;renderProjects();return}
  if(e.target.closest(".pedit"))return;
  const b=e.target.closest("[data-proj]");if(!b)return;
  projFilter=b.dataset.proj;renderProjects();renderLog();
  tab="sessions";lsSet(LST,tab);renderTabs();$("content").scrollTop=0;
});
$("log").addEventListener("change",e=>{
  const sel=e.target.closest(".stagesel");if(!sel)return;
  safe(async()=>{await store.update(sel.dataset.sess,{cat:sel.value});toast(`Этап изменён на «${stageOf(sel.value).name}»`)});
});
function parseCSV(text){
  const rows=[];let row=[],f="",q=false;
  text=text.replace(/^\uFEFF/,"");
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(q){if(ch==='"'){if(text[i+1]==='"'){f+='"';i++}else q=false}else f+=ch}
    else if(ch==='"')q=true;
    else if(ch===","){row.push(f);f=""}
    else if(ch==="\n"||ch==="\r"){if(ch==="\r"&&text[i+1]==="\n")i++;row.push(f);f="";if(row.some(v=>v!==""))rows.push(row);row=[]}
    else f+=ch;
  }
  row.push(f);if(row.some(v=>v!==""))rows.push(row);
  return rows;
}
$("importFile").addEventListener("change",async e=>{
  const file=e.target.files[0];e.target.value="";if(!file)return;
  let rows;try{rows=parseCSV(await file.text())}catch{toast("Не получилось прочитать файл");return}
  const head=rows.shift()||[],ix=n=>head.indexOf(n);
  if(["id","start_ms","end_ms","stage"].some(n=>ix(n)<0)){toast("Не тот файл: нужен CSV из автотрекера или экспорта");return}
  const items=[];
  rows.forEach(r=>{
    const id=r[ix("id")],start=+r[ix("start_ms")],end=+r[ix("end_ms")],cat=r[ix("stage")];
    if(!/^auto-\d+$/.test(id)||!(start>0)||!(end>start)||!cat)return;
    items.push({id,data:{cat,start,end,project:(ix("project")>=0?r[ix("project")]:"").trim(),app:ix("app")>=0?r[ix("app")]:"",source:"auto"}});
  });
  const fresh=items.filter(it=>!sessions.some(s=>s.id===it.id));
  if(!items.length){toast("В файле нет сессий");return}
  if(!fresh.length){toast("Всё из этого файла уже импортировано");return}
  let done=0;
  try{
    for(const it of fresh){await store.put(it.id,it.data);done++;if(done%10===0)toast(`Импорт: ${done} из ${fresh.length}…`)}
    const skipped=items.length-fresh.length;
    toast(`Импортировано ${done} ${plural(done,"сессия","сессии","сессий")}${skipped?`, ${skipped} уже были`:""}`);
  }catch(err){toast(`Импорт остановился на ${done} из ${fresh.length}. Попробуй ещё раз — дублей не будет.`)}
});
$("pfilter").addEventListener("click",()=>{projFilter=null;renderProjects();renderLog()});
$("log").addEventListener("click",e=>{
  const b=e.target.closest("[data-del]");if(!b)return;const id=b.dataset.del;
  if(armed===id){armed=null;safe(()=>store.remove(id))}else{armed=id;renderLog();setTimeout(()=>{if(armed===id){armed=null;renderLog()}},3000)}
});
$("project").addEventListener("change",()=>{
  const v=$("project").value.trim();api.setProject(v);
  const run=running();if(run&&run.project!==v)safe(()=>store.update(run.id,{project:v}));
});
document.addEventListener("keydown",e=>{
  if(e.target.closest("input,select,textarea,button")&&e.code==="Space")return;
  if(e.target.closest("input,select,textarea")||e.metaKey||e.ctrlKey||e.altKey)return;
  const n=parseInt(e.key,10),act=active();
  if(n>=1&&n<=9&&act[n-1]){e.preventDefault();toggle(act[n-1].id)}
  else if(e.code==="Space"&&settings.auto&&override){e.preventDefault();api.setOverride(null)}
  else if(e.code==="KeyP"){e.preventDefault();pauseState?api.resume():api.startPause(null)}
  else if(e.code==="Space"&&running()){e.preventDefault();stop()}
});
$("mDate").value=new Date(Date.now()-new Date().getTimezoneOffset()*6e4).toISOString().slice(0,10);
$("mform").addEventListener("submit",e=>{
  e.preventDefault();
  const m=$("mDur").value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if(!m||+m[2]>59){toast("Длительность пишется как ч:мм, например 1:30");return}
  const ms=(+m[1]*60+ +m[2])*6e4;if(!ms){toast("Длительность должна быть больше нуля");return}
  const [Y,M,D]=$("mDate").value.split("-").map(Number),[h,mi]=$("mStart").value.split(":").map(Number);
  const start=new Date(Y,M-1,D,h,mi).getTime();
  safe(async()=>{await store.add({cat:$("mCat").value,start,end:start+ms,project:$("mProj").value.trim()});toast("Сессия добавлена");$("mDur").value=""});
});
let tt;function toast(t){const el=$("toast");el.textContent=t;el.hidden=false;clearTimeout(tt);tt=setTimeout(()=>el.hidden=true,2800)}

/* ---------- приложение ---------- */
let booted=false;
function apply(st){
  sessions=st.sessions||[];stages=(st.stages&&st.stages.length)?st.stages:stages;
  settings=st.settings||settings;override=st.override||null;
  focusState=st.focus||{phase:"idle"};pauseState=st.pause||null;breaks=st.breaks||[];projectAliases=st.projectAliases||{};
  if(document.activeElement!==$("project")&&$("project").value!==(st.project||""))$("project").value=st.project||"";
  $("idleSel").value=String(settings.idleMinutes||5);
  $("miniToggle").checked=settings.mini!==false;$("hotkeyToggle").checked=settings.hotkeys!==false;
  render();
}
$("autoToggle").addEventListener("change",e=>{settings.auto=e.target.checked;renderStatus();api.setSettings({auto:e.target.checked})});
let accessHidden=false;
$("accessBtn").addEventListener("click",()=>api.requestAccess(live.needsAccess));
$("accessHide").addEventListener("click",()=>{accessHidden=true;renderStatus()});
$("overrideReset").addEventListener("click",()=>api.setOverride(null));
$("loginToggle").addEventListener("change",e=>api.setSettings({openAtLogin:e.target.checked}));
$("idleSel").addEventListener("change",e=>api.setSettings({idleMinutes:+e.target.value}));
$("miniToggle").addEventListener("change",e=>api.setSettings({mini:e.target.checked}));
$("hotkeyToggle").addEventListener("change",async e=>{await api.setSettings({hotkeys:e.target.checked});const r=await api.getState();showHotkeyWarn(r)});
function showHotkeyWarn(r){const f=r.hotkeyFailed||[];$("hotkeyWarn").hidden=!(settings.hotkeys!==false&&f.length);$("hotkeyWarnRow").hidden=$("hotkeyWarn").hidden;$("hotkeyWarn").textContent=f.length?`Не удалось занять клавиши с цифрами ${f.join(", ")}: их уже использует другая программа.`:""}
$("revealBtn").addEventListener("click",()=>api.revealData());
$("exportBtn").addEventListener("click",async()=>{const r=await api.exportCSV();if(r&&r.ok)toast(`Сохранено ${r.count} ${plural(r.count,"сессия","сессии","сессий")}`)});

period=lsGet(LSP,"week");tab=lsGet(LST,"timer");if(!VIEWS[tab])tab="timer";
document.querySelectorAll("#period button").forEach(x=>x.setAttribute("aria-pressed",x.dataset.p===period));
api.getState().then(async r=>{
  platform=r.platform;live=r.live||{};catalog=r.catalog||[];
  try{appTable=await api.appTable()}catch{appTable=[]}
  $("aboutVer").textContent=`Версия ${r.appVersion||""} · трекер времени для креативщиков`;
  document.body.classList.add(platform==="darwin"?"mac":platform==="win32"?"win":"other");
  if(r.vibrancy)document.body.classList.add("vib");
  $("trayWord").textContent=platform==="darwin"?"строке меню":"трее (возле часов)";
  $("loginToggle").checked=!!r.openAtLogin;
  $("hotkeyLabel").textContent=r.hotkeyLabel||"";
  booted=true;apply(r.state);showHotkeyWarn(r);
});
api.onState(st=>{if(booted)apply(st)});
let lastLiveKey="";
api.onLive(l=>{
  live=l||{};if(!booted)return;
  const k=[live.sessionId,live.tracking,live.idle,live.inGrace,live.needsAccess,live.resolve].join("|");
  if(k!==lastLiveKey){lastLiveKey=k;render()}else{renderStatus();tick()}
});

/* ---------- направления ---------- */
let obSel=null;
function renderOnboard(){
  const need=booted&&!(settings.professions&&settings.professions.length);
  $("onboard").hidden=!need;
  if(!need)return;
  if(obSel===null)obSel=sessions.length?["video"]:[];
  $("obGrid").innerHTML=catalog.map(p=>{
    const on=obSel.includes(p.id);
    return `<button type="button" class="obcard" data-prof="${p.id}" aria-pressed="${on}" style="--c:${PROF_COLOR[p.id]}">
      <span class="obhead"><span class="obico">${PROF_ICON[p.id]||""}</span><span><span class="obname">${esc(p.name)}</span><br><span class="obdesc">${esc(p.desc)}</span></span>
      <span class="obcheck"><svg viewBox="0 0 12 12"><path d="M2.5 6.2l2.3 2.3 4.7-4.9"/></svg></span></span>
      <span class="obapps">${esc(appsLine(p.apps,5))}</span>
      <span class="obstages">${p.stages.filter(x=>x.id!=="revisions").map(x=>`<span>${esc(x.name)}</span>`).join("")}</span>
    </button>`}).join("");
  $("obGo").disabled=!obSel.length;
  $("obNote").textContent=sessions.length?"Твои этапы и статистика сохранятся — добавятся только новые этапы.":obSel.length>1?"Этапы направлений объединятся в один список.":"Можно выбрать несколько.";
}
$("obGrid").addEventListener("click",e=>{const b=e.target.closest("[data-prof]");if(!b)return;const id=b.dataset.prof;obSel=obSel.includes(id)?obSel.filter(x=>x!==id):[...obSel,id];renderOnboard()});
$("obGo").addEventListener("click",async()=>{if(!obSel.length)return;await api.setProfessions(obSel);tab="timer";lsSet(LST,tab);toast("Готово — трекер настроен под твою работу")});
function renderProfSettings(){
  if(!catalog.length)return;
  if($("profList").contains(document.activeElement)&&document.activeElement.tagName==="SELECT")return;
  $("profList").innerHTML=fullCatalog().map(p=>{const on=myProfs().includes(p.id)&&!!(settings.professions&&settings.professions.length);
    const sub=p.custom?`Своё · ${p.stages.map(s=>s.name).join(", ")}`:appsLine(p.apps,6);
    return `<div class="row prow" style="--c:${profColor(p.id)}"><span class="pdot"></span><span class="rl">${esc(p.name)}<small class="prow-apps">${esc(sub)}</small></span>
    <span class="bbtns">${p.custom?`<button type="button" class="ghost" data-delprof="${esc(p.id)}">Удалить</button>`:""}
    <label class="switch" for="prof-${p.id}"><input type="checkbox" id="prof-${p.id}" data-prof="${p.id}" role="switch" ${on?"checked":""}><span class="knob" aria-hidden="true"></span></label></span></div>`}).join("");
  renderAppSettings();
}
/* ---------- программы ---------- */
let appTable=[],runningList=null;
function stageSelect(cur,attrs,withDefault){
  const list=active().slice();if(cur&&!list.some(s=>s.id===cur)){const s=stages.find(x=>x.id===cur);if(s)list.push(s)}
  return `<select ${attrs}>${withDefault?`<option value="">${esc(withDefault)}</option>`:""}${list.map(s=>`<option value="${esc(s.id)}" ${s.id===cur?"selected":""}>${esc(s.name)}</option>`).join("")}</select>`;
}
function renderAppSettings(){
  const box=$("appList");if(box.contains(document.activeElement)&&document.activeElement.tagName==="SELECT")return;
  const ov=settings.stageOverrides||{},own=settings.customApps||[],profs=myProfs();
  const builtIn=appTable.filter(a=>a.for.some(f=>profs.includes(f)));
  const defStage=a=>{for(const p of profs)if(a.stage[p])return a.stage[p];return Object.values(a.stage)[0]};
  const nameOf=id=>(stages.find(s=>s.id===id)||{name:"—"}).name;
  let html=own.map(a=>`<div class="arow"><span class="an">${esc(a.label)}<small>своя программа</small></span>${stageSelect(a.stage,`data-ownapp="${esc(a.id)}" aria-label="Этап для ${esc(a.label)}"`)}<button type="button" class="x" data-delapp="${esc(a.id)}" aria-label="Убрать ${esc(a.label)}" title="Убрать">×</button></div>`).join("");
  if(builtIn.length)html+=`<details class="builtin" ${own.length?"":"open"}><summary>Встроенные программы выбранных направлений · ${builtIn.length}</summary>${builtIn.map(a=>{const o=ov[a.label];
    return `<div class="arow"><span class="an">${esc(a.label)}<small>${o?"этап изменён":"по умолчанию: "+esc(nameOf(defStage(a)))}</small></span>${stageSelect(o||"",`class="${o?"changed":""}" data-ovr="${esc(a.label)}" aria-label="Этап для ${esc(a.label)}"`,"По умолчанию")}<span></span></div>`}).join("")}</details>`;
  const wasOpen=box.querySelector("details.builtin")?.open;
  box.innerHTML=html||`<div class="row"><span class="rl"><small>Пока нет программ. Добавь свою ниже.</small></span></div>`;
  if(wasOpen!==undefined){const d=box.querySelector("details.builtin");if(d)d.open=wasOpen}
  $("naStage").innerHTML=active().map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join("");
}
async function loadRunning(){
  $("runningApps").innerHTML=`<span class="pmeta">загружаю…</span>`;
  try{runningList=await api.runningApps()}catch{runningList=[]}
  const have=new Set(trackedApps().map(x=>x.toLowerCase()));
  $("runningApps").innerHTML=runningList.length?runningList.map(n=>`<button type="button" data-pick="${esc(n)}" class="${have.has(n.toLowerCase())?"added":""}" title="${have.has(n.toLowerCase())?"Уже отслеживается":"Выбрать"}">${esc(n)}</button>`).join(""):`<span class="pmeta">не удалось получить список — впиши название вручную</span>`;
}
$("newApp").addEventListener("toggle",()=>{if($("newApp").open)loadRunning()});
$("refreshApps").addEventListener("click",loadRunning);
$("runningApps").addEventListener("click",e=>{const b=e.target.closest("[data-pick]");if(!b)return;$("naName").value=b.dataset.pick;$("naStage").focus()});
$("newAppForm").addEventListener("submit",async e=>{
  e.preventDefault();const name=$("naName").value.trim(),st=$("naStage").value;
  if(!name){toast("Впиши или выбери программу");return}
  const r=await api.addCustomApp(name,st);
  if(r&&r.ok){toast(`«${name}» отслеживается — время пойдёт в «${stageOf(st).name}»`);$("naName").value="";loadRunning()}else toast("Не получилось добавить программу");
});
$("appList").addEventListener("change",e=>{
  const o=e.target.closest("[data-ovr]");if(o){api.setStageOverride(o.dataset.ovr,o.value||null);toast(o.value?`${o.dataset.ovr} → «${stageOf(o.value).name}»`:`${o.dataset.ovr}: этап по умолчанию`);return}
  const a=e.target.closest("[data-ownapp]");if(a){const list=(settings.customApps||[]).map(x=>x.id===a.dataset.ownapp?{...x}:x);const it=list.find(x=>x.id===a.dataset.ownapp);if(it){api.addCustomApp(it.label,a.value)}}
});
$("appList").addEventListener("click",e=>{const d=e.target.closest("[data-delapp]");if(d){api.removeCustomApp(d.dataset.delapp);toast("Программа больше не отслеживается")}});
$("newProfForm").addEventListener("submit",async e=>{
  e.preventDefault();const name=$("npName").value.trim(),st=$("npStages").value.split(/[,\n;]/).map(x=>x.trim()).filter(Boolean);
  if(!name||!st.length){toast("Нужно название и хотя бы один этап");return}
  const r=await api.addCustomProfession(name,st);
  if(r&&r.ok){toast(`Направление «${name}» создано и включено`);$("npName").value="";$("npStages").value="";$("newProf").open=false}
});
$("profList").addEventListener("click",e=>{
  const d=e.target.closest("[data-delprof]");if(!d)return;
  if(d.dataset.armed){api.removeCustomProfession(d.dataset.delprof);toast("Направление удалено — его этапы и статистика остались")}
  else{d.dataset.armed="1";d.textContent="Точно удалить?";d.classList.add("armed");setTimeout(()=>{if(d.isConnected){delete d.dataset.armed;d.textContent="Удалить";d.classList.remove("armed")}},3000)}
});
$("profList").addEventListener("change",e=>{
  const i=e.target.closest("[data-prof]");if(!i)return;const id=i.dataset.prof;const cur=myProfs();
  let next=i.checked?[...cur.filter(x=>x!==id),id]:cur.filter(x=>x!==id);
  if(!next.length){i.checked=true;toast("Нужно оставить хотя бы одно направление");return}
  api.setProfessions(next);if(i.checked)toast("Этапы направления добавлены");
});

if(api.onNav)api.onNav(t=>{if(VIEWS[t]){tab=t;renderTabs();$("content").scrollTop=$("content").scrollHeight}});
