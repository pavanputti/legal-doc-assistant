# Y Combinator SAFE Document Support

This document outlines the support for Y Combinator SAFE (Simple Agreement for Future Equity) documents in the Legal Document Assistant application.

## Supported Document Types

### US SAFE Documents
- ✅ **Postmoney Safe - Valuation Cap Only** - Most common SAFE type
- ✅ **Postmoney Safe - Discount Only** - Discount rate variant
- ✅ **Postmoney Safe - MFN Only** - Most Favored Nation clause variant
- ✅ **Pro Rata Side Letter** - Additional investor rights letter

### International SAFE Documents
- ✅ **Postmoney Safe - Valuation Cap Only (Canada)**
- ✅ **Postmoney Safe - Valuation Cap Only (Cayman)**
- ✅ **Postmoney Safe - Valuation Cap Only (Singapore)**
- ✅ **Pro Rata Side Letter (Canada/Cayman/Singapore)**

## Placeholder Detection

### Explicit Placeholders (Bracket Format)
The parser detects placeholders in the following formats:
- `[COMPANY]` - Company name placeholder
- `[name]` - Signatory name placeholder
- `[title]` - Signatory title placeholder
- `[date]` - Date placeholders
- `[valuation_cap]` - Valuation cap (if used)
- `[discount]` - Discount rate (if used)
- `[amount]` - Investment amount

**Patterns Supported:**
- Square brackets: `[placeholder]`, `[COMPANY]`
- Curly braces: `{{placeholder}}`, `{placeholder}`
- Double brackets: `[[placeholder]]`
- Angle brackets: `<placeholder>`
- Underscores: `__placeholder__`
- Hashes: `##placeholder##`

### Implicit Placeholders (Label Format)
The parser automatically detects labels followed by blank lines or underscores in signature sections:

**COMPANY Section:**
- `Address:` → Detected as `company_address`
- `Email:` → Detected as `company_email`
- `Name:` → Detected as `company_name` (if not already `[name]`)
- `Title:` → Detected as `company_title` (if not already `[title]`)

**INVESTOR Section:**
- `Address:` → Detected as `investor_address`
- `Email:` → Detected as `investor_email`
- `Name:` → Detected as `investor_name`
- `Title:` → Detected as `investor_title`

## Section Detection

The parser uses intelligent context detection to determine which section a placeholder belongs to:

1. **COMPANY Section Detection:**
   - Looks for `[COMPANY]`, `COMPANY:`, or "company section" markers
   - Tracks position relative to INVESTOR section markers
   - Assigns placeholders found after COMPANY marker to company section

2. **INVESTOR Section Detection:**
   - Looks for `INVESTOR:`, `Investor:`, or "investor section" markers
   - Assigns placeholders found after INVESTOR marker to investor section

3. **Context Window:**
   - Uses 500 character lookback window to determine section context
   - Compares position of COMPANY vs INVESTOR markers to assign correctly

## Common SAFE Document Fields

### Financial Fields
- ✅ Valuation Cap (if applicable)
- ✅ Discount Rate (if applicable)
- ✅ Investment Amount
- ✅ Company Name
- ✅ Investor Name

### Date Fields
- ✅ Effective Date
- ✅ Signing Date
- ✅ SAFE Agreement Date

### Signature Section Fields

**COMPANY:**
- ✅ `[COMPANY]` - Company legal name
- ✅ `[name]` - Company signatory name
- ✅ `[title]` - Company signatory title
- ✅ `Address:` - Company address (implicit)
- ✅ `Email:` - Company email (implicit)

**INVESTOR:**
- ✅ `Name:` - Investor name (implicit)
- ✅ `Title:` - Investor title (implicit)
- ✅ `Address:` - Investor address (implicit)
- ✅ `Email:` - Investor email (implicit)

### Location Fields
- ✅ State of Incorporation
- ✅ Governing Law Jurisdiction
- ✅ Address fields

## Question Generation

The AI service generates context-aware questions for each placeholder:

### Section-Specific Questions
- **COMPANY section:**
  - `company_address` → "What is the company's address?"
  - `company_email` → "What is the company's email address?"
  - `company_name` → "What is the company name?"

- **INVESTOR section:**
  - `investor_address` → "What is the investor's address?"
  - `investor_email` → "What is the investor's email address?"
  - `investor_name` → "What is the investor's name?"
  - `investor_title` → "What is the investor's title? (e.g., Managing Director, Partner)"

### SAFE-Specific Questions
- `valuation_cap` → "What is the valuation cap?"
- `discount` or `discount_rate` → "What is the discount rate? (e.g., 20%)"
- `investment_amount` or `amount` → "What is the investment amount?"
- `date_of_safe` or `safe_date` → "What is the SAFE agreement date?"

## Document Processing Flow

1. **Upload**: User uploads SAFE document (.docx)
2. **Parse**: Document is parsed to extract text and HTML
3. **Detect Explicit Placeholders**: Bracketed placeholders are extracted
4. **Detect Implicit Placeholders**: Labels in signature sections are detected
5. **Section Assignment**: Placeholders are assigned to COMPANY or INVESTOR sections
6. **AI Analysis**: Each placeholder is analyzed for context and question generation
7. **Question Flow**: Questions are asked one-by-one in order
8. **Replacement**: Answers replace placeholders in real-time preview
9. **Download**: Final document with all filled values can be downloaded

## Known Limitations

1. **Complex Formatting**: Some complex table or nested formatting might not preserve perfectly
2. **Split Placeholders**: Placeholders split across multiple XML nodes might not be detected
3. **International Variations**: Some country-specific fields might need additional patterns

## Testing Recommendations

1. **Test Each SAFE Variant**: Upload each type (Valuation Cap, Discount, MFN) to verify detection
2. **Test Signature Sections**: Verify all COMPANY and INVESTOR fields are detected
3. **Test International Versions**: Ensure Canada/Cayman/Singapore versions work correctly
4. **Test Pro Rata Side Letters**: Verify these simpler documents are processed correctly

## Future Enhancements

- [ ] Support for additional SAFE variants
- [ ] Enhanced formatting preservation for tables
- [ ] Support for PDF format SAFE documents
- [ ] Multi-language support for international SAFEs
- [ ] Batch processing for multiple documents

