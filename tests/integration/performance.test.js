import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { startTestServer } from '../helpers/start-test-server.js';

const NOW = new Date(2026, 10, 5, 12, 0, 0);
const clock = () => new Date(NOW);
const SEEDED_COUNT = 1000;
const REPETITIONS = 20;
const WRITE_BUDGET_MS = 200;
const READ_BUDGET_MS = 300;
const PRIORITIES = ['Low', 'Medium', 'High'];
const SEEDED_DUE_DATES = [null, '2026-11-01', '2026-11-05', '2026-12-01'];

function seedTask(index) {
  const completed = index % 4 === 0;
  return {
    id: `seed-${index}`,
    title: `Seeded task ${index}`,
    description: 'Seeded for the performance test.',
    priority: PRIORITIES[index % PRIORITIES.length],
    dueDate: SEEDED_DUE_DATES[index % SEEDED_DUE_DATES.length],
    status: completed ? 'Completed' : 'Open',
    createdAt: new Date(Date.UTC(2026, 9, 1, 0, 0, index)).toISOString(),
    completedAt: completed ? '2026-11-02T10:00:00.000Z' : null,
  };
}

const seedAll = () => Array.from({ length: SEEDED_COUNT }, (_, index) => seedTask(index));

function percentile95(durations) {
  const sorted = [...durations].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * 0.95) - 1];
}

async function measure(step) {
  const durations = [];
  for (let run = 0; run < REPETITIONS; run += 1) {
    const started = performance.now();
    const result = await step(run);
    durations.push(performance.now() - started);
    assert.ok(result.status >= 200 && result.status < 300, `request ${run} returned ${result.status}`);
  }
  return percentile95(durations);
}

function buildOperations(server) {
  const call = (options) => server.request(options);
  const body = (title) => ({ title, description: '', priority: 'High', dueDate: '2026-12-31' });
  return [
    {
      name: 'create',
      budget: WRITE_BUDGET_MS,
      run: (run) => call({ method: 'POST', path: '/api/tasks', json: body(`Created ${run}`) }),
    },
    {
      name: 'edit',
      budget: WRITE_BUDGET_MS,
      run: (run) => call({ method: 'PUT', path: `/api/tasks/seed-${run * 2 + 1}`, json: body(`Edited ${run}`) }),
    },
    {
      name: 'toggle',
      budget: WRITE_BUDGET_MS,
      run: (run) =>
        call({
          method: 'PUT',
          path: `/api/tasks/seed-${run * 2 + 1}/status`,
          json: { status: run % 2 === 0 ? 'Completed' : 'Open' },
        }),
    },
    {
      name: 'delete',
      budget: WRITE_BUDGET_MS,
      run: (run) => call({ method: 'DELETE', path: `/api/tasks/seed-${run * 2 + 41}` }),
    },
    { name: 'list', budget: READ_BUDGET_MS, run: () => call({ path: '/api/tasks' }) },
    {
      name: 'filter',
      budget: READ_BUDGET_MS,
      run: () => call({ path: '/api/tasks?status=Open&priority=High&overdue=true' }),
    },
  ];
}

test('1,000 tasks: the 95th percentile stays within 200 ms for writes and 300 ms for reads (NFR-4, NFR-5)', async () => {
  const server = await startTestServer({ tasks: seedAll(), clock });
  try {
    const seeded = await server.request({ path: '/api/tasks' });
    assert.equal(seeded.json.total, SEEDED_COUNT);
    const filtered = await server.request({ path: '/api/tasks?status=Open&priority=High&overdue=true' });
    assert.ok(filtered.json.tasks.length > 0, 'the filter benchmark matches some seeded tasks');

    const report = [];
    for (const operation of buildOperations(server)) {
      const p95 = await measure(operation.run);
      report.push({ operation: operation.name, 'p95 (ms)': Number(p95.toFixed(1)), 'budget (ms)': operation.budget });
    }
    console.table(report);

    for (const { operation, 'p95 (ms)': p95, 'budget (ms)': budget } of report) {
      assert.ok(p95 <= budget, `${operation} p95 ${p95} ms is over the ${budget} ms budget`);
    }
  } finally {
    await server.stop();
  }
});

test('percentile95 picks the 19th of 20 sorted values', () => {
  const durations = Array.from({ length: 20 }, (_, index) => 20 - index);
  assert.equal(percentile95(durations), 19);
});
