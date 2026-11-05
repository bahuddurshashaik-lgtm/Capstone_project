import { ValidationError } from './errors.js';
import { isBefore, isValidCalendarDate } from './dates.js';

export const TITLE_MAX_LENGTH = 100;
export const DESCRIPTION_MAX_LENGTH = 500;
export const PRIORITIES = Object.freeze(['Low', 'Medium', 'High']);
export const DEFAULT_PRIORITY = 'Medium';
export const STATUSES = Object.freeze(['Open', 'Completed']);

const FILTER_VALUES = Object.freeze({
  status: STATUSES,
  priority: PRIORITIES,
  overdue: Object.freeze(['true']),
});

export const MESSAGES = Object.freeze({
  invalidValue: 'Enter a valid value.',
  titleRequired: 'Enter a title.',
  titleTooLong: `Title must be ${TITLE_MAX_LENGTH} characters or fewer.`,
  descriptionTooLong: `Description must be ${DESCRIPTION_MAX_LENGTH} characters or fewer.`,
  priority: 'Choose Low, Medium or High.',
  invalidDate: 'Enter a valid date.',
  pastDate: 'Due date cannot be in the past.',
  unknownField: 'Unknown field.',
  required: 'This field is required.',
  status: 'Choose Open or Completed.',
  invalidFilter: 'Invalid filter value.',
});

const EDITABLE_KEYS = Object.freeze(['title', 'description', 'priority', 'dueDate']);

const valid = (value) => ({ value });
const invalid = (error) => ({ error });

export function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function codePointLength(text) {
  return Array.from(text).length;
}

export function parseTitle(value) {
  if (typeof value !== 'string') return invalid(MESSAGES.invalidValue);
  const title = value.trim();
  if (title.length === 0) return invalid(MESSAGES.titleRequired);
  if (codePointLength(title) > TITLE_MAX_LENGTH) return invalid(MESSAGES.titleTooLong);
  return valid(title);
}

export function parseDescription(value) {
  if (typeof value !== 'string') return invalid(MESSAGES.invalidValue);
  if (codePointLength(value) > DESCRIPTION_MAX_LENGTH) return invalid(MESSAGES.descriptionTooLong);
  return valid(value);
}

export function parsePriority(value) {
  if (typeof value !== 'string') return invalid(MESSAGES.invalidValue);
  if (!PRIORITIES.includes(value)) return invalid(MESSAGES.priority);
  return valid(value);
}

export function parseDueDate(value) {
  if (value === null) return valid(null);
  if (typeof value !== 'string') return invalid(MESSAGES.invalidValue);
  if (!isValidCalendarDate(value)) return invalid(MESSAGES.invalidDate);
  return valid(value);
}

const FIELD_PARSERS = Object.freeze({
  title: parseTitle,
  description: parseDescription,
  priority: parsePriority,
  dueDate: parseDueDate,
});

const NEW_TASK_MISSING = Object.freeze({
  title: invalid(MESSAGES.titleRequired),
  description: valid(''),
  priority: valid(DEFAULT_PRIORITY),
  dueDate: valid(null),
});

const UPDATE_MISSING = Object.freeze({
  title: invalid(MESSAGES.required),
  description: invalid(MESSAGES.required),
  priority: invalid(MESSAGES.required),
  dueDate: invalid(MESSAGES.required),
});

function newErrorMap() {
  return Object.create(null);
}

function throwIfAny(errors) {
  if (Object.keys(errors).length > 0) throw new ValidationError(errors);
}

export function requirePlainObject(input) {
  if (!isPlainObject(input)) throw new ValidationError({ body: MESSAGES.invalidValue });
}

export function flagUnknownKeys(input, allowedKeys, errors) {
  for (const key of Object.keys(input)) {
    if (!allowedKeys.includes(key)) errors[key] = MESSAGES.unknownField;
  }
}

function readField(input, key) {
  return Object.hasOwn(input, key) ? input[key] : undefined;
}

function parseField(input, key, missingRule) {
  const raw = readField(input, key);
  return raw === undefined ? missingRule[key] : FIELD_PARSERS[key](raw);
}

function isPastAndChanged(dueDate, today, previousDueDate) {
  return dueDate !== null && dueDate !== previousDueDate && isBefore(dueDate, today);
}

function validateEditableFields(input, { today, missingRule, previousDueDate }) {
  requirePlainObject(input);
  const errors = newErrorMap();
  flagUnknownKeys(input, EDITABLE_KEYS, errors);
  const values = {};
  for (const key of EDITABLE_KEYS) {
    const result = parseField(input, key, missingRule);
    if ('error' in result) errors[key] = result.error;
    else values[key] = result.value;
  }
  if (!errors.dueDate && isPastAndChanged(values.dueDate, today, previousDueDate)) {
    errors.dueDate = MESSAGES.pastDate;
  }
  throwIfAny(errors);
  return values;
}

export function validateNewTask(input, today) {
  return validateEditableFields(input, {
    today,
    missingRule: NEW_TASK_MISSING,
    previousDueDate: null,
  });
}

export function validateTaskUpdate(input, existingTask, today) {
  return validateEditableFields(input, {
    today,
    missingRule: UPDATE_MISSING,
    previousDueDate: existingTask.dueDate,
  });
}

export function parseStatus(value) {
  if (!STATUSES.includes(value)) return invalid(MESSAGES.status);
  return valid(value);
}

export function validateStatus(input) {
  requirePlainObject(input);
  const errors = newErrorMap();
  flagUnknownKeys(input, ['status'], errors);
  const result = parseStatus(readField(input, 'status'));
  if ('error' in result) errors.status = result.error;
  throwIfAny(errors);
  return result.value;
}

function readSingleQueryValue(query, name) {
  const values = query.getAll(name);
  if (values.length > 1) return invalid(MESSAGES.invalidFilter);
  return valid(values[0] ?? '');
}

function parseFilterValue(query, name, allowedValues) {
  const single = readSingleQueryValue(query, name);
  if ('error' in single) return single;
  if (single.value === '') return valid(null);
  if (!allowedValues.includes(single.value)) return invalid(MESSAGES.invalidFilter);
  return valid(single.value);
}

export function validateFilters(query) {
  const errors = newErrorMap();
  const allowedNames = Object.keys(FILTER_VALUES);
  for (const name of new Set(query.keys())) {
    if (!allowedNames.includes(name)) errors[name] = MESSAGES.unknownField;
  }
  const filters = {};
  for (const name of allowedNames) {
    const result = parseFilterValue(query, name, FILTER_VALUES[name]);
    if ('error' in result) errors[name] = result.error;
    else filters[name] = result.value;
  }
  throwIfAny(errors);
  return { status: filters.status, priority: filters.priority, overdue: filters.overdue === 'true' };
}
