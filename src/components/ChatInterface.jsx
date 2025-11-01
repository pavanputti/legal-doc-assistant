import { useState, useEffect, useRef } from 'react';
import useDocumentStore from '../store/useDocumentStore';
import { generateQuestionForPlaceholder, analyzePlaceholder } from '../services/aiService';
import SignatureUpload from './SignatureUpload';

const ChatInterface = () => {
  const [inputValue, setInputValue] = useState('');
  const [showSignatureUpload, setShowSignatureUpload] = useState(false);
  const messagesEndRef = useRef(null);
  
  const {
    messages,
    placeholders,
    placeholderAnalyses,
    currentQuestionIndex,
    filledValues,
    addMessage,
    addFilledValue,
    setCurrentQuestionIndex,
    getCurrentQuestion
  } = useDocumentStore();

  useEffect(() => {
    // Auto-scroll to bottom when messages change
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    // Show the first question if we have placeholders
    // Only ask if we have placeholders, exactly 1 message (system message), and haven't asked first question yet
    if (placeholders.length > 0 && 
        messages.length === 1 && 
        currentQuestionIndex === 0 &&
        messages[0].type === 'system') {
      askNextQuestion();
    }
  }, [placeholders, messages.length, currentQuestionIndex]);

  useEffect(() => {
    // Check if current question is for a signature field ("by" field)
    const currentQuestion = getCurrentQuestion();
    if (currentQuestion?.placeholder) {
      const placeholderLower = currentQuestion.placeholder.toLowerCase();
      const isSignatureField = placeholderLower === 'by' || 
                               placeholderLower === 'company_by' || 
                               placeholderLower === 'investor_by' ||
                               placeholderLower.includes('_by');
      setShowSignatureUpload(isSignatureField);
    } else {
      setShowSignatureUpload(false);
    }
  }, [currentQuestionIndex, placeholders]);

  const askNextQuestion = async () => {
    // First, find the next unfilled placeholder by skipping already-filled ones
    let nextUnfilledIndex = currentQuestionIndex;
    while (nextUnfilledIndex < placeholders.length) {
      const placeholderKey = placeholders[nextUnfilledIndex];
      if (!filledValues[placeholderKey] || !filledValues[placeholderKey].trim()) {
        // Found an unfilled placeholder
        break;
      }
      nextUnfilledIndex++;
    }
    
    // Update the current question index to the next unfilled placeholder
    if (nextUnfilledIndex !== currentQuestionIndex && nextUnfilledIndex < placeholders.length) {
      setCurrentQuestionIndex(nextUnfilledIndex);
    }
    
    // If we've gone past all placeholders, we're done
    if (nextUnfilledIndex >= placeholders.length) {
      return;
    }
    
    const question = getCurrentQuestion();
    if (!question || !question.placeholder) {
      return;
    }
    
    const placeholderKey = question.placeholder;
    
    // Double-check: if this placeholder is already filled, skip it
    if (filledValues[placeholderKey] && filledValues[placeholderKey].trim()) {
      console.log('[ChatInterface] Placeholder already filled, skipping to next:', placeholderKey);
      // Move to next and ask again
      const nextIndex = nextUnfilledIndex + 1;
      if (nextIndex < placeholders.length) {
        setCurrentQuestionIndex(nextIndex);
        setTimeout(() => askNextQuestion(), 100);
      }
      return;
    }
    
    // Check if we've already asked this EXACT question for this EXACT placeholder
    // Look for assistant messages with the same placeholder that were followed by a user response
    const existingQuestion = messages.find((m, idx) => {
      if (m.type === 'assistant' && m.placeholder === placeholderKey) {
        // Check if there's a user response immediately after this question (or before next assistant question)
        const nextMessages = messages.slice(idx + 1);
        const nextUserMessage = nextMessages.find(msg => msg.type === 'user');
        const nextAssistantMessage = nextMessages.find(msg => msg.type === 'assistant');
        
        // If there's a user message before the next assistant message, this question was answered
        if (nextUserMessage) {
          const userMsgIndex = messages.indexOf(nextUserMessage);
          const assistantMsgIndex = nextAssistantMessage ? messages.indexOf(nextAssistantMessage) : messages.length;
          
          // User responded before next assistant question = this question was answered
          if (userMsgIndex < assistantMsgIndex) {
            return true; // Found an answered question for this placeholder
          }
        }
      }
      return false;
    });
    
    if (existingQuestion) {
      // Question already asked and answered for this placeholder, skip to next
      console.log('[ChatInterface] Question already asked and answered for placeholder, skipping:', placeholderKey);
      const nextIndex = nextUnfilledIndex + 1;
      if (nextIndex < placeholders.length) {
        setCurrentQuestionIndex(nextIndex);
        setTimeout(() => askNextQuestion(), 100);
      }
      return;
    }
    
    // Also check if we just asked this question (no response yet) - prevent duplicate
    const recentlyAsked = messages.slice(-3).some(m => 
      m.type === 'assistant' && 
      m.placeholder === placeholderKey
    );
    
    if (recentlyAsked) {
      console.log('[ChatInterface] Question just asked, waiting for response:', placeholderKey);
      return;
    }
    
    // Use AI to generate a contextual question
    let questionText;
    if (placeholderAnalyses[placeholderKey]) {
      // Use pre-analyzed question from AI
      questionText = placeholderAnalyses[placeholderKey].suggestedQuestion;
    } else {
      // Generate question on-the-fly (fallback)
      questionText = await generateQuestionForPlaceholder(placeholderKey);
    }
    
    console.log('[ChatInterface] Asking question:', {
      index: nextUnfilledIndex,
      placeholder: placeholderKey,
      question: questionText
    });
    
    addMessage({
      id: `question-${nextUnfilledIndex}-${placeholderKey}-${Date.now()}-${Math.random()}`,
      type: 'assistant',
      text: questionText,
      placeholder: placeholderKey
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!inputValue.trim()) return;

    const currentQuestion = getCurrentQuestion();
    if (!currentQuestion) {
      addMessage({
        id: `message-${Date.now()}`,
        type: 'user',
        text: inputValue
      });
      
      addMessage({
        id: `response-${Date.now()}`,
        type: 'assistant',
        text: 'All questions have been answered! You can now download the completed document.'
      });
      setInputValue('');
      return;
    }

    // Add user message
    addMessage({
      id: `user-${Date.now()}`,
      type: 'user',
      text: inputValue
    });

    // Save the filled value - this triggers the preview update
    const placeholderKey = currentQuestion.placeholder;
    const answerValue = inputValue.trim();
    
    console.log('Saving answer:', { placeholderKey, answerValue });
    
    addFilledValue(placeholderKey, answerValue);
    
    // Verify it was saved
    setTimeout(() => {
      const state = useDocumentStore.getState();
      console.log('Current filled values after save:', state.filledValues);
      console.log(`Value for ${placeholderKey}:`, state.filledValues[placeholderKey]);
    }, 100);

    // Find the next unfilled placeholder
    // IMPORTANT: Check filledValues AFTER saving the current answer
    // Get the latest state to ensure we have the updated filledValues
    const latestState = useDocumentStore.getState();
    let nextUnfilledIndex = currentQuestionIndex + 1;
    while (nextUnfilledIndex < placeholders.length) {
      const nextPlaceholderKey = placeholders[nextUnfilledIndex];
      const isFilled = latestState.filledValues[nextPlaceholderKey] && latestState.filledValues[nextPlaceholderKey].trim() !== '';
      if (!isFilled) {
        // Found an unfilled placeholder
        break;
      }
      nextUnfilledIndex++;
    }

    // Move to next unfilled question or confirm completion
    if (nextUnfilledIndex < placeholders.length) {
      setCurrentQuestionIndex(nextUnfilledIndex);
      setTimeout(() => {
        askNextQuestion();
      }, 500);
    } else {
      // All questions answered
      addMessage({
        id: `complete-${Date.now()}`,
        type: 'assistant',
        text: 'Great! All questions have been answered. You can now download your completed document.'
      });
    }

    setInputValue('');
  };

  const allQuestionsAnswered = placeholders.length > 0 && 
    Object.keys(filledValues).length === placeholders.length;

  if (placeholders.length === 0) {
    return (
      <div className="chat-interface">
        <div className="chat-placeholder">
          <p>Upload a document to start filling in placeholders</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-interface">
      <div className="chat-header">
        <h3>Fields to Complete</h3>
        <div style={{ marginTop: '0.75rem' }}>
          <div className="progress-bar">
            <div 
              className="progress-fill"
              style={{ 
                width: `${Math.round((Object.keys(filledValues).length / placeholders.length) * 100)}%` 
              }}
            />
          </div>
          <p className="progress-text" style={{ marginTop: '0.5rem' }}>
            {Object.keys(filledValues).length} of {placeholders.length} completed
          </p>
        </div>
      </div>

      <div className="chat-messages">
        {messages.map((message, index) => (
          <div 
            key={`${message.id}-${index}-${message.text.substring(0, 20)}`} 
            className={`message message-${message.type}`}
          >
            <div className="message-content">
              {message.type === 'assistant' && (
                <div className="message-avatar">🤖</div>
              )}
              <div className="message-text">{message.text}</div>
              {message.type === 'user' && (
                <div className="message-avatar">👤</div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {!allQuestionsAnswered && (
        <>
          {showSignatureUpload ? (
            <div className="signature-section">
              <SignatureUpload
                placeholder={getCurrentQuestion()?.placeholder}
                onSignatureUpload={(signatureData) => {
                  const currentQuestion = getCurrentQuestion();
                  if (currentQuestion?.placeholder) {
                    // Store signature (could be text or base64 image)
                    const placeholderKey = currentQuestion.placeholder;
                    addFilledValue(placeholderKey, signatureData);
                    
                    // Add user message
                    addMessage({
                      id: `user-signature-${Date.now()}`,
                      type: 'user',
                      text: signatureData.startsWith('data:image') ? '[Signature Image]' : signatureData
                    });

                    // Find the next unfilled placeholder
                    // IMPORTANT: Check filledValues AFTER saving the current answer
                    const latestState = useDocumentStore.getState();
                    let nextUnfilledIndex = currentQuestionIndex + 1;
                    while (nextUnfilledIndex < placeholders.length) {
                      const nextPlaceholderKey = placeholders[nextUnfilledIndex];
                      const isFilled = latestState.filledValues[nextPlaceholderKey] && latestState.filledValues[nextPlaceholderKey].trim() !== '';
                      if (!isFilled) {
                        // Found an unfilled placeholder
                        break;
                      }
                      nextUnfilledIndex++;
                    }

                    // Move to next unfilled question or confirm completion
                    if (nextUnfilledIndex < placeholders.length) {
                      setCurrentQuestionIndex(nextUnfilledIndex);
                      setTimeout(() => {
                        askNextQuestion();
                      }, 500);
                    } else {
                      // All questions answered
                      addMessage({
                        id: `complete-${Date.now()}`,
                        type: 'assistant',
                        text: 'Great! All questions have been answered. You can now download your completed document.'
                      });
                    }
                    
                    setShowSignatureUpload(false);
                  }
                }}
              />
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="chat-input-form">
              <input
                id="chat-input-field"
                name="chat-input"
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Type your answer..."
                className="chat-input"
                autoFocus
              />
              <button type="submit" className="chat-submit">
                Send
              </button>
            </form>
          )}
        </>
      )}

      {allQuestionsAnswered && (
        <div className="chat-complete">
          <p>✓ All questions answered!</p>
        </div>
      )}
    </div>
  );
};

export default ChatInterface;

