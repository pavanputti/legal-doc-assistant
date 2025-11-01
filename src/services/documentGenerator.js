import mammoth from 'mammoth';
import PizZip from 'pizzip';
import { saveAs } from 'file-saver';

/**
 * Generate a filled DOCX document from template and filled values
 * This method preserves the original formatting by manipulating the DOCX XML directly
 */
export const generateFilledDocument = async (originalFile, filledValues, placeholderFormatMap = null, placeholders = null) => {
  try {
    console.log('[DOCUMENT_GENERATOR] Starting document generation...');
    console.log('[DOCUMENT_GENERATOR] Filled values:', filledValues);
    console.log('[DOCUMENT_GENERATOR] Placeholders:', placeholders);
    console.log('[DOCUMENT_GENERATOR] PlaceholderFormatMap type:', typeof placeholderFormatMap, 'is Map:', placeholderFormatMap instanceof Map);
    console.log('[DOCUMENT_GENERATOR] PlaceholderFormatMap:', placeholderFormatMap);
    
    // Convert placeholderFormatMap to Map if it's not already
    let formatMap = placeholderFormatMap;
    if (formatMap && !(formatMap instanceof Map)) {
      // If it's an object or array, convert to Map
      if (Array.isArray(formatMap)) {
        formatMap = new Map(formatMap);
      } else if (typeof formatMap === 'object') {
        formatMap = new Map(Object.entries(formatMap).map(([key, value]) => {
          // If value is an array, convert to Set, otherwise wrap in Set
          if (Array.isArray(value)) {
            return [key, new Set(value)];
          } else if (value instanceof Set) {
            return [key, value];
          } else {
            return [key, new Set([value])];
          }
        }));
      }
    }
    
    console.log('[DOCUMENT_GENERATOR] FormatMap after conversion:', formatMap);
    
    // Read the DOCX file as an ArrayBuffer
    const arrayBuffer = await originalFile.arrayBuffer();
    
    // Open the DOCX file with PizZip
    const zip = new PizZip(arrayBuffer);
    
    // Get the main document XML
    const docXml = zip.files['word/document.xml'].asText();
    
    console.log('[DOCUMENT_GENERATOR] Original XML length:', docXml.length);
    
    // Debug: Check if XML contains expected placeholders
    const sampleXml = docXml.substring(0, Math.min(2000, docXml.length));
    console.log('[DOCUMENT_GENERATOR] Sample XML (first 2000 chars):', sampleXml);
    
    // Check for common placeholder patterns in XML
    const hasBracketPlaceholders = /\[[^\]]+\]/.test(docXml);
    const hasBlankPlaceholders = /\[[_\-]{3,}\]/.test(docXml);
    console.log('[DOCUMENT_GENERATOR] XML contains bracket placeholders:', hasBracketPlaceholders);
    console.log('[DOCUMENT_GENERATOR] XML contains blank placeholders:', hasBlankPlaceholders);
    
    // DOCX XML structure: text is in <w:t> tags, placeholders might be split
    // Example: [COMPANY] might appear as: <w:t>[COM</w:t><w:t>PANY]</w:t>
    // Strategy: Replace placeholders by temporarily removing XML tags, then restore structure
    
    // First, create a normalized version where we temporarily mark text nodes
    // Then do replacements, then restore the XML structure
    let filledXml = docXml;
    
    // Helper function to replace placeholders even if split across XML tags
    const replacePlaceholderInXML = (xml, placeholder, replacement) => {
      // Create a pattern that matches the placeholder even if split across <w:t> tags
      // We'll match: [placeholder] or [PLACEHOLDER] or any variation
      // The pattern should handle: <w:t>[</w:t><w:t>placeholder</w:t><w:t>]</w:t>
      
      // For now, try simple replacement first (most placeholders are not split)
      const escapedPlaceholder = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const simpleRegex = new RegExp(escapedPlaceholder, 'gi');
      
      // Try simple replacement
      if (simpleRegex.test(xml)) {
        return xml.replace(simpleRegex, replacement);
      }
      
      // If simple replacement doesn't work, try pattern that handles split tags
      // Pattern: placeholder can be split with optional XML tags between characters
      const flexiblePattern = escapedPlaceholder.split('').join('(?:</?w:t[^>]*>)?');
      const flexibleRegex = new RegExp(flexiblePattern, 'gi');
      
      if (flexibleRegex.test(xml)) {
        // For split placeholders, we need to reconstruct the XML properly
        // This is complex, so for now we'll use a simpler approach
        return xml.replace(flexibleRegex, () => {
          // Insert replacement inside <w:t> tags
          return `<w:t>${replacement}</w:t>`;
        });
      }
      
      return xml;
    };
    
    // First, handle blank placeholders separately (process in reverse order)
    const blankPlaceholders = Object.entries(filledValues).filter(([key]) => /^blank_\d+$/.test(key));
    
    // Sort blank placeholders by their position in the document (reverse order for replacement)
    const sortedBlankPlaceholders = blankPlaceholders.sort(([keyA], [keyB]) => {
      if (!placeholders || !Array.isArray(placeholders)) return 0;
      const indexA = placeholders.indexOf(keyA);
      const indexB = placeholders.indexOf(keyB);
      return indexB - indexA; // Reverse order
    });
    
    // Replace blank placeholders in reverse order
    sortedBlankPlaceholders.forEach(([normalizedKey, value]) => {
      if (!value || value.trim() === '') return;
      
      // Count unfilled blank placeholders that come before this one
      let occurrenceIndex = 0;
      if (placeholders && Array.isArray(placeholders)) {
        for (let j = 0; j < placeholders.length; j++) {
          const key = placeholders[j];
          if (key === normalizedKey) break;
          if (/^blank_\d+$/.test(key)) {
            const isOtherFilled = filledValues[key] && filledValues[key].trim() !== '';
            if (!isOtherFilled) {
              occurrenceIndex++;
            }
          }
        }
      }
      
      // Find all blank placeholders in the current XML
      const blankPattern = /\[[_\-]{3,}\]/g;
      let match;
      blankPattern.lastIndex = 0;
      const allBlankMatches = [];
      
      // Collect all blank placeholders in order (skip already replaced ones)
      while ((match = blankPattern.exec(filledXml)) !== null) {
        // Check if this match hasn't been replaced yet
        const checkString = filledXml.substring(
          Math.max(0, match.index - 50),
          Math.min(filledXml.length, match.index + match[0].length + 50)
        );
        if (!checkString.includes('<!--REPLACED-->')) {
          allBlankMatches.push({
            match: match[0],
            index: match.index
          });
        }
      }
      
      console.log(`[DOCUMENT_GENERATOR] Blank placeholder "${normalizedKey}": found ${allBlankMatches.length} unfilled blanks, occurrenceIndex=${occurrenceIndex}`);
      
      // Replace only the specific blank at the correct occurrence index
      if (allBlankMatches[occurrenceIndex]) {
        const targetMatch = allBlankMatches[occurrenceIndex];
        
        // Replace by position to ensure we get the exact match
        const beforeMatch = filledXml.substring(0, targetMatch.index);
        const afterMatch = filledXml.substring(targetMatch.index + targetMatch.match.length);
        
        // Check if this position hasn't already been replaced
        const checkBefore = filledXml.substring(Math.max(0, targetMatch.index - 50), targetMatch.index);
        if (!checkBefore.includes('<!--REPLACED-->')) {
          filledXml = beforeMatch + value + '<!--REPLACED-->' + afterMatch;
          console.log(`[DOCUMENT_GENERATOR] ✓ Replaced blank placeholder "${normalizedKey}" at index ${targetMatch.index} with "${value}"`);
        } else {
          console.log(`[DOCUMENT_GENERATOR] ⚠ Blank placeholder "${normalizedKey}" at index ${targetMatch.index} already replaced`);
        }
      } else {
        console.warn(`[DOCUMENT_GENERATOR] ⚠ Could not find blank placeholder "${normalizedKey}" at occurrence index ${occurrenceIndex} (only ${allBlankMatches.length} blanks found)`);
      }
    });
    
    // Now handle non-blank placeholders
    Object.entries(filledValues).forEach(([normalizedKey, value]) => {
      if (!value || value.trim() === '') return; // Skip empty values
      
      // Skip blank placeholders (already handled above)
      if (/^blank_\d+$/.test(normalizedKey)) {
        return;
      }
      
      // For non-blank placeholders, use original formats from placeholderFormatMap
      {
        let originalFormats = [];
        if (formatMap && formatMap instanceof Map && formatMap.has(normalizedKey)) {
          const formats = formatMap.get(normalizedKey);
          if (formats instanceof Set) {
            originalFormats = Array.from(formats);
          } else if (Array.isArray(formats)) {
            originalFormats = formats;
          } else {
            originalFormats = [formats];
          }
        }
        
        // If we have original formats, use them for exact matching
        if (originalFormats.length > 0) {
          console.log(`[DOCUMENT_GENERATOR] Replacing "${normalizedKey}" with original formats:`, originalFormats);
          originalFormats.forEach(originalFormat => {
            // Escape special regex characters
            const escapedFormat = originalFormat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            
            // Try multiple strategies for replacement
            let replaced = false;
            
            // Strategy 1: Direct replacement (most common case)
            const directRegex = new RegExp(escapedFormat, 'gi');
            const matchesBefore = (filledXml.match(directRegex) || []).length;
            if (matchesBefore > 0) {
              filledXml = filledXml.replace(directRegex, value);
              console.log(`[DOCUMENT_GENERATOR] ✓ Replaced "${originalFormat}" ${matchesBefore} time(s) with "${value}" (direct match)`);
              replaced = true;
            }
            
            // Strategy 2: If direct match failed, try pattern that handles whitespace/XML tags
            if (!replaced) {
              // Pattern that allows optional whitespace or XML tags between characters
              // Example: [COMPANY] might be [COMPANY] or [ COMPANY ] or split across tags
              const flexiblePattern = escapedFormat.replace(/\[/g, '\\[\\s]*').replace(/\]/g, '[\\s]*\\]');
              const flexibleRegex = new RegExp(flexiblePattern, 'gi');
              const flexMatchesBefore = (filledXml.match(flexibleRegex) || []).length;
              
              if (flexMatchesBefore > 0) {
                filledXml = filledXml.replace(flexibleRegex, value);
                console.log(`[DOCUMENT_GENERATOR] ✓ Replaced "${originalFormat}" ${flexMatchesBefore} time(s) using flexible pattern`);
                replaced = true;
              }
            }
            
            // Strategy 3: Extract placeholder name and try matching just the name part
            if (!replaced) {
              const placeholderName = originalFormat.replace(/[[\]{}]/g, '').trim();
              const nameEscaped = placeholderName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              
              // Try to find the placeholder name in the XML (might be split)
              // Look for pattern: [name] or {name} or {{name}}
              const namePatterns = [
                new RegExp(`\\[\\s*${nameEscaped}\\s*\\]`, 'gi'),
                new RegExp(`\\{\\{\\s*${nameEscaped}\\s*\\}\\}`, 'gi'),
                new RegExp(`\\{\\s*${nameEscaped}\\s*\\}`, 'gi'),
              ];
              
              for (const nameRegex of namePatterns) {
                const nameMatches = (filledXml.match(nameRegex) || []).length;
                if (nameMatches > 0) {
                  filledXml = filledXml.replace(nameRegex, value);
                  console.log(`[DOCUMENT_GENERATOR] ✓ Replaced "${originalFormat}" ${nameMatches} time(s) by matching name "${placeholderName}"`);
                  replaced = true;
                  break;
                }
              }
            }
            
            if (!replaced) {
              console.warn(`[DOCUMENT_GENERATOR] ⚠ Could not find "${originalFormat}" in XML - placeholder might be split or formatted differently`);
              // Last resort: try replacePlaceholderInXML helper
              const beforeReplace = filledXml;
              filledXml = replacePlaceholderInXML(filledXml, originalFormat, value);
              if (filledXml !== beforeReplace) {
                console.log(`[DOCUMENT_GENERATOR] ✓ Replaced "${originalFormat}" using XML-aware replacement`);
              }
            }
          });
        } else {
          console.log(`[DOCUMENT_GENERATOR] No original formats for "${normalizedKey}", using fallback patterns`);
          // Fallback: try common variations
          const keyVariations = [
            normalizedKey,
            normalizedKey.replace(/_/g, ' '),
            normalizedKey.replace(/_/g, '-'),
          ];
          
          keyVariations.forEach(keyVar => {
            const patterns = [
              `\\[${keyVar}\\]`,
              `\\[\\s*${keyVar}\\s*\\]`,
              `\\{\\{${keyVar}\\}\\}`,
              `\\{\\{\\s*${keyVar}\\s*\\}\\}`,
              `\\{${keyVar}\\}`,
              `\\{\\s*${keyVar}\\s*\\}`,
            ];
            
            patterns.forEach(pattern => {
              const regex = new RegExp(pattern, 'gi');
              filledXml = filledXml.replace(regex, value);
            });
          });
        }
      }
    });
    
    // Remove replacement markers
    filledXml = filledXml.replace(/<!--REPLACED-->/g, '');
    
    console.log('[DOCUMENT_GENERATOR] Filled XML length:', filledXml.length);
    console.log('[DOCUMENT_GENERATOR] Placeholders replaced successfully');
    
    // Update the document.xml in the zip
    zip.files['word/document.xml'].options.content = filledXml;
    
    // Generate the new DOCX file as a blob
    const blob = zip.generate({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    
    console.log('[DOCUMENT_GENERATOR] Document blob generated, size:', blob.size);
    
    return blob;
  } catch (error) {
    console.error('Error generating filled document:', error);
    
    // Fallback: Use a simpler text-based approach
    try {
      return await generateFilledDocumentFallback(originalFile, filledValues);
    } catch (fallbackError) {
      console.error('Fallback also failed:', fallbackError);
      throw new Error('Failed to generate filled document');
    }
  }
};

/**
 * Fallback method using text extraction and recreation
 */
const generateFilledDocumentFallback = async (originalFile, filledValues) => {
  const { Document, Packer, Paragraph, TextRun } = await import('docx');
  
  // Extract text
  const textResult = await mammoth.extractRawText({ arrayBuffer: originalFile });
  let filledText = textResult.value;
  
  // Replace placeholders
  Object.entries(filledValues).forEach(([key, value]) => {
    const patterns = [
      new RegExp(`\\{\\{${key}\\}\\}`, 'gi'),
      new RegExp(`\\{${key}\\}`, 'gi'),
      new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi'),
      new RegExp(`\\{\\s*${key}\\s*\\}`, 'gi')
    ];
    
    patterns.forEach(pattern => {
      filledText = filledText.replace(pattern, value || '');
    });
  });
  
  // Create a new document
  const doc = new Document({
    sections: [{
      properties: {},
      children: filledText.split('\n\n').filter(p => p.trim()).map(para => 
        new Paragraph({
          children: para.split('\n').filter(t => t.trim()).map(text => 
            new TextRun({
              text: text.trim()
            })
          )
        })
      )
    }]
  });
  
  return await Packer.toBlob(doc);
};

/**
 * Download the filled document
 */
export const downloadDocument = async (originalFile, filledValues, placeholderFormatMap = null, placeholders = null, filename = 'completed-document.docx') => {
  try {
    console.log('[DOWNLOAD] Starting download...');
    console.log('[DOWNLOAD] File:', originalFile?.name);
    console.log('[DOWNLOAD] Filled values count:', Object.keys(filledValues).length);
    console.log('[DOWNLOAD] Placeholders count:', placeholders?.length || 0);
    
    const blob = await generateFilledDocument(originalFile, filledValues, placeholderFormatMap, placeholders);
    
    console.log('[DOWNLOAD] Blob generated, triggering download...');
    saveAs(blob, filename);
    console.log('[DOWNLOAD] Download triggered successfully');
  } catch (error) {
    console.error('[DOWNLOAD] Error downloading document:', error);
    console.error('[DOWNLOAD] Error details:', error.stack);
    throw error;
  }
};

