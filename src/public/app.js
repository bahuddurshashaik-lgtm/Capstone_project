import { createApiClient } from './api-client.js';
import { describeError, describeTask, emptyStateMessage, listSummaryText } from './view-model.js';

// Task text is always written with textContent (NFR-1). This file never builds markup from strings.

const ELEMENT_IDS = Object.freeze({
  banner: 'banner',
  statusMessage: 'status-message',
  filterForm: 'filter-form',
  filterStatus: 'filter-status',
  filterPriority: 'filter-priority',
  filterOverdue: 'filter-overdue',
  clearFilters: 'clear-filters',
  listHeading: 'list-heading',
  taskCount: 'task-count',
  taskList: 'task-list',
  emptyState: 'empty-state',
});

export const UI_ELEMENT_IDS = Object.freeze(Object.values(ELEMENT_IDS));

let ui = null;
let api = null;

const state = {
  filters: { status: '', priority: '', overdue: false },
  tasksById: new Map(),
  refreshCount: 0,
};

// ---- DOM helpers ----

function requireElement(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`The page is missing the element #${id}.`);
  return element;
}

function locateElements() {
  const entries = Object.entries(ELEMENT_IDS).map(([name, id]) => [name, requireElement(id)]);
  return Object.fromEntries(entries);
}

function createElement(tagName, { className, text, attributes = {} } = {}) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  return element;
}

function findTaskItem(id) {
  return [...ui.taskList.children].find((item) => item.dataset.id === id) ?? null;
}

function focusTaskAction(id, action) {
  const item = findTaskItem(id);
  item?.querySelector(`button[data-action="${action}"]`)?.focus();
}

function currentTaskFocus() {
  const active = document.activeElement;
  if (!active || !ui.taskList.contains(active) || !active.dataset.action) return null;
  return { id: active.closest('li').dataset.id, action: active.dataset.action };
}

// ---- messages ----

function showMessage(text, { isError = false } = {}) {
  ui.statusMessage.textContent = text;
  ui.statusMessage.classList.toggle('is-error', isError);
}

function showBanner(text) {
  ui.banner.textContent = text;
  ui.banner.hidden = false;
}

function hideBanner() {
  ui.banner.textContent = '';
  ui.banner.hidden = true;
}

function reportError(error) {
  const info = describeError(error);
  if (info.display === 'banner') showBanner(info.text);
  else showMessage(info.text, { isError: true });
  return info.refresh ? refreshList() : undefined;
}

// ---- task list rendering ----

function buildBadge(cue) {
  const badge = createElement('span', { className: `badge badge-${cue.kind}` });
  badge.append(
    createElement('span', { text: cue.icon, attributes: { 'aria-hidden': 'true' } }),
    document.createTextNode(` ${cue.text}`),
  );
  return badge;
}

function buildTaskHeader(view) {
  const header = createElement('div', { className: 'task-header' });
  const titleClass = view.strikeThrough ? 'task-title is-struck' : 'task-title';
  header.append(createElement('h3', { className: titleClass, text: view.title }));
  if (view.cue) header.append(buildBadge(view.cue));
  return header;
}

function buildTaskMeta(view) {
  const list = createElement('ul', { className: 'task-meta' });
  for (const text of [view.priorityText, view.dueText, view.statusText]) {
    list.append(createElement('li', { text }));
  }
  return list;
}

function buildTaskItem(view) {
  const item = createElement('li', {
    className: `task task-${view.cue?.kind ?? 'open'}`,
    attributes: { 'data-id': view.id },
  });
  item.append(buildTaskHeader(view));
  if (view.description) item.append(createElement('p', { className: 'task-description', text: view.description }));
  item.append(buildTaskMeta(view));
  if (view.completedText) item.append(createElement('p', { className: 'task-completed-at', text: view.completedText }));
  return item;
}

function showEmptyState(text) {
  ui.emptyState.textContent = text ?? '';
  ui.emptyState.hidden = text === null;
}

function renderTasks(tasks, total) {
  const focused = currentTaskFocus();
  const fragment = document.createDocumentFragment();
  for (const task of tasks) fragment.append(buildTaskItem(describeTask(task)));
  state.tasksById = new Map(tasks.map((task) => [task.id, task]));
  ui.taskList.replaceChildren(fragment);
  ui.taskCount.textContent = listSummaryText(tasks.length, total);
  showEmptyState(tasks.length === 0 ? emptyStateMessage(total) : null);
  if (focused) focusTaskAction(focused.id, focused.action);
}

function isListResponse(data) {
  return Array.isArray(data?.tasks) && Number.isInteger(data.total);
}

async function refreshList() {
  const ticket = ++state.refreshCount;
  const result = await api.listTasks(state.filters);
  if (ticket !== state.refreshCount) return;
  if (!result.ok) {
    reportError(result.error);
    return;
  }
  if (!isListResponse(result.data)) {
    reportError({ code: 'UNEXPECTED_RESPONSE' });
    return;
  }
  hideBanner();
  renderTasks(result.data.tasks, result.data.total);
}

// ---- filters (FR-9..FR-15) ----

function readFilters() {
  return {
    status: ui.filterStatus.value,
    priority: ui.filterPriority.value,
    overdue: ui.filterOverdue.checked,
  };
}

function applyFilters() {
  state.filters = readFilters();
  return refreshList();
}

async function clearAllFilters() {
  ui.filterForm.reset();
  await applyFilters();
  showMessage('Filters cleared.');
}

// ---- start ----

function bindEvents() {
  ui.filterForm.addEventListener('submit', (event) => event.preventDefault());
  ui.filterForm.addEventListener('change', applyFilters);
  ui.clearFilters.addEventListener('click', clearAllFilters);
  window.addEventListener('focus', refreshList);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshList();
  });
}

async function startApp() {
  ui = locateElements();
  api = createApiClient();
  bindEvents();
  await refreshList();
}

if (typeof document !== 'undefined') startApp();
