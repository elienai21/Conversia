import { prisma } from "./src/lib/prisma.js";

async function main() {
  const count = await prisma.messageAttachment.count();
  console.log("Total attachments:", count);

  if (count > 0) {
    const last5 = await prisma.messageAttachment.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        type: true,
        mimeType: true,
        fileName: true,
        providerMediaId: true,
        createdAt: true,
        messageId: true,
      },
    });
    console.log("Last 5:");
    console.log(JSON.stringify(last5, null, 2));
  }

  // Check last few messages that likely have media
  const imgMsgs = await prisma.message.findMany({
    where: { originalText: { contains: "[image]" } },
    take: 3,
    orderBy: { createdAt: "desc" },
    include: { attachments: true },
  });
  console.log("\nMessages with [image] text:", imgMsgs.length);
  for (const m of imgMsgs) {
    console.log(`  msg=${m.id}, attachments=${m.attachments.length}, text="${m.originalText}"`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
