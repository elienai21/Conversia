import test from 'node:test';
import assert from 'node:assert/strict';
import { createCriticalRoutesTestApp } from '../support/test-app.js';
import { buildApp } from '../../src/app.js';
import { createStore, createTestDeps } from '../support/test-app.js';

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

test('auth login matches the correct tenant user when duplicate emails exist', async () => {
  const app = await createCriticalRoutesTestApp({
    users: [
      {
        id: 'agent-dup-a',
        tenantId: 'tenant-a',
        email: 'shared@tenant.test',
        passwordHash: 'hashed-secret123',
        fullName: 'Shared A',
        role: 'agent',
        preferredLanguage: 'en',
        isOnline: true,
        isActive: true,
      },
      {
        id: 'agent-dup-b',
        tenantId: 'tenant-b',
        email: 'shared@tenant.test',
        passwordHash: 'hashed-otherpass',
        fullName: 'Shared B',
        role: 'agent',
        preferredLanguage: 'pt',
        isOnline: true,
        isActive: true,
      },
    ],
  });

  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email: 'shared@tenant.test', password: 'otherpass' },
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.user.id, 'agent-dup-b');
  assert.equal(body.user.tenantId, 'tenant-b');
});

test('password reset request accepts a known email and triggers reset delivery', async () => {
  const deliveries: Array<{ email: string; resetUrl: string }> = [];
  const deps = createTestDeps(createStore(), {
    services: {
      sendPasswordResetEmail: async (email, resetUrl) => {
        deliveries.push({ email, resetUrl });
      },
    },
  });
  const app = await buildApp(deps);

  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/password-reset/request',
    payload: { email: 'agent@tenant-a.test' },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].email, 'agent@tenant-a.test');
  assert.match(deliveries[0].resetUrl, /reset-password\?token=/);
});

test('message send keeps original text when auto/original language is selected', async () => {
  let outboundText = '';
  const app = await createCriticalRoutesTestApp({
    services: {
      sendWhatsappMessage: async (_tenantId, _to, text) => {
        outboundText = text;
      },
    },
  });

  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/conversations/conv-a-1/messages',
    headers: { authorization: 'Bearer agent-a-token' },
    payload: { text: 'Mensagem sem tradução automática' },
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.translations.length, 0);
  assert.equal(outboundText, 'Mensagem sem tradução automática');
});
