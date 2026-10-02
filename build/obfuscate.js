/*!
 * Playhead
 * © 2026 MILAMABI. Все права защищены. Проприетарное ПО — см. LICENSE.
 */
// Запутывает JS перед упаковкой. Запускается только в сборке (CI), исходники в репозитории остаются читаемыми.
const fs = require("fs");
const path = require("path");
const JavaScriptObfuscator = require("javascript-obfuscator");

const root = path.join(__dirname, "..");
const pkg = require(path.join(root, "package.json"));
const BANNER =
  `/*! Playhead v${pkg.version} · © 2026 MILAMABI. Все права защищены.\n` +
  ` * Проприетарное ПО. Копирование, изменение, декомпиляция и распространение без разрешения автора запрещены. */\n`;

const common = {
  compact: true,
  identifierNamesGenerator: "hexadecimal",
  renameGlobals: false,          // не трогаем имена, на которые ссылается Electron и HTML
  stringArray: true,
  stringArrayEncoding: ["base64"],
  stringArrayThreshold: 0.75,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  splitStrings: false,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.4,
  deadCodeInjection: false,
  numbersToExpressions: true,
  simplify: true,
  transformObjectKeys: false,    // ключи — это формат данных и IPC, их не меняем
  selfDefending: false,          // ломает код при форматировании, не используем
  debugProtection: false,
  disableConsoleOutput: false,
  unicodeEscapeSequence: false,
  sourceMap: false,
};

const files = [
  ...fs.readdirSync(path.join(root, "src")).filter((f) => f.endsWith(".js")).map((f) => ["src/" + f, "node"]),
  ...fs.readdirSync(path.join(root, "renderer")).filter((f) => f.endsWith(".js")).map((f) => ["renderer/" + f, "browser"]),
];

for (const [rel, target] of files) {
  const file = path.join(root, rel);
  const src = fs.readFileSync(file, "utf8");
  const out = JavaScriptObfuscator.obfuscate(src, { ...common, target }).getObfuscatedCode();
  fs.writeFileSync(file, BANNER + out);
  console.log(`запутан ${rel}: ${src.length} → ${out.length} байт`);
}
