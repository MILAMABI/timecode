/*!
 * Рабочий таймкод (Timecode)
 * © 2026 MILAMABI. Все права защищены. Проприетарное ПО — см. LICENSE.
 * Копирование, изменение и распространение без разрешения автора запрещены.
 */
// Переименование и объединение проектов. Чистые функции над состоянием.
//   aliases: { "старое имя в нижнем регистре": "Новое имя" } — чтобы будущие сессии
//   из файла со старым именем сразу попадали в нужный проект.

const keyOf = (name) => String(name || "").trim().toLowerCase();

/** Имя проекта с учётом псевдонимов (цепочки тоже разворачиваются). */
function resolveAlias(name, aliases) {
  let cur = String(name || "").trim();
  const seen = new Set();
  while (cur && aliases && aliases[keyOf(cur)] && !seen.has(keyOf(cur))) {
    seen.add(keyOf(cur));
    cur = aliases[keyOf(cur)];
  }
  return cur;
}

/**
 * Переименовать проект fromKey в toName. Если toName совпадает с другим проектом — это слияние.
 * Возвращает { sessions, aliases, changed, merged }.
 */
function renameProject(sessions, aliases, fromKey, toName) {
  const to = String(toName || "").trim().slice(0, 80);
  const from = String(fromKey || "");
  if (!to || !from || from === "__none") return { sessions, aliases, changed: 0, merged: false };
  const merged = keyOf(to) !== from && sessions.some((s) => keyOf(s.project) === keyOf(to));
  let changed = 0;
  const next = sessions.map((s) => {
    if (keyOf(s.project) !== from) return s;
    changed++;
    return { ...s, project: to };
  });
  const al = { ...(aliases || {}) };
  if (keyOf(to) !== from) {
    al[from] = to;
    // старые псевдонимы, которые вели в from, теперь ведут в to
    for (const k of Object.keys(al)) if (keyOf(al[k]) === from) al[k] = to;
  }
  delete al[keyOf(to)]; // новое имя само по себе не перенаправляется
  return { sessions: next, aliases: al, changed, merged };
}

module.exports = { keyOf, resolveAlias, renameProject };
