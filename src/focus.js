/*!
 * Рабочий таймкод (Timecode)
 * © 2026 MILAMABI. Все права защищены. Проприетарное ПО — см. LICENSE.
 * Копирование, изменение и распространение без разрешения автора запрещены.
 */
// Пауза, перерывы и фокус-блоки. Чистая логика над состоянием: на вход старое состояние, на выход новое.
//   focus: { phase: "idle" | "work" | "done", start, endsAt, minutes, doneAt }
//   pause: null | { start, endsAt | null, minutes | null, resumeCat, resumeProject }
//   breaks: [{ start, end }] — история перерывов для статистики

const MIN = 60_000;
const MAX_BREAKS = 2000;

function startFocus(state, now, minutes) {
  return { ...state, focus: { phase: "work", start: now, endsAt: now + minutes * MIN, minutes } };
}

function stopFocus(state) {
  return { ...state, focus: { phase: "idle" } };
}

/** Начать перерыв. runningManual — запущенный вручную таймер (его надо остановить и потом продолжить). */
function startPause(state, now, minutes, runningManual) {
  if (state.pause) {
    if (!minutes) return state;
    return { ...state, pause: { ...state.pause, endsAt: now + minutes * MIN, minutes } };
  }
  return {
    ...state,
    focus: state.focus && state.focus.phase !== "idle" ? { phase: "idle" } : state.focus,
    pause: {
      start: now,
      endsAt: minutes ? now + minutes * MIN : null,
      minutes: minutes || null,
      resumeCat: runningManual ? runningManual.cat : null,
      resumeProject: runningManual ? runningManual.project || "" : "",
    },
  };
}

function extendPause(state, now, minutes) {
  const p = state.pause;
  if (!p) return state;
  const base = Math.max(now, p.endsAt || now);
  return { ...state, pause: { ...p, endsAt: base + minutes * MIN, minutes: (p.minutes || 0) + minutes } };
}

/** Закончить перерыв: он попадает в историю. Возвращает новое состояние и что продолжить. */
function resume(state, now) {
  const p = state.pause;
  if (!p) return { state, resumeCat: null, resumeProject: "" };
  const breaks = (state.breaks || []).concat(now - p.start >= 30_000 ? [{ start: p.start, end: now }] : []).slice(-MAX_BREAKS);
  return { state: { ...state, pause: null, breaks }, resumeCat: p.resumeCat, resumeProject: p.resumeProject };
}

/** Какие таймеры сработали к моменту now. */
function due(state, now) {
  const ev = [];
  if (state.focus && state.focus.phase === "work" && now >= state.focus.endsAt) ev.push("focusDone");
  if (state.pause && state.pause.endsAt && now >= state.pause.endsAt) ev.push("breakDone");
  return ev;
}

function markFocusDone(state, now) {
  return { ...state, focus: { ...state.focus, phase: "done", doneAt: now } };
}

function breakTotal(breaks, from = 0) {
  return (breaks || []).filter((b) => b.start >= from).reduce((a, b) => a + Math.max(0, b.end - b.start), 0);
}

module.exports = { startFocus, stopFocus, startPause, extendPause, resume, due, markFocusDone, breakTotal, MIN };
