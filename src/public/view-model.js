// Pure display helpers for the UI. No DOM access, so every function can run in Node.
// The server decides what "overdue" means; this module only reads the `overdue` flag.

export const OPEN = 'Open';
export const COMPLETED = 'Completed';

export const NOT_FOUND_TEXT = 'Task not found';
export const GENERIC_ERROR_TEXT = 'Something went wrong. Try again.';
export const CORRUPT_STORE_TEXT =
  'Your task file cannot be read. It was not changed. Fix, move or delete the file, then reload this page.';
export const WRITE_FAILED_TEXT = 'Your change could not be saved. Nothing was changed. Try again.';

export const EMPTY_LIST_TEXT = 'No tasks yet';
export const NO_MATCH_TEXT = 'No tasks match your filters';

export const OVERDUE_CUE = Object.freeze({ kind: 'overdue', text: 'Overdue', icon: '\u26A0' });
export const COMPLETED_CUE = Object.freeze({ kind: 'completed', text: 'Completed', icon: '\u2714' });

const DATE_TIME_FORMAT = Object.freeze({ dateStyle: 'medium', timeStyle: 'short' });

// ---- task display ----

export function statusCue(task) {
  if (task.status === COMPLETED) return COMPLETED_CUE;
  if (task.overdue === true) return OVERDUE_CUE;
  return null;
}

export function formatCompletedAt(completedAt, { locale, timeZone } = {}) {
  if (typeof completedAt !== 'string') return null;
  const date = new Date(completedAt);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale, { ...DATE_TIME_FORMAT, timeZone }).format(date);
}

export function dueDateText(dueDate) {
  return typeof dueDate === 'string' && dueDate !== '' ? `Due ${dueDate}` : 'No due date';
}

export function toggleAction(task) {
  return task.status === COMPLETED
    ? { label: 'Reopen', nextStatus: OPEN }
    : { label: 'Mark complete', nextStatus: COMPLETED };
}

function completedLine(task, formatOptions) {
  if (task.status !== COMPLETED) return null;
  const formatted = formatCompletedAt(task.completedAt, formatOptions);
  return formatted ? `Completed on ${formatted}` : null;
}

export function describeTask(task, formatOptions = {}) {
  const cue = statusCue(task);
  return {
    id: task.id,
    title: task.title,
    description: typeof task.description === 'string' ? task.description : '',
    priorityText: `Priority: ${task.priority}`,
    dueText: dueDateText(task.dueDate),
    statusText: `Status: ${task.status}`,
    cue,
    strikeThrough: cue?.kind === COMPLETED_CUE.kind,
    completedText: completedLine(task, formatOptions),
    toggle: toggleAction(task),
  };
}

// ---- list summary ----

export function emptyStateMessage(total) {
  return Number(total) > 0 ? NO_MATCH_TEXT : EMPTY_LIST_TEXT;
}

export function listSummaryText(shown, total) {
  return `Showing ${shown} of ${total} ${total === 1 ? 'task' : 'tasks'}`;
}

// ---- errors ----

const hasFields = (error) =>
  typeof error?.fields === 'object' && error.fields !== null && Object.keys(error.fields).length > 0;

const serverTextOr = (error, fallback) =>
  typeof error?.message === 'string' && error.message.trim() !== '' ? error.message : fallback;

const bannerError = (error, fallback) => ({ text: serverTextOr(error, fallback), display: 'banner', refresh: false });

const messageError = (text, refresh = false) => ({ text, display: 'message', refresh });

/**
 * Turns a structured API error ({ code, message, fields }) into what the UI should show.
 * display: 'banner' (persistent), 'message' (live region) or 'fields' (next to the form fields).
 * refresh: the list should be reloaded after showing the text.
 */
export function describeError(error) {
  switch (error?.code) {
    case 'NOT_FOUND':
      return messageError(NOT_FOUND_TEXT, true);
    case 'STORE_CORRUPT':
      return bannerError(error, CORRUPT_STORE_TEXT);
    case 'STORE_WRITE_FAILED':
      return bannerError(error, WRITE_FAILED_TEXT);
    case 'VALIDATION_ERROR':
      return hasFields(error)
        ? { text: serverTextOr(error, GENERIC_ERROR_TEXT), display: 'fields', refresh: false }
        : messageError(serverTextOr(error, GENERIC_ERROR_TEXT));
    default:
      return messageError(GENERIC_ERROR_TEXT);
  }
}
