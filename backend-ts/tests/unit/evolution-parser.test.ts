import test from "node:test";
import assert from "node:assert/strict";
import { extractEvolutionAttachments } from "../../src/services/whatsapp/evolution.provider.js";

// ─── extractEvolutionAttachments ────────────────────────────────────────────

test("extractEvolutionAttachments: returns image attachment with URL", () => {
  const messageContent = {
    imageMessage: {
      url: "https://mmg.whatsapp.net/v/image123",
      mimetype: "image/jpeg",
      fileName: "photo.jpg",
    },
  };

  const result = extractEvolutionAttachments(messageContent);

  assert.equal(result.length, 1);
  assert.equal(result[0].type, "image");
  assert.equal(result[0].mimeType, "image/jpeg");
  assert.equal(result[0].fileName, "photo.jpg");
  assert.equal(result[0].sourceUrl, "https://mmg.whatsapp.net/v/image123");
});

test("extractEvolutionAttachments: returns audio attachment with URL", () => {
  const messageContent = {
    audioMessage: {
      url: "https://mmg.whatsapp.net/v/audio456",
      mimetype: "audio/ogg; codecs=opus",
    },
  };

  const result = extractEvolutionAttachments(messageContent);

  assert.equal(result.length, 1);
  assert.equal(result[0].type, "audio");
  assert.equal(result[0].mimeType, "audio/ogg; codecs=opus");
  assert.equal(result[0].sourceUrl, "https://mmg.whatsapp.net/v/audio456");
});

test("extractEvolutionAttachments: returns video attachment with URL", () => {
  const messageContent = {
    videoMessage: {
      url: "https://mmg.whatsapp.net/v/video789",
      mimetype: "video/mp4",
      fileName: "clip.mp4",
    },
  };

  const result = extractEvolutionAttachments(messageContent);

  assert.equal(result.length, 1);
  assert.equal(result[0].type, "video");
  assert.equal(result[0].mimeType, "video/mp4");
});

test("extractEvolutionAttachments: returns document attachment", () => {
  const messageContent = {
    documentMessage: {
      url: "https://mmg.whatsapp.net/v/doc999",
      mimetype: "application/pdf",
      fileName: "contract.pdf",
    },
  };

  const result = extractEvolutionAttachments(messageContent);

  assert.equal(result.length, 1);
  assert.equal(result[0].type, "document");
  assert.equal(result[0].fileName, "contract.pdf");
});

test("extractEvolutionAttachments: returns inline base64 when present in payload", () => {
  const b64 = Buffer.from("fake-image-bytes").toString("base64");
  const messageContent = {
    imageMessage: {
      url: "https://mmg.whatsapp.net/v/imageX",
      mimetype: "image/jpeg",
      base64: b64,
    },
  };

  const result = extractEvolutionAttachments(messageContent);

  assert.equal(result.length, 1);
  assert.equal(result[0].type, "image");
  // When base64 is injected, sourceUrl becomes a data URI
  assert.ok(result[0].sourceUrl?.startsWith("data:image/jpeg;base64,"));
});

test("extractEvolutionAttachments: returns empty array for text-only message", () => {
  const messageContent = {
    conversation: "Hello!",
  };

  const result = extractEvolutionAttachments(messageContent);

  assert.equal(result.length, 0);
});

test("extractEvolutionAttachments: image takes priority over other types when both present", () => {
  const messageContent = {
    imageMessage: {
      url: "https://mmg.whatsapp.net/v/img1",
      mimetype: "image/jpeg",
    },
    audioMessage: {
      url: "https://mmg.whatsapp.net/v/aud1",
      mimetype: "audio/ogg",
    },
  };

  const result = extractEvolutionAttachments(messageContent);

  // First matched mapping wins (image is listed first)
  assert.equal(result.length, 1);
  assert.equal(result[0].type, "image");
});
