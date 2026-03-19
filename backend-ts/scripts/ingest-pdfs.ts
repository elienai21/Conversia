import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import pdfParse from 'pdf-parse';
import { generateEmbedding } from '../src/services/embedding.service.js';

const prisma = new PrismaClient();

// Configuration
const PDFS_DIR = path.join(process.cwd(), 'pdfs');
// Change this to your specific tenantId, or pass via command line argument
const DEFAULT_TENANT_ID = process.argv[2]; 
const CHUNK_SIZE = 1000; // max characters per chunk

/**
 * Splits text into chunks of roughly CHUNK_SIZE characters, 
 * attempting not to break words or sentences.
 */
function chunkText(text: string, chunkSize: number): string[] {
  // Simple paragraph/sentence based chunking
  const paragraphs = text.split(/\n\s*\n/);
  const chunks: string[] = [];
  let currentChunk = "";

  for (const p of paragraphs) {
    if ((currentChunk.length + p.length) < chunkSize) {
      currentChunk += p + "\n\n";
    } else {
      if (currentChunk.trim().length > 0) chunks.push(currentChunk.trim());
      currentChunk = p + "\n\n";
    }
  }
  if (currentChunk.trim().length > 0) chunks.push(currentChunk.trim());
  return chunks;
}

async function main() {
  if (!DEFAULT_TENANT_ID) {
    console.error("Please provide a tenant ID as an argument!");
    console.error("Usage: npx tsx scripts/ingest-pdfs.ts <seu-tenant-id>");
    process.exit(1);
  }

  // Check if directory exists
  if (!fs.existsSync(PDFS_DIR)) {
    console.log(`Directory not found: ${PDFS_DIR}`);
    console.log(`Creating directory... please put your PDF files here and run again.`);
    fs.mkdirSync(PDFS_DIR, { recursive: true });
    process.exit(0);
  }

  const files = fs.readdirSync(PDFS_DIR).filter(file => file.toLowerCase().endsWith('.pdf'));

  if (files.length === 0) {
    console.log(`No PDFs found in ${PDFS_DIR}. Please add some files.`);
    process.exit(0);
  }

  console.log(`Found ${files.length} PDF(s). Starting ingestion for tenant: ${DEFAULT_TENANT_ID}`);

  for (const file of files) {
    console.log(`\nProcessing: ${file}`);
    const filePath = path.join(PDFS_DIR, file);
    const dataBuffer = fs.readFileSync(filePath);

    try {
      const data = await pdfParse(dataBuffer);
      const text = data.text;
      
      console.log(`  - Extracted ${text.length} characters.`);
      
      const chunks = chunkText(text, CHUNK_SIZE);
      console.log(`  - Split into ${chunks.length} chunks.`);

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const title = `${file} (Parte ${i + 1})`;
        
        console.log(`    - Embedding ${title}...`);
        
        // 1. Create Knowledge Base entry first
        const kbEntry = await prisma.knowledgeBase.create({
          data: {
            tenantId: DEFAULT_TENANT_ID,
            title: title,
            content: chunk,
            category: "documentos_pdf",
            isActive: true,
          }
        });

        // 2. Generate embedding vector
        const vector = await generateEmbedding(DEFAULT_TENANT_ID, `${title}\n${chunk}`);
        
        if (vector) {
          const vectorStr = `[${vector.join(",")}]`;
          // 3. Inject it back with raw SQL for pgvector
          await prisma.$executeRawUnsafe(
            `UPDATE knowledge_base SET embedding = '${vectorStr}'::vector WHERE id = '${kbEntry.id}'`
          );
          console.log(`      ✓ Saved internally to row ID: ${kbEntry.id}`);
        } else {
          console.log(`      ✕ Failed to generate vector for ${title}`);
        }

        // Small delay so we don't hit OpenAI rate limits rapidly
        await new Promise(r => setTimeout(r, 500));
      }
      
      console.log(`  ✓ Finished ${file}`);
    } catch (err) {
      console.error(`  ✕ Error parsing ${file}:`, err);
    }
  }
  
  console.log("\nAll Done! Vector database populated.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
