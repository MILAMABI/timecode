const assert = require("assert");
const F = require("../src/focus");
const M = F.MIN;

let st = { focus: { phase: "idle" }, pause: null, breaks: [] };

// фокус-блок на 50 минут
st = F.startFocus(st, 0, 50);
assert.deepStrictEqual(F.due(st, 49 * M), []);
assert.deepStrictEqual(F.due(st, 50 * M), ["focusDone"]);
st = F.markFocusDone(st, 50 * M);
assert.strictEqual(st.focus.phase, "done");
assert.deepStrictEqual(F.due(st, 60 * M), []); // уведомление только один раз

// перерыв на 10 минут после блока: фокус сбрасывается, ручной таймер запоминается
st = F.startPause(st, 51 * M, 10, { cat: "color", project: "Nike" });
assert.strictEqual(st.focus.phase, "idle");
assert.strictEqual(st.pause.endsAt, 61 * M);
assert.strictEqual(st.pause.resumeCat, "color");

// +5 минут
st = F.extendPause(st, 55 * M, 5);
assert.strictEqual(st.pause.endsAt, 66 * M);
assert.deepStrictEqual(F.due(st, 65 * M), []);
assert.deepStrictEqual(F.due(st, 66 * M), ["breakDone"]);

// возврат к работе: перерыв в истории, этап для продолжения
let r = F.resume(st, 66 * M);
assert.strictEqual(r.state.pause, null);
assert.strictEqual(r.resumeCat, "color");
assert.strictEqual(r.resumeProject, "Nike");
assert.deepStrictEqual(r.state.breaks, [{ start: 51 * M, end: 66 * M }]);
assert.strictEqual(F.breakTotal(r.state.breaks), 15 * M);
assert.strictEqual(F.breakTotal(r.state.breaks, 60 * M), 0);

// пауза без таймера не срабатывает сама; повторная пауза без минут ничего не меняет
st = F.startPause(r.state, 100 * M, null, null);
assert.strictEqual(st.pause.endsAt, null);
assert.deepStrictEqual(F.due(st, 1000 * M), []);
assert.strictEqual(F.startPause(st, 101 * M, null, null), st);
// а с минутами — превращается в перерыв с таймером
assert.strictEqual(F.startPause(st, 101 * M, 5, null).pause.endsAt, 106 * M);

// мгновенная пауза (<30 c) не засоряет историю
r = F.resume(F.startPause({ breaks: [] }, 0, null, null), 10_000);
assert.deepStrictEqual(r.state.breaks, []);

console.log("focus: все проверки пройдены");
