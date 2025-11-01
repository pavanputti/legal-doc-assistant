import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { writeFile } from 'fs/promises';

/**
 * Create a sample DOCX document with various placeholder types for testing
 */
async function createSampleDocument() {
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        // Title
        new Paragraph({
          text: "Legal Document Assistant - Sample Document",
          heading: HeadingLevel.TITLE,
        }),
        
        // Introduction paragraph with placeholder
        new Paragraph({
          children: [
            new TextRun("This is a sample document to test the Legal Document Assistant application. "),
            new TextRun("Company Name: "),
            new TextRun({
              text: "[COMPANY]",
              highlight: "yellow",
            }),
            new TextRun(" is requesting this document."),
          ],
        }),

        // Blank line
        new Paragraph({ text: "" }),

        // Agreement section with multiple placeholders
        new Paragraph({
          text: "AGREEMENT DETAILS",
          heading: HeadingLevel.HEADING_1,
        }),

        new Paragraph({
          children: [
            new TextRun("This agreement is entered into on "),
            new TextRun({
              text: "[Date of Safe]",
              highlight: "yellow",
            }),
            new TextRun(" between the parties listed below."),
          ],
        }),

        new Paragraph({ text: "" }),

        // Financial section with blank placeholder
        new Paragraph({
          text: "FINANCIAL TERMS",
          heading: HeadingLevel.HEADING_1,
        }),

        new Paragraph({
          children: [
            new TextRun("The investment amount is: $"),
            new TextRun({
              text: "[________]",
              highlight: "yellow",
            }),
            new TextRun(" (the \"Purchase Amount\")"),
          ],
        }),

        new Paragraph({
          children: [
            new TextRun("The valuation cap is: $"),
            new TextRun({
              text: "[________]",
              highlight: "yellow",
            }),
            new TextRun(" (the \"Post-Money Valuation Cap\")"),
          ],
        }),

        new Paragraph({ text: "" }),

        // Company section
        new Paragraph({
          text: "COMPANY:",
          heading: HeadingLevel.HEADING_2,
        }),

        new Paragraph({
          children: [
            new TextRun("Company Name: "),
            new TextRun({
              text: "[COMPANY]",
              highlight: "yellow",
            }),
          ],
        }),

        new Paragraph({
          children: [
            new TextRun("Signatory Name: "),
            new TextRun({
              text: "[name]",
              highlight: "yellow",
            }),
          ],
        }),

        new Paragraph({
          children: [
            new TextRun("Title: "),
            new TextRun({
              text: "[title]",
              highlight: "yellow",
            }),
          ],
        }),

        new Paragraph({
          children: [
            new TextRun("Address: "),
            new TextRun({
              text: "[Address]",
              highlight: "yellow",
            }),
          ],
        }),

        new Paragraph({
          children: [
            new TextRun("Email: "),
            new TextRun({
              text: "[Email]",
              highlight: "yellow",
            }),
          ],
        }),

        new Paragraph({
          children: [
            new TextRun("By: "),
            new TextRun({
              text: "[By]",
              highlight: "yellow",
            }),
          ],
        }),

        new Paragraph({ text: "" }),

        // Additional placeholders
        new Paragraph({
          text: "ADDITIONAL INFORMATION",
          heading: HeadingLevel.HEADING_1,
        }),

        new Paragraph({
          children: [
            new TextRun("State of Incorporation: "),
            new TextRun({
              text: "[State of Incorporation]",
              highlight: "yellow",
            }),
          ],
        }),

        new Paragraph({
          children: [
            new TextRun("Governing Law Jurisdiction: "),
            new TextRun({
              text: "[Governing Law Jurisdiction]",
              highlight: "yellow",
            }),
          ],
        }),

        new Paragraph({ text: "" }),

        // Note about placeholders
        new Paragraph({
          text: "Note: This document contains various placeholder formats for testing purposes.",
          italics: true,
        }),
      ],
    }],
  });

  // Generate the DOCX file
  const blob = await Packer.toBlob(doc);
  
  // Convert blob to buffer for Node.js
  const buffer = Buffer.from(await blob.arrayBuffer());
  
  // Save to public directory
  const outputPath = './public/sample-document-comprehensive.docx';
  await writeFile(outputPath, buffer);
  
  console.log(`✅ Sample document created successfully: ${outputPath}`);
  console.log(`📄 This document contains:`);
  console.log(`   - Regular placeholders: [COMPANY], [name], [title], etc.`);
  console.log(`   - Blank placeholders: [________] for Purchase Amount and Valuation Cap`);
  console.log(`   - Various sections with different placeholder types`);
}

// Run the script
createSampleDocument().catch(console.error);
