#!/usr/bin/env node
/*
 * build-patch.js — builds a patched ZCode Desktop app.asar from your own
 * locally installed copy.
 *
 *   node build/build-patch.js [--resources "C:\Program Files\ZCode\resources"]
 *
 * Steps:
 *   1. Extract the installed app.asar into .work/extracted
 *   2. Copy patch/rtl-patch.js + rtl-patch.css into the renderer assets
 *   3. Inject the stylesheet/script references into out/renderer/index.html
 *   4. Repack into dist/app-patched.asar, keeping the same native modules
 *      unpacked as the original archive
 *   5. Verify the three patched files round-trip byte-identically
 *
 * The patched archive stays on your machine; nothing from the app is
 * redistributed.
 */
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
function arg(flag, fallback) {
  const i = args.indexOf(flag);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : fallback;
}

const RESOURCES = arg('--resources', 'C:\\Program Files\\ZCode\\resources');
const ASAR = path.join(RESOURCES, 'app.asar');
const PROJ = path.dirname(__dirname);
const PATCH_DIR = path.join(PROJ, 'patch');
const WORK = path.join(PROJ, '.work');
const EXTRACTED = path.join(WORK, 'extracted');
const DIST = path.join(PROJ, 'dist');
const OUT_ASAR = path.join(DIST, 'app-patched.asar');

function die(msg) {
  console.error('\n[BUILD FAILED] ' + msg);
  process.exit(1);
}
function step(n, msg) {
  console.log(`\n[${n}/6] ${msg}`);
}

if (!fs.existsSync(ASAR)) {
  die(`ZCode app.asar not found at:\n  ${ASAR}\n` +
      'If ZCode is installed elsewhere, pass:\n' +
      '  node build/build-patch.js --resources "D:\\Apps\\ZCode\\resources"');
}
if (!fs.existsSync(path.join(PATCH_DIR, 'rtl-patch.js'))) {
  die('patch/rtl-patch.js is missing from this repository.');
}

step(1, 'Extracting the installed app.asar (this takes a minute)...');
fs.rmSync(WORK, { recursive: true, force: true });
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
execSync(`npx --yes @electron/asar extract "${ASAR}" "${EXTRACTED}"`, {
  stdio: 'inherit'
});

const rendererDir = path.join(EXTRACTED, 'out', 'renderer');
const assetsDir = path.join(rendererDir, 'assets');
const indexHtmlPath = path.join(rendererDir, 'index.html');
if (!fs.existsSync(indexHtmlPath)) {
  die('Unexpected app layout: out/renderer/index.html not found. ' +
      'This ZCode version is probably not compatible with the patch.');
}

step(2, 'Copying patch files into the renderer assets...');
fs.copyFileSync(path.join(PATCH_DIR, 'rtl-patch.js'), path.join(assetsDir, 'rtl-patch.js'));
fs.copyFileSync(path.join(PATCH_DIR, 'rtl-patch.css'), path.join(assetsDir, 'rtl-patch.css'));

step(3, 'Injecting the patch into index.html...');
const INJECT_MARKER = 'ZCode RTL Patch';
let html = fs.readFileSync(indexHtmlPath, 'utf8');
if (html.includes('assets/rtl-patch.css')) {
  console.log('  already injected, skipping.');
} else {
  const block =
    `    <!-- ${INJECT_MARKER}: auto direction for Arabic/Persian/Hebrew text.\n` +
    '         Loaded after the app stylesheet so its rules win. -->\n' +
    '    <link rel="stylesheet" href="./assets/rtl-patch.css" />\n' +
    '    <script src="./assets/rtl-patch.js"></script>\n';
  const headEnd = html.indexOf('</head>');
  if (headEnd === -1) die('index.html has no </head> — unexpected layout.');
  html = html.slice(0, headEnd) + block + html.slice(headEnd);
  fs.writeFileSync(indexHtmlPath, html);
  console.log('  injected before </head>.');
}

step(4, 'Reading the original archive header (native modules to keep unpacked)...');
// asar header: [4B pickle][4B headerSize][4B][4B jsonLen][json]
const fd = fs.openSync(ASAR, 'r');
const pre = Buffer.alloc(16);
fs.readSync(fd, pre, 0, 16, 0);
const jsonLen = pre.readUInt32LE(12);
const jsonBuf = Buffer.alloc(jsonLen);
fs.readSync(fd, jsonBuf, 0, jsonLen, 16);
fs.closeSync(fd);
const header = JSON.parse(jsonBuf.toString('utf8'));
const unpacked = [];
(function walk(node, prefix) {
  for (const [name, child] of Object.entries(node.files || {})) {
    const rel = prefix ? prefix + '/' + name : name;
    if (child.files) walk(child, rel);
    else if (child.unpacked) unpacked.push('**/' + rel);
  }
})(header, '');
console.log(`  ${unpacked.length} native files stay unpacked.`);

step(5, 'Repacking into dist/app-patched.asar (this takes a couple of minutes)...');
const glob = '{' + unpacked.join(',') + '}';
execSync(
  `npx --yes @electron/asar pack "${EXTRACTED}" "${OUT_ASAR}" --unpack="${glob}"`,
  { stdio: 'inherit' }
);

step(6, 'Verifying the patched files inside the new archive...');
function extractFile(rel, cwd) {
  fs.mkdirSync(cwd, { recursive: true });
  execSync(
    `npx --yes @electron/asar extract-file "${OUT_ASAR}" "${rel.split('/').join('\\')}"`,
    { cwd, stdio: 'pipe' }
  );
  const name = rel.split('/').pop();
  return fs.readFileSync(path.join(cwd, name));
}
const checks = [
  ['out/renderer/index.html', html],
  ['out/renderer/assets/rtl-patch.js',
    fs.readFileSync(path.join(PATCH_DIR, 'rtl-patch.js'))],
  ['out/renderer/assets/rtl-patch.css',
    fs.readFileSync(path.join(PATCH_DIR, 'rtl-patch.css'))]
];
let ok = true;
for (const [rel, expected] of checks) {
  const actual = extractFile(rel, path.join(WORK, 'verify', rel.replace(/[\\/]/g, '__')));
  const same = Buffer.compare(actual, Buffer.from(expected)) === 0;
  console.log(`  ${same ? 'OK     ' : 'DIFFERS'} ${rel}`);
  ok = ok && same;
}
fs.rmSync(WORK, { recursive: true, force: true });
if (!ok) die('Round-trip verification failed.');

const size = fs.statSync(OUT_ASAR).size;
console.log(`
=============================================
 [OK] Built: dist/app-patched.asar (${size} bytes)
 Original: ${ASAR} (${fs.statSync(ASAR).size} bytes)
 (size difference is normal: @electron/asar deduplicates
  identical files when packing)

 Next: run install.cmd to install it.
=============================================
`);
