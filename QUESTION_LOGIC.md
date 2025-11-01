# Question-Asking Logic Documentation

This document explains how the application asks questions to fill in document placeholders.

## Overview

The application uses a **sequential, one-by-one approach** to ask questions for each placeholder found in the document. Questions are asked in the order placeholders appear in the document.

## Flow Diagram

```
1. Document Upload
   ↓
2. Parse Document → Extract Placeholders
   ↓
3. Analyze Placeholders with AI → Generate Questions
   ↓
4. Show First Question
   ↓
5. User Answers
   ↓
6. Store Answer → Move to Next Placeholder
   ↓
7. Repeat until all placeholders filled
   ↓
8. Enable Download
```

## Step-by-Step Logic

### 1. Document Upload & Parsing

**File**: `src/components/DocumentUpload.jsx`

```javascript
// When user uploads a document:
1. Parse document using mammoth.js
2. Extract placeholders using regex patterns
3. Normalize placeholder names (lowercase, underscores)
4. Analyze placeholders with AI
5. Store in Zustand store
```

**Example Placeholders Found**:
- `company_name`
- `investor_name`
- `date_of_safe`
- `valuation_cap`
- `investment_amount`

### 2. Placeholder Analysis (AI-Powered)

**File**: `src/services/aiService.js`

```javascript
// For each placeholder:
1. Analyze placeholder name
2. Determine category (date, financial, entity, etc.)
3. Determine input type (text, number, date, etc.)
4. Generate contextual question using AI
5. Store analysis in store
```

**Question Generation**:
- Uses AI to understand context
- Generates natural, professional questions
- Adapts to legal document terminology
- Example: `company_name` → "What is the company name?"

### 3. Initial Question Display

**File**: `src/components/ChatInterface.jsx`

```javascript
// When placeholders are detected:
useEffect(() => {
  if (placeholders.length > 0 && 
      messages.length === 1 &&      // Only system message exists
      currentQuestionIndex === 0) { // Start from first question
    askNextQuestion();              // Ask first question
  }
}, [placeholders]);
```

**Current State**:
- `currentQuestionIndex = 0` (points to first placeholder)
- `messages = [{ type: 'system', text: 'Found X placeholders...' }]`
- `filledValues = {}` (empty, no answers yet)

### 4. Question Asking Logic

**File**: `src/components/ChatInterface.jsx` → `askNextQuestion()`

```javascript
const askNextQuestion = async () => {
  const question = getCurrentQuestion(); // Get placeholder at current index
  
  if (question && question.placeholder) {
    // Check if already asked (prevent duplicates)
    const existingQuestion = messages.find(m => 
      m.placeholder === question.placeholder
    );
    
    if (existingQuestion) return; // Skip if already asked
    
    // Generate question using AI or template
    let questionText;
    if (placeholderAnalyses[question.placeholder]) {
      // Use pre-analyzed AI question
      questionText = placeholderAnalyses[question.placeholder].suggestedQuestion;
    } else {
      // Generate on-the-fly
      questionText = await generateQuestionForPlaceholder(question.placeholder);
    }
    
    // Add question to messages
    addMessage({
      type: 'assistant',
      text: questionText,
      placeholder: question.placeholder
    });
  }
};
```

**What Happens**:
- Gets current placeholder at `currentQuestionIndex`
- Checks if question already asked (prevents duplicates)
- Uses AI-generated question if available
- Adds question message to chat

### 5. Answer Submission

**File**: `src/components/ChatInterface.jsx` → `handleSubmit()`

```javascript
const handleSubmit = (e) => {
  e.preventDefault();
  
  if (!inputValue.trim()) return; // Ignore empty answers
  
  const currentQuestion = getCurrentQuestion();
  
  // Add user's answer to messages
  addMessage({
    type: 'user',
    text: inputValue
  });
  
  // Save answer to store
  addFilledValue(currentQuestion.placeholder, inputValue.trim());
  
  // Move to next question
  const nextIndex = currentQuestionIndex + 1;
  setCurrentQuestionIndex(nextIndex);
  
  // Ask next question or finish
  if (nextIndex < placeholders.length) {
    setTimeout(() => askNextQuestion(), 500); // Small delay for UX
  } else {
    // All questions answered!
    addMessage({
      type: 'assistant',
      text: 'Great! All questions answered. Download your document.'
    });
  }
  
  setInputValue(''); // Clear input
};
```

**Sequence**:
1. User types answer → presses Enter or clicks Send
2. Answer stored in `filledValues` object
3. `currentQuestionIndex` increments by 1
4. Next question asked automatically
5. Repeat until all placeholders filled

### 6. Question Order

**File**: `src/store/useDocumentStore.js` → `getCurrentQuestion()`

```javascript
getCurrentQuestion: () => {
  const { placeholders, currentQuestionIndex, filledValues } = get();
  
  // Check if we've processed all placeholders
  if (placeholders.length === 0 || 
      currentQuestionIndex >= placeholders.length) {
    return null; // All done!
  }
  
  // Get placeholder at current index
  const placeholder = placeholders[currentQuestionIndex];
  
  return {
    placeholder,                              // e.g., "company_name"
    value: filledValues[placeholder] || null // User's answer (if filled)
  };
}
```

**Order Logic**:
- Questions asked in **array order** (as placeholders appear in document)
- Uses `currentQuestionIndex` as array pointer
- Each answer moves index forward
- When `index >= placeholders.length`, all done!

## Example Flow

### Document Placeholders:
```javascript
placeholders = [
  'company_name',
  'investor_name', 
  'date_of_safe',
  'valuation_cap',
  'investment_amount'
]
```

### Question Flow:
```
Step 1: Index=0 → "What is the company name?"
        User: "Acme Corp"
        filledValues = { company_name: "Acme Corp" }
        currentQuestionIndex = 1

Step 2: Index=1 → "What is the investor name?"
        User: "John Doe"
        filledValues = { company_name: "Acme Corp", investor_name: "John Doe" }
        currentQuestionIndex = 2

Step 3: Index=2 → "What is the SAFE agreement date?"
        User: "October 20, 2025"
        filledValues = { ..., date_of_safe: "October 20, 2025" }
        currentQuestionIndex = 3

Step 4: Index=3 → "What is the valuation cap?"
        User: "$5,000,000"
        filledValues = { ..., valuation_cap: "$5,000,000" }
        currentQuestionIndex = 4

Step 5: Index=4 → "What is the investment amount?"
        User: "$100,000"
        filledValues = { ..., investment_amount: "$100,000" }
        currentQuestionIndex = 5

Step 6: currentQuestionIndex (5) >= placeholders.length (5)
        → All done! Show completion message
```

## Key Components

### State Management (Zustand)

```javascript
{
  placeholders: ['company_name', 'investor_name', ...],  // Array of placeholders
  currentQuestionIndex: 2,                              // Current position (0-based)
  filledValues: {                                       // Answers stored here
    company_name: "Acme Corp",
    investor_name: "John Doe"
  },
  messages: [                                           // Chat history
    { type: 'system', text: 'Found 5 placeholders...' },
    { type: 'assistant', text: 'What is the company name?', placeholder: 'company_name' },
    { type: 'user', text: 'Acme Corp' },
    { type: 'assistant', text: 'What is the investor name?', placeholder: 'investor_name' },
    ...
  ]
}
```

### Question Generation Logic

**File**: `src/services/aiService.js`

**AI-Enhanced Questions**:
```javascript
// Uses AI to generate contextual questions
generateQuestionForPlaceholder(placeholder, documentContext)

// Smart template fallback
generateSmartQuestion(placeholder, documentContext)

// Categories and patterns:
- Company-related → "What is the company name?"
- Investor-related → "What is the investor's name?"
- Date-related → "What is the SAFE agreement date?"
- Financial → "What is the investment amount?"
- Location → "What is the state of incorporation?"
```

## Progress Tracking

**Progress Calculation**:
```javascript
const progress = (filledCount / totalPlaceholders) * 100

// Example: 3 filled / 5 total = 60%
```

**Visual Indicators**:
- Progress bar shows completion percentage
- Progress dots show individual field status
- "X of Y completed" text
- Active question highlighted

## Error Handling & Edge Cases

### Duplicate Questions
```javascript
// Prevents asking same question twice
const existingQuestion = messages.find(m => 
  m.placeholder === question.placeholder
);
if (existingQuestion) return; // Skip
```

### Empty Answers
```javascript
if (!inputValue.trim()) return; // Ignore empty submissions
```

### All Questions Answered
```javascript
if (currentQuestionIndex >= placeholders.length) {
  // Show completion message
  // Enable download button
}
```

### No Placeholders Found
```javascript
if (placeholders.length === 0) {
  // Show "No placeholders found" message
}
```

## Benefits of This Approach

1. **Sequential Flow**: Users fill one field at a time, reducing cognitive load
2. **Clear Progress**: Always know how many fields remain
3. **AI-Enhanced**: Questions are contextual and natural
4. **No Skipping**: Ensures all fields are filled before download
5. **Real-time Preview**: See document update as you fill fields
6. **Error Prevention**: Can't submit empty answers, prevents duplicates

## Future Enhancements

Possible improvements:
- Allow editing previous answers
- Jump to specific questions
- Skip optional fields
- Batch questions for related fields
- Re-order questions by priority
- Show field categories/grouping

