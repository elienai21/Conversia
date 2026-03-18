import { PrismaClient } from "@prisma/client";
import { decrypt } from "../src/lib/encryption.js";

const prisma = new PrismaClient();

async function testWhatsappSend() {
  const settings = await prisma.tenantSettings.findFirst({
    where: { tenant: { users: { some: { email: "elienai@vivarestay.com" } } } },
    include: { tenant: true }
  });

  if (!settings || !settings.whatsappApiToken || !settings.whatsappPhoneNumberId) {
    console.error("No valid WhatsApp settings found");
    return;
  }

  const phoneId = settings.whatsappPhoneNumberId;
  const token = decrypt(settings.whatsappApiToken);

  const customer = await prisma.customer.findFirst({
    where: { tenantId: settings.tenantId },
    orderBy: { createdAt: "desc" }
  });

  if (!customer) {
    console.error("No customer found");
    return;
  }

  const customerPhone = customer.phone;
  let formattedPhone = customerPhone;
  // WhatsApp Cloud API expects numbers without '+' usually, but '+' is also fine
  if (formattedPhone.startsWith('+')) {
    formattedPhone = formattedPhone.substring(1);
  }

  console.log(`Sending test message to ${formattedPhone} from Phone ID ${phoneId}...`);
  
  const url = `https://graph.facebook.com/v19.0/${phoneId}/messages`;
  
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: formattedPhone,
        type: "text",
        text: { body: "Teste de envio direto do backend para diagnóstico" },
      }),
    });

    const body = await response.text();
    console.log(`Status: ${response.status}`);
    console.log(`Response: ${body}`);
  } catch (err) {
    console.error("Error:", err);
  }

  await prisma.$disconnect();
}

testWhatsappSend().catch(console.error);
