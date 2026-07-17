// GENERATED from the legacy template switch (see registry.test.ts for the
// equivalence proof). Category: Freelancer. Edit as data — no logic here.
import type { TemplateSpec } from './types';

export const freelancerTemplates: TemplateSpec[] = [
{
  "tool": "create_freelancer_invoice",
  "label": "freelancer invoice",
  "cells": {
    "A1": {
      "value": "INVOICE"
    },
    "A3": {
      "value": "Invoice #:"
    },
    "B3": {
      "value": "INV-001"
    },
    "A4": {
      "value": "Date:"
    },
    "B4": {
      "value": "2024-01-15"
    },
    "A5": {
      "value": "Due Date:"
    },
    "B5": {
      "value": "2024-02-15"
    },
    "A7": {
      "value": "Bill To:"
    },
    "B7": {
      "value": "Client Name"
    },
    "A8": {
      "value": ""
    },
    "B8": {
      "value": "Client Address"
    },
    "A10": {
      "value": "Description"
    },
    "B10": {
      "value": "Hours"
    },
    "C10": {
      "value": "Rate"
    },
    "D10": {
      "value": "Amount"
    },
    "A11": {
      "value": "Web Design"
    },
    "B11": {
      "value": 40
    },
    "C11": {
      "value": 100
    },
    "D11": {
      "value": null,
      "formula": "=B11*C11"
    },
    "A12": {
      "value": "Development"
    },
    "B12": {
      "value": 60
    },
    "C12": {
      "value": 120
    },
    "D12": {
      "value": null,
      "formula": "=B12*C12"
    },
    "A13": {
      "value": "Consulting"
    },
    "B13": {
      "value": 10
    },
    "C13": {
      "value": 150
    },
    "D13": {
      "value": null,
      "formula": "=B13*C13"
    },
    "A15": {
      "value": "SUBTOTAL"
    },
    "D15": {
      "value": null,
      "formula": "=SUM(D11:D13)"
    },
    "A16": {
      "value": "Tax (10%)"
    },
    "D16": {
      "value": null,
      "formula": "=D15*0.1"
    },
    "A17": {
      "value": "TOTAL DUE"
    },
    "D17": {
      "value": null,
      "formula": "=D15+D16"
    }
  },
  "formats": [
    {
      "ids": [
        "A10",
        "B10",
        "C10",
        "D10"
      ],
      "format": {
        "bold": true,
        "bgColor": "#B45309",
        "fontColor": "#FFFFFF",
        "textAlign": "center"
      }
    },
    {
      "ids": [
        "A1"
      ],
      "format": {
        "bold": true,
        "fontSize": 20,
        "fontColor": "#B45309"
      }
    },
    {
      "ids": [
        "A17"
      ],
      "format": {
        "bold": true
      }
    },
    {
      "ids": [
        "D17"
      ],
      "format": {
        "bold": true,
        "fontSize": 14,
        "bgColor": "#FEF3C7"
      }
    }
  ]
},
{
  "tool": "create_quarterly_tax",
  "label": "quarterly tax",
  "cells": {
    "A1": {
      "value": "Quarterly Tax Estimator"
    },
    "A3": {
      "value": "Quarter"
    },
    "B3": {
      "value": "Gross Income"
    },
    "C3": {
      "value": "Expenses"
    },
    "D3": {
      "value": "Net Income"
    },
    "E3": {
      "value": "Tax Rate"
    },
    "F3": {
      "value": "Est. Tax Due"
    },
    "A4": {
      "value": "Q1 (Jan-Mar)"
    },
    "B4": {
      "value": 15000
    },
    "C4": {
      "value": 3000
    },
    "D4": {
      "value": null,
      "formula": "=B4-C4"
    },
    "E4": {
      "value": 0.3
    },
    "F4": {
      "value": null,
      "formula": "=D4*E4"
    },
    "A5": {
      "value": "Q2 (Apr-Jun)"
    },
    "B5": {
      "value": 18000
    },
    "C5": {
      "value": 4000
    },
    "D5": {
      "value": null,
      "formula": "=B5-C5"
    },
    "E5": {
      "value": 0.3
    },
    "F5": {
      "value": null,
      "formula": "=D5*E5"
    },
    "A6": {
      "value": "Q3 (Jul-Sep)"
    },
    "B6": {
      "value": 12000
    },
    "C6": {
      "value": 2500
    },
    "D6": {
      "value": null,
      "formula": "=B6-C6"
    },
    "E6": {
      "value": 0.3
    },
    "F6": {
      "value": null,
      "formula": "=D6*E6"
    },
    "A7": {
      "value": "Q4 (Oct-Dec)"
    },
    "B7": {
      "value": 16000
    },
    "C7": {
      "value": 3500
    },
    "D7": {
      "value": null,
      "formula": "=B7-C7"
    },
    "E7": {
      "value": 0.3
    },
    "F7": {
      "value": null,
      "formula": "=D7*E7"
    },
    "A9": {
      "value": "ANNUAL TOTAL"
    },
    "B9": {
      "value": null,
      "formula": "=SUM(B4:B7)"
    },
    "C9": {
      "value": null,
      "formula": "=SUM(C4:C7)"
    },
    "D9": {
      "value": null,
      "formula": "=SUM(D4:D7)"
    },
    "F9": {
      "value": null,
      "formula": "=SUM(F4:F7)"
    }
  },
  "formats": [
    {
      "ids": [
        "A3",
        "B3",
        "C3",
        "D3",
        "E3",
        "F3"
      ],
      "format": {
        "bold": true,
        "bgColor": "#B45309",
        "fontColor": "#FFFFFF",
        "textAlign": "center"
      }
    },
    {
      "ids": [
        "A1"
      ],
      "format": {
        "bold": true,
        "fontSize": 16,
        "fontColor": "#B45309"
      }
    },
    {
      "ids": [
        "A9"
      ],
      "format": {
        "bold": true
      }
    },
    {
      "ids": [
        "B9",
        "C9",
        "D9",
        "F9"
      ],
      "format": {
        "bold": true,
        "bgColor": "#FEF3C7"
      }
    }
  ]
},
{
  "tool": "create_mileage_tracker",
  "label": "mileage tracker",
  "cells": {
    "A1": {
      "value": "Mileage Tracker"
    },
    "A3": {
      "value": "Date"
    },
    "B3": {
      "value": "Start Location"
    },
    "C3": {
      "value": "End Location"
    },
    "D3": {
      "value": "Miles"
    },
    "E3": {
      "value": "Purpose"
    },
    "F3": {
      "value": "Deduction"
    },
    "A4": {
      "value": "2024-01-05"
    },
    "B4": {
      "value": "Office"
    },
    "C4": {
      "value": "Client Site"
    },
    "D4": {
      "value": 25
    },
    "E4": {
      "value": "Client meeting"
    },
    "F4": {
      "value": null,
      "formula": "=D4*0.655"
    },
    "A5": {
      "value": "2024-01-10"
    },
    "B5": {
      "value": "Home"
    },
    "C5": {
      "value": "Coffee Shop"
    },
    "D5": {
      "value": 12
    },
    "E5": {
      "value": "Work session"
    },
    "F5": {
      "value": null,
      "formula": "=D5*0.655"
    },
    "A6": {
      "value": "2024-01-15"
    },
    "B6": {
      "value": "Office"
    },
    "C6": {
      "value": "Warehouse"
    },
    "D6": {
      "value": 30
    },
    "E6": {
      "value": "Supply pickup"
    },
    "F6": {
      "value": null,
      "formula": "=D6*0.655"
    },
    "A8": {
      "value": "TOTALS"
    },
    "D8": {
      "value": null,
      "formula": "=SUM(D4:D6)"
    },
    "F8": {
      "value": null,
      "formula": "=SUM(F4:F6)"
    }
  },
  "formats": [
    {
      "ids": [
        "A3",
        "B3",
        "C3",
        "D3",
        "E3",
        "F3"
      ],
      "format": {
        "bold": true,
        "bgColor": "#B45309",
        "fontColor": "#FFFFFF",
        "textAlign": "center"
      }
    },
    {
      "ids": [
        "A1"
      ],
      "format": {
        "bold": true,
        "fontSize": 16,
        "fontColor": "#B45309"
      }
    },
    {
      "ids": [
        "A8"
      ],
      "format": {
        "bold": true
      }
    },
    {
      "ids": [
        "D8",
        "F8"
      ],
      "format": {
        "bold": true,
        "bgColor": "#FEF3C7"
      }
    }
  ]
},
{
  "tool": "create_client_tracker",
  "label": "client tracker",
  "cells": {
    "A1": {
      "value": "Client Tracker"
    },
    "A3": {
      "value": "Client"
    },
    "B3": {
      "value": "Project"
    },
    "C3": {
      "value": "Status"
    },
    "D3": {
      "value": "Invoice"
    },
    "E3": {
      "value": "Amount"
    },
    "F3": {
      "value": "Paid"
    },
    "G3": {
      "value": "Balance"
    },
    "A4": {
      "value": "Acme Corp"
    },
    "B4": {
      "value": "Website Redesign"
    },
    "C4": {
      "value": "Active"
    },
    "D4": {
      "value": "INV-001"
    },
    "E4": {
      "value": 5000
    },
    "F4": {
      "value": 2500
    },
    "G4": {
      "value": null,
      "formula": "=E4-F4"
    },
    "A5": {
      "value": "Beta LLC"
    },
    "B5": {
      "value": "Mobile App"
    },
    "C5": {
      "value": "Active"
    },
    "D5": {
      "value": "INV-002"
    },
    "E5": {
      "value": 12000
    },
    "F5": {
      "value": 4000
    },
    "G5": {
      "value": null,
      "formula": "=E5-F5"
    },
    "A6": {
      "value": "Gamma Inc"
    },
    "B6": {
      "value": "Consulting"
    },
    "C6": {
      "value": "Completed"
    },
    "D6": {
      "value": "INV-003"
    },
    "E6": {
      "value": 3000
    },
    "F6": {
      "value": 3000
    },
    "G6": {
      "value": null,
      "formula": "=E6-F6"
    },
    "A8": {
      "value": "TOTALS"
    },
    "E8": {
      "value": null,
      "formula": "=SUM(E4:E6)"
    },
    "F8": {
      "value": null,
      "formula": "=SUM(F4:F6)"
    },
    "G8": {
      "value": null,
      "formula": "=SUM(G4:G6)"
    }
  },
  "formats": [
    {
      "ids": [
        "A3",
        "B3",
        "C3",
        "D3",
        "E3",
        "F3",
        "G3"
      ],
      "format": {
        "bold": true,
        "bgColor": "#B45309",
        "fontColor": "#FFFFFF",
        "textAlign": "center"
      }
    },
    {
      "ids": [
        "A1"
      ],
      "format": {
        "bold": true,
        "fontSize": 16,
        "fontColor": "#B45309"
      }
    },
    {
      "ids": [
        "A8"
      ],
      "format": {
        "bold": true
      }
    },
    {
      "ids": [
        "E8",
        "F8",
        "G8"
      ],
      "format": {
        "bold": true,
        "bgColor": "#FEF3C7"
      }
    }
  ]
},
{
  "tool": "create_hourly_timesheet",
  "label": "hourly timesheet",
  "cells": {
    "A1": {
      "value": "Hourly Timesheet"
    },
    "A2": {
      "value": "Week of: __________"
    },
    "A4": {
      "value": "Day"
    },
    "B4": {
      "value": "Project"
    },
    "C4": {
      "value": "Start"
    },
    "D4": {
      "value": "End"
    },
    "E4": {
      "value": "Hours"
    },
    "F4": {
      "value": "Rate"
    },
    "G4": {
      "value": "Total"
    },
    "A5": {
      "value": "Mon"
    },
    "B5": {
      "value": "Project A"
    },
    "C5": {
      "value": "09:00"
    },
    "D5": {
      "value": "17:00"
    },
    "E5": {
      "value": 8
    },
    "F5": {
      "value": 100
    },
    "G5": {
      "value": null,
      "formula": "=E5*F5"
    },
    "A6": {
      "value": "Tue"
    },
    "B6": {
      "value": "Project A"
    },
    "C6": {
      "value": "09:00"
    },
    "D6": {
      "value": "17:00"
    },
    "E6": {
      "value": 8
    },
    "F6": {
      "value": 100
    },
    "G6": {
      "value": null,
      "formula": "=E6*F6"
    },
    "A7": {
      "value": "Wed"
    },
    "B7": {
      "value": "Project B"
    },
    "C7": {
      "value": "10:00"
    },
    "D7": {
      "value": "16:00"
    },
    "E7": {
      "value": 6
    },
    "F7": {
      "value": 100
    },
    "G7": {
      "value": null,
      "formula": "=E7*F7"
    },
    "A8": {
      "value": "Thu"
    },
    "B8": {
      "value": "Project A"
    },
    "C8": {
      "value": "09:00"
    },
    "D8": {
      "value": "17:00"
    },
    "E8": {
      "value": 8
    },
    "F8": {
      "value": 100
    },
    "G8": {
      "value": null,
      "formula": "=E8*F8"
    },
    "A9": {
      "value": "Fri"
    },
    "B9": {
      "value": "Project B"
    },
    "C9": {
      "value": "09:00"
    },
    "D9": {
      "value": "15:00"
    },
    "E9": {
      "value": 6
    },
    "F9": {
      "value": 100
    },
    "G9": {
      "value": null,
      "formula": "=E9*F9"
    },
    "A11": {
      "value": "TOTAL"
    },
    "E11": {
      "value": null,
      "formula": "=SUM(E5:E9)"
    },
    "G11": {
      "value": null,
      "formula": "=SUM(G5:G9)"
    }
  },
  "formats": [
    {
      "ids": [
        "A4",
        "B4",
        "C4",
        "D4",
        "E4",
        "F4",
        "G4"
      ],
      "format": {
        "bold": true,
        "bgColor": "#B45309",
        "fontColor": "#FFFFFF",
        "textAlign": "center"
      }
    },
    {
      "ids": [
        "A1"
      ],
      "format": {
        "bold": true,
        "fontSize": 16,
        "fontColor": "#B45309"
      }
    },
    {
      "ids": [
        "A11"
      ],
      "format": {
        "bold": true
      }
    },
    {
      "ids": [
        "E11",
        "G11"
      ],
      "format": {
        "bold": true,
        "bgColor": "#FEF3C7"
      }
    }
  ]
},
{
  "tool": "create_project_quote",
  "label": "project quote",
  "cells": {
    "A1": {
      "value": "PROJECT QUOTE"
    },
    "A3": {
      "value": "Client:"
    },
    "B3": {
      "value": ""
    },
    "A4": {
      "value": "Project:"
    },
    "B4": {
      "value": ""
    },
    "A5": {
      "value": "Date:"
    },
    "B5": {
      "value": "2024-01-15"
    },
    "A7": {
      "value": "Item"
    },
    "B7": {
      "value": "Description"
    },
    "C7": {
      "value": "Qty"
    },
    "D7": {
      "value": "Unit Price"
    },
    "E7": {
      "value": "Total"
    },
    "A8": {
      "value": "Design"
    },
    "B8": {
      "value": "UI/UX design"
    },
    "C8": {
      "value": 1
    },
    "D8": {
      "value": 2000
    },
    "E8": {
      "value": null,
      "formula": "=C8*D8"
    },
    "A9": {
      "value": "Development"
    },
    "B9": {
      "value": "Frontend build"
    },
    "C9": {
      "value": 1
    },
    "D9": {
      "value": 5000
    },
    "E9": {
      "value": null,
      "formula": "=C9*D9"
    },
    "A10": {
      "value": "Testing"
    },
    "B10": {
      "value": "QA & bug fixes"
    },
    "C10": {
      "value": 1
    },
    "D10": {
      "value": 1000
    },
    "E10": {
      "value": null,
      "formula": "=C10*D10"
    },
    "A12": {
      "value": "SUBTOTAL"
    },
    "E12": {
      "value": null,
      "formula": "=SUM(E8:E10)"
    },
    "A13": {
      "value": "Tax (10%)"
    },
    "E13": {
      "value": null,
      "formula": "=E12*0.1"
    },
    "A14": {
      "value": "TOTAL"
    },
    "E14": {
      "value": null,
      "formula": "=E12+E13"
    }
  },
  "formats": [
    {
      "ids": [
        "A7",
        "B7",
        "C7",
        "D7",
        "E7"
      ],
      "format": {
        "bold": true,
        "bgColor": "#B45309",
        "fontColor": "#FFFFFF",
        "textAlign": "center"
      }
    },
    {
      "ids": [
        "A1"
      ],
      "format": {
        "bold": true,
        "fontSize": 20,
        "fontColor": "#B45309"
      }
    },
    {
      "ids": [
        "A14"
      ],
      "format": {
        "bold": true
      }
    },
    {
      "ids": [
        "E14"
      ],
      "format": {
        "bold": true,
        "fontSize": 14,
        "bgColor": "#FEF3C7"
      }
    }
  ]
},
{
  "tool": "create_income_expense_log",
  "label": "income expense log",
  "cells": {
    "A1": {
      "value": "Income & Expense Log"
    },
    "A3": {
      "value": "Date"
    },
    "B3": {
      "value": "Type"
    },
    "C3": {
      "value": "Category"
    },
    "D3": {
      "value": "Description"
    },
    "E3": {
      "value": "Amount"
    },
    "F3": {
      "value": "Balance"
    },
    "A4": {
      "value": "2024-01-01"
    },
    "B4": {
      "value": "Income"
    },
    "C4": {
      "value": "Client Payment"
    },
    "D4": {
      "value": "Acme Corp invoice"
    },
    "E4": {
      "value": 5000
    },
    "F4": {
      "value": 5000
    },
    "A5": {
      "value": "2024-01-03"
    },
    "B5": {
      "value": "Expense"
    },
    "C5": {
      "value": "Software"
    },
    "D5": {
      "value": "Adobe subscription"
    },
    "E5": {
      "value": -55
    },
    "F5": {
      "value": null,
      "formula": "=F4+E5"
    },
    "A6": {
      "value": "2024-01-05"
    },
    "B6": {
      "value": "Expense"
    },
    "C6": {
      "value": "Office"
    },
    "D6": {
      "value": "Desk supplies"
    },
    "E6": {
      "value": -120
    },
    "F6": {
      "value": null,
      "formula": "=F5+E6"
    },
    "A7": {
      "value": "2024-01-10"
    },
    "B7": {
      "value": "Income"
    },
    "C7": {
      "value": "Consulting"
    },
    "D7": {
      "value": "Beta LLC"
    },
    "E7": {
      "value": 2000
    },
    "F7": {
      "value": null,
      "formula": "=F6+E7"
    },
    "A8": {
      "value": "2024-01-15"
    },
    "B8": {
      "value": "Expense"
    },
    "C8": {
      "value": "Travel"
    },
    "D8": {
      "value": "Client meeting transport"
    },
    "E8": {
      "value": -85
    },
    "F8": {
      "value": null,
      "formula": "=F7+E8"
    },
    "A10": {
      "value": "TOTALS"
    },
    "C10": {
      "value": null,
      "formula": "=SUMIF(B4:B8,\"Income\",E4:E8)"
    },
    "E10": {
      "value": null,
      "formula": "=SUMIF(B4:B8,\"Expense\",E4:E8)"
    },
    "F10": {
      "value": null,
      "formula": "=F8"
    }
  },
  "formats": [
    {
      "ids": [
        "A3",
        "B3",
        "C3",
        "D3",
        "E3",
        "F3"
      ],
      "format": {
        "bold": true,
        "bgColor": "#B45309",
        "fontColor": "#FFFFFF",
        "textAlign": "center"
      }
    },
    {
      "ids": [
        "A1"
      ],
      "format": {
        "bold": true,
        "fontSize": 16,
        "fontColor": "#B45309"
      }
    },
    {
      "ids": [
        "A10"
      ],
      "format": {
        "bold": true
      }
    },
    {
      "ids": [
        "C10",
        "E10",
        "F10"
      ],
      "format": {
        "bold": true,
        "bgColor": "#FEF3C7"
      }
    }
  ]
},
{
  "tool": "create_equipment_depreciation",
  "label": "equipment depreciation",
  "cells": {
    "A1": {
      "value": "Equipment Depreciation Tracker"
    },
    "A3": {
      "value": "Item"
    },
    "B3": {
      "value": "Purchase Date"
    },
    "C3": {
      "value": "Cost"
    },
    "D3": {
      "value": "Salvage Value"
    },
    "E3": {
      "value": "Useful Life (yr)"
    },
    "F3": {
      "value": "Annual Depreciation"
    },
    "G3": {
      "value": "Current Value"
    },
    "A4": {
      "value": "MacBook Pro"
    },
    "B4": {
      "value": "2023-06-01"
    },
    "C4": {
      "value": 2500
    },
    "D4": {
      "value": 500
    },
    "E4": {
      "value": 4
    },
    "F4": {
      "value": null,
      "formula": "=(C4-D4)/E4"
    },
    "G4": {
      "value": null,
      "formula": "=C4-F4"
    },
    "A5": {
      "value": "Camera"
    },
    "B5": {
      "value": "2023-01-15"
    },
    "C5": {
      "value": 3000
    },
    "D5": {
      "value": 600
    },
    "E5": {
      "value": 5
    },
    "F5": {
      "value": null,
      "formula": "=(C5-D5)/E5"
    },
    "G5": {
      "value": null,
      "formula": "=C5-F5"
    },
    "A6": {
      "value": "Standing Desk"
    },
    "B6": {
      "value": "2023-09-01"
    },
    "C6": {
      "value": 800
    },
    "D6": {
      "value": 100
    },
    "E6": {
      "value": 7
    },
    "F6": {
      "value": null,
      "formula": "=(C6-D6)/E6"
    },
    "G6": {
      "value": null,
      "formula": "=C6-F6"
    },
    "A8": {
      "value": "TOTALS"
    },
    "C8": {
      "value": null,
      "formula": "=SUM(C4:C6)"
    },
    "F8": {
      "value": null,
      "formula": "=SUM(F4:F6)"
    },
    "G8": {
      "value": null,
      "formula": "=SUM(G4:G6)"
    }
  },
  "formats": [
    {
      "ids": [
        "A3",
        "B3",
        "C3",
        "D3",
        "E3",
        "F3",
        "G3"
      ],
      "format": {
        "bold": true,
        "bgColor": "#B45309",
        "fontColor": "#FFFFFF",
        "textAlign": "center"
      }
    },
    {
      "ids": [
        "A1"
      ],
      "format": {
        "bold": true,
        "fontSize": 16,
        "fontColor": "#B45309"
      }
    },
    {
      "ids": [
        "A8"
      ],
      "format": {
        "bold": true
      }
    },
    {
      "ids": [
        "C8",
        "F8",
        "G8"
      ],
      "format": {
        "bold": true,
        "bgColor": "#FEF3C7"
      }
    }
  ]
},
{
  "tool": "create_profit_margin",
  "label": "profit margin",
  "cells": {
    "A1": {
      "value": "Profit Margin Calculator"
    },
    "A3": {
      "value": "Product"
    },
    "B3": {
      "value": "Selling Price"
    },
    "C3": {
      "value": "Cost"
    },
    "D3": {
      "value": "Profit"
    },
    "E3": {
      "value": "Margin %"
    },
    "A4": {
      "value": "Product A"
    },
    "B4": {
      "value": 100
    },
    "C4": {
      "value": 60
    },
    "D4": {
      "value": null,
      "formula": "=B4-C4"
    },
    "E4": {
      "value": null,
      "formula": "=D4/B4"
    },
    "A5": {
      "value": "Product B"
    },
    "B5": {
      "value": 250
    },
    "C5": {
      "value": 150
    },
    "D5": {
      "value": null,
      "formula": "=B5-C5"
    },
    "E5": {
      "value": null,
      "formula": "=D5/B5"
    },
    "A6": {
      "value": "Product C"
    },
    "B6": {
      "value": 75
    },
    "C6": {
      "value": 30
    },
    "D6": {
      "value": null,
      "formula": "=B6-C6"
    },
    "E6": {
      "value": null,
      "formula": "=D6/B6"
    },
    "A8": {
      "value": "AVERAGE MARGIN"
    },
    "E8": {
      "value": null,
      "formula": "=AVERAGE(E4:E6)"
    }
  },
  "formats": [
    {
      "ids": [
        "A3",
        "B3",
        "C3",
        "D3",
        "E3"
      ],
      "format": {
        "bold": true,
        "bgColor": "#B45309",
        "fontColor": "#FFFFFF",
        "textAlign": "center"
      }
    },
    {
      "ids": [
        "A1"
      ],
      "format": {
        "bold": true,
        "fontSize": 16,
        "fontColor": "#B45309"
      }
    },
    {
      "ids": [
        "A8"
      ],
      "format": {
        "bold": true
      }
    },
    {
      "ids": [
        "E8"
      ],
      "format": {
        "bold": true,
        "fontSize": 14,
        "bgColor": "#FEF3C7"
      }
    }
  ]
},
{
  "tool": "create_freelancer_dashboard",
  "label": "freelancer dashboard",
  "cells": {
    "A1": {
      "value": "Freelancer Dashboard"
    },
    "A3": {
      "value": "This Month"
    },
    "B3": {
      "value": "Amount"
    },
    "A4": {
      "value": "Income"
    },
    "B4": {
      "value": 8000
    },
    "A5": {
      "value": "Expenses"
    },
    "B5": {
      "value": 1500
    },
    "A6": {
      "value": "Net Profit"
    },
    "B6": {
      "value": null,
      "formula": "=B4-B5"
    },
    "A8": {
      "value": "Outstanding Invoices"
    },
    "B8": {
      "value": "Amount"
    },
    "C8": {
      "value": "Days Overdue"
    },
    "A9": {
      "value": "INV-001"
    },
    "B9": {
      "value": 2500
    },
    "C9": {
      "value": 0
    },
    "A10": {
      "value": "INV-002"
    },
    "B10": {
      "value": 4000
    },
    "C10": {
      "value": 15
    },
    "A11": {
      "value": "INV-003"
    },
    "B11": {
      "value": 1500
    },
    "C11": {
      "value": 30
    },
    "A13": {
      "value": "Total Outstanding"
    },
    "B13": {
      "value": null,
      "formula": "=SUM(B9:B11)"
    },
    "A15": {
      "value": "YTD Income"
    },
    "B15": {
      "value": 48000
    },
    "A16": {
      "value": "YTD Expenses"
    },
    "B16": {
      "value": 9000
    },
    "A17": {
      "value": "YTD Net"
    },
    "B17": {
      "value": null,
      "formula": "=B15-B16"
    }
  },
  "formats": [
    {
      "ids": [
        "A1"
      ],
      "format": {
        "bold": true,
        "fontSize": 16,
        "fontColor": "#B45309"
      }
    },
    {
      "ids": [
        "A3",
        "B3"
      ],
      "format": {
        "bold": true,
        "bgColor": "#B45309",
        "fontColor": "#FFFFFF"
      }
    },
    {
      "ids": [
        "B6"
      ],
      "format": {
        "bold": true,
        "bgColor": "#D1FAE5"
      }
    },
    {
      "ids": [
        "A8",
        "B8",
        "C8"
      ],
      "format": {
        "bold": true,
        "bgColor": "#B45309",
        "fontColor": "#FFFFFF"
      }
    },
    {
      "ids": [
        "B13"
      ],
      "format": {
        "bold": true,
        "bgColor": "#FEF3C7"
      }
    },
    {
      "ids": [
        "B17"
      ],
      "format": {
        "bold": true,
        "bgColor": "#D1FAE5"
      }
    }
  ]
}
];
