/**
 * Removes the .ps1 wrapper that npm creates on Windows.
 * PowerShell has execution policy restrictions on .ps1 files.
 * The .cmd wrapper (which npm also creates) works fine in PowerShell
 * without any policy changes — so we just remove the .ps1.
 */
import { unlinkSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

if (process.platform !== "win32") process.exit(0);

try {
  const prefix = execSync("npm config get prefix", { encoding: "utf8" }).trim();
  const ps1 = join(prefix, "beehive.ps1");
  unlinkSync(ps1);
  console.log("  beehive: removed PowerShell wrapper (not needed — .cmd works fine)");
} catch {
  // File doesn't exist or prefix not found — nothing to do
}
