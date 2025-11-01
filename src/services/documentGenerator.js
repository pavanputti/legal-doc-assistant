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
      
      console.log(`[DOCUMENT_GENERATOR] Processing blank placeholder "${normalizedKey}" with value "${value}"`);
      console.log(`[DOCUMENT_GENERATOR] Current filledXml length: ${filledXml.length}`);
      
      // DEBUG: Log placeholders array to see order
      const blankPlaceholdersInOrder = (placeholders || []).filter(p => /^blank_\d+$/.test(p));
      console.log(`[DOCUMENT_GENERATOR] Blank placeholders in document order:`, blankPlaceholdersInOrder);
      console.log(`[DOCUMENT_GENERATOR] Current placeholder "${normalizedKey}" position in placeholders array:`, placeholders?.indexOf(normalizedKey));
      
      // CRITICAL FIX: Calculate occurrence index based on BLANK PLACEHOLDER'S POSITION among ALL blanks
      // blank_0 = first blank in document → occurrenceIndex = 0
      // blank_1 = second blank in document → occurrenceIndex = 1
      // This is simply the index of this blank among all blank placeholders in document order
      let occurrenceIndex = 0;
      if (placeholders && Array.isArray(placeholders)) {
        // Get all blank placeholders in document order
        const allBlanksInOrder = placeholders.filter(p => /^blank_\d+$/.test(p));
        
        // Find this placeholder's index among all blanks
        occurrenceIndex = allBlanksInOrder.indexOf(normalizedKey);
        
        if (occurrenceIndex === -1) {
          console.error(`[DOCUMENT_GENERATOR] ERROR: "${normalizedKey}" not found in blanks array:`, allBlanksInOrder);
          occurrenceIndex = 0; // Fallback
        }
        
        console.log(`[DOCUMENT_GENERATOR] Blank placeholders in order:`, allBlanksInOrder);
        console.log(`[DOCUMENT_GENERATOR] "${normalizedKey}" is blank #${occurrenceIndex} (occurrence index: ${occurrenceIndex})`);
      }
      
      console.log(`[DOCUMENT_GENERATOR] Blank "${normalizedKey}" should be at occurrence index ${occurrenceIndex}`);
      
      // Find all blank placeholders in the current XML
      // CRITICAL: Match blanks that might have a dollar sign before them: $[________]
      // But also match standalone blanks: [________]
      // IMPORTANT: Handle blanks that might be split across XML tags like <w:t>$[</w:t><w:t>____</w:t><w:t>]</w:t>
      
      // Strategy 1: Try simple pattern first (blanks not split)
      const blankPattern = /(\$)?\[[_\-]{3,}\]/g;
      let match;
      blankPattern.lastIndex = 0;
      const allBlankMatches = [];
      
      // Collect all blank placeholders in order (including dollar sign if present)
      while ((match = blankPattern.exec(filledXml)) !== null) {
        const hasDollar = match[1] === '$';
        const fullMatch = match[0]; // This includes $ if present, e.g., "$[________]"
        const blankOnly = match[0].replace(/^\$/, ''); // Just "[________]"
        
        allBlankMatches.push({
          match: fullMatch, // Full match including $ if present
          blankOnly: blankOnly, // Just the blank part
          index: match.index,
          hasDollar: hasDollar
        });
      }
      
      // Strategy 2: If no blanks found, try to find blanks split across XML tags
      if (allBlankMatches.length === 0) {
        console.log(`[DOCUMENT_GENERATOR] No unsplit blanks found for "${normalizedKey}", trying split pattern...`);
        // Pattern that allows XML tags between brackets and underscores
        // Example: $[</w:t><w:t>____</w:t><w:t>] or $[____<w:r>] 
        const splitBlankPattern = /(\$)?\[(<[^>]*>)*[_\-]{3,}(<[^>]*>)*\]/gi;
        splitBlankPattern.lastIndex = 0;
        while ((match = splitBlankPattern.exec(filledXml)) !== null) {
          const hasDollar = match[1] === '$';
          const fullMatch = match[0];
          
          // Extract just the blank part by removing XML tags
          const blankOnly = fullMatch.replace(/^\$?/, '').replace(/<[^>]*>/g, '');
          
          allBlankMatches.push({
            match: fullMatch,
            blankOnly: blankOnly,
            index: match.index,
            hasDollar: hasDollar
          });
        }
        console.log(`[DOCUMENT_GENERATOR] Found ${allBlankMatches.length} split blanks for "${normalizedKey}"`);
      }
      
      // Debug: Log what we found
      console.log(`[DOCUMENT_GENERATOR] Searching for blank "${normalizedKey}" (occurrence ${occurrenceIndex}): Found ${allBlankMatches.length} total blanks`);
      if (allBlankMatches.length > 0) {
        console.log(`[DOCUMENT_GENERATOR] Sample blanks found:`, allBlankMatches.slice(0, 3).map(m => ({
          match: m.match.substring(0, 50),
          index: m.index,
          hasDollar: m.hasDollar
        })));
        console.log(`[DOCUMENT_GENERATOR] Will replace blank at occurrence index ${occurrenceIndex} (zero-based, so blank #${occurrenceIndex} in the list)`);
      }
      
      // CRITICAL: The occurrenceIndex is calculated based on document order (which blanks come before this one)
      // But allBlankMatches is in document order (first blank = index 0, second = index 1, etc.)
      // So occurrenceIndex directly corresponds to the index in allBlankMatches
      // However, we're processing in reverse order, so we need to make sure we're using the CURRENT state
      // Since we process in reverse order, blanks that come LATER in the document are processed FIRST
      // This means when we process blank_1, blank_0 might still be in the XML, so occurrenceIndex should be correct
      
      // Replace only the specific blank at the correct occurrence index
      if (occurrenceIndex >= 0 && occurrenceIndex < allBlankMatches.length) {
        const targetMatch = allBlankMatches[occurrenceIndex];
        console.log(`[DOCUMENT_GENERATOR] ✓ Found target blank at occurrence index ${occurrenceIndex}: "${targetMatch.match.substring(0, 30)}..." at XML position ${targetMatch.index}`);
      } else {
        console.error(`[DOCUMENT_GENERATOR] ERROR: occurrenceIndex ${occurrenceIndex} is out of range! Available indices: 0-${allBlankMatches.length - 1}`);
      }
      
      if (allBlankMatches[occurrenceIndex]) {
        const targetMatch = allBlankMatches[occurrenceIndex];
        
        // Check if this position hasn't already been replaced
        const checkBefore = filledXml.substring(Math.max(0, targetMatch.index - 50), targetMatch.index);
        const checkAfter = filledXml.substring(targetMatch.index + targetMatch.match.length, Math.min(filledXml.length, targetMatch.index + targetMatch.match.length + 50));
        
        if (!checkBefore.includes('<!--REPLACED-->') && !checkAfter.includes('<!--REPLACED-->')) {
          // Replace by position to ensure we get the exact match
          // If there's a dollar sign, replace the dollar sign too, or keep it if needed
          const beforeMatch = filledXml.substring(0, targetMatch.index);
          const afterMatch = filledXml.substring(targetMatch.index + targetMatch.match.length);
          
          // Escape XML special characters in the value
          const escapedValue = value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
          
          // If the blank had a dollar sign before it, we should keep the dollar sign
          // Since the value should already include formatting, just replace the blank part
          // However, if it's a monetary value, we might want to keep the $, but since
          // the user provides the value, they should include $ if needed.
          // For now, replace the entire match (including $ if present) with just the value
          filledXml = beforeMatch + escapedValue + '<!--REPLACED-->' + afterMatch;
          console.log(`[DOCUMENT_GENERATOR] ✓ Replaced blank placeholder "${normalizedKey}" (occurrence ${occurrenceIndex}) with "${value}"${targetMatch.hasDollar ? ' (removed $)' : ''}`);
        }
      } else {
        console.warn(`[DOCUMENT_GENERATOR] ⚠ Could not find blank placeholder "${normalizedKey}" at occurrence index ${occurrenceIndex} (found ${allBlankMatches.length} blanks)`);
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
          // IMPORTANT: Try ALL formats, not just the first one
          // Some placeholders appear multiple times with different casing
          originalFormats.forEach(originalFormat => {
            // Handle placeholders that might be split across XML tags
            // DOCX XML stores text in <w:t> tags, and placeholders can be split like:
            // <w:t>[COM</w:t><w:t>PANY]</w:t> for [COMPANY]
            
            // Strategy 1: Try direct match first (placeholder in single tag)
            const escapedFormat = originalFormat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const directRegex = new RegExp(escapedFormat, 'gi');
            const directMatches = (filledXml.match(directRegex) || []).length;
            
            if (directMatches > 0) {
              // Escape XML special characters in the value
              const escapedValue = value
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
              
              // Replace ALL occurrences (use global replace)
              filledXml = filledXml.replace(directRegex, escapedValue);
              
              // Verify replacement - but don't log success yet if we have more formats to try
              const afterMatches = (filledXml.match(directRegex) || []).length;
              if (afterMatches > 0) {
                console.warn(`[DOCUMENT_GENERATOR] ⚠️ "${originalFormat}" still found ${afterMatches} time(s) after replacement!`);
              } else if (directMatches > 0) {
                console.log(`[DOCUMENT_GENERATOR] ✓ Replaced "${originalFormat}" ${directMatches} time(s) with "${value}" (direct match)`);
              }
            } else {
              // Strategy 2: Handle split placeholders across XML tags
              // Extract the placeholder content (without brackets)
              const placeholderContent = originalFormat.replace(/^\[/, '').replace(/\]$/, '');
              
              // Create a regex that matches the placeholder even if split across tags
              // Match: [ + (optional XML tags) + placeholder content + (optional XML tags) + ]
              // Example: \[(<[^>]*>)*COM(<[^>]*>)*PANY(<[^>]*>)*\]
              
              // Build pattern for split placeholder
              // Split the placeholder content into characters that might be separated by XML tags
              const chars = placeholderContent.split('');
              const splitPattern = chars.map(char => {
                // Escape special regex characters
                const escapedChar = char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                // Allow optional XML tags before/after each character
                return `(<[^>]*>)*${escapedChar}`;
              }).join('(<[^>]*>)*');
              
              // Full pattern: [ + optional tags + placeholder chars (with optional tags) + optional tags + ]
              const splitRegex = new RegExp(`\\[(<[^>]*>)*${splitPattern}(<[^>]*>)*\\]`, 'gi');
              
              // Escape XML special characters in the value
              const escapedValue = value
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
              
              // Try to replace ALL occurrences
              let replaceCount = 0;
              filledXml = filledXml.replace(splitRegex, (match) => {
                replaceCount++;
                return escapedValue;
              });
              
              if (replaceCount > 0) {
                // Verify replacement worked
                const afterMatches = (filledXml.match(splitRegex) || []).length;
                if (afterMatches > 0) {
                  console.warn(`[DOCUMENT_GENERATOR] ⚠️ "${originalFormat}" still found ${afterMatches} time(s) after split replacement!`);
                } else {
                  console.log(`[DOCUMENT_GENERATOR] ✓ Replaced "${originalFormat}" ${replaceCount} time(s) with "${value}" (split across tags)`);
                }
              } else {
                // Strategy 3: Try matching without XML tags in between (normalize first)
                // Remove all XML tags temporarily, replace, then put tags back
                // This is complex, so let's try a simpler approach first
                
                // Try a more flexible pattern that allows whitespace and tags
                const flexiblePattern = `\\[(<[^>]*>|\\s)*${placeholderContent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(<[^>]*>|\\s)*\\]`;
                const flexibleRegex = new RegExp(flexiblePattern, 'gi');
                
                // Escape XML special characters in the value
                const escapedValue = value
                  .replace(/&/g, '&amp;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;');
                
                let flexibleReplaced = false;
                filledXml = filledXml.replace(flexibleRegex, (match) => {
                  flexibleReplaced = true;
                  return escapedValue;
                });
                
                if (flexibleReplaced) {
                  console.log(`[DOCUMENT_GENERATOR] ✓ Replaced "${originalFormat}" with "${value}" (flexible pattern)`);
                } else {
                  console.warn(`[DOCUMENT_GENERATOR] ⚠ Could not find "${originalFormat}" in XML`);
                }
              }
            }
          });
          
          // Final verification after trying all formats
          // Check if this placeholder key still exists in any form in the XML
          // Try multiple strategies to verify replacement
          let anyFormatFound = false;
          for (const format of originalFormats) {
            // Try exact match
            const escaped = format.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const exactRegex = new RegExp(escaped, 'gi');
            if (exactRegex.test(filledXml)) {
              anyFormatFound = true;
              console.warn(`[DOCUMENT_GENERATOR] ⚠️ Format "${format}" still found in XML after replacement!`);
              break;
            }
            
            // Try split format (in case XML tags interfere)
            const placeholderContent = format.replace(/^\[/, '').replace(/\]$/, '');
            const splitPattern = placeholderContent.split('').map(char => {
              const escapedChar = char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              return `(<[^>]*>)*${escapedChar}`;
            }).join('(<[^>]*>)*');
            const splitRegex = new RegExp(`\\[(<[^>]*>)*${splitPattern}(<[^>]*>)*\\]`, 'gi');
            if (splitRegex.test(filledXml)) {
              anyFormatFound = true;
              console.warn(`[DOCUMENT_GENERATOR] ⚠️ Format "${format}" still found in XML (split) after replacement!`);
              break;
            }
          }
          
          if (anyFormatFound) {
            console.warn(`[DOCUMENT_GENERATOR] ⚠️ Placeholder "${normalizedKey}" still found in XML after trying all ${originalFormats.length} format(s):`, originalFormats);
            // Try one more aggressive replacement pass
            originalFormats.forEach(originalFormat => {
              const placeholderContent = originalFormat.replace(/^\[/, '').replace(/\]$/, '');
              // Very flexible pattern that matches even if split weirdly
              const veryFlexiblePattern = `\\[(<[^>]*>|\\s|&[^;]+;)*${placeholderContent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').split('').join('(<[^>]*>|\\s)*')}(<[^>]*>|\\s|&[^;]+;)*\\]`;
              const veryFlexibleRegex = new RegExp(veryFlexiblePattern, 'gi');
              const escapedValue = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
              filledXml = filledXml.replace(veryFlexibleRegex, escapedValue);
            });
          } else {
            console.log(`[DOCUMENT_GENERATOR] ✓ All formats for "${normalizedKey}" successfully replaced`);
          }
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
              // Escape XML special characters in the value
              const escapedValue = value
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
              
              const regex = new RegExp(pattern, 'gi');
              filledXml = filledXml.replace(regex, escapedValue);
            });
          });
        }
      }
    });
    
    // Remove replacement markers
    filledXml = filledXml.replace(/<!--REPLACED-->/g, '');
    
    // VERIFICATION: Check if placeholders were actually replaced
    // Count remaining placeholders in the XML - try multiple matching strategies
    const remainingPlaceholders = [];
    Object.entries(filledValues).forEach(([normalizedKey, value]) => {
      if (!value || value.trim() === '') return; // Skip empty values
      
      if (formatMap && formatMap.has(normalizedKey)) {
        const formats = Array.from(formatMap.get(normalizedKey));
        formats.forEach(format => {
          // Strategy 1: Try exact match
          const escapedFormat = format.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const exactRegex = new RegExp(escapedFormat, 'gi');
          if (exactRegex.test(filledXml)) {
            if (!remainingPlaceholders.some(p => p.key === normalizedKey && p.format === format)) {
              remainingPlaceholders.push({ key: normalizedKey, format, type: 'exact' });
            }
          }
          
          // Strategy 2: Try split format match
          const placeholderContent = format.replace(/^\[/, '').replace(/\]$/, '');
          const chars = placeholderContent.split('');
          const splitPattern = chars.map(char => {
            const escapedChar = char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return `(<[^>]*>)*${escapedChar}`;
          }).join('(<[^>]*>)*');
          const splitRegex = new RegExp(`\\[(<[^>]*>)*${splitPattern}(<[^>]*>)*\\]`, 'gi');
          if (splitRegex.test(filledXml)) {
            if (!remainingPlaceholders.some(p => p.key === normalizedKey && p.format === format)) {
              remainingPlaceholders.push({ key: normalizedKey, format, type: 'split' });
            }
          }
        });
      }
    });
    
    // FINAL PASS: If placeholders remain, try one more aggressive replacement
    if (remainingPlaceholders.length > 0) {
      console.warn(`[DOCUMENT_GENERATOR] ⚠️ WARNING: ${remainingPlaceholders.length} placeholders still found in XML after replacement:`, remainingPlaceholders);
      console.log('[DOCUMENT_GENERATOR] Attempting final aggressive replacement pass...');
      
      remainingPlaceholders.forEach(({ key, format }) => {
        const value = filledValues[key];
        if (!value || value.trim() === '') return;
        
        const escapedValue = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const placeholderContent = format.replace(/^\[/, '').replace(/\]$/, '');
        
        // Very aggressive pattern that matches even if heavily split across XML tags
        const chars = placeholderContent.split('');
        const veryFlexiblePattern = `\\[(<[^>]*>|\\s|&[^;]+;)*${chars.map(c => {
          const ec = c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          return `(<[^>]*>|\\s|&[^;]+;)*${ec}`;
        }).join('(<[^>]*>|\\s|&[^;]+;)*')}(<[^>]*>|\\s|&[^;]+;)*\\]`;
        const veryFlexibleRegex = new RegExp(veryFlexiblePattern, 'gi');
        
        const beforeCount = (filledXml.match(veryFlexibleRegex) || []).length;
        filledXml = filledXml.replace(veryFlexibleRegex, escapedValue);
        const afterCount = (filledXml.match(veryFlexibleRegex) || []).length;
        
        if (beforeCount > 0 && afterCount === 0) {
          console.log(`[DOCUMENT_GENERATOR] ✓ Final pass: Replaced "${format}" for "${key}" (${beforeCount} occurrence(s))`);
        } else if (beforeCount > 0) {
          console.warn(`[DOCUMENT_GENERATOR] ⚠️ Final pass: "${format}" still found (${afterCount} remaining after replacing ${beforeCount})`);
        }
      });
      
      // Re-verify after final pass
      const stillRemaining = [];
      Object.entries(filledValues).forEach(([normalizedKey, value]) => {
        if (!value || value.trim() === '') return;
        if (formatMap && formatMap.has(normalizedKey)) {
          const formats = Array.from(formatMap.get(normalizedKey));
          formats.forEach(format => {
            const escaped = format.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escaped, 'gi');
            if (regex.test(filledXml)) {
              stillRemaining.push({ key: normalizedKey, format });
            }
          });
        }
      });
      
      if (stillRemaining.length > 0) {
        console.error(`[DOCUMENT_GENERATOR] ❌ ERROR: ${stillRemaining.length} placeholders STILL remain after final pass:`, stillRemaining);
      } else {
        console.log('[DOCUMENT_GENERATOR] ✓ Final pass successful: All remaining placeholders replaced');
      }
    } else {
      console.log('[DOCUMENT_GENERATOR] ✓ Verification: All placeholders successfully replaced in XML');
    }
    
    console.log('[DOCUMENT_GENERATOR] Filled XML length:', filledXml.length);
    console.log('[DOCUMENT_GENERATOR] Placeholders replaced successfully');
    
    // Update the document.xml in the zip
    // CRITICAL: PizZip requires proper file update to persist changes
    const docFile = zip.files['word/document.xml'];
    if (docFile) {
      // Verify the XML was actually modified
      const originalXmlLength = docXml.length;
      const modifiedXmlLength = filledXml.length;
      console.log('[DOCUMENT_GENERATOR] XML length change:', {
        original: originalXmlLength,
        modified: modifiedXmlLength,
        difference: modifiedXmlLength - originalXmlLength
      });
      
      // Convert XML string to Uint8Array (binary data)
      const encoder = new TextEncoder();
      const binaryData = encoder.encode(filledXml);
      
      // CRITICAL: Update the file in PizZip properly
      // Option 1: Use PizZip's file() method to replace
      zip.file('word/document.xml', binaryData);
      
      // Option 2: Also update internal _data to ensure persistence
      const updatedFile = zip.files['word/document.xml'];
      if (updatedFile) {
        updatedFile._data = binaryData;
        // Ensure options are set correctly
        updatedFile.options.binary = true;
        
        // Verify the update and check for remaining placeholders
        const verifyContent = updatedFile.asText();
        if (verifyContent.length === filledXml.length) {
          // Check if at least one filled value appears in the XML
          const hasFilledValue = Object.values(filledValues).some(val => 
            val && val.trim() && verifyContent.includes(val.trim())
          );
          
          // CRITICAL: Check if any placeholders still remain in the verified XML
          const stillRemaining = [];
          Object.entries(filledValues).forEach(([key, val]) => {
            if (formatMap && formatMap.has(key)) {
              const formats = Array.from(formatMap.get(key));
              formats.forEach(format => {
                const escaped = format.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(escaped, 'gi');
                if (regex.test(verifyContent)) {
                  stillRemaining.push({ key, format });
                }
              });
            }
          });
          
          if (stillRemaining.length > 0) {
            console.error(`[DOCUMENT_GENERATOR] ❌ ERROR: ${stillRemaining.length} placeholders still found in verified XML:`, stillRemaining);
          } else if (hasFilledValue) {
            console.log('[DOCUMENT_GENERATOR] ✓ Verified word/document.xml updated in zip with filled values');
          } else {
            console.warn('[DOCUMENT_GENERATOR] ⚠️ Warning: File updated but no filled values found in verification');
          }
        } else {
          console.warn('[DOCUMENT_GENERATOR] ⚠️ Warning: Updated file verification failed');
          console.warn('[DOCUMENT_GENERATOR] Expected length:', filledXml.length, 'Got:', verifyContent.length);
        }
      }
    } else {
      console.error('[DOCUMENT_GENERATOR] ERROR: word/document.xml not found in zip!');
      throw new Error('Document XML not found in DOCX file');
    }
    
    // Generate the new DOCX file as a blob
    // IMPORTANT: Use compression level 0 or 1 to ensure proper generation
    const blob = zip.generate({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      compression: 'DEFLATE',
      compressionOptions: { level: 1 }
    });
    
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

