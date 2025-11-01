# SAFE Document Field Semantics

This document defines the semantic meaning of each field/placeholder in Y Combinator SAFE documents.

## COMPANY Section

### [COMPANY]
- **Semantic Meaning:** Name of the company issuing the SAFE
- **Question:** "What is the name of the company issuing the SAFE?"
- **Type:** string
- **Example:** "Acme Corp, Inc."

### By: (blank line under Company section)
- **Semantic Meaning:** Signature line for the person signing on behalf of the company
- **Question:** "Who is signing on behalf of the company? (Enter name for signature line)"
- **Type:** string
- **Note:** This is typically auto-filled with the signatory's name, but may need manual entry
- **Example:** "John Doe"

### [name] (in Company section)
- **Semantic Meaning:** Name of the person signing on behalf of the company
- **Question:** "What is the name of the person signing on behalf of the company?"
- **Type:** string
- **Example:** "John Doe"

### [title] (in Company section)
- **Semantic Meaning:** Title of the company signatory (e.g., CEO, President, CFO)
- **Question:** "What is the title of the company signatory? (e.g., CEO, President)"
- **Type:** string
- **Example:** "Chief Executive Officer" or "CEO"

### Address: (blank line in Company section)
- **Semantic Meaning:** Company's physical address
- **Question:** "What is the company's address?"
- **Type:** string
- **Example:** "123 Main Street, San Francisco, CA 94105"

### Email: (blank line in Company section)
- **Semantic Meaning:** Company's email address
- **Question:** "What is the company's email address?"
- **Type:** string
- **Example:** "contact@acmecorp.com"

## INVESTOR Section

### By: (blank line under Investor section)
- **Semantic Meaning:** Investor's signature line
- **Question:** "Who is signing on behalf of the investor? (Enter name for signature line)"
- **Type:** string
- **Note:** This is typically auto-filled with the investor's name
- **Example:** "Jane Smith"

### Name: (blank line under Investor section)
- **Semantic Meaning:** Investor's name
- **Question:** "What is the investor's name?"
- **Type:** string
- **Example:** "Jane Smith"

### Title: (blank line under Investor section)
- **Semantic Meaning:** Investor's title or designation (e.g., Managing Director, Partner, Individual Investor)
- **Question:** "What is the investor's title or designation? (e.g., Managing Director, Partner)"
- **Type:** string
- **Example:** "Managing Director" or "Partner"

### Address: (blank line under Investor section)
- **Semantic Meaning:** Investor's physical address
- **Question:** "What is the investor's address?"
- **Type:** string
- **Example:** "456 Oak Avenue, New York, NY 10001"

### Email: (blank line under Investor section)
- **Semantic Meaning:** Investor's email address
- **Question:** "What is the investor's email address?"
- **Type:** string
- **Example:** "jane@investorfund.com"

## Field Detection Rules

### Explicit Placeholders (Brackets)
- `[COMPANY]` → Detected as `company` placeholder
- `[name]` → Detected as `name` (context determines if company or investor)
- `[title]` → Detected as `title` (context determines if company or investor)

### Implicit Placeholders (Labels with Blanks)
- `Address:` → Detected as `company_address` or `investor_address` based on section
- `Email:` → Detected as `company_email` or `investor_email` based on section
- `Name:` → Detected as `investor_name` (in investor section)
- `Title:` → Detected as `investor_title` (in investor section)
- `By:` → Detected based on section context

### Underscore-Based Blanks
- `Name: __________` → Detected as section-specific name field
- `Address: ____` → Detected as section-specific address field
- Similar patterns for Email, Title, By

## Section Detection Logic

1. **COMPANY Section:**
   - Starts when `[COMPANY]` marker is found
   - Includes all fields until `INVESTOR:` marker
   - Fields: [COMPANY], By:, [name], [title], Address:, Email:

2. **INVESTOR Section:**
   - Starts when `INVESTOR:` marker is found
   - Includes all fields until end of document
   - Fields: By:, Name:, Title:, Address:, Email:

## Question Generation Priority

1. Check exact placeholder key match (e.g., `company`, `company_address`)
2. Check section context (COMPANY vs INVESTOR)
3. Use semantic mapping from this document
4. Fall back to generic question based on field name

