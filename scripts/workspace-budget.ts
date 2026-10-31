import { readdir, lstat } from "node:fs/promises";
import path from "node:path";
import { projectRoot } from "./test-support";
const root = path.resolve(Bun.argv[2] || projectRoot);
const excluded = new Set(
  ".arena .cache .local .mypy_cache .next .nox .npm .nuxt .output .parcel-cache .playwright-cli .pytest_cache .ruff_cache .svelte-kit .tox .turbo .venv .vite __pycache__ build coverage dist node_modules out target".split(
    " ",
  ),
);
const files: Array<{ file: string; bytes: number }> = [];
async function walk(directory: string) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!excluded.has(entry.name)) await walk(absolute);
    } else if (!/\/(?:\.git\/(?:config|credentials)|\.git-credentials|\.netrc)$/.test(absolute)) {
      files.push({ file: path.relative(root, absolute), bytes: (await lstat(absolute)).size });
    }
  }
}
await walk(root);
const bytes = files.reduce((sum, file) => sum + file.bytes, 0);
console.log(
  JSON.stringify(
    {
      root,
      eligibleMiB: Number((bytes / 1048576).toFixed(2)),
      files: files.length,
      headroomGuardMiB: 100,
      platformApproximateLimitMiB: 128,
      largest: files.sort((a, b) => b.bytes - a.bytes).slice(0, 10),
    },
    null,
    2,
  ),
);
if (bytes > 100 * 1048576 || files.length > 9000) process.exitCode = 1;
