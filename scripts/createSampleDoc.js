// Script to create a sample DOCX file with placeholders
// Run with: node scripts/createSampleDoc.js

import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { writeFileSync } from 'fs';

const doc = new Document({
  sections: [
    {
      properties: {},
      children: [
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [
            new TextRun({
              text: 'SAMPLE LEGAL AGREEMENT',
              bold: true,
              size: 32,
            }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: '',
            }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: 'This Agreement is entered into on {{date}} between {{company_name}}, a {{company_type}} (the "Company") and {{investor_name}}, a {{investor_type}} (the "Investor").',
            }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: '',
            }),
          ],
        }),
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [
            new TextRun({
              text: '1. DEFINITIONS',
              bold: true,
            }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: 'For the purposes of this Agreement, the following terms shall have the meanings set forth below:',
            }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: 'a) "Valuation Cap" means ${valuation_cap_amount};',
            }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: 'b) "Investment Amount" means ${investment_amount};',
            }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: '',
            }),
          ],
        }),
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [
            new TextRun({
              text: '2. INVESTMENT TERMS',
              bold: true,
            }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: 'The Investor agrees to invest {{investment_amount}} in exchange for {{equity_percentage}}% equity in the Company, subject to a valuation cap of {{valuation_cap}}.',
            }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: '',
            }),
          ],
        }),
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [
            new TextRun({
              text: '3. REPRESENTATIONS AND WARRANTIES',
              bold: true,
            }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: 'The Company represents and warrants that it is duly organized and validly existing under the laws of {{jurisdiction}}, with its principal place of business at {{company_address}}.',
            }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: '',
            }),
          ],
        }),
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [
            new TextRun({
              text: '4. SIGNATURES',
              bold: true,
            }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: 'IN WITNESS WHEREOF, the parties have executed this Agreement as of the date first written above.',
            }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: '',
            }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: 'Company:',
            }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: '_________________________',
            }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: '{{company_name}}',
              bold: true,
            }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: '',
            }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: 'Investor:',
            }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: '_________________________',
            }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: '{{investor_name}}',
              bold: true,
            }),
          ],
        }),
      ],
    },
  ],
});

// Generate the document
Packer.toBuffer(doc).then((buffer) => {
  writeFileSync('public/sample-document.docx', buffer);
  console.log('Sample document created at public/sample-document.docx');
});

