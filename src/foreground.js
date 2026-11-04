// Su Windows: nome del programma in primo piano (per mostrare la ruota solo trascinando da Esplora risorse).
// Un PowerShell resta in ascolto: ogni riga ricevuta restituisce il nome del processo della finestra attiva.
const { spawn } = require('child_process');

const SCRIPT = `
$sig = '[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);'
Add-Type -MemberDefinition $sig -Name W -Namespace PZ
[Console]::Out.WriteLine('ready')
while (($l = [Console]::In.ReadLine()) -ne $null) {
  $h = [PZ.W]::GetForegroundWindow(); $p = 0; [void][PZ.W]::GetWindowThreadProcessId($h, [ref]$p)
  try { [Console]::Out.WriteLine((Get-Process -Id $p -ErrorAction Stop).ProcessName) } catch { [Console]::Out.WriteLine('?') }
}`;
const FILE_MANAGERS = ['explorer', 'totalcmd', 'totalcmd64', 'doublecmd', 'q-dir', 'xyplorer', 'onecommander', 'files', 'fpilot', 'directoryopus', 'dopus', 'progman', 'workerw'];

class Foreground {
  constructor() { this.ps = null; this.queue = []; this.ready = false; this.buf = ''; }
  start() {
    if (process.platform !== 'win32' || this.ps) return;
    try {
      this.ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', SCRIPT], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
      this.ps.stdout.on('data', d => { this.buf += d; let i; while ((i = this.buf.indexOf('\n')) >= 0) { const l = this.buf.slice(0, i).trim(); this.buf = this.buf.slice(i + 1); if (l === 'ready') this.ready = true; else { const w = this.queue.shift(); if (w) w(l.toLowerCase()); } } });
      this.ps.on('error', () => { this.ps = null; }); this.ps.on('close', () => { this.ps = null; this.ready = false; });
    } catch { this.ps = null; }
  }
  // true se il programma in primo piano è un gestore di file (o se non si può sapere)
  isFileManager(timeout = 180) {
    if (process.platform !== 'win32' || !this.ps || !this.ready) return Promise.resolve(true);
    return new Promise(res => {
      const t = setTimeout(() => res(true), timeout);
      this.queue.push(name => { clearTimeout(t); res(name === '?' || FILE_MANAGERS.includes(name)); });
      try { this.ps.stdin.write('q\n'); } catch { clearTimeout(t); res(true); }
    });
  }
  stop() { try { this.ps && this.ps.kill(); } catch { } this.ps = null; }
}
module.exports = { Foreground, FILE_MANAGERS };
