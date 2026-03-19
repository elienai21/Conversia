import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const attachments = await prisma.messageAttachment.findMany({
    take: 10,
    orderBy: { createdAt: 'desc' },
    include: { message: true }
  });
  console.log(JSON.stringify(attachments, null, 2));
}

main().finally(() => prisma.$disconnect());
