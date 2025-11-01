import { HfInference } from '@huggingface/inference';

// Initialize Hugging Face Inference (free, open-source models)
// You can optionally add your HF token for better rate limits: import.meta.env.VITE_HF_TOKEN
const hf = new HfInference(import.meta.env.VITE_HF_TOKEN || undefined);

// Use a lightweight, fast model for question generation
// Alternatives: 'gpt2', 'distilgpt2', 'microsoft/DialoGPT-medium'
const TEXT_GENERATION_MODEL = 'gpt2'; // Fast and works without token

/**
 * Use AI to generate a contextual question for a placeholder
 * Uses Hugging Face Inference API with open-source models
 */
export const generateQuestionForPlaceholder = async (placeholder, documentContext = '') => {
  try {
    // First try the smart template-based approach (faster, more reliable)
    const templateQuestion = generateSmartQuestion(placeholder, documentContext);
    
    // If we have a HF token, we can use actual AI models
    // Otherwise, use the smart template system
    if (!import.meta.env.VITE_HF_TOKEN) {
      return templateQuestion;
    }
    
    // Use AI to enhance the question with context
    try {
      const prompt = `Generate a professional question for filling in "${placeholder}" in a legal document.
      
Context: ${documentContext.substring(0, 300)}
Question:`;
      
      const response = await hf.textGeneration({
        model: TEXT_GENERATION_MODEL,
        inputs: prompt,
        parameters: {
          max_new_tokens: 30,
          temperature: 0.7,
          return_full_text: false
        }
      });
      
      // Extract and clean the generated text
      const generated = response.generated_text?.trim();
      if (generated && generated.length > 10) {
        // Use AI-generated question if it makes sense
        return generated.split('\n')[0].replace(/^Question:\s*/i, '').trim() || templateQuestion;
      }
    } catch (aiError) {
      console.warn('AI generation failed, using template:', aiError);
    }
    
    // Fallback to smart template
    return templateQuestion;
    
  } catch (error) {
    console.error('Error generating AI question:', error);
    // Fallback to template-based question
    return generateSmartQuestion(placeholder, documentContext);
  }
};

/**
 * Smart question generation using context-aware rules
 * This provides intelligent question generation without requiring API calls
 */
function generateSmartQuestion(placeholder, documentContext = '') {
  const lowerPlaceholder = placeholder.toLowerCase();
  const contextLower = documentContext.toLowerCase();
  
  // Handle blank placeholders with better context-aware questions
  if (/^blank_\d+$/.test(placeholder)) {
    // For blank placeholders, use the context to generate a better question
    if (contextLower.includes('purchase amount') || contextLower.includes('$') && contextLower.includes('purchase')) {
      return 'What is the purchase amount?';
    }
    if (contextLower.includes('valuation cap') || contextLower.includes('post-money')) {
      return 'What is the post-money valuation cap?';
    }
    if (contextLower.includes('discount')) {
      return 'What is the discount rate? (e.g., 20%)';
    }
    if (contextLower.includes('date of safe') || (contextLower.includes('date') && contextLower.includes('safe'))) {
      return 'What is the date of the SAFE?';
    }
    if (contextLower.includes('state of incorporation')) {
      return 'What is the state of incorporation?';
    }
    if (contextLower.includes('governing law') || contextLower.includes('jurisdiction')) {
      return 'What is the governing law jurisdiction?';
    }
    if (contextLower.includes('amount') || contextLower.includes('$')) {
      return 'What is the amount?';
    }
    if (contextLower.includes('date')) {
      return 'What is the date?';
    }
    // Fallback for blank placeholders
    return 'What value should be filled in here?';
  }
  
  // Handle common legal document placeholders with context
  // Based on SAFE document semantics: https://github.com/your-repo/SAFE_FIELD_SEMANTICS.md
  const questionTemplates = {
    // COMPANY Section - Core company information
    'company': 'What is the name of the company issuing the SAFE?',
    'company_name': 'What is the name of the company issuing the SAFE?',
    'company_entity': 'What is the company entity name?',
    'company_type': 'What type of company is it? (e.g., LLC, Inc., Corp)',
    
    // COMPANY Section - Signature fields
    // SAFE semantics: "By:" signature line = signature line for person signing on behalf of company
    'company_by': 'Who is signing on behalf of the company? (Enter name for signature line)',
    'by': contextLower.includes('[company]') || contextLower.includes('company section') ?
      'Who is signing on behalf of the company? (Enter name for signature line)' :
      contextLower.includes('investor') ? 'Who is signing on behalf of the investor? (Enter name for signature line)' :
      'Who is signing? (Enter name for signature line)',
    'name': contextLower.includes('[company]') || contextLower.includes('company section') ? 
      'What is the name of the person signing on behalf of the company?' : 
      'What is the name?',
    'company_name_signatory': 'What is the name of the person signing on behalf of the company?',
    'title': contextLower.includes('[company]') || contextLower.includes('company section') ? 
      'What is the title of the company signatory? (e.g., CEO, President)' : 
      'What is the title? (e.g., CEO, President)',
    'company_title': 'What is the title of the company signatory? (e.g., CEO, President)',
    'company_address': 'What is the company\'s address?',
    'company_email': 'What is the company\'s email address?',
    
    // INVESTOR Section - Investor information
    'investor': 'What is the investor\'s name?',
    'investor_name': 'What is the investor\'s name?',
    'investor_by': 'Who is signing on behalf of the investor? (Enter name for signature line)',
    'investor_title': 'What is the investor\'s title or designation? (e.g., Managing Director, Partner)',
    'investor_address': 'What is the investor\'s address?',
    'investor_email': 'What is the investor\'s email address?',
    'investor_entity': 'What is the investor entity name?',
    
    // Financial-related
    'investment_amount': 'What is the investment amount?',
    'amount': 'What is the amount?',
    'valuation_cap': 'What is the valuation cap?',
    'price': 'What is the price?',
    'equity': 'What percentage of equity?',
    'equity_percentage': 'What percentage of equity?',
    
    // Date-related
    'date': 'What is the date?',
    'effective_date': 'What is the effective date?',
    'signing_date': 'What is the signing date?',
    'closing_date': 'What is the closing date?',
    
    // Location-related
    'address': 'What is the address?', // Generic fallback
    'state': 'What state?',
    'jurisdiction': 'What is the governing law jurisdiction?',
    'state_of_incorporation': 'What is the state of incorporation?',
    
    // SAFE-specific
    'safe': 'What type of SAFE agreement?',
    'safe_date': 'What is the SAFE agreement date?',
    'discount': 'What is the discount rate? (e.g., 20%)',
    'discount_rate': 'What is the discount rate?',
    
    // Email (generic fallback)
    'email': 'What is the email address?',
  };
  
  // Check for exact matches first
  if (questionTemplates[lowerPlaceholder]) {
    return questionTemplates[lowerPlaceholder];
  }
  
  // Check for partial matches with context
  if (lowerPlaceholder.includes('company') && lowerPlaceholder.includes('name')) {
    return 'What is the company name?';
  }
  
  if (lowerPlaceholder.includes('investor') && lowerPlaceholder.includes('name')) {
    return 'What is the investor\'s name?';
  }
  
  if (lowerPlaceholder.includes('date')) {
    if (lowerPlaceholder.includes('safe')) {
      return 'What is the SAFE agreement date?';
    }
    if (lowerPlaceholder.includes('effective')) {
      return 'What is the effective date?';
    }
    if (lowerPlaceholder.includes('signing')) {
      return 'What is the signing date?';
    }
    return 'What is the date?';
  }
  
  if (lowerPlaceholder.includes('amount') || lowerPlaceholder.includes('investment')) {
    return 'What is the investment amount?';
  }
  
  if (lowerPlaceholder.includes('valuation')) {
    return 'What is the valuation cap?';
  }
  
  if (lowerPlaceholder.includes('state') || lowerPlaceholder.includes('jurisdiction')) {
    if (lowerPlaceholder.includes('incorporation')) {
      return 'What is the state of incorporation?';
    }
    if (lowerPlaceholder.includes('governing') || lowerPlaceholder.includes('law')) {
      return 'What is the governing law jurisdiction?';
    }
    return 'What is the state?';
  }
  
  if (lowerPlaceholder.includes('address')) {
    return 'What is the address?';
  }
  
  // For titles and names
  if (lowerPlaceholder.includes('title')) {
    return 'What is the title? (e.g., CEO, President)';
  }
  
  if (lowerPlaceholder === 'name' || (lowerPlaceholder.includes('name') && !lowerPlaceholder.includes('company') && !lowerPlaceholder.includes('investor'))) {
    // Context-aware: SAFE document semantics
    const contextLower = documentContext.toLowerCase();
    if (contextLower.includes('[investor]') || contextLower.includes('investor:') || 
        contextLower.includes('investor section') || contextLower.includes('investor signatory') ||
        (contextLower.includes('investor') && contextLower.lastIndexOf('investor') > contextLower.lastIndexOf('company'))) {
      return 'What is the investor\'s name?';
    }
    if (contextLower.includes('[company]') || contextLower.includes('company:') || 
        contextLower.includes('company section') || contextLower.includes('company signatory') ||
        (contextLower.includes('company') && contextLower.lastIndexOf('company') > contextLower.lastIndexOf('investor'))) {
      // SAFE semantics: [name] in company section = name of person signing on behalf of company
      return 'What is the name of the person signing on behalf of the company?';
    }
    return 'What is the name?';
  }
  
  // Handle single-word placeholders with context (SAFE document semantics)
  if (lowerPlaceholder === 'email' || lowerPlaceholder.includes('email')) {
    const contextLower = documentContext.toLowerCase();
    if (contextLower.includes('[investor]') || contextLower.includes('investor:') || 
        (contextLower.includes('investor') && contextLower.lastIndexOf('investor') > contextLower.lastIndexOf('company'))) {
      // SAFE semantics: Email in investor section = investor's email address
      return 'What is the investor\'s email address?';
    }
    if (contextLower.includes('[company]') || contextLower.includes('company:') || 
        (contextLower.includes('company') && contextLower.lastIndexOf('company') > contextLower.lastIndexOf('investor'))) {
      // SAFE semantics: Email in company section = company's email address
      return 'What is the company\'s email address?';
    }
    return 'What is the email address?';
  }
  
  if (lowerPlaceholder === 'address' || lowerPlaceholder.includes('address')) {
    const contextLower = documentContext.toLowerCase();
    if (contextLower.includes('[investor]') || contextLower.includes('investor:') || 
        (contextLower.includes('investor') && contextLower.lastIndexOf('investor') > contextLower.lastIndexOf('company'))) {
      // SAFE semantics: Address in investor section = investor's address
      return 'What is the investor\'s address?';
    }
    if (contextLower.includes('[company]') || contextLower.includes('company:') || 
        (contextLower.includes('company') && contextLower.lastIndexOf('company') > contextLower.lastIndexOf('investor'))) {
      // SAFE semantics: Address in company section = company's address
      return 'What is the company\'s address?';
    }
    return 'What is the address?';
  }
  
  if (lowerPlaceholder === 'title') {
    // SAFE document semantics
    const contextLower = documentContext.toLowerCase();
    if (contextLower.includes('[investor]') || contextLower.includes('investor:') || 
        (contextLower.includes('investor') && contextLower.lastIndexOf('investor') > contextLower.lastIndexOf('company'))) {
      // SAFE semantics: Title in investor section = investor's title or designation
      return 'What is the investor\'s title or designation? (e.g., Managing Director, Partner)';
    }
    if (contextLower.includes('[company]') || contextLower.includes('company:') || 
        (contextLower.includes('company') && contextLower.lastIndexOf('company') > contextLower.lastIndexOf('investor'))) {
      // SAFE semantics: [title] in company section = title of company signatory
      return 'What is the title of the company signatory? (e.g., CEO, President)';
    }
    return 'What is the title? (e.g., CEO, President)';
  }
  
  if (lowerPlaceholder === 'company' || lowerPlaceholder === 'investor') {
    return lowerPlaceholder === 'company' ? 'What is the company name?' : 'What is the investor name?';
  }
  
  // Default: generate a human-readable question from the placeholder
  const words = lowerPlaceholder.split('_').filter(w => w.length > 0);
  
  if (words.length === 0) {
    return 'What is the value?';
  }
  
  // Capitalize words properly
  const formattedWords = words.map(word => {
    // Keep common abbreviations
    if (['llc', 'inc', 'corp', 'ltd', 'sa', 'safe', 'id'].includes(word)) {
      return word.toUpperCase();
    }
    return word.charAt(0).toUpperCase() + word.slice(1);
  });
  
  const label = formattedWords.join(' ');
  
  return `What is the ${label.toLowerCase()}?`;
}

/**
 * Analyze placeholder names and extract meaningful information using AI
 * Uses pattern recognition and AI inference to understand context
 */
export const analyzePlaceholder = async (placeholder, allPlaceholders = [], documentContext = '') => {
  try {
    const lowerPlaceholder = placeholder.toLowerCase();
    const contextLower = documentContext.toLowerCase();
    
    // Extract context around this placeholder to determine section (COMPANY vs INVESTOR)
    let sectionContext = '';
    const placeholderIndex = documentContext.toLowerCase().indexOf(`[${placeholder.toLowerCase()}]`);
    if (placeholderIndex === -1) {
      // Try to find in other formats
      const patterns = [`[${placeholder}]`, `[${placeholder.toUpperCase()}]`, `{{${placeholder}}}`, `{${placeholder}}`];
      for (const pattern of patterns) {
        const idx = documentContext.toLowerCase().indexOf(pattern.toLowerCase());
        if (idx !== -1) {
          // Get context around the placeholder (200 chars before and after)
          const start = Math.max(0, idx - 200);
          const end = Math.min(documentContext.length, idx + 200);
          const nearbyText = documentContext.substring(start, end).toLowerCase();
          
          // Check if we're in COMPANY or INVESTOR section
          if (nearbyText.includes('[company]') || nearbyText.includes('company section') || 
              nearbyText.includes('company:') || nearbyText.includes('company signatory') ||
              (nearbyText.lastIndexOf('company') > nearbyText.lastIndexOf('investor'))) {
            sectionContext = 'company';
          } else if (nearbyText.includes('investor') || nearbyText.includes('investor:') || 
                     nearbyText.includes('investor section') || nearbyText.includes('investor signatory')) {
            sectionContext = 'investor';
          }
          break;
        }
      }
    } else {
      // Get context around the placeholder (200 chars before and after)
      const start = Math.max(0, placeholderIndex - 200);
      const end = Math.min(documentContext.length, placeholderIndex + 200);
      const nearbyText = documentContext.substring(start, end).toLowerCase();
      
      // Check if we're in COMPANY or INVESTOR section
      if (nearbyText.includes('[company]') || nearbyText.includes('company section') || 
          nearbyText.includes('company:') || nearbyText.includes('company signatory') ||
          (nearbyText.lastIndexOf('company') > nearbyText.lastIndexOf('investor'))) {
        sectionContext = 'company';
      } else if (nearbyText.includes('investor') || nearbyText.includes('investor:') || 
                 nearbyText.includes('investor section') || nearbyText.includes('investor signatory')) {
        sectionContext = 'investor';
      }
    }
    
    // Enhanced AI-powered analysis with section context
    const contextualDocumentContext = sectionContext ? 
      `${sectionContext === 'company' ? '[COMPANY]' : '[INVESTOR]'} section: ${documentContext}` : 
      documentContext;
    
    const analysis = {
      placeholder,
      category: 'general',
      suggestedQuestion: generateSmartQuestion(placeholder, contextualDocumentContext),
      relatedPlaceholders: [],
      required: true,
      type: 'text', // text, number, date, email, address, etc.
      confidence: 0.8,
      aiEnhanced: false,
      sectionContext // Store section context for better question generation
    };
    
    // Use AI context understanding if available
    if (import.meta.env.VITE_HF_TOKEN && documentContext.length > 50) {
      try {
        // Analyze the placeholder in context using AI
        const sectionHint = sectionContext ? 
          `This placeholder is in the ${sectionContext.toUpperCase()} section. ` : '';
        const analysisPrompt = `Analyze this placeholder "${placeholder}" in this legal document${sectionHint ? ` (${sectionHint})` : ''}:
${contextualDocumentContext.substring(0, 500)}

Determine:
1. Category: date, financial, entity, location, contact, or general
2. Input type: text, number, date, email, address
3. Whether it's required
4. A natural, context-aware question to ask${sectionHint ? " (mention if it's for company or investor)" : ""}

Response format: category|type|required|question`;

        const response = await hf.textGeneration({
          model: TEXT_GENERATION_MODEL,
          inputs: analysisPrompt,
          parameters: {
            max_new_tokens: 50,
            temperature: 0.3,
            return_full_text: false
          }
        });
        
        const aiResult = response.generated_text?.trim();
        if (aiResult && aiResult.includes('|')) {
          const parts = aiResult.split('|');
          if (parts.length >= 4) {
            analysis.category = parts[0]?.trim().toLowerCase() || analysis.category;
            analysis.type = parts[1]?.trim().toLowerCase() || analysis.type;
            analysis.required = parts[2]?.trim().toLowerCase() === 'true';
            analysis.suggestedQuestion = parts[3]?.trim() || analysis.suggestedQuestion;
            analysis.aiEnhanced = true;
            analysis.confidence = 0.95;
          }
        }
      } catch (aiError) {
        console.warn('AI analysis failed, using pattern matching:', aiError);
      }
    }
    
    // Pattern-based categorization (fallback/enhancement)
    if (!analysis.aiEnhanced) {
      if (lowerPlaceholder.includes('date') || lowerPlaceholder.includes('effective_date') || lowerPlaceholder.includes('signing')) {
        analysis.category = 'date';
        analysis.type = 'date';
      } else if (lowerPlaceholder.includes('amount') || lowerPlaceholder.includes('price') || lowerPlaceholder.includes('valuation') || lowerPlaceholder.includes('cap') || lowerPlaceholder.includes('discount')) {
        analysis.category = 'financial';
        analysis.type = 'number';
      } else if (lowerPlaceholder.includes('address') || lowerPlaceholder.includes('street') || lowerPlaceholder.includes('city')) {
        analysis.category = 'location';
        analysis.type = 'address';
      } else if (lowerPlaceholder.includes('email')) {
        analysis.category = 'contact';
        analysis.type = 'email';
      } else if (lowerPlaceholder.includes('phone')) {
        analysis.category = 'contact';
        analysis.type = 'tel';
      } else if (lowerPlaceholder.includes('company') || lowerPlaceholder.includes('entity')) {
        analysis.category = 'entity';
      } else if (lowerPlaceholder.includes('investor') || lowerPlaceholder.includes('signer') || lowerPlaceholder.includes('signatory')) {
        analysis.category = 'entity';
      }
    }
    
    // Find related placeholders using semantic similarity
    analysis.relatedPlaceholders = allPlaceholders.filter(p => {
      const pLower = p.toLowerCase();
      if (p === placeholder) return false;
      
      // Check for shared root words
      const placeholderWords = placeholder.split('_');
      const otherWords = p.split('_');
      const sharedWords = placeholderWords.filter(w => otherWords.includes(w));
      
      return sharedWords.length > 0 || 
             pLower.includes(placeholderWords[0]) || 
             lowerPlaceholder.includes(otherWords[0]) ||
             (lowerPlaceholder.includes('company') && pLower.includes('company')) ||
             (lowerPlaceholder.includes('investor') && pLower.includes('investor')) ||
             (lowerPlaceholder.includes('date') && pLower.includes('date'));
    });
    
    return analysis;
    
  } catch (error) {
    console.error('Error analyzing placeholder:', error);
    return {
      placeholder,
      category: 'general',
      suggestedQuestion: generateSmartQuestion(placeholder, documentContext),
      required: true,
      type: 'text',
      confidence: 0.5
    };
  }
};

/**
 * Batch analyze all placeholders from a document
 */
export const analyzeAllPlaceholders = async (placeholders, documentContext = '') => {
  try {
    const analyses = await Promise.all(
      placeholders.map(placeholder => 
        analyzePlaceholder(placeholder, placeholders, documentContext)
      )
    );
    
    // Sort by category and importance
    const sorted = analyses.sort((a, b) => {
      // Put dates first, then financial, then entities, then general
      const categoryOrder = { date: 0, financial: 1, entity: 2, location: 3, contact: 4, general: 5 };
      return (categoryOrder[a.category] || 5) - (categoryOrder[b.category] || 5);
    });
    
    return sorted;
  } catch (error) {
    console.error('Error analyzing placeholders:', error);
    return placeholders.map(p => ({
      placeholder: p,
      category: 'general',
      suggestedQuestion: generateSmartQuestion(p, documentContext),
      required: true,
      type: 'text'
    }));
  }
};

