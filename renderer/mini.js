// Мини-виджет: таймкод, текущий этап, быстрые кнопки этапов.
let state = null, live = {};
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const active = () => (state ? state.stages.filter((s) => !s.archived) : []);
const stageOf = (id) => (state && state.stages.find((s) => s.id === id)) || { name: "—", color: null };
const cvar = (s) => (s.color ? `var(--${s.color})` : "var(--muted)");

function running() {
  if (!state) return null;
  return state.sessions.find((s) => s.end == null && (s.source !== "auto" || s.id === live.sessionId)) || null;
}
function elapsed(s) {
  const end = s.source === "auto" && live.inGrace ? live.last || Date.now() : Date.now();
  return Math.max(0, end - s.start);
}
function hms(ms) {
  const t = Math.floor(ms / 1000), p = (n) => String(n).padStart(2, "0");
  return `${Math.floor(t / 3600)}:${p(Math.floor((t % 3600) / 60))}:${p(t % 60)}`;
}

function renderTop() {
  if (!state) return;
  const run = running(), auto = state.settings.auto;
  $("w").className = "w " + (run ? "on" : "off");
  $("tc").textContent = hms(run ? elapsed(run) : 0);
  let what;
  if (run) what = `${stageOf(run.cat).name}${run.project ? " · " + run.project : ""}${live.inGrace ? " · отвлёкся" : ""}`;
  else if (auto) what = live.idle ? "Пауза — тебя нет" : "Ждёт Premiere / Resolve";
  else what = "Таймер стоит";
  $("what").textContent = what;
  $("what").title = what;
}

function renderChips() {
  if (!state) return;
  const run = running(), auto = state.settings.auto, ovr = state.override;
  let html = "";
  if (auto) html += `<button class="chip auto ${!ovr ? "cur" : ""}" data-act="auto" title="Этап определяется сам"><i></i>Авто<kbd>0</kbd></button>`;
  active().forEach((s, i) => {
    const cur = run && run.cat === s.id;
    const isOvr = auto && ovr === s.id;
    html += `<button class="chip ${cur ? "cur" : ""} ${isOvr ? "ovr" : ""}" style="--c:${cvar(s)}" data-cat="${esc(s.id)}" title="${auto ? "Писать время сюда" : cur ? "Остановить" : "Запустить"}"><i></i>${esc(s.name)}${i < 9 ? `<kbd>${i + 1}</kbd>` : ""}</button>`;
  });
  if (!auto && run) html += `<button class="chip stop" data-act="stop"><i></i>Стоп<kbd>0</kbd></button>`;
  $("chips").innerHTML = html;
}

function render() { renderTop(); renderChips(); }

$("chips").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b || !state) return;
  if (b.dataset.cat) api.toggleTimer(b.dataset.cat, state.project || "");
  else if (b.dataset.act === "auto") api.setOverride(null);
  else if (b.dataset.act === "stop") api.stopTimer();
});
$("openMain").addEventListener("click", () => api.openMain());
$("hideMini").addEventListener("click", () => api.hideMini());

// Подгоняем высоту окна под содержимое.
let lastH = 0;
new ResizeObserver(() => {
  const h = Math.ceil($("w").getBoundingClientRect().height) + 12;
  if (h !== lastH) { lastH = h; api.miniResize(h); }
}).observe($("w"));

api.getState().then((r) => { state = r.state; live = r.live || {}; render(); });
api.onState((s) => { state = s; render(); });
let lastKey = "";
api.onLive((l) => {
  live = l || {};
  const k = [live.sessionId, live.tracking, live.idle, live.inGrace].join("|");
  if (k !== lastKey) { lastKey = k; render(); } else renderTop();
});
setInterval(renderTop, 500);
