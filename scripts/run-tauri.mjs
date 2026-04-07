import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");

const cargoBin = process.env.USERPROFILE
  ? path.join(process.env.USERPROFILE, ".cargo", "bin")
  : null;

const nextEnv = { ...process.env };
const nodeBin = path.dirname(process.execPath);
nextEnv.PATH = nextEnv.PATH ? `${nodeBin}${path.delimiter}${nextEnv.PATH}` : nodeBin;
if (cargoBin) {
  nextEnv.PATH = nextEnv.PATH ? `${cargoBin}${path.delimiter}${nextEnv.PATH}` : cargoBin;
}

const args = process.argv.slice(2);
const cmdPath = process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe";
const tauriCliWin = path.join(projectRoot, "node_modules", ".bin", "tauri.cmd");
const child =
  process.platform === "win32"
    ? spawn(cmdPath, ["/d", "/s", "/c", tauriCliWin, ...args], {
        stdio: "inherit",
        env: nextEnv,
        shell: false,
        windowsVerbatimArguments: true,
      })
    : spawn("tauri", args, {
        stdio: "inherit",
        env: nextEnv,
        shell: false,
      });

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
