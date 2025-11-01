import fs from 'fs';
import mammoth from 'mammoth';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function analyzeDocument(filePath) {
  try {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Analyzing: ${path.basename(filePath)}`);
    console.log('='.repeat(80));
    
    const buffer = fs.readFileSync(filePath);
    // Convert Node.js Buffer to ArrayBuffer properly
    const arrayBuffer = new ArrayBuffer(buffer.length);
    const view = new Uint8Array(arrayBuffer);
    for (let i = 0; i < buffer.length; i++) {
      view[i] = buffer[i];
    }
    
    // Extract text and HTML - mammoth expects { arrayBuffer } format
    const textResult = await mammoth.extractRawText({ arrayBuffer });
    const text = textResult.value;
    
    const htmlResult = await mammoth.convertToHtml({ arrayBuffer });
    const html = htmlResult.value;
    
    console.log(`Document length: ${text.length} characters`);
    
    // Test explicit placeholder patterns
    const explicitPatterns = [
      { pattern: /\[([a-zA-Z_][a-zA-Z0-9_\s-]*)\]/g, name: 'Square brackets [name]' },
      { pattern: /\{\{?\s*([a-zA-Z_][a-zA-Z0-9_\s-]*)\s*\}\}?/g, name: 'Curly braces {name}' },
      { pattern: /\[\[?\s*([a-zA-Z_][a-zA-Z0-9_\s-]*)\s*\]\]?/g, name: 'Double brackets [[name]]' },
      { pattern: /<\s*([a-zA-Z_][a-zA-Z0-9_\s-]*)\s*>/g, name: 'Angle brackets <name>' },
    ];
    
    const foundPlaceholders = new Map();
    
    explicitPatterns.forEach(({ pattern, name }) => {
      let match;
      pattern.lastIndex = 0;
      const matches = [];
      
      while ((match = pattern.exec(text)) !== null) {
        const originalFormat = match[0];
        const rawName = match[1].trim();
        const normalizedName = rawName.replace(/\s+/g, '_').replace(/-/g, '_').toLowerCase();
        
        if (normalizedName.length >= 2 && !/^\d+$/.test(normalizedName)) {
          if (!foundPlaceholders.has(normalizedName)) {
            foundPlaceholders.set(normalizedName, {
              normalized: normalizedName,
              originalFormats: new Set(),
              patterns: new Set()
            });
          }
          foundPlaceholders.get(normalizedName).originalFormats.add(originalFormat);
          foundPlaceholders.get(normalizedName).patterns.add(name);
          
          matches.push({ original: originalFormat, normalized: normalizedName });
        }
      }
      
      if (matches.length > 0) {
        console.log(`\n${name}: ${matches.length} matches`);
        matches.slice(0, 5).forEach(m => {
          console.log(`  - "${m.original}" → ${m.normalized}`);
        });
        if (matches.length > 5) {
          console.log(`  ... and ${matches.length - 5} more`);
        }
      }
    });
    
    // Test implicit placeholder patterns (labels)
    const implicitPatterns = [
      { pattern: /\b(Address|address):\s*(?:\n|<[^>]+>|\s*_+|\s*-+)/gi, name: 'Address label' },
      { pattern: /\b(Email|email):\s*(?:\n|<[^>]+>|\s*_+|\s*-+)/gi, name: 'Email label' },
      { pattern: /\b(Name|name):\s*(?:\n|<[^>]+>|\s*_+|\s*-+)/gi, name: 'Name label' },
      { pattern: /\b(Title|title):\s*(?:\n|<[^>]+>|\s*_+|\s*-+)/gi, name: 'Title label' },
    ];
    
    console.log(`\n=== Implicit Placeholders (Labels) ===`);
    implicitPatterns.forEach(({ pattern, name }) => {
      let match;
      pattern.lastIndex = 0;
      const matches = [];
      
      while ((match = pattern.exec(text)) !== null) {
        // Determine section context
        const beforeMatch = text.substring(Math.max(0, match.index - 300), match.index).toLowerCase();
        const lastCompanyIndex = beforeMatch.lastIndexOf('[company]') !== -1 ? 
          beforeMatch.lastIndexOf('[company]') : beforeMatch.lastIndexOf('company');
        const lastInvestorIndex = beforeMatch.lastIndexOf('investor');
        
        let section = null;
        if (lastCompanyIndex !== -1 && (lastInvestorIndex === -1 || lastCompanyIndex > lastInvestorIndex)) {
          section = 'company';
        } else if (lastInvestorIndex !== -1) {
          section = 'investor';
        }
        
        const label = match[1] || match[0].split(':')[0];
        matches.push({ label, section, fullMatch: match[0].trim() });
      }
      
      if (matches.length > 0) {
        console.log(`\n${name}: ${matches.length} matches`);
        matches.forEach(m => {
          console.log(`  - "${m.fullMatch}" (section: ${m.section || 'unknown'})`);
        });
      }
    });
    
    // Check for signature sections
    console.log(`\n=== Signature Sections ===`);
    const companySectionMatch = text.match(/\[COMPANY\]|\[company\]|COMPANY:/gi);
    const investorSectionMatch = text.match(/INVESTOR:|Investor:/gi);
    
    if (companySectionMatch) {
      console.log(`✓ Found COMPANY section marker: ${companySectionMatch[0]}`);
      const companyIndex = text.toLowerCase().indexOf('[company]');
      if (companyIndex !== -1) {
        const companySection = text.substring(companyIndex, Math.min(companyIndex + 500, text.length));
        console.log(`  Sample text: ${companySection.substring(0, 200)}...`);
      }
    }
    
    if (investorSectionMatch) {
      console.log(`✓ Found INVESTOR section marker: ${investorSectionMatch[0]}`);
      const investorIndex = text.toLowerCase().indexOf('investor:');
      if (investorIndex !== -1) {
        const investorSection = text.substring(investorIndex, Math.min(investorIndex + 500, text.length));
        console.log(`  Sample text: ${investorSection.substring(0, 200)}...`);
      }
    }
    
    // Summary
    console.log(`\n=== Summary ===`);
    console.log(`Total unique explicit placeholders: ${foundPlaceholders.size}`);
    console.log(`Placeholder list:`);
    Array.from(foundPlaceholders.values()).forEach((p, i) => {
      console.log(`  ${i + 1}. ${p.normalized}`);
      console.log(`     Formats: ${Array.from(p.originalFormats).join(', ')}`);
      console.log(`     Patterns: ${Array.from(p.patterns).join(', ')}`);
    });
    
    return {
      filename: path.basename(filePath),
      placeholders: Array.from(foundPlaceholders.values()),
      textLength: text.length,
      hasCompanySection: !!companySectionMatch,
      hasInvestorSection: !!investorSectionMatch
    };
    
  } catch (error) {
    console.error(`Error analyzing ${filePath}:`, error.message);
    return null;
  }
}

async function analyzeAllDocuments() {
  const sampleDir = path.join(__dirname, '../sample-documents');
  const files = fs.readdirSync(sampleDir)
    .filter(f => f.endsWith('.docx'))
    .map(f => path.join(sampleDir, f));
  
  console.log(`Found ${files.length} DOCX files to analyze`);
  
  const results = [];
  for (const file of files) {
    const result = await analyzeDocument(file);
    if (result) {
      results.push(result);
    }
  }
  
  // Final summary
  console.log(`\n\n${'='.repeat(80)}`);
  console.log('FINAL SUMMARY - All Documents');
  console.log('='.repeat(80));
  
  results.forEach(r => {
    console.log(`\n${r.filename}:`);
    console.log(`  - Placeholders: ${r.placeholders.length}`);
    console.log(`  - Company section: ${r.hasCompanySection ? 'Yes' : 'No'}`);
    console.log(`  - Investor section: ${r.hasInvestorSection ? 'Yes' : 'No'}`);
    console.log(`  - Placeholder names: ${r.placeholders.map(p => p.normalized).join(', ')}`);
  });
  
  // Find all unique placeholders across all documents
  const allPlaceholders = new Set();
  results.forEach(r => {
    r.placeholders.forEach(p => {
      allPlaceholders.add(p.normalized);
    });
  });
  
  console.log(`\n\nTotal unique placeholders across all documents: ${allPlaceholders.size}`);
  console.log(`All placeholders: ${Array.from(allPlaceholders).sort().join(', ')}`);
}

analyzeAllDocuments().catch(console.error);

