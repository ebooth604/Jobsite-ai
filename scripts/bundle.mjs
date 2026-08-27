/**
 * Shared Lambda bundling.
 *
 * Both deployable apps are bundled the same way, and the way is fiddly enough
 * that having it written twice would guarantee the two drift. What is fiddly:
 *
 *   - **pnpm's `node_modules` is a forest of symlinks.** Zipping it produces
 *     broken files in Lambda, so production dependencies are installed fresh
 *     into the staging directory instead of copied.
 *
 *   - **`workspace:*` is not a version npm understands.** Since the classifier
 *     and the dashboard both grew workspace dependencies (`@sitewireai/db`,
 *     `@sitewireai/classify`), those entries are stripped from the manifest and
 *     the packages are vendored in by hand — their compiled `dist/` copied into
 *     `node_modules/@sitewireai/<name>/`. Leaving them in makes `npm install`
 *     fail with `Unsupported URL Type "workspace:"`, which is the error this
 *     function exists to make impossible to hit.
 *
 *   - **The output is ESM.** Without `{"type":"module"}` in the bundle's
 *     package.json, Node in Lambda reads it as CommonJS and dies on the first
 *     `import` with a syntax error that says nothing about the cause.
 *
 *   - **`.d.ts` and `.map` siblings** are build artefacts, and a source map in a
 *     deployed bundle is a free map of your code. They are pruned recursively,
 *     because `client/` has its own copies and that is the step a hand-written
 *     `rm` always misses.
 */

import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, "..");

function run(command, args, cwd) {
  execFileSync(command, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Recursively drops build artefacts and any named entry points. */
function prune(dir, dropFiles) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      prune(path, dropFiles);
    } else if (entry.endsWith(".d.ts") || entry.endsWith(".map") || dropFiles.includes(entry)) {
      rmSync(path);
    }
  }
}

/**
 * Copies one workspace package's compiled output into the bundle, recursing
 * into its own workspace dependencies.
 *
 * `@sitewireai/classify` depends on nothing local, but `@sitewireai/db` and the
 * apps do, and a package vendored without its own local dependencies fails at
 * import time in Lambda rather than at build time here.
 */
function vendor(pkgName, stageModules, seen) {
  if (seen.has(pkgName)) return {};
  seen.add(pkgName);

  const short = pkgName.replace("@sitewireai/", "");
  const source = join(ROOT, "packages", short);
  if (!existsSync(source)) {
    throw new Error(`workspace package ${pkgName} is not under packages/ — cannot vendor it`);
  }

  const manifest = readJson(join(source, "package.json"));
  const target = join(stageModules, "@sitewireai", short);
  mkdirSync(target, { recursive: true });

  const dist = join(source, "dist");
  if (!existsSync(dist)) {
    throw new Error(`${pkgName} has no dist/ — run the typecheck build first`);
  }
  cpSync(dist, join(target, "dist"), { recursive: true });
  prune(join(target, "dist"), []);

  // Its own manifest, minus the workspace links, which are vendored instead.
  const external = {};
  const nested = [];
  for (const [name, version] of Object.entries(manifest.dependencies ?? {})) {
    if (version.startsWith("workspace:")) nested.push(name);
    else external[name] = version;
  }
  writeFileSync(
    join(target, "package.json"),
    `${JSON.stringify({ ...manifest, dependencies: external }, null, 2)}\n`,
  );

  let collected = { ...external };
  for (const name of nested) {
    collected = { ...collected, ...vendor(name, stageModules, seen) };
  }
  return collected;
}

/**
 * Builds one app into a deployable zip.
 *
 * `checks` are paths that must exist in the finished bundle. They are asserted
 * rather than assumed because the failure they catch — a client script missing
 * from the zip — shows up in production as a 500 on one page and nowhere else.
 */
export function bundle({ app, name, filter, checks = [], drop = [] }) {
  const APP = join(ROOT, "apps", app);
  const DIST = join(ROOT, "dist");
  const STAGE = join(DIST, name);
  const ZIP = join(DIST, `${name}.zip`);

  console.log("• compiling");
  run("corepack", ["pnpm", "--filter", filter, "run", "typecheck"], ROOT);

  console.log("• staging");
  rmSync(STAGE, { recursive: true, force: true });
  rmSync(ZIP, { force: true });
  mkdirSync(STAGE, { recursive: true });
  cpSync(join(APP, "dist"), STAGE, { recursive: true });
  prune(STAGE, drop);

  for (const relative of checks) {
    if (!existsSync(join(STAGE, relative))) {
      throw new Error(`${relative} is missing from the bundle — did the compile fail?`);
    }
  }

  // Resolved before the install so the manifest can be written, but *copied*
  // after it. npm treats anything in `node_modules` that its manifest does not
  // name as extraneous and deletes it, so vendoring first silently produces a
  // zip with an empty `@sitewireai/` directory and a Lambda that dies on its
  // first import.
  const manifest = readJson(join(APP, "package.json"));
  const stageModules = join(STAGE, "node_modules");
  const workspaceDeps = Object.entries(manifest.dependencies ?? {})
    .filter(([, version]) => version.startsWith("workspace:"))
    .map(([dep]) => dep);

  console.log("• installing production dependencies");
  const external = {};
  for (const [dep, version] of Object.entries(manifest.dependencies ?? {})) {
    if (!version.startsWith("workspace:")) external[dep] = version;
  }
  // The workspace packages' own external dependencies have to be installed too,
  // and npm cannot learn about them from a vendored copy it deletes first.
  const probe = new Set();
  const probeDir = join(STAGE, ".probe");
  mkdirSync(probeDir, { recursive: true });
  for (const dep of workspaceDeps) Object.assign(external, vendor(dep, probeDir, probe));
  rmSync(probeDir, { recursive: true, force: true });

  writeFileSync(
    join(STAGE, "package.json"),
    `${JSON.stringify({ type: "module", dependencies: external }, null, 2)}\n`,
  );
  run("npm", ["install", "--omit=dev", "--no-package-lock", "--silent"], STAGE);

  console.log("• vendoring workspace packages");
  mkdirSync(stageModules, { recursive: true });
  const seen = new Set();
  for (const dep of workspaceDeps) vendor(dep, stageModules, seen);

  for (const dep of workspaceDeps) {
    const short = dep.replace("@sitewireai/", "");
    if (!existsSync(join(stageModules, "@sitewireai", short, "dist"))) {
      throw new Error(`${dep} did not survive into the bundle — the install pruned it`);
    }
  }

  console.log("• zipping");
  run(
    "powershell",
    ["-NoProfile", "-Command", `Compress-Archive -Path '${STAGE}\\*' -DestinationPath '${ZIP}' -Force`],
    ROOT,
  );

  const size = (statSync(ZIP).size / 1024 / 1024).toFixed(1);
  console.log(`✓ ${ZIP} (${size} MB)`);
  if (Number(size) > 50) {
    console.warn("  ⚠ over 50 MB — Lambda's direct-upload limit. Publish via S3 instead.");
  }
  return ZIP;
}
