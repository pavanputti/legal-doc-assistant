import { useRef, useState } from 'react';
import useDocumentStore from '../store/useDocumentStore';
import { parseDocument } from '../services/documentParser';
import { analyzeAllPlaceholders } from '../services/aiService';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../config/firebase';

const DocumentUpload = () => {
  const fileInputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  
  const {
    setUploadedFile,
    setDocumentText,
    setDocumentHtml,
    setPlaceholders,
    setPlaceholderFormatMap,
    setPlaceholderAnalyses,
    setPlaceholderObjects,
    isProcessing,
    setIsProcessing,
    reset
  } = useDocumentStore();

  const handleFile = async (file) => {
    console.log('File selected:', file?.name, file?.type);
    
    if (!file || !file.name.endsWith('.docx')) {
      setUploadError('Please upload a valid .docx file');
      return;
    }

    setUploadError(null);
    setIsProcessing(true);

    try {
      console.log('Starting document parsing...');
      console.log('File details:', {
        name: file.name,
        type: file.type,
        size: file.size
      });
      
      // Parse the document directly - parseDocument can handle File objects
      const { text, html, placeholders, placeholderFormatMap, placeholderObjects } = await parseDocument(file);
      
      console.log('Document parsed successfully:', {
        textLength: text.length,
        placeholdersCount: placeholders.length,
        placeholders,
        placeholderObjects,
        formatMap: placeholderFormatMap
      });
      
      // Analyze placeholders using AI
      console.log('Analyzing placeholders with AI...');
      const analyses = await analyzeAllPlaceholders(placeholders, text);
      const analysesMap = {};
      analyses.forEach(analysis => {
        analysesMap[analysis.placeholder] = analysis;
      });
      
      console.log('AI analysis complete:', analysesMap);
      
      // Store file and parsed data
      setUploadedFile(file);
      setDocumentText(text);
      setDocumentHtml(html);
      setPlaceholders(placeholders);
      setPlaceholderFormatMap(placeholderFormatMap);
      setPlaceholderAnalyses(analysesMap);
      
      // Store structured placeholder objects
      setPlaceholderObjects(placeholderObjects || []);
      
      console.log('Document data stored in state');
      
      // Upload to Firebase Storage (optional, non-blocking)
      // Do this in the background without blocking the UI
      // Only upload if Firebase storage is configured
      if (storage) {
        (async () => {
          try {
            console.log('Attempting Firebase upload...');
            const storageRef = ref(storage, `documents/${Date.now()}-${file.name}`);
            await uploadBytes(storageRef, file);
            const url = await getDownloadURL(storageRef);
            console.log('File uploaded to Firebase:', url);
          } catch (firebaseError) {
            console.warn('Firebase upload failed (using local file only):', firebaseError);
            // Don't show error to user - Firebase upload is optional
          }
        })();
      } else {
        console.log('Firebase storage not configured - using local file only');
      }
      
    } catch (error) {
      console.error('Error processing document:', error);
      setUploadError(error.message || 'Failed to process document. Please try again.');
    } finally {
      setIsProcessing(false);
      console.log('Processing complete');
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  return (
    <div className="document-upload">
      <div
        className={`upload-area ${isDragging ? 'dragging' : ''} ${isProcessing ? 'processing' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !isProcessing && fileInputRef.current?.click()}
        style={{ cursor: isProcessing ? 'wait' : 'pointer' }}
      >
        <input
          id="document-upload-input"
          name="document-upload"
          ref={fileInputRef}
          type="file"
          accept=".docx"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
        
        <div className="upload-content">
          {isProcessing ? (
            <>
              <div className="spinner"></div>
              <p className="upload-text">Processing document...</p>
              <p className="upload-hint">Please wait while we analyze your document</p>
            </>
          ) : (
            <>
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <p className="upload-text">
                {isDragging ? 'Drop your document here' : 'Click or drag to upload'}
              </p>
              <p className="upload-hint">Supported format: .docx</p>
            </>
          )}
        </div>
      </div>
      
      {uploadError && (
        <div className="error-message">{uploadError}</div>
      )}
      
      <button onClick={reset} className="reset-button">
        Reset
      </button>
    </div>
  );
};

export default DocumentUpload;

