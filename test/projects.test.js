const assert = require("assert");
const { resolveAlias, renameProject } = require("../src/projects");

const S = [
  { id: "1", project: "Nike_final" },
  { id: "2", project: "Nike color" },
  { id: "3", project: "nike_final" },
  { id: "4", project: "Свадьба" },
  { id: "5", project: "" },
];

// переименование: все сессии проекта (без учёта регистра) получают новое имя
let r = renameProject(S, {}, "nike_final", "Клип Nike");
assert.strictEqual(r.changed, 2);
assert.strictEqual(r.merged, false);
assert.deepStrictEqual(r.sessions.map((s) => s.project), ["Клип Nike", "Nike color", "Клип Nike", "Свадьба", ""]);
assert.strictEqual(resolveAlias("Nike_final", r.aliases), "Клип Nike");
assert.strictEqual(resolveAlias("NIKE_FINAL", r.aliases), "Клип Nike");

// слияние: «Nike color» → «Клип Nike» (уже существует)
r = renameProject(r.sessions, r.aliases, "nike color", "Клип Nike");
assert.strictEqual(r.merged, true);
assert.strictEqual(r.sessions.filter((s) => s.project === "Клип Nike").length, 3);
assert.strictEqual(resolveAlias("Nike color", r.aliases), "Клип Nike");
assert.strictEqual(resolveAlias("Nike_final", r.aliases), "Клип Nike");

// цепочка: переименовали ещё раз — старые псевдонимы ведут в новое имя
r = renameProject(r.sessions, r.aliases, "клип nike", "Nike — рекламный ролик");
assert.strictEqual(resolveAlias("Nike_final", r.aliases), "Nike — рекламный ролик");
assert.strictEqual(resolveAlias("Nike color", r.aliases), "Nike — рекламный ролик");
assert.strictEqual(resolveAlias("Клип Nike", r.aliases), "Nike — рекламный ролик");
// новое имя не перенаправляется само на себя
assert.strictEqual(resolveAlias("Nike — рекламный ролик", r.aliases), "Nike — рекламный ролик");

// смена только регистра — без псевдонима-петли
r = renameProject(S, {}, "свадьба", "СВАДЬБА");
assert.strictEqual(r.sessions[3].project, "СВАДЬБА");
assert.strictEqual(resolveAlias("свадьба", r.aliases), "свадьба");

// «Без проекта» и пустое имя не трогаем
assert.strictEqual(renameProject(S, {}, "__none", "X").changed, 0);
assert.strictEqual(renameProject(S, {}, "свадьба", "  ").changed, 0);

// защита от петли в псевдонимах
assert.strictEqual(resolveAlias("a", { a: "b", b: "a" }), "a");

console.log("projects: все проверки пройдены");
