import test from 'node:test';
import assert from 'node:assert/strict';
import { OfficialWhatsAppProvider } from '../../src/services/whatsapp/official.provider.js';
import { parseIncomingInstagramMessage } from '../../src/services/instagram.service.js';
import { createCriticalRoutesTestApp } from '../support/test-app.js';

test('official WhatsApp provider parses image media messages with caption metadata', () => {
  const provider = new OfficialWhatsAppProvider();
  const messages = provider.parseWebhooks({
    entry: [{
      changes: [{
        value: {
          metadata: { phone_number_id: 'phone-123' },
          contacts: [{ profile: { name: 'Maria' } }],
          messages: [{
            from: '5511999999999',
            id: 'wamid.image.1',
            type: 'image',
            image: {
              id: 'media-image-1',
              mime_type: 'image/jpeg',
              caption: 'fachada do imóvel',
            },
          }],
        },
      }],
    }],
  });

  assert.equal(messages.length, 1);
  assert.equal(messages[0].text, 'fachada do imóvel');
  assert.equal(messages[0].attachments?.[0]?.type, 'image');
  assert.equal(messages[0].attachments?.[0]?.providerMediaId, 'media-image-1');
});

test('instagram parser preserves attachment urls for media messages', () => {
  const message = parseIncomingInstagramMessage({
    object: 'instagram',
    entry: [{
      id: 'page-1',
      messaging: [{
        sender: { id: 'igsid-123' },
        message: {
          mid: 'mid.123',
          text: 'segue a foto',
          attachments: [{
            type: 'image',
            payload: { url: 'https://cdn.example.com/image.jpg' },
          }],
        },
      }],
    }],
  });

  assert.ok(message);
  assert.equal(message?.attachments?.[0]?.sourceUrl, 'https://cdn.example.com/image.jpg');
  assert.equal(message?.attachments?.[0]?.type, 'image');
});

test('message list returns attachment metadata for the inbox', async () => {
  const app = await createCriticalRoutesTestApp();
  const response = await app.inject({
    method: 'GET',
    url: '/api/v1/conversations/conv-a-1/messages',
    headers: { authorization: 'Bearer agent-a-token' },
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body[0].attachments?.[0]?.type, 'image');
  assert.equal(body[0].attachments?.[0]?.source_url, 'https://files.example.com/property-front.jpg');
});
