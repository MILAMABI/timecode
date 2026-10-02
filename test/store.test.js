const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { Store } = require("../src/store");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "timecode-"));
let changes = 0;
const s = new Store(dir, () => changes++);
assert.strictEqual(s.state.stages.length, 6);
assert.strictEqual(s.state.settings.auto, true);

const a = s.add({ cat: "edit", start: 1000, end: null, source: "auto", lastSeen: 120_000 }, "auto-1000");
assert.strictEqual(a.id, "auto-1000");
const b = s.add({ cat: "color", start: 5000, end: 9000, source: "manual" });
s.add({ cat: "edit", start: 7000, end: null, source: "auto", lastSeen: 10_000 }, "auto-7000"); // 3 c — мусор
s.flush();

// после «сбоя»: незакрытая автосессия закрывается по последней отметке, мусор удаляется
const s2 = new Store(dir);
s2.repair();
assert.strictEqual(s2.find("auto-1000").end, 120_000);
assert.ok(!s2.find("auto-7000"));
assert.ok(s2.find(b.id));

// повреждённый файл — подхватывается резервная копия
s2.update(b.id, { project: "Nike" });
s2.flush();
fs.writeFileSync(path.join(dir, "timecode-data.json"), "{broken");
const s3 = new Store(dir);
assert.ok(s3.state.sessions.length >= 1);

assert.ok(changes > 0);
console.log("store: все проверки пройдены");
