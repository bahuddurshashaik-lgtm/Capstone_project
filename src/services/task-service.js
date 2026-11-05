import { NotFoundError } from '../domain/errors.js';
import { systemClock, todayLocal } from '../domain/dates.js';
import { filterTasks, newestFirst } from '../domain/filters.js';
import { createTaskRecord, applyStatus, applyUpdate, isOverdue } from '../domain/task.js';
import {
  validateFilters,
  validateNewTask,
  validateStatus,
  validateTaskUpdate,
} from '../domain/validation.js';

const withOverdue = (task, today) => ({ ...task, overdue: isOverdue(task, today) });

const findTask = (tasks, id) => tasks.find((task) => task.id === id);

const replaceTask = (tasks, changed) => tasks.map((task) => (task.id === changed.id ? changed : task));

function requireTask(tasks, id) {
  const task = findTask(tasks, id);
  if (!task) throw new NotFoundError();
  return task;
}

export function createTaskService({ store, clock = systemClock, newId }) {
  const todayNow = () => todayLocal(clock);

  async function createTask(input) {
    const today = todayNow();
    const fields = validateNewTask(input, today);
    const record = createTaskRecord(fields, clock, newId);
    await store.mutate((tasks) => ({ tasks: [...tasks, record], result: record }));
    return withOverdue(record, today);
  }

  async function listTasks(query = new URLSearchParams()) {
    const filters = validateFilters(query);
    const all = await store.readAll();
    const today = todayNow();
    const matching = newestFirst(filterTasks(all, filters, today));
    return { tasks: matching.map((task) => withOverdue(task, today)), total: all.length };
  }

  async function getTask(id) {
    const task = requireTask(await store.readAll(), id);
    return withOverdue(task, todayNow());
  }

  function changeTask(id, makeChange) {
    return store.mutate((tasks) => {
      const existing = requireTask(tasks, id);
      const today = todayNow();
      const changed = makeChange(existing, today);
      if (changed === existing) return { tasks, result: withOverdue(existing, today) };
      return { tasks: replaceTask(tasks, changed), result: withOverdue(changed, today) };
    });
  }

  function updateTask(id, input) {
    return changeTask(id, (existing, today) =>
      applyUpdate(existing, validateTaskUpdate(input, existing, today)),
    );
  }

  function setStatus(id, input) {
    return changeTask(id, (existing) => applyStatus(existing, validateStatus(input), clock));
  }

  function deleteTask(id) {
    return store.mutate((tasks) => {
      const existing = requireTask(tasks, id);
      return { tasks: tasks.filter((task) => task !== existing), result: undefined };
    });
  }

  return { createTask, listTasks, getTask, updateTask, setStatus, deleteTask };
}
