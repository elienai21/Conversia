import { EvolutionWhatsAppProvider } from './src/services/whatsapp/evolution.provider.js';

const provider = new EvolutionWhatsAppProvider();

const dummyPayload = {
  "event": "messages.upsert",
  "data": {
    "message": {
      "key": {
        "remoteJid": "5511999999999@s.whatsapp.net",
        "fromMe": false,
        "id": "AABBCCDD"
      },
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

const result = provider.parseWebhooks(dummyPayload);
console.log(JSON.stringify(result, null, 2));

const dummyPayload2 = {
  event: "messages.upsert",
  data: {
    message: {
      key: {
        remoteJid: "5511999999999@s.whatsapp.net",
        fromMe: false,
        id: "AABBCCDD"
      },
      message: {
        documentWithCaptionMessage: {
          message: {
            imageMessage: {
              url: "https://mmg.whatsapp.net/v/t62.7118-24/...",
              mimetype: "image/jpeg",
              base64: "/9j/4AAQSn..."
            }
          }
        }
      }
    }
  }
};

const result2 = provider.parseWebhooks(dummyPayload2);
console.log(JSON.stringify(result2, null, 2));
