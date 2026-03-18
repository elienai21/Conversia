import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

async function main() {
  const users = await p.user.findMany({
    select: { email: true, fullName: true, role: true, isActive: true },
  });
  console.log("=== USERS ===");
  for (const u of users) {
    console.log(`  ${u.email} | ${u.fullName} | role=${u.role} | active=${u.isActive}`);
  }
  
  const settings = await p.tenantSettings.findMany({
    select: { tenantId: true, whatsappPhoneNumberId: true, whatsappApiToken: true, whatsappBusinessAccountId: true },
  });
  console.log("\n=== TENANT SETTINGS ===");
  for (const s of settings) {
    console.log(`  Tenant: ${s.tenantId}`);
    console.log(`  WA Phone ID: ${s.whatsappPhoneNumberId || "(empty)"}`);
    console.log(`  WA Token set: ${!!s.whatsappApiToken}`);
    console.log(`  WA Biz ID: ${s.whatsappBusinessAccountId || "(empty)"}`);
  }
  if (settings.length === 0) {
    console.log("  (no tenant_settings records found)");
  }

  await p.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
