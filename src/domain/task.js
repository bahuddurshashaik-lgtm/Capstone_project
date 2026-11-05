import { randomUUID } from 'node:crypto';
import { isBefore, systemClock } from './dates.js';

export const STATUS_OPEN = 'Open';
export const STATUS_COMPLETED = 'Completed';

const pickEditableFields = ({ title, description, priority, dueDate }) => ({
  title,
  description,
  priority,
  dueDate,
});

export function createTaskRecord(fields, clock = systemClock, newId = randomUUID) {
  return {
    id: newId(),
    ...pickEditableFields(fields),
    status: STATUS_OPEN,
    createdAt: clock().toISOString(),
    completedAt: null,
  };
}

export function applyUpdate(task, fields) {
  return { ...task, ...pickEditableFields(fields) };
}

export function applyStatus(task, status, clock = systemClock) {
  if (task.status === status) return task;
  const completedAt = status === STATUS_COMPLETED ? clock().toISOString() : null;
  return { ...task, status, completedAt };
}

export function isOverdue(task, today) {
  return task.status === STATUS_OPEN && task.dueDate !== null && isBefore(task.dueDate, today);
}
