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

  // Create admin user (get reference for assignments)
  const admin = await prisma.user.findFirst({
    where: { tenantId: tenant.id, role: "admin" },
  });

  // Create sample customers
  const customer1 = await prisma.customer.create({
    data: {
      tenantId: tenant.id,
      phone: "+5511999001234",
      name: "Carlos Oliveira",
    },
  });

  const customer2 = await prisma.customer.create({
    data: {
      tenantId: tenant.id,
      phone: "+14155550100",
      name: "Sarah Johnson",
    },
  });

  const customer3 = await prisma.customer.create({
    data: {
      tenantId: tenant.id,
      phone: "+34600123456",
      name: null,
    },
  });

  // Create sample conversations
  const conv1 = await prisma.conversation.create({
    data: {
      tenantId: tenant.id,
      customerId: customer1.id,
      assignedAgentId: admin!.id,
      channel: "whatsapp",
      status: "active",
      detectedLanguage: "pt",
    },
  });

  const conv2 = await prisma.conversation.create({
    data: {
      tenantId: tenant.id,
      customerId: customer2.id,
      assignedAgentId: admin!.id,
      channel: "whatsapp",
      status: "active",
      detectedLanguage: "en",
    },
  });

  await prisma.conversation.create({
    data: {
      tenantId: tenant.id,
      customerId: customer3.id,
      channel: "whatsapp",
      status: "queued",
      detectedLanguage: "es",
    },
  });

  // Messages for conversation 1 (Portuguese customer)
  await prisma.message.createMany({
    data: [
      {
        conversationId: conv1.id,
        senderType: "customer",
        originalText: "Olá, gostaria de saber se há disponibilidade para o fim de semana?",
        detectedLanguage: "pt",
      },
      {
        conversationId: conv1.id,
        senderType: "agent",
        senderId: admin!.id,
        originalText: "Hello! Yes, we have rooms available for this weekend. Would you prefer a Standard or Suite room?",
        detectedLanguage: "en",
      },
      {
        conversationId: conv1.id,
        senderType: "customer",
        originalText: "Quanto custa a suíte? E inclui café da manhã?",
        detectedLanguage: "pt",
      },
    ],
  });

  // Messages for conversation 2 (English customer)
  await prisma.message.createMany({
    data: [
      {
        conversationId: conv2.id,
        senderType: "customer",
        originalText: "Hi, what time is check-in? We are arriving late tonight.",
        detectedLanguage: "en",
      },
      {
        conversationId: conv2.id,
        senderType: "agent",
        senderId: admin!.id,
        originalText: "Welcome! Check-in is at 3 PM, but we do have 24-hour reception. You can arrive anytime!",
        detectedLanguage: "en",
      },
      {
        conversationId: conv2.id,
        senderType: "customer",
        originalText: "Great, do you have room service available after midnight?",
        detectedLanguage: "en",
      },
    ],
  });

  // Knowledge Base entries
  await prisma.knowledgeBase.createMany({
    data: [
      {
        tenantId: tenant.id,
        title: "Check-in & Check-out Times",
        content: "Check-in: 3:00 PM (15:00). Check-out: 12:00 PM (noon). Early check-in available upon request (subject to availability). Late check-out until 2:00 PM for an additional fee of $30.",
        category: "policies",
        isActive: true,
      },
      {
        tenantId: tenant.id,
        title: "Room Types & Pricing",
        content: "Standard Room: $120/night (1 King or 2 Queens). Deluxe Room: $180/night (1 King, city view, minibar). Suite: $280/night (separate living area, jacuzzi, balcony). All rooms include free Wi-Fi and access to gym & pool.",
        category: "rooms",
        isActive: true,
      },
      {
        tenantId: tenant.id,
        title: "Breakfast & Restaurant",
        content: "Buffet breakfast included for all guests: 6:30 AM - 10:30 AM. Restaurant open for lunch (12-3 PM) and dinner (6-10 PM). Room service available 24/7 (limited menu after midnight). Special dietary needs accommodated upon request.",
        category: "menu",
        isActive: true,
      },
      {
        tenantId: tenant.id,
        title: "Pool & Spa",
        content: "Outdoor pool open 7 AM - 9 PM. Indoor heated pool and sauna open 6 AM - 10 PM. Spa treatments available by appointment (massage, facial, body treatments). Pool towels provided at reception.",
        category: "services",
        isActive: true,
      },
      {
        tenantId: tenant.id,
        title: "Cancellation Policy",
        content: "Free cancellation up to 48 hours before check-in. Cancellations within 48 hours are charged the first night. No-shows are charged the full stay amount. Group bookings (5+ rooms) have special cancellation terms.",
        category: "policies",
        isActive: true,
      },
    ],
  });

  console.log("Seed data created successfully!");
  console.log(`  Tenant: ${tenant.name} (ID: ${tenant.id})`);
  console.log("  Admin:  admin@hoteldemo.com / admin123");
  console.log("  Agent:  agent@hoteldemo.com / agent123 (Portuguese)");
  console.log("  Agent:  agent2@hoteldemo.com / agent123 (English, offline)");
  console.log("  Customers: 3 (Carlos, Sarah, +34 anonymous)");
  console.log("  Conversations: 3 (2 active, 1 queued)");
  console.log("  Messages: 6");
  console.log("  Knowledge Base: 5 entries");
}

seed()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
