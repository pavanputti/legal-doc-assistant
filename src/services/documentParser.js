import mammoth from 'mammoth';

/**
 * Parse a DOCX file and extract placeholders
 * Placeholders are identified by patterns like {{placeholder_name}} or {placeholder_name}
 */
export const parseDocument = async (file) => {
  try {
    // Handle both File objects and ArrayBuffers
    let arrayBuffer;
    if (file instanceof File || file instanceof Blob) {
      arrayBuffer = await file.arrayBuffer();
    } else if (file instanceof ArrayBuffer) {
      arrayBuffer = file;
    } else {
      throw new Error('Invalid file format');
    }
    
    // Convert DOCX to text for placeholder extraction
    const textResult = await mammoth.extractRawText({ arrayBuffer });
    const text = textResult.value;
    
    // Also get HTML to preserve original placeholder formats
    const htmlResult = await mammoth.convertToHtml({ arrayBuffer });
    const html = htmlResult.value;
    
    // Extract placeholders using regex
    // ONLY detect explicit placeholders in square brackets: [placeholder] or [________]
    // Ignore all other formats like {{placeholder}}, <placeholder>, __placeholder__, Address:, Email:, etc.
    const placeholderPatterns = [
      /\[([a-zA-Z_][a-zA-Z0-9_\s-]*)\]/g,  // [name], [COMPANY], [Date of Safe] - explicit placeholders
      /\[([_\-]{3,})\]/g                    // [________], [----], [___] - blank placeholders
    ];
    
    // Common words to exclude (too generic)
    const excludedWords = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'for', 'with', 'on', 'at', 'from', 'by']);
    
    const uniquePlaceholders = new Set();
    // Map normalized placeholder to original formats found in document
    const placeholderFormatMap = new Map(); // normalized -> Set of original formats
    
    // Extract from text FIRST
    // Track blank placeholder positions to avoid duplicates
    const blankPositions = new Map(); // position -> placeholder key
    let blankCounter = 0;
    
    placeholderPatterns.forEach(pattern => {
      let match;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(text)) !== null) {
        const originalFormat = match[0]; // e.g., "[Company Name]" or "[________]"
        const rawName = match[1].trim();
        const matchPosition = match.index;
        
        // Handle blank placeholders like [________] - normalize to "blank" or similar
        let placeholderName;
        if (/^[_\-]{3,}$/.test(rawName)) {
          // This is a blank placeholder like [________]
          // Check if we've seen this exact position before (avoid duplicates)
          // Use position-based matching to ensure each [________] gets only ONE key
          if (!blankPositions.has(matchPosition)) {
            placeholderName = 'blank_' + blankCounter;
            blankCounter++;
            blankPositions.set(matchPosition, placeholderName);
          } else {
            // This position already has a placeholder key, reuse it
            placeholderName = blankPositions.get(matchPosition);
          }
        } else {
          placeholderName = rawName.replace(/\s+/g, '_').replace(/-/g, '_').toLowerCase();
        }
        
        // Validate placeholder - allow blank placeholders and valid text placeholders
        const isBlank = /^blank_\d+$/.test(placeholderName);
        const isValid = isBlank || (
          placeholderName.length >= 2 && 
          !/^\d+$/.test(rawName) &&
          !excludedWords.has(placeholderName.toLowerCase())
        );
        
        if (isValid) {
          if (!uniquePlaceholders.has(placeholderName)) {
            uniquePlaceholders.add(placeholderName);
            placeholderFormatMap.set(placeholderName, new Set());
          }
          // Store original format for this normalized placeholder
          placeholderFormatMap.get(placeholderName).add(originalFormat);
        }
      }
    });
    
    // Also extract from HTML to catch any variations
    // IMPORTANT: For blank placeholders, we should NOT create new ones from HTML
    // Only add formats to existing blank placeholders, never create duplicates
    placeholderPatterns.forEach(pattern => {
      let match;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(html)) !== null) {
        const originalFormat = match[0];
        const rawName = match[1].trim();
        
        // Handle blank placeholders like [________]
        if (/^[_\-]{3,}$/.test(rawName)) {
          // This is a blank placeholder - DON'T create new ones from HTML
          // Only add format to existing blank placeholders if format matches
          // Since all blank placeholders have the same visual format [________],
          // we need to match by position, not format
          // For now, skip creating new blank placeholders from HTML
          // The text extraction should have already found all blanks
          continue; // Skip blank placeholders in HTML - they're already extracted from text
        }
        
        // Handle regular (non-blank) placeholders
        const placeholderName = rawName.replace(/\s+/g, '_').replace(/-/g, '_').toLowerCase();
        
        // Validate - only regular placeholders, not blanks
        const isBlank = /^blank_\d+$/.test(placeholderName);
        const isValid = !isBlank && (
          placeholderName.length >= 2 && 
          !/^\d+$/.test(rawName) &&
          !excludedWords.has(placeholderName.toLowerCase())
        );
        
        // Only add format if placeholder already exists (from text extraction)
        if (isValid && uniquePlaceholders.has(placeholderName)) {
          placeholderFormatMap.get(placeholderName).add(originalFormat);
        }
      }
    });
    
    // Skip implicit placeholders - only process explicit placeholders in square brackets [placeholder]
    // This means we won't detect "Address:", "Email:", "Name:", "Title:", "By:" as placeholders
    // Only placeholders like [name], [email], [company] etc. will be detected
    
    // Skip underscore-based blanks - only process explicit placeholders in square brackets [placeholder]
    // Patterns like "Name: __________" or "Address: ____" will be ignored
    
    // Convert placeholders to structured format with position
    // Sort placeholders by their position in the document (appearance order)
    // This ensures questions are asked in document order (top to bottom)
    const placeholdersArray = Array.from(uniquePlaceholders);
    
    // Create a map of placeholder to first occurrence position in the document
    const placeholderPositions = new Map();
    
    // Find positions in text first (more reliable for ordering)
    placeholdersArray.forEach(placeholderKey => {
      let firstPosition = Infinity;
      
      // Check in original formats first
      if (placeholderFormatMap.has(placeholderKey)) {
        const formats = Array.from(placeholderFormatMap.get(placeholderKey));
        formats.forEach(format => {
          // Escape special regex characters
          const escapedFormat = format.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(escapedFormat, 'gi');
          const match = text.search(regex);
          if (match !== -1 && match < firstPosition) {
            firstPosition = match;
          }
        });
      }
      
      // For blank placeholders, also search for the pattern directly
      if (/^blank_\d+$/.test(placeholderKey)) {
        // Search for any blank placeholder pattern like [____], [________], etc.
        const blankPattern = /\[[_\-]{3,}\]/g;
        let match;
        blankPattern.lastIndex = 0;
        let blankIndex = 0;
        
        // Find which occurrence this blank corresponds to
        const blankNumber = parseInt(placeholderKey.match(/\d+$/)[0]);
        let currentBlankIndex = 0;
        
        while ((match = blankPattern.exec(text)) !== null) {
          if (currentBlankIndex === blankNumber) {
            firstPosition = match.index;
            break;
          }
          currentBlankIndex++;
        }
      } else {
        // Also check normalized patterns for non-blank placeholders
        const normalizedKey = placeholderKey.replace(/_/g, '[\\s_-]*');
        const patterns = [
          new RegExp(`\\[${normalizedKey}\\]`, 'gi'),
          new RegExp(`\\{\\{?${normalizedKey}\\}?\\}`, 'gi'),
        ];
        
        patterns.forEach(pattern => {
          const match = text.search(pattern);
          if (match !== -1 && match < firstPosition) {
            firstPosition = match;
          }
        });
      }
      
      placeholderPositions.set(placeholderKey, firstPosition === Infinity ? 999999 : firstPosition);
    });
    
    // Sort placeholders by their position in the document
    const sortedPlaceholders = [...placeholdersArray].sort((a, b) => {
      const posA = placeholderPositions.get(a) || 999999;
      const posB = placeholderPositions.get(b) || 999999;
      return posA - posB;
    });
    
    const placeholderObjects = sortedPlaceholders.map((placeholderKey, index) => {
      // Get the label from the placeholder key using SAFE semantics
      let label = placeholderKey;
      
      // Handle blank placeholders like blank_0, blank_1, etc. (from [________])
      if (/^blank_\d+$/.test(placeholderKey)) {
        // For blank placeholders, try to infer label from context
        // Get position in document to determine context
        const position = placeholderPositions.get(placeholderKey) || 0;
        
        // Get context before and after the placeholder (wider window for better detection)
        const contextBefore = text.substring(Math.max(0, position - 200), position);
        const contextAfter = text.substring(position, Math.min(text.length, position + 200));
        const fullContext = (contextBefore + ' ' + contextAfter).toLowerCase();
        
        // Get the actual placeholder format to see what it looks like in the document
        let originalFormat = '';
        if (placeholderFormatMap.has(placeholderKey)) {
          const formats = Array.from(placeholderFormatMap.get(placeholderKey));
          originalFormat = formats[0] || '';
        }
        
        // Pattern 1: Check for dollar signs immediately before the placeholder
        const dollarMatch = contextBefore.match(/\$\s*\[[_\-]+\]\s*\(?\s*the\s*["']?([^"']+)["']?\s*\)?/i);
        if (dollarMatch && dollarMatch[1]) {
          // Found pattern like "$[________] (the "Purchase Amount")"
          const fieldName = dollarMatch[1].trim();
          label = fieldName.split(/\s+/).map(w => 
            w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
          ).join(' ');
          return {
            key: placeholderKey,
            label: label,
            type: 'string',
            value: '',
            position: index + 1
          };
        }
        
        // Pattern 2: Check for "$[________]" pattern - likely an amount
        // IMPORTANT: Check the text immediately before and after to distinguish different $ placeholders
        const hasDollarBefore = contextBefore.trim().endsWith('$') || 
                               /[^a-z]\$\s*$/i.test(contextBefore.trimRight()) ||
                               /\$\s*\[[_\-]+\]\s*$/i.test(contextBefore);
        
        if (hasDollarBefore) {
          // Check for specific patterns that distinguish different $ placeholders
          // Priority order matters - check most specific first
          
          // Check if it's "Post-Money Valuation Cap" - look for "Post-Money Valuation Cap" text
          if (contextAfter.includes('Post-Money Valuation Cap') || 
              contextAfter.includes('Post-Money') ||
              fullContext.includes('post-money valuation cap') ||
              fullContext.includes('"Post-Money Valuation Cap"')) {
            label = 'Post-Money Valuation Cap';
            return {
              key: placeholderKey,
              label: label,
              type: 'string',
              value: '',
              position: index + 1
            };
          }
          
          // Check if it's "Purchase Amount" - look for text like "(the "Purchase Amount")"
          if (contextAfter.includes('Purchase Amount') || 
              contextAfter.includes('(the "Purchase Amount")') ||
              fullContext.includes('purchase amount') ||
              contextBefore.includes('payment by') ||
              contextBefore.includes('exchange for')) {
            label = 'Purchase Amount';
            return {
              key: placeholderKey,
              label: label,
              type: 'string',
              value: '',
              position: index + 1
            };
          }
          
          // Check for other specific amount types
          if (fullContext.includes('valuation cap') && !fullContext.includes('post-money')) {
            label = 'Valuation Cap';
          } else if (fullContext.includes('discount rate') || fullContext.includes('discount')) {
            label = 'Discount Rate';
          } else {
            // Generic amount - use position-based label to ensure uniqueness
            label = 'Amount';
          }
          return {
            key: placeholderKey,
            label: label,
            type: 'string',
            value: '',
            position: index + 1
          };
        }
        
        // Pattern 3: Check for date-related context
        if (contextBefore.includes('on or about') || contextBefore.includes('date of safe') || 
            contextBefore.includes('effective date') || fullContext.includes('date')) {
          if (fullContext.includes('safe')) {
            label = 'Date of Safe';
          } else if (fullContext.includes('effective')) {
            label = 'Effective Date';
          } else {
            label = 'Date';
          }
          return {
            key: placeholderKey,
            label: label,
            type: 'string',
            value: '',
            position: index + 1
          };
        }
        
        // Pattern 4: Check for state/jurisdiction context
        if (fullContext.includes('state of incorporation') || 
            (contextBefore.includes('a ') && contextAfter.includes('corporation'))) {
          label = 'State of Incorporation';
          return {
            key: placeholderKey,
            label: label,
            type: 'string',
            value: '',
            position: index + 1
          };
        }
        
        // Pattern 5: Check for governing law context
        if (fullContext.includes('governing law') || fullContext.includes('laws of the state of')) {
          label = 'Governing Law Jurisdiction';
          return {
            key: placeholderKey,
            label: label,
            type: 'string',
            value: '',
            position: index + 1
          };
        }
        
        // Pattern 6: Check for text in quotes after the placeholder
        const quoteMatch = contextAfter.match(/\(?\s*the\s*["']([^"']+)["']\s*\)?/i);
        if (quoteMatch && quoteMatch[1]) {
          // Found pattern like "[________] (the "Purchase Amount")"
          const fieldName = quoteMatch[1].trim();
          label = fieldName.split(/\s+/).map(w => 
            w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
          ).join(' ');
          return {
            key: placeholderKey,
            label: label,
            type: 'string',
            value: '',
            position: index + 1
          };
        }
        
        // Pattern 7: Check for common SAFE document patterns
        if (fullContext.includes('purchase amount')) {
          label = 'Purchase Amount';
        } else if (fullContext.includes('valuation cap') || fullContext.includes('post-money valuation')) {
          label = 'Post-Money Valuation Cap';
        } else if (fullContext.includes('discount rate') || fullContext.includes('discount')) {
          label = 'Discount Rate';
        } else if (fullContext.includes('investor name')) {
          label = 'Investor Name';
        } else if (fullContext.includes('company name')) {
          label = 'Company Name';
        } else {
          // Fallback: Use position number but with better wording
          label = `Field ${placeholderKey.match(/\d+$/)[0]}`;
        }
        
        return {
          key: placeholderKey,
          label: label,
          type: 'string',
          value: '',
          position: index + 1
        };
      }
      
      // SAFE field label mapping
      const safeFieldLabels = {
        'company': 'Company Name',
        'company_by': 'Company Signature Line',
        'company_name': 'Company Signatory Name',
        'company_title': 'Company Signatory Title',
        'company_address': 'Company Address',
        'company_email': 'Company Email',
        'investor_by': 'Investor Signature Line',
        'investor_name': 'Investor Name',
        'investor_title': 'Investor Title',
        'investor_address': 'Investor Address',
        'investor_email': 'Investor Email',
        'by': 'Signature Line',
        'name': 'Name',
        'title': 'Title',
        'address': 'Address',
        'email': 'Email',
      };
      
      // Check if we have a SAFE-specific label
      if (safeFieldLabels[placeholderKey]) {
        label = safeFieldLabels[placeholderKey];
      } else if (placeholderKey.includes('_')) {
        const parts = placeholderKey.split('_');
        if (parts.length >= 2 && ['company', 'investor'].includes(parts[0])) {
          // Section-specific: "company_name" -> "Company Signatory Name"
          const section = parts[0];
          const fieldName = parts.slice(1).join('_');
          
          // Build descriptive label based on SAFE semantics
          const fieldLabel = fieldName.split('_').map(w => 
            w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
          ).join(' ');
          
          if (section === 'company') {
            if (fieldName === 'by') {
              label = 'Company Signature Line';
            } else if (fieldName === 'name') {
              label = 'Company Signatory Name';
            } else if (fieldName === 'title') {
              label = 'Company Signatory Title';
            } else {
              label = `Company ${fieldLabel}`;
            }
          } else if (section === 'investor') {
            if (fieldName === 'by') {
              label = 'Investor Signature Line';
            } else if (fieldName === 'name') {
              label = 'Investor Name';
            } else if (fieldName === 'title') {
              label = 'Investor Title';
            } else {
              label = `Investor ${fieldLabel}`;
            }
          }
        } else {
          // Regular multi-word: "name_field" -> "Name Field"
          label = placeholderKey.split('_').map(w => 
            w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
          ).join(' ');
        }
      } else {
        // Single word: "name" -> "Name"
        // Special handling for common fields
        if (placeholderKey === 'by') {
          label = 'Signature Line';
        } else {
          label = placeholderKey.charAt(0).toUpperCase() + placeholderKey.slice(1);
        }
      }
      
      return {
        key: placeholderKey, // Normalized key for internal use (e.g., "company_name")
        label: label, // Human-readable label based on SAFE semantics (e.g., "Company Signatory Name")
        type: 'string', // Default type (always "string" for SAFE fields)
        value: '', // Initial empty value
        position: index + 1 // Position in document (1-based, order of appearance)
      };
    });
    
    return {
      text,
      html,
      placeholders: sortedPlaceholders, // Return sorted placeholders for correct question order
      placeholderFormatMap: placeholderFormatMap, // Map to original formats
      placeholderObjects: placeholderObjects, // New structured format
      rawText: text
    };
  } catch (error) {
    console.error('Error parsing document:', error);
    throw new Error('Failed to parse document. Please ensure it is a valid DOCX file.');
  }
};

/**
 * Get a user-friendly label for a placeholder
 */
export const getPlaceholderLabel = (placeholder) => {
  if (!placeholder || placeholder.trim().length === 0) {
    return 'value';
  }
  
  // Split by underscores and capitalize
  const words = placeholder
    .split('_')
    .filter(word => word.length > 0) // Remove empty strings
    .map(word => {
      // Handle special cases and abbreviations
      const lower = word.toLowerCase();
      
      // Keep common abbreviations uppercase
      if (['id', 'sa', 'safe', 'llc', 'inc', 'corp', 'ltd'].includes(lower)) {
        return lower.toUpperCase();
      }
      
      // Capitalize first letter
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    });
  
  // If no valid words, return a default
  if (words.length === 0) {
    return 'value';
  }
  
  return words.join(' ');
};

/**
 * Get a better question phrase based on placeholder context
 */
export const getQuestionPhrase = (placeholder) => {
  const label = getPlaceholderLabel(placeholder);
  const lowerLabel = label.toLowerCase();
  
  // Handle special cases for better questions
  if (lowerLabel.includes('name')) {
    if (lowerLabel.includes('company')) {
      return 'What is the company name?';
    }
    if (lowerLabel.includes('investor')) {
      return 'What is the investor name?';
    }
    if (lowerLabel.includes('signer') || lowerLabel.includes('signatory')) {
      return 'What is the signer\'s name?';
    }
    return `What is the ${label.toLowerCase()}?`;
  }
  
  if (lowerLabel.includes('date')) {
    return `What is the ${label.toLowerCase()}?`;
  }
  
  if (lowerLabel.includes('amount') || lowerLabel.includes('price') || lowerLabel.includes('valuation')) {
    return `What is the ${label.toLowerCase()}?`;
  }
  
  if (lowerLabel.includes('address')) {
    return `What is the ${label.toLowerCase()}?`;
  }
  
  if (lowerLabel.includes('state') || lowerLabel.includes('jurisdiction')) {
    return `What is the ${label.toLowerCase()}?`;
  }
  
  // Default phrasing
  return `What is the ${label.toLowerCase()}?`;
};
