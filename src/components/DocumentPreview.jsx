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

              // REWRITTEN: Unified handling for blank placeholders ($[________])
              // This ensures consistent mapping between highlighting and replacement
              if (/^blank_\d+$/.test(normalizedKey)) {
                // Helper: Find all unfilled blank placeholders in current HTML
                const findUnfilledBlanks = (htmlContent) => {
                  const blankPattern = /\[[_-]{3,}\]/g;
                  const blanks = [];
                  let match;
                  blankPattern.lastIndex = 0;
                  
                  while ((match = blankPattern.exec(htmlContent)) !== null) {
                    // CRITICAL: Only check for GREEN highlight (filled with value)
                    // Yellow and blue highlights should NOT prevent replacement
                    const checkArea = htmlContent.substring(
                      Math.max(0, match.index - 50),
                      Math.min(htmlContent.length, match.index + match[0].length + 50)
                    );
                    // Only green (#d4edda) means actually filled with a value
                    // Yellow (#fff3cd) and blue (#2196f3) are just highlights that can be replaced
                    const isFilled = checkArea.includes('background-color: #d4edda');
                    
                    if (!isFilled) {
                      // Check for dollar sign before this blank
                      let dollarIndex = -1;
                      for (let i = match.index - 1; i >= Math.max(0, match.index - 20); i--) {
                        if (htmlContent[i] === '$') {
                          const dollarCheck = htmlContent.substring(Math.max(0, i - 50), i + 5);
                          if (!dollarCheck.includes('background-color')) {
                            dollarIndex = i;
                            break;
                          }
                        }
                      }
                      
                      blanks.push({
                        match: match[0],
                        index: match.index,
                        dollarIndex: dollarIndex,
                        hasDollar: dollarIndex !== -1
                      });
                    }
                  }
                  
                  return blanks.sort((a, b) => a.index - b.index);
                };
                
                // Get all blank placeholders in document order
                const allBlanksInOrder = (placeholders || []).filter(p => /^blank_\d+$/.test(p));
                const placeholderIndex = allBlanksInOrder.indexOf(normalizedKey);
                
                if (placeholderIndex === -1) {
                  console.warn(`[REPLACEMENT] ⚠️ Placeholder "${normalizedKey}" not found in blanks array`);
                  return;
                }
                
                // Find unfilled blanks in current HTML
                const unfilledBlanks = findUnfilledBlanks(html);
                
                // Count how many blanks BEFORE this one are still unfilled
                let unfilledIndex = 0;
                for (let i = 0; i < placeholderIndex; i++) {
                  const prevKey = allBlanksInOrder[i];
                  const prevValue = filledValues[prevKey];
                  if (!prevValue || prevValue.trim() === '') {
                    unfilledIndex++;
                  }
                }
                
                // Replace the blank at the calculated index
                if (unfilledIndex >= 0 && unfilledIndex < unfilledBlanks.length) {
                  const targetBlank = unfilledBlanks[unfilledIndex];
                  
                  // Create replacement with value
                  let replacement;
                  if (value.startsWith('data:image')) {
                    replacement = `<img src="${value}" alt="Signature" style="max-width: 200px; max-height: 60px; border: 1px solid #c3e6cb; border-radius: 3px; vertical-align: middle;" />`;
                  } else {
                    replacement = `<span style="background-color: #d4edda; padding: 2px 6px; border-radius: 3px; font-weight: 500; color: #155724; border: 1px solid #c3e6cb;">${value}</span>`;
                  }
                  
                  // Replace: if dollar sign exists, replace $[________], otherwise just [________]
                  if (targetBlank.hasDollar) {
                    const beforeDollar = html.substring(0, targetBlank.dollarIndex);
                    const afterBlank = html.substring(targetBlank.index + targetBlank.match.length);
                    html = beforeDollar + replacement + afterBlank;
                    console.log(`[REPLACEMENT] ✓ Replaced "${normalizedKey}" with value (including $) at position ${targetBlank.dollarIndex}`);
                  } else {
                    const beforeBlank = html.substring(0, targetBlank.index);
                    const afterBlank = html.substring(targetBlank.index + targetBlank.match.length);
                    html = beforeBlank + replacement + afterBlank;
                    console.log(`[REPLACEMENT] ✓ Replaced "${normalizedKey}" with value at position ${targetBlank.index}`);
                  }
                } else {
                  console.warn(`[REPLACEMENT] ⚠️ Could not find blank for "${normalizedKey}" - unfilledIndex: ${unfilledIndex}, available: ${unfilledBlanks.length}`);
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
        
        // REWRITTEN: Unified highlighting for blank placeholders ($[________])
        // Uses the SAME logic as replacement to ensure consistency
        const findUnfilledBlanksForHighlight = (htmlContent) => {
          const blankPattern = /\[[_-]{3,}\]/g;
          const blanks = [];
          let match;
          blankPattern.lastIndex = 0;
          let matchCount = 0;
          
          while ((match = blankPattern.exec(htmlContent)) !== null) {
            matchCount++;
            // CRITICAL: Only check for GREEN highlight (filled with value), NOT yellow or blue highlights
            // Yellow highlights are temporary (unfilled blanks), blue highlights are current question
            // We need to re-highlight them, so don't skip them
            const checkArea = htmlContent.substring(
              Math.max(0, match.index - 100),
              Math.min(htmlContent.length, match.index + match[0].length + 100)
            );
            // Only green (#d4edda) means actually filled with a value
            // Yellow (#fff3cd) and blue (#2196f3) are just highlights that can change
            const isFilled = checkArea.includes('background-color: #d4edda');
            
            console.log(`[BLANK_HIGHLIGHT] Found blank #${matchCount} at position ${match.index}, isFilled: ${isFilled}`);
            
            if (!isFilled) {
              // Check for dollar sign before this blank (increase search range to catch more cases)
              let dollarIndex = -1;
              for (let i = match.index - 1; i >= Math.max(0, match.index - 50); i--) {
                if (htmlContent[i] === '$') {
                  const dollarCheck = htmlContent.substring(Math.max(0, i - 50), i + 5);
                  if (!dollarCheck.includes('background-color')) {
                    dollarIndex = i;
                    break;
                  }
                }
              }
              
              blanks.push({
                match: match[0],
                index: match.index,
                dollarIndex: dollarIndex,
                hasDollar: dollarIndex !== -1,
                originalIndex: blanks.length // Track original order for debugging
              });
              
              console.log(`[BLANK_HIGHLIGHT] Added unfilled blank #${blanks.length} at position ${match.index}, hasDollar: ${dollarIndex !== -1}`);
            }
          }
          
          const sorted = blanks.sort((a, b) => a.index - b.index);
          console.log(`[BLANK_HIGHLIGHT] Total blanks found: ${matchCount}, unfilled: ${sorted.length}`);
          return sorted;
        };
        
        // Get all blank placeholders in document order (same as replacement logic)
        const allBlanksInOrder = (placeholders || []).filter(p => /^blank_\d+$/.test(p));
        const unfilledBlanks = findUnfilledBlanksForHighlight(html);
        
        console.log(`[BLANK_HIGHLIGHT] Found ${unfilledBlanks.length} unfilled blanks in HTML`);
        console.log(`[BLANK_HIGHLIGHT] All blank placeholders:`, allBlanksInOrder);
        
        // Map each unfilled blank to its placeholder key using the SAME logic as replacement
        // CRITICAL: Use the EXACT same mapping logic as replacement to ensure consistency
        const blankToPlaceholderMap = new Map();
        
        // Build list of unfilled placeholder keys in document order (same as replacement)
        const unfilledPlaceholderKeys = [];
        allBlanksInOrder.forEach(placeholderKey => {
          const placeholderValue = filledValues[placeholderKey];
          const isPlaceholderFilled = placeholderValue && placeholderValue.trim() !== '';
          if (!isPlaceholderFilled) {
            unfilledPlaceholderKeys.push(placeholderKey);
          }
        });
        
        console.log(`[BLANK_HIGHLIGHT] Unfilled blanks in HTML: ${unfilledBlanks.length}`);
        console.log(`[BLANK_HIGHLIGHT] Unfilled placeholder keys:`, unfilledPlaceholderKeys);
        
        // Map each blank to its placeholder by index: first blank → first unfilled placeholder
        // CRITICAL: Ensure ALL blanks get mapped, especially blank_0
        unfilledBlanks.forEach((blank, blankIndex) => {
          if (blankIndex < unfilledPlaceholderKeys.length) {
            const placeholderKey = unfilledPlaceholderKeys[blankIndex];
            blankToPlaceholderMap.set(blank, placeholderKey);
            console.log(`[BLANK_HIGHLIGHT] ✓ Mapped HTML blank #${blankIndex} at position ${blank.index} (hasDollar: ${blank.hasDollar}) → placeholder "${placeholderKey}"`);
          } else {
            // FALLBACK: If count mismatch, try to map by finding closest placeholder
            // This ensures blank_0 always gets mapped
            console.warn(`[BLANK_HIGHLIGHT] ⚠️ Mismatch: blankIndex ${blankIndex} >= ${unfilledPlaceholderKeys.length} unfilled placeholders`);
            
            // If this is the first blank (blankIndex 0) and we have at least one unfilled placeholder, map it
            if (blankIndex === 0 && unfilledPlaceholderKeys.length > 0) {
              const placeholderKey = unfilledPlaceholderKeys[0];
              blankToPlaceholderMap.set(blank, placeholderKey);
              console.warn(`[BLANK_HIGHLIGHT] ⚠️ FALLBACK: Mapped first blank at position ${blank.index} → placeholder "${placeholderKey}"`);
            } else {
              console.error(`[BLANK_HIGHLIGHT] ❌ CRITICAL: Could not map HTML blank #${blankIndex} - only ${unfilledPlaceholderKeys.length} unfilled placeholders available`);
            }
          }
        });
        
        // CRITICAL: Verify that blank_0 is mapped if it exists and is unfilled
        if (allBlanksInOrder.length > 0 && allBlanksInOrder[0] === 'blank_0') {
          const blank0Value = filledValues['blank_0'];
          const isBlank0Filled = blank0Value && blank0Value.trim() !== '';
          
          if (!isBlank0Filled) {
            // blank_0 should be unfilled, check if it's mapped
            const blank0Mapped = Array.from(blankToPlaceholderMap.values()).includes('blank_0');
            if (!blank0Mapped && unfilledBlanks.length > 0) {
              // Ensure first blank maps to blank_0
              const firstBlank = unfilledBlanks[0];
              if (!blankToPlaceholderMap.has(firstBlank)) {
                blankToPlaceholderMap.set(firstBlank, 'blank_0');
                console.warn(`[BLANK_HIGHLIGHT] ⚠️ FALLBACK: Force-mapped first blank at position ${firstBlank.index} → blank_0`);
              }
            }
          }
        }
        
        // Verify mapping
        if (unfilledBlanks.length !== unfilledPlaceholderKeys.length) {
          console.warn(`[BLANK_HIGHLIGHT] ⚠️ Mismatch: ${unfilledBlanks.length} unfilled blanks but ${unfilledPlaceholderKeys.length} unfilled placeholders`);
        }
        
        // CRITICAL: Log mapping status before highlighting
        console.log(`[BLANK_HIGHLIGHT] Mapping summary:`);
        console.log(`[BLANK_HIGHLIGHT] - Total unfilled blanks in HTML: ${unfilledBlanks.length}`);
        console.log(`[BLANK_HIGHLIGHT] - Total unfilled placeholders: ${unfilledPlaceholderKeys.length}`);
        console.log(`[BLANK_HIGHLIGHT] - Mapped blanks: ${blankToPlaceholderMap.size}`);
        blankToPlaceholderMap.forEach((key, blank) => {
          console.log(`[BLANK_HIGHLIGHT]   - Blank at ${blank.index} → "${key}"`);
        });
        console.log(`[BLANK_HIGHLIGHT] - Current question: "${currentPlaceholder}"`);
        
        // Highlight blanks: process in reverse order to preserve indices
        // CRITICAL: Process ALL mapped blanks to ensure nothing is skipped, especially blank_0
        let processedCount = 0;
        let skippedCount = 0;
        
        for (let i = unfilledBlanks.length - 1; i >= 0; i--) {
          const blank = unfilledBlanks[i];
          const placeholderKey = blankToPlaceholderMap.get(blank);
          
          if (!placeholderKey) {
            console.warn(`[BLANK_HIGHLIGHT] ⚠️ Skipping blank #${i} at position ${blank.index} - no placeholder key mapped`);
            skippedCount++;
            continue;
          }
          
          const isCurrentQuestion = currentPlaceholder === placeholderKey;
          const isFilled = filledValues[placeholderKey] && filledValues[placeholderKey].trim() !== '';
          
          console.log(`[BLANK_HIGHLIGHT] Processing blank #${i}: key="${placeholderKey}", isCurrent=${isCurrentQuestion}, isFilled=${isFilled}, position=${blank.index}`);
          
          if (isFilled) {
            console.log(`[BLANK_HIGHLIGHT] Skipping "${placeholderKey}" - already filled with value: "${filledValues[placeholderKey]}"`);
            skippedCount++;
            continue;
          }
          
          // CRITICAL: Always highlight if mapped, even if it's blank_0 and being skipped for some reason
          processedCount++;
          
          // Create highlight replacement
          let replacement;
          if (isCurrentQuestion) {
            // Blue highlight for current question
            replacement = blank.hasDollar
              ? `<span id="current-question-highlight" style="background-color: #2196f3; padding: 4px 8px; border-radius: 4px; border: 2px solid #1976d2; color: #fff; font-weight: bold; animation: pulse 2s infinite;">$${blank.match}</span>`
              : `<span id="current-question-highlight" style="background-color: #2196f3; padding: 4px 8px; border-radius: 4px; border: 2px solid #1976d2; color: #fff; font-weight: bold; animation: pulse 2s infinite;">${blank.match}</span>`;
          } else {
            // Yellow highlight for other unfilled blanks
            replacement = blank.hasDollar
              ? `<span style="background-color: #fff3cd; padding: 2px 6px; border-radius: 3px; border: 1px dashed #ffc107; color: #856404; font-style: italic; font-weight: 500;">$${blank.match}</span>`
              : `<span style="background-color: #fff3cd; padding: 2px 6px; border-radius: 3px; border: 1px dashed #ffc107; color: #856404; font-style: italic; font-weight: 500;">${blank.match}</span>`;
          }
          
          // Replace in HTML
          if (blank.hasDollar) {
            const beforeDollar = html.substring(0, blank.dollarIndex);
            const afterBlank = html.substring(blank.index + blank.match.length);
            html = beforeDollar + replacement + afterBlank;
            console.log(`[BLANK_HIGHLIGHT] ✓ Highlighted "${placeholderKey}" (with $) at position ${blank.dollarIndex}, isCurrent: ${isCurrentQuestion}`);
          } else {
            const beforeBlank = html.substring(0, blank.index);
            const afterBlank = html.substring(blank.index + blank.match.length);
            html = beforeBlank + replacement + afterBlank;
            console.log(`[BLANK_HIGHLIGHT] ✓ Highlighted "${placeholderKey}" at position ${blank.index}, isCurrent: ${isCurrentQuestion}`);
          }
        }
        
        // Final summary log
        console.log(`[BLANK_HIGHLIGHT] Summary: Processed ${processedCount} blanks, skipped ${skippedCount} blanks`);
        
        // CRITICAL: If blank_0 is the current question and wasn't processed, log error
        if (currentPlaceholder === 'blank_0') {
          const blank0Processed = processedCount > 0 && Array.from(blankToPlaceholderMap.values()).some(key => key === 'blank_0');
          if (!blank0Processed) {
            console.error(`[BLANK_HIGHLIGHT] ❌ CRITICAL ERROR: blank_0 is current question but was NOT highlighted!`);
            console.error(`[BLANK_HIGHLIGHT] - unfilledBlanks: ${unfilledBlanks.length}, blankToPlaceholderMap: ${blankToPlaceholderMap.size}`);
            console.error(`[BLANK_HIGHLIGHT] - blank_0 mapped: ${Array.from(blankToPlaceholderMap.values()).includes('blank_0')}`);
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

