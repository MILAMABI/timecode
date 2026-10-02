const assert = require("assert");
const { Engine, classify, premiereProject, toCSV } = require("../src/engine");

// --- имя проекта из заголовка Premiere (Mac и Windows) ---
assert.strictEqual(premiereProject("Adobe Premiere Pro 2025 - /Users/misha/Проекты/Клип Nike.prproj *"), "Клип Nike");
assert.strictEqual(premiereProject("Adobe Premiere Pro 2025 - C:\\Work\\Свадьба.prproj"), "Свадьба");
assert.strictEqual(premiereProject("Export Settings"), "");

// --- классификация программ ---
const mem = {};
assert.deepStrictEqual(classify({ appName: "Adobe Premiere Pro 2025", title: "x - /a/Nike.prproj", memory: mem }), { stage: "edit", project: "Nike", app: "Premiere" });
// диалог без имени проекта — проект берётся из памяти
assert.deepStrictEqual(classify({ appName: "Adobe Premiere Pro 2025", title: "Export Settings", memory: mem }), { stage: "edit", project: "Nike", app: "Premiere" });
assert.deepStrictEqual(classify({ appName: "Resolve", title: "", resolveInfo: { page: "color", project: "Reel" }, memory: mem }), { stage: "color", project: "Reel", app: "Resolve" });
assert.deepStrictEqual(classify({ appName: "Resolve", title: "", resolveInfo: { page: "fairlight", project: "Reel" }, memory: mem }).stage, "sound");
assert.deepStrictEqual(classify({ appName: "Resolve", title: "", resolveInfo: null, memory: mem }).stage, "edit");
assert.deepStrictEqual(classify({ appName: "AfterFX", title: "", memory: mem }).stage, "vfx");
assert.deepStrictEqual(classify({ appName: "Adobe Premiere Pro 2025", title: "", override: "color", memory: mem }).stage, "color");
assert.strictEqual(classify({ appName: "Telegram", title: "", memory: mem }), null);

// --- движок сессий ---
function run(steps) {
  const closed = [], discarded = [];
  const e = new Engine({ open() {}, close: (c) => closed.push({ ...c }), discard: (c) => discarded.push({ ...c }) });
  let now = 0;
  for (const [n, key, idle = 0] of steps) for (let i = 0; i < n; i++) { e.step(now, key, idle, 300_000); now += 2000; }
  e.close();
  return { closed, discarded };
}
const P = { stage: "edit", project: "Nike", app: "Premiere" };
const C = { stage: "color", project: "Nike", app: "Premiere" };

// короткая отлучка (30 c) не рвёт сессию, но время отлучки не засчитывается
let r = run([[100, P], [15, null], [50, P]]);
assert.strictEqual(r.closed.length, 1);
assert.strictEqual(r.closed[0].end - r.closed[0].start, 328_000);
assert.strictEqual(r.closed[0].away, 32_000);
assert.strictEqual(r.closed[0].end - r.closed[0].start - r.closed[0].away, 296_000);
// две отлучки складываются
r = run([[50, P], [10, null], [50, P], [10, null], [20, P]]);
assert.strictEqual(r.closed.length, 1);
assert.strictEqual(r.closed[0].away, 22_000 * 2);

// долгая отлучка (90 c) рвёт сессию, конец — момент ухода
r = run([[100, P], [45, null], [50, P]]);
assert.strictEqual(r.closed.length, 2);
assert.strictEqual(r.closed[0].end, 198_000);

// смена этапа делит сессию
r = run([[100, P], [100, C]]);
assert.deepStrictEqual(r.closed.map((c) => c.stage), ["edit", "color"]);

// слишком короткая сессия не записывается
r = run([[5, P]]);
assert.strictEqual(r.closed.length, 0);
assert.strictEqual(r.discarded.length, 1);

// простой: сессия заканчивается в момент последнего действия
{
  const closed = [];
  const e = new Engine({ close: (c) => closed.push({ ...c }) });
  let now = 0;
  for (; now <= 600_000; now += 2000) e.step(now, P, 0, 300_000);       // 10 минут работы
  const lastAction = now - 2000;
  for (; now <= lastAction + 400_000; now += 2000) e.step(now, P, now - lastAction, 300_000); // ушёл, Premiere на экране
  assert.strictEqual(closed.length, 1);
  assert.strictEqual(closed[0].end, lastAction);
}

// --- CSV ---
const csv = toCSV(
  [{ id: "x1", cat: "color", start: 1000, end: 61_000, project: 'Клип, "Nike"', app: "Resolve" }, { id: "x2", cat: "edit", start: 5, end: null }],
  [{ id: "color", name: "Цветкор" }]
);
const lines = csv.replace(/^\uFEFF/, "").trim().split("\r\n");
assert.strictEqual(lines.length, 2);
assert.ok(lines[1].startsWith("auto-1000,1000,61000,color,Цветкор,\"Клип, \"\"Nike\"\"\",Resolve,"));

console.log("engine: все проверки пройдены");
