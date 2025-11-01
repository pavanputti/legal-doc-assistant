import { useState, useEffect, useRef } from 'react';
import mammoth from 'mammoth';
import useDocumentStore from '../store/useDocumentStore';
import { downloadDocument } from '../services/documentGenerator';

const DocumentPreview = () => {
  const [previewHtml, setPreviewHtml] = useState('');
  const [error, setError] = useState(null);
  const previewRef = useRef(null);
  
  const { uploadedFile, documentHtml, filledValues, placeholders, placeholderFormatMap, currentQuestionIndex } = useDocumentStore();

  useEffect(() => {
    if (!uploadedFile) {
      setPreviewHtml('');
      return;
    }

    const generatePreview = async () => {
      try {
        setError(null);
        
        // Use stored HTML if available, otherwise convert
        let html = documentHtml;
        
        if (!html) {
          // Read the original file
          const arrayBuffer = await uploadedFile.arrayBuffer();
          
          // Convert DOCX to HTML for preview
          const result = await mammoth.convertToHtml({ arrayBuffer });
          html = result.value;
        }

        // IMPORTANT: Get current placeholder BEFORE any replacements or highlighting
        const currentPlaceholder = placeholders && placeholders.length > 0 && currentQuestionIndex >= 0 && currentQuestionIndex < placeholders.length 
          ? placeholders[currentQuestionIndex] 
          : null;
        
        // IMPORTANT: Collect all blank placeholders from ORIGINAL HTML BEFORE any modifications
        // This ensures we have the correct positions and order for mapping
        const originalBlankPattern = /\[[_-]{3,}\]/g;
        const originalBlankMatches = [];
        let originalBlankMatch;
        originalBlankPattern.lastIndex = 0;
        while ((originalBlankMatch = originalBlankPattern.exec(html)) !== null) {
          if (originalBlankMatch && originalBlankMatch[0]) {
            originalBlankMatches.push({
              match: originalBlankMatch[0],
              index: originalBlankMatch.index,
              fullMatch: originalBlankMatch[0]
            });
          }
        }
        
        // STEP 1: Highlight UNFILLED placeholders FIRST (before replacement)
        // This ensures we can highlight the current question even if it hasn't been filled yet
        // IMPORTANT: Mammoth.js may add HTML tags inside brackets: [<strong>COMPANY], [<em>name</em>]
        if (placeholders && Array.isArray(placeholders) && placeholders.length > 0) {
          // Pattern to match placeholders with optional HTML tags inside brackets
          // IMPORTANT: Use a more flexible pattern that matches anything inside brackets except brackets themselves
          // Then extract the actual placeholder name by stripping HTML tags
          const placeholderPatterns = [
            /\[[^[\]]*([a-zA-Z_][a-zA-Z0-9_\s-]*)[^[\]]*\]/gi,  // Matches: [COMPANY], [<strong>COMPANY], [<em>name</em>], etc.
            /\{\{?([a-zA-Z_][a-zA-Z0-9_\s-]*)\}?\}/g              // {{name}} or {name}
          ];
          
          // Collect all unfilled placeholder matches
          const allUnfilledMatches = [];
          placeholderPatterns.forEach(pattern => {
            let match;
            pattern.lastIndex = 0;
            while ((match = pattern.exec(html)) !== null) {
              // Extract the placeholder key from the full match
              // IMPORTANT: Don't rely on match[1] because it might capture the wrong part (e.g., "strong" from "<strong>COMPANY")
              // Instead, extract the actual placeholder name by stripping HTML tags and brackets from the full match
              const fullMatch = match[0];
              
              // Strip all HTML tags and brackets to get the actual placeholder name
              // For [<strong>COMPANY], this will give us "COMPANY"
              // For [<em>name</em>], this will give us "name"
              // For [COMPANY], this will give us "COMPANY"
              let cleanContent = fullMatch
                .replace(/<[^>]*>/g, '')  // Remove HTML tags: <strong>, </strong>, <em>, </em>, etc.
                .replace(/[[\]{}]/g, '')  // Remove brackets: [, ], {, }
                .trim();
              
              let placeholderKey = cleanContent.replace(/\s+/g, '_').replace(/-/g, '_').toLowerCase();
              
              // Skip empty or invalid placeholders
              if (!placeholderKey || placeholderKey.length < 2) {
                continue;
              }
              
              // Skip blank placeholders (handled separately later)
              if (/^blank_\d+$/.test(placeholderKey) || /^[_-]{3,}$/.test(placeholderKey)) {
                continue;
              }
              
              // Check if this placeholder has already been processed
              const checkString = html.substring(
                Math.max(0, match.index - 50),
                Math.min(html.length, match.index + match[0].length + 50)
              );
              
              if (checkString.includes('background-color: #d4edda') || 
                  checkString.includes('background-color: #fff3cd') ||
                  checkString.includes('background-color: #2196f3')) {
                // Already processed, skip
                continue;
              }
              
              // Check if this placeholder has been filled
              const isFilled = filledValues[placeholderKey] && filledValues[placeholderKey].trim() !== '';
              
              // Only collect UNFILLED placeholders for highlighting
              if (!isFilled) {
                allUnfilledMatches.push({
                  fullMatch: fullMatch,
                  placeholderKey: placeholderKey,
                  index: match.index,
                  length: fullMatch.length
                });
              }
            }
          });
          
          // Process matches in reverse order to preserve indices
          for (let i = allUnfilledMatches.length - 1; i >= 0; i--) {
            const matchObj = allUnfilledMatches[i];
            const { fullMatch, placeholderKey, index, length } = matchObj;
            
            // Check if this is the current question being asked
            const normalizedCurrent = currentPlaceholder ? currentPlaceholder.toLowerCase() : null;
            const normalizedMatch = placeholderKey.toLowerCase();
            const isCurrentQuestion = normalizedCurrent === normalizedMatch;
            
            let replacement;
            if (isCurrentQuestion) {
              // Highlight current question with blue pulsing animation
              replacement = `<span id="current-question-highlight" style="background-color: #2196f3; padding: 4px 8px; border-radius: 4px; border: 2px solid #1976d2; color: #fff; font-weight: bold; animation: pulse 2s infinite;">${fullMatch}</span>`;
            } else {
              // Highlight other unfilled placeholders in yellow
              replacement = `<span style="background-color: #fff3cd; padding: 2px 6px; border-radius: 3px; border: 1px dashed #ffc107; color: #856404; font-style: italic; font-weight: 500;">${fullMatch}</span>`;
            }
            
            // Replace in HTML
            const beforeMatch = html.substring(0, index);
            const afterMatch = html.substring(index + length);
            html = beforeMatch + replacement + afterMatch;
          }
        }
        
        // STEP 2: Now replace placeholders with filled values
            // Use the original placeholder formats from the document for accurate matching
            // IMPORTANT: For blank placeholders ($[________]), we need to replace each occurrence separately
            // by using the exact position and context to ensure uniqueness
            Object.entries(filledValues).forEach(([normalizedKey, value]) => {
              if (!value || value.trim() === '') return; // Skip empty values

              // Get original formats for this placeholder from the document
              let originalFormats = [];
              if (placeholderFormatMap && placeholderFormatMap instanceof Map) {
                if (placeholderFormatMap.has(normalizedKey)) {
                  originalFormats = Array.from(placeholderFormatMap.get(normalizedKey));
                } else {
                  // Try to find case-insensitive matches
                  for (const [key, formats] of placeholderFormatMap.entries()) {
                    if (key.toLowerCase() === normalizedKey.toLowerCase()) {
                      originalFormats = Array.from(formats);
                      break;
                    }
                  }
                }
              }

              // For blank placeholders, we need special handling to ensure each one is replaced uniquely
              // Each blank placeholder should only replace its specific occurrence, not all similar patterns
              if (/^blank_\d+$/.test(normalizedKey)) {
                const blankPattern = /\[[_-]{3,}\]/g;
                let match;
                blankPattern.lastIndex = 0;
                
                // Find which occurrence of [________] in the HTML corresponds to this placeholder key
                // Count unfilled blank placeholders that come before this one in the placeholders array
                // IMPORTANT: Count by position in document (placeholders array order), not by blank number
                let occurrenceIndex = 0;
                for (let j = 0; j < placeholders.length; j++) {
                  const key = placeholders[j];
                  if (key === normalizedKey) break; // Stop when we reach this placeholder
                  if (/^blank_\d+$/.test(key)) {
                    // This is a blank placeholder that appears before our current placeholder in the document
                    // Check if this previous blank is still unfilled (exists in HTML)
                    const isOtherFilled = filledValues[key] && filledValues[key].trim() !== '';
                    if (!isOtherFilled) {
                      occurrenceIndex++; // Count unfilled blanks by document order, not by blank number
                    }
                  }
                }
                
                // Now find the blank placeholder in HTML at this occurrence index
                const allBlankMatches = [];
                blankPattern.lastIndex = 0;
                while ((match = blankPattern.exec(html)) !== null) {
                  // Check if this match has already been replaced
                  const checkString = html.substring(
                    Math.max(0, match.index - 50), 
                    Math.min(html.length, match.index + match[0].length + 50)
                  );
                  if (!checkString.includes('background-color: #d4edda') && 
                      !checkString.includes('background-color: #fff3cd') &&
                      !checkString.includes('background-color: #2196f3')) {
                    allBlankMatches.push({
                      match: match[0],
                      index: match.index,
                      fullMatch: match[0]
                    });
                  }
                }
                
                // Only replace the specific blank placeholder at the correct occurrence index
                if (allBlankMatches[occurrenceIndex]) {
                  const targetMatch = allBlankMatches[occurrenceIndex];
                  // Check if this specific match hasn't been replaced yet
                  const htmlBeforeMatch = html.substring(0, targetMatch.index);
                  const htmlAfterMatch = html.substring(targetMatch.index + targetMatch.match.length);
                  const checkString = html.substring(
                    Math.max(0, targetMatch.index - 50), 
                    Math.min(html.length, targetMatch.index + targetMatch.match.length + 50)
                  );
                  
                  if (!checkString.includes('background-color: #d4edda') && !checkString.includes('background-color: #fff3cd')) {
                    // Replace only this specific occurrence
                    let replacement;
                    if (value.startsWith('data:image')) {
                      replacement = `<img src="${value}" alt="Signature" style="max-width: 200px; max-height: 60px; border: 1px solid #c3e6cb; border-radius: 3px; vertical-align: middle;" />`;
                    } else {
                      // Replace the [________] part only - don't add a $ if one already exists before it
                      // The dollar sign before [________] will remain in place automatically
                      replacement = `<span style="background-color: #d4edda; padding: 2px 6px; border-radius: 3px; font-weight: 500; color: #155724; border: 1px solid #c3e6cb;">${value}</span>`;
                    }
                    
                    html = htmlBeforeMatch + replacement + htmlAfterMatch;
                  }
                }
              } else {
                // For non-blank placeholders, use the original format matching
                // IMPORTANT: Mammoth.js may add HTML tags inside brackets: [<strong>COMPANY], [<em>name</em>]
                // We need to match both simple format [COMPANY] and HTML-tagged format [<strong>COMPANY]
                if (originalFormats.length > 0) {
                  originalFormats.forEach(originalFormat => {
                    // Extract the actual placeholder name from the original format
                    // e.g., "[COMPANY]" → "COMPANY", "[name]" → "name"
                    const placeholderName = originalFormat.replace(/[[\]]/g, '').trim();
                    
                    // Pattern to match both simple format and HTML-tagged format
                    // Matches: [COMPANY], [<strong>COMPANY], [<em>name</em>], etc.
                    // Escape the placeholder name for regex
                    const escapedName = placeholderName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    // Pattern matches brackets with optional HTML tags inside
                    const patternWithHTML = new RegExp(`\\[\\s*<[^>]*>?\\s*([^<]*${escapedName}[^<]*)\\s*<?/?[^>]*>?\\s*\\]`, 'gi');
                    
                    const beforeReplace = html;
                    let replacementCount = 0;
                    
                    // IMPORTANT: Check surrounding HTML to see if this placeholder was already highlighted in STEP 1
                    // We need to avoid replacing placeholders that were highlighted (they might be the current question)
                    // Pattern to find placeholders (both with and without HTML tags)
                    // First, find all matches with their positions
                    const matchesToReplace = [];
                    let m;
                    patternWithHTML.lastIndex = 0;
                    while ((m = patternWithHTML.exec(html)) !== null) {
                      const actualContent = (m[1] || '').replace(/<[^>]*>/g, '').trim();
                      if (actualContent.toLowerCase() === placeholderName.toLowerCase()) {
                        // Check if this match has already been highlighted or replaced
                        const checkStr = html.substring(
                          Math.max(0, m.index - 50),
                          Math.min(html.length, m.index + m[0].length + 50)
                        );
                        if (!checkStr.includes('background-color: #d4edda') && 
                            !checkStr.includes('background-color: #fff3cd') &&
                            !checkStr.includes('background-color: #2196f3')) {
                          matchesToReplace.push({
                            match: m[0],
                            index: m.index,
                            length: m[0].length
                          });
                        }
                      }
                    }
                    
                    // Also try simple format
                    const escapedFormat = originalFormat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const simpleRegex = new RegExp(escapedFormat, 'gi');
                    simpleRegex.lastIndex = 0;
                    while ((m = simpleRegex.exec(html)) !== null) {
                      // Check if this match has already been highlighted or replaced
                      const checkStr = html.substring(
                        Math.max(0, m.index - 50),
                        Math.min(html.length, m.index + m[0].length + 50)
                      );
                      if (!checkStr.includes('background-color: #d4edda') && 
                          !checkStr.includes('background-color: #fff3cd') &&
                          !checkStr.includes('background-color: #2196f3')) {
                        // Check if this match isn't already in matchesToReplace
                        const alreadyAdded = matchesToReplace.some(existing => 
                          Math.abs(existing.index - m.index) < 10
                        );
                        if (!alreadyAdded) {
                          matchesToReplace.push({
                            match: m[0],
                            index: m.index,
                            length: m[0].length
                          });
                        }
                      }
                    }
                    
                    // Replace matches in reverse order to preserve indices
                    for (let i = matchesToReplace.length - 1; i >= 0; i--) {
                      const matchObj = matchesToReplace[i];
                      replacementCount++;
                      
                      const beforeMatch = html.substring(0, matchObj.index);
                      const afterMatch = html.substring(matchObj.index + matchObj.length);
                      
                      let replacement;
                      // Check if value is a signature image (base64)
                      if (value.startsWith('data:image')) {
                        replacement = `<img src="${value}" alt="Signature" style="max-width: 200px; max-height: 60px; border: 1px solid #c3e6cb; border-radius: 3px; vertical-align: middle;" />`;
                      } else {
                        replacement = `<span style="background-color: #d4edda; padding: 2px 6px; border-radius: 3px; font-weight: 500; color: #155724; border: 1px solid #c3e6cb;">${value}</span>`;
                      }
                      
                      html = beforeMatch + replacement + afterMatch;
                    }
                    
                    if (replacementCount === 0 && beforeReplace === html) {
                      // Original format not found
                    }
                  });
                }
              }
          
          // Also try generic patterns as fallback (in case formats weren't captured)
          // Generate all possible case variations for better matching
          const generateCaseVariations = (key) => {
            const variations = new Set([key]);
            // Add common variations
            variations.add(key.toUpperCase());  // COMPANY
            variations.add(key.toLowerCase());  // company
            variations.add(key.charAt(0).toUpperCase() + key.slice(1).toLowerCase()); // Company
            // Add variations with spaces
            const withSpaces = key.replace(/_/g, ' ');
            variations.add(withSpaces);
            variations.add(withSpaces.toUpperCase());
            variations.add(withSpaces.toLowerCase());
            variations.add(withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1).toLowerCase());
            // Add variations with hyphens
            const withHyphens = key.replace(/_/g, '-');
            variations.add(withHyphens);
            variations.add(withHyphens.toUpperCase());
            variations.add(withHyphens.toLowerCase());
            return Array.from(variations);
          };
          
          const keyVariations = generateCaseVariations(normalizedKey);
          
          keyVariations.forEach(keyVar => {
            const escapedKey = keyVar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // Patterns for square brackets [name] - case insensitive matching
            const squareBracketPatterns = [
              new RegExp(`\\[${escapedKey}\\]`, 'gi'),  // [COMPANY], [company], [Company]
              new RegExp(`\\[\\s*${escapedKey}\\s*\\]`, 'gi'),  // [ COMPANY ], [ company ]
            ];
            // Patterns for curly braces {{name}} or {name}
            const curlyBracePatterns = [
              new RegExp(`\\{\\{${escapedKey}\\}\\}`, 'gi'),
              new RegExp(`\\{\\{\\s*${escapedKey}\\s*\\}\\}`, 'gi'),
              new RegExp(`\\{${escapedKey}\\}`, 'gi'),
              new RegExp(`\\{\\s*${escapedKey}\\s*\\}`, 'gi'),
            ];
            
            // Replace square bracket placeholders (case-insensitive)
            squareBracketPatterns.forEach(pattern => {
              html = html.replace(pattern, (match) => {
                // Only replace if not already replaced (check if it still contains brackets)
                if (match.includes('[') || match.includes(']')) {
                  // Check if this match has already been replaced by checking if it's wrapped in a span
                  if (!match.includes('background-color: #d4edda')) {
                    // Check if value is a signature image (base64)
                    if (value.startsWith('data:image')) {
                      return `<img src="${value}" alt="Signature" style="max-width: 200px; max-height: 60px; border: 1px solid #c3e6cb; border-radius: 3px; vertical-align: middle;" />`;
                    }
                    return `<span style="background-color: #d4edda; padding: 2px 6px; border-radius: 3px; font-weight: 500; color: #155724; border: 1px solid #c3e6cb;">${value}</span>`;
                  }
                }
                return match;
              });
            });
            
            // Replace curly brace placeholders
            curlyBracePatterns.forEach(pattern => {
              html = html.replace(pattern, (match) => {
                // Only replace if not already replaced (check if it still contains braces)
                if (match.includes('{') || match.includes('}')) {
                  // Check if this match has already been replaced
                  if (!match.includes('background-color: #d4edda')) {
                    // Check if value is a signature image (base64)
                    if (value.startsWith('data:image')) {
                      return `<img src="${value}" alt="Signature" style="max-width: 200px; max-height: 60px; border: 1px solid #c3e6cb; border-radius: 3px; vertical-align: middle;" />`;
                    }
                    return `<span style="background-color: #d4edda; padding: 2px 6px; border-radius: 3px; font-weight: 500; color: #155724; border: 1px solid #c3e6cb;">${value}</span>`;
                  }
                }
                return match;
              });
            });
          });
          
          // Additional fallback: Direct case-insensitive match for square brackets
          // This catches cases where the key might be "company" but the document has "[COMPANY]" or "[<strong>COMPANY]"
          // Handle HTML tags inside brackets: [<strong>COMPANY], [<em>name</em>], etc.
          const normalizedKeyForMatch = normalizedKey.replace(/_/g, '[\\s_-]+');
          // Pattern matches: [COMPANY], [<strong>COMPANY], [<em>name</em>], etc.
          const directSquareBracketPattern = new RegExp(`\\[\\s*<[^>]*>?\\s*([^<]*${normalizedKeyForMatch}[^<]*)\\s*<?/?[^>]*>?\\s*\\]`, 'gi');
          
          html = html.replace(directSquareBracketPattern, (match, content) => {
            // Extract actual placeholder name (strip any remaining HTML)
            const actualContent = (content || '').replace(/<[^>]*>/g, '').trim();
            const normalizedContent = actualContent.replace(/\s+/g, '_').replace(/-/g, '_').toLowerCase();
            const normalizedKeyLower = normalizedKey.toLowerCase();
            
            // Only replace if content matches our key (case-insensitive)
            if (normalizedContent === normalizedKeyLower && 
                (match.includes('[') || match.includes(']')) && 
                !match.includes('background-color: #d4edda') && 
                !match.includes('background-color: #fff3cd') &&
                !match.includes('background-color: #2196f3')) {
              // Check if value is a signature image (base64)
              if (value.startsWith('data:image')) {
                return `<img src="${value}" alt="Signature" style="max-width: 200px; max-height: 60px; border: 1px solid #c3e6cb; border-radius: 3px; vertical-align: middle;" />`;
              }
              return `<span style="background-color: #d4edda; padding: 2px 6px; border-radius: 3px; font-weight: 500; color: #155724; border: 1px solid #c3e6cb;">${value}</span>`;
            }
            return match;
          });
        });
        
        // Skip implicit placeholder replacement - only process explicit [placeholder] placeholders
        // All placeholders should already be replaced in STEP 2 above
        // Highlighting for unfilled placeholders was done in STEP 1 above
        
        // Highlight remaining unfilled placeholders (those that still have brackets/braces)
        // Also highlight the current question being asked
        // Add defensive check to prevent undefined access
        if (!placeholders || !Array.isArray(placeholders) || placeholders.length === 0) {
          // Still process the HTML but skip highlighting
        }
        
        // First, handle blank placeholders like [________] - ALWAYS check for them, not just when currentPlaceholder is blank
        // IMPORTANT: Use originalBlankMatches which we collected from ORIGINAL HTML
        // This ensures we have ALL blanks, even if some have been replaced
        // We need to map each original blank to its placeholder key by document position
        const allBlankMatches = originalBlankMatches.map(m => ({
          match: m.match,
          index: m.index,
          fullMatch: m.fullMatch,
          originalIndex: originalBlankMatches.indexOf(m) // Track original position
        }));
        
        // Now, for each blank placeholder key, determine which original blank it corresponds to
        // The order in placeholders array matches the order in originalBlankMatches
        // So blank_0 -> originalBlankMatches[0], blank_1 -> originalBlankMatches[1], etc.
        const blankKeyToOriginalIndex = new Map(); // Maps placeholderKey -> original blank index
        
        if (placeholders && Array.isArray(placeholders)) {
          // Get all blank placeholder keys in document order
          const allBlankKeys = placeholders.filter(p => /^blank_\d+$/.test(p));
          
          // Map each blank key to its position in the original blanks array
          // The position in placeholders array matches the position in originalBlankMatches
          allBlankKeys.forEach((placeholderKey, indexInBlanks) => {
            if (indexInBlanks < originalBlankMatches.length) {
              blankKeyToOriginalIndex.set(placeholderKey, indexInBlanks);
            }
          });
        }
        
        // DEBUG: Log blank placeholder mapping
        console.log('[BLANK_HIGHLIGHT] Current question:', currentPlaceholder);
        console.log('[BLANK_HIGHLIGHT] Found blanks in HTML:', allBlankMatches.length, 'at positions:', allBlankMatches.map(m => m.index));
        console.log('[BLANK_HIGHLIGHT] Placeholders array:', placeholders.filter(p => /^blank_\d+$/.test(p)));
        console.log('[BLANK_HIGHLIGHT] Filled blanks:', Object.keys(filledValues).filter(k => /^blank_\d+$/.test(k) && filledValues[k]?.trim()).map(k => `${k}="${filledValues[k]}"`));
        
        // Map original blank index to placeholder key
        // We now have blankKeyToOriginalIndex which maps placeholderKey -> original blank index
        // We need the reverse: original blank index -> placeholder key
        const originalIndexToPlaceholderKey = new Map(); // Maps original blank index -> placeholder key
        blankKeyToOriginalIndex.forEach((originalIndex, placeholderKey) => {
          originalIndexToPlaceholderKey.set(originalIndex, placeholderKey);
        });
        
        // DEBUG: Log final mapping
        console.log('[BLANK_HIGHLIGHT] Key to Original Index:', Array.from(blankKeyToOriginalIndex.entries()).map(([key, idx]) => `${key}→orig#${idx}`).join(', '));
        console.log('[BLANK_HIGHLIGHT] Original Index to Key:', Array.from(originalIndexToPlaceholderKey.entries()).map(([idx, key]) => `orig#${idx}→${key}`).join(', '));
        
        // IMPORTANT: Collect unfilled blanks from CURRENT HTML (same as replacement logic)
        // This ensures we get the actual positions in the current HTML state
        const currentBlankPattern = /\[[_-]{3,}\]/g;
        const currentBlankMatches = [];
        let currentBlankMatch;
        currentBlankPattern.lastIndex = 0;
        while ((currentBlankMatch = currentBlankPattern.exec(html)) !== null) {
          const matchIndex = currentBlankMatch.index;
          const matchText = currentBlankMatch[0];
          
          // Check if this match hasn't been replaced
          const checkString = html.substring(
            Math.max(0, matchIndex - 100),
            Math.min(html.length, matchIndex + matchText.length + 100)
          );
          
          if (!checkString.includes('background-color: #d4edda') &&
              !checkString.includes('background-color: #fff3cd') &&
              !checkString.includes('background-color: #2196f3')) {
            // This is an unfilled blank - add it
            currentBlankMatches.push({
              match: matchText,
              index: matchIndex,
              fullMatch: matchText
            });
          }
        }
        
        // Now map current unfilled blanks to placeholder keys using the SAME logic as replacement
        // IMPORTANT: This must match the download logic exactly
        // Build list of unfilled blank placeholder keys in document order (same as download)
        const unfilledBlankKeys = [];
        if (placeholders && Array.isArray(placeholders)) {
          for (let j = 0; j < placeholders.length; j++) {
            const key = placeholders[j];
            if (/^blank_\d+$/.test(key)) {
              const isFilled = filledValues[key] && filledValues[key].trim() !== '';
              if (!isFilled) {
                unfilledBlankKeys.push(key);
              }
            }
          }
        }
        
        // CRITICAL FIX: Map current HTML blanks to placeholder keys using the SAME occurrence index logic as download
        // For each placeholder key, calculate its occurrence index (same as download logic)
        // Then find the HTML blank at that occurrence index
        const placeholderKeyToOccurrenceIndex = new Map();
        // CRITICAL FIX: Calculate occurrence index the SAME way as download
        // Simply get the index of this blank among ALL blanks in document order
        const allBlanksInOrder = (placeholders || []).filter(p => /^blank_\d+$/.test(p));
        
        unfilledBlankKeys.forEach(placeholderKey => {
          // Find this placeholder's index among all blanks (same logic as download)
          const occurrenceIndex = allBlanksInOrder.indexOf(placeholderKey);
          
          if (occurrenceIndex !== -1) {
            placeholderKeyToOccurrenceIndex.set(placeholderKey, occurrenceIndex);
            console.log(`[BLANK_HIGHLIGHT] Blank "${placeholderKey}" is at occurrence index ${occurrenceIndex} among all blanks:`, allBlanksInOrder);
          } else {
            console.warn(`[BLANK_HIGHLIGHT] ⚠️ Blank "${placeholderKey}" not found in all blanks array`);
          }
        });
        
        // Now map HTML blanks to placeholder keys by occurrence index
        // The HTML blank at occurrence index N maps to the placeholder key that also has occurrence index N
        const currentBlankToPlaceholderKey = new Map();
        currentBlankMatches.forEach((currentBlank, htmlIndex) => {
          // Find the placeholder key that has occurrence index matching this HTML blank's index
          for (const [placeholderKey, occIndex] of placeholderKeyToOccurrenceIndex.entries()) {
            if (occIndex === htmlIndex) {
              currentBlankToPlaceholderKey.set(currentBlank, placeholderKey);
              console.log(`[BLANK_HIGHLIGHT] Mapped HTML blank #${htmlIndex} (occurrence ${occIndex}) at position ${currentBlank.index} to placeholder key: ${placeholderKey}`);
              break;
            }
          }
        });
        
        // Now handle highlighting for blank placeholders
        // Process in reverse order to preserve indices
        for (let i = currentBlankMatches.length - 1; i >= 0; i--) {
          const blankMatch = currentBlankMatches[i];
          const placeholderKey = currentBlankToPlaceholderKey.get(blankMatch);
          
          if (!placeholderKey) {
            continue;
          }
          
          const isCurrentQuestion = currentPlaceholder === placeholderKey;
          const isFilled = filledValues[placeholderKey] && filledValues[placeholderKey].trim() !== '';
          
          // DEBUG: Log highlighting decision
          console.log(`[BLANK_HIGHLIGHT] Processing current HTML blank #${i} at position ${blankMatch.index}:`, {
            placeholderKey,
            isCurrentQuestion,
            currentPlaceholder,
            isFilled
          });
          
          // Skip if already filled
          if (isFilled) {
            continue;
          }
          
          const blankIndex = blankMatch.index;
          
          // Find dollar sign before this blank
          let dollarIndex = -1;
          for (let j = blankIndex - 1; j >= Math.max(0, blankIndex - 15); j--) {
            if (html[j] === '$') {
              const dollarCheck = html.substring(Math.max(0, j - 50), j + 5);
              if (!dollarCheck.includes('background-color')) {
                dollarIndex = j;
                break;
              }
            }
          }
          
          const hasDollarBefore = dollarIndex !== -1;
          
          let replacement;
          if (isCurrentQuestion) {
            // Highlight current question with blue background and pulsing animation
            console.log(`[BLANK_HIGHLIGHT] ✓ HIGHLIGHTING HTML blank #${i} (key="${placeholderKey}") as CURRENT QUESTION at position ${blankIndex}${hasDollarBefore ? ' with $' : ''}`);
            if (hasDollarBefore) {
              // Replace both dollar sign and placeholder together
              const beforeDollar = html.substring(0, dollarIndex);
              const afterBlank = html.substring(blankIndex + blankMatch.match.length);
              replacement = `<span id="current-question-highlight" style="background-color: #2196f3; padding: 4px 8px; border-radius: 4px; border: 2px solid #1976d2; color: #fff; font-weight: bold; animation: pulse 2s infinite;">$${blankMatch.match}</span>`;
              html = beforeDollar + replacement + afterBlank;
            } else {
              // Just highlight the placeholder
              replacement = `<span id="current-question-highlight" style="background-color: #2196f3; padding: 4px 8px; border-radius: 4px; border: 2px solid #1976d2; color: #fff; font-weight: bold; animation: pulse 2s infinite;">${blankMatch.match}</span>`;
              html = html.substring(0, blankIndex) + replacement + html.substring(blankIndex + blankMatch.match.length);
            }
          } else {
            // Highlight unfilled blank placeholders in yellow (don't log these to reduce noise)
            if (hasDollarBefore) {
              // Replace both dollar sign and placeholder together
              const beforeDollar = html.substring(0, dollarIndex);
              const afterBlank = html.substring(blankIndex + blankMatch.match.length);
              replacement = `<span style="background-color: #fff3cd; padding: 2px 6px; border-radius: 3px; border: 1px dashed #ffc107; color: #856404; font-style: italic; font-weight: 500;">$${blankMatch.match}</span>`;
              html = beforeDollar + replacement + afterBlank;
            } else {
              // Just highlight the placeholder
              replacement = `<span style="background-color: #fff3cd; padding: 2px 6px; border-radius: 3px; border: 1px dashed #ffc107; color: #856404; font-style: italic; font-weight: 500;">${blankMatch.match}</span>`;
              html = html.substring(0, blankIndex) + replacement + html.substring(blankIndex + blankMatch.match.length);
            }
          }
        }
        
        // Regular placeholders highlighting was already done in STEP 1 above (before replacement)
        // This section is kept for reference but regular placeholders are already handled
        
        // Skip highlighting implicit placeholders - only highlight explicit [placeholder] placeholders
        // All placeholders should be in bracket format and already handled above

        // Remove investor section placeholders and [needs value] placeholders from preview
        // Remove everything from "INVESTOR:" onwards that contains placeholders
        const htmlLower = html.toLowerCase();
        const investorIndex = htmlLower.indexOf('investor:');
        
        if (investorIndex !== -1) {
          // Find the investor section start
          let sectionStart = investorIndex;
          
          // Look backwards to find the start of the paragraph/div containing INVESTOR:
          for (let i = investorIndex - 1; i >= Math.max(0, investorIndex - 300); i--) {
            if (html.substring(i, i + 4) === '<p>' || 
                html.substring(i, i + 5) === '<div' ||
                (html[i] === '>' && html.substring(Math.max(0, i - 10), i).includes('<p'))) {
              let tagStart = i;
              while (tagStart > 0 && html[tagStart] !== '<') {
                tagStart--;
              }
              if (html[tagStart] === '<') {
                sectionStart = tagStart;
                break;
              }
            }
          }
          
          // Remove everything from the investor section onwards
          html = html.substring(0, sectionStart);
          
          // Clean up any trailing whitespace or incomplete HTML
          html = html.trim();
          
          // Remove incomplete tags at the end
          let lastOpenTag = html.lastIndexOf('<');
          let lastCloseTag = html.lastIndexOf('>');
          
          // If there's an open tag without a closing bracket, remove it
          if (lastOpenTag > lastCloseTag) {
            html = html.substring(0, lastOpenTag);
          }
          
          // Remove any trailing incomplete tags
          html = html.replace(/<[^>]*$/, '');
          html = html.trim();
        }
        
        // Also remove any remaining placeholder patterns like [needs value] or [________]
        // These are the yellow highlighted placeholders that weren't filled
        html = html.replace(/<span[^>]*>\[needs value\]<\/span>/gi, '');
        html = html.replace(/\[needs value\]/gi, '');
        html = html.replace(/\[________\]/gi, '');
        html = html.replace(/\[_+\]/g, '');
        
        setPreviewHtml(html);
        
        // Auto-scroll to current question after a short delay to allow HTML to render
        if (placeholders && Array.isArray(placeholders) && placeholders.length > 0 && 
            currentQuestionIndex >= 0 && currentQuestionIndex < placeholders.length) {
          setTimeout(() => {
            const highlightElement = document.getElementById('current-question-highlight');
            if (highlightElement && previewRef.current) {
              highlightElement.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center',
                inline: 'nearest'
              });
            }
          }, 300);
        }
      } catch (err) {
        console.error('Error generating preview:', err);
        setError('Failed to generate preview');
      }
    };

    generatePreview();
  }, [uploadedFile, filledValues, documentHtml, placeholderFormatMap, currentQuestionIndex, placeholders]);

  const handleDownload = async () => {
    if (!uploadedFile) return;
    
    try {
      console.log('[DocumentPreview] Download initiated...');
      console.log('[DocumentPreview] Filled values:', filledValues);
      console.log('[DocumentPreview] Placeholders:', placeholders);
      console.log('[DocumentPreview] PlaceholderFormatMap:', placeholderFormatMap);
      
      await downloadDocument(uploadedFile, filledValues, placeholderFormatMap, placeholders, 'completed-document.docx');
      
      console.log('[DocumentPreview] Download completed successfully');
    } catch (err) {
      console.error('[DocumentPreview] Error downloading document:', err);
      alert('Failed to download document. Please try again.');
    }
  };

  const allFieldsFilled = placeholders.length > 0 && 
    Object.keys(filledValues).length === placeholders.length;

  if (!uploadedFile) {
    return (
      <div className="document-preview">
        <div className="preview-placeholder">
          <p>Upload a document to see the preview</p>
        </div>
      </div>
    );
  }

  return (
    <div className="document-preview">
      <div className="preview-header">
        <h3>Document</h3>
        <button 
          onClick={handleDownload} 
          className="download-button"
          disabled={!allFieldsFilled}
          title={!allFieldsFilled ? 'Please fill in all fields first' : 'Download completed document'}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          {allFieldsFilled ? 'Download' : 'Complete Fields'}
        </button>
      </div>
      
      {error && (
        <div className="error-message">{error}</div>
      )}
      
       <div className="preview-content" ref={previewRef}>
         {previewHtml ? (
           <div 
             className="preview-html"
             dangerouslySetInnerHTML={{ __html: previewHtml }}
           />
         ) : (
          <div className="preview-loading" style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: '#999'
          }}>
            Loading preview...
          </div>
        )}
      </div>
      
      {!allFieldsFilled && (
        <div className="preview-notice">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '0.5rem' }}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          Complete all {placeholders.length - Object.keys(filledValues).length} remaining fields to download
        </div>
      )}
    </div>
  );
};

export default DocumentPreview;

