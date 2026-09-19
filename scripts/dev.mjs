import { spawn } from "node:child_process";

const children = new Set();
let shuttingDown = false;

function npmCommand(script) {
  if (process.platform === "win32") {
    return {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", `npm run ${script}`],
    };
  }

  return {
    command: "npm",
    args: ["run", script],
  };
}

function prefixStream(stream, label, output) {
  let buffer = "";
  stream.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) output.write(`[${label}] ${line}\n`);
    }
  });
  stream.on("end", () => {
    if (buffer.trim()) output.write(`[${label}] ${buffer}\n`);
  });
}

function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;

  if (process.platform === "win32") {
    spawn("cmd.exe", ["/d", "/s", "/c", `taskkill /pid ${child.pid} /T /F`], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }

  child.kill("SIGTERM");
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) stopChild(child);
  setTimeout(() => process.exit(code), 500).unref();
}

function run(label, script) {
  const { command, args } = npmCommand(script);
  const child = spawn(command, args, {
    env: { ...process.env, FORCE_COLOR: "1" },
    stdio: ["inherit", "pipe", "pipe"],
    windowsHide: true,
  });

  children.add(child);
  prefixStream(child.stdout, label, process.stdout);
  prefixStream(child.stderr, label, process.stderr);

  child.on("exit", (code, signal) => {
    children.delete(child);
    if (!shuttingDown) {
      const reason = signal ? `signal ${signal}` : `code ${code ?? 0}`;
      console.error(`[dev] ${label} stopped with ${reason}`);
      shutdown(code ?? 1);
    }
  });

  return child;
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

async function waitForBackend() {
  const backendUrl =
    process.env.VITE_BACKEND_URL ||
    process.env.BACKEND_URL ||
    `http://127.0.0.1:${process.env.PORT || "4000"}`;
  const healthUrl = `${backendUrl.replace(/\/$/, "")}/api/health`;
  const timeoutMs = Number(process.env.DEV_BACKEND_WAIT_MS || 20_000);
  const startedAt = Date.now();

  while (!shuttingDown && Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(healthUrl, { signal: AbortSignal.timeout(750) });
      if (response.ok) return true;
    } catch {
      // Backend is still booting.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  return false;
}

async function main() {
  run("api", "dev:backend");
  const backendReady = await waitForBackend();
  if (!backendReady && !shuttingDown) {
    console.error("[dev] Backend health check did not become ready; starting frontend anyway.");
  }
  if (!shuttingDown) run("web", "dev:frontend");
}

main().catch((error) => {
  console.error("[dev] Failed to start dev servers", error);
  shutdown(1);
});
