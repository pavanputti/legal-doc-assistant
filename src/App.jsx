import useDocumentStore from './store/useDocumentStore';
import DocumentUpload from './components/DocumentUpload';
import ChatInterface from './components/ChatInterface';
import DocumentPreview from './components/DocumentPreview';
import './App.css';

function App() {
  const { uploadedFile, placeholders, reset } = useDocumentStore();

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <div className="logo-section">
            <h1>Legal Document Assistant</h1>
            <p className="tagline">Fill documents with AI-powered intelligence</p>
          </div>
          {uploadedFile && (
            <button onClick={reset} className="header-reset-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                <path d="M3 21v-5h5" />
              </svg>
              New Document
            </button>
          )}
        </div>
      </header>

      <main className="app-main">
        {!uploadedFile ? (
          <div className="upload-container">
            <div className="upload-wrapper">
              <h2>Upload Your Document</h2>
              <p className="upload-subtitle">Get started by uploading a .docx file with placeholders</p>
              <DocumentUpload />
            </div>
          </div>
        ) : placeholders.length > 0 ? (
          <div className="docusign-layout">
            {/* Document Preview - Left Side (like DocuSign) */}
            <div className="document-panel">
              <div className="panel-header">
                <h2>Document Preview</h2>
                <span className="field-count">{placeholders.length} fields to complete</span>
              </div>
              <DocumentPreview />
            </div>

            {/* Fields & Actions - Right Side (like DocuSign) */}
            <div className="fields-panel">
              <ChatInterface />
            </div>
          </div>
        ) : (
          <div className="no-placeholders-container">
            <div className="no-placeholders-content">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              <h2>No Placeholders Found</h2>
              <p>This document doesn't contain any placeholders. Placeholders should be in the format:</p>
              <code>{'{{placeholder_name}}'} or {'{placeholder_name}'}</code>
              <button onClick={reset} className="primary-button">Try Another Document</button>
            </div>
          </div>
        )}
      </main>

      <footer className="app-footer">
        <p>Built for Lexsy - AI Law Firm for Startups</p>
      </footer>
    </div>
  );
}

export default App;
