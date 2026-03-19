import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../../src/app.js';
import { createTestDeps, createStore } from '../support/test-app.js';

test('application bootstrap attaches request.server.deps so login does not crash', async () => {
  const app = await buildApp(createTestDeps(createStore()));

  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email: 'agent@tenant-a.test', password: 'secret123' },
  });

  assert.equal(response.statusCode, 200);
});
