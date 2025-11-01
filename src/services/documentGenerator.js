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
    
    // Replace placeholders in the XML
    // First, we need to handle placeholders that might be split across XML nodes
    // DOCX files store text in <w:t> tags, and placeholders might be split
    // Strategy: First join all text content, replace, then reconstruct XML structure
    
    let filledXml = docXml;
    
    // For DOCX XML, we need to handle text that might be in <w:t> tags
    // Let's extract all text content first, replace placeholders, then put it back
    
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
      
      // Collect all blank placeholders in order
      while ((match = blankPattern.exec(filledXml)) !== null) {
        allBlankMatches.push({
          match: match[0],
          index: match.index
        });
      }
      
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
        }
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
            // Escape special regex characters but preserve brackets for matching
            // DOCX XML might split placeholders, so we need a pattern that can match across tags
            let pattern = originalFormat;
            
            // For patterns like [COMPANY], create a regex that can match even if split
            // Example: [COMPANY] should match [COM</w:t></w:r></w:p>...<w:p><w:r><w:t>PANY]
            // But for simplicity, let's try direct matching first
            const escapedFormat = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escapedFormat, 'gi');
            
            // Count matches before replacement
            const matchesBefore = (filledXml.match(regex) || []).length;
            
            // Replace all occurrences
            filledXml = filledXml.replace(regex, value);
            
            // Count matches after replacement
            const matchesAfter = (filledXml.match(regex) || []).length;
            
            if (matchesBefore > 0) {
              console.log(`[DOCUMENT_GENERATOR] ✓ Replaced "${originalFormat}" ${matchesBefore} time(s) with "${value}"`);
            } else {
              // Try alternative pattern without escaping brackets (might be split)
              const altPattern = pattern.replace(/\[/g, '\\[\\s]*').replace(/\]/g, '[\\s]*\\]');
              const altRegex = new RegExp(altPattern, 'gi');
              const altMatchesBefore = (filledXml.match(altRegex) || []).length;
              
              if (altMatchesBefore > 0) {
                filledXml = filledXml.replace(altRegex, value);
                console.log(`[DOCUMENT_GENERATOR] ✓ Replaced "${originalFormat}" ${altMatchesBefore} time(s) using flexible pattern`);
              } else {
                console.warn(`[DOCUMENT_GENERATOR] ⚠ Could not find "${originalFormat}" in XML`);
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

