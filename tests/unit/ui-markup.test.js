import { test } from 'node:test';
import assert from 'node:assert/strict';
import fsPromises from 'node:fs/promises';
import { STATIC_PATHS } from '../../src/http/static-files.js';

const PUBLIC_DIRECTORY = new URL('../../src/public/', import.meta.url);

const html = await fsPromises.readFile(new URL('index.html', PUBLIC_DIRECTORY), 'utf8');
const css = await fsPromises.readFile(new URL('styles.css', PUBLIC_DIRECTORY), 'utf8');

// ---- small HTML helpers (the page is static and simple, so no parser dependency) ----

function parseAttributes(text) {
  const attributes = {};
  for (const [, name, value] of text.matchAll(/([a-zA-Z][\w:-]*)(?:\s*=\s*"([^"]*)")?/g)) {
    attributes[name.toLowerCase()] = value ?? '';
  }
  return attributes;
}

function openingTags(tagName) {
  const pattern = new RegExp(`<${tagName}(\\s[^>]*)?>`, 'gi');
  return [...html.matchAll(pattern)].map((match) => parseAttributes(match[1] ?? ''));
}

const findById = (tagName, id) => openingTags(tagName).find((attributes) => attributes.id === id);

const allIds = () => [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);

// ---- contrast helpers (NFR-8) ----

const FIELD_NAMES = ['title', 'description', 'priority', 'dueDate'];

function colorVariables() {
  const variables = {};
  for (const [, name, value] of css.matchAll(/--(color-[\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    variables[name] = value;
  }
  return variables;
}

function luminance(hex) {
  const [red, green, blue] = [1, 3, 5].map((start) => {
    const channel = parseInt(hex.slice(start, start + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(first, second) {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

// ---- document basics ----

test('the page declares language, charset, title and viewport', () => {
  assert.match(html, /^<!doctype html>/i);
  assert.equal(openingTags('html')[0].lang, 'en');
  assert.equal(openingTags('meta')[0].charset, 'utf-8');
  assert.ok(openingTags('meta').some((meta) => meta.name === 'viewport'));
  assert.match(html, /<title>To Do<\/title>/);
});

test('ids are unique', () => {
  const ids = allIds();
  assert.equal(new Set(ids).size, ids.length);
});

test('every src and href points to an allow-listed file', () => {
  const targets = [...html.matchAll(/\s(?:src|href)="([^"]*)"/g)].map((match) => match[1]);
  assert.ok(targets.length >= 2);
  for (const target of targets) assert.ok(STATIC_PATHS.includes(target), target);
});

// ---- form (FR-2, A-6, AD-3, AD-14) ----

test('the task form and the filter form use novalidate', () => {
  assert.ok('novalidate' in findById('form', 'task-form'));
  assert.ok('novalidate' in findById('form', 'filter-form'));
});

test('the date input has no min, so an unchanged past date can be saved', () => {
  const dueDate = findById('input', 'dueDate');
  assert.equal(dueDate.type, 'date');
  assert.equal('min' in dueDate, false);
});

test('no control has maxlength; the server error is shown instead', () => {
  assert.doesNotMatch(html, /maxlength/i);
});

test('the priority select offers Low, Medium and High with Medium preselected', () => {
  const options = [...html.matchAll(/<option([^>]*)>([^<]*)<\/option>/g)];
  const priorityBlock = html.slice(html.indexOf('id="priority"'), html.indexOf('id="priority-error"'));
  const inBlock = [...priorityBlock.matchAll(/<option([^>]*)>([^<]*)<\/option>/g)];
  assert.ok(options.length > inBlock.length);
  assert.deepEqual(inBlock.map((match) => match[2]), ['Low', 'Medium', 'High']);
  const selected = inBlock.filter((match) => 'selected' in parseAttributes(match[1]));
  assert.deepEqual(selected.map((match) => match[2]), ['Medium']);
});

test('the filter bar has status, priority and overdue controls and a clear button', () => {
  assert.ok(findById('select', 'filter-status'));
  assert.ok(findById('select', 'filter-priority'));
  assert.equal(findById('input', 'filter-overdue').type, 'checkbox');
  assert.equal(findById('button', 'clear-filters').type, 'button');
});

test('every input, select and textarea has a label that points to it', () => {
  const labelTargets = new Set(openingTags('label').map((label) => label.for));
  const controls = [...openingTags('input'), ...openingTags('select'), ...openingTags('textarea')];
  assert.ok(controls.length >= 7);
  for (const control of controls) {
    assert.ok(control.id, 'a control has no id');
    assert.ok(labelTargets.has(control.id), `no label for #${control.id}`);
  }
});

test('every button has an explicit type', () => {
  const buttons = openingTags('button');
  assert.ok(buttons.length >= 5);
  for (const button of buttons) assert.match(button.type ?? '', /^(button|submit)$/, button.id);
});

test('each form field has a hidden alert paragraph for its error', () => {
  for (const name of FIELD_NAMES) {
    const error = findById('p', `${name}-error`);
    assert.ok(error, name);
    assert.equal(error.role, 'alert', name);
    assert.ok('hidden' in error, name);
  }
  assert.equal(findById('p', 'form-error').role, 'alert');
});

// ---- messages, list and dialog (FR-17, FR-29, NFR-7) ----

test('the page has a polite live region and a banner area', () => {
  assert.equal(findById('p', 'status-message')['aria-live'], 'polite');
  const banner = findById('div', 'banner');
  assert.equal(banner.role, 'alert');
  assert.ok('hidden' in banner);
});

test('the page has a list, an empty-state area and a focusable list heading', () => {
  assert.ok(findById('ul', 'task-list'));
  assert.ok('hidden' in findById('p', 'empty-state'));
  assert.equal(findById('h2', 'list-heading').tabindex, '-1');
});

test('the confirmation dialog is a named native dialog with Cancel and Delete buttons', () => {
  const dialog = findById('dialog', 'delete-dialog');
  assert.ok(dialog);
  assert.ok(allIds().includes(dialog['aria-labelledby']));
  assert.ok(allIds().includes(dialog['aria-describedby']));
  assert.equal(findById('button', 'delete-cancel').type, 'button');
  assert.equal(findById('button', 'delete-confirm').type, 'button');
});

// ---- no inline code (NFR-1, CSP architecture 6.3) ----

test('no inline style attribute, style element, event handler or javascript URL', () => {
  assert.doesNotMatch(html, /\sstyle\s*=/i);
  assert.doesNotMatch(html, /<style[\s>]/i);
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
  assert.doesNotMatch(html, /javascript:/i);
});

test('the only script is the external module /app.js and it has no body', () => {
  const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)];
  assert.equal(scripts.length, 1);
  const attributes = parseAttributes(scripts[0][1]);
  assert.equal(attributes.src, '/app.js');
  assert.equal(attributes.type, 'module');
  assert.equal(scripts[0][2].trim(), '');
});

test('the stylesheet has no import and no external URL', () => {
  assert.doesNotMatch(css, /@import/i);
  assert.doesNotMatch(css, /url\(/i);
  assert.doesNotMatch(css, /https?:\/\//i);
});

// ---- styles (NFR-7, NFR-8) ----

test('the stylesheet defines a visible :focus-visible outline', () => {
  assert.match(css, /:focus-visible\s*\{[^}]*outline:\s*3px solid/);
});

test('the stylesheet hides elements with the hidden attribute', () => {
  assert.match(css, /\[hidden\]\s*\{[^}]*display:\s*none/);
});

test('the stylesheet styles overdue and completed tasks and struck-through titles', () => {
  for (const selector of ['.task-overdue', '.task-completed', '.task-title.is-struck', '.badge-overdue', '.badge-completed']) {
    assert.ok(css.includes(selector), selector);
  }
  assert.match(css, /\.is-struck\s*\{[^}]*line-through/);
});

test('every text colour pair has a contrast ratio of at least 4.5:1', () => {
  const colors = colorVariables();
  const textPairs = [
    ['text', 'bg'], ['text', 'surface'], ['text', 'overdue-bg'], ['text', 'completed-bg'],
    ['muted', 'bg'], ['muted', 'surface'], ['muted', 'overdue-bg'], ['muted', 'completed-bg'],
    ['on-primary', 'primary'], ['on-danger', 'danger'],
    ['error', 'surface'], ['error', 'bg'],
    ['overdue-text', 'overdue-bg'], ['completed-text', 'completed-bg'],
  ];
  for (const [foreground, background] of textPairs) {
    const ratio = contrastRatio(colors[`color-${foreground}`], colors[`color-${background}`]);
    assert.ok(ratio >= 4.5, `${foreground} on ${background} is ${ratio.toFixed(2)}:1`);
  }
});

test('borders and the focus outline have a contrast ratio of at least 3:1 on the surface', () => {
  const colors = colorVariables();
  for (const name of ['border', 'focus']) {
    const ratio = contrastRatio(colors[`color-${name}`], colors['color-surface']);
    assert.ok(ratio >= 3, `${name} is ${ratio.toFixed(2)}:1`);
  }
});
