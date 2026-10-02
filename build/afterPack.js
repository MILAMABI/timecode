/*!
 * Playhead
 * © 2026 MILAMABI. Все права защищены. Проприетарное ПО — см. LICENSE.
 */
// Подпись приложения на Mac без сертификата Apple (ad-hoc).
// 1) Без подписи macOS считает скачанное приложение «повреждённым».
// 2) Обычная ad-hoc подпись привязана к хешу файлов, и после каждого обновления macOS
//    забывает выданные разрешения («Универсальный доступ», «Автоматизация»).
//    Поэтому внешнему приложению задаём постоянное требование «это app.timecode.tracker» —
//    оно одинаковое у всех версий, и разрешения переживают обновления.
const { execFileSync } = require("child_process");
const path = require("path");

const BUNDLE_ID = "app.timecode.tracker";

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  // вложенные помощники Electron — обычной ad-hoc подписью
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], { stdio: "inherit" });
  // само приложение — с постоянным требованием
  execFileSync("codesign", ["--force", "--sign", "-", "--identifier", BUNDLE_ID,
    "-r=designated => identifier \"" + BUNDLE_ID + "\"", app], { stdio: "inherit" });
  execFileSync("codesign", ["--verify", "--deep", "--strict", "--verbose=2", app], { stdio: "inherit" });
  execFileSync("codesign", ["-d", "-r-", app], { stdio: "inherit" });
};
