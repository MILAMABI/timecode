const assert = require("assert");
const { classify } = require("../src/engine");
const { stagesFor, appsFor, catalog, PROFESSIONS, APPS } = require("../src/professions");

const c = (appName, title, professions) => classify({ appName, title, memory: {}, professions });

// --- фото ---
const PH = ["photo"];
assert.deepStrictEqual(c("Photo Mechanic 6", "Wedding_0123.CR3", PH), { stage: "cull", project: "Wedding_0123", app: "Photo Mechanic" });
assert.deepStrictEqual(c("Adobe Lightroom Classic", "Свадьба Ани - Adobe Photoshop Lightroom Classic - Библиотека", PH), { stage: "develop", project: "Свадьба Ани", app: "Lightroom" });
assert.strictEqual(c("Capture One", "Lookbook SS27 - Capture One", PH).project, "Lookbook SS27");
assert.deepStrictEqual(c("Adobe Photoshop 2026", "IMG_4410.psd @ 66,7% (Слой 1, RGB/16)", PH), { stage: "retouch", project: "IMG_4410", app: "Photoshop" });
assert.strictEqual(c("Topaz Photo AI", "", PH).stage, "cleanup");
// Windows-имена процессов
assert.strictEqual(c("CaptureOne", "", PH).app, "Capture One");
assert.strictEqual(c("Photoshop", "portrait.psd @ 50%", PH).stage, "retouch");

// --- дизайн: тот же Photoshop — уже «Макет» ---
const DS = ["design"];
assert.strictEqual(c("Adobe Photoshop 2026", "banner.psd @ 100%", DS).stage, "layout");
assert.deepStrictEqual(c("Figma", "Лендинг кофейни – Figma", DS), { stage: "layout", project: "Лендинг кофейни", app: "Figma" });
assert.strictEqual(c("Figma", "Лендинг кофейни", DS).project, "Лендинг кофейни");
assert.strictEqual(c("Adobe Illustrator 2026", "logo_v3.ai @ 150% (RGB/Preview)", DS).project, "logo_v3");
assert.strictEqual(c("Framer", "Портфолио — Framer", DS).stage, "prototype");
// программы чужих направлений не отслеживаются
assert.strictEqual(c("Adobe Premiere Pro 2026", "x.prproj", DS), null);
assert.strictEqual(c("Blender", "scene.blend", DS), null);

// --- фото + дизайн: Photoshop по первой выбранной профессии ---
assert.strictEqual(c("Adobe Photoshop 2026", "a.psd", ["design", "photo"]).stage, "layout");
assert.strictEqual(c("Adobe Photoshop 2026", "a.psd", ["photo", "design"]).stage, "retouch");

// --- моушн и 3D ---
const MO = ["motion"];
assert.deepStrictEqual(c("Blender", "/Users/misha/3d/bottle_v2.blend - Blender 4.4", MO), { stage: "model", project: "bottle_v2", app: "Blender" });
assert.strictEqual(c("Adobe After Effects 2026", "titles.aep *", MO).stage, "anim");
assert.strictEqual(c("Adobe After Effects 2026", "titles.aep *", ["video"]).stage, "vfx");
assert.strictEqual(c("Cinema 4D", "box.c4d", MO).project, "box");
assert.strictEqual(c("UnrealEditor", "Showroom - Unreal Editor", MO).stage, "lookdev");

// --- звук ---
const AU = ["audio"];
assert.deepStrictEqual(c("Logic Pro", "Трек 07.logicx - Tracks", AU), { stage: "arrange", project: "Трек 07", app: "Logic Pro" });
assert.strictEqual(c("Ableton Live 12 Suite", "beat.als [beat]", AU).project, "beat");
assert.strictEqual(c("FL64", "", AU).app, "FL Studio");
assert.strictEqual(c("Pro Tools", "Session.ptx", AU).stage, "mix");

// --- видео (как раньше) ---
assert.strictEqual(c("Final Cut Pro", "", ["video"]).stage, "edit");
assert.strictEqual(c("Adobe Premiere Pro 2026", "x - /a/Nike.prproj", ["video"]).project, "Nike");

// --- этапы для набора профессий ---
const st = stagesFor(["video", "photo"]);
const ids = st.map((s) => s.id);
assert.strictEqual(new Set(ids).size, ids.length, "этапы без повторов");
assert.ok(ids.includes("edit") && ids.includes("retouch"));
assert.strictEqual(ids[ids.length - 1], "revisions", "правки в конце");
assert.strictEqual(new Set(st.slice(0, 8).map((s) => s.color)).size, Math.min(8, st.length), "первые цвета не повторяются");
assert.ok(stagesFor(["audio"]).length === 5);

// --- каталог ---
assert.strictEqual(catalog().length, 5);
for (const p of PROFESSIONS) assert.ok(appsFor([p.id]).length >= 4, `программы для ${p.id}`);
// каждый этап программы существует в своей профессии
for (const a of APPS) for (const pid of a.for) {
  const stage = typeof a.stage === "string" ? a.stage : a.stage[pid];
  assert.ok(PROFESSIONS.find((p) => p.id === pid).stages.some((s) => s.id === stage), `${a.label}: этап ${stage} в ${pid}`);
}

console.log("professions: все проверки пройдены");
