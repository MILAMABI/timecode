
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
let tab="timer", projFilter=null;
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
const dur=s=>Math.max(0,endOf(s)-s.start);
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
    return `<button class="clip" style="--c:${cvar(c)}" data-cat="${c.id}" aria-pressed="${!!on}">
      ${i<9?`<kbd>${i+1}</kbd>`:""}${ovr?`<span class="ovr">вручную</span>`:""}<span class="name">${esc(c.name)}</span>
      <span class="meta num">${on?"идёт · ":""}сегодня ${fmtHM(t)}</span></button>`;
  }).join("");
}
const APPS_TEXT="Premiere, Resolve, After Effects или Audition";
function renderStatus(){
  const run=running();
  $("transport").className="transport "+(run?"running":"idle");
  let text;
  if(run)text=`${stageOf(run.cat).name}${run.project?" · "+run.project:""}${run.app?" ("+run.app+")":""}${live.inGrace?" · отвлёкся":""}`;
  else if(settings.auto)text=live.idle?"Пауза: тебя нет за компом":"Ждёт "+APPS_TEXT.replace(" или "," / ");
  else text="Таймер стоит";
  $("statusText").textContent=text;
  $("autoToggle").checked=!!settings.auto;
  $("autoInfo").textContent=settings.auto?"Пишет время, пока открыт Premiere, Resolve, After Effects или Audition":"Запускай таймер кнопками этапов";
  $("hint").textContent=settings.auto
    ?"Этап определяется сам. Нажми другой, если в Premiere занялся цветом или звуком."
    :"Нажми этап, чтобы запустить. Тот же этап — стоп.";
  $("accessBanner").hidden=!(settings.auto&&live.needsAccess);
  const ob=settings.auto&&override;
  $("overrideBanner").hidden=!ob;
  if(ob)$("overrideText").textContent=`Этап выбран вручную: «${stageOf(override).name}». Сбросится сам после 30 минут без работы.`;
  const rs={no_python:"Страницы DaVinci Resolve не определяются: на компьютере не найден Python 3. Время в Resolve пишется как «Монтаж».",
    no_api:"Страницы DaVinci Resolve не определяются: не найден скриптовый модуль Resolve. Время в Resolve пишется как «Монтаж».",
    no_connect:"Resolve не отвечает скриптам. Включи Preferences → System → General → External scripting using: Local. В бесплатной версии это может не работать.",
    ok:"DaVinci Resolve подключён: этап определяется по открытой странице."}[live.resolve];
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
  $("totalSub").textContent=list.length?`${list.length} ${plural(list.length,"сессия","сессии","сессий")} · ${days} ${plural(days,"рабочий день","рабочих дня","рабочих дней")}`:"нет сессий за период";
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
    order.forEach(c=>{if(!o[c.id])return;const y0=y(acc),y1=y(acc+o[c.id]);g+=`<rect x="${x}" y="${y1}" width="${w}" height="${Math.max(1,y0-y1)}" fill="${cvar(c)}"><title>${esc(c.name)}: ${fmtHM(o[c.id])}</title></rect>`;acc+=o[c.id]});
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
  const list=sessions.filter(s=>s.start>=periodStart(period));
  const ps=groupProjects(list);
  if(!ps.length){$("plist").innerHTML=`<div class="empty">${sessions.length?"За этот период проектов нет.":"Впиши название проекта перед запуском таймера — и здесь появится разбивка по каждому проекту."}</div>`;return}
  const grand=ps.reduce((a,p)=>a+p.total,0);
  $("plist").innerHTML=ps.map(p=>{
    const shown=shownStages(p.by).filter(c=>p.by[c.id]>0);
    const share=grand?Math.round(p.total/grand*100):0;
    return `<button type="button" class="pcard" data-proj="${esc(p.key)}" aria-pressed="${projFilter===p.key}">
      <div class="phead"><span class="pname ${p.key==="__none"?"none":""}">${esc(p.name)}</span><span class="ptotal num">${fmtHM(p.total)}</span></div>
      <div class="track" aria-hidden="true">${shown.map(c=>`<span style="background:${cvar(c)};width:${p.by[c.id]/p.total*100}%"></span>`).join("")}</div>
      <div class="pstages">${shown.map(c=>`<span style="--c:${cvar(c)}"><i></i>${esc(c.name)} <b class="num">${fmtHM(p.by[c.id])}</b> <em class="num">${Math.round(p.by[c.id]/p.total*100)}%</em></span>`).join("")}</div>
      <div class="pmeta num">${p.live?"идёт сейчас · ":""}${p.sessions.length} ${plural(p.sessions.length,"сессия","сессии","сессий")} · ${p.days} ${plural(p.days,"день","дня","дней")} · ${share}% времени за период · последняя работа: ${esc(dayLabel(startOfDay(p.last)).toLowerCase())}</div>
    </button>`;
  }).join("");
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
function render(){if(!booted)return;renderStatus();renderClips();renderTabs();renderSummary();renderChart();renderProjects();renderLog();renderEditor();renderManualSelect();renderAllTime();renderProjList();tick()}

function tick(){const run=running();$("tc").innerHTML=fmtTC(run?dur(run):0);renderSideNow()}
setInterval(()=>{if(running())tick()},1000/FPS);
setInterval(()=>{if(booted&&running()){renderClips();renderSummary();renderChart();renderProjects();renderAllTime();document.querySelectorAll("[data-live]").forEach(el=>el.textContent=fmtHM(dur(running())))}},5000);

/* ---------- events ---------- */
$("clips").addEventListener("click",e=>{const b=e.target.closest("[data-cat]");if(b)toggle(b.dataset.cat)});
$("period").addEventListener("click",e=>{
  const b=e.target.closest("[data-p]");if(!b)return;period=b.dataset.p;lsSet(LSP,period);
  document.querySelectorAll("#period button").forEach(x=>x.setAttribute("aria-pressed",x===b));render();
});
$("tabs").addEventListener("click",e=>{const b=e.target.closest("[data-t]");if(!b)return;tab=b.dataset.t;lsSet(LST,tab);renderTabs();$("content").scrollTop=0});
$("plist").addEventListener("click",e=>{
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
  if(document.activeElement!==$("project")&&$("project").value!==(st.project||""))$("project").value=st.project||"";
  $("idleSel").value=String(settings.idleMinutes||5);
  $("miniToggle").checked=settings.mini!==false;$("hotkeyToggle").checked=settings.hotkeys!==false;
  render();
}
$("autoToggle").addEventListener("change",e=>{settings.auto=e.target.checked;renderStatus();api.setSettings({auto:e.target.checked})});
$("accessBtn").addEventListener("click",()=>api.requestAccess());
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
api.getState().then(r=>{
  platform=r.platform;live=r.live||{};
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
