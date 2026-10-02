/*!
 * Playhead
 * © 2026 MILAMABI. Все права защищены. Проприетарное ПО — см. LICENSE.
 * Копирование, изменение и распространение без разрешения автора запрещены.
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  getState: () => ipcRenderer.invoke("state:get"),
  addSession: (data) => ipcRenderer.invoke("session:add", data),
  updateSession: (id, patch) => ipcRenderer.invoke("session:update", id, patch),
  removeSession: (id) => ipcRenderer.invoke("session:remove", id),
  setStages: (stages) => ipcRenderer.invoke("stages:set", stages),
  setSettings: (patch) => ipcRenderer.invoke("settings:set", patch),
  setProfessions: (list) => ipcRenderer.invoke("professions:set", list),
  addCustomProfession: (name, stages) => ipcRenderer.invoke("custom:addProfession", name, stages),
  removeCustomProfession: (id) => ipcRenderer.invoke("custom:removeProfession", id),
  addCustomApp: (label, stage) => ipcRenderer.invoke("custom:addApp", label, stage),
  removeCustomApp: (id) => ipcRenderer.invoke("custom:removeApp", id),
  setStageOverride: (label, stage) => ipcRenderer.invoke("custom:setOverride", label, stage),
  runningApps: () => ipcRenderer.invoke("apps:running"),
  appTable: () => ipcRenderer.invoke("apps:table"),
  renameProject: (fromKey, toName) => ipcRenderer.invoke("projects:rename", fromKey, toName),
  removeAlias: (key) => ipcRenderer.invoke("projects:unalias", key),
  setProject: (name) => ipcRenderer.invoke("project:set", name),
  toggleTimer: (cat, project) => ipcRenderer.invoke("timer:toggle", cat, project),
  stopTimer: () => ipcRenderer.invoke("timer:stop"),
  setOverride: (id) => ipcRenderer.invoke("override:set", id),
  startFocus: (m) => ipcRenderer.invoke("focus:start", m),
  stopFocus: () => ipcRenderer.invoke("focus:stop"),
  startPause: (m) => ipcRenderer.invoke("pause:start", m),
  resume: () => ipcRenderer.invoke("pause:resume"),
  extendPause: (m) => ipcRenderer.invoke("pause:extend", m),
  requestAccess: (kind) => ipcRenderer.invoke("access:request", kind),
  exportCSV: () => ipcRenderer.invoke("export:csv"),
  revealData: () => ipcRenderer.invoke("data:reveal"),
  miniResize: (h) => ipcRenderer.invoke("mini:resize", h),
  openMain: () => ipcRenderer.invoke("mini:openMain"),
  hideMini: () => ipcRenderer.invoke("mini:hide"),
  miniView: () => ipcRenderer.invoke("mini:view"),
  miniCollapse: (on) => ipcRenderer.invoke("mini:collapse", on),
  miniMoveBy: (dx, dy) => ipcRenderer.invoke("mini:moveBy", dx, dy),
  onMiniToggle: (fn) => ipcRenderer.on("mini:toggle", () => fn()),
  onState: (fn) => ipcRenderer.on("state", (_e, s) => fn(s)),
  onLive: (fn) => ipcRenderer.on("live", (_e, l) => fn(l)),
  onNav: (fn) => ipcRenderer.on("nav", (_e, t) => fn(t)),
});
