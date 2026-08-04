#!/usr/bin/env node
/**
 * Validates data/projects.js before it can break the live site.
 *
 * A single stray quote or missing comma in that file stops the whole thing
 * parsing, which makes PROJECTS undefined and renders every project page
 * blank. This catches that, plus broken image paths, and reports the exact
 * line rather than leaving a silent blank page.
 *
 * Run locally:  node scripts/validate-projects.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data', 'projects.js');

const errors = [];
const warnings = [];

// ---- 1. Does it parse at all? ----
const source = fs.readFileSync(DATA, 'utf8');
let PROJECTS;
try {
  // `const PROJECTS = ...` creates a lexical binding that never appears on the
  // sandbox object, so read it from the script's completion value instead by
  // appending a trailing expression.
  const context = vm.createContext({});
  PROJECTS = new vm.Script(source + '\n;PROJECTS;', { filename: 'data/projects.js' })
    .runInContext(context);
} catch (err) {
  console.error('\n[31mdata/projects.js could not be parsed.[0m\n');
  console.error(err.stack ? err.stack.split('\n').slice(0, 6).join('\n') : String(err));
  console.error(
    '\nThis is almost always one of:\n' +
    "  - a missing closing quote, e.g.  alt: 'Some Text }   should be  alt: 'Some Text' }\n" +
    "  - a missing comma between two entries in a list\n" +
    "  - an apostrophe written as \"'\" instead of \\'  (say  PCB\\'s  or just  PCBs)\n"
  );
  process.exit(1);
}

// ---- 2. Is the shape right? ----
if (!Array.isArray(PROJECTS)) {
  console.error('PROJECTS is not an array.');
  process.exit(1);
}
if (PROJECTS.length === 0) errors.push('PROJECTS is empty.');

const seen = new Set();
PROJECTS.forEach((p, i) => {
  const where = `project #${i + 1} (${p && p.id ? p.id : 'no id'})`;

  for (const field of ['id', 'title', 'subtitle', 'thumbnail', 'categories']) {
    if (!p[field]) errors.push(`${where}: missing "${field}"`);
  }
  if (p.id) {
    if (seen.has(p.id)) errors.push(`${where}: duplicate id "${p.id}" (links will go to the wrong project)`);
    seen.add(p.id);
  }
  if (p.categories && !Array.isArray(p.categories)) {
    errors.push(`${where}: "categories" must be a list, e.g. ['coop']`);
  }
  if (p.images && !Array.isArray(p.images)) {
    errors.push(`${where}: "images" must be a list`);
  }
  (p.images || []).forEach((img, j) => {
    if (!img.src) errors.push(`${where}: image #${j + 1} has no "src"`);
    if (img.type && img.type !== 'video') {
      warnings.push(`${where}: image #${j + 1} has type "${img.type}" (only 'video' is understood)`);
    }
  });
});

// ---- 3. Do the referenced files exist? ----
const refs = new Set();
PROJECTS.forEach(p => {
  if (p.thumbnail) refs.add(p.thumbnail);
  (p.images || []).forEach(img => {
    if (img.src) refs.add(img.src);
    if (img.poster) refs.add(img.poster);
  });
});

[...refs].sort().forEach(ref => {
  const full = path.join(ROOT, ref);
  if (fs.existsSync(full)) return;

  // A case-only mismatch works on macOS but 404s on GitHub Pages, so call it out
  const dir = path.join(ROOT, path.dirname(ref));
  const base = path.basename(ref);
  if (fs.existsSync(dir)) {
    const hit = fs.readdirSync(dir).find(f => f.toLowerCase() === base.toLowerCase());
    if (hit) {
      errors.push(`${ref} does not exist, but "${hit}" does. Filenames are case sensitive on GitHub Pages.`);
      return;
    }
  }
  if (/\.(mp4|webm|mov)$/i.test(ref)) {
    warnings.push(`${ref} is missing. The carousel will skip past it after a few seconds.`);
  } else {
    errors.push(`${ref} is referenced but no such file exists.`);
  }
});

// ---- Report ----
warnings.forEach(w => console.log(`[33mwarning[0m  ${w}`));

if (errors.length) {
  console.error(`\n[31m${errors.length} problem(s) found in data/projects.js:[0m\n`);
  errors.forEach(e => console.error(`  - ${e}`));
  console.error('');
  process.exit(1);
}

console.log(
  `[32mprojects.js is valid.[0m ` +
  `${PROJECTS.length} projects, ${refs.size} media references checked` +
  (warnings.length ? `, ${warnings.length} warning(s)` : '') + '.'
);
