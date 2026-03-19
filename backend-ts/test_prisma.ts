import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const msg = await prisma.message.findFirst({ orderBy: { createdAt: 'desc' } });
  if (!msg) {
    console.log("No messages to attach to.");
    return;
  }
  
  try {
    const attachment = await prisma.messageAttachment.create({
      data: {
        messageId: msg.id,
        type: 'image',
        mimeType: 'image/jpeg',
        sourceUrl: 'data:image/jpeg;base64,/9j/4AAQ...',
      }
    });
    console.log("Created successfully:", attachment);
    await prisma.messageAttachment.delete({ where: { id: attachment.id } });
  } catch (err) {
    console.error("Prisma create error:", err);
  }
}

main().finally(() => prisma.$disconnect());
