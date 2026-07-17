// GENERATED from the legacy template switch (see registry.test.ts for the
// equivalence proof). Category: core. Edit as data — no logic here.
import type { TemplateSpec } from './types';

export const coreTemplates: TemplateSpec[] = [
{
  "tool": "create_budget_template",
  "label": "budget template",
  "cells": {
    "A1": {
      "value": "💰 Monthly Budget"
    },
    "A3": {
      "value": "Category"
    },
    "B3": {
      "value": "Budgeted"
    },
    "C3": {
      "value": "Actual"
    },
    "D3": {
      "value": "Difference"
    },
    "A5": {
      "value": "📥 INCOME"
    },
    "A6": {
      "value": "Salary"
    },
    "B6": {
      "value": 5000
    },
    "C6": {
      "value": 5000
    },
    "D6": {
      "value": null,
      "formula": "=C6-B6"
    },
    "A7": {
      "value": "Freelance"
    },
    "B7": {
      "value": 1000
    },
    "C7": {
      "value": 1200
    },
    "D7": {
      "value": null,
      "formula": "=C7-B7"
    },
    "A8": {
      "value": "Other Income"
    },
    "B8": {
      "value": 200
    },
    "C8": {
      "value": 150
    },
    "D8": {
      "value": null,
      "formula": "=C8-B8"
    },
    "A9": {
      "value": "Total Income"
    },
    "B9": {
      "value": null,
      "formula": "=SUM(B6:B8)"
    },
    "C9": {
      "value": null,
      "formula": "=SUM(C6:C8)"
    },
    "D9": {
      "value": null,
      "formula": "=C9-B9"
    },
    "A11": {
      "value": "📤 EXPENSES"
    },
    "A12": {
      "value": "Housing/Rent"
    },
    "B12": {
      "value": 1500
    },
    "C12": {
      "value": 1500
    },
    "D12": {
      "value": null,
      "formula": "=C12-B12"
    },
    "A13": {
      "value": "Utilities"
    },
    "B13": {
      "value": 200
    },
    "C13": {
      "value": 180
    },
    "D13": {
      "value": null,
      "formula": "=C13-B13"
    },
    "A14": {
      "value": "Groceries"
    },
    "B14": {
      "value": 400
    },
    "C14": {
      "value": 450
    },
    "D14": {
      "value": null,
      "formula": "=C14-B14"
    },
    "A15": {
      "value": "Transportation"
    },
    "B15": {
      "value": 150
    },
    "C15": {
      "value": 120
    },
    "D15": {
      "value": null,
      "formula": "=C15-B15"
    },
    "A16": {
      "value": "Insurance"
    },
    "B16": {
      "value": 300
    },
    "C16": {
      "value": 300
    },
    "D16": {
      "value": null,
      "formula": "=C16-B16"
    },
    "A17": {
      "value": "Entertainment"
    },
    "B17": {
      "value": 200
    },
    "C17": {
      "value": 250
    },
    "D17": {
      "value": null,
      "formula": "=C17-B17"
    },
    "A18": {
      "value": "Savings"
    },
    "B18": {
      "value": 500
    },
    "C18": {
      "value": 400
    },
    "D18": {
      "value": null,
      "formula": "=C18-B18"
    },
    "A19": {
      "value": "Other"
    },
    "B19": {
      "value": 100
    },
    "C19": {
      "value": 130
    },
    "D19": {
      "value": null,
      "formula": "=C19-B19"
    },
    "A20": {
      "value": "Total Expenses"
    },
    "B20": {
      "value": null,
      "formula": "=SUM(B12:B19)"
    },
    "C20": {
      "value": null,
      "formula": "=SUM(C12:C19)"
    },
    "D20": {
      "value": null,
      "formula": "=C20-B20"
    },
    "A22": {
      "value": "📊 NET BALANCE"
    },
    "B22": {
      "value": null,
      "formula": "=B9-B20"
    },
    "C22": {
      "value": null,
      "formula": "=C9-C20"
    },
    "D22": {
      "value": null,
      "formula": "=C22-B22"
    }
  },
  "formats": [
    {
      "ids": [
        "A3",
        "B3",
        "C3",
        "D3"
      ],
      "format": {
        "bold": true,
        "bgColor": "#1E40AF",
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
        "fontColor": "#1E40AF"
      }
    },
    {
      "ids": [
        "A5"
      ],
      "format": {
        "bold": true,
        "fontColor": "#059669"
      }
    },
    {
      "ids": [
        "A9",
        "B9",
        "C9",
        "D9"
      ],
      "format": {
        "bold": true,
        "bgColor": "#ECFDF5"
      }
    },
    {
      "ids": [
        "A11"
      ],
      "format": {
        "bold": true,
        "fontColor": "#DC2626"
      }
    },
    {
      "ids": [
        "A20",
        "B20",
        "C20",
        "D20"
      ],
      "format": {
        "bold": true,
        "bgColor": "#FEF2F2"
      }
    },
    {
      "ids": [
        "A22"
      ],
      "format": {
        "bold": true,
        "fontSize": 14,
        "fontColor": "#7C3AED"
      }
    },
    {
      "ids": [
        "B22",
        "C22",
        "D22"
      ],
      "format": {
        "bold": true,
        "bgColor": "#EDE9FE"
      }
    }
  ]
},
{
  "tool": "create_sales_tracker",
  "label": "sales tracker",
  "cells": {
    "A1": {
      "value": "📈 Sales Tracker"
    },
    "A3": {
      "value": "Product"
    },
    "B3": {
      "value": "Category"
    },
    "C3": {
      "value": "Qty Sold"
    },
    "D3": {
      "value": "Unit Price"
    },
    "E3": {
      "value": "Revenue"
    },
    "F3": {
      "value": "Cost"
    },
    "G3": {
      "value": "Profit"
    },
    "A4": {
      "value": "Widget Pro"
    },
    "B4": {
      "value": "Hardware"
    },
    "C4": {
      "value": 150
    },
    "D4": {
      "value": 29.99
    },
    "E4": {
      "value": null,
      "formula": "=C4*D4"
    },
    "F4": {
      "value": 12.5
    },
    "G4": {
      "value": null,
      "formula": "=E4-(C4*F4)"
    },
    "A5": {
      "value": "Cloud Suite"
    },
    "B5": {
      "value": "Software"
    },
    "C5": {
      "value": 85
    },
    "D5": {
      "value": 49.99
    },
    "E5": {
      "value": null,
      "formula": "=C5*D5"
    },
    "F5": {
      "value": 5
    },
    "G5": {
      "value": null,
      "formula": "=E5-(C5*F5)"
    },
    "A6": {
      "value": "Data Pack"
    },
    "B6": {
      "value": "Service"
    },
    "C6": {
      "value": 200
    },
    "D6": {
      "value": 19.99
    },
    "E6": {
      "value": null,
      "formula": "=C6*D6"
    },
    "F6": {
      "value": 8
    },
    "G6": {
      "value": null,
      "formula": "=E6-(C6*F6)"
    },
    "A7": {
      "value": "Premium Plan"
    },
    "B7": {
      "value": "Subscription"
    },
    "C7": {
      "value": 320
    },
    "D7": {
      "value": 9.99
    },
    "E7": {
      "value": null,
      "formula": "=C7*D7"
    },
    "F7": {
      "value": 2
    },
    "G7": {
      "value": null,
      "formula": "=E7-(C7*F7)"
    },
    "A8": {
      "value": "Consulting"
    },
    "B8": {
      "value": "Service"
    },
    "C8": {
      "value": 40
    },
    "D8": {
      "value": 150
    },
    "E8": {
      "value": null,
      "formula": "=C8*D8"
    },
    "F8": {
      "value": 60
    },
    "G8": {
      "value": null,
      "formula": "=E8-(C8*F8)"
    },
    "A10": {
      "value": "TOTALS"
    },
    "C10": {
      "value": null,
      "formula": "=SUM(C4:C8)"
    },
    "E10": {
      "value": null,
      "formula": "=SUM(E4:E8)"
    },
    "G10": {
      "value": null,
      "formula": "=SUM(G4:G8)"
    },
    "A12": {
      "value": "Avg Revenue"
    },
    "B12": {
      "value": null,
      "formula": "=AVERAGE(E4:E8)"
    },
    "A13": {
      "value": "Max Revenue"
    },
    "B13": {
      "value": null,
      "formula": "=MAX(E4:E8)"
    },
    "A14": {
      "value": "Profit Margin"
    },
    "B14": {
      "value": null,
      "formula": "=G10/E10*100"
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
        "bgColor": "#7C3AED",
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
        "fontColor": "#7C3AED"
      }
    },
    {
      "ids": [
        "A10",
        "C10",
        "E10",
        "G10"
      ],
      "format": {
        "bold": true,
        "bgColor": "#EDE9FE"
      }
    }
  ]
},
{
  "tool": "create_employee_roster",
  "label": "employee roster",
  "cells": {
    "A1": {
      "value": "👥 Employee Roster"
    },
    "A3": {
      "value": "ID"
    },
    "B3": {
      "value": "Name"
    },
    "C3": {
      "value": "Department"
    },
    "D3": {
      "value": "Role"
    },
    "E3": {
      "value": "Email"
    },
    "F3": {
      "value": "Phone"
    },
    "G3": {
      "value": "Start Date"
    },
    "H3": {
      "value": "Salary"
    },
    "A4": {
      "value": "EMP001"
    },
    "B4": {
      "value": "Alice Johnson"
    },
    "C4": {
      "value": "Engineering"
    },
    "D4": {
      "value": "Senior Developer"
    },
    "E4": {
      "value": "alice@company.com"
    },
    "F4": {
      "value": "555-0101"
    },
    "G4": {
      "value": "2022-01-15"
    },
    "H4": {
      "value": 95000
    },
    "A5": {
      "value": "EMP002"
    },
    "B5": {
      "value": "Bob Smith"
    },
    "C5": {
      "value": "Marketing"
    },
    "D5": {
      "value": "Marketing Manager"
    },
    "E5": {
      "value": "bob@company.com"
    },
    "F5": {
      "value": "555-0102"
    },
    "G5": {
      "value": "2021-06-01"
    },
    "H5": {
      "value": 85000
    },
    "A6": {
      "value": "EMP003"
    },
    "B6": {
      "value": "Carol Davis"
    },
    "C6": {
      "value": "Design"
    },
    "D6": {
      "value": "UX Designer"
    },
    "E6": {
      "value": "carol@company.com"
    },
    "F6": {
      "value": "555-0103"
    },
    "G6": {
      "value": "2023-03-20"
    },
    "H6": {
      "value": 78000
    },
    "A7": {
      "value": "EMP004"
    },
    "B7": {
      "value": "David Lee"
    },
    "C7": {
      "value": "Engineering"
    },
    "D7": {
      "value": "DevOps Engineer"
    },
    "E7": {
      "value": "david@company.com"
    },
    "F7": {
      "value": "555-0104"
    },
    "G7": {
      "value": "2022-09-10"
    },
    "H7": {
      "value": 92000
    },
    "A9": {
      "value": "Total Employees"
    },
    "B9": {
      "value": null,
      "formula": "=COUNTA(A4:A7)"
    },
    "A10": {
      "value": "Avg Salary"
    },
    "B10": {
      "value": null,
      "formula": "=AVERAGE(H4:H7)"
    },
    "A11": {
      "value": "Total Payroll"
    },
    "B11": {
      "value": null,
      "formula": "=SUM(H4:H7)"
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
        "G3",
        "H3"
      ],
      "format": {
        "bold": true,
        "bgColor": "#0369A1",
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
        "fontColor": "#0369A1"
      }
    }
  ]
},
{
  "tool": "create_project_tracker",
  "label": "project tracker",
  "cells": {
    "A1": {
      "value": "📋 Project Tracker"
    },
    "A3": {
      "value": "Task"
    },
    "B3": {
      "value": "Assignee"
    },
    "C3": {
      "value": "Priority"
    },
    "D3": {
      "value": "Status"
    },
    "E3": {
      "value": "Start Date"
    },
    "F3": {
      "value": "Due Date"
    },
    "G3": {
      "value": "Progress %"
    },
    "A4": {
      "value": "UI Design Mockups"
    },
    "B4": {
      "value": "Alice"
    },
    "C4": {
      "value": "High"
    },
    "D4": {
      "value": "In Progress"
    },
    "E4": {
      "value": "2024-01-10"
    },
    "F4": {
      "value": "2024-01-25"
    },
    "G4": {
      "value": 75
    },
    "A5": {
      "value": "Backend API"
    },
    "B5": {
      "value": "Bob"
    },
    "C5": {
      "value": "High"
    },
    "D5": {
      "value": "In Progress"
    },
    "E5": {
      "value": "2024-01-15"
    },
    "F5": {
      "value": "2024-02-01"
    },
    "G5": {
      "value": 40
    },
    "A6": {
      "value": "Database Schema"
    },
    "B6": {
      "value": "Carol"
    },
    "C6": {
      "value": "Medium"
    },
    "D6": {
      "value": "Complete"
    },
    "E6": {
      "value": "2024-01-05"
    },
    "F6": {
      "value": "2024-01-15"
    },
    "G6": {
      "value": 100
    },
    "A7": {
      "value": "Testing Suite"
    },
    "B7": {
      "value": "David"
    },
    "C7": {
      "value": "Medium"
    },
    "D7": {
      "value": "Not Started"
    },
    "E7": {
      "value": "2024-02-01"
    },
    "F7": {
      "value": "2024-02-15"
    },
    "G7": {
      "value": 0
    },
    "A8": {
      "value": "Documentation"
    },
    "B8": {
      "value": "Alice"
    },
    "C8": {
      "value": "Low"
    },
    "D8": {
      "value": "Not Started"
    },
    "E8": {
      "value": "2024-02-10"
    },
    "F8": {
      "value": "2024-02-20"
    },
    "G8": {
      "value": 0
    },
    "A10": {
      "value": "Overall Progress"
    },
    "B10": {
      "value": null,
      "formula": "=AVERAGE(G4:G8)"
    },
    "A11": {
      "value": "Tasks Complete"
    },
    "B11": {
      "value": null,
      "formula": "=COUNTIF(D4:D8,\"Complete\")"
    },
    "A12": {
      "value": "Total Tasks"
    },
    "B12": {
      "value": null,
      "formula": "=COUNTA(A4:A8)"
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
    }
  ]
},
{
  "tool": "create_invoice",
  "label": "invoice",
  "cells": {
    "A1": {
      "value": "🧾 INVOICE"
    },
    "A2": {
      "value": "Invoice #: INV-001"
    },
    "A3": {
      "value": "Date: 2024-01-15"
    },
    "A5": {
      "value": "From:"
    },
    "A6": {
      "value": "Your Company Name"
    },
    "A7": {
      "value": "123 Business Ave"
    },
    "A8": {
      "value": "City, State 12345"
    },
    "D5": {
      "value": "Bill To:"
    },
    "D6": {
      "value": "Client Company"
    },
    "D7": {
      "value": "456 Client Road"
    },
    "D8": {
      "value": "City, State 67890"
    },
    "A10": {
      "value": "Item"
    },
    "B10": {
      "value": "Description"
    },
    "C10": {
      "value": "Qty"
    },
    "D10": {
      "value": "Unit Price"
    },
    "E10": {
      "value": "Amount"
    },
    "A11": {
      "value": "Web Design"
    },
    "B11": {
      "value": "Homepage redesign"
    },
    "C11": {
      "value": 1
    },
    "D11": {
      "value": 2500
    },
    "E11": {
      "value": null,
      "formula": "=C11*D11"
    },
    "A12": {
      "value": "Development"
    },
    "B12": {
      "value": "Frontend coding"
    },
    "C12": {
      "value": 40
    },
    "D12": {
      "value": 75
    },
    "E12": {
      "value": null,
      "formula": "=C12*D12"
    },
    "A13": {
      "value": "SEO Setup"
    },
    "B13": {
      "value": "Initial optimization"
    },
    "C13": {
      "value": 1
    },
    "D13": {
      "value": 500
    },
    "E13": {
      "value": null,
      "formula": "=C13*D13"
    },
    "A14": {
      "value": "Hosting"
    },
    "B14": {
      "value": "Annual hosting plan"
    },
    "C14": {
      "value": 12
    },
    "D14": {
      "value": 25
    },
    "E14": {
      "value": null,
      "formula": "=C14*D14"
    },
    "D16": {
      "value": "Subtotal"
    },
    "E16": {
      "value": null,
      "formula": "=SUM(E11:E14)"
    },
    "D17": {
      "value": "Tax (10%)"
    },
    "E17": {
      "value": null,
      "formula": "=E16*0.1"
    },
    "D18": {
      "value": "TOTAL"
    },
    "E18": {
      "value": null,
      "formula": "=E16+E17"
    },
    "A20": {
      "value": "Payment Terms: Net 30"
    },
    "A21": {
      "value": "Thank you for your business!"
    }
  },
  "formats": [
    {
      "ids": [
        "A1"
      ],
      "format": {
        "bold": true,
        "fontSize": 24,
        "fontColor": "#1E40AF"
      }
    },
    {
      "ids": [
        "A10",
        "B10",
        "C10",
        "D10",
        "E10"
      ],
      "format": {
        "bold": true,
        "bgColor": "#1E40AF",
        "fontColor": "#FFFFFF",
        "textAlign": "center"
      }
    },
    {
      "ids": [
        "A5",
        "D5"
      ],
      "format": {
        "bold": true
      }
    },
    {
      "ids": [
        "D16",
        "D17"
      ],
      "format": {
        "bold": true,
        "textAlign": "right"
      }
    },
    {
      "ids": [
        "D18"
      ],
      "format": {
        "bold": true,
        "fontSize": 14,
        "textAlign": "right"
      }
    },
    {
      "ids": [
        "E18"
      ],
      "format": {
        "bold": true,
        "fontSize": 14,
        "bgColor": "#DBEAFE"
      }
    },
    {
      "ids": [
        "E16"
      ],
      "format": {
        "bold": true
      }
    },
    {
      "ids": [
        "A21"
      ],
      "format": {
        "italic": true,
        "fontColor": "#6B7280"
      }
    }
  ]
},
{
  "tool": "create_kpi_dashboard",
  "label": "kpi dashboard",
  "cells": {
    "A1": {
      "value": "KPI Dashboard"
    },
    "A3": {
      "value": "Metric"
    },
    "B3": {
      "value": "Target"
    },
    "C3": {
      "value": "Actual"
    },
    "D3": {
      "value": "Status"
    },
    "A4": {
      "value": "Revenue"
    },
    "B4": {
      "value": 100000
    },
    "C4": {
      "value": 92000
    },
    "D4": {
      "value": "Behind"
    },
    "A5": {
      "value": "New Customers"
    },
    "B5": {
      "value": 50
    },
    "C5": {
      "value": 58
    },
    "D5": {
      "value": "On Track"
    },
    "A6": {
      "value": "Churn Rate %"
    },
    "B6": {
      "value": 5
    },
    "C6": {
      "value": 4.2
    },
    "D6": {
      "value": "On Track"
    },
    "A7": {
      "value": "NPS"
    },
    "B7": {
      "value": 70
    },
    "C7": {
      "value": 72
    },
    "D7": {
      "value": "On Track"
    },
    "A9": {
      "value": "Summary"
    },
    "B9": {
      "value": null,
      "formula": "=COUNTIF(D4:D7,\"On Track\")"
    },
    "C9": {
      "value": "metrics on track"
    }
  },
  "formats": [
    {
      "ids": [
        "A3",
        "B3",
        "C3",
        "D3"
      ],
      "format": {
        "bold": true,
        "bgColor": "#0F766E",
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
        "fontColor": "#0F766E"
      }
    }
  ]
},
{
  "tool": "create_expense_report",
  "label": "expense report",
  "cells": {
    "A1": {
      "value": "Expense Report"
    },
    "A2": {
      "value": "Employee: __________"
    },
    "A3": {
      "value": "Period: __________"
    },
    "A5": {
      "value": "Date"
    },
    "B5": {
      "value": "Category"
    },
    "C5": {
      "value": "Description"
    },
    "D5": {
      "value": "Amount"
    },
    "E5": {
      "value": "Approved"
    },
    "A6": {
      "value": "2024-01-05"
    },
    "B6": {
      "value": "Travel"
    },
    "C6": {
      "value": "Client meeting"
    },
    "D6": {
      "value": 245.5
    },
    "E6": {
      "value": "Yes"
    },
    "A7": {
      "value": "2024-01-12"
    },
    "B7": {
      "value": "Meals"
    },
    "C7": {
      "value": "Team lunch"
    },
    "D7": {
      "value": 86.2
    },
    "E7": {
      "value": "Yes"
    },
    "A8": {
      "value": "2024-01-18"
    },
    "B8": {
      "value": "Supplies"
    },
    "C8": {
      "value": "Office materials"
    },
    "D8": {
      "value": 42
    },
    "E8": {
      "value": "Pending"
    },
    "A10": {
      "value": "Total"
    },
    "D10": {
      "value": null,
      "formula": "=SUM(D6:D8)"
    }
  },
  "formats": [
    {
      "ids": [
        "A5",
        "B5",
        "C5",
        "D5",
        "E5"
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
        "D10"
      ],
      "format": {
        "bold": true,
        "bgColor": "#FEF3C7"
      }
    }
  ]
}
];
