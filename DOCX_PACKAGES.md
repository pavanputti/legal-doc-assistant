# DOCX Processing Packages Documentation

This document describes the packages used for rendering, parsing, and manipulating DOCX files in the Legal Document Assistant application.

## Current Packages

### 1. **Mammoth.js** (`mammoth` - v1.11.0)

**Purpose**: Extract text and convert DOCX to HTML for preview

**Key Features**:
- ✅ Extracts raw text from DOCX files
- ✅ Converts DOCX to HTML (preserves basic formatting)
- ✅ Lightweight and browser-compatible
- ✅ Handles complex DOCX structures

**Usage in this project**:
- **Location**: `src/services/documentParser.js`, `src/components/DocumentPreview.jsx`
- **Functions Used**:
  - `mammoth.extractRawText({ arrayBuffer })` - Extract plain text for placeholder detection
  - `mammoth.convertToHtml({ arrayBuffer })` - Convert to HTML for preview

**Example**:
```javascript
import mammoth from 'mammoth';

const arrayBuffer = await file.arrayBuffer();
const textResult = await mammoth.extractRawText({ arrayBuffer });
const text = textResult.value; // Plain text

const htmlResult = await mammoth.convertToHtml({ arrayBuffer });
const html = htmlResult.value; // HTML for preview
```

**Limitations**:
- HTML conversion may not preserve all formatting perfectly
- Complex formatting (tables, images) may need additional handling
- Placeholders split across XML nodes might require special handling

---

### 2. **PizZip** (`pizzip` - v3.2.0)

**Purpose**: Manipulate DOCX files at the XML level (low-level editing)

**Key Features**:
- ✅ Direct access to DOCX XML structure
- ✅ Preserves original formatting perfectly
- ✅ Can modify document.xml directly
- ✅ Essential for replacing placeholders without losing formatting

**Usage in this project**:
- **Location**: `src/services/documentGenerator.js`
- **Functions Used**:
  - `new PizZip(arrayBuffer)` - Open DOCX file
  - `zip.files['word/document.xml'].asText()` - Read document XML
  - `zip.files['word/document.xml'].options.content = newXml` - Update XML
  - `zip.generate({ type: 'blob' })` - Generate new DOCX file

**Example**:
```javascript
import PizZip from 'pizzip';

const zip = new PizZip(arrayBuffer);
const docXml = zip.files['word/document.xml'].asText();
// Modify docXml (replace placeholders)
zip.files['word/document.xml'].options.content = modifiedXml;
const blob = zip.generate({ type: 'blob' });
```

**Advantages**:
- Perfect formatting preservation
- Direct control over document structure
- Efficient for placeholder replacement

**Limitations**:
- Requires understanding of DOCX XML structure
- More complex to use than high-level libraries

---

### 3. **docx** (`docx` - v9.5.1)

**Purpose**: Generate DOCX files programmatically (used for fallback and sample creation)

**Key Features**:
- ✅ Programmatically create DOCX files
- ✅ Full control over document structure
- ✅ Supports formatting, styles, tables, etc.
- ✅ TypeScript-friendly API

**Usage in this project**:
- **Location**: `src/services/documentGenerator.js` (fallback method), `scripts/createSampleDoc.js`
- **Functions Used**:
  - `Document`, `Packer`, `Paragraph`, `TextRun` - Document creation
  - `Packer.toBlob(doc)` - Generate DOCX blob

**Example**:
```javascript
import { Document, Packer, Paragraph, TextRun } from 'docx';

const doc = new Document({
  sections: [{
    children: [
      new Paragraph({
        children: [
          new TextRun("Company: [COMPANY]"),
        ],
      }),
    ],
  }],
});

const blob = await Packer.toBlob(doc);
```

**Use Cases**:
- Creating sample/test documents
- Fallback document generation
- Dynamic document creation

**Limitations**:
- Doesn't preserve original formatting when used as replacement
- Better suited for creating new documents than modifying existing ones

---

### 4. **file-saver** (`file-saver` - v2.0.5)

**Purpose**: Trigger client-side file downloads

**Key Features**:
- ✅ Simple client-side file download API
- ✅ Cross-browser compatible
- ✅ Works with Blobs and Files

**Usage in this project**:
- **Location**: `src/services/documentGenerator.js`
- **Functions Used**:
  - `saveAs(blob, filename)` - Download file

**Example**:
```javascript
import { saveAs } from 'file-saver';

const blob = await generateFilledDocument(...);
saveAs(blob, 'completed-document.docx');
```

---

## Package Workflow

### Document Parsing Flow:
```
DOCX File (ArrayBuffer)
    ↓
Mammoth.extractRawText() → Plain text for placeholder detection
Mammoth.convertToHtml() → HTML for preview rendering
    ↓
Regex matching → Extract placeholders [name], [________], etc.
    ↓
Store placeholders in state
```

### Document Generation Flow:
```
Original DOCX (ArrayBuffer)
    ↓
PizZip → Extract XML
    ↓
Replace placeholders in XML
    ↓
PizZip.generate() → New DOCX Blob
    ↓
file-saver.saveAs() → Download
```

### Fallback Flow (if PizZip fails):
```
Original DOCX (ArrayBuffer)
    ↓
Mammoth.extractRawText() → Plain text
    ↓
Replace placeholders in text
    ↓
docx library → Create new DOCX from scratch
    ↓
file-saver.saveAs() → Download
```

---

## Alternative Packages (Not Currently Used)

### 1. **docxtemplater**
- **Purpose**: Template-based DOCX manipulation
- **Pros**: Simple syntax `{placeholder}`, handles images/tables
- **Cons**: Less control, may not work well with existing docs
- **Status**: Not needed - our custom solution works better

### 2. **officegen**
- **Purpose**: Generate Office documents
- **Status**: Deprecated, not recommended

### 3. **html-docx-js**
- **Purpose**: Convert HTML to DOCX
- **Pros**: Simple HTML-to-DOCX conversion
- **Cons**: Limited formatting support, loses complex structures
- **Status**: Could be useful for simple cases, but not ideal

### 4. **docx-preview**
- **Purpose**: Preview DOCX files in browser
- **Pros**: Good for rendering DOCX without conversion
- **Cons**: May not work well for editing/placeholder highlighting
- **Status**: Mammoth.js works better for our use case

---

## Recommendations

### Current Setup ✅
The current package combination is optimal for this use case:
- **Mammoth.js** - Excellent for parsing and preview
- **PizZip** - Perfect for maintaining formatting during replacement
- **docx** - Good for fallback and sample creation
- **file-saver** - Simple and reliable for downloads

### No Changes Needed
All packages are:
- ✅ Well-maintained
- ✅ Actively developed
- ✅ Suitable for the task
- ✅ Browser-compatible
- ✅ Lightweight

---

## Sample Document Structure

The application currently supports:
- ✅ Regular placeholders: `[COMPANY]`, `[name]`, `[title]`
- ✅ Blank placeholders: `[________]` (for Purchase Amount, Valuation Cap, etc.)
- ✅ Multiple placeholder formats in the same document
- ✅ Placeholders with context (e.g., `$[________]` for monetary values)

---

## Testing Sample Document

Run the sample document generator:
```bash
node scripts/createSampleDoc.js
```

This creates `public/sample-document-comprehensive.docx` with:
- Various placeholder types
- Text and dynamic inputs
- Different sections
- Blank placeholders for testing

