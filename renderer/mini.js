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

const clock = (t) => new Date(t).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
function renderTop() {
  if (!state) return;
  const run = running(), auto = state.settings.auto, p = state.pause;
  $("w").className = "w " + (p ? "paused" : run ? "on" : "off");
  $("tc").textContent = p ? hms(p.endsAt ? Math.max(0, p.endsAt - Date.now()) : Date.now() - p.start) : hms(run ? elapsed(run) : 0);
  $("pauseMini").innerHTML = p ? '<svg viewBox="0 0 10 10"><path d="M2 1v8l7-4z"/></svg>' : '<svg viewBox="0 0 10 10"><rect x="1.5" y="1" width="2.6" height="8" rx=".6"/><rect x="5.9" y="1" width="2.6" height="8" rx=".6"/></svg>';
  $("pauseMini").title = p ? "Вернуться к работе" : "Пауза";
  let what;
  if (p) what = p.endsAt ? `Перерыв до ${clock(p.endsAt)}` : "Пауза";
  else if (run) what = `${stageOf(run.cat).name}${run.project ? " · " + run.project : ""}${live.inGrace ? " · отвлёкся" : ""}`;
  else if (auto) what = live.idle ? "Пауза — тебя нет" : "Ждёт Premiere / Resolve";
  else what = "Таймер стоит";
  $("what").textContent = what;
  $("what").title = what;
}

function renderChips() {
  if (!state) return;
  const run = running(), auto = state.settings.auto, ovr = state.override;
  let html = "";
  if (state.pause) {
    html = `<button class="chip resume cur" data-act="resume"><i></i>Вернуться к работе</button>` +
      (state.pause.endsAt ? `<button class="chip" data-act="extend" style="--c:var(--c2)"><i></i>+5 мин</button>` : [5, 10, 15].map((m) => `<button class="chip" data-act="break" data-min="${m}" style="--c:var(--c2)"><i></i>Перерыв ${m} мин</button>`).join(""));
    $("chips").innerHTML = html;
    return;
  }
  if (state.focus && state.focus.phase === "done") html += `<button class="chip cur" data-act="break" data-min="${state.settings.breakMinutes || 10}" style="--c:var(--c2)"><i></i>Блок готов — перерыв ${state.settings.breakMinutes || 10} мин</button>`;
  if (auto) html += `<button class="chip auto ${!ovr ? "cur" : ""}" data-act="auto" title="Этап определяется сам"><i></i>Авто</button>`;
  active().forEach((s, i) => {
    const cur = run && run.cat === s.id;
    const isOvr = auto && ovr === s.id;
    html += `<button class="chip ${cur ? "cur" : ""} ${isOvr ? "ovr" : ""}" style="--c:${cvar(s)}" data-cat="${esc(s.id)}" title="${auto ? "Писать время сюда" : cur ? "Остановить" : "Запустить"}${i < 9 ? " · клавиша " + (i + 1) : ""}"><i></i>${esc(s.name)}</button>`;
  });
  if (!auto && run) html += `<button class="chip stop" data-act="stop"><i></i>Стоп</button>`;
  $("chips").innerHTML = html;
}

function render() { renderTop(); renderChips(); }

$("chips").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b || !state) return;
  if (b.dataset.cat) api.toggleTimer(b.dataset.cat, state.project || "");
  else if (b.dataset.act === "auto") api.setOverride(null);
  else if (b.dataset.act === "stop") api.stopTimer();
  else if (b.dataset.act === "resume") api.resume();
  else if (b.dataset.act === "extend") api.extendPause(5);
  else if (b.dataset.act === "break") api.startPause(+b.dataset.min);
});
$("pauseMini").addEventListener("click", () => (state && state.pause ? api.resume() : api.startPause(null)));
$("openMain").addEventListener("click", () => api.openMain());
$("hideMini").addEventListener("click", () => api.hideMini());

// Подгоняем высоту окна под содержимое.
let lastH = 0;
new ResizeObserver(() => {
  const h = Math.ceil($("w").getBoundingClientRect().height) + 16;
  if (h !== lastH) { lastH = h; api.miniResize(h); }
}).observe($("w"));

api.getState().then((r) => { state = r.state; live = r.live || {}; render(); });
api.onState((s) => { state = s; render(); });
let lastKey = "";
api.onLive((l) => {
  live = l || {};
  const k = [live.sessionId, live.tracking, live.idle, live.inGrace, live.paused].join("|");
  if (k !== lastKey) { lastKey = k; render(); } else renderTop();
});
setInterval(renderTop, 500);
