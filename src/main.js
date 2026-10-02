const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, powerMonitor, dialog, shell, systemPreferences } = require("electron");
const path = require("path");
const fs = require("fs");
const { Engine, classify, toCSV } = require("./engine");
const { Store } = require("./store");
const { FrontWindow, ResolveHelper, resolveHelperPath } = require("./watchers");

const POLL_MS = 2000;
const OVERRIDE_RESET_MS = 30 * 60_000; // ручной этап сбрасывается, если 30 минут не было работы
const isMac = process.platform === "darwin";

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let win = null;
let tray = null;
let store = null;
let engine = null;
let quitting = false;
const front = new FrontWindow();
let resolveHelper = null;
const memory = {};
let lastWorkAt = Date.now();
let live = { tracking: false, app: "", stage: null, project: "", last: null, sessionId: null, needsAccess: false, resolve: "idle", idle: false, frontApp: "" };

/* ---------------- окно ---------------- */

function createWindow(show = true) {
  win = new BrowserWindow({
    width: 980,
    height: 860,
    minWidth: 420,
    minHeight: 500,
    show,
    title: "Рабочий таймкод",
    backgroundColor: "#111317",
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
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
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
  tray.setToolTip("Рабочий таймкод");
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
  const auto = store.state.settings.auto;
  if (auto && live.tracking && live.sessionId) {
    const s = store.find(live.sessionId);
    if (s) return { text: `${stageName(s.cat)} · ${hms((live.last || Date.now()) - s.start)}`, short: hms((live.last || Date.now()) - s.start) };
  }
  const m = manualRunning();
  if (m) return { text: `${stageName(m.cat)} · ${hms(Date.now() - m.start)}`, short: hms(Date.now() - m.start) };
  return null;
}

function updateTrayTitle() {
  if (!tray) return;
  const cur = currentLine();
  if (isMac) tray.setTitle(cur ? ` ${cur.short}` : "", { fontType: "monospacedDigit" });
  tray.setToolTip(cur ? `Рабочий таймкод — ${cur.text}` : "Рабочий таймкод — пауза");
}

function updateTray() {
  if (!tray) return;
  const st = store.state;
  const auto = st.settings.auto;
  const cur = currentLine();
  const items = [];
  items.push({ label: cur ? `⏺ ${cur.text}` : auto ? "Ждёт Premiere или Resolve" : "Таймер стоит", enabled: false });
  if (auto && live.tracking && live.project) items.push({ label: `Проект: ${live.project}`, enabled: false });
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
      items.push({ label: `${m && m.cat === s.id ? "■ Остановить: " : "▶ "}${s.name}`, accelerator: i < 9 ? undefined : undefined, click: () => manualToggle(s.id) });
    });
    if (manualRunning()) items.push({ label: "Остановить таймер", click: manualStop });
  }
  items.push({ type: "separator" });
  items.push({ label: "Автотрекинг", type: "checkbox", checked: auto, click: (mi) => setSettings({ auto: mi.checked }) });
  items.push({ label: "Открыть трекер", click: showWindow });
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
  updateTray();
}

function manualToggle(cat, project) {
  if (store.state.settings.auto) return setOverride(store.state.override === cat ? null : cat);
  const now = Date.now();
  const run = manualRunning();
  if (run) store.update(run.id, { end: now });
  if (run && run.cat === cat) return updateTray();
  store.add({ cat, start: now, end: null, project: (project ?? store.state.project ?? "").trim(), source: "manual" });
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
      store.update(cur.sessionId, { end: cur.end, lastSeen: cur.end });
      updateTray();
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
    const st = store.state;
    if (!st.settings.auto) {
      live = { ...live, tracking: false, sessionId: null, last: null };
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
      key = classify({ appName: fw.app, title: fw.title, resolveInfo, override: st.override, memory });
      if (key && !key.project && st.project) key.project = st.project;
    }
    if (key) lastWorkAt = now;
    else if (st.override && now - lastWorkAt > OVERRIDE_RESET_MS) setOverride(null);

    const before = engine.cur;
    engine.step(now, key, idleMs, idleLimit);
    const cur = engine.cur;
    if (cur && cur.sessionId && cur === before && now - (cur.persistedAt || 0) > 30_000) {
      cur.persistedAt = now;
      store.update(cur.sessionId, { lastSeen: cur.last }, { silent: true });
    }
    live = {
      tracking: !!cur,
      app: cur ? cur.app : "",
      stage: cur ? cur.stage : null,
      project: cur ? cur.project : "",
      last: cur ? cur.last : null,
      sessionId: cur ? cur.sessionId : null,
      needsAccess: isMac && (!fw.ok || !systemPreferences.isTrustedAccessibilityClient(false)),
      resolve: resolveHelper ? resolveHelper.status : "idle",
      idle: idleMs >= idleLimit,
      frontApp: fw.app,
      inGrace: !!(cur && !key),
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
  ipcMain.handle("state:get", () => ({ state: store.state, live, platform: process.platform, openAtLogin: app.getLoginItemSettings().openAtLogin }));
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
  ipcMain.handle("access:request", () => {
    if (!isMac) return;
    systemPreferences.isTrustedAccessibilityClient(true);
    shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility");
  });
  ipcMain.handle("export:csv", async () => {
    const d = new Date();
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: "Экспорт сессий",
      defaultPath: path.join(app.getPath("documents"), `timecode-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.csv`),
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
  if (resolveHelper) resolveHelper.stop();
});
powerMonitor.on("suspend", () => { if (engine) engine.close(); });
powerMonitor.on("lock-screen", () => { if (engine) engine.close(); });

app.whenReady().then(() => {
  app.setAppUserModelId && app.setAppUserModelId("app.timecode.tracker");
  store = new Store(app.getPath("userData"), (state) => send("state", state));
  store.repair();
  setupEngine();
  setupIpc();
  createTray();
  const login = app.getLoginItemSettings();
  const hidden = process.argv.includes("--hidden") || login.wasOpenedAsHidden || login.wasOpenedAtLogin;
  createWindow(!hidden);
  if (hidden && isMac && app.dock) app.dock.hide();
  setInterval(tick, POLL_MS);
  setInterval(updateTray, 60_000);
  tick();
});
