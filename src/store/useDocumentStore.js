import { create } from 'zustand';

const useDocumentStore = create((set, get) => ({
  // Document state
  uploadedFile: null,
  documentText: '',
  documentHtml: '', // Store HTML for better placeholder matching
  placeholders: [], // Array of normalized placeholder keys (for backward compatibility)
  placeholderObjects: [], // Array of structured placeholder objects {key, label, type, value, position}
  placeholderFormatMap: new Map(), // Maps normalized placeholder to original formats
  placeholderAnalyses: {}, // AI-generated analyses for each placeholder
  filledValues: {},
  
  // Chat state
  messages: [],
  currentQuestionIndex: 0,
  
  // Processing state
  isProcessing: false,
  isDocumentReady: false,
  
  // Actions
  setUploadedFile: (file) => set({ uploadedFile: file }),
  
  setDocumentText: (text) => set({ documentText: text }),
  setDocumentHtml: (html) => set({ documentHtml: html }),
  setPlaceholderFormatMap: (map) => set({ placeholderFormatMap: map }),
  
  setPlaceholders: (placeholders) => {
    // Remove duplicates and filter out invalid placeholders
    const uniquePlaceholders = Array.from(new Set(placeholders)).filter(p => p && p.trim().length > 0);
    
    set({ 
      placeholders: uniquePlaceholders,
      messages: uniquePlaceholders.length > 0 ? [
        {
          id: 'system',
          type: 'system',
          text: `I found ${uniquePlaceholders.length} placeholder${uniquePlaceholders.length > 1 ? 's' : ''} in your document. Let's fill them in!`
        }
      ] : [],
      currentQuestionIndex: 0,
      filledValues: {} // Reset filled values when new placeholders are set
    });
  },
  
  setPlaceholderObjects: (placeholderObjects) => set({ placeholderObjects }),
  
  addFilledValue: (placeholder, value) => set((state) => ({
    filledValues: {
      ...state.filledValues,
      [placeholder]: value
    }
  })),
  
  addMessage: (message) => set((state) => ({
    messages: [...state.messages, message]
  })),
  
  setCurrentQuestionIndex: (index) => set({ currentQuestionIndex: index }),
  
  setIsProcessing: (isProcessing) => set({ isProcessing }),
  
  setIsDocumentReady: (isReady) => set({ isDocumentReady: isReady }),
  
  setPlaceholderAnalyses: (analyses) => set({ placeholderAnalyses: analyses }),
  
  reset: () => set({
    uploadedFile: null,
    documentText: '',
    documentHtml: '',
    placeholders: [],
    placeholderObjects: [],
    placeholderFormatMap: new Map(),
    placeholderAnalyses: {},
    filledValues: {},
    messages: [],
    currentQuestionIndex: 0,
    isProcessing: false,
    isDocumentReady: false
  }),
  
  getCurrentQuestion: () => {
    const { placeholders, currentQuestionIndex, filledValues } = get();
    if (placeholders.length === 0 || currentQuestionIndex >= placeholders.length) {
      return null;
    }
    const placeholder = placeholders[currentQuestionIndex];
    return {
      placeholder,
      value: filledValues[placeholder] || null
    };
  },
  
  getProgress: () => {
    const { placeholders, filledValues } = get();
    if (placeholders.length === 0) return 100;
    const filledCount = Object.keys(filledValues).length;
    return Math.round((filledCount / placeholders.length) * 100);
  }
}));

export default useDocumentStore;

