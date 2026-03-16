import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function seed() {
  // Check if already seeded
  const existing = await prisma.tenant.findUnique({
    where: { slug: "hotel-demo" },
  });

  if (existing) {
    console.log("Seed data already exists. Skipping.");
    return;
  }

  // Create tenant
  const tenant = await prisma.tenant.create({
    data: {
      name: "Hotel Demo",
      slug: "hotel-demo",
      whatsappPhoneNumberId: "123456789",
      whatsappBusinessAccountId: "987654321",
      defaultLanguage: "en",
    },
  });

  // Create admin user
  await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: "admin@hoteldemo.com",
      passwordHash: bcrypt.hashSync("admin123", 12),
      fullName: "Admin User",
      role: "admin",
      preferredLanguage: "en",
      isOnline: true,
    },
  });

  // Create agent (Portuguese)
  await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: "agent@hoteldemo.com",
      passwordHash: bcrypt.hashSync("agent123", 12),
      fullName: "Maria Silva",
      role: "agent",
      preferredLanguage: "pt",
      isOnline: true,
      maxConcurrentConversations: 5,
    },
  });

  // Create agent (English, offline)
  await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: "agent2@hoteldemo.com",
      passwordHash: bcrypt.hashSync("agent123", 12),
      fullName: "John Smith",
      role: "agent",
      preferredLanguage: "en",
      isOnline: false,
      maxConcurrentConversations: 5,
    },
  });

  console.log("Seed data created successfully!");
  console.log(`  Tenant: ${tenant.name} (ID: ${tenant.id})`);
  console.log("  Admin:  admin@hoteldemo.com / admin123");
  console.log("  Agent:  agent@hoteldemo.com / agent123 (Portuguese)");
  console.log("  Agent:  agent2@hoteldemo.com / agent123 (English, offline)");
}

seed()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
