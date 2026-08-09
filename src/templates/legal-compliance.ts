// Category: Legal & Compliance. Edit as data — no logic here.
import type { TemplateSpec } from './types';

export const legalComplianceTemplates: TemplateSpec[] = [
{
  "tool": "create_contract_renewal_calendar",
  "label": "contract renewal calendar",
  "cells": {
    "A1": { "value": "Contract Renewal Calendar" },
    "A2": { "value": "Year: 2024" },
    "A4": { "value": "Contract" },
    "B4": { "value": "Vendor/Party" },
    "C4": { "value": "Start Date" },
    "D4": { "value": "End Date" },
    "E4": { "value": "Annual Value" },
    "F4": { "value": "Notice Period (Days)" },
    "G4": { "value": "Auto-Renew" },
    "H4": { "value": "Status" },
    "A5": { "value": "Cloud Hosting Agreement" },
    "B5": { "value": "AWS Inc." },
    "C5": { "value": "2023-04-01" },
    "D5": { "value": "2024-03-31" },
    "E5": { "value": 54000 },
    "F5": { "value": 60 },
    "G5": { "value": "Yes" },
    "H5": { "value": "Renewed" },
    "A6": { "value": "Office Lease" },
    "B6": { "value": "Meridian Properties" },
    "C6": { "value": "2022-01-01" },
    "D6": { "value": "2024-12-31" },
    "E6": { "value": 96000 },
    "F6": { "value": 90 },
    "G6": { "value": "No" },
    "H6": { "value": "Expiring Soon" },
    "A7": { "value": "Legal Retainer" },
    "B7": { "value": "Whitfield & Associates LLP" },
    "C7": { "value": "2024-01-01" },
    "D7": { "value": "2024-12-31" },
    "E7": { "value": 36000 },
    "F7": { "value": 30 },
    "G7": { "value": "Yes" },
    "H7": { "value": "Active" },
    "A8": { "value": "SaaS License (CRM)" },
    "B8": { "value": "Salesforce" },
    "C8": { "value": "2023-07-01" },
    "D8": { "value": "2024-06-30" },
    "E8": { "value": 18000 },
    "F8": { "value": 45 },
    "G8": { "value": "Yes" },
    "H8": { "value": "Review Pending" },
    "A10": { "value": "TOTAL ANNUAL VALUE" },
    "E10": { "value": null, "formula": "=SUM(E5:E8)" }
  },
  "formats": [
    {
      "ids": ["A4", "B4", "C4", "D4", "E4", "F4", "G4", "H4"],
      "format": { "bold": true, "bgColor": "#7C3AED", "fontColor": "#FFFFFF", "textAlign": "center" }
    },
    {
      "ids": ["A1"],
      "format": { "bold": true, "fontSize": 16, "fontColor": "#7C3AED" }
    },
    {
      "ids": ["A10"],
      "format": { "bold": true }
    },
    {
      "ids": ["E10"],
      "format": { "bold": true, "bgColor": "#EDE9FE" }
    }
  ]
},
{
  "tool": "create_legal_matter_tracker",
  "label": "legal matter tracker",
  "cells": {
    "A1": { "value": "Legal Matter Tracker" },
    "A3": { "value": "Matter ID" },
    "B3": { "value": "Matter Name" },
    "C3": { "value": "Type" },
    "D3": { "value": "Assigned Attorney" },
    "E3": { "value": "Status" },
    "F3": { "value": "Date Opened" },
    "G3": { "value": "Estimated Cost" },
    "H3": { "value": "Priority" },
    "A4": { "value": "LM-2024-001" },
    "B4": { "value": "Smith v. Acme Corp" },
    "C4": { "value": "Litigation" },
    "D4": { "value": "J. Whitfield" },
    "E4": { "value": "Discovery" },
    "F4": { "value": "2024-01-15" },
    "G4": { "value": 75000 },
    "H4": { "value": "High" },
    "A5": { "value": "LM-2024-002" },
    "B5": { "value": "Series B Financing" },
    "C5": { "value": "Corporate" },
    "D5": { "value": "M. Patel" },
    "E5": { "value": "Drafting" },
    "F5": { "value": "2024-02-01" },
    "G5": { "value": 45000 },
    "H5": { "value": "High" },
    "A6": { "value": "LM-2024-003" },
    "B6": { "value": "Patent Application #4892" },
    "C6": { "value": "IP" },
    "D6": { "value": "R. Tanaka" },
    "E6": { "value": "Filed" },
    "F6": { "value": "2024-02-20" },
    "G6": { "value": 15000 },
    "H6": { "value": "Medium" },
    "A7": { "value": "LM-2024-004" },
    "B7": { "value": "Employee Dispute - HR Claim" },
    "C7": { "value": "Employment" },
    "D7": { "value": "J. Whitfield" },
    "E7": { "value": "Mediation" },
    "F7": { "value": "2024-03-05" },
    "G7": { "value": 25000 },
    "H7": { "value": "Medium" },
    "A9": { "value": "TOTAL ESTIMATED COST" },
    "G9": { "value": null, "formula": "=SUM(G4:G7)" }
  },
  "formats": [
    {
      "ids": ["A3", "B3", "C3", "D3", "E3", "F3", "G3", "H3"],
      "format": { "bold": true, "bgColor": "#7C3AED", "fontColor": "#FFFFFF", "textAlign": "center" }
    },
    {
      "ids": ["A1"],
      "format": { "bold": true, "fontSize": 16, "fontColor": "#7C3AED" }
    },
    {
      "ids": ["A9"],
      "format": { "bold": true }
    },
    {
      "ids": ["G9"],
      "format": { "bold": true, "bgColor": "#EDE9FE" }
    }
  ]
},
{
  "tool": "create_compliance_audit_checklist",
  "label": "compliance audit checklist",
  "cells": {
    "A1": { "value": "Compliance Audit Checklist" },
    "A2": { "value": "Audit Period: Q1 2024" },
    "A4": { "value": "Control Area" },
    "B4": { "value": "Requirement" },
    "C4": { "value": "Framework" },
    "D4": { "value": "Owner" },
    "E4": { "value": "Evidence" },
    "F4": { "value": "Status" },
    "G4": { "value": "Last Reviewed" },
    "A5": { "value": "Data Privacy" },
    "B5": { "value": "Customer consent records maintained" },
    "C5": { "value": "GDPR Art. 7" },
    "D5": { "value": "DPO" },
    "E5": { "value": "Consent DB export" },
    "F5": { "value": "Compliant" },
    "G5": { "value": "2024-03-01" },
    "A6": { "value": "Access Control" },
    "B6": { "value": "Quarterly access reviews completed" },
    "C6": { "value": "SOC 2 CC6.1" },
    "D6": { "value": "IT Security" },
    "E6": { "value": "Access review log" },
    "F6": { "value": "Compliant" },
    "G6": { "value": "2024-02-15" },
    "A7": { "value": "Financial Reporting" },
    "B7": { "value": "Revenue recognition policy documented" },
    "C7": { "value": "ASC 606" },
    "D7": { "value": "Controller" },
    "E7": { "value": "Policy document v3.1" },
    "F7": { "value": "Non-Compliant" },
    "G7": { "value": "2024-01-20" },
    "A8": { "value": "Incident Response" },
    "B8": { "value": "IR plan tested within last 12 months" },
    "C8": { "value": "SOC 2 CC7.4" },
    "D8": { "value": "CISO" },
    "E8": { "value": "Tabletop exercise report" },
    "F8": { "value": "Compliant" },
    "G8": { "value": "2024-03-10" },
    "A9": { "value": "Vendor Risk" },
    "B9": { "value": "Third-party risk assessments current" },
    "C9": { "value": "SOC 2 CC9.2" },
    "D9": { "value": "Procurement" },
    "E9": { "value": "Vendor questionnaires" },
    "F9": { "value": "In Progress" },
    "G9": { "value": "2024-02-28" }
  },
  "formats": [
    {
      "ids": ["A4", "B4", "C4", "D4", "E4", "F4", "G4"],
      "format": { "bold": true, "bgColor": "#7C3AED", "fontColor": "#FFFFFF", "textAlign": "center" }
    },
    {
      "ids": ["A1"],
      "format": { "bold": true, "fontSize": 16, "fontColor": "#7C3AED" }
    }
  ]
},
{
  "tool": "create_nda_log",
  "label": "nda log",
  "cells": {
    "A1": { "value": "NDA Log" },
    "A3": { "value": "NDA ID" },
    "B3": { "value": "Counterparty" },
    "C3": { "value": "Type" },
    "D3": { "value": "Effective Date" },
    "E3": { "value": "Expiration Date" },
    "F3": { "value": "Scope" },
    "G3": { "value": "Signed By" },
    "H3": { "value": "Status" },
    "A4": { "value": "NDA-2024-001" },
    "B4": { "value": "TechVentures Capital" },
    "C4": { "value": "Mutual" },
    "D4": { "value": "2024-01-10" },
    "E4": { "value": "2026-01-10" },
    "F4": { "value": "Due diligence — Series B" },
    "G4": { "value": "CEO" },
    "H4": { "value": "Active" },
    "A5": { "value": "NDA-2024-002" },
    "B5": { "value": "DataSync Solutions" },
    "C5": { "value": "One-Way" },
    "D5": { "value": "2024-02-05" },
    "E5": { "value": "2025-02-05" },
    "F5": { "value": "API integration partnership" },
    "G5": { "value": "CTO" },
    "H5": { "value": "Active" },
    "A6": { "value": "NDA-2024-003" },
    "B6": { "value": "Johnson & Keller LLC" },
    "C6": { "value": "Mutual" },
    "D6": { "value": "2024-03-01" },
    "E6": { "value": "2027-03-01" },
    "F6": { "value": "M&A exploration" },
    "G6": { "value": "CEO" },
    "H6": { "value": "Active" },
    "A7": { "value": "NDA-2023-018" },
    "B7": { "value": "CloudFirst Inc." },
    "C7": { "value": "One-Way" },
    "D7": { "value": "2023-06-15" },
    "E7": { "value": "2024-06-15" },
    "F7": { "value": "Vendor evaluation" },
    "G7": { "value": "VP Engineering" },
    "H7": { "value": "Expiring Soon" }
  },
  "formats": [
    {
      "ids": ["A3", "B3", "C3", "D3", "E3", "F3", "G3", "H3"],
      "format": { "bold": true, "bgColor": "#7C3AED", "fontColor": "#FFFFFF", "textAlign": "center" }
    },
    {
      "ids": ["A1"],
      "format": { "bold": true, "fontSize": 16, "fontColor": "#7C3AED" }
    }
  ]
},
{
  "tool": "create_insurance_policy_tracker",
  "label": "insurance policy tracker",
  "cells": {
    "A1": { "value": "Insurance Policy Tracker" },
    "A3": { "value": "Policy Type" },
    "B3": { "value": "Carrier" },
    "C3": { "value": "Policy Number" },
    "D3": { "value": "Coverage Limit" },
    "E3": { "value": "Annual Premium" },
    "F3": { "value": "Effective Date" },
    "G3": { "value": "Renewal Date" },
    "H3": { "value": "Status" },
    "A4": { "value": "General Liability" },
    "B4": { "value": "Hartford Insurance" },
    "C4": { "value": "GL-9928451" },
    "D4": { "value": 2000000 },
    "E4": { "value": 4800 },
    "F4": { "value": "2024-01-01" },
    "G4": { "value": "2025-01-01" },
    "H4": { "value": "Active" },
    "A5": { "value": "Professional Liability (E&O)" },
    "B5": { "value": "Chubb Ltd." },
    "C5": { "value": "PL-7741209" },
    "D5": { "value": 5000000 },
    "E5": { "value": 8200 },
    "F5": { "value": "2024-03-15" },
    "G5": { "value": "2025-03-15" },
    "H5": { "value": "Active" },
    "A6": { "value": "Cyber Liability" },
    "B6": { "value": "Coalition Inc." },
    "C6": { "value": "CY-3358820" },
    "D6": { "value": 3000000 },
    "E6": { "value": 6500 },
    "F6": { "value": "2024-02-01" },
    "G6": { "value": "2025-02-01" },
    "H6": { "value": "Active" },
    "A7": { "value": "Directors & Officers (D&O)" },
    "B7": { "value": "AIG" },
    "C7": { "value": "DO-5512874" },
    "D7": { "value": 10000000 },
    "E7": { "value": 12000 },
    "F7": { "value": "2023-09-01" },
    "G7": { "value": "2024-09-01" },
    "H7": { "value": "Renewal Due" },
    "A9": { "value": "TOTAL ANNUAL PREMIUMS" },
    "E9": { "value": null, "formula": "=SUM(E4:E7)" }
  },
  "formats": [
    {
      "ids": ["A3", "B3", "C3", "D3", "E3", "F3", "G3", "H3"],
      "format": { "bold": true, "bgColor": "#7C3AED", "fontColor": "#FFFFFF", "textAlign": "center" }
    },
    {
      "ids": ["A1"],
      "format": { "bold": true, "fontSize": 16, "fontColor": "#7C3AED" }
    },
    {
      "ids": ["A9"],
      "format": { "bold": true }
    },
    {
      "ids": ["E9"],
      "format": { "bold": true, "bgColor": "#EDE9FE" }
    }
  ]
},
{
  "tool": "create_regulatory_filing_deadlines",
  "label": "regulatory filing deadlines",
  "cells": {
    "A1": { "value": "Regulatory Filing Deadlines" },
    "A2": { "value": "Fiscal Year: 2024" },
    "A4": { "value": "Filing" },
    "B4": { "value": "Regulatory Body" },
    "C4": { "value": "Frequency" },
    "D4": { "value": "Due Date" },
    "E4": { "value": "Responsible Party" },
    "F4": { "value": "Penalty (Late)" },
    "G4": { "value": "Status" },
    "A5": { "value": "Annual Report (10-K)" },
    "B5": { "value": "SEC" },
    "C5": { "value": "Annual" },
    "D5": { "value": "2024-03-31" },
    "E5": { "value": "CFO" },
    "F5": { "value": 50000 },
    "G5": { "value": "Filed" },
    "A6": { "value": "Sales Tax Return" },
    "B6": { "value": "State Dept. of Revenue" },
    "C6": { "value": "Quarterly" },
    "D6": { "value": "2024-04-30" },
    "E6": { "value": "Controller" },
    "F6": { "value": 5000 },
    "G6": { "value": "In Progress" },
    "A7": { "value": "EEO-1 Report" },
    "B7": { "value": "EEOC" },
    "C7": { "value": "Annual" },
    "D7": { "value": "2024-06-04" },
    "E7": { "value": "HR Director" },
    "F7": { "value": 10000 },
    "G7": { "value": "Not Started" },
    "A8": { "value": "OSHA 300A Summary" },
    "B8": { "value": "OSHA" },
    "C8": { "value": "Annual" },
    "D8": { "value": "2024-02-01" },
    "E8": { "value": "Safety Officer" },
    "F8": { "value": 15000 },
    "G8": { "value": "Filed" },
    "A9": { "value": "Data Breach Notification" },
    "B9": { "value": "State AG / FTC" },
    "C9": { "value": "As Required" },
    "D9": { "value": "Within 72 hours" },
    "E9": { "value": "DPO / Legal" },
    "F9": { "value": 100000 },
    "G9": { "value": "N/A — No Incidents" },
    "A11": { "value": "MAX PENALTY EXPOSURE" },
    "F11": { "value": null, "formula": "=SUM(F5:F9)" }
  },
  "formats": [
    {
      "ids": ["A4", "B4", "C4", "D4", "E4", "F4", "G4"],
      "format": { "bold": true, "bgColor": "#7C3AED", "fontColor": "#FFFFFF", "textAlign": "center" }
    },
    {
      "ids": ["A1"],
      "format": { "bold": true, "fontSize": 16, "fontColor": "#7C3AED" }
    },
    {
      "ids": ["A11"],
      "format": { "bold": true }
    },
    {
      "ids": ["F11"],
      "format": { "bold": true, "bgColor": "#EDE9FE" }
    }
  ]
}
];
