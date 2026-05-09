import { spawn } from "node:child_process";
import { platform } from "node:os";

/**
 * Open a native folder picker on the gateway machine. Returns selected path,
 * or null if cancelled.
 */
export async function pickFolder(title = "Pick a folder"): Promise<string | null> {
  const os = platform();
  if (os === "darwin") return pickMac(title);
  if (os === "win32") return pickWin(title);
  return pickLinux(title);
}

function pickMac(title: string): Promise<string | null> {
  const script = `POSIX path of (choose folder with prompt "${title.replace(/"/g, '\\"')}")`;
  return runOnce("osascript", ["-e", script]);
}

function pickWin(title: string): Promise<string | null> {
  const ps = `
Add-Type -AssemblyName System.Windows.Forms
$f = New-Object System.Windows.Forms.FolderBrowserDialog
$f.Description = "${title.replace(/"/g, '`"')}"
$f.ShowNewFolderButton = $true
if ($f.ShowDialog() -eq 'OK') { Write-Output $f.SelectedPath }
`.trim();
  return runOnce("powershell", ["-NoProfile", "-NonInteractive", "-Command", ps]);
}

async function pickLinux(title: string): Promise<string | null> {
  const tools: Array<[string, string[]]> = [
    ["zenity", ["--file-selection", "--directory", "--title", title]],
    ["kdialog", ["--getexistingdirectory", "."]],
  ];
  for (const [cmd, args] of tools) {
    const out = await runOnce(cmd, args);
    if (out !== null) return out;
  }
  return null;
}

function runOnce(cmd: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, { shell: false, windowsHide: true });
    } catch {
      resolve(null);
      return;
    }
    let out = "";
    child.stdout?.on("data", (c) => {
      out += c.toString();
    });
    child.on("error", () => resolve(null));
    child.on("close", (code) => {
      const trimmed = out.trim();
      if (code === 0 && trimmed) resolve(trimmed);
      else resolve(null);
    });
  });
}
