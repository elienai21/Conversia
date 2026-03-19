import { PrismaClient } from '@prisma/client'
import { generateEmbedding } from '../src/services/embedding.service.js'

const prisma = new PrismaClient()

async function main() {
  console.log("Starting backfill for KnowledgeBase embeddings...");
  
  const entries = await prisma.knowledgeBase.findMany();
  let successCount = 0;
  
  for (const entry of entries) {
    const textToEmbed = `${entry.title} ${entry.content}`;
    console.log(`Generating embedding for: ${entry.title}...`);
    
    const vector = await generateEmbedding(entry.tenantId, textToEmbed);
    
    if (vector) {
      const vectorStr = `[${vector.join(",")}]`;
      await prisma.$executeRawUnsafe(
        `UPDATE knowledge_base SET embedding = '${vectorStr}'::vector WHERE id = '${entry.id}'`
      );
      successCount++;
    } else {
      console.log(`Failed to generate embedding for: ${entry.title}`);
    }
    
    // Slight delay to avoid OpenAI rate limits
    await new Promise(r => setTimeout(r, 200));
  }
  
  console.log(`Backfill complete. ${successCount}/${entries.length} vectors generated.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
