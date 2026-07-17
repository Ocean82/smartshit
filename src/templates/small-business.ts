// GENERATED from the legacy template switch (see registry.test.ts for the
// equivalence proof). Category: Small Business. Edit as data — no logic here.
import type { TemplateSpec } from './types';

export const smallBusinessTemplates: TemplateSpec[] = [
{
  "tool": "create_pnl_statement",
  "label": "pnl statement",
  "cells": {
    "A1": {
      "value": "Profit & Loss Statement"
    },
    "A2": {
      "value": "Period: __________"
    },
    "A4": {
      "value": "REVENUE"
    },
    "B4": {
      "value": "Amount"
    },
    "A5": {
      "value": "Product Sales"
    },
    "B5": {
      "value": 50000
    },
    "A6": {
      "value": "Service Revenue"
    },
    "B6": {
      "value": 30000
    },
    "A7": {
      "value": "Other Income"
    },
    "B7": {
      "value": 2000
    },
    "A8": {
      "value": "Total Revenue"
    },
    "B8": {
      "value": null,
      "formula": "=SUM(B5:B7)"
    },
    "A10": {
      "value": "COST OF GOODS SOLD"
    },
    "A11": {
      "value": "Materials"
    },
    "B11": {
      "value": 15000
    },
    "A12": {
      "value": "Direct Labor"
    },
    "B12": {
      "value": 12000
    },
    "A13": {
      "value": "Total COGS"
    },
    "B13": {
      "value": null,
      "formula": "=SUM(B11:B12)"
    },
    "A15": {
      "value": "GROSS PROFIT"
    },
    "B15": {
      "value": null,
      "formula": "=B8-B13"
    },
    "A17": {
      "value": "OPERATING EXPENSES"
    },
    "A18": {
      "value": "Rent"
    },
    "B18": {
      "value": 3000
    },
    "A19": {
      "value": "Utilities"
    },
    "B19": {
      "value": 500
    },
    "A20": {
      "value": "Marketing"
    },
    "B20": {
      "value": 2000
    },
    "A21": {
      "value": "Insurance"
    },
    "B21": {
      "value": 800
    },
    "A22": {
      "value": "Total Expenses"
    },
    "B22": {
      "value": null,
      "formula": "=SUM(B18:B21)"
    },
    "A24": {
      "value": "NET INCOME"
    },
    "B24": {
      "value": null,
      "formula": "=B15-B22"
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
        "fontColor": "#7C3AED"
      }
    },
    {
      "ids": [
        "A4",
        "A10",
        "A17",
        "B4"
      ],
      "format": {
        "bold": true,
        "bgColor": "#EDE9FE"
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
        "B8"
      ],
      "format": {
        "bold": true,
        "bgColor": "#EDE9FE"
      }
    },
    {
      "ids": [
        "A13"
      ],
      "format": {
        "bold": true
      }
    },
    {
      "ids": [
        "A15",
        "B15"
      ],
      "format": {
        "bold": true,
        "bgColor": "#D1FAE5"
      }
    },
    {
      "ids": [
        "A24"
      ],
      "format": {
        "bold": true,
        "fontSize": 14,
        "bgColor": "#7C3AED",
        "fontColor": "#FFFFFF"
      }
    },
    {
      "ids": [
        "B24"
      ],
      "format": {
        "bold": true,
        "fontSize": 14,
        "bgColor": "#EDE9FE"
      }
    }
  ]
},
{
  "tool": "create_cash_flow",
  "label": "cash flow",
  "cells": {
    "A1": {
      "value": "Cash Flow Forecast"
    },
    "A3": {
      "value": "Month"
    },
    "B3": {
      "value": "Starting Balance"
    },
    "C3": {
      "value": "Inflows"
    },
    "D3": {
      "value": "Outflows"
    },
    "E3": {
      "value": "Net Cash Flow"
    },
    "F3": {
      "value": "Ending Balance"
    },
    "A4": {
      "value": "Jan"
    },
    "B4": {
      "value": 10000
    },
    "C4": {
      "value": 25000
    },
    "D4": {
      "value": 22000
    },
    "E4": {
      "value": null,
      "formula": "=C4-D4"
    },
    "F4": {
      "value": null,
      "formula": "=B4+E4"
    },
    "A5": {
      "value": "Feb"
    },
    "B5": {
      "value": null,
      "formula": "=F4"
    },
    "C5": {
      "value": 22000
    },
    "D5": {
      "value": 20000
    },
    "E5": {
      "value": null,
      "formula": "=C5-D5"
    },
    "F5": {
      "value": null,
      "formula": "=B5+E5"
    },
    "A6": {
      "value": "Mar"
    },
    "B6": {
      "value": null,
      "formula": "=F5"
    },
    "C6": {
      "value": 28000
    },
    "D6": {
      "value": 24000
    },
    "E6": {
      "value": null,
      "formula": "=C6-D6"
    },
    "F6": {
      "value": null,
      "formula": "=B6+E6"
    },
    "A7": {
      "value": "Apr"
    },
    "B7": {
      "value": null,
      "formula": "=F6"
    },
    "C7": {
      "value": 20000
    },
    "D7": {
      "value": 23000
    },
    "E7": {
      "value": null,
      "formula": "=C7-D7"
    },
    "F7": {
      "value": null,
      "formula": "=B7+E7"
    },
    "A8": {
      "value": "May"
    },
    "B8": {
      "value": null,
      "formula": "=F7"
    },
    "C8": {
      "value": 30000
    },
    "D8": {
      "value": 21000
    },
    "E8": {
      "value": null,
      "formula": "=C8-D8"
    },
    "F8": {
      "value": null,
      "formula": "=B8+E8"
    },
    "A9": {
      "value": "Jun"
    },
    "B9": {
      "value": null,
      "formula": "=F8"
    },
    "C9": {
      "value": 26000
    },
    "D9": {
      "value": 22000
    },
    "E9": {
      "value": null,
      "formula": "=C9-D9"
    },
    "F9": {
      "value": null,
      "formula": "=B9+E9"
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
    }
  ]
},
{
  "tool": "create_inventory_tracker",
  "label": "inventory tracker",
  "cells": {
    "A1": {
      "value": "Inventory Tracker"
    },
    "A3": {
      "value": "SKU"
    },
    "B3": {
      "value": "Product"
    },
    "C3": {
      "value": "In Stock"
    },
    "D3": {
      "value": "Reorder Point"
    },
    "E3": {
      "value": "Unit Cost"
    },
    "F3": {
      "value": "Value"
    },
    "G3": {
      "value": "Status"
    },
    "A4": {
      "value": "WGT-001"
    },
    "B4": {
      "value": "Widget A"
    },
    "C4": {
      "value": 150
    },
    "D4": {
      "value": 50
    },
    "E4": {
      "value": 12
    },
    "F4": {
      "value": null,
      "formula": "=C4*E4"
    },
    "G4": {
      "value": "OK"
    },
    "A5": {
      "value": "WGT-002"
    },
    "B5": {
      "value": "Widget B"
    },
    "C5": {
      "value": 30
    },
    "D5": {
      "value": 50
    },
    "E5": {
      "value": 30
    },
    "F5": {
      "value": null,
      "formula": "=C5*E5"
    },
    "G5": {
      "value": "Reorder"
    },
    "A6": {
      "value": "SVC-001"
    },
    "B6": {
      "value": "Gadget Pro"
    },
    "C6": {
      "value": 80
    },
    "D6": {
      "value": 25
    },
    "E6": {
      "value": 45
    },
    "F6": {
      "value": null,
      "formula": "=C6*E6"
    },
    "G6": {
      "value": "OK"
    },
    "A7": {
      "value": "ACC-001"
    },
    "B7": {
      "value": "Accessory Kit"
    },
    "C7": {
      "value": 10
    },
    "D7": {
      "value": 30
    },
    "E7": {
      "value": 8
    },
    "F7": {
      "value": null,
      "formula": "=C7*E7"
    },
    "G7": {
      "value": "Critical"
    },
    "A9": {
      "value": "TOTAL INVENTORY VALUE"
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
        "A9"
      ],
      "format": {
        "bold": true
      }
    },
    {
      "ids": [
        "F9"
      ],
      "format": {
        "bold": true,
        "bgColor": "#EDE9FE"
      }
    }
  ]
},
{
  "tool": "create_payroll_sheet",
  "label": "payroll sheet",
  "cells": {
    "A1": {
      "value": "Payroll Sheet"
    },
    "A2": {
      "value": "Pay Period: __________"
    },
    "A4": {
      "value": "Employee"
    },
    "B4": {
      "value": "Hours"
    },
    "C4": {
      "value": "Rate"
    },
    "D4": {
      "value": "Gross Pay"
    },
    "E4": {
      "value": "Fed Tax"
    },
    "F4": {
      "value": "State Tax"
    },
    "G4": {
      "value": "Deductions"
    },
    "H4": {
      "value": "Net Pay"
    },
    "A5": {
      "value": "Alice Smith"
    },
    "B5": {
      "value": 40
    },
    "C5": {
      "value": 25
    },
    "D5": {
      "value": null,
      "formula": "=B5*C5"
    },
    "E5": {
      "value": null,
      "formula": "=D5*0.12"
    },
    "F5": {
      "value": null,
      "formula": "=D5*0.05"
    },
    "G5": {
      "value": 200
    },
    "H5": {
      "value": null,
      "formula": "=D5-E5-F5-G5"
    },
    "A6": {
      "value": "Bob Johnson"
    },
    "B6": {
      "value": 35
    },
    "C6": {
      "value": 30
    },
    "D6": {
      "value": null,
      "formula": "=B6*C6"
    },
    "E6": {
      "value": null,
      "formula": "=D6*0.12"
    },
    "F6": {
      "value": null,
      "formula": "=D6*0.05"
    },
    "G6": {
      "value": 150
    },
    "H6": {
      "value": null,
      "formula": "=D6-E6-F6-G6"
    },
    "A7": {
      "value": "Carol Davis"
    },
    "B7": {
      "value": 40
    },
    "C7": {
      "value": 28
    },
    "D7": {
      "value": null,
      "formula": "=B7*C7"
    },
    "E7": {
      "value": null,
      "formula": "=D7*0.12"
    },
    "F7": {
      "value": null,
      "formula": "=D7*0.05"
    },
    "G7": {
      "value": 180
    },
    "H7": {
      "value": null,
      "formula": "=D7-E7-F7-G7"
    },
    "A9": {
      "value": "TOTALS"
    },
    "D9": {
      "value": null,
      "formula": "=SUM(D5:D7)"
    },
    "H9": {
      "value": null,
      "formula": "=SUM(H5:H7)"
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
        "G4",
        "H4"
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
        "A9"
      ],
      "format": {
        "bold": true
      }
    },
    {
      "ids": [
        "D9",
        "H9"
      ],
      "format": {
        "bold": true,
        "bgColor": "#EDE9FE"
      }
    }
  ]
},
{
  "tool": "create_accounts_receivable",
  "label": "accounts receivable",
  "cells": {
    "A1": {
      "value": "Accounts Receivable"
    },
    "A3": {
      "value": "Invoice"
    },
    "B3": {
      "value": "Customer"
    },
    "C3": {
      "value": "Date"
    },
    "D3": {
      "value": "Due Date"
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
    "H3": {
      "value": "Status"
    },
    "A4": {
      "value": "INV-101"
    },
    "B4": {
      "value": "Acme Corp"
    },
    "C4": {
      "value": "2024-01-01"
    },
    "D4": {
      "value": "2024-01-31"
    },
    "E4": {
      "value": 5000
    },
    "F4": {
      "value": 5000
    },
    "G4": {
      "value": null,
      "formula": "=E4-F4"
    },
    "H4": {
      "value": "Paid"
    },
    "A5": {
      "value": "INV-102"
    },
    "B5": {
      "value": "Beta LLC"
    },
    "C5": {
      "value": "2024-01-10"
    },
    "D5": {
      "value": "2024-02-10"
    },
    "E5": {
      "value": 3500
    },
    "F5": {
      "value": 0
    },
    "G5": {
      "value": null,
      "formula": "=E5-F5"
    },
    "H5": {
      "value": "Pending"
    },
    "A6": {
      "value": "INV-103"
    },
    "B6": {
      "value": "Gamma Inc"
    },
    "C6": {
      "value": "2024-01-15"
    },
    "D6": {
      "value": "2024-02-15"
    },
    "E6": {
      "value": 7200
    },
    "F6": {
      "value": 2000
    },
    "G6": {
      "value": null,
      "formula": "=E6-F6"
    },
    "H6": {
      "value": "Partial"
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
        "G3",
        "H3"
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
        "bgColor": "#EDE9FE"
      }
    }
  ]
},
{
  "tool": "create_accounts_payable",
  "label": "accounts payable",
  "cells": {
    "A1": {
      "value": "Accounts Payable"
    },
    "A3": {
      "value": "Bill"
    },
    "B3": {
      "value": "Vendor"
    },
    "C3": {
      "value": "Date"
    },
    "D3": {
      "value": "Due Date"
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
    "H3": {
      "value": "Status"
    },
    "A4": {
      "value": "BILL-001"
    },
    "B4": {
      "value": "Office Supply Co"
    },
    "C4": {
      "value": "2024-01-05"
    },
    "D4": {
      "value": "2024-02-05"
    },
    "E4": {
      "value": 450
    },
    "F4": {
      "value": 450
    },
    "G4": {
      "value": null,
      "formula": "=E4-F4"
    },
    "H4": {
      "value": "Paid"
    },
    "A5": {
      "value": "BILL-002"
    },
    "B5": {
      "value": "Cloud Services"
    },
    "C5": {
      "value": "2024-01-10"
    },
    "D5": {
      "value": "2024-02-10"
    },
    "E5": {
      "value": 200
    },
    "F5": {
      "value": 0
    },
    "G5": {
      "value": null,
      "formula": "=E5-F5"
    },
    "H5": {
      "value": "Due"
    },
    "A6": {
      "value": "BILL-003"
    },
    "B6": {
      "value": "Insurance Corp"
    },
    "C6": {
      "value": "2024-01-15"
    },
    "D6": {
      "value": "2024-02-15"
    },
    "E6": {
      "value": 800
    },
    "F6": {
      "value": 0
    },
    "G6": {
      "value": null,
      "formula": "=E6-F6"
    },
    "H6": {
      "value": "Due"
    },
    "A8": {
      "value": "TOTALS"
    },
    "E8": {
      "value": null,
      "formula": "=SUM(E4:E6)"
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
        "G3",
        "H3"
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
        "A8"
      ],
      "format": {
        "bold": true
      }
    },
    {
      "ids": [
        "E8",
        "G8"
      ],
      "format": {
        "bold": true,
        "bgColor": "#EDE9FE"
      }
    }
  ]
},
{
  "tool": "create_break_even",
  "label": "break even",
  "cells": {
    "A1": {
      "value": "Break-Even Analysis"
    },
    "A3": {
      "value": "Fixed Costs (monthly)"
    },
    "B3": {
      "value": 5000
    },
    "A4": {
      "value": "Variable Cost per Unit"
    },
    "B4": {
      "value": 15
    },
    "A5": {
      "value": "Selling Price per Unit"
    },
    "B5": {
      "value": 40
    },
    "A7": {
      "value": "Break-Even Units"
    },
    "B7": {
      "value": null,
      "formula": "=B3/(B5-B4)"
    },
    "A8": {
      "value": "Break-Even Revenue"
    },
    "B8": {
      "value": null,
      "formula": "=B7*B5"
    },
    "A10": {
      "value": "Units"
    },
    "B10": {
      "value": "Revenue"
    },
    "C10": {
      "value": "Total Cost"
    },
    "D10": {
      "value": "Profit/Loss"
    },
    "A11": {
      "value": 100
    },
    "B11": {
      "value": null,
      "formula": "=A11*$B$5"
    },
    "C11": {
      "value": null,
      "formula": "=$B$3+(A11*$B$4)"
    },
    "D11": {
      "value": null,
      "formula": "=B11-C11"
    },
    "A12": {
      "value": 200
    },
    "B12": {
      "value": null,
      "formula": "=A12*$B$5"
    },
    "C12": {
      "value": null,
      "formula": "=$B$3+(A12*$B$4)"
    },
    "D12": {
      "value": null,
      "formula": "=B12-C12"
    },
    "A13": {
      "value": 300
    },
    "B13": {
      "value": null,
      "formula": "=A13*$B$5"
    },
    "C13": {
      "value": null,
      "formula": "=$B$3+(A13*$B$4)"
    },
    "D13": {
      "value": null,
      "formula": "=B13-C13"
    },
    "A14": {
      "value": 400
    },
    "B14": {
      "value": null,
      "formula": "=A14*$B$5"
    },
    "C14": {
      "value": null,
      "formula": "=$B$3+(A14*$B$4)"
    },
    "D14": {
      "value": null,
      "formula": "=B14-C14"
    },
    "A15": {
      "value": 500
    },
    "B15": {
      "value": null,
      "formula": "=A15*$B$5"
    },
    "C15": {
      "value": null,
      "formula": "=$B$3+(A15*$B$4)"
    },
    "D15": {
      "value": null,
      "formula": "=B15-C15"
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
        "fontColor": "#7C3AED"
      }
    },
    {
      "ids": [
        "A3",
        "A4",
        "A5",
        "A7",
        "A8"
      ],
      "format": {
        "bold": true
      }
    },
    {
      "ids": [
        "B7"
      ],
      "format": {
        "bold": true,
        "fontSize": 14,
        "bgColor": "#EDE9FE"
      }
    },
    {
      "ids": [
        "A10",
        "B10",
        "C10",
        "D10"
      ],
      "format": {
        "bold": true,
        "bgColor": "#7C3AED",
        "fontColor": "#FFFFFF",
        "textAlign": "center"
      }
    }
  ]
},
{
  "tool": "create_unit_economics",
  "label": "unit economics",
  "cells": {
    "A1": {
      "value": "Unit Economics"
    },
    "A3": {
      "value": "Metric"
    },
    "B3": {
      "value": "Value"
    },
    "A4": {
      "value": "Customer Acquisition Cost (CAC)"
    },
    "B4": {
      "value": 120
    },
    "A5": {
      "value": "Monthly Revenue per Customer"
    },
    "B5": {
      "value": 50
    },
    "A6": {
      "value": "Monthly Churn Rate"
    },
    "B6": {
      "value": 0.05
    },
    "A7": {
      "value": "Avg Customer Lifespan (months)"
    },
    "B7": {
      "value": null,
      "formula": "=1/B6"
    },
    "A8": {
      "value": "Lifetime Value (LTV)"
    },
    "B8": {
      "value": null,
      "formula": "=B5*B7"
    },
    "A9": {
      "value": "LTV / CAC Ratio"
    },
    "B9": {
      "value": null,
      "formula": "=B8/B4"
    },
    "A10": {
      "value": "Payback Period (months)"
    },
    "B10": {
      "value": null,
      "formula": "=B4/B5"
    },
    "A12": {
      "value": "Gross Margin %"
    },
    "B12": {
      "value": 0.65
    },
    "A13": {
      "value": "Contribution Margin"
    },
    "B13": {
      "value": null,
      "formula": "=B12-(B6*B7)"
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
        "fontColor": "#7C3AED"
      }
    },
    {
      "ids": [
        "A3",
        "A4",
        "A5",
        "A6",
        "A7",
        "A8",
        "A9",
        "A10",
        "A12",
        "A13"
      ],
      "format": {
        "bold": true
      }
    },
    {
      "ids": [
        "B7",
        "B8",
        "B9",
        "B10",
        "B13"
      ],
      "format": {
        "bold": true,
        "bgColor": "#EDE9FE"
      }
    },
    {
      "ids": [
        "B3"
      ],
      "format": {
        "bold": true,
        "bgColor": "#7C3AED",
        "fontColor": "#FFFFFF"
      }
    }
  ]
},
{
  "tool": "create_startup_costs",
  "label": "startup costs",
  "cells": {
    "A1": {
      "value": "Startup Costs"
    },
    "A3": {
      "value": "Category"
    },
    "B3": {
      "value": "Item"
    },
    "C3": {
      "value": "Cost"
    },
    "D3": {
      "value": "Funded"
    },
    "E3": {
      "value": "Remaining"
    },
    "A4": {
      "value": "Legal"
    },
    "B4": {
      "value": "Incorporation"
    },
    "C4": {
      "value": 500
    },
    "D4": {
      "value": 500
    },
    "E4": {
      "value": null,
      "formula": "=C4-D4"
    },
    "A5": {
      "value": "Legal"
    },
    "B5": {
      "value": "Trademarks"
    },
    "C5": {
      "value": 1000
    },
    "D5": {
      "value": 0
    },
    "E5": {
      "value": null,
      "formula": "=C5-D5"
    },
    "A6": {
      "value": "Technology"
    },
    "B6": {
      "value": "Laptop"
    },
    "C6": {
      "value": 2000
    },
    "D6": {
      "value": 2000
    },
    "E6": {
      "value": null,
      "formula": "=C6-D6"
    },
    "A7": {
      "value": "Technology"
    },
    "B7": {
      "value": "Software licenses"
    },
    "C7": {
      "value": 500
    },
    "D7": {
      "value": 500
    },
    "E7": {
      "value": null,
      "formula": "=C7-D7"
    },
    "A8": {
      "value": "Marketing"
    },
    "B8": {
      "value": "Website"
    },
    "C8": {
      "value": 3000
    },
    "D8": {
      "value": 1500
    },
    "E8": {
      "value": null,
      "formula": "=C8-D8"
    },
    "A9": {
      "value": "Marketing"
    },
    "B9": {
      "value": "Business cards"
    },
    "C9": {
      "value": 200
    },
    "D9": {
      "value": 0
    },
    "E9": {
      "value": null,
      "formula": "=C9-D9"
    },
    "A10": {
      "value": "Office"
    },
    "B10": {
      "value": "Supplies"
    },
    "C10": {
      "value": 800
    },
    "D10": {
      "value": 800
    },
    "E10": {
      "value": null,
      "formula": "=C10-D10"
    },
    "A12": {
      "value": "TOTAL"
    },
    "C12": {
      "value": null,
      "formula": "=SUM(C4:C10)"
    },
    "D12": {
      "value": null,
      "formula": "=SUM(D4:D10)"
    },
    "E12": {
      "value": null,
      "formula": "=SUM(E4:E10)"
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
        "A12"
      ],
      "format": {
        "bold": true
      }
    },
    {
      "ids": [
        "C12",
        "D12",
        "E12"
      ],
      "format": {
        "bold": true,
        "bgColor": "#EDE9FE"
      }
    }
  ]
}
];
