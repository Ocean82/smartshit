// Category: Small Business: Operations & HR. Edit as data — no logic here.
import type { TemplateSpec } from './types';

export const smallBusinessOpsTemplates: TemplateSpec[] = [
{
  "tool": "create_employee_schedule",
  "label": "employee schedule",
  "cells": {
    "A1": { "value": "Employee Schedule" },
    "A2": { "value": "Week of: __________" },
    "A4": { "value": "Employee" },
    "B4": { "value": "Monday" },
    "C4": { "value": "Tuesday" },
    "D4": { "value": "Wednesday" },
    "E4": { "value": "Thursday" },
    "F4": { "value": "Friday" },
    "G4": { "value": "Total Hours" },
    "A5": { "value": "Sarah Mitchell" },
    "B5": { "value": "9am–5pm" },
    "C5": { "value": "9am–5pm" },
    "D5": { "value": "Off" },
    "E5": { "value": "9am–5pm" },
    "F5": { "value": "9am–5pm" },
    "G5": { "value": 32 },
    "A6": { "value": "James Rivera" },
    "B6": { "value": "10am–6pm" },
    "C6": { "value": "10am–6pm" },
    "D6": { "value": "10am–6pm" },
    "E6": { "value": "10am–6pm" },
    "F6": { "value": "Off" },
    "G6": { "value": 32 },
    "A7": { "value": "Priya Patel" },
    "B7": { "value": "8am–4pm" },
    "C7": { "value": "8am–4pm" },
    "D7": { "value": "8am–4pm" },
    "E7": { "value": "8am–4pm" },
    "F7": { "value": "8am–4pm" },
    "G7": { "value": 40 },
    "A8": { "value": "Marcus Lee" },
    "B8": { "value": "Off" },
    "C8": { "value": "12pm–8pm" },
    "D8": { "value": "12pm–8pm" },
    "E8": { "value": "12pm–8pm" },
    "F8": { "value": "12pm–8pm" },
    "G8": { "value": 32 }
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
  "tool": "create_pto_tracker",
  "label": "pto tracker",
  "cells": {
    "A1": { "value": "PTO Tracker" },
    "A2": { "value": "Year: 2024" },
    "A4": { "value": "Employee" },
    "B4": { "value": "Total Days" },
    "C4": { "value": "Used" },
    "D4": { "value": "Pending" },
    "E4": { "value": "Remaining" },
    "F4": { "value": "Last Request" },
    "A5": { "value": "Sarah Mitchell" },
    "B5": { "value": 20 },
    "C5": { "value": 8 },
    "D5": { "value": 3 },
    "E5": { "value": null, "formula": "=B5-C5-D5" },
    "F5": { "value": "2024-03-15" },
    "A6": { "value": "James Rivera" },
    "B6": { "value": 15 },
    "C6": { "value": 5 },
    "D6": { "value": 0 },
    "E6": { "value": null, "formula": "=B6-C6-D6" },
    "F6": { "value": "2024-02-20" },
    "A7": { "value": "Priya Patel" },
    "B7": { "value": 20 },
    "C7": { "value": 12 },
    "D7": { "value": 2 },
    "E7": { "value": null, "formula": "=B7-C7-D7" },
    "F7": { "value": "2024-04-01" },
    "A8": { "value": "Marcus Lee" },
    "B8": { "value": 18 },
    "C8": { "value": 3 },
    "D8": { "value": 5 },
    "E8": { "value": null, "formula": "=B8-C8-D8" },
    "F8": { "value": "2024-04-10" }
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
  "tool": "create_hiring_pipeline",
  "label": "hiring pipeline",
  "cells": {
    "A1": { "value": "Hiring Pipeline" },
    "A3": { "value": "Candidate" },
    "B3": { "value": "Role" },
    "C3": { "value": "Stage" },
    "D3": { "value": "Applied" },
    "E3": { "value": "Recruiter" },
    "F3": { "value": "Rating" },
    "G3": { "value": "Next Step" },
    "A4": { "value": "Emily Zhang" },
    "B4": { "value": "Frontend Engineer" },
    "C4": { "value": "Technical Interview" },
    "D4": { "value": "2024-03-01" },
    "E4": { "value": "Dana Ross" },
    "F4": { "value": 4 },
    "G4": { "value": "Panel Review" },
    "A5": { "value": "Kevin Okafor" },
    "B5": { "value": "Product Manager" },
    "C5": { "value": "Phone Screen" },
    "D5": { "value": "2024-03-10" },
    "E5": { "value": "Dana Ross" },
    "F5": { "value": 3 },
    "G5": { "value": "Schedule On-site" },
    "A6": { "value": "Laura Chen" },
    "B6": { "value": "UX Designer" },
    "C6": { "value": "Offer Sent" },
    "D6": { "value": "2024-02-15" },
    "E6": { "value": "Tom Baker" },
    "F6": { "value": 5 },
    "G6": { "value": "Awaiting Response" },
    "A7": { "value": "Andre Williams" },
    "B7": { "value": "DevOps Engineer" },
    "C7": { "value": "Resume Review" },
    "D7": { "value": "2024-03-18" },
    "E7": { "value": "Tom Baker" },
    "F7": { "value": 3 },
    "G7": { "value": "Phone Screen" }
  },
  "formats": [
    {
      "ids": ["A3", "B3", "C3", "D3", "E3", "F3", "G3"],
      "format": { "bold": true, "bgColor": "#7C3AED", "fontColor": "#FFFFFF", "textAlign": "center" }
    },
    {
      "ids": ["A1"],
      "format": { "bold": true, "fontSize": 16, "fontColor": "#7C3AED" }
    }
  ]
},
{
  "tool": "create_vendor_manager",
  "label": "vendor manager",
  "cells": {
    "A1": { "value": "Vendor Manager" },
    "A3": { "value": "Vendor" },
    "B3": { "value": "Category" },
    "C3": { "value": "Contact" },
    "D3": { "value": "Contract End" },
    "E3": { "value": "Monthly Cost" },
    "F3": { "value": "Rating" },
    "G3": { "value": "Status" },
    "A4": { "value": "CloudHost Pro" },
    "B4": { "value": "Infrastructure" },
    "C4": { "value": "alex@cloudhost.io" },
    "D4": { "value": "2024-12-31" },
    "E4": { "value": 450 },
    "F4": { "value": 5 },
    "G4": { "value": "Active" },
    "A5": { "value": "PaperStream Inc" },
    "B5": { "value": "Office Supplies" },
    "C5": { "value": "orders@paperstream.com" },
    "D5": { "value": "2024-06-30" },
    "E5": { "value": 120 },
    "F5": { "value": 3 },
    "G5": { "value": "Renewal Due" },
    "A6": { "value": "SafeGuard Security" },
    "B6": { "value": "Security" },
    "C6": { "value": "support@safeguard.co" },
    "D6": { "value": "2025-03-15" },
    "E6": { "value": 200 },
    "F6": { "value": 4 },
    "G6": { "value": "Active" },
    "A7": { "value": "QuickShip Logistics" },
    "B7": { "value": "Shipping" },
    "C7": { "value": "biz@quickship.net" },
    "D7": { "value": "2024-09-01" },
    "E7": { "value": 800 },
    "F7": { "value": 4 },
    "G7": { "value": "Active" },
    "A9": { "value": "TOTAL MONTHLY" },
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
},
{
  "tool": "create_inventory_reorder",
  "label": "inventory reorder",
  "cells": {
    "A1": { "value": "Inventory Reorder Planner" },
    "A3": { "value": "SKU" },
    "B3": { "value": "Product" },
    "C3": { "value": "On Hand" },
    "D3": { "value": "Reorder Point" },
    "E3": { "value": "Order Qty" },
    "F3": { "value": "Unit Cost" },
    "G3": { "value": "Order Total" },
    "H3": { "value": "Status" },
    "A4": { "value": "SKU-1001" },
    "B4": { "value": "Toner Cartridge" },
    "C4": { "value": 8 },
    "D4": { "value": 10 },
    "E4": { "value": 24 },
    "F4": { "value": 32 },
    "G4": { "value": null, "formula": "=E4*F4" },
    "H4": { "value": "Reorder" },
    "A5": { "value": "SKU-1002" },
    "B5": { "value": "Copy Paper (Ream)" },
    "C5": { "value": 45 },
    "D5": { "value": 20 },
    "E5": { "value": 0 },
    "F5": { "value": 6 },
    "G5": { "value": null, "formula": "=E5*F5" },
    "H5": { "value": "In Stock" },
    "A6": { "value": "SKU-1003" },
    "B6": { "value": "Bubble Mailers (50pk)" },
    "C6": { "value": 3 },
    "D6": { "value": 5 },
    "E6": { "value": 10 },
    "F6": { "value": 18 },
    "G6": { "value": null, "formula": "=E6*F6" },
    "H6": { "value": "Reorder" },
    "A7": { "value": "SKU-1004" },
    "B7": { "value": "Desk Lamp LED" },
    "C7": { "value": 2 },
    "D7": { "value": 4 },
    "E7": { "value": 6 },
    "F7": { "value": 45 },
    "G7": { "value": null, "formula": "=E7*F7" },
    "H7": { "value": "Critical" },
    "A9": { "value": "TOTAL ORDER COST" },
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
  "tool": "create_meeting_agenda",
  "label": "meeting agenda",
  "cells": {
    "A1": { "value": "Meeting Agenda" },
    "A2": { "value": "Date: __________" },
    "A4": { "value": "Time" },
    "B4": { "value": "Topic" },
    "C4": { "value": "Presenter" },
    "D4": { "value": "Duration (min)" },
    "E4": { "value": "Notes" },
    "A5": { "value": "9:00 AM" },
    "B5": { "value": "Welcome & Announcements" },
    "C5": { "value": "Manager" },
    "D5": { "value": 5 },
    "E5": { "value": "Team updates" },
    "A6": { "value": "9:05 AM" },
    "B6": { "value": "Q2 Revenue Review" },
    "C6": { "value": "Finance Lead" },
    "D6": { "value": 15 },
    "E6": { "value": "Dashboard walkthrough" },
    "A7": { "value": "9:20 AM" },
    "B7": { "value": "Product Roadmap Update" },
    "C7": { "value": "Product Manager" },
    "D7": { "value": 20 },
    "E7": { "value": "New feature timeline" },
    "A8": { "value": "9:40 AM" },
    "B8": { "value": "Hiring Status & Needs" },
    "C8": { "value": "HR Lead" },
    "D8": { "value": 10 },
    "E8": { "value": "Open positions review" },
    "A9": { "value": "9:50 AM" },
    "B9": { "value": "Action Items & Wrap-Up" },
    "C9": { "value": "All" },
    "D9": { "value": 10 },
    "E9": { "value": "Assign follow-ups" },
    "A11": { "value": "TOTAL DURATION" },
    "D11": { "value": null, "formula": "=SUM(D5:D9)" }
  },
  "formats": [
    {
      "ids": ["A4", "B4", "C4", "D4", "E4"],
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
      "ids": ["D11"],
      "format": { "bold": true, "bgColor": "#EDE9FE" }
    }
  ]
},
{
  "tool": "create_performance_review",
  "label": "performance review",
  "cells": {
    "A1": { "value": "Performance Review" },
    "A2": { "value": "Review Period: Q1 2024" },
    "A4": { "value": "Employee" },
    "B4": { "value": "Department" },
    "C4": { "value": "Goals Met" },
    "D4": { "value": "Quality (1-5)" },
    "E4": { "value": "Communication (1-5)" },
    "F4": { "value": "Initiative (1-5)" },
    "G4": { "value": "Overall Score" },
    "A5": { "value": "Sarah Mitchell" },
    "B5": { "value": "Engineering" },
    "C5": { "value": "4/5" },
    "D5": { "value": 5 },
    "E5": { "value": 4 },
    "F5": { "value": 4 },
    "G5": { "value": null, "formula": "=(D5+E5+F5)/3" },
    "A6": { "value": "James Rivera" },
    "B6": { "value": "Marketing" },
    "C6": { "value": "3/5" },
    "D6": { "value": 4 },
    "E6": { "value": 5 },
    "F6": { "value": 3 },
    "G6": { "value": null, "formula": "=(D6+E6+F6)/3" },
    "A7": { "value": "Priya Patel" },
    "B7": { "value": "Operations" },
    "C7": { "value": "5/5" },
    "D7": { "value": 5 },
    "E7": { "value": 5 },
    "F7": { "value": 5 },
    "G7": { "value": null, "formula": "=(D7+E7+F7)/3" },
    "A8": { "value": "Marcus Lee" },
    "B8": { "value": "Sales" },
    "C8": { "value": "3/5" },
    "D8": { "value": 3 },
    "E8": { "value": 4 },
    "F8": { "value": 4 },
    "G8": { "value": null, "formula": "=(D8+E8+F8)/3" },
    "A10": { "value": "TEAM AVERAGE" },
    "G10": { "value": null, "formula": "=AVERAGE(G5:G8)" }
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
      "ids": ["A10"],
      "format": { "bold": true }
    },
    {
      "ids": ["G10"],
      "format": { "bold": true, "bgColor": "#D1FAE5" }
    }
  ]
},
{
  "tool": "create_onboarding_checklist",
  "label": "onboarding checklist",
  "cells": {
    "A1": { "value": "Onboarding Checklist" },
    "A2": { "value": "New Hire: __________" },
    "A4": { "value": "Task" },
    "B4": { "value": "Category" },
    "C4": { "value": "Owner" },
    "D4": { "value": "Due By" },
    "E4": { "value": "Status" },
    "A5": { "value": "Send offer letter" },
    "B5": { "value": "Pre-boarding" },
    "C5": { "value": "HR" },
    "D5": { "value": "Day -7" },
    "E5": { "value": "Done" },
    "A6": { "value": "Set up workstation" },
    "B6": { "value": "IT Setup" },
    "C6": { "value": "IT" },
    "D6": { "value": "Day -1" },
    "E6": { "value": "Done" },
    "A7": { "value": "Orientation meeting" },
    "B7": { "value": "Day 1" },
    "C7": { "value": "HR" },
    "D7": { "value": "Day 1" },
    "E7": { "value": "Pending" },
    "A8": { "value": "Benefits enrollment" },
    "B8": { "value": "Admin" },
    "C8": { "value": "HR" },
    "D8": { "value": "Week 1" },
    "E8": { "value": "Pending" },
    "A9": { "value": "Assign mentor" },
    "B9": { "value": "Team Integration" },
    "C9": { "value": "Manager" },
    "D9": { "value": "Day 1" },
    "E9": { "value": "Pending" },
    "A10": { "value": "30-day check-in" },
    "B10": { "value": "Follow-up" },
    "C10": { "value": "Manager" },
    "D10": { "value": "Day 30" },
    "E10": { "value": "Not Started" }
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
}
];
