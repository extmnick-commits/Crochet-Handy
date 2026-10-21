/**
 * expo-modules-autolinking skips checking the starting directory when it is a
 * Windows drive root (e.g. SUBST X: -> repo). Gradle uses X:\ as the autolinking
 * working directory, so package.json walk-up never runs and settings.gradle fails.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const autolinkingRoot = path.join(repoRoot, 'node_modules', 'expo-modules-autolinking', 'build');

if (!fs.existsSync(autolinkingRoot)) {
  process.exit(0);
}

const marker = 'CROCHET_HANDY_WIN_DRIVE_ROOT_PATCH';

const loopBefore = `for (let dir = root; path_1.default.dirname(dir) !== dir; dir = path_1.default.dirname(dir)) {
        const file = path_1.default.resolve(dir, 'package.json');
        if (fs_1.default.existsSync(file)) {
            return file;
        }
    }`;

const loopAfter = `// ${marker}
    for (let dir = root; ; dir = path_1.default.dirname(dir)) {
        const file = path_1.default.resolve(dir, 'package.json');
        if (fs_1.default.existsSync(file)) {
            return file;
        }
        if (path_1.default.dirname(dir) === dir) {
            break;
        }
    }`;

const loopBeforeCwd = `for (let dir = cwd; path_1.default.dirname(dir) !== dir; dir = path_1.default.dirname(dir)) {
        const file = path_1.default.resolve(dir, 'package.json');
        if (fs_1.default.existsSync(file)) {
            return file;
        }
    }`;

const loopAfterCwd = `// ${marker}
    for (let dir = cwd; ; dir = path_1.default.dirname(dir)) {
        const file = path_1.default.resolve(dir, 'package.json');
        if (fs_1.default.existsSync(file)) {
            return file;
        }
        if (path_1.default.dirname(dir) === dir) {
            break;
        }
    }`;

function patchFile(filePath, before, after) {
  if (!fs.existsSync(filePath)) {
    return false;
  }
  const contents = fs.readFileSync(filePath, 'utf8');
  if (contents.includes(marker)) {
    return false;
  }
  if (!contents.includes(before)) {
    console.warn(
      `patch-expo-autolinking-win-drive-root: pattern not found in ${path.basename(filePath)}; skip`,
    );
    return false;
  }
  fs.writeFileSync(filePath, contents.replace(before, after));
  return true;
}

let changed = false;
changed =
  patchFile(
    path.join(autolinkingRoot, 'commands', 'autolinkingOptions.js'),
    loopBefore,
    loopAfter,
  ) || changed;
changed =
  patchFile(path.join(autolinkingRoot, 'exports.js'), loopBeforeCwd, loopAfterCwd) || changed;

if (changed) {
  console.log('Patched expo-modules-autolinking for Windows SUBST drive roots.');
}
