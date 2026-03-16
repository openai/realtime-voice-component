import { spawn } from "node:child_process";
import process from "node:process";

const children = [];
let shuttingDown = false;

function spawnProcess(command, args, extraEnv = {}) {
  const child = spawn(command, args, {
    stdio: "inherit",
    env: {
      ...process.env,
      ...extraEnv
    }
  });

  children.push(child);

  child.on("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;

    for (const other of children) {
      if (other !== child && !other.killed) {
        other.kill("SIGTERM");
      }
    }

    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });

  return child;
}

function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) {
      child.kill(signal);
    }
  }
}

const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

spawnProcess(process.execPath, ["demo/token-server.mjs"]);
spawnProcess(pnpmCommand, ["exec", "vite", "--config", "demo/vite.config.ts"], {
  DEMO_TOKEN_ORIGIN: process.env.DEMO_TOKEN_ORIGIN ?? "http://localhost:3211"
});

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
