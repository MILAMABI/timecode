// Чистая логика автотрекинга: без Electron, чтобы её можно было тестировать.

const DEFAULT_STAGES = [
  { id: "edit", name: "Монтаж", color: "c1" },
  { id: "color", name: "Цветкор", color: "c2" },
  { id: "sound", name: "Саунд-дизайн", color: "c3" },
  { id: "vfx", name: "VFX", color: "c4" },
  { id: "render", name: "Рендер", color: "c8" },
  { id: "revisions", name: "Правки клиента", color: "c5" },
];

// Программа → этап. Ищем подстроку в имени процесса (без учёта регистра).
// stage: null значит «этап берётся из страницы Resolve».
const APPS = [
  { needles: ["premiere"], label: "Premiere", stage: "edit" },
  { needles: ["resolve"], label: "Resolve", stage: null },
  { needles: ["after effects", "afterfx"], label: "After Effects", stage: "vfx" },
  { needles: ["audition"], label: "Audition", stage: "sound" },
];

const RESOLVE_PAGES = {
  media: "edit", cut: "edit", edit: "edit",
  color: "color", fairlight: "sound", fusion: "vfx", deliver: "render",
};

function premiereProject(title) {
  const m = /([^/\\]+?)\.prproj/i.exec(title || "");
  return m ? m[1].trim() : "";
}

function matchApp(appName) {
  const low = String(appName || "").toLowerCase();
  return APPS.find((a) => a.needles.some((n) => low.includes(n))) || null;
}

/**
 * Что сейчас делаем: {stage, project, app} или null, если это не рабочая программа.
 * resolveInfo: {page, project} от помощника Resolve или null.
 * override: этап, выбранный вручную (перекрывает автоматический).
 * memory: объект, где помним последний известный проект для каждой программы.
 */
function classify({ appName, title, resolveInfo, override, memory }) {
  const app = matchApp(appName);
  if (!app) return null;
  let stage = app.stage;
  let project = "";
  if (app.label === "Premiere") project = premiereProject(title);
  if (app.label === "Resolve") {
    if (resolveInfo && resolveInfo.page) stage = RESOLVE_PAGES[resolveInfo.page.toLowerCase()] || "edit";
    project = (resolveInfo && resolveInfo.project) || "";
  }
  if (!stage) stage = "edit";
  if (project) memory[app.label] = project;
  else project = memory[app.label] || "";
  return { stage: override || stage, project, app: app.label };
}

/**
 * Превращает поток замеров в сессии.
 * hooks.open(cur) — началась сессия; hooks.close(cur) — закончилась (cur.end выставлен).
 * Короткие сессии (< minSession) при закрытии отдаются в hooks.discard(cur).
 */
class Engine {
  constructor(hooks, opts = {}) {
    this.hooks = hooks;
    this.grace = opts.grace ?? 60_000;
    this.minSession = opts.minSession ?? 30_000;
    this.cur = null;
  }

  sameKey(key) {
    const c = this.cur;
    return c && c.stage === key.stage && c.project === key.project && c.app === key.app;
  }

  /** now — мс; key — результат classify или null; idleMs — сколько не трогали мышь/клавиатуру; idleLimit — порог. */
  step(now, key, idleMs = 0, idleLimit = Infinity) {
    if (idleMs >= idleLimit) {
      if (this.cur) this.cur.last = Math.min(this.cur.last, now - idleMs);
      key = null;
    }
    const c = this.cur;
    if (!key) {
      if (c && now - c.last > this.grace) this.close();
      return;
    }
    if (c && this.sameKey(key) && now - c.last <= this.grace) {
      c.last = now;
      return;
    }
    if (c) this.close();
    this.cur = { ...key, start: now, last: now };
    this.hooks.open && this.hooks.open(this.cur);
  }

  close() {
    const c = this.cur;
    this.cur = null;
    if (!c) return;
    c.end = c.last;
    if (c.last - c.start >= this.minSession) this.hooks.close && this.hooks.close(c);
    else this.hooks.discard && this.hooks.discard(c);
  }
}

function toCSV(sessions, stages) {
  const name = (id) => (stages.find((s) => s.id === id) || {}).name || id;
  const q = (v) => {
    const s = String(v ?? "");
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const pad = (n) => String(n).padStart(2, "0");
  const local = (t) => {
    const d = new Date(t);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const rows = [["id", "start_ms", "end_ms", "stage", "stage_name", "project", "app", "start_local", "minutes"]];
  sessions
    .filter((s) => s.end != null)
    .sort((a, b) => a.start - b.start)
    .forEach((s) => {
      const id = String(s.id).startsWith("auto-") ? s.id : `auto-${s.start}`;
      rows.push([id, s.start, s.end, s.cat, name(s.cat), s.project || "", s.app || "", local(s.start), ((s.end - s.start) / 60000).toFixed(1)]);
    });
  return "﻿" + rows.map((r) => r.map(q).join(",")).join("\r\n") + "\r\n";
}

module.exports = { DEFAULT_STAGES, APPS, RESOLVE_PAGES, premiereProject, matchApp, classify, Engine, toCSV };
