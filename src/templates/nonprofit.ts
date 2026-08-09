// Category: Nonprofit. Edit as data — no logic here.
import type { TemplateSpec } from './types';

export const nonprofitTemplates: TemplateSpec[] = [
{
  "tool": "create_grant_tracker",
  "label": "grant tracker",
  "cells": {
    "A1": { "value": "Grant Tracker" },
    "A3": { "value": "Grant Name" },
    "B3": { "value": "Funder" },
    "C3": { "value": "Amount" },
    "D3": { "value": "Start Date" },
    "E3": { "value": "End Date" },
    "F3": { "value": "Status" },
    "G3": { "value": "Report Due" },
    "A4": { "value": "Community Health Initiative" },
    "B4": { "value": "Ford Foundation" },
    "C4": { "value": 125000 },
    "D4": { "value": "2024-01-15" },
    "E4": { "value": "2025-01-14" },
    "F4": { "value": "Active" },
    "G4": { "value": "2024-07-15" },
    "A5": { "value": "Youth STEM Program" },
    "B5": { "value": "Gates Foundation" },
    "C5": { "value": 85000 },
    "D5": { "value": "2024-03-01" },
    "E5": { "value": "2025-02-28" },
    "F5": { "value": "Active" },
    "G5": { "value": "2024-09-01" },
    "A6": { "value": "Food Security Network" },
    "B6": { "value": "USDA NIFA" },
    "C6": { "value": 200000 },
    "D6": { "value": "2023-09-01" },
    "E6": { "value": "2024-08-31" },
    "F6": { "value": "Closing" },
    "G6": { "value": "2024-09-30" },
    "A7": { "value": "Digital Literacy Outreach" },
    "B7": { "value": "Google.org" },
    "C7": { "value": 50000 },
    "D7": { "value": "2024-06-01" },
    "E7": { "value": "2024-12-31" },
    "F7": { "value": "Pending" },
    "G7": { "value": "2024-12-15" },
    "A9": { "value": "TOTAL FUNDING" },
    "C9": { "value": null, "formula": "=SUM(C4:C7)" }
  },
  "formats": [
    {
      "ids": ["A3", "B3", "C3", "D3", "E3", "F3", "G3"],
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
      "ids": ["C9"],
      "format": { "bold": true, "bgColor": "#EDE9FE" }
    }
  ]
},
{
  "tool": "create_donor_database",
  "label": "donor database",
  "cells": {
    "A1": { "value": "Donor Database" },
    "A3": { "value": "Donor Name" },
    "B3": { "value": "Email" },
    "C3": { "value": "Total Given" },
    "D3": { "value": "Last Gift" },
    "E3": { "value": "Last Gift Date" },
    "F3": { "value": "Donor Level" },
    "G3": { "value": "Notes" },
    "A4": { "value": "Margaret Chen" },
    "B4": { "value": "m.chen@email.com" },
    "C4": { "value": 15000 },
    "D4": { "value": 5000 },
    "E4": { "value": "2024-03-12" },
    "F4": { "value": "Major" },
    "G4": { "value": "Annual gala sponsor" },
    "A5": { "value": "Robert & Linda Foster" },
    "B5": { "value": "fosters@email.com" },
    "C5": { "value": 8500 },
    "D5": { "value": 2500 },
    "E5": { "value": "2024-01-20" },
    "F5": { "value": "Major" },
    "G5": { "value": "Monthly recurring" },
    "A6": { "value": "David Okonkwo" },
    "B6": { "value": "d.okonkwo@email.com" },
    "C6": { "value": 3200 },
    "D6": { "value": 500 },
    "E6": { "value": "2024-04-05" },
    "F6": { "value": "Mid-Level" },
    "G6": { "value": "Prefers email updates" },
    "A7": { "value": "Sunrise Corp" },
    "B7": { "value": "giving@sunrisecorp.com" },
    "C7": { "value": 25000 },
    "D7": { "value": 10000 },
    "E7": { "value": "2024-02-28" },
    "F7": { "value": "Corporate" },
    "G7": { "value": "Employee match eligible" },
    "A9": { "value": "TOTAL DONATIONS" },
    "C9": { "value": null, "formula": "=SUM(C4:C7)" }
  },
  "formats": [
    {
      "ids": ["A3", "B3", "C3", "D3", "E3", "F3", "G3"],
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
      "ids": ["C9"],
      "format": { "bold": true, "bgColor": "#EDE9FE" }
    }
  ]
},
{
  "tool": "create_event_fundraising_pnl",
  "label": "event fundraising P&L",
  "cells": {
    "A1": { "value": "Event Fundraising P&L" },
    "A2": { "value": "Event: Annual Gala 2024" },
    "A4": { "value": "Revenue Source" },
    "B4": { "value": "Projected" },
    "C4": { "value": "Actual" },
    "D4": { "value": "Variance" },
    "A5": { "value": "Ticket Sales (200 × $150)" },
    "B5": { "value": 30000 },
    "C5": { "value": 27000 },
    "D5": { "value": null, "formula": "=C5-B5" },
    "A6": { "value": "Silent Auction" },
    "B6": { "value": 15000 },
    "C6": { "value": 18500 },
    "D6": { "value": null, "formula": "=C6-B6" },
    "A7": { "value": "Sponsorships" },
    "B7": { "value": 20000 },
    "C7": { "value": 22000 },
    "D7": { "value": null, "formula": "=C7-B7" },
    "A8": { "value": "Paddle Raise" },
    "B8": { "value": 10000 },
    "C8": { "value": 14200 },
    "D8": { "value": null, "formula": "=C8-B8" },
    "A9": { "value": "TOTAL REVENUE" },
    "B9": { "value": null, "formula": "=SUM(B5:B8)" },
    "C9": { "value": null, "formula": "=SUM(C5:C8)" },
    "D9": { "value": null, "formula": "=C9-B9" },
    "A11": { "value": "Expense" },
    "B11": { "value": "Budget" },
    "C11": { "value": "Actual" },
    "D11": { "value": "Variance" },
    "A12": { "value": "Venue Rental" },
    "B12": { "value": 5000 },
    "C12": { "value": 5000 },
    "D12": { "value": null, "formula": "=C12-B12" },
    "A13": { "value": "Catering" },
    "B13": { "value": 8000 },
    "C13": { "value": 8750 },
    "D13": { "value": null, "formula": "=C13-B13" },
    "A14": { "value": "Entertainment" },
    "B14": { "value": 3000 },
    "C14": { "value": 2800 },
    "D14": { "value": null, "formula": "=C14-B14" },
    "A15": { "value": "Printing & Marketing" },
    "B15": { "value": 2000 },
    "C15": { "value": 1900 },
    "D15": { "value": null, "formula": "=C15-B15" },
    "A16": { "value": "TOTAL EXPENSES" },
    "B16": { "value": null, "formula": "=SUM(B12:B15)" },
    "C16": { "value": null, "formula": "=SUM(C12:C15)" },
    "D16": { "value": null, "formula": "=C16-B16" },
    "A18": { "value": "NET PROCEEDS" },
    "C18": { "value": null, "formula": "=C9-C16" }
  },
  "formats": [
    {
      "ids": ["A4", "B4", "C4", "D4"],
      "format": { "bold": true, "bgColor": "#7C3AED", "fontColor": "#FFFFFF", "textAlign": "center" }
    },
    {
      "ids": ["A11", "B11", "C11", "D11"],
      "format": { "bold": true, "bgColor": "#7C3AED", "fontColor": "#FFFFFF", "textAlign": "center" }
    },
    {
      "ids": ["A1"],
      "format": { "bold": true, "fontSize": 16, "fontColor": "#7C3AED" }
    },
    {
      "ids": ["A9", "A16", "A18"],
      "format": { "bold": true }
    },
    {
      "ids": ["C18"],
      "format": { "bold": true, "bgColor": "#D1FAE5" }
    }
  ]
},
{
  "tool": "create_volunteer_hours",
  "label": "volunteer hours",
  "cells": {
    "A1": { "value": "Volunteer Hours Log" },
    "A2": { "value": "Month: April 2024" },
    "A4": { "value": "Volunteer" },
    "B4": { "value": "Program" },
    "C4": { "value": "Week 1" },
    "D4": { "value": "Week 2" },
    "E4": { "value": "Week 3" },
    "F4": { "value": "Week 4" },
    "G4": { "value": "Total Hours" },
    "H4": { "value": "Value ($29.95/hr)" },
    "A5": { "value": "Angela Torres" },
    "B5": { "value": "Food Pantry" },
    "C5": { "value": 4 },
    "D5": { "value": 6 },
    "E5": { "value": 4 },
    "F5": { "value": 5 },
    "G5": { "value": null, "formula": "=SUM(C5:F5)" },
    "H5": { "value": null, "formula": "=G5*29.95" },
    "A6": { "value": "Brian Kowalski" },
    "B6": { "value": "Tutoring Center" },
    "C6": { "value": 3 },
    "D6": { "value": 3 },
    "E6": { "value": 3 },
    "F6": { "value": 3 },
    "G6": { "value": null, "formula": "=SUM(C6:F6)" },
    "H6": { "value": null, "formula": "=G6*29.95" },
    "A7": { "value": "Fatima Al-Hassan" },
    "B7": { "value": "Admin Support" },
    "C7": { "value": 8 },
    "D7": { "value": 8 },
    "E7": { "value": 6 },
    "F7": { "value": 8 },
    "G7": { "value": null, "formula": "=SUM(C7:F7)" },
    "H7": { "value": null, "formula": "=G7*29.95" },
    "A8": { "value": "Carlos Mendez" },
    "B8": { "value": "Event Setup" },
    "C8": { "value": 0 },
    "D8": { "value": 5 },
    "E8": { "value": 0 },
    "F8": { "value": 8 },
    "G8": { "value": null, "formula": "=SUM(C8:F8)" },
    "H8": { "value": null, "formula": "=G8*29.95" },
    "A10": { "value": "TOTALS" },
    "G10": { "value": null, "formula": "=SUM(G5:G8)" },
    "H10": { "value": null, "formula": "=SUM(H5:H8)" }
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
      "ids": ["G10", "H10"],
      "format": { "bold": true, "bgColor": "#EDE9FE" }
    }
  ]
},
{
  "tool": "create_program_budget",
  "label": "program budget",
  "cells": {
    "A1": { "value": "Program Budget" },
    "A2": { "value": "Program: Youth STEM Initiative" },
    "A4": { "value": "Line Item" },
    "B4": { "value": "Category" },
    "C4": { "value": "Budgeted" },
    "D4": { "value": "Spent" },
    "E4": { "value": "Remaining" },
    "F4": { "value": "% Used" },
    "A5": { "value": "Instructor Salaries" },
    "B5": { "value": "Personnel" },
    "C5": { "value": 45000 },
    "D5": { "value": 22500 },
    "E5": { "value": null, "formula": "=C5-D5" },
    "F5": { "value": null, "formula": "=D5/C5*100" },
    "A6": { "value": "Lab Equipment" },
    "B6": { "value": "Supplies" },
    "C6": { "value": 12000 },
    "D6": { "value": 9800 },
    "E6": { "value": null, "formula": "=C6-D6" },
    "F6": { "value": null, "formula": "=D6/C6*100" },
    "A7": { "value": "Facility Rental" },
    "B7": { "value": "Occupancy" },
    "C7": { "value": 8000 },
    "D7": { "value": 4000 },
    "E7": { "value": null, "formula": "=C7-D7" },
    "F7": { "value": null, "formula": "=D7/C7*100" },
    "A8": { "value": "Student Transportation" },
    "B8": { "value": "Travel" },
    "C8": { "value": 5000 },
    "D8": { "value": 3200 },
    "E8": { "value": null, "formula": "=C8-D8" },
    "F8": { "value": null, "formula": "=D8/C8*100" },
    "A9": { "value": "Marketing & Outreach" },
    "B9": { "value": "Admin" },
    "C9": { "value": 3000 },
    "D9": { "value": 1800 },
    "E9": { "value": null, "formula": "=C9-D9" },
    "F9": { "value": null, "formula": "=D9/C9*100" },
    "A11": { "value": "TOTAL" },
    "C11": { "value": null, "formula": "=SUM(C5:C9)" },
    "D11": { "value": null, "formula": "=SUM(D5:D9)" },
    "E11": { "value": null, "formula": "=SUM(E5:E9)" },
    "F11": { "value": null, "formula": "=D11/C11*100" }
  },
  "formats": [
    {
      "ids": ["A4", "B4", "C4", "D4", "E4", "F4"],
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
      "ids": ["C11", "D11", "E11"],
      "format": { "bold": true, "bgColor": "#EDE9FE" }
    }
  ]
},
{
  "tool": "create_board_meeting_minutes",
  "label": "board meeting minutes",
  "cells": {
    "A1": { "value": "Board Meeting Minutes" },
    "A2": { "value": "Date: April 18, 2024" },
    "A4": { "value": "Agenda Item" },
    "B4": { "value": "Presenter" },
    "C4": { "value": "Discussion Summary" },
    "D4": { "value": "Decision" },
    "E4": { "value": "Action Owner" },
    "F4": { "value": "Deadline" },
    "A5": { "value": "FY2024 Financial Review" },
    "B5": { "value": "Treasurer Kim" },
    "C5": { "value": "Revenue up 12% YoY" },
    "D5": { "value": "Approved Q3 budget" },
    "E5": { "value": "CFO" },
    "F5": { "value": "2024-05-01" },
    "A6": { "value": "New Program Proposal" },
    "B6": { "value": "Director Ruiz" },
    "C6": { "value": "After-school coding initiative" },
    "D6": { "value": "Approved pilot" },
    "E6": { "value": "Director Ruiz" },
    "F6": { "value": "2024-06-15" },
    "A7": { "value": "Board Recruitment" },
    "B7": { "value": "Chair Okafor" },
    "C7": { "value": "Need finance expertise" },
    "D7": { "value": "Form nominating committee" },
    "E7": { "value": "Chair Okafor" },
    "F7": { "value": "2024-05-15" },
    "A8": { "value": "Annual Gala Planning" },
    "B8": { "value": "Dev. Director" },
    "C8": { "value": "Theme and venue selected" },
    "D8": { "value": "Budget of $18K approved" },
    "E8": { "value": "Events Team" },
    "F8": { "value": "2024-09-01" }
  },
  "formats": [
    {
      "ids": ["A4", "B4", "C4", "D4", "E4", "F4"],
      "format": { "bold": true, "bgColor": "#7C3AED", "fontColor": "#FFFFFF", "textAlign": "center" }
    },
    {
      "ids": ["A1"],
      "format": { "bold": true, "fontSize": 16, "fontColor": "#7C3AED" }
    }
  ]
},
{
  "tool": "create_annual_report_data",
  "label": "annual report data",
  "cells": {
    "A1": { "value": "Annual Report Data" },
    "A2": { "value": "Fiscal Year 2023–2024" },
    "A4": { "value": "Metric" },
    "B4": { "value": "FY2022" },
    "C4": { "value": "FY2023" },
    "D4": { "value": "FY2024" },
    "E4": { "value": "YoY Growth" },
    "A5": { "value": "Total Revenue" },
    "B5": { "value": 520000 },
    "C5": { "value": 610000 },
    "D5": { "value": 715000 },
    "E5": { "value": null, "formula": "=(D5-C5)/C5*100" },
    "A6": { "value": "People Served" },
    "B6": { "value": 3200 },
    "C6": { "value": 4100 },
    "D6": { "value": 5500 },
    "E6": { "value": null, "formula": "=(D6-C6)/C6*100" },
    "A7": { "value": "Volunteer Hours" },
    "B7": { "value": 8500 },
    "C7": { "value": 10200 },
    "D7": { "value": 12800 },
    "E7": { "value": null, "formula": "=(D7-C7)/C7*100" },
    "A8": { "value": "Programs Delivered" },
    "B8": { "value": 12 },
    "C8": { "value": 15 },
    "D8": { "value": 18 },
    "E8": { "value": null, "formula": "=(D8-C8)/C8*100" },
    "A9": { "value": "Program Expense Ratio" },
    "B9": { "value": "78%" },
    "C9": { "value": "81%" },
    "D9": { "value": "83%" },
    "E9": { "value": "N/A" },
    "A10": { "value": "Donor Retention Rate" },
    "B10": { "value": "62%" },
    "C10": { "value": "68%" },
    "D10": { "value": "74%" },
    "E10": { "value": "N/A" }
  },
  "formats": [
    {
      "ids": ["A4", "B4", "C4", "D4", "E4"],
      "format": { "bold": true, "bgColor": "#7C3AED", "fontColor": "#FFFFFF", "textAlign": "center" }
    },
    {
      "ids": ["A1"],
      "format": { "bold": true, "fontSize": 16, "fontColor": "#7C3AED" }
    }
  ]
},
{
  "tool": "create_in_kind_donation_valuation",
  "label": "in-kind donation valuation",
  "cells": {
    "A1": { "value": "In-Kind Donation Valuation" },
    "A3": { "value": "Donor" },
    "B3": { "value": "Item/Service" },
    "C3": { "value": "Quantity" },
    "D3": { "value": "Fair Market Value" },
    "E3": { "value": "Total Value" },
    "F3": { "value": "Date Received" },
    "G3": { "value": "Acknowledged" },
    "A4": { "value": "Sunrise Corp" },
    "B4": { "value": "Office Furniture" },
    "C4": { "value": 10 },
    "D4": { "value": 350 },
    "E4": { "value": null, "formula": "=C4*D4" },
    "F4": { "value": "2024-02-10" },
    "G4": { "value": "Yes" },
    "A5": { "value": "QuickPrint LLC" },
    "B5": { "value": "Event Banners & Flyers" },
    "C5": { "value": 1 },
    "D5": { "value": 1200 },
    "E5": { "value": null, "formula": "=C5*D5" },
    "F5": { "value": "2024-03-22" },
    "G5": { "value": "Yes" },
    "A6": { "value": "Maria Santos, CPA" },
    "B6": { "value": "Pro Bono Accounting (hrs)" },
    "C6": { "value": 40 },
    "D6": { "value": 150 },
    "E6": { "value": null, "formula": "=C6*D6" },
    "F6": { "value": "2024-04-15" },
    "G6": { "value": "Pending" },
    "A7": { "value": "Fresh Farms Co-op" },
    "B7": { "value": "Produce for Food Pantry (lbs)" },
    "C7": { "value": 500 },
    "D7": { "value": 3 },
    "E7": { "value": null, "formula": "=C7*D7" },
    "F7": { "value": "2024-04-01" },
    "G7": { "value": "Yes" },
    "A9": { "value": "TOTAL IN-KIND VALUE" },
    "E9": { "value": null, "formula": "=SUM(E4:E7)" }
  },
  "formats": [
    {
      "ids": ["A3", "B3", "C3", "D3", "E3", "F3", "G3"],
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
}
];
