# Legal Document Assistant

A web application for filling in placeholders in legal documents through a conversational interface. Built for Lexsy's full-stack developer test assignment.

## Features

- 📄 Upload DOCX documents with placeholders
- 🔍 Automatic placeholder detection and extraction
- 💬 Conversational interface for filling in placeholders
- 👁️ Live preview of filled document
- ⬇️ Download completed documents with all formatting preserved

## Tech Stack

### Frontend
- **React** - UI framework
- **Vite** - Build tool and dev server
- **Zustand** - State management

### DOCX Processing & Rendering
- **Mammoth.js** (`mammoth` v1.11.0) - DOCX parsing and HTML conversion
  - Extracts text: `mammoth.extractRawText()` for placeholder detection
  - Converts to HTML: `mammoth.convertToHtml()` for document preview
  - Browser-compatible, lightweight
- **PizZip** (`pizzip` v3.2.0) - Low-level DOCX manipulation
  - Direct XML manipulation for perfect formatting preservation
  - Used for replacing placeholders while maintaining document structure
- **docx** (`docx` v9.5.1) - DOCX document generation
  - Programmatic document creation
  - Used for sample document generation and fallback
- **file-saver** (`file-saver` v2.0.5) - Client-side file downloads
  - Simple, cross-browser file download API

### Backend & Services
- **Firebase Storage** - File storage (optional, app works without it)
- **Hugging Face Inference** - Open-source AI for intelligent placeholder analysis and question generation (optional, app works without it)

### Package Capabilities
- ✅ **Parse DOCX files** - Extract text and placeholders
- ✅ **Render DOCX files** - Convert to HTML for preview
- ✅ **Extract dynamic inputs** - Detect placeholders like `[name]`, `[________]`
- ✅ **Replace placeholders** - Maintain formatting while filling in values
- ✅ **Generate DOCX files** - Create new documents or modify existing ones

See `DOCX_PACKAGES.md` for detailed package documentation.

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd legal-doc-assistant
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables (optional):
   - The app works without any environment variables! However, you can optionally configure Firebase and Hugging Face for enhanced features.
   - To set up optional features, copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   - Edit `.env` and fill in your configuration (all fields are optional):
   ```env
   # Firebase Configuration (optional)
   # Get these values from: https://console.firebase.google.com/project/YOUR_PROJECT/settings/general
   VITE_FIREBASE_API_KEY=your-api-key
   VITE_FIREBASE_AUTH_DOMAIN=your-auth-domain
   VITE_FIREBASE_PROJECT_ID=your-project-id
   VITE_FIREBASE_STORAGE_BUCKET=your-storage-bucket
   VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
   VITE_FIREBASE_APP_ID=your-app-id
   VITE_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX
   
   # Hugging Face Token (optional)
   # Get your free token at: https://huggingface.co/settings/tokens
   VITE_HF_TOKEN=your-huggingface-token
   ```

**IMPORTANT SECURITY NOTE:** 
- ⚠️ **Never commit your `.env` file to version control!** It contains sensitive API keys.
- The `.env` file is already in `.gitignore` to prevent accidental commits.
- If you accidentally committed API keys, **immediately regenerate them** in the Google Cloud Console.
- **The app works perfectly without any environment variables** - it uses local file handling instead of Firebase.
- AI features work without a Hugging Face token (uses smart templates), but adding a token enables advanced AI inference.

### Running the Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### Building for Production

```bash
npm run build
```

The production build will be in the `dist` folder.

### Preview Production Build

```bash
npm run preview
```

## Usage

1. **Upload a Document**: Click or drag and drop a `.docx` file with placeholders
   - Placeholders should be in the format: `{{placeholder_name}}` or `{placeholder_name}`
   - Example: `{{company_name}}`, `{{date}}`, `{investment_amount}`

2. **Fill in Details**: Answer questions in the chat interface one by one

3. **Preview & Download**: See the filled document in real-time and download when complete

## Sample Documents

Multiple sample documents are included for testing:

1. **`public/sample-document-comprehensive.docx`** - A comprehensive test document with various placeholder types:
   - Regular placeholders: `[COMPANY]`, `[name]`, `[title]`, `[Date of Safe]`, etc.
   - Blank placeholders: `[________]` for Purchase Amount and Post-Money Valuation Cap
   - Various sections and formatting
   - Run `npm run create-sample` to regenerate this file

2. **`public/sample-document.docx`** - A simple test document with basic placeholders

3. **`sample-documents/Postmoney Safe - Discount Only - FINAL.docx`** - Real SAFE documents from Y Combinator

You can upload any of these documents to test the application.

### Creating a New Sample Document

To create or regenerate the comprehensive sample document:
```bash
npm run create-sample
```

This generates `public/sample-document-comprehensive.docx` with various placeholder formats for testing.

To create a new sample document:

```bash
node scripts/createSampleDoc.js
```

## Project Structure

```
legal-doc-assistant/
├── src/
│   ├── components/
│   │   ├── DocumentUpload.jsx    # File upload component
│   │   ├── ChatInterface.jsx      # Conversational fill interface
│   │   └── DocumentPreview.jsx    # Preview and download
│   ├── services/
│   │   ├── documentParser.js      # Extract placeholders from DOCX
│   │   └── documentGenerator.js    # Generate filled DOCX
│   ├── store/
│   │   └── useDocumentStore.js     # Zustand state management
│   ├── config/
│   │   └── firebase.js             # Firebase configuration
│   ├── App.jsx                     # Main app component
│   └── main.jsx                    # Entry point
├── public/
│   └── sample-document.docx        # Sample test document
├── scripts/
│   └── createSampleDoc.js          # Script to generate sample doc
└── package.json
```

## How It Works

1. **Document Parsing**: Uses Mammoth.js to extract text from DOCX files and identify placeholders using regex patterns
2. **Placeholder Detection**: Finds placeholders in formats like `{{name}}` or `{name}` and normalizes them
3. **State Management**: Zustand manages document state, placeholders, filled values, and chat messages
4. **Document Generation**: Uses PizZip to manipulate DOCX XML directly, preserving original formatting. Falls back to docx library if needed.

## Placeholder Format

The application recognizes placeholders in the following formats:
- `{{placeholder_name}}` (double braces)
- `{placeholder_name}` (single braces)
- Spaces are allowed: `{{ company name }}` or `{ company_name }`

Placeholder names will be normalized (lowercase, underscores) but the original format will be preserved when replacing.

## Deployment

The app can be deployed to any static hosting service:

- **Vercel**: `vercel --prod`
- **Netlify**: Connect your Git repository
- **Firebase Hosting**: `firebase deploy --only hosting`

Make sure to set environment variables in your hosting platform's settings.

## Limitations

- Currently only supports `.docx` format (not `.doc` or `.pdf`)
- Complex formatting (tables, images) might not be perfectly preserved
- Placeholders split across multiple XML nodes might not be detected

## Future Improvements

- Support for additional document formats (PDF, DOC)
- Better formatting preservation for complex documents
- Ability to edit filled values after submission
- Document templates library
- Multi-language support

## License

This project is built for Lexsy's test assignment.

---

Built with ❤️ for Lexsy - AI Law Firm for Startups
