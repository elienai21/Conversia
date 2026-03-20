import { prisma } from "./src/lib/prisma.js";

async function run() {
  const login = "3d17e4ae";
  const pass = "97aab87c";
  const base64 = Buffer.from(`${login}:${pass}`).toString("base64");
  
  const credentials = {
    base64Token: base64,
    domain: "vivare.stays.net"
  };

  const { StaysNetAdapter } = await import("./src/adapters/crm/staysnet.adapter.js");
  const adapter = new StaysNetAdapter(credentials);
  
  console.log("Teste conexão direto com as chaves: ", base64);
  try {
    const res = await adapter.testConnection();
    console.log("Result:", res);
  } catch(e) {
    console.error("Error manual:", e);
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());

