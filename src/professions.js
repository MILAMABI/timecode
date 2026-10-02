/*!
 * Playhead
 * © 2026 MILAMABI. Все права защищены. Проприетарное ПО — см. LICENSE.
 * Копирование, изменение и распространение без разрешения автора запрещены.
 */
// Профессии: какие этапы у каждого направления и какие программы отслеживаем.
// needles — подстроки имени процесса (Mac и Windows), без учёта регистра.
// stage — этап по умолчанию; объект {профессия: этап}, если программа нужна в нескольких направлениях.
// project — как достать имя проекта из заголовка окна.

const PROFESSIONS = [
  {
    id: "video", name: "Видео", desc: "Монтаж, цвет, звук, графика",
    stages: [
      { id: "edit", name: "Монтаж", color: "c1" },
      { id: "color", name: "Цветкор", color: "c2" },
      { id: "sound", name: "Саунд-дизайн", color: "c3" },
      { id: "vfx", name: "VFX", color: "c4" },
      { id: "render", name: "Рендер", color: "c8" },
      { id: "revisions", name: "Правки клиента", color: "c5" },
    ],
  },
  {
    id: "photo", name: "Фото", desc: "Отбор, проявка, ретушь",
    stages: [
      { id: "cull", name: "Отбор", color: "c6" },
      { id: "develop", name: "Проявка и цвет", color: "c2" },
      { id: "retouch", name: "Ретушь", color: "c4" },
      { id: "cleanup", name: "Клинап", color: "c3" },
      { id: "export", name: "Экспорт и сдача", color: "c8" },
      { id: "revisions", name: "Правки клиента", color: "c5" },
    ],
  },
  {
    id: "design", name: "Дизайн", desc: "Интерфейсы, графика, вёрстка",
    stages: [
      { id: "refs", name: "Референсы", color: "c6" },
      { id: "concept", name: "Концепт", color: "c4" },
      { id: "layout", name: "Макет", color: "c1" },
      { id: "prototype", name: "Прототип", color: "c7" },
      { id: "revisions", name: "Правки клиента", color: "c5" },
      { id: "handoff", name: "Подготовка к сдаче", color: "c8" },
    ],
  },
  {
    id: "motion", name: "Моушн и 3D", desc: "Анимация, 3D, композ",
    stages: [
      { id: "model", name: "Моделинг", color: "c7" },
      { id: "anim", name: "Анимация", color: "c1" },
      { id: "lookdev", name: "Свет и материалы", color: "c2" },
      { id: "render", name: "Рендер", color: "c8" },
      { id: "comp", name: "Композ", color: "c4" },
      { id: "revisions", name: "Правки клиента", color: "c5" },
    ],
  },
  {
    id: "audio", name: "Звук и музыка", desc: "Запись, сведение, мастеринг",
    stages: [
      { id: "rec", name: "Запись", color: "c5" },
      { id: "arrange", name: "Аранжировка", color: "c1" },
      { id: "mix", name: "Сведение", color: "c3" },
      { id: "master", name: "Мастеринг", color: "c2" },
      { id: "revisions", name: "Правки клиента", color: "c8" },
    ],
  },
];

// Расширения рабочих файлов — по ним находим имя проекта в заголовке окна.
const FILE_EXT = "prproj|aep|aepx|psd|psb|ai|indd|idml|blend|c4d|hip|hiplc|hipnc|uproject|als|flp|logicx|ptx|rpp|cpr|fcpbundle|sketch|afdesign|afphoto|afpub|af|nk|lrcat|cosessiondb|tif|tiff|jpg|jpeg|png|dng|cr3|nef|arw|raf|fig";
const fileRe = new RegExp(`([^/\\\\|]+?)\\.(?:${FILE_EXT})\\b`, "i");

const P = {
  file: (t) => { const m = fileRe.exec(t || ""); return m ? m[1].replace(/^[\s*•]+/, "").trim() : ""; },
  // «Название – Figma» / «Название — Figma»
  before: (marker) => (t) => {
    const s = String(t || "");
    const i = s.toLowerCase().indexOf(marker.toLowerCase());
    if (i < 0) return P.file(s) || (/^(home|drafts|recents|главная|черновики)$/i.test(s.trim()) ? "" : s.trim());
    if (i === 0) return P.file(s);
    return s.slice(0, i).replace(/[\s–—\-|:]+$/, "").trim() || P.file(s);
  },
  // «Каталог - Adobe Photoshop Lightroom Classic - Библиотека»
  firstSegment: (t) => { const s = String(t || "").split(/\s[-–—]\s/)[0].trim(); return /lightroom|capture one/i.test(s) ? "" : s; },
};

const APPS = [
  // ---- видео ----
  { needles: ["premiere"], label: "Premiere", for: ["video"], stage: "edit", project: P.file },
  { needles: ["resolve"], label: "Resolve", for: ["video"], stage: "edit", resolve: true },
  { needles: ["final cut"], label: "Final Cut Pro", for: ["video"], stage: "edit", project: P.file },
  { needles: ["media composer", "avid"], label: "Media Composer", for: ["video"], stage: "edit", project: P.file },
  { needles: ["capcut"], label: "CapCut", for: ["video"], stage: "edit", project: P.before("capcut") },
  { needles: ["after effects", "afterfx"], label: "After Effects", for: ["video", "motion"], stage: { video: "vfx", motion: "anim" }, project: P.file },
  { needles: ["audition"], label: "Audition", for: ["video", "audio"], stage: { video: "sound", audio: "mix" }, project: P.file },
  { needles: ["nuke"], label: "Nuke", for: ["video", "motion"], stage: { video: "vfx", motion: "comp" }, project: P.file },
  // ---- фото ----
  { needles: ["lightroom"], label: "Lightroom", for: ["photo"], stage: "develop", project: P.firstSegment },
  { needles: ["capture one", "captureone"], label: "Capture One", for: ["photo"], stage: "develop", project: P.firstSegment },
  { needles: ["photo mechanic", "photomechanic"], label: "Photo Mechanic", for: ["photo"], stage: "cull", project: P.file },
  { needles: ["adobe bridge", "bridge"], label: "Bridge", for: ["photo", "design"], stage: { photo: "cull", design: "refs" }, project: P.file },
  { needles: ["photoshop"], label: "Photoshop", for: ["photo", "design"], stage: { photo: "retouch", design: "layout" }, project: P.file },
  { needles: ["luminar"], label: "Luminar", for: ["photo"], stage: "develop", project: P.file },
  { needles: ["photolab", "dxo"], label: "DxO PhotoLab", for: ["photo"], stage: "develop", project: P.file },
  { needles: ["topaz"], label: "Topaz", for: ["photo"], stage: "cleanup", project: P.file },
  { needles: ["helicon"], label: "Helicon Focus", for: ["photo"], stage: "retouch", project: P.file },
  { needles: ["evoto"], label: "Evoto", for: ["photo"], stage: "retouch", project: P.file },
  { needles: ["retouch4me"], label: "Retouch4me", for: ["photo"], stage: "retouch", project: P.file },
  // ---- дизайн ----
  { needles: ["figma"], label: "Figma", for: ["design"], stage: "layout", project: P.before("figma") },
  { needles: ["illustrator"], label: "Illustrator", for: ["design"], stage: "layout", project: P.file },
  { needles: ["indesign"], label: "InDesign", for: ["design"], stage: "layout", project: P.file },
  { needles: ["sketch"], label: "Sketch", for: ["design"], stage: "layout", project: P.file },
  { needles: ["affinity"], label: "Affinity", for: ["design", "photo"], stage: { design: "layout", photo: "retouch" }, project: P.file },
  { needles: ["framer"], label: "Framer", for: ["design"], stage: "prototype", project: P.before("framer") },
  { needles: ["canva"], label: "Canva", for: ["design"], stage: "layout", project: P.before("canva") },
  { needles: ["penpot"], label: "Penpot", for: ["design"], stage: "layout", project: P.before("penpot") },
  // ---- моушн и 3D ----
  { needles: ["cinema 4d", "cinema4d"], label: "Cinema 4D", for: ["motion"], stage: "model", project: P.file },
  { needles: ["blender"], label: "Blender", for: ["motion"], stage: "model", project: P.file },
  { needles: ["houdini"], label: "Houdini", for: ["motion"], stage: "model", project: P.file },
  { needles: ["unrealeditor", "unreal"], label: "Unreal Engine", for: ["motion"], stage: "lookdev", project: P.before("unreal") },
  // ---- звук ----
  { needles: ["logic pro"], label: "Logic Pro", for: ["audio"], stage: "arrange", project: P.file },
  { needles: ["ableton"], label: "Ableton Live", for: ["audio"], stage: "arrange", project: P.file },
  { needles: ["fl studio", "fl64", "fl32"], label: "FL Studio", for: ["audio"], stage: "arrange", project: P.file },
  { needles: ["pro tools", "protools"], label: "Pro Tools", for: ["audio"], stage: "mix", project: P.file },
  { needles: ["reaper"], label: "Reaper", for: ["audio"], stage: "mix", project: P.file },
  { needles: ["cubase"], label: "Cubase", for: ["audio"], stage: "arrange", project: P.file },
];

const RESOLVE_PAGES = {
  media: "edit", cut: "edit", edit: "edit",
  color: "color", fairlight: "sound", fusion: "vfx", deliver: "render",
};

/** Программы, которые отслеживаем при выбранных профессиях. */
function appsFor(professions) {
  const ps = professions && professions.length ? professions : ["video"];
  return APPS.filter((a) => a.for.some((f) => ps.includes(f)));
}

/** Этап программы с учётом профессий (первая подходящая по порядку выбора пользователя). */
function stageFor(app, professions) {
  if (typeof app.stage === "string") return app.stage;
  const ps = professions && professions.length ? professions : ["video"];
  for (const p of ps) if (app.stage[p]) return app.stage[p];
  return Object.values(app.stage)[0];
}

/** Этапы для набора профессий: без повторов, цвета по возможности не совпадают. */
function stagesFor(professions) {
  const out = [];
  for (const pid of professions) {
    const prof = PROFESSIONS.find((p) => p.id === pid);
    if (!prof) continue;
    for (const s of prof.stages) if (!out.some((o) => o.id === s.id)) out.push({ ...s });
  }
  // «Правки клиента» — в конец
  out.sort((a, b) => (a.id === "revisions") - (b.id === "revisions"));
  const palette = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"];
  const used = new Set();
  for (const s of out) {
    if (used.has(s.color)) s.color = palette.find((c) => !used.has(c)) || s.color;
    used.add(s.color);
  }
  return out;
}

/** Каталог для интерфейса (без функций). */
function catalog() {
  return PROFESSIONS.map((p) => ({
    id: p.id, name: p.name, desc: p.desc,
    stages: p.stages.map((s) => ({ ...s })),
    apps: APPS.filter((a) => a.for.includes(p.id)).map((a) => a.label),
  }));
}

module.exports = { PROFESSIONS, APPS, RESOLVE_PAGES, appsFor, stageFor, stagesFor, catalog, projectFromTitle: P };
