/**
 * SaaS financial model demo — gallery template with HyperFormula formulas
 * for HyperFormula (no ROI(); use standard growth/margin formulas).
 */
import type { TemplateSpec } from './types';

export const saasDemoTemplates: TemplateSpec[] = [
  {
    tool: 'create_saas_financial_model',
    label: 'saas financial model',
    cells: {
      A1: { value: 'SaaS Key Metrics ($)' },
      B1: { value: 'FY 2022' },
      C1: { value: 'FY 2023' },
      D1: { value: 'FY 2024' },
      E1: { value: 'FY 2025' },
      F1: { value: 'FY 2026 (Plan)' },

      A2: { value: 'Ending ARR' },
      B2: { value: 1200000 },
      C2: { value: 2800000 },
      D2: { value: 6400000 },
      E2: { value: 12500000 },
      F2: { value: null, formula: '=E2*1.65' },

      A3: { value: 'YoY Growth Rate' },
      B3: { value: 0 },
      C3: { value: null, formula: '=(C2-B2)/B2' },
      D3: { value: null, formula: '=(D2-C2)/C2' },
      E3: { value: null, formula: '=(E2-D2)/D2' },
      F3: { value: null, formula: '=(F2-E2)/E2' },

      A4: { value: 'New Logos Acquired' },
      B4: { value: 150 },
      C4: { value: 320 },
      D4: { value: 610 },
      E4: { value: 980 },
      F4: { value: 1450 },

      A5: { value: 'Average ACV ($)' },
      B5: { value: null, formula: '=B2/B4' },
      C5: { value: null, formula: '=C2/C4' },
      D5: { value: null, formula: '=D2/D4' },
      E5: { value: null, formula: '=E2/E4' },
      F5: { value: null, formula: '=F2/F4' },

      A6: { value: 'Total Cash Receipts' },
      B6: { value: 1050000 },
      C6: { value: 2500000 },
      D6: { value: 5900000 },
      E6: { value: 11800000 },
      F6: { value: null, formula: '=F2*0.94' },

      A7: { value: 'Operating Expenses' },

      A8: { value: 'R&D / Engineering' },
      B8: { value: 650000 },
      C8: { value: 1200000 },
      D8: { value: 2300000 },
      E8: { value: 4100000 },
      F8: { value: 6200000 },

      A9: { value: 'Sales & Marketing (CAC)' },
      B9: { value: 800000 },
      C9: { value: 1800000 },
      D9: { value: 3400000 },
      E9: { value: 5800000 },
      F9: { value: null, formula: '=F4*5200' },

      A10: { value: 'G&A / Legal / Ops' },
      B10: { value: 300000 },
      C10: { value: 550000 },
      D10: { value: 950000 },
      E10: { value: 1600000 },
      F10: { value: 2400000 },

      A11: { value: 'Total Opex' },
      B11: { value: null, formula: '=SUM(B8:B10)' },
      C11: { value: null, formula: '=SUM(C8:C10)' },
      D11: { value: null, formula: '=SUM(D8:D10)' },
      E11: { value: null, formula: '=SUM(E8:E10)' },
      F11: { value: null, formula: '=SUM(F8:F10)' },

      A12: { value: 'EBITDA Summary' },

      A13: { value: 'Net Operating Profit' },
      B13: { value: null, formula: '=B6-B11' },
      C13: { value: null, formula: '=C6-C11' },
      D13: { value: null, formula: '=D6-D11' },
      E13: { value: null, formula: '=E6-E11' },
      F13: { value: null, formula: '=F6-F11' },

      A14: { value: 'EBITDA Margin (%)' },
      B14: { value: null, formula: '=B13/B6' },
      C14: { value: null, formula: '=C13/C6' },
      D14: { value: null, formula: '=D13/D6' },
      E14: { value: null, formula: '=E13/E6' },
      F14: { value: null, formula: '=F13/F6' },
    },
    formats: [
      {
        ids: ['A1', 'B1', 'C1', 'D1', 'E1', 'F1'],
        format: { bold: true, bgColor: '#F1F5F9', textAlign: 'center' },
      },
      { ids: ['A1'], format: { bold: true, fontSize: 16, textAlign: 'left' } },
      { ids: ['F1'], format: { bold: true, bgColor: '#E2E8F0', fontColor: '#2563EB' } },
      { ids: ['A2', 'A6', 'A7', 'A11', 'A12', 'A13'], format: { bold: true } },
      {
        ids: ['F2', 'F3', 'F6', 'F14'],
        format: { bold: true, bgColor: '#EFF6FF' },
      },
      {
        ids: ['B11', 'C11', 'D11', 'E11', 'F11'],
        format: { bold: true, bgColor: '#F8FAFC' },
      },
    ],
  },
];
