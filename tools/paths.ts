// Cross-OS resolution of SuperWhisper's data directory.
// SuperWhisper ships on macOS and Windows (Linux may come later). On both
// current platforms it stores under ~/Documents/superwhisper. Override with
// SUPERWHISPER_DIR for relocated Documents folders (e.g. OneDrive on Windows).
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function superwhisperDir(): string {
  if (process.env.SUPERWHISPER_DIR) return process.env.SUPERWHISPER_DIR;
  const p = process.platform;
  if (p === "darwin" || p === "win32") {
    return join(homedir(), "Documents", "superwhisper");
  }
  throw new Error(
    `SuperWhisper is only on macOS and Windows — not "${p}". ` +
      `Set SUPERWHISPER_DIR to point at its data folder if you have one.`,
  );
}

export const modesDir = () => join(superwhisperDir(), "modes");
export const recordingsDir = () => join(superwhisperDir(), "recordings");

// True when running inside a `bun build --compile` standalone binary, where
// module files live in a virtual FS and there is no repo checkout.
export const isCompiled = () => import.meta.url.includes("$bunfs");

// Directory to read/write a module's own data files. In the repo this is the
// module's folder; in a compiled binary (no repo) it falls back to the cwd.
export function moduleDir(moduleUrl: string): string {
  const dir = dirname(fileURLToPath(moduleUrl));
  if (dir.includes("$bunfs") || !existsSync(dir)) return process.cwd();
  return dir;
}
