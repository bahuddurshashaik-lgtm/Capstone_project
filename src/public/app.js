import { createApiClient } from './api-client.js';
import { describeError, describeTask, emptyStateMessage, listSummaryText, toggleAction } from './view-model.js';

// Task text is always written with textContent (NFR-1). This file never builds markup from strings.

const ELEMENT_IDS = Object.freeze({
  banner: 'banner',
  statusMessage: 'status-message',
  taskForm: 'task-form',
  formHeading: 'form-heading',
  formError: 'form-error',
  submitButton: 'submit-button',
  cancelEditButton: 'cancel-edit-button',
  filterForm: 'filter-form',
  filterStatus: 'filter-status',
  filterPriority: 'filter-priority',
  filterOverdue: 'filter-overdue',
  clearFilters: 'clear-filters',
  listHeading: 'list-heading',
  taskCount: 'task-count',
  taskList: 'task-list',
  emptyState: 'empty-state',
  deleteDialog: 'delete-dialog',
  deleteTaskTitle: 'delete-task-title',
  deleteCancel: 'delete-cancel',
  deleteConfirm: 'delete-confirm',
});

const FIELD_NAMES = Object.freeze(['title', 'description', 'priority', 'dueDate']);
const errorIdFor = (name) => `${name}-error`;

export const UI_ELEMENT_IDS = Object.freeze([
  ...Object.values(ELEMENT_IDS),
  ...FIELD_NAMES,
  ...FIELD_NAMES.map(errorIdFor),
]);

let ui = null;
let api = null;

const state = {
  filters: { status: '', priority: '', overdue: false },
  tasksById: new Map(),
  refreshCount: 0,
  busy: false,
  editingId: null,
  deleteTargetId: null,
};

// ---- DOM helpers ----

function requireElement(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`The page is missing the element #${id}.`);
  return element;
}

function locateFields() {
  const entries = FIELD_NAMES.map((name) => [
    name,
    { input: requireElement(name), error: requireElement(errorIdFor(name)) },
  ]);
  return Object.fromEntries(entries);
}

function locateElements() {
  const entries = Object.entries(ELEMENT_IDS).map(([name, id]) => [name, requireElement(id)]);
  return { ...Object.fromEntries(entries), fields: locateFields() };
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

// A missing task closes the edit form for that task and refreshes the list (FR-21, FR-28, FR-32).
function handleTaskError(error, taskId) {
  if (describeError(error).refresh && state.editingId === taskId) leaveEditMode();
  return reportError(error);
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

function buildActionButton({ action, label, accessibleName }) {
  return createElement('button', {
    text: label,
    attributes: { type: 'button', 'data-action': action, 'aria-label': accessibleName },
  });
}

function buildTaskActions(view) {
  const actions = createElement('div', { className: 'task-actions' });
  actions.append(
    buildActionButton({ action: 'edit', label: 'Edit', accessibleName: `Edit: ${view.title}` }),
    buildActionButton({
      action: 'toggle',
      label: view.toggle.label,
      accessibleName: `${view.toggle.label}: ${view.title}`,
    }),
    buildActionButton({ action: 'delete', label: 'Delete', accessibleName: `Delete: ${view.title}` }),
  );
  return actions;
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
  item.append(buildTaskActions(view));
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

// ---- task form: create (FR-1, FR-2, FR-7, NFR-6) ----

function readFormInput() {
  const dueDate = ui.fields.dueDate.input.value;
  return {
    title: ui.fields.title.input.value,
    description: ui.fields.description.input.value,
    priority: ui.fields.priority.input.value,
    dueDate: dueDate === '' ? null : dueDate,
  };
}

function clearFieldErrors() {
  for (const { input, error } of Object.values(ui.fields)) {
    error.textContent = '';
    error.hidden = true;
    input.removeAttribute('aria-invalid');
    input.removeAttribute('aria-describedby');
  }
  ui.formError.textContent = '';
  ui.formError.hidden = true;
}

function markFieldInvalid({ input, error }, text) {
  error.textContent = text;
  error.hidden = false;
  input.setAttribute('aria-invalid', 'true');
  input.setAttribute('aria-describedby', error.id);
}

function showFormError(texts) {
  if (texts.length === 0) return;
  ui.formError.textContent = texts.join(' ');
  ui.formError.hidden = false;
}

function firstInvalidInput() {
  const invalid = FIELD_NAMES.map((name) => ui.fields[name]).find((field) => !field.error.hidden);
  return invalid?.input ?? null;
}

function showFieldErrors(fields) {
  const unplaced = [];
  for (const [name, text] of Object.entries(fields)) {
    if (Object.hasOwn(ui.fields, name) && typeof text === 'string') markFieldInvalid(ui.fields[name], text);
    else unplaced.push(String(text));
  }
  showFormError(unplaced);
  firstInvalidInput()?.focus();
}

function handleFormError(error, taskId = null) {
  if (describeError(error).display === 'fields') {
    showFieldErrors(error.fields);
    return undefined;
  }
  return handleTaskError(error, taskId);
}

async function submitCreate() {
  clearFieldErrors();
  const result = await api.createTask(readFormInput());
  if (!result.ok) {
    await handleFormError(result.error);
    return;
  }
  ui.taskForm.reset();
  showMessage('Task added.');
  await refreshList();
  ui.fields.title.input.focus();
}

// ---- task form: edit (FR-18..FR-22) ----

function fillForm(task) {
  ui.fields.title.input.value = task.title;
  ui.fields.description.input.value = task.description ?? '';
  ui.fields.priority.input.value = task.priority;
  ui.fields.dueDate.input.value = task.dueDate ?? '';
}

function enterEditMode(task) {
  clearFieldErrors();
  state.editingId = task.id;
  fillForm(task);
  ui.formHeading.textContent = 'Edit task';
  ui.submitButton.textContent = 'Save changes';
  ui.cancelEditButton.hidden = false;
  ui.fields.title.input.focus();
}

function leaveEditMode() {
  state.editingId = null;
  ui.taskForm.reset();
  clearFieldErrors();
  ui.formHeading.textContent = 'Add a task';
  ui.submitButton.textContent = 'Add task';
  ui.cancelEditButton.hidden = true;
}

async function startEdit(id) {
  const result = await api.getTask(id);
  if (!result.ok) {
    await handleTaskError(result.error, id);
    return;
  }
  enterEditMode(result.data);
}

function cancelEdit() {
  const id = state.editingId;
  leaveEditMode();
  showMessage('Edit cancelled. The task was not changed.');
  focusTaskAction(id, 'edit');
}

async function submitEdit() {
  clearFieldErrors();
  const id = state.editingId;
  const result = await api.updateTask(id, readFormInput());
  if (!result.ok) {
    await handleFormError(result.error, id);
    return;
  }
  leaveEditMode();
  showMessage('Task saved.');
  await refreshList();
  focusTaskAction(id, 'edit');
}

async function onFormSubmit(event) {
  event.preventDefault();
  if (state.busy) return;
  state.busy = true;
  ui.submitButton.disabled = true;
  try {
    await (state.editingId ? submitEdit() : submitCreate());
  } finally {
    state.busy = false;
    ui.submitButton.disabled = false;
  }
}

// ---- task actions ----

function focusListHeadingIfFocusLost() {
  const active = document.activeElement;
  if (!active || active === document.body) ui.listHeading.focus();
}

// The button sends the opposite of the status shown, so a repeated click is idempotent (FR-23, FR-26).
async function toggleTask(id) {
  const task = state.tasksById.get(id);
  if (!task) return;
  const result = await api.setStatus(id, toggleAction(task).nextStatus);
  if (!result.ok) {
    await handleTaskError(result.error, id);
    return;
  }
  showMessage(result.data.status === 'Completed' ? 'Task marked complete.' : 'Task reopened.');
  await refreshList();
  focusListHeadingIfFocusLost();
}

const TASK_ACTIONS = Object.freeze({
  edit: startEdit,
  toggle: toggleTask,
  delete: askDelete,
});

function onListClick(event) {
  const button = event.target.closest('button[data-action]');
  if (!button || !ui.taskList.contains(button)) return;
  const handler = TASK_ACTIONS[button.dataset.action];
  const id = button.closest('li')?.dataset.id;
  if (handler && id) handler(id, button);
}

// ---- delete with confirmation (FR-29..FR-32) ----

function askDelete(id) {
  const task = state.tasksById.get(id);
  if (!task) return;
  state.deleteTargetId = id;
  ui.deleteTaskTitle.textContent = task.title;
  ui.deleteDialog.showModal();
}

function cancelDelete() {
  ui.deleteDialog.close('cancel');
}

// The native dialog traps focus. When it closes, focus goes back to the button that opened it.
function onDeleteDialogClosed() {
  const id = state.deleteTargetId;
  state.deleteTargetId = null;
  if (id) focusTaskAction(id, 'delete');
}

async function runDelete(id) {
  const result = await api.deleteTask(id);
  if (!result.ok) {
    await handleTaskError(result.error, id);
    focusListHeadingIfFocusLost();
    return;
  }
  if (state.editingId === id) leaveEditMode();
  showMessage('Task deleted.');
  await refreshList();
  focusListHeadingIfFocusLost();
}

async function confirmDelete() {
  const id = state.deleteTargetId;
  ui.deleteDialog.close('confirm');
  if (id) await runDelete(id);
}

// ---- start ----

function bindEvents() {
  ui.taskForm.addEventListener('submit', onFormSubmit);
  ui.cancelEditButton.addEventListener('click', cancelEdit);
  ui.taskList.addEventListener('click', onListClick);
  ui.deleteCancel.addEventListener('click', cancelDelete);
  ui.deleteConfirm.addEventListener('click', confirmDelete);
  ui.deleteDialog.addEventListener('close', onDeleteDialogClosed);
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
