import { isOverdue } from './task.js';

const isSet = (filterValue) => filterValue !== null && filterValue !== undefined;

function matchesFilters(task, { status, priority, overdue }, today) {
  if (isSet(status) && task.status !== status) return false;
  if (isSet(priority) && task.priority !== priority) return false;
  if (overdue === true && !isOverdue(task, today)) return false;
  return true;
}

export function filterTasks(tasks, filters, today) {
  return tasks.filter((task) => matchesFilters(task, filters, today));
}

export function newestFirst(tasksInCreationOrder) {
  return [...tasksInCreationOrder].reverse();
}
