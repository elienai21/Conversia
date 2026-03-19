import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  console.log("Adding vector extension...");
  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector;`);
  
  console.log("Adding embedding column to knowledge_base...");
  await prisma.$executeRawUnsafe(`ALTER TABLE knowledge_base ADD COLUMN IF NOT EXISTS embedding vector(1536);`);
  
  console.log("Vector extension and column added successfully!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
