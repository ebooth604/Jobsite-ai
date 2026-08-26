/**
 * Builds the classifier Lambda bundle.
 *
 * Node, not bash, because this repo is developed on Windows and the previous
 * deploy runbook was a list of PowerShell incantations that a person had to get
 * right by hand — including the step everyone missed, deleting the `.d.ts` and
 * `.map` siblings of the files they meant to remove.
 *
 * What lands in the zip:
 *   handler.js + every compiled server module it imports
 *   client/upload-client.js   (served to the browser by router.ts)
 *   node_modules/             production dependencies only
 *   package.json              {"type":"module"} so Node reads the ESM
 *
 * What deliberately does not:
 *   server.js       the local dev entry point. It binds a port and would do
 *                   nothing useful in Lambda, so it is dropped rather than
 *                   shipped as dead weight next to a handler that matters.
 *   *.d.ts, *.map   type declarations and source maps are build artefacts, and
 *                   a source map in a bundle is a free map of your code.
 */

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const APP = join(ROOT, "apps", "trainer");
const DIST = join(ROOT, "dist");
const STAGE = join(DIST, "classifier");
const ZIP = join(DIST, "classifier.zip");

function run(command, args, cwd) {
  execFileSync(command, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
}

console.log("• compiling");
run("corepack", ["pnpm", "--filter", "@sitewireai/trainer", "run", "typecheck"], ROOT);

console.log("• staging");
rmSync(STAGE, { recursive: true, force: true });
rmSync(ZIP, { force: true });
mkdirSync(STAGE, { recursive: true });

cpSync(join(APP, "dist"), STAGE, { recursive: true });

// The local entry point and every build artefact. Walked recursively because
// `client/` has its own copies, which is exactly the step a hand-written `rm`
// misses.
function prune(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      prune(path);
    } else if (entry.endsWith(".d.ts") || entry.endsWith(".map") || entry === "server.js") {
      rmSync(path);
    }
  }
}
prune(STAGE);

if (!existsSync(join(STAGE, "handler.js"))) {
  throw new Error("handler.js is missing from the bundle — did the compile fail?");
}
if (!existsSync(join(STAGE, "client", "upload-client.js"))) {
  throw new Error("client/upload-client.js is missing — the upload page would 500.");
}

// `--type=module`: the compiled output is ESM, and without this Node in Lambda
// reads it as CommonJS and fails on the first `import` with a syntax error.
writeFileSync(join(STAGE, "package.json"), `${JSON.stringify({ type: "module" }, null, 2)}\n`);

console.log("• installing production dependencies");
// A fresh, isolated install rather than a copy of the workspace's linked
// node_modules: pnpm's store is a forest of symlinks, and a zip of symlinks
// unpacks in Lambda as broken files.
const manifest = JSON.parse(
  execFileSync("node", ["-e", "process.stdout.write(require('fs').readFileSync(process.argv[1],'utf8'))", join(APP, "package.json")], {
    encoding: "utf8",
  }),
);
writeFileSync(
  join(STAGE, "package.json"),
  `${JSON.stringify({ type: "module", dependencies: manifest.dependencies }, null, 2)}\n`,
);
run("npm", ["install", "--omit=dev", "--no-package-lock", "--silent"], STAGE);

console.log("• zipping");
run(
  "powershell",
  [
    "-NoProfile",
    "-Command",
    `Compress-Archive -Path '${STAGE}\\*' -DestinationPath '${ZIP}' -Force`,
  ],
  ROOT,
);

const size = (statSync(ZIP).size / 1024 / 1024).toFixed(1);
console.log(`✓ ${ZIP} (${size} MB)`);
if (Number(size) > 50) {
  console.warn("  ⚠ over 50 MB — Lambda's direct-upload limit. Publish via S3 instead.");
}
