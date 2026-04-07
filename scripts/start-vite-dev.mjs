import { execFile, spawn } from "node:child_process";
import net from "node:net";

const PORT = 1420;
const IS_WINDOWS = process.platform === "win32";
const NPM_COMMAND = IS_WINDOWS ? "npm.cmd" : "npm";
const TASKKILL_COMMAND = IS_WINDOWS ? "taskkill.exe" : "taskkill";

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket
      .once("connect", () => {
        socket.destroy();
        resolve(true);
      })
      .once("error", () => resolve(false))
      .connect(port, "127.0.0.1");
  });
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = IS_WINDOWS
      ? spawn("cmd.exe", ["/d", "/s", "/c", [command, ...args].join(" ")], {
          stdio: "inherit",
          shell: false,
        })
      : spawn(command, args, {
          stdio: "inherit",
          shell: false,
        });
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code ?? "unknown"}`));
    });
    child.once("error", reject);
  });
}

function execText(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { encoding: "utf8" }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

async function getListeningPid(port) {
  const output = await execText("netstat", ["-ano", "-p", "tcp"]);
  const line = output
    .split(/\r?\n/)
    .find((entry) => entry.includes(`:${port}`) && entry.includes("LISTENING"));

  if (!line) return null;

  const parts = line.trim().split(/\s+/);
  const pid = Number(parts.at(-1));
  return Number.isFinite(pid) ? pid : null;
}

if (await isPortOpen(PORT)) {
  const pid = await getListeningPid(PORT);
  if (pid) {
    await run(TASKKILL_COMMAND, ["/PID", `${pid}`, "/F"]).catch(() => {});
  }
}

await run(NPM_COMMAND, ["run", "dev"]);
