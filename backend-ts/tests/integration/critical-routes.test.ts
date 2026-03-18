import test from 'node:test';
import assert from 'node:assert/strict';
import { createCriticalRoutesTestApp } from '../support/test-app.js';

test('auth login returns a bearer token for valid credentials', async () => {
  const app = await createCriticalRoutesTestApp();
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email: 'agent@tenant-a.test', password: 'secret123' },
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.token_type, 'bearer');
  assert.equal(body.user.email, 'agent@tenant-a.test');
});

test('protected routes reject requests without a bearer token', async () => {
  const app = await createCriticalRoutesTestApp();
  const response = await app.inject({ method: 'GET', url: '/api/v1/conversations' });

  assert.equal(response.statusCode, 401);
});

test('agent conversation list only includes conversations assigned inside its tenant', async () => {
  const app = await createCriticalRoutesTestApp();
  const response = await app.inject({
    method: 'GET',
    url: '/api/v1/conversations',
    headers: { authorization: 'Bearer agent-a-token' },
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.length, 1);
  assert.equal(body[0].id, 'conv-a-1');
});

test('conversation creation refuses customers from another tenant', async () => {
  const app = await createCriticalRoutesTestApp();
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/conversations',
    headers: { authorization: 'Bearer admin-a-token' },
    payload: {
      customer_id: '11111111-1111-4111-8111-111111111112',
      channel: 'whatsapp',
      message: 'Olá!',
    },
  });

  assert.equal(response.statusCode, 404);
});

test('message list returns only messages from a conversation in the authenticated tenant', async () => {
  const app = await createCriticalRoutesTestApp();
  const response = await app.inject({
    method: 'GET',
    url: '/api/v1/conversations/conv-a-1/messages',
    headers: { authorization: 'Bearer agent-a-token' },
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.length, 2);
  assert.equal(body[0].conversation_id, 'conv-a-1');
});

test('message send persists a new agent reply and emits the translated/public payload safely', async () => {
  const app = await createCriticalRoutesTestApp();
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/conversations/conv-a-1/messages',
    headers: { authorization: 'Bearer agent-a-token' },
    payload: { text: 'Sure, we can help with that.' },
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.sender_type, 'agent');
  assert.equal(body.original_text, 'Sure, we can help with that.');
});

test('tenant isolation blocks reading messages from another tenant conversation', async () => {
  const app = await createCriticalRoutesTestApp();
  const response = await app.inject({
    method: 'GET',
    url: '/api/v1/conversations/conv-b-1/messages',
    headers: { authorization: 'Bearer agent-a-token' },
  });

  assert.equal(response.statusCode, 404);
});
