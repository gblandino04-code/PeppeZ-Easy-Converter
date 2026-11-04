// Su Windows: rilevamento continuo della finestra attiva e protezione giochi.
// Un processo PowerShell in background verifica lo stato della finestra e rileva se e
// in esecuzione un gioco o un'app a schermo intero per non interferire mai.
const { spawn } = require('child_process');

const SCRIPT = `
Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Runtime.InteropServices;

public class WinTracker {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
  [DllImport("shell32.dll")] public static extern int SHQueryUserNotificationState(out int pquns);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")] public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int nIndex);

  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left, Top, Right, Bottom; }

  public static string Query() {
    try {
      IntPtr h = GetForegroundWindow();
      if (h == IntPtr.Zero) return "idle|1|0";

      uint pid = 0;
      GetWindowThreadProcessId(h, out pid);

      StringBuilder sb = new StringBuilder(256);
      GetClassName(h, sb, 256);
      string cls = sb.ToString();

      RECT r;
      GetWindowRect(h, out r);
      int sw = GetSystemMetrics(0);
      int sh = GetSystemMetrics(1);

      bool isDesktop = (cls == "Progman" || cls == "WorkerW" || cls == "Shell_TrayWnd" || cls == "Shell_SecondaryTrayWnd");
      int w = r.Right - r.Left;
      int ht = r.Bottom - r.Top;
      bool isFullscreen = !isDesktop && (w >= sw) && (ht >= sh);

      string pName = "";
      string pPath = "";
      try {
        var proc = System.Diagnostics.Process.GetProcessById((int)pid);
        pName = proc.ProcessName.ToLower();
        try { pPath = proc.MainModule.FileName.ToLower(); } catch {}
      } catch {}

      bool isFileManager = isDesktop || cls == "CabinetWClass" || cls == "#32770" ||
        pName == "explorer" || pName == "totalcmd" || pName == "totalcmd64" || pName == "doublecmd" ||
        pName == "q-dir" || pName == "xyplorer" || pName == "onecommander" || pName == "files" ||
        pName == "directoryopus" || pName == "dopus";

      int quns = 0;
      SHQueryUserNotificationState(out quns);
      bool isD3d = (quns == 2);

      string[] gamePaths = new string[] {
        "\\\\steamapps\\\\", "\\\\epic games\\\\", "\\\\riot games\\\\", "\\\\ubisoft\\\\",
        "\\\\battle.net\\\\", "\\\\gog galaxy\\\\", "\\\\xboxgames\\\\", "\\\\games\\\\", "\\\\origin games\\\\"
      };
      bool inGameDir = false;
      foreach (var gp in gamePaths) {
        if (pPath.Contains(gp)) { inGameDir = true; break; }
      }

      string[] gameExes = new string[] {
        "steam", "steamwebhelper", "epicgameslauncher", "riotclientservices", "battle.net", "origin", "eadestktop", "galaxyclient", "upc",
        "valorant", "leagueclient", "leagueclientux", "csgo", "cs2", "dota2", "fortniteclient-win64-shipping", "fortnite",
        "r5apex", "genshinimpact", "starrail", "gta5", "minecraft", "javaw", "robloxplayerbeta", "destiny2", "rainbowsix", "rocketleague",
        "tslgame", "escapefromtarkov", "eldenring", "cyberpunk2077", "overwatch", "fifa", "fc24", "fc25", "callofduty", "cod"
      };
      bool isKnownGame = false;
      foreach (var ge in gameExes) {
        if (pName == ge) { isKnownGame = true; break; }
      }

      bool isGame = !isFileManager && (isD3d || isFullscreen || inGameDir || isKnownGame);

      return pName + "|" + (isFileManager ? "1" : "0") + "|" + (isGame ? "1" : "0");
    } catch {
      return "err|1|0";
    }
  }
}
"@
[Console]::Out.WriteLine('ready')
while ($true) {
  $res = [WinTracker]::Query()
  [Console]::Out.WriteLine($res)
  Start-Sleep -Milliseconds 200
}
`;

const FILE_MANAGERS = ['explorer', 'totalcmd', 'totalcmd64', 'doublecmd', 'q-dir', 'xyplorer', 'onecommander', 'files', 'fpilot', 'directoryopus', 'dopus', 'progman', 'workerw'];

class Foreground {
  constructor() {
    this.ps = null;
    this.ready = false;
    this.buf = '';
    this.state = { process: '', isFileManager: true, isGame: false };
  }
  start() {
    if (process.platform !== 'win32' || this.ps) return;
    try {
      this.ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', SCRIPT], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
      this.ps.stdout.on('data', d => {
        this.buf += d.toString();
        let i;
        while ((i = this.buf.indexOf('\n')) >= 0) {
          const l = this.buf.slice(0, i).trim();
          this.buf = this.buf.slice(i + 1);
          if (l === 'ready') {
            this.ready = true;
          } else if (l.includes('|')) {
            const [proc, fm, game] = l.split('|');
            this.state = {
              process: proc || '',
              isFileManager: fm === '1',
              isGame: game === '1'
            };
          }
        }
      });
      this.ps.on('error', () => { this.ps = null; });
      this.ps.on('close', () => { this.ps = null; this.ready = false; });
    } catch { this.ps = null; }
  }
  // Ritorna istantaneamente true se una partita o app a schermo intero e attiva
  isGameActive() {
    return this.state.isGame;
  }
  // Ritorna istantaneamente true se il programma attivo e un gestore file o desktop
  isFileManagerActive() {
    return this.state.isFileManager;
  }
  isFileManager() {
    return Promise.resolve(this.state.isFileManager);
  }
  getCurrentProcess() {
    return this.state.process;
  }
  stop() {
    try { this.ps && this.ps.kill(); } catch { }
    this.ps = null;
  }
}

module.exports = { Foreground, FILE_MANAGERS };
