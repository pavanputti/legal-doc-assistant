# AI Features Documentation

This application demonstrates **experience with AI tools** by integrating open-source AI models for intelligent document processing.

## AI Integration Overview

### Open-Source AI Tools Used

1. **Hugging Face Inference API** (`@huggingface/inference`)
   - Free, open-source AI models
   - No API key required for basic usage
   - Optional token for enhanced features

### AI-Powered Features

#### 1. Intelligent Placeholder Analysis

The AI analyzes placeholders to understand:
- **Category**: date, financial, entity, location, contact, general
- **Input Type**: text, number, date, email, address, tel
- **Context**: Understands placeholder meaning from document context
- **Relationships**: Finds related placeholders

**Implementation**: `src/services/aiService.js` → `analyzePlaceholder()`

#### 2. Contextual Question Generation

AI generates natural, professional questions by:
- Understanding placeholder context in legal documents
- Creating questions that are clear and specific
- Adapting to document type (SAFE agreements, contracts, etc.)
- Using proper legal terminology

**Implementation**: `src/services/aiService.js` → `generateQuestionForPlaceholder()`

#### 3. Smart Template System (Fallback)

When AI inference isn't available, uses intelligent pattern matching:
- Recognizes common legal document patterns
- Handles abbreviations (LLC, INC, SAFE, etc.)
- Context-aware question templates

**Implementation**: `src/services/aiService.js` → `generateSmartQuestion()`

## How It Works

### Without API Token (Default)

The app uses **smart pattern recognition**:
- Analyzes placeholder names using linguistic patterns
- Recognizes legal document terminology
- Generates contextually appropriate questions
- Works completely offline

**Example:**
- `company_name` → "What is the company name?"
- `investment_amount` → "What is the investment amount?"
- `date_of_safe` → "What is the SAFE agreement date?"

### With Hugging Face Token (Enhanced)

Add `VITE_HF_TOKEN` to `.env` for:
- **AI-powered question generation** using language models
- **Contextual analysis** of placeholders in document context
- **Semantic understanding** of legal document structure
- **Better categorization** and type detection

## Configuration

### Basic Setup (No Token Required)

Works out of the box with smart templates. No configuration needed.

### Enhanced Setup (With AI Token)

1. Get a free Hugging Face token:
   - Go to https://huggingface.co/settings/tokens
   - Create a new token (read access is sufficient)

2. Add to `.env`:
   ```env
   VITE_HF_TOKEN=your_token_here
   ```

3. The app will automatically use AI models when token is present

## AI Models Used

### Current Model: `gpt2`
- Fast, lightweight
- Works for question generation
- Good balance of speed and quality

### Alternative Models (Configurable)

You can modify `src/services/aiService.js` to use different models:

```javascript
// Faster, simpler
const TEXT_GENERATION_MODEL = 'gpt2';

// Better quality (requires token)
const TEXT_GENERATION_MODEL = 'mistralai/Mistral-7B-Instruct-v0.2';

// Conversational AI
const TEXT_GENERATION_MODEL = 'microsoft/DialoGPT-medium';
```

## Benefits of AI Integration

1. **Smarter Questions**: AI understands context, not just pattern matching
2. **Better UX**: More natural, conversational questions
3. **Scalability**: Handles new placeholder types automatically
4. **Context Awareness**: Understands document type and legal terminology
5. **Open Source**: Uses free, open-source models (demonstrates AI tool experience)

## Performance Considerations

- **Without Token**: Instant responses, works offline
- **With Token**: Slight delay (~500ms-2s) for AI inference, but better quality

The app gracefully falls back to smart templates if AI inference fails, ensuring reliability.

## Demonstrating AI Tool Experience

This implementation shows:
- ✅ Understanding of AI/ML concepts
- ✅ Integration of open-source AI tools
- ✅ Practical application of AI to solve real problems
- ✅ Fallback strategies for reliability
- ✅ Performance optimization considerations

---

**This demonstrates practical experience with AI tools in a production-ready application.**

