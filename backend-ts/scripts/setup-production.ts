import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function setupProduction() {
  console.log("=== Conversia Production Setup ===\n");

  // 1. Find the existing tenant
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) {
    console.error("No tenant found in database. Run seed first.");
    process.exit(1);
  }

  console.log(`Found tenant: ${tenant.name} (${tenant.id})`);
  console.log("Cleaning all demo data...\n");

  // 2. Delete all data in correct order (foreign key dependencies)
  const deletedSuggestions = await prisma.aISuggestion.deleteMany({});
  console.log(`  Deleted ${deletedSuggestions.count} AI suggestions`);

  const deletedTranslations = await prisma.messageTranslation.deleteMany({});
  console.log(`  Deleted ${deletedTranslations.count} message translations`);

  const deletedMessages = await prisma.message.deleteMany({});
  console.log(`  Deleted ${deletedMessages.count} messages`);

  const deletedConversations = await prisma.conversation.deleteMany({});
  console.log(`  Deleted ${deletedConversations.count} conversations`);

  const deletedCustomers = await prisma.customer.deleteMany({});
  console.log(`  Deleted ${deletedCustomers.count} customers`);

  const deletedKB = await prisma.knowledgeBase.deleteMany({});
  console.log(`  Deleted ${deletedKB.count} knowledge base entries`);

  const deletedUsage = await prisma.aIUsageLog.deleteMany({});
  console.log(`  Deleted ${deletedUsage.count} usage logs`);

  const deletedUsers = await prisma.user.deleteMany({});
  console.log(`  Deleted ${deletedUsers.count} users`);

  // 3. Update tenant to real name
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      name: "Vivare Stay",
      slug: "vivare-stay",
      defaultLanguage: "pt",
    },
  });
  console.log("\n  Tenant updated: Vivare Stay (slug: vivare-stay)");

  // 4. Create real admin user
  const admin = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: "elienai@vivarestay.com",
      passwordHash: bcrypt.hashSync("130517Sn@", 12),
      fullName: "Elienai",
      role: "admin",
      preferredLanguage: "pt",
      isOnline: true,
    },
  });

  console.log(`  Admin created: ${admin.email} (ID: ${admin.id})`);

  console.log("\n=== Production setup complete! ===");
  console.log(`\n  Login: elienai@vivarestay.com`);
  console.log(`  Tenant ID: ${tenant.id}`);
}

setupProduction()
  .catch((err) => {
    console.error("Setup failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
