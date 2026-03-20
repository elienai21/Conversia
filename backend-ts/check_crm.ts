import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const ts = await prisma.tenantSettings.findMany();
  console.log(ts.map(t => ({
    id: t.tenantId,
    autoResp: t.enableAutoResponse,
    intents: t.autoResponseIntents,
    staysDomain: t.staysnetDomain,
    staysSecret: t.staysnetClientSecret ? 'SET' : 'NOT SET'
  })));
}

main().catch(console.error).finally(() => prisma.$disconnect());
