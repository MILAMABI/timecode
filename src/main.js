/*!
 * Playhead
 * © 2026 MILAMABI. Все права защищены. Проприетарное ПО — см. LICENSE.
 * Копирование, изменение и распространение без разрешения автора запрещены.
 */
const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, powerMonitor, dialog, shell, systemPreferences, globalShortcut, screen, Notification } = require("electron");
const Focus = require("./focus");
const Prof = require("./professions");
const Projects = require("./projects");
const path = require("path");
const fs = require("fs");
const { Engine, classify, toCSV } = require("./engine");
const { Store } = require("./store");
const { FrontWindow, ResolveHelper, resolveHelperPath } = require("./watchers");

const POLL_MS = 2000;
const OVERRIDE_RESET_MS = 30 * 60_000; // ручной этап сбрасывается, если 30 минут не было работы
const isMac = process.platform === "darwin";
const os = require("os");
// Windows 11 (сборка 22000+) умеет системное стекло Mica.
const isWin11 = process.platform === "win32" && Number((os.release().split(".")[2]) || 0) >= 22000;
const hasVibrancy = isMac || isWin11;

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let win = null;
let mini = null;
let tray = null;
let store = null;
let engine = null;
let quitting = false;
const front = new FrontWindow();
let resolveHelper = null;
const memory = {};
let lastWorkAt = Date.now();
let hotkeyResult = { ok: true, failed: [] };
let lastAutoKey = null;
let live = { tracking: false, app: "", stage: null, project: "", last: null, sessionId: null, needsAccess: false, resolve: "idle", idle: false, frontApp: "" };

/* ---------------- переезд со старого названия ---------------- */

// До версии 2.0 приложение называлось Timecode и хранило данные в папке «Timecode».
// Копируем их в папку Playhead один раз, если там ещё пусто.
function migrateFromTimecode() {
  try {
    const dir = app.getPath("userData");
    const file = path.join(dir, "timecode-data.json");
    if (fs.existsSync(file)) return;
    const old = path.join(path.dirname(dir), "Timecode", "timecode-data.json");
    if (!fs.existsSync(old)) return;
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(old, file);
    if (fs.existsSync(old + ".bak")) fs.copyFileSync(old + ".bak", file + ".bak");
    console.log("Данные перенесены из Timecode");
  } catch (e) {
    console.error("Не удалось перенести данные из Timecode:", e);
  }
}

/* ---------------- окно ---------------- */

function createWindow(show = true) {
  win = new BrowserWindow({
    width: 1040,
    height: 760,
    minWidth: 560,
    minHeight: 520,
    show,
    title: "Playhead",
    ...(isMac
      ? { titleBarStyle: "hiddenInset", trafficLightPosition: { x: 18, y: 18 }, vibrancy: "sidebar", visualEffectState: "followWindow", backgroundColor: "#00000000" }
      : isWin11
        ? { backgroundMaterial: "mica", backgroundColor: "#00000000" }
        : { backgroundColor: "#1c1c1e" }),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  win.on("close", (e) => {
    if (!quitting) {
      e.preventDefault();
      win.hide();
      if (isMac && app.dock) app.dock.hide();
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
}

function showWindow() {
  if (!win || win.isDestroyed()) createWindow();
  if (isMac && app.dock) app.dock.show();
  win.show();
  win.focus();
}

function send(channel, payload) {
  for (const w of [win, mini]) if (w && !w.isDestroyed()) w.webContents.send(channel, payload);
}

/* ---------------- мини-виджет ---------------- */

const MINI_W = 380;
const ORB = 56; // окно свёрнутого виджета: кружок 40 px + поля по 8 px
let miniView = { collapsed: false, anchor: "right", expandedH: 96 };

// Положение храним всегда «как у развёрнутого» виджета, чтобы разворачивался он на своём месте.
function onScreen(x, y) {
  return screen.getAllDisplays().some((d) => {
    const b = d.workArea;
    return x >= b.x - 40 && y >= b.y - 40 && x < b.x + b.width - 40 && y < b.y + b.height - 40;
  });
}
function anchorFor(x, w) {
  const d = screen.getDisplayNearestPoint({ x: Math.round(x + w / 2), y: 0 }).workArea;
  return x + w / 2 > d.x + d.width / 2 ? "right" : "left";
}
function clampToScreen(b) {
  const d = screen.getDisplayMatching(b).workArea;
  return {
    ...b,
    x: Math.min(Math.max(b.x, d.x), d.x + d.width - b.width),
    y: Math.min(Math.max(b.y, d.y), d.y + d.height - b.height),
  };
}

function createMini() {
  if (mini && !mini.isDestroyed()) return mini;
  const set = store.state.settings;
  const area = screen.getPrimaryDisplay().workArea;
  let x = area.x + area.width - MINI_W - 24, y = area.y + 24;
  if (set.miniPos && onScreen(set.miniPos.x, set.miniPos.y)) ({ x, y } = set.miniPos);
  miniView = { collapsed: !!set.miniCollapsed, anchor: anchorFor(x, MINI_W), expandedH: set.miniH || 96 };
  const bounds = miniView.collapsed
    ? { x: miniView.anchor === "right" ? x + MINI_W - ORB : x, y, width: ORB, height: ORB }
    : { x, y, width: MINI_W, height: miniView.expandedH };
  mini = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    focusable: false, // клик по виджету не уводит фокус из рабочей программы
    acceptFirstMouse: true,
    hiddenInMissionControl: true,
    title: "Playhead — виджет",
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  // уровень «screen-saver» — выше всех окон, в том числе программ на весь экран
  mini.setAlwaysOnTop(true, "screen-saver");
  if (isMac) mini.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  mini.loadFile(path.join(__dirname, "..", "renderer", "mini.html"));
  mini.once("ready-to-show", () => mini.showInactive());
  let moveTimer = null;
  mini.on("moved", () => {
    clearTimeout(moveTimer);
    moveTimer = setTimeout(saveMiniPos, 400);
  });
  mini.on("closed", () => { mini = null; });
  return mini;
}

function saveMiniPos() {
  if (!mini || mini.isDestroyed()) return;
  const b = mini.getBounds();
  let x = b.x;
  if (miniView.collapsed) {
    miniView.anchor = anchorFor(b.x, ORB);
    if (miniView.anchor === "right") x = b.x + ORB - MINI_W;
  }
  store.set("settings", { ...store.state.settings, miniPos: { x, y: b.y } });
}

/** Свернуть в кружок / развернуть. Кружок остаётся на том же месте экрана. */
function setMiniCollapsed(on) {
  if (!mini || mini.isDestroyed()) return miniView;
  const b = mini.getBounds();
  if (on && !miniView.collapsed) {
    miniView.anchor = anchorFor(b.x, b.width);
    miniView.expandedH = b.height;
    mini.setBounds({ x: miniView.anchor === "right" ? b.x + b.width - ORB : b.x, y: b.y, width: ORB, height: ORB });
    miniView.collapsed = true;
  } else if (!on && miniView.collapsed) {
    miniView.anchor = anchorFor(b.x, ORB);
    const x = miniView.anchor === "right" ? b.x + ORB - MINI_W : b.x;
    mini.setBounds(clampToScreen({ x, y: b.y, width: MINI_W, height: miniView.expandedH }));
    miniView.collapsed = false;
  }
  store.state.settings = { ...store.state.settings, miniCollapsed: miniView.collapsed, miniH: miniView.expandedH };
  store.changed();
  saveMiniPos();
  updateTray();
  return miniView;
}

// Сторож: если виджет включён, а окно пропало или спряталось (смена рабочего стола,
// выход из полноэкранного режима, сон) — возвращаем его на место, не забирая фокус.
function keepMiniAlive() {
  if (!store || !store.state.settings.mini) return;
  if (!mini || mini.isDestroyed()) { createMini(); return; }
  if (!mini.isVisible()) mini.showInactive();
  if (!mini.isAlwaysOnTop()) mini.setAlwaysOnTop(true, "screen-saver");
}

function setMini(on) {
  if (on) createMini();
  else if (mini && !mini.isDestroyed()) mini.close();
}

/* ---------------- горячие клавиши ---------------- */

const HOTKEY_PREFIX = isMac ? "Control+Alt+Command+" : "Control+Alt+Shift+";
const HOTKEY_LABEL = isMac ? "⌃⌥⌘ + цифра" : "Ctrl+Alt+Shift + цифра";

function registerHotkeys() {
  globalShortcut.unregisterAll();
  if (!store.state.settings.hotkeys) return { ok: true, failed: [] };
  const failed = [];
  for (let n = 0; n <= 9; n++) {
    const ok = globalShortcut.register(HOTKEY_PREFIX + n, () => onHotkey(n));
    if (!ok) failed.push(n);
  }
  if (!globalShortcut.register(HOTKEY_PREFIX + "P", () => togglePause())) failed.push("P");
  return { ok: failed.length === 0, failed };
}

function onHotkey(n) {
  if (n === 0) {
    if (store.state.settings.auto) setOverride(null);
    else manualStop();
    return;
  }
  const s = activeStages()[n - 1];
  if (s) manualToggle(s.id);
}

/* ---------------- трей / строка меню ---------------- */

function asset(name) {
  return app.isPackaged ? path.join(process.resourcesPath, "assets", name) : path.join(__dirname, "..", "assets", name);
}

function createTray() {
  let img;
  if (isMac) {
    img = nativeImage.createFromPath(asset("trayTemplate.png"));
    img.setTemplateImage(true);
  } else {
    img = nativeImage.createFromPath(asset("tray.png"));
  }
  tray = new Tray(img);
  tray.setToolTip("Playhead");
  if (!isMac) tray.on("click", showWindow);
  updateTray();
}

const pad = (n) => String(n).padStart(2, "0");
function hms(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}
const stageName = (id) => (store.state.stages.find((s) => s.id === id) || {}).name || "—";
const activeStages = () => store.state.stages.filter((s) => !s.archived);
const manualRunning = () => store.sessions.find((s) => s.end == null && s.source !== "auto");

function currentLine() {
  const p = store.state.pause;
  if (p) {
    const t = p.endsAt ? hms(Math.max(0, p.endsAt - Date.now())) : hms(Date.now() - p.start);
    return { text: `Перерыв · ${p.endsAt ? "осталось " : ""}${t}`, short: t, stage: "перерыв", paused: true };
  }
  const auto = store.state.settings.auto;
  if (auto && live.tracking && live.sessionId) {
    const s = store.find(live.sessionId);
    if (s) {
      const t = hms((live.inGrace ? live.last : Date.now()) - s.start - (live.away || 0));
      return { text: `${stageName(s.cat)} · ${t}`, short: t, stage: stageName(s.cat) };
    }
  }
  const m = manualRunning();
  if (m) return { text: `${stageName(m.cat)} · ${hms(Date.now() - m.start)}`, short: hms(Date.now() - m.start), stage: stageName(m.cat) };
  return null;
}

function updateTrayTitle() {
  if (!tray) return;
  const cur = currentLine();
  if (isMac) tray.setTitle(cur ? ` ${cur.paused ? "☕ " : ""}${cur.short} · ${cur.stage}` : "", { fontType: "monospacedDigit" });
  tray.setToolTip(cur ? `Playhead — ${cur.text}` : "Playhead — пауза");
}

function updateTray() {
  if (!tray) return;
  const st = store.state;
  const auto = st.settings.auto;
  const cur = currentLine();
  const items = [];
  items.push({ label: cur ? `${cur.paused ? "☕" : "⏺"} ${cur.text}` : auto ? "Ждёт рабочую программу" : "Таймер стоит", enabled: false });
  if (auto && live.tracking && live.project) items.push({ label: `Проект: ${live.project}`, enabled: false });
  if (st.focus && st.focus.phase === "work") items.push({ label: `Фокус-блок до ${clock(st.focus.endsAt)}`, enabled: false });
  items.push({ type: "separator" });
  if (st.pause) {
    items.push({ label: "Вернуться к работе", click: () => resumeWork() });
    if (st.pause.endsAt) items.push({ label: "Ещё 5 минут перерыва", click: () => extendPause(5) });
  } else {
    items.push({ label: "Пауза", click: () => startPause(null) });
    items.push({ label: "Перерыв", submenu: [5, 10, 15, 20].map((m) => ({ label: `${m} минут`, click: () => startPause(m) })) });
  }
  if (st.focus && st.focus.phase !== "idle") items.push({ label: "Остановить фокус-блок", click: stopFocus });
  else items.push({ label: "Фокус-блок", submenu: [25, 50, 90].map((m) => ({ label: `${m} минут`, click: () => startFocus(m) })) });
  items.push({ type: "separator" });
  if (auto) {
    items.push({ label: "Этап", enabled: false });
    items.push({ label: "Автоматически", type: "radio", checked: !st.override, click: () => setOverride(null) });
    activeStages().forEach((s) =>
      items.push({ label: s.name, type: "radio", checked: st.override === s.id, click: () => setOverride(s.id) })
    );
  } else {
    activeStages().forEach((s, i) => {
      const m = manualRunning();
      items.push({ label: `${m && m.cat === s.id ? "■ Остановить: " : "▶ "}${s.name}`, click: () => manualToggle(s.id) });
    });
    if (manualRunning()) items.push({ label: "Остановить таймер", click: manualStop });
  }
  items.push({ type: "separator" });
  items.push({ label: "Автотрекинг", type: "checkbox", checked: auto, click: (mi) => setSettings({ auto: mi.checked }) });
  items.push({ label: "Мини-виджет поверх окон", type: "checkbox", checked: !!st.settings.mini, click: (mi) => setSettings({ mini: mi.checked }) });
  if (st.settings.mini) items.push({ label: miniView.collapsed ? "Развернуть виджет" : "Свернуть виджет в точку", click: () => send("mini:toggle", null) });
  items.push({ label: "Открыть трекер", click: showWindow });
  items.push({ label: "О программе", click: () => (isMac ? app.showAboutPanel() : (showWindow(), send("nav", "settings"))) });
  items.push({ type: "separator" });
  items.push({ label: "Выйти", click: () => { quitting = true; app.quit(); } });
  tray.setContextMenu(Menu.buildFromTemplate(items));
  updateTrayTitle();
}

/* ---------------- действия ---------------- */

function setOverride(id) {
  store.set("override", id || null);
  updateTray();
}

function setSettings(patch) {
  const s = { ...store.state.settings, ...patch };
  if ("openAtLogin" in patch) {
    app.setLoginItemSettings({ openAtLogin: !!patch.openAtLogin, openAsHidden: true, args: ["--hidden"] });
  }
  if ("auto" in patch) {
    if (patch.auto) manualStop();
    else engine.close();
  }
  store.set("settings", s);
  if ("mini" in patch) setMini(!!patch.mini);
  if ("hotkeys" in patch) hotkeyResult = registerHotkeys();
  updateTray();
}

/* ---------------- профессии ---------------- */

function setProfessions(list) {
  const ids = (Array.isArray(list) ? list : []).filter((id) => Prof.PROFESSIONS.some((p) => p.id === id));
  if (!ids.length) return;
  const wanted = Prof.stagesFor(ids);
  const st = store.state;
  const pristine = !st.settings.professions && st.sessions.length === 0;
  let stages;
  if (pristine) {
    stages = wanted; // новый пользователь — сразу набор под его профессии
  } else {
    // уже есть данные — ничего не убираем, только добавляем недостающие этапы
    stages = st.stages.map((s) => ({ ...s }));
    const used = new Set(stages.filter((s) => !s.archived).map((s) => s.color));
    for (const w of wanted) {
      const ex = stages.find((s) => s.id === w.id);
      if (ex) { if (ex.archived) ex.archived = false; continue; }
      const color = used.has(w.color) ? (["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"].find((c) => !used.has(c)) || w.color) : w.color;
      used.add(color);
      stages.push({ ...w, color });
    }
  }
  store.state.stages = stages;
  store.state.settings = { ...st.settings, professions: ids };
  store.changed();
  updateTray();
}

/* ---------------- пауза, перерывы, фокус ---------------- */

const clock = (t) => new Date(t).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

function notify(title, body) {
  try {
    if (!Notification.isSupported()) return;
    const n = new Notification({ title, body, silent: false });
    n.on("click", showWindow);
    n.show();
  } catch {}
}

function applyFocusState(next) {
  for (const k of ["focus", "pause", "breaks"]) if (next[k] !== store.state[k]) store.state[k] = next[k];
  store.changed();
}

function startPause(minutes) {
  const now = Date.now();
  const run = manualRunning();
  if (!store.state.pause) {
    if (run) store.update(run.id, { end: now });
    if (engine) engine.close();
  }
  if (minutes) store.state.settings = { ...store.state.settings, breakMinutes: minutes };
  applyFocusState(Focus.startPause(store.state, now, minutes || null, run));
  live = { ...live, tracking: false, sessionId: null, last: null, inGrace: false, paused: true };
  send("live", live);
  updateTray();
}

function resumeWork({ restartManual = true } = {}) {
  if (!store.state.pause) return;
  const now = Date.now();
  const r = Focus.resume(store.state, now);
  applyFocusState(r.state);
  if (restartManual && !store.state.settings.auto && r.resumeCat && activeStages().some((s) => s.id === r.resumeCat)) {
    store.add({ cat: r.resumeCat, start: now, end: null, project: r.resumeProject || "", source: "manual" });
  }
  live = { ...live, paused: false };
  send("live", live);
  updateTray();
}

function togglePause() {
  if (store.state.pause) resumeWork();
  else startPause(null);
}

function extendPause(minutes) {
  applyFocusState(Focus.extendPause(store.state, Date.now(), minutes));
  updateTray();
}

function startFocus(minutes) {
  if (store.state.pause) resumeWork();
  store.state.settings = { ...store.state.settings, focusMinutes: minutes };
  applyFocusState(Focus.startFocus(store.state, Date.now(), minutes));
  updateTray();
}

function stopFocus() {
  applyFocusState(Focus.stopFocus(store.state));
  updateTray();
}

function checkTimers(now) {
  for (const ev of Focus.due(store.state, now)) {
    if (ev === "focusDone") {
      const m = store.state.focus.minutes;
      applyFocusState(Focus.markFocusDone(store.state, now));
      notify("Фокус-блок закончен", `${m} мин работы позади. Самое время передохнуть.`);
      updateTray();
    }
    if (ev === "breakDone") {
      resumeWork();
      notify("Перерыв окончен", "Возвращаемся к работе — трекер снова считает время.");
    }
  }
}

function manualToggle(cat, project) {
  if (store.state.pause) resumeWork({ restartManual: false });
  if (store.state.settings.auto) return setOverride(store.state.override === cat ? null : cat);
  const now = Date.now();
  const run = manualRunning();
  if (run) store.update(run.id, { end: now });
  if (run && run.cat === cat) return updateTray();
  store.add({ cat, start: now, end: null, project: Projects.resolveAlias((project ?? store.state.project ?? "").trim(), store.state.projectAliases), source: "manual" });
  updateTray();
}

function manualStop() {
  const run = manualRunning();
  if (run) store.update(run.id, { end: Date.now() });
  updateTray();
}

/* ---------------- автотрекинг ---------------- */

function setupEngine() {
  engine = new Engine({
    open(cur) {
      const s = store.add(
        { cat: cur.stage, start: cur.start, end: null, project: cur.project, app: cur.app, source: "auto", lastSeen: cur.start },
        `auto-${cur.start}`
      );
      cur.sessionId = s.id;
      updateTray();
    },
    close(cur) {
      store.update(cur.sessionId, { end: cur.end, lastSeen: cur.end, away: cur.away || 0 });
      updateTray();
    },
    resume(cur) {
      // вернулся после короткой отлучки — сразу сохраняем, сколько вычесть
      store.update(cur.sessionId, { lastSeen: cur.last, away: cur.away || 0 });
    },
    discard(cur) {
      store.remove(cur.sessionId);
      updateTray();
    },
  });
}

let ticking = false;
async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const now = Date.now();
    checkTimers(now);
    const st = store.state;
    if (st.pause) {
      if (engine.cur) engine.close();
      live = { ...live, tracking: false, sessionId: null, last: null, inGrace: false, paused: true, needsAccess: false };
      return;
    }
    if (!st.settings.auto) {
      live = { ...live, tracking: false, sessionId: null, last: null, paused: false };
      return;
    }
    const idleMs = powerMonitor.getSystemIdleTime() * 1000;
    const idleLimit = (st.settings.idleMinutes || 5) * 60_000;
    let key = null;
    let fw = { app: "", title: "", ok: true };
    if (idleMs < idleLimit) {
      fw = await front.read();
      let resolveInfo = null;
      if (/resolve/i.test(fw.app)) {
        if (!resolveHelper) resolveHelper = new ResolveHelper(resolveHelperPath(app.isPackaged, process.resourcesPath, __dirname));
        resolveInfo = resolveHelper.poke();
      }
      if (/playhead|timecode|electron/i.test(fw.app)) {
        // кликнул в наше окно — продолжаем то, что было в монтажке
        key = lastAutoKey ? { ...lastAutoKey } : null;
      } else {
        key = classify({ appName: fw.app, title: fw.title, resolveInfo, override: null, memory, professions: st.settings.professions });
        // этап программы мог быть убран пользователем — тогда пишем в первый активный
        if (key && !activeStages().some((s) => s.id === key.stage)) key.stage = (activeStages()[0] || { id: key.stage }).id;
        lastAutoKey = key ? { ...key } : null;
      }
      if (key && st.override) key.stage = st.override;
      if (key && !key.project && st.project) key.project = st.project;
      if (key && key.project) key.project = Projects.resolveAlias(key.project, st.projectAliases);
    }
    if (key) lastWorkAt = now;
    else if (st.override && now - lastWorkAt > OVERRIDE_RESET_MS) setOverride(null);

    const before = engine.cur;
    engine.step(now, key, idleMs, idleLimit);
    const cur = engine.cur;
    if (cur && cur.sessionId && cur === before && now - (cur.persistedAt || 0) > 30_000) {
      cur.persistedAt = now;
      store.update(cur.sessionId, { lastSeen: cur.last, away: cur.away || 0 }, { silent: true });
    }
    live = {
      tracking: !!cur,
      app: cur ? cur.app : "",
      stage: cur ? cur.stage : null,
      project: cur ? cur.project : "",
      last: cur ? cur.last : null,
      sessionId: cur ? cur.sessionId : null,
      // показываем подсказку только если чтение окна реально не работает
      needsAccess: isMac && fw.ok === false ? (fw.why === "automation" ? "automation" : "accessibility") : false,
      resolve: resolveHelper ? resolveHelper.status : "idle",
      idle: idleMs >= idleLimit,
      frontApp: fw.app,
      inGrace: !!(cur && !key),
      away: cur ? cur.away || 0 : 0,
      paused: false,
    };
  } catch (e) {
    console.error(e);
  } finally {
    ticking = false;
    send("live", live);
    updateTrayTitle();
  }
}

/* ---------------- IPC ---------------- */

function setupIpc() {
  ipcMain.handle("professions:set", (_e, list) => setProfessions(list));
  ipcMain.handle("projects:rename", (_e, fromKey, toName) => {
    const r = Projects.renameProject(store.state.sessions, store.state.projectAliases, fromKey, toName);
    if (!r.changed) return { changed: 0 };
    store.state.sessions = r.sessions;
    store.state.projectAliases = r.aliases;
    // текущая автосессия тоже переходит на новое имя
    if (engine && engine.cur && Projects.keyOf(engine.cur.project) === fromKey) engine.cur.project = String(toName).trim();
    if (lastAutoKey && Projects.keyOf(lastAutoKey.project) === fromKey) lastAutoKey.project = String(toName).trim();
    for (const k of Object.keys(memory)) if (Projects.keyOf(memory[k]) === fromKey) memory[k] = String(toName).trim();
    if (Projects.keyOf(store.state.project) === fromKey) store.state.project = String(toName).trim();
    store.changed();
    updateTray();
    return { changed: r.changed, merged: r.merged };
  });
  ipcMain.handle("projects:unalias", (_e, key) => {
    const al = { ...(store.state.projectAliases || {}) };
    delete al[key];
    store.set("projectAliases", al);
  });
  ipcMain.handle("state:get", () => ({ appVersion: app.getVersion(), catalog: Prof.catalog(), state: store.state, live, platform: process.platform, openAtLogin: app.getLoginItemSettings().openAtLogin, vibrancy: hasVibrancy, hotkeyLabel: HOTKEY_LABEL, hotkeyFailed: hotkeyResult.failed }));
  ipcMain.handle("mini:view", () => miniView);
  ipcMain.handle("mini:collapse", (_e, on) => setMiniCollapsed(!!on));
  ipcMain.handle("mini:moveBy", (_e, dx, dy) => {
    if (!mini || mini.isDestroyed()) return;
    const [x, y] = mini.getPosition();
    mini.setPosition(Math.round(x + dx), Math.round(y + dy));
  });
  ipcMain.handle("mini:resize", (_e, h) => {
    if (!mini || mini.isDestroyed() || miniView.collapsed) return;
    const height = Math.max(60, Math.min(400, Math.round(h)));
    const [w] = mini.getSize();
    mini.setSize(w, height);
    miniView.expandedH = height;
  });
  ipcMain.handle("mini:openMain", () => showWindow());
  ipcMain.handle("mini:hide", () => setSettings({ mini: false }));
  ipcMain.handle("session:add", (_e, data) => { store.add(data); updateTray(); });
  ipcMain.handle("session:update", (_e, id, patch) => { store.update(id, patch); updateTray(); });
  ipcMain.handle("session:remove", (_e, id) => {
    if (engine.cur && engine.cur.sessionId === id) engine.cur = null;
    store.remove(id);
    updateTray();
  });
  ipcMain.handle("stages:set", (_e, stages) => { store.set("stages", stages); updateTray(); });
  ipcMain.handle("settings:set", (_e, patch) => setSettings(patch));
  ipcMain.handle("project:set", (_e, name) => store.set("project", String(name || "")));
  ipcMain.handle("timer:toggle", (_e, cat, project) => manualToggle(cat, project));
  ipcMain.handle("timer:stop", () => manualStop());
  ipcMain.handle("override:set", (_e, id) => setOverride(id));
  ipcMain.handle("focus:start", (_e, m) => startFocus(Math.max(1, Math.min(240, Number(m) || 50))));
  ipcMain.handle("focus:stop", () => stopFocus());
  ipcMain.handle("pause:start", (_e, m) => startPause(m ? Math.max(1, Math.min(180, Number(m))) : null));
  ipcMain.handle("pause:resume", () => resumeWork());
  ipcMain.handle("pause:extend", (_e, m) => extendPause(Math.max(1, Math.min(60, Number(m) || 5))));
  ipcMain.handle("access:request", (_e, kind) => {
    if (!isMac) return;
    if (kind === "automation") {
      shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_Automation");
      return;
    }
    systemPreferences.isTrustedAccessibilityClient(true);
    shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility");
  });
  ipcMain.handle("export:csv", async () => {
    const d = new Date();
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: "Экспорт сессий",
      defaultPath: path.join(app.getPath("documents"), `playhead-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.csv`),
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (canceled || !filePath) return { ok: false };
    fs.writeFileSync(filePath, toCSV(store.sessions, store.state.stages), "utf8");
    shell.showItemInFolder(filePath);
    return { ok: true, count: store.sessions.filter((s) => s.end != null).length };
  });
  ipcMain.handle("data:reveal", () => shell.showItemInFolder(store.file));
}

/* ---------------- запуск ---------------- */

app.on("second-instance", showWindow);
app.on("activate", showWindow);
app.on("window-all-closed", (e) => e.preventDefault && e.preventDefault());
app.on("before-quit", () => {
  quitting = true;
  if (engine) engine.close();
  if (store) store.flush();
  front.stop();
  globalShortcut.unregisterAll();
  if (resolveHelper) resolveHelper.stop();
});
powerMonitor.on("suspend", () => { if (engine) engine.close(); });
powerMonitor.on("lock-screen", () => { if (engine) engine.close(); });

app.whenReady().then(() => {
  app.setAppUserModelId && app.setAppUserModelId("app.timecode.tracker");
  app.setAboutPanelOptions({
    applicationName: "Playhead",
    applicationVersion: app.getVersion(),
    copyright: "© 2026 MILAMABI. Все права защищены.",
    credits: "Автор и правообладатель: MILAMABI\ngithub.com/MILAMABI",
  });
  migrateFromTimecode();
  store = new Store(app.getPath("userData"), (state) => send("state", state));
  store.repair();
  setupEngine();
  setupIpc();
  createTray();
  const login = app.getLoginItemSettings();
  const hidden = process.argv.includes("--hidden") || login.wasOpenedAsHidden || login.wasOpenedAtLogin;
  createWindow(!hidden);
  hotkeyResult = registerHotkeys();
  if (store.state.settings.mini) createMini();
  setInterval(keepMiniAlive, 3000);
  powerMonitor.on("resume", () => setTimeout(keepMiniAlive, 1500));
  powerMonitor.on("unlock-screen", () => setTimeout(keepMiniAlive, 1500));
  screen.on("display-removed", () => {
    // монитор отключили — переносим виджет на основной экран
    if (mini && !mini.isDestroyed()) {
      const a = screen.getPrimaryDisplay().workArea;
      mini.setPosition(a.x + a.width - MINI_W - 24, a.y + 24);
    }
  });
  if (hidden && isMac && app.dock) app.dock.hide();
  setInterval(tick, POLL_MS);
  setInterval(updateTray, 60_000);
  tick();
});
