import fs from "node:fs";
import path from "node:path";

declare global {
  var __workspaceEnvLoaded: boolean | undefined;
}

function loadWorkspaceEnvFiles() {
  const visited = new Set<string>();
  let currentDir = process.cwd();

  while (!visited.has(currentDir)) {
    visited.add(currentDir);

    const envPath = path.join(currentDir, ".env");
    if (fs.existsSync(envPath)) {
      process.loadEnvFile(envPath);
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }

    currentDir = parentDir;
  }
}

if (!globalThis.__workspaceEnvLoaded) {
  loadWorkspaceEnvFiles();
  globalThis.__workspaceEnvLoaded = true;
}

export {};
