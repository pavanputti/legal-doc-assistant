import fs from 'fs';
import mammoth from 'mammoth';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function checkDocument() {
  try {
    const filePath = path.join(__dirname, '../sample/Postmoney_Safe_-_Valuation_Cap_Only_-_FINAL.docx');
    
    if (!fs.existsSync(filePath)) {
      console.error('File not found:', filePath);
      return;
    }
    
    const buffer = fs.readFileSync(filePath);
    // Convert Buffer to ArrayBuffer
    const arrayBuffer = new ArrayBuffer(buffer.length);
    const view = new Uint8Array(arrayBuffer);
    for (let i = 0; i < buffer.length; i++) {
      view[i] = buffer[i];
    }
    
    // Extract text
    const result = await mammoth.extractRawText({ arrayBuffer });
    const text = result.value;
    
    console.log('=== Document Analysis ===');
    console.log('Document text length:', text.length);
    console.log('\n--- First 800 characters ---\n');
    console.log(text.substring(0, 800));
    console.log('\n---\n');
    
    // Find placeholders
    const placeholderPattern = /\{\{?\s*([a-zA-Z_][a-zA-Z0-9_\s]*)\s*\}\}?/g;
    const placeholders = new Set();
    const placeholderDetails = [];
    let match;
    
    while ((match = placeholderPattern.exec(text)) !== null) {
      const originalMatch = match[0];
      const placeholderName = match[1].trim().replace(/\s+/g, '_').toLowerCase();
      if (!placeholders.has(placeholderName)) {
        placeholders.add(placeholderName);
        placeholderDetails.push({
          original: originalMatch,
          normalized: placeholderName
        });
      }
    }
    
    console.log('\n=== Placeholders Found ===');
    console.log('Total unique placeholders:', placeholders.size);
    console.log('\nPlaceholder details:');
    placeholderDetails.forEach((p, i) => {
      console.log(`${i + 1}. Original: "${p.original}" → Normalized: "${p.normalized}"`);
    });
    
    // Check for common SAFE document patterns
    console.log('\n=== Document Type Check ===');
    if (text.toLowerCase().includes('safe') || text.toLowerCase().includes('simple agreement')) {
      console.log('✓ Appears to be a SAFE document');
    }
    
  } catch (error) {
    console.error('Error analyzing document:', error);
    console.error(error.stack);
  }
}

checkDocument();

