import fetch from 'node-fetch';

async function testWebhook() {
  const dummyPayload = {
    "event": "messages.upsert",
    "instance": "test_instance",
    "data": {
      "message": {
        "key": {
          "remoteJid": "5511999999999@s.whatsapp.net",
          "fromMe": false,
          "id": "MSG_" + Date.now()
        },
        "pushName": "Test User",
        "message": {
          "imageMessage": {
            "url": "https://mmg.whatsapp.net/v/t62.7118-24/...",
            "mimetype": "image/jpeg",
            "fileSha256": "...",
            "fileLength": "1234",
            "mediaKey": "...",
            "base64": "/9j/4AAQSn..."
          }
        }
      }
    }
  };

  const res = await fetch('http://127.0.0.1:3001/api/v1/webhooks/whatsapp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dummyPayload)
  });

  console.log("Status:", res.status);
  console.log("Response:", await res.text());
}

testWebhook();
