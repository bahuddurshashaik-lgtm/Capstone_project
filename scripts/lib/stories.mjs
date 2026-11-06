import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const STORIES_FILE = path.join(ROOT, 'docs', 'user-stories', 'user-stories.json');

const REQUIRED_FIELDS = ['id', 'title', 'persona', 'want', 'benefit', 'priority', 'acceptanceCriteria'];

export async function loadStories(file = STORIES_FILE) {
  const data = JSON.parse(await readFile(file, 'utf8'));
  validateStories(data);
  return data;
}

export function validateStories(data) {
  if (!data || !Array.isArray(data.stories) || data.stories.length === 0) {
    throw new Error('user-stories.json must contain a non-empty "stories" array');
  }
  const seen = new Set();
  for (const story of data.stories) {
    for (const field of REQUIRED_FIELDS) {
      if (!story[field] || (Array.isArray(story[field]) && story[field].length === 0)) {
        throw new Error(`Story ${story.id ?? '(no id)'} is missing "${field}"`);
      }
    }
    if (seen.has(story.id)) throw new Error(`Duplicate story id ${story.id}`);
    seen.add(story.id);
  }
}

export function storyStatement(story) {
  return `As a ${story.persona}, I want ${story.want} so that ${story.benefit}.`;
}

export function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function storyPageTitle(story) {
  return `${story.id}: ${story.title}`;
}

export function storyToStorageHtml(story) {
  const criteria = story.acceptanceCriteria.map((c) => `<li>${escapeHtml(c)}</li>`).join('');
  return [
    '<h2>User Story</h2>',
    `<p>${escapeHtml(storyStatement(story))}</p>`,
    `<p><strong>Priority:</strong> ${escapeHtml(story.priority)}</p>`,
    '<h2>Acceptance Criteria</h2>',
    `<ol>${criteria}</ol>`
  ].join('');
}

export function indexToStorageHtml(data) {
  const rows = data.stories
    .map(
      (s) =>
        `<tr><td>${escapeHtml(s.id)}</td><td>${escapeHtml(s.title)}</td><td>${escapeHtml(s.priority)}</td></tr>`
    )
    .join('');
  return (
    `<p>User stories for the ${escapeHtml(data.application)}.</p>` +
    `<table><tbody><tr><th>ID</th><th>Title</th><th>Priority</th></tr>${rows}</tbody></table>`
  );
}

export function storiesToMarkdown(data) {
  const lines = [`# ${data.application} - User Stories`, '', '> Generated from `user-stories.json`. Do not edit by hand.', ''];
  for (const s of data.stories) {
    lines.push(`## ${storyPageTitle(s)}`, '', storyStatement(s), '', `**Priority:** ${s.priority}`, '', '**Acceptance Criteria**', '');
    s.acceptanceCriteria.forEach((c, i) => lines.push(`${i + 1}. ${c}`));
    lines.push('');
  }
  return lines.join('\n');
}

export function htmlToText(html) {
  return html
    .replace(/<\/(p|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
