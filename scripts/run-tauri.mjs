import { spawn } from "node:child_process";
import path from "node:path";

const cargoBin = process.env.USERPROFILE
  ? path.join(process.env.USERPROFILE, ".cargo", "bin")
  : null;

const nextEnv = { ...process.env };
if (cargoBin) {
  nextEnv.PATH = nextEnv.PATH ? `${cargoBin}${path.delimiter}${nextEnv.PATH}` : cargoBin;
}

const command = process.platform === "win32" ? "tauri.cmd" : "tauri";
const args = process.argv.slice(2);

const child = spawn(command, args, {
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
