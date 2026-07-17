// GENERATED from the legacy template switch (see registry.test.ts for the
// equivalence proof). Category: Personal Finance. Edit as data — no logic here.
import type { TemplateSpec } from './types';

export const personalFinanceTemplates: TemplateSpec[] = [
{
  "tool": "create_wedding_budget",
  "label": "wedding budget",
  "cells": {
    "A1": {
      "value": "Wedding Budget"
    },
    "A2": {
      "value": "Total Budget: __________"
    },
    "A4": {
      "value": "Category"
    },
    "B4": {
      "value": "Vendor"
    },
    "C4": {
      "value": "Estimated"
    },
    "D4": {
      "value": "Actual"
    },
    "E4": {
      "value": "Difference"
    },
    "F4": {
      "value": "Deposit Paid"
    },
    "G4": {
      "value": "Balance Due"
    },
    "A5": {
      "value": "Venue"
    },
    "C5": {
      "value": 5000
    },
    "D5": {
      "value": 0
    },
    "E5": {
      "value": null,
      "formula": "=C5-D5"
    },
    "F5": {
      "value": 0
    },
    "G5": {
      "value": null,
      "formula": "=D5-F5"
    },
    "A6": {
      "value": "Catering"
    },
    "C6": {
      "value": 4000
    },
    "D6": {
      "value": 0
    },
    "E6": {
      "value": null,
      "formula": "=C6-D6"
    },
    "F6": {
      "value": 0
    },
    "G6": {
      "value": null,
      "formula": "=D6-F6"
    },
    "A7": {
      "value": "Photography"
    },
    "C7": {
      "value": 2500
    },
    "D7": {
      "value": 0
    },
    "E7": {
      "value": null,
      "formula": "=C7-D7"
    },
    "F7": {
      "value": 0
    },
    "G7": {
      "value": null,
      "formula": "=D7-F7"
    },
    "A8": {
      "value": "Flowers"
    },
    "C8": {
      "value": 1500
    },
    "D8": {
      "value": 0
    },
    "E8": {
      "value": null,
      "formula": "=C8-D8"
    },
    "F8": {
      "value": 0
    },
    "G8": {
      "value": null,
      "formula": "=D8-F8"
    },
    "A9": {
      "value": "Music/DJ"
    },
    "C9": {
      "value": 1200
    },
    "D9": {
      "value": 0
    },
    "E9": {
      "value": null,
      "formula": "=C9-D9"
    },
    "F9": {
      "value": 0
    },
    "G9": {
      "value": null,
      "formula": "=D9-F9"
    },
    "A10": {
      "value": "Attire"
    },
    "C10": {
      "value": 2000
    },
    "D10": {
      "value": 0
    },
    "E10": {
      "value": null,
      "formula": "=C10-D10"
    },
    "F10": {
      "value": 0
    },
    "G10": {
      "value": null,
      "formula": "=D10-F10"
    },
    "A12": {
      "value": "TOTAL"
    },
    "C12": {
      "value": null,
      "formula": "=SUM(C5:C10)"
    },
    "D12": {
      "value": null,
      "formula": "=SUM(D5:D10)"
    },
    "E12": {
      "value": null,
      "formula": "=SUM(E5:E10)"
    },
    "F12": {
      "value": null,
      "formula": "=SUM(F5:F10)"
    },
    "G12": {
      "value": null,
      "formula": "=SUM(G5:G10)"
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
        "E12",
        "F12",
        "G12"
      ],
      "format": {
        "bold": true,
        "bgColor": "#EDE9FE"
      }
    }
  ]
},
{
  "tool": "create_student_loan_payoff",
  "label": "student loan payoff",
  "cells": {
    "A1": {
      "value": "Student Loan Payoff Tracker"
    },
    "A3": {
      "value": "Loan Name"
    },
    "B3": {
      "value": "Balance"
    },
    "C3": {
      "value": "Interest Rate"
    },
    "D3": {
      "value": "Min Payment"
    },
    "E3": {
      "value": "Extra Payment"
    },
    "F3": {
      "value": "Total Payment"
    },
    "G3": {
      "value": "Payoff Date"
    },
    "H3": {
      "value": "Total Interest"
    },
    "A4": {
      "value": "Federal Subsidized"
    },
    "B4": {
      "value": 15000
    },
    "C4": {
      "value": 0.045
    },
    "D4": {
      "value": 200
    },
    "E4": {
      "value": 100
    },
    "F4": {
      "value": null,
      "formula": "=D4+E4"
    },
    "G4": {
      "value": "2028-06"
    },
    "H4": {
      "value": 2100
    },
    "A5": {
      "value": "Federal Unsubsidized"
    },
    "B5": {
      "value": 20000
    },
    "C5": {
      "value": 0.065
    },
    "D5": {
      "value": 280
    },
    "E5": {
      "value": 0
    },
    "F5": {
      "value": null,
      "formula": "=D5+E5"
    },
    "G5": {
      "value": "2030-12"
    },
    "H5": {
      "value": 5200
    },
    "A6": {
      "value": "Private Loan"
    },
    "B6": {
      "value": 10000
    },
    "C6": {
      "value": 0.08
    },
    "D6": {
      "value": 150
    },
    "E6": {
      "value": 50
    },
    "F6": {
      "value": null,
      "formula": "=D6+E6"
    },
    "G6": {
      "value": "2027-09"
    },
    "H6": {
      "value": 1800
    },
    "A8": {
      "value": "TOTALS"
    },
    "B8": {
      "value": null,
      "formula": "=SUM(B4:B6)"
    },
    "D8": {
      "value": null,
      "formula": "=SUM(D4:D6)"
    },
    "E8": {
      "value": null,
      "formula": "=SUM(E4:E6)"
    },
    "F8": {
      "value": null,
      "formula": "=SUM(F4:F6)"
    },
    "H8": {
      "value": null,
      "formula": "=SUM(H4:H6)"
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
        "bgColor": "#059669",
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
        "fontColor": "#059669"
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
        "B8",
        "D8",
        "E8",
        "F8",
        "H8"
      ],
      "format": {
        "bold": true,
        "bgColor": "#D1FAE5"
      }
    }
  ]
},
{
  "tool": "create_retirement_calculator",
  "label": "retirement calculator",
  "cells": {
    "A1": {
      "value": "Retirement Calculator"
    },
    "A3": {
      "value": "Current Age"
    },
    "B3": {
      "value": 30
    },
    "A4": {
      "value": "Retirement Age"
    },
    "B4": {
      "value": 65
    },
    "A5": {
      "value": "Current Savings"
    },
    "B5": {
      "value": 50000
    },
    "A6": {
      "value": "Monthly Contribution"
    },
    "B6": {
      "value": 500
    },
    "A7": {
      "value": "Annual Return %"
    },
    "B7": {
      "value": 0.07
    },
    "A8": {
      "value": "Inflation %"
    },
    "B8": {
      "value": 0.03
    },
    "A10": {
      "value": "Years to Retirement"
    },
    "B10": {
      "value": null,
      "formula": "=B4-B3"
    },
    "A11": {
      "value": "Total Contributions"
    },
    "B11": {
      "value": null,
      "formula": "=B5+(B10*12*B6)"
    },
    "A12": {
      "value": "Projected Nest Egg"
    },
    "B12": {
      "value": null,
      "formula": "=B5*((1+B7)^B10)+B6*(((1+B7)^B10-1)/B7)*12"
    },
    "A13": {
      "value": "Real Return %"
    },
    "B13": {
      "value": null,
      "formula": "=B7-B8"
    },
    "A14": {
      "value": "Inflation-Adjusted Value"
    },
    "B14": {
      "value": null,
      "formula": "=B12/((1+B8)^B10)"
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
        "fontColor": "#059669"
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
        "A10",
        "A11",
        "A12",
        "A13",
        "A14"
      ],
      "format": {
        "bold": true
      }
    },
    {
      "ids": [
        "B10",
        "B11",
        "B12",
        "B13",
        "B14"
      ],
      "format": {
        "bold": true,
        "bgColor": "#D1FAE5"
      }
    }
  ]
},
{
  "tool": "create_emergency_fund",
  "label": "emergency fund",
  "cells": {
    "A1": {
      "value": "Emergency Fund Tracker"
    },
    "A2": {
      "value": "Goal: 3-6 months of expenses"
    },
    "A4": {
      "value": "Monthly Expenses"
    },
    "B4": {
      "value": 3000
    },
    "A5": {
      "value": "Target (3 months)"
    },
    "B5": {
      "value": null,
      "formula": "=B4*3"
    },
    "A6": {
      "value": "Target (6 months)"
    },
    "B6": {
      "value": null,
      "formula": "=B4*6"
    },
    "A8": {
      "value": "Month"
    },
    "B8": {
      "value": "Contribution"
    },
    "C8": {
      "value": "Balance"
    },
    "D8": {
      "value": "% of Goal"
    },
    "A9": {
      "value": "Jan"
    },
    "B9": {
      "value": 500
    },
    "C9": {
      "value": 500
    },
    "D9": {
      "value": null,
      "formula": "=C9/$B$6"
    },
    "A10": {
      "value": "Feb"
    },
    "B10": {
      "value": 500
    },
    "C10": {
      "value": null,
      "formula": "=C9+B10"
    },
    "D10": {
      "value": null,
      "formula": "=C10/$B$6"
    },
    "A11": {
      "value": "Mar"
    },
    "B11": {
      "value": 500
    },
    "C11": {
      "value": null,
      "formula": "=C10+B11"
    },
    "D11": {
      "value": null,
      "formula": "=C11/$B$6"
    },
    "A12": {
      "value": "Apr"
    },
    "B12": {
      "value": 500
    },
    "C12": {
      "value": null,
      "formula": "=C11+B12"
    },
    "D12": {
      "value": null,
      "formula": "=C12/$B$6"
    },
    "A13": {
      "value": "May"
    },
    "B13": {
      "value": 500
    },
    "C13": {
      "value": null,
      "formula": "=C12+B13"
    },
    "D13": {
      "value": null,
      "formula": "=C13/$B$6"
    },
    "A14": {
      "value": "Jun"
    },
    "B14": {
      "value": 500
    },
    "C14": {
      "value": null,
      "formula": "=C13+B14"
    },
    "D14": {
      "value": null,
      "formula": "=C14/$B$6"
    }
  },
  "formats": [
    {
      "ids": [
        "A8",
        "B8",
        "C8",
        "D8"
      ],
      "format": {
        "bold": true,
        "bgColor": "#059669",
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
        "fontColor": "#059669"
      }
    },
    {
      "ids": [
        "A2",
        "A5",
        "A6"
      ],
      "format": {
        "italic": true
      }
    }
  ]
},
{
  "tool": "create_debt_snowball",
  "label": "debt snowball",
  "cells": {
    "A1": {
      "value": "Debt Snowball Tracker"
    },
    "A2": {
      "value": "List debts smallest to largest balance"
    },
    "A4": {
      "value": "Debt Name"
    },
    "B4": {
      "value": "Balance"
    },
    "C4": {
      "value": "Interest Rate"
    },
    "D4": {
      "value": "Min Payment"
    },
    "E4": {
      "value": "Extra Payment"
    },
    "F4": {
      "value": "Payoff Order"
    },
    "A5": {
      "value": "Credit Card A"
    },
    "B5": {
      "value": 1200
    },
    "C5": {
      "value": 0.1999
    },
    "D5": {
      "value": 50
    },
    "E5": {
      "value": 100
    },
    "F5": {
      "value": 1
    },
    "A6": {
      "value": "Credit Card B"
    },
    "B6": {
      "value": 3500
    },
    "C6": {
      "value": 0.1799
    },
    "D6": {
      "value": 70
    },
    "E6": {
      "value": 0
    },
    "F6": {
      "value": 2
    },
    "A7": {
      "value": "Car Loan"
    },
    "B7": {
      "value": 8000
    },
    "C7": {
      "value": 0.055
    },
    "D7": {
      "value": 200
    },
    "E7": {
      "value": 0
    },
    "F7": {
      "value": 3
    },
    "A8": {
      "value": "Student Loan"
    },
    "B8": {
      "value": 15000
    },
    "C8": {
      "value": 0.045
    },
    "D8": {
      "value": 250
    },
    "E8": {
      "value": 0
    },
    "F8": {
      "value": 4
    },
    "A10": {
      "value": "TOTALS"
    },
    "B10": {
      "value": null,
      "formula": "=SUM(B5:B8)"
    },
    "D10": {
      "value": null,
      "formula": "=SUM(D5:D8)"
    },
    "E10": {
      "value": null,
      "formula": "=SUM(E5:E8)"
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
        "F4"
      ],
      "format": {
        "bold": true,
        "bgColor": "#059669",
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
        "fontColor": "#059669"
      }
    },
    {
      "ids": [
        "A2"
      ],
      "format": {
        "italic": true,
        "fontColor": "#6B7280"
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
        "B10",
        "D10",
        "E10"
      ],
      "format": {
        "bold": true,
        "bgColor": "#D1FAE5"
      }
    }
  ]
},
{
  "tool": "create_savings_goal",
  "label": "savings goal",
  "cells": {
    "A1": {
      "value": "Savings Goal Tracker"
    },
    "A3": {
      "value": "Goal Name"
    },
    "B3": {
      "value": "Vacation Fund"
    },
    "A4": {
      "value": "Target Amount"
    },
    "B4": {
      "value": 5000
    },
    "A5": {
      "value": "Start Date"
    },
    "B5": {
      "value": "2024-01-01"
    },
    "A6": {
      "value": "Target Date"
    },
    "B6": {
      "value": "2024-12-31"
    },
    "A8": {
      "value": "Month"
    },
    "B8": {
      "value": "Deposit"
    },
    "C8": {
      "value": "Running Total"
    },
    "D8": {
      "value": "% Complete"
    },
    "E8": {
      "value": "Remaining"
    },
    "A9": {
      "value": "Jan"
    },
    "B9": {
      "value": 400
    },
    "C9": {
      "value": 400
    },
    "D9": {
      "value": null,
      "formula": "=C9/$B$4"
    },
    "E9": {
      "value": null,
      "formula": "=$B$4-C9"
    },
    "A10": {
      "value": "Feb"
    },
    "B10": {
      "value": 400
    },
    "C10": {
      "value": null,
      "formula": "=C9+B10"
    },
    "D10": {
      "value": null,
      "formula": "=C10/$B$4"
    },
    "E10": {
      "value": null,
      "formula": "=$B$4-C10"
    },
    "A11": {
      "value": "Mar"
    },
    "B11": {
      "value": 400
    },
    "C11": {
      "value": null,
      "formula": "=C10+B11"
    },
    "D11": {
      "value": null,
      "formula": "=C11/$B$4"
    },
    "E11": {
      "value": null,
      "formula": "=$B$4-C11"
    },
    "A12": {
      "value": "Apr"
    },
    "B12": {
      "value": 400
    },
    "C12": {
      "value": null,
      "formula": "=C11+B12"
    },
    "D12": {
      "value": null,
      "formula": "=C12/$B$4"
    },
    "E12": {
      "value": null,
      "formula": "=$B$4-C12"
    },
    "A13": {
      "value": "May"
    },
    "B13": {
      "value": 400
    },
    "C13": {
      "value": null,
      "formula": "=C12+B13"
    },
    "D13": {
      "value": null,
      "formula": "=C13/$B$4"
    },
    "E13": {
      "value": null,
      "formula": "=$B$4-C13"
    },
    "A14": {
      "value": "Jun"
    },
    "B14": {
      "value": 400
    },
    "C14": {
      "value": null,
      "formula": "=C13+B14"
    },
    "D14": {
      "value": null,
      "formula": "=C14/$B$4"
    },
    "E14": {
      "value": null,
      "formula": "=$B$4-C14"
    }
  },
  "formats": [
    {
      "ids": [
        "A8",
        "B8",
        "C8",
        "D8",
        "E8"
      ],
      "format": {
        "bold": true,
        "bgColor": "#059669",
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
        "fontColor": "#059669"
      }
    }
  ]
},
{
  "tool": "create_net_worth_tracker",
  "label": "net worth tracker",
  "cells": {
    "A1": {
      "value": "Net Worth Tracker"
    },
    "A3": {
      "value": "ASSETS"
    },
    "C3": {
      "value": "Amount"
    },
    "A4": {
      "value": "Checking Account"
    },
    "C4": {
      "value": 5000
    },
    "A5": {
      "value": "Savings Account"
    },
    "C5": {
      "value": 15000
    },
    "A6": {
      "value": "Investments"
    },
    "C6": {
      "value": 45000
    },
    "A7": {
      "value": "Retirement (401k/IRA)"
    },
    "C7": {
      "value": 80000
    },
    "A8": {
      "value": "Home Value"
    },
    "C8": {
      "value": 250000
    },
    "A9": {
      "value": "Car Value"
    },
    "C9": {
      "value": 12000
    },
    "A10": {
      "value": "Other Assets"
    },
    "C10": {
      "value": 5000
    },
    "A11": {
      "value": "TOTAL ASSETS"
    },
    "C11": {
      "value": null,
      "formula": "=SUM(C4:C10)"
    },
    "A13": {
      "value": "LIABILITIES"
    },
    "A14": {
      "value": "Mortgage"
    },
    "C14": {
      "value": 180000
    },
    "A15": {
      "value": "Car Loan"
    },
    "C15": {
      "value": 8000
    },
    "A16": {
      "value": "Student Loans"
    },
    "C16": {
      "value": 25000
    },
    "A17": {
      "value": "Credit Cards"
    },
    "C17": {
      "value": 3000
    },
    "A18": {
      "value": "Other Debts"
    },
    "C18": {
      "value": 0
    },
    "A19": {
      "value": "TOTAL LIABILITIES"
    },
    "C19": {
      "value": null,
      "formula": "=SUM(C14:C18)"
    },
    "A21": {
      "value": "NET WORTH"
    },
    "C21": {
      "value": null,
      "formula": "=C11-C19"
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
        "fontColor": "#059669"
      }
    },
    {
      "ids": [
        "A3",
        "C3"
      ],
      "format": {
        "bold": true,
        "bgColor": "#059669",
        "fontColor": "#FFFFFF"
      }
    },
    {
      "ids": [
        "A13",
        "A21"
      ],
      "format": {
        "bold": true,
        "bgColor": "#DC2626",
        "fontColor": "#FFFFFF"
      }
    },
    {
      "ids": [
        "C11"
      ],
      "format": {
        "bold": true,
        "bgColor": "#D1FAE5"
      }
    },
    {
      "ids": [
        "C19"
      ],
      "format": {
        "bold": true,
        "bgColor": "#FEE2E2"
      }
    },
    {
      "ids": [
        "C21"
      ],
      "format": {
        "bold": true,
        "fontSize": 14,
        "bgColor": "#D1FAE5",
        "fontColor": "#059669"
      }
    }
  ]
},
{
  "tool": "create_holiday_budget",
  "label": "holiday budget",
  "cells": {
    "A1": {
      "value": "Holiday Gift Budget"
    },
    "A2": {
      "value": "Total Budget: __________"
    },
    "A4": {
      "value": "Recipient"
    },
    "B4": {
      "value": "Relationship"
    },
    "C4": {
      "value": "Budget"
    },
    "D4": {
      "value": "Spent"
    },
    "E4": {
      "value": "Remaining"
    },
    "F4": {
      "value": "Gift Idea"
    },
    "A5": {
      "value": "Mom"
    },
    "B5": {
      "value": "Parent"
    },
    "C5": {
      "value": 100
    },
    "D5": {
      "value": 75
    },
    "E5": {
      "value": null,
      "formula": "=C5-D5"
    },
    "F5": {
      "value": "Sweater"
    },
    "A6": {
      "value": "Dad"
    },
    "B6": {
      "value": "Parent"
    },
    "C6": {
      "value": 100
    },
    "D6": {
      "value": 0
    },
    "E6": {
      "value": null,
      "formula": "=C6-D6"
    },
    "F6": {
      "value": "Book set"
    },
    "A7": {
      "value": "Sister"
    },
    "B7": {
      "value": "Sibling"
    },
    "C7": {
      "value": 50
    },
    "D7": {
      "value": 30
    },
    "E7": {
      "value": null,
      "formula": "=C7-D7"
    },
    "F7": {
      "value": "Candle set"
    },
    "A8": {
      "value": "Best Friend"
    },
    "B8": {
      "value": "Friend"
    },
    "C8": {
      "value": 40
    },
    "D8": {
      "value": 0
    },
    "E8": {
      "value": null,
      "formula": "=C8-D8"
    },
    "A9": {
      "value": "Coworker"
    },
    "B9": {
      "value": "Work"
    },
    "C9": {
      "value": 25
    },
    "D9": {
      "value": 0
    },
    "E9": {
      "value": null,
      "formula": "=C9-D9"
    },
    "A11": {
      "value": "TOTAL"
    },
    "C11": {
      "value": null,
      "formula": "=SUM(C5:C9)"
    },
    "D11": {
      "value": null,
      "formula": "=SUM(D5:D9)"
    },
    "E11": {
      "value": null,
      "formula": "=SUM(E5:E9)"
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
        "F4"
      ],
      "format": {
        "bold": true,
        "bgColor": "#DC2626",
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
        "fontColor": "#DC2626"
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
        "C11",
        "D11",
        "E11"
      ],
      "format": {
        "bold": true,
        "bgColor": "#FEE2E2"
      }
    }
  ]
},
{
  "tool": "create_travel_budget",
  "label": "travel budget",
  "cells": {
    "A1": {
      "value": "Travel Budget Planner"
    },
    "A2": {
      "value": "Trip: __________"
    },
    "A3": {
      "value": "Dates: __________"
    },
    "A5": {
      "value": "Category"
    },
    "B5": {
      "value": "Estimated"
    },
    "C5": {
      "value": "Actual"
    },
    "D5": {
      "value": "Difference"
    },
    "E5": {
      "value": "Notes"
    },
    "A6": {
      "value": "Flights"
    },
    "B6": {
      "value": 800
    },
    "C6": {
      "value": 0
    },
    "D6": {
      "value": null,
      "formula": "=B6-C6"
    },
    "A7": {
      "value": "Hotel"
    },
    "B7": {
      "value": 1200
    },
    "C7": {
      "value": 0
    },
    "D7": {
      "value": null,
      "formula": "=B7-C7"
    },
    "A8": {
      "value": "Car Rental"
    },
    "B8": {
      "value": 300
    },
    "C8": {
      "value": 0
    },
    "D8": {
      "value": null,
      "formula": "=B8-C8"
    },
    "A9": {
      "value": "Food"
    },
    "B9": {
      "value": 500
    },
    "C9": {
      "value": 0
    },
    "D9": {
      "value": null,
      "formula": "=B9-C9"
    },
    "A10": {
      "value": "Activities"
    },
    "B10": {
      "value": 400
    },
    "C10": {
      "value": 0
    },
    "D10": {
      "value": null,
      "formula": "=B10-C10"
    },
    "A11": {
      "value": "Shopping"
    },
    "B11": {
      "value": 200
    },
    "C11": {
      "value": 0
    },
    "D11": {
      "value": null,
      "formula": "=B11-C11"
    },
    "A12": {
      "value": "Miscellaneous"
    },
    "B12": {
      "value": 150
    },
    "C12": {
      "value": 0
    },
    "D12": {
      "value": null,
      "formula": "=B12-C12"
    },
    "A14": {
      "value": "TOTAL"
    },
    "B14": {
      "value": null,
      "formula": "=SUM(B6:B12)"
    },
    "C14": {
      "value": null,
      "formula": "=SUM(C6:C12)"
    },
    "D14": {
      "value": null,
      "formula": "=SUM(D6:D12)"
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
        "bgColor": "#2563EB",
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
        "fontColor": "#2563EB"
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
        "B14",
        "C14",
        "D14"
      ],
      "format": {
        "bold": true,
        "bgColor": "#DBEAFE"
      }
    }
  ]
},
{
  "tool": "create_baby_budget",
  "label": "baby budget",
  "cells": {
    "A1": {
      "value": "Baby Expense Tracker"
    },
    "A3": {
      "value": "Category"
    },
    "B3": {
      "value": "Budgeted"
    },
    "C3": {
      "value": "Spent"
    },
    "D3": {
      "value": "Remaining"
    },
    "A4": {
      "value": "Nursery/Furniture"
    },
    "B4": {
      "value": 2000
    },
    "C4": {
      "value": 0
    },
    "D4": {
      "value": null,
      "formula": "=B4-C4"
    },
    "A5": {
      "value": "Car Seat/Stroller"
    },
    "B5": {
      "value": 800
    },
    "C5": {
      "value": 0
    },
    "D5": {
      "value": null,
      "formula": "=B5-C5"
    },
    "A6": {
      "value": "Clothing"
    },
    "B6": {
      "value": 500
    },
    "C6": {
      "value": 0
    },
    "D6": {
      "value": null,
      "formula": "=B6-C6"
    },
    "A7": {
      "value": "Diapers & Wipes"
    },
    "B7": {
      "value": 1200
    },
    "C7": {
      "value": 0
    },
    "D7": {
      "value": null,
      "formula": "=B7-C7"
    },
    "A8": {
      "value": "Formula/Feeding"
    },
    "B8": {
      "value": 600
    },
    "C8": {
      "value": 0
    },
    "D8": {
      "value": null,
      "formula": "=B8-C8"
    },
    "A9": {
      "value": "Healthcare"
    },
    "B9": {
      "value": 500
    },
    "C9": {
      "value": 0
    },
    "D9": {
      "value": null,
      "formula": "=B9-C9"
    },
    "A10": {
      "value": "Toys & Books"
    },
    "B10": {
      "value": 300
    },
    "C10": {
      "value": 0
    },
    "D10": {
      "value": null,
      "formula": "=B10-C10"
    },
    "A12": {
      "value": "TOTAL"
    },
    "B12": {
      "value": null,
      "formula": "=SUM(B4:B10)"
    },
    "C12": {
      "value": null,
      "formula": "=SUM(C4:C10)"
    },
    "D12": {
      "value": null,
      "formula": "=SUM(D4:D10)"
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
        "bgColor": "#EC4899",
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
        "fontColor": "#EC4899"
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
        "B12",
        "C12",
        "D12"
      ],
      "format": {
        "bold": true,
        "bgColor": "#FCE7F3"
      }
    }
  ]
},
{
  "tool": "create_college_savings",
  "label": "college savings",
  "cells": {
    "A1": {
      "value": "College Savings Tracker"
    },
    "A3": {
      "value": "Child's Name"
    },
    "B3": {
      "value": ""
    },
    "A4": {
      "value": "Current Age"
    },
    "B4": {
      "value": 2
    },
    "A5": {
      "value": "Target College Age"
    },
    "B5": {
      "value": 18
    },
    "A6": {
      "value": "Annual Cost (Today $)"
    },
    "B6": {
      "value": 25000
    },
    "A7": {
      "value": "Inflation Rate"
    },
    "B7": {
      "value": 0.05
    },
    "A8": {
      "value": "Expected Return"
    },
    "B8": {
      "value": 0.07
    },
    "A9": {
      "value": "Current Balance"
    },
    "B9": {
      "value": 5000
    },
    "A10": {
      "value": "Monthly Contribution"
    },
    "B10": {
      "value": 300
    },
    "A12": {
      "value": "Years to College"
    },
    "B12": {
      "value": null,
      "formula": "=B5-B4"
    },
    "A13": {
      "value": "Future Annual Cost"
    },
    "B13": {
      "value": null,
      "formula": "=B6*((1+B7)^B12)"
    },
    "A14": {
      "value": "Total 4-Year Cost"
    },
    "B14": {
      "value": null,
      "formula": "=B13*4"
    },
    "A15": {
      "value": "Projected Savings"
    },
    "B15": {
      "value": null,
      "formula": "=B9*((1+B8)^B12)+B10*(((1+B8)^B12-1)/B8)*12"
    },
    "A16": {
      "value": "Shortfall / Surplus"
    },
    "B16": {
      "value": null,
      "formula": "=B15-B14"
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
        "fontColor": "#059669"
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
        "A13",
        "A14",
        "A15",
        "A16"
      ],
      "format": {
        "bold": true
      }
    },
    {
      "ids": [
        "B12",
        "B13",
        "B14",
        "B15",
        "B16"
      ],
      "format": {
        "bold": true,
        "bgColor": "#D1FAE5"
      }
    }
  ]
}
];
