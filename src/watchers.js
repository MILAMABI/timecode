/*!
 * Рабочий таймкод (Timecode)
 * © 2026 MILAMABI. Все права защищены. Проприетарное ПО — см. LICENSE.
 * Копирование, изменение и распространение без разрешения автора запрещены.
 */
// Узнаём, какое окно сейчас активно, и (по возможности) какая страница открыта в Resolve.
// Без нативных модулей: на Mac — osascript, на Windows — один постоянный процесс PowerShell.
const { spawn, execFile } = require("child_process");
const fs = require("fs");
const path = require("path");

/* ---------------- активное окно ---------------- */

const MAC_SCRIPT = `
tell application "System Events"
  set p to first application process whose frontmost is true
  set n to name of p
  set t to ""
  try
    set t to name of front window of p
  end try
end tell
return n & "||" & t`;

const WIN_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text;
public class TcWin {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
}
"@
[Console]::OutputEncoding = [Text.Encoding]::UTF8
while ($true) {
  $h = [TcWin]::GetForegroundWindow()
  $sb = New-Object Text.StringBuilder 1024
  [void][TcWin]::GetWindowText($h, $sb, 1024)
  $procId = 0
  [void][TcWin]::GetWindowThreadProcessId($h, [ref]$procId)
  $name = ''
  try { $name = (Get-Process -Id $procId).ProcessName } catch {}
  $json = @{ app = $name; title = $sb.ToString() } | ConvertTo-Json -Compress
  [Console]::Out.WriteLine($json)
  [Console]::Out.Flush()
  Start-Sleep -Milliseconds 1500
}`;

class FrontWindow {
  constructor() {
    this.latest = { app: "", title: "", ok: true };
    this.proc = null;
    this.restartAt = 0;
  }

  /** Возвращает Promise<{app, title, ok}>. ok=false — нет доступа (на Mac). */
  read() {
    if (process.platform === "darwin") return this.readMac();
    if (process.platform === "win32") return Promise.resolve(this.readWin());
    return Promise.resolve({ app: "", title: "", ok: true });
  }

  readMac() {
    return new Promise((resolve) => {
      execFile("osascript", ["-e", MAC_SCRIPT], { timeout: 4000 }, (err, stdout) => {
        if (err) return resolve({ app: "", title: "", ok: false });
        const [app, ...rest] = String(stdout).trim().split("||");
        resolve({ app: app || "", title: rest.join("||"), ok: true });
      });
    });
  }

  readWin() {
    if (!this.proc && Date.now() >= this.restartAt) this.startWin();
    return this.latest;
  }

  startWin() {
    const encoded = Buffer.from(WIN_SCRIPT, "utf16le").toString("base64");
    const p = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded], {
      windowsHide: true,
    });
    this.proc = p;
    let buf = "";
    p.stdout.setEncoding("utf8");
    p.stdout.on("data", (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith("{")) continue;
        try {
          const j = JSON.parse(line);
          this.latest = { app: j.app || "", title: j.title || "", ok: true };
        } catch {}
      }
    });
    p.on("exit", () => {
      this.proc = null;
      this.restartAt = Date.now() + 10_000;
    });
    p.on("error", () => {
      this.proc = null;
      this.restartAt = Date.now() + 60_000;
    });
  }

  stop() {
    if (this.proc) this.proc.kill();
    this.proc = null;
  }
}

/* ---------------- DaVinci Resolve ---------------- */

function exists(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

// Ищем Python, не вызывая системных окон «установить инструменты разработчика».
function findPython() {
  return new Promise((resolve) => {
    if (process.platform === "darwin") {
      const brew = ["/opt/homebrew/bin/python3", "/usr/local/bin/python3"].find(exists);
      if (brew) return resolve(brew);
      execFile("xcode-select", ["-p"], { timeout: 3000 }, (err) => resolve(err ? null : exists("/usr/bin/python3") ? "/usr/bin/python3" : null));
    } else if (process.platform === "win32") {
      execFile("where", ["py"], { timeout: 3000 }, (err, out) => {
        if (!err && out.trim()) return resolve("py");
        execFile("where", ["python"], { timeout: 3000 }, (e2, o2) => {
          const first = !e2 && o2.split(/\r?\n/).find((l) => l.trim() && !/WindowsApps/i.test(l));
          resolve(first ? first.trim() : null);
        });
      });
    } else resolve(null);
  });
}

class ResolveHelper {
  constructor(helperPath) {
    this.helperPath = helperPath;
    this.proc = null;
    this.info = null;          // {page, project}
    this.status = "idle";      // idle | starting | ok | no_python | no_api | no_connect
    this.retryAt = 0;
    this.lastMsgAt = 0;
  }

  /** Вызывается, пока Resolve на переднем плане. Возвращает последние данные или null. */
  poke() {
    if (!this.proc && Date.now() >= this.retryAt) this.start();
    if (Date.now() - this.lastMsgAt > 10_000) return null;
    return this.status === "ok" ? this.info : null;
  }

  async start() {
    this.status = "starting";
    this.retryAt = Date.now() + 60_000;
    const py = await findPython();
    if (!py) { this.status = "no_python"; this.retryAt = Date.now() + 10 * 60_000; return; }
    const args = py === "py" ? ["-3", this.helperPath] : [this.helperPath];
    let p;
    try {
      p = spawn(py, args, { windowsHide: true });
    } catch { this.status = "no_python"; return; }
    this.proc = p;
    let buf = "";
    p.stdout.setEncoding("utf8");
    p.stdout.on("data", (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        try {
          const j = JSON.parse(line);
          this.lastMsgAt = Date.now();
          if (j.error) { this.status = j.error; this.info = null; }
          else { this.status = "ok"; this.info = { page: j.page || "", project: j.project || "" }; }
        } catch {}
      }
    });
    p.on("exit", () => { this.proc = null; });
    p.on("error", () => { this.proc = null; this.status = "no_python"; });
  }

  stop() {
    if (this.proc) this.proc.kill();
    this.proc = null;
  }
}

function resolveHelperPath(appIsPackaged, resourcesPath, dirname) {
  return appIsPackaged ? path.join(resourcesPath, "resolve_helper.py") : path.join(dirname, "..", "helpers", "resolve_helper.py");
}

module.exports = { FrontWindow, ResolveHelper, resolveHelperPath };
