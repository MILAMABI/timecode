/*!
 * Playhead
 * © 2026 MILAMABI. Все права защищены. Проприетарное ПО — см. LICENSE.
 * Копирование, изменение и распространение без разрешения автора запрещены.
 */
// Хранение данных в JSON-файле в папке приложения. Запись атомарная и с задержкой.
const fs = require("fs");
const path = require("path");
const { DEFAULT_STAGES } = require("./engine");

const DEFAULTS = {
  version: 1,
  sessions: [],
  stages: DEFAULT_STAGES.map((s) => ({ ...s })),
  settings: { auto: true, idleMinutes: 5, mini: true, hotkeys: true, focusMinutes: 50, breakMinutes: 10 },
  override: null,
  focus: { phase: "idle" },
  pause: null,
  breaks: [],
  projectAliases: {},
};

class Store {
  constructor(dir, onChange) {
    this.file = path.join(dir, "timecode-data.json");
    this.onChange = onChange || (() => {});
    this.timer = null;
    this.state = this.load();
  }

  load() {
    for (const f of [this.file, this.file + ".bak"]) {
      try {
        const data = JSON.parse(fs.readFileSync(f, "utf8"));
        return {
          ...DEFAULTS,
          ...data,
          settings: { ...DEFAULTS.settings, ...(data.settings || {}) },
          stages: Array.isArray(data.stages) && data.stages.length ? data.stages : DEFAULTS.stages,
          sessions: Array.isArray(data.sessions) ? data.sessions : [],
        };
      } catch {}
    }
    return JSON.parse(JSON.stringify(DEFAULTS));
  }

  // Сохраняем не чаще раза в 400 мс; flush() — сразу (при выходе).
  changed() {
    this.onChange(this.state);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 400);
  }

  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(this.state));
      if (fs.existsSync(this.file)) fs.copyFileSync(this.file, this.file + ".bak");
      fs.renameSync(tmp, this.file);
    } catch (e) {
      console.error("Не удалось сохранить данные:", e);
    }
  }

  get sessions() { return this.state.sessions; }
  find(id) { return this.state.sessions.find((s) => s.id === id); }

  add(data, id) {
    const s = { id: id || Date.now().toString(36) + Math.random().toString(36).slice(2, 8), ...data };
    this.state.sessions.push(s);
    this.changed();
    return s;
  }

  update(id, patch, { silent } = {}) {
    const s = this.find(id);
    if (!s) return null;
    Object.assign(s, patch);
    if (silent) {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.flush(), 400);
    } else this.changed();
    return s;
  }

  remove(id) {
    this.state.sessions = this.state.sessions.filter((s) => s.id !== id);
    this.changed();
  }

  set(key, value) {
    this.state[key] = value;
    this.changed();
  }

  /** После сбоя или выключения: автосессии без конца закрываем по последней отметке. */
  repair() {
    let fixed = false;
    this.state.sessions.forEach((s) => {
      if (s.end == null && s.source === "auto") {
        s.end = Math.max(s.start, s.lastSeen || s.start);
        fixed = true;
      }
    });
    this.state.sessions = this.state.sessions.filter((s) => !(s.source === "auto" && s.end - s.start < 30_000));
    if (fixed) this.flush();
  }
}

module.exports = { Store };
