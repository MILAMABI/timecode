/*!
 * Playhead
 * © 2026 MILAMABI. Все права защищены. Проприетарное ПО — см. LICENSE.
 * Копирование, изменение и распространение без разрешения автора запрещены.
 */
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
  const auto = s.source === "auto";
  const end = auto && live.inGrace ? live.last || Date.now() : Date.now();
  const away = auto && s.id === live.sessionId ? live.away || 0 : s.away || 0;
  return Math.max(0, end - s.start - away);
}
function hms(ms) {
  const t = Math.floor(ms / 1000), p = (n) => String(n).padStart(2, "0");
  return `${Math.floor(t / 3600)}:${p(Math.floor((t % 3600) / 60))}:${p(t % 60)}`;
}

const clock = (t) => new Date(t).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
function renderTop() {
  if (!state) return;
  const run = running(), auto = state.settings.auto, p = state.pause;
  const w = $("w");
  for (const c of ["paused", "on", "off"]) w.classList.toggle(c, c === (p ? "paused" : run && !live.inGrace ? "on" : "off"));
  $("orb").title = `${p ? (p.endsAt ? "Перерыв · " + hms(Math.max(0, p.endsAt - Date.now())) : "Пауза") : run ? hms(elapsed(run)) + " · " + stageOf(run.cat).name : "Таймер стоит"} — нажми, чтобы развернуть`;
  $("tc").textContent = p ? hms(p.endsAt ? Math.max(0, p.endsAt - Date.now()) : Date.now() - p.start) : hms(run ? elapsed(run) : 0);
  $("pauseMini").innerHTML = p ? '<svg viewBox="0 0 10 10"><path d="M2 1v8l7-4z"/></svg>' : '<svg viewBox="0 0 10 10"><rect x="1.5" y="1" width="2.6" height="8" rx=".6"/><rect x="5.9" y="1" width="2.6" height="8" rx=".6"/></svg>';
  $("pauseMini").title = p ? "Вернуться к работе" : "Пауза";
  let what;
  if (p) what = p.endsAt ? `Перерыв до ${clock(p.endsAt)}` : "Пауза";
  else if (run) what = `${stageOf(run.cat).name}${run.project ? " · " + run.project : ""}${live.inGrace ? " · отвлёкся" : ""}`;
  else if (auto) what = live.idle ? "Пауза — тебя нет" : "Ждёт рабочую программу";
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
$("collapseMini").addEventListener("click", () => collapse());

// Подгоняем высоту окна под содержимое.
let lastH = 0;
new ResizeObserver(() => {
  if (view.collapsed || morphing) return;
  const h = Math.ceil($("w").getBoundingClientRect().height) + 16;
  if (h !== lastH) { lastH = h; api.miniResize(h); }
}).observe($("w"));

/* ---------- сворачивание в точку ---------- */
let view = { collapsed: false, anchor: "right" }, morphing = false;
const ORB_PX = 40;
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
// Плавный ease-in-out без перелёта: медленный старт, ускорение в середине, мягкая остановка.
const EASE = "cubic-bezier(.65,0,.35,1)";
const T_COLLAPSE = 560, T_EXPAND = 600;
const SHADOW_BIG = "inset 0 1px 0 rgba(255,255,255,.18), 0 3px 5px rgba(0,0,0,.3)";
const SHADOW_ORB = "inset 0 1px 0 rgba(255,255,255,.2), 0 1px 3px rgba(0,0,0,.3)";

function applyAnchor() { document.body.classList.toggle("right", view.anchor === "right"); }

async function collapse() {
  if (view.collapsed || morphing) return;
  morphing = true;
  const w = $("w");
  const from = w.getBoundingClientRect();
  view = { ...view, anchor: (await api.miniView()).anchor }; // к какому краю прижиматься
  applyAnchor();
  w.style.width = from.width + "px"; w.style.height = from.height + "px";
  // содержимое растворяется одновременно с началом сжатия — без паузы между шагами
  w.classList.add("fading", "morphing");
  if (!reduced()) {
    const core = w.querySelector(".core");
    core.animate([{ opacity: 0, transform: "scale(.4)" }, { opacity: 0, transform: "scale(.4)", offset: .45 }, { opacity: 1, transform: "scale(1)" }],
      { duration: T_COLLAPSE, easing: EASE });
    await w.animate(
      [{ width: from.width + "px", height: from.height + "px", borderRadius: "24px", boxShadow: SHADOW_BIG },
       { width: ORB_PX + "px", height: ORB_PX + "px", borderRadius: ORB_PX / 2 + "px", boxShadow: SHADOW_ORB }],
      { duration: T_COLLAPSE, easing: EASE, fill: "forwards" }
    ).finished;
  }
  w.querySelectorAll(".core").forEach((c) => c.getAnimations().forEach((a) => a.cancel()));
  w.getAnimations().forEach((a) => a.cancel());
  w.style.width = ""; w.style.height = "";
  w.classList.add("collapsed");
  w.classList.remove("morphing", "fading");
  view = await api.miniCollapse(true);
  applyAnchor();
  morphing = false;
}

async function expand() {
  if (!view.collapsed || morphing) return;
  morphing = true;
  const w = $("w");
  view = await api.miniCollapse(false); // окно становится большим, кружок остаётся на месте
  applyAnchor();
  // меряем итоговый размер, не показывая его
  w.classList.remove("collapsed");
  w.style.visibility = "hidden"; w.style.width = ""; w.style.height = "";
  const to = w.getBoundingClientRect();
  w.style.visibility = "";
  w.classList.add("morphing", "fading");
  w.style.width = ORB_PX + "px"; w.style.height = ORB_PX + "px";
  if (!reduced()) {
    const core = w.querySelector(".core");
    core.animate([{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(.4)", offset: .4 }, { opacity: 0, transform: "scale(.4)" }],
      { duration: T_EXPAND, easing: EASE, fill: "forwards" });
    const grow = w.animate(
      [{ width: ORB_PX + "px", height: ORB_PX + "px", borderRadius: ORB_PX / 2 + "px", boxShadow: SHADOW_ORB },
       { width: to.width + "px", height: to.height + "px", borderRadius: "24px", boxShadow: SHADOW_BIG }],
      { duration: T_EXPAND, easing: EASE, fill: "forwards" }
    );
    // содержимое начинает проявляться на последней трети раскрытия
    setTimeout(() => w.classList.remove("fading"), T_EXPAND * 0.62);
    await grow.finished;
  }
  w.querySelectorAll(".core").forEach((c) => c.getAnimations().forEach((a) => a.cancel()));
  w.getAnimations().forEach((a) => a.cancel());
  w.style.width = ""; w.style.height = "";
  w.classList.remove("morphing", "fading");
  morphing = false;
  lastH = 0; // пусть окно подстроит высоту под содержимое
}

// Кружок: клик — развернуть, потянуть — переместить.
(() => {
  const orb = $("orb");
  let down = null, moved = false;
  orb.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    down = { x: e.screenX, y: e.screenY }; moved = false;
    orb.setPointerCapture(e.pointerId);
  });
  orb.addEventListener("pointermove", (e) => {
    if (!down) return;
    const dx = e.screenX - down.x, dy = e.screenY - down.y;
    if (!moved && Math.hypot(dx, dy) < 4) return;
    moved = true;
    api.miniMoveBy(dx, dy);
    down = { x: e.screenX, y: e.screenY };
  });
  orb.addEventListener("pointerup", () => { if (down && !moved) expand(); down = null; });
  orb.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); expand(); } });
})();
if (api.onMiniToggle) api.onMiniToggle(() => (view.collapsed ? expand() : collapse()));

api.getState().then(async (r) => {
  state = r.state; live = r.live || {};
  view = await api.miniView();
  applyAnchor();
  if (view.collapsed) $("w").classList.add("collapsed");
  render();
});
api.onState((s) => { state = s; render(); });
let lastKey = "";
api.onLive((l) => {
  live = l || {};
  const k = [live.sessionId, live.tracking, live.idle, live.inGrace, live.paused].join("|");
  if (k !== lastKey) { lastKey = k; render(); } else renderTop();
});
setInterval(renderTop, 500);
