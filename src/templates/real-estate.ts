// GENERATED from the legacy template switch (see registry.test.ts for the
// equivalence proof). Category: Real Estate. Edit as data — no logic here.
import type { TemplateSpec } from './types';

export const realEstateTemplates: TemplateSpec[] = [
{
  "tool": "create_rental_property",
  "label": "rental property",
  "cells": {
    "A1": {
      "value": "Rental Property Tracker"
    },
    "A3": {
      "value": "Property"
    },
    "B3": {
      "value": "Address"
    },
    "C3": {
      "value": "Monthly Rent"
    },
    "D3": {
      "value": "Vacancy %"
    },
    "E3": {
      "value": "Expenses"
    },
    "F3": {
      "value": "Net Income"
    },
    "A4": {
      "value": "Unit 1"
    },
    "B4": {
      "value": "123 Main St"
    },
    "C4": {
      "value": 1500
    },
    "D4": {
      "value": 0.05
    },
    "E4": {
      "value": 400
    },
    "F4": {
      "value": null,
      "formula": "=C4*(1-D4)-E4"
    },
    "A5": {
      "value": "Unit 2"
    },
    "B5": {
      "value": "123 Main St"
    },
    "C5": {
      "value": 1400
    },
    "D5": {
      "value": 0
    },
    "E5": {
      "value": 380
    },
    "F5": {
      "value": null,
      "formula": "=C5*(1-D5)-E5"
    },
    "A6": {
      "value": "Unit 3"
    },
    "B6": {
      "value": "456 Oak Ave"
    },
    "C6": {
      "value": 1800
    },
    "D6": {
      "value": 0.08
    },
    "E6": {
      "value": 450
    },
    "F6": {
      "value": null,
      "formula": "=C6*(1-D6)-E6"
    },
    "A8": {
      "value": "TOTALS"
    },
    "C8": {
      "value": null,
      "formula": "=SUM(C4:C6)"
    },
    "E8": {
      "value": null,
      "formula": "=SUM(E4:E6)"
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
        "bgColor": "#1D4ED8",
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
        "fontColor": "#1D4ED8"
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
        "E8",
        "F8"
      ],
      "format": {
        "bold": true,
        "bgColor": "#DBEAFE"
      }
    }
  ]
},
{
  "tool": "create_mortgage_calculator",
  "label": "mortgage calculator",
  "cells": {
    "A1": {
      "value": "Mortgage Calculator"
    },
    "A3": {
      "value": "Loan Amount"
    },
    "B3": {
      "value": 300000
    },
    "A4": {
      "value": "Interest Rate (annual)"
    },
    "B4": {
      "value": 0.065
    },
    "A5": {
      "value": "Loan Term (years)"
    },
    "B5": {
      "value": 30
    },
    "A7": {
      "value": "Monthly Payment"
    },
    "B7": {
      "value": null,
      "formula": "=PMT(B4/12,B5*12,-B3)"
    },
    "A8": {
      "value": "Total Paid"
    },
    "B8": {
      "value": null,
      "formula": "=B7*B5*12"
    },
    "A9": {
      "value": "Total Interest"
    },
    "B9": {
      "value": null,
      "formula": "=B8-B3"
    },
    "A11": {
      "value": "Year"
    },
    "B11": {
      "value": "Payment"
    },
    "C11": {
      "value": "Principal"
    },
    "D11": {
      "value": "Interest"
    },
    "E11": {
      "value": "Balance"
    },
    "A12": {
      "value": 1
    },
    "B12": {
      "value": null,
      "formula": "=$B$7*12"
    },
    "C12": {
      "value": null,
      "formula": "=IPMT($B$4/12,1,$B$5*12,-$B$3)*12"
    },
    "D12": {
      "value": null,
      "formula": "=PPMT($B$4/12,1,$B$5*12,-$B$3)*12"
    },
    "E12": {
      "value": null,
      "formula": "=$B$3-C12"
    },
    "A13": {
      "value": 2
    },
    "B13": {
      "value": null,
      "formula": "=$B$7*12"
    },
    "C13": {
      "value": null,
      "formula": "=IPMT($B$4/12,2,$B$5*12,-$B$3)*12"
    },
    "D13": {
      "value": null,
      "formula": "=PPMT($B$4/12,2,$B$5*12,-$B$3)*12"
    },
    "E13": {
      "value": null,
      "formula": "=E12-C13"
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
        "fontColor": "#1D4ED8"
      }
    },
    {
      "ids": [
        "A3",
        "A4",
        "A5",
        "A7",
        "A8",
        "A9"
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
        "bgColor": "#DBEAFE"
      }
    },
    {
      "ids": [
        "A11",
        "B11",
        "C11",
        "D11",
        "E11"
      ],
      "format": {
        "bold": true,
        "bgColor": "#1D4ED8",
        "fontColor": "#FFFFFF",
        "textAlign": "center"
      }
    }
  ]
},
{
  "tool": "create_airbnb_income",
  "label": "airbnb income",
  "cells": {
    "A1": {
      "value": "Airbnb Income Tracker"
    },
    "A3": {
      "value": "Month"
    },
    "B3": {
      "value": "Nights Booked"
    },
    "C3": {
      "value": "Nightly Rate"
    },
    "D3": {
      "value": "Gross Income"
    },
    "E3": {
      "value": "Cleaning Fee"
    },
    "F3": {
      "value": "Platform Fee"
    },
    "G3": {
      "value": "Net Income"
    },
    "A4": {
      "value": "Jan"
    },
    "B4": {
      "value": 22
    },
    "C4": {
      "value": 120
    },
    "D4": {
      "value": null,
      "formula": "=B4*C4"
    },
    "E4": {
      "value": 200
    },
    "F4": {
      "value": null,
      "formula": "=D4*0.03"
    },
    "G4": {
      "value": null,
      "formula": "=D4-E4-F4"
    },
    "A5": {
      "value": "Feb"
    },
    "B5": {
      "value": 18
    },
    "C5": {
      "value": 120
    },
    "D5": {
      "value": null,
      "formula": "=B5*C5"
    },
    "E5": {
      "value": 150
    },
    "F5": {
      "value": null,
      "formula": "=D5*0.03"
    },
    "G5": {
      "value": null,
      "formula": "=D5-E5-F5"
    },
    "A6": {
      "value": "Mar"
    },
    "B6": {
      "value": 25
    },
    "C6": {
      "value": 130
    },
    "D6": {
      "value": null,
      "formula": "=B6*C6"
    },
    "E6": {
      "value": 220
    },
    "F6": {
      "value": null,
      "formula": "=D6*0.03"
    },
    "G6": {
      "value": null,
      "formula": "=D6-E6-F6"
    },
    "A8": {
      "value": "TOTALS"
    },
    "D8": {
      "value": null,
      "formula": "=SUM(D4:D6)"
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
        "bgColor": "#1D4ED8",
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
        "fontColor": "#1D4ED8"
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
        "G8"
      ],
      "format": {
        "bold": true,
        "bgColor": "#DBEAFE"
      }
    }
  ]
},
{
  "tool": "create_property_comparison",
  "label": "property comparison",
  "cells": {
    "A1": {
      "value": "Property Comparison"
    },
    "A3": {
      "value": "Metric"
    },
    "B3": {
      "value": "Property A"
    },
    "C3": {
      "value": "Property B"
    },
    "D3": {
      "value": "Property C"
    },
    "A4": {
      "value": "Price"
    },
    "B4": {
      "value": 350000
    },
    "C4": {
      "value": 420000
    },
    "D4": {
      "value": 295000
    },
    "A5": {
      "value": "Bedrooms"
    },
    "B5": {
      "value": 3
    },
    "C5": {
      "value": 4
    },
    "D5": {
      "value": 2
    },
    "A6": {
      "value": "Bathrooms"
    },
    "B6": {
      "value": 2
    },
    "C6": {
      "value": 3
    },
    "D6": {
      "value": 1
    },
    "A7": {
      "value": "Sq Ft"
    },
    "B7": {
      "value": 1800
    },
    "C7": {
      "value": 2400
    },
    "D7": {
      "value": 1200
    },
    "A8": {
      "value": "$/Sq Ft"
    },
    "B8": {
      "value": null,
      "formula": "=B4/B7"
    },
    "C8": {
      "value": null,
      "formula": "=C4/C7"
    },
    "D8": {
      "value": null,
      "formula": "=D4/D7"
    },
    "A9": {
      "value": "Year Built"
    },
    "B9": {
      "value": 2005
    },
    "C9": {
      "value": 2015
    },
    "D9": {
      "value": 1998
    },
    "A10": {
      "value": "HOA"
    },
    "B10": {
      "value": 200
    },
    "C10": {
      "value": 350
    },
    "D10": {
      "value": 0
    },
    "A11": {
      "value": "Est. Monthly Payment"
    },
    "B11": {
      "value": null,
      "formula": "=PMT(0.065/12,360,-B4)+B10"
    },
    "C11": {
      "value": null,
      "formula": "=PMT(0.065/12,360,-C4)+C10"
    },
    "D11": {
      "value": null,
      "formula": "=PMT(0.065/12,360,-D4)+D10"
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
        "bgColor": "#1D4ED8",
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
        "fontColor": "#1D4ED8"
      }
    },
    {
      "ids": [
        "A4",
        "A5",
        "A6",
        "A7",
        "A8",
        "A9",
        "A10",
        "A11"
      ],
      "format": {
        "bold": true
      }
    }
  ]
},
{
  "tool": "create_rent_roll",
  "label": "rent roll",
  "cells": {
    "A1": {
      "value": "Rent Roll"
    },
    "A3": {
      "value": "Unit"
    },
    "B3": {
      "value": "Tenant"
    },
    "C3": {
      "value": "Lease Start"
    },
    "D3": {
      "value": "Rent Amount"
    },
    "E3": {
      "value": "Paid"
    },
    "F3": {
      "value": "Balance"
    },
    "G3": {
      "value": "Status"
    },
    "A4": {
      "value": "101"
    },
    "B4": {
      "value": "John Smith"
    },
    "C4": {
      "value": "2023-06-01"
    },
    "D4": {
      "value": 1500
    },
    "E4": {
      "value": 1500
    },
    "F4": {
      "value": null,
      "formula": "=D4-E4"
    },
    "G4": {
      "value": "Paid"
    },
    "A5": {
      "value": "102"
    },
    "B5": {
      "value": "Jane Doe"
    },
    "C5": {
      "value": "2023-08-01"
    },
    "D5": {
      "value": 1400
    },
    "E5": {
      "value": 1400
    },
    "F5": {
      "value": null,
      "formula": "=D5-E5"
    },
    "G5": {
      "value": "Paid"
    },
    "A6": {
      "value": "103"
    },
    "B6": {
      "value": "Bob Jones"
    },
    "C6": {
      "value": "2024-01-01"
    },
    "D6": {
      "value": 1600
    },
    "E6": {
      "value": 1000
    },
    "F6": {
      "value": null,
      "formula": "=D6-E6"
    },
    "G6": {
      "value": "Partial"
    },
    "A7": {
      "value": "201"
    },
    "B7": {
      "value": "Alice Brown"
    },
    "C7": {
      "value": "2023-03-01"
    },
    "D7": {
      "value": 1800
    },
    "E7": {
      "value": 0
    },
    "F7": {
      "value": null,
      "formula": "=D7-E7"
    },
    "G7": {
      "value": "Late"
    },
    "A9": {
      "value": "TOTALS"
    },
    "D9": {
      "value": null,
      "formula": "=SUM(D4:D7)"
    },
    "E9": {
      "value": null,
      "formula": "=SUM(E4:E7)"
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
        "bgColor": "#1D4ED8",
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
        "fontColor": "#1D4ED8"
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
        "E9",
        "F9"
      ],
      "format": {
        "bold": true,
        "bgColor": "#DBEAFE"
      }
    }
  ]
},
{
  "tool": "create_lease_tracker",
  "label": "lease tracker",
  "cells": {
    "A1": {
      "value": "Lease Tracker"
    },
    "A3": {
      "value": "Unit"
    },
    "B3": {
      "value": "Tenant"
    },
    "C3": {
      "value": "Lease Start"
    },
    "D3": {
      "value": "Lease End"
    },
    "E3": {
      "value": "Term (months)"
    },
    "F3": {
      "value": "Status"
    },
    "A4": {
      "value": "101"
    },
    "B4": {
      "value": "John Smith"
    },
    "C4": {
      "value": "2023-06-01"
    },
    "D4": {
      "value": "2024-05-31"
    },
    "E4": {
      "value": 12
    },
    "F4": {
      "value": "Expiring Soon"
    },
    "A5": {
      "value": "102"
    },
    "B5": {
      "value": "Jane Doe"
    },
    "C5": {
      "value": "2023-08-01"
    },
    "D5": {
      "value": "2025-07-31"
    },
    "E5": {
      "value": 24
    },
    "F5": {
      "value": "Active"
    },
    "A6": {
      "value": "103"
    },
    "B6": {
      "value": "Bob Jones"
    },
    "C6": {
      "value": "2024-01-01"
    },
    "D6": {
      "value": "2024-12-31"
    },
    "E6": {
      "value": 12
    },
    "F6": {
      "value": "Active"
    },
    "A7": {
      "value": "201"
    },
    "B7": {
      "value": "Alice Brown"
    },
    "C7": {
      "value": "2023-03-01"
    },
    "D7": {
      "value": "2024-02-28"
    },
    "E7": {
      "value": 12
    },
    "F7": {
      "value": "Expired"
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
        "bgColor": "#1D4ED8",
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
        "fontColor": "#1D4ED8"
      }
    }
  ]
},
{
  "tool": "create_renovation_budget",
  "label": "renovation budget",
  "cells": {
    "A1": {
      "value": "Renovation Budget"
    },
    "A3": {
      "value": "Room"
    },
    "B3": {
      "value": "Contractor"
    },
    "C3": {
      "value": "Estimated"
    },
    "D3": {
      "value": "Actual"
    },
    "E3": {
      "value": "Difference"
    },
    "F3": {
      "value": "Status"
    },
    "A4": {
      "value": "Kitchen"
    },
    "C4": {
      "value": 15000
    },
    "D4": {
      "value": 0
    },
    "E4": {
      "value": null,
      "formula": "=C4-D4"
    },
    "F4": {
      "value": "Planning"
    },
    "A5": {
      "value": "Master Bath"
    },
    "C5": {
      "value": 8000
    },
    "D5": {
      "value": 0
    },
    "E5": {
      "value": null,
      "formula": "=C5-D5"
    },
    "F5": {
      "value": "Planning"
    },
    "A6": {
      "value": "Living Room"
    },
    "C6": {
      "value": 5000
    },
    "D6": {
      "value": 0
    },
    "E6": {
      "value": null,
      "formula": "=C6-D6"
    },
    "F6": {
      "value": "Planning"
    },
    "A7": {
      "value": "Bedroom"
    },
    "C7": {
      "value": 3000
    },
    "D7": {
      "value": 0
    },
    "E7": {
      "value": null,
      "formula": "=C7-D7"
    },
    "F7": {
      "value": "Planning"
    },
    "A9": {
      "value": "TOTAL"
    },
    "C9": {
      "value": null,
      "formula": "=SUM(C4:C7)"
    },
    "D9": {
      "value": null,
      "formula": "=SUM(D4:D7)"
    },
    "E9": {
      "value": null,
      "formula": "=SUM(E4:E7)"
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
        "bgColor": "#1D4ED8",
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
        "fontColor": "#1D4ED8"
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
        "C9",
        "D9",
        "E9"
      ],
      "format": {
        "bold": true,
        "bgColor": "#DBEAFE"
      }
    }
  ]
},
{
  "tool": "create_roi_calculator",
  "label": "roi calculator",
  "cells": {
    "A1": {
      "value": "ROI Calculator"
    },
    "A3": {
      "value": "Purchase Price"
    },
    "B3": {
      "value": 300000
    },
    "A4": {
      "value": "Closing Costs"
    },
    "B4": {
      "value": 9000
    },
    "A5": {
      "value": "Renovation Costs"
    },
    "B5": {
      "value": 15000
    },
    "A6": {
      "value": "Total Investment"
    },
    "B6": {
      "value": null,
      "formula": "=B3+B4+B5"
    },
    "A8": {
      "value": "Annual Rental Income"
    },
    "B8": {
      "value": 21600
    },
    "A9": {
      "value": "Annual Expenses"
    },
    "B9": {
      "value": 6000
    },
    "A10": {
      "value": "Annual Net Income"
    },
    "B10": {
      "value": null,
      "formula": "=B8-B9"
    },
    "A12": {
      "value": "Cap Rate"
    },
    "B12": {
      "value": null,
      "formula": "=B10/B6"
    },
    "A13": {
      "value": "Cash-on-Cash Return"
    },
    "B13": {
      "value": null,
      "formula": "=B10/B5"
    },
    "A14": {
      "value": "Gross Yield"
    },
    "B14": {
      "value": null,
      "formula": "=B8/B6"
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
        "fontColor": "#1D4ED8"
      }
    },
    {
      "ids": [
        "A3",
        "A4",
        "A5",
        "A6",
        "A8",
        "A9",
        "A10",
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
        "B6",
        "B10",
        "B12",
        "B13",
        "B14"
      ],
      "format": {
        "bold": true,
        "bgColor": "#DBEAFE"
      }
    }
  ]
},
{
  "tool": "create_capex_planner",
  "label": "capex planner",
  "cells": {
    "A1": {
      "value": "Capital Expenditure Planner"
    },
    "A3": {
      "value": "Property"
    },
    "B3": {
      "value": "Item"
    },
    "C3": {
      "value": "Estimated Cost"
    },
    "D3": {
      "value": "Useful Life (yrs)"
    },
    "E3": {
      "value": "Annual Reserve"
    },
    "F3": {
      "value": "Priority"
    },
    "G3": {
      "value": "Target Year"
    },
    "A4": {
      "value": "123 Main St"
    },
    "B4": {
      "value": "Roof Replacement"
    },
    "C4": {
      "value": 18000
    },
    "D4": {
      "value": 25
    },
    "E4": {
      "value": null,
      "formula": "=C4/D4"
    },
    "F4": {
      "value": "High"
    },
    "G4": {
      "value": 2026
    },
    "A5": {
      "value": "123 Main St"
    },
    "B5": {
      "value": "HVAC System"
    },
    "C5": {
      "value": 12000
    },
    "D5": {
      "value": 15
    },
    "E5": {
      "value": null,
      "formula": "=C5/D5"
    },
    "F5": {
      "value": "Medium"
    },
    "G5": {
      "value": 2027
    },
    "A6": {
      "value": "456 Oak Ave"
    },
    "B6": {
      "value": "Parking Lot Resurfacing"
    },
    "C6": {
      "value": 8500
    },
    "D6": {
      "value": 10
    },
    "E6": {
      "value": null,
      "formula": "=C6/D6"
    },
    "F6": {
      "value": "Low"
    },
    "G6": {
      "value": 2025
    },
    "A7": {
      "value": "456 Oak Ave"
    },
    "B7": {
      "value": "Water Heater"
    },
    "C7": {
      "value": 4500
    },
    "D7": {
      "value": 12
    },
    "E7": {
      "value": null,
      "formula": "=C7/D7"
    },
    "F7": {
      "value": "Medium"
    },
    "G7": {
      "value": 2025
    },
    "A9": {
      "value": "TOTALS"
    },
    "C9": {
      "value": null,
      "formula": "=SUM(C4:C7)"
    },
    "E9": {
      "value": null,
      "formula": "=SUM(E4:E7)"
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
        "C9",
        "E9"
      ],
      "format": {
        "bold": true,
        "bgColor": "#EDE9FE"
      }
    }
  ]
},
{
  "tool": "create_maintenance_tracker",
  "label": "maintenance tracker",
  "cells": {
    "A1": {
      "value": "Maintenance Tracker"
    },
    "A3": {
      "value": "Property"
    },
    "B3": {
      "value": "Issue"
    },
    "C3": {
      "value": "Reported Date"
    },
    "D3": {
      "value": "Vendor"
    },
    "E3": {
      "value": "Cost"
    },
    "F3": {
      "value": "Status"
    },
    "G3": {
      "value": "Completed Date"
    },
    "A4": {
      "value": "123 Main St, Unit 2"
    },
    "B4": {
      "value": "Leaking faucet in kitchen"
    },
    "C4": {
      "value": "2024-09-12"
    },
    "D4": {
      "value": "Ace Plumbing"
    },
    "E4": {
      "value": 275
    },
    "F4": {
      "value": "Completed"
    },
    "G4": {
      "value": "2024-09-14"
    },
    "A5": {
      "value": "456 Oak Ave, Unit 1"
    },
    "B5": {
      "value": "Broken window latch"
    },
    "C5": {
      "value": "2024-09-18"
    },
    "D5": {
      "value": "HandyPro Services"
    },
    "E5": {
      "value": 150
    },
    "F5": {
      "value": "Completed"
    },
    "G5": {
      "value": "2024-09-20"
    },
    "A6": {
      "value": "789 Elm Dr, Unit 3"
    },
    "B6": {
      "value": "HVAC not cooling"
    },
    "C6": {
      "value": "2024-10-01"
    },
    "D6": {
      "value": "CoolAir HVAC"
    },
    "E6": {
      "value": 850
    },
    "F6": {
      "value": "In Progress"
    },
    "G6": {
      "value": null
    },
    "A7": {
      "value": "123 Main St, Unit 4"
    },
    "B7": {
      "value": "Garage door motor failure"
    },
    "C7": {
      "value": "2024-10-05"
    },
    "D7": {
      "value": "DoorTech Inc"
    },
    "E7": {
      "value": 620
    },
    "F7": {
      "value": "Scheduled"
    },
    "G7": {
      "value": null
    },
    "A9": {
      "value": "TOTAL COST"
    },
    "E9": {
      "value": null,
      "formula": "=SUM(E4:E7)"
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
        "E9"
      ],
      "format": {
        "bold": true,
        "bgColor": "#EDE9FE"
      }
    }
  ]
},
{
  "tool": "create_lease_comparison",
  "label": "lease comparison",
  "cells": {
    "A1": {
      "value": "Lease Comparison"
    },
    "A3": {
      "value": "Metric"
    },
    "B3": {
      "value": "Property A"
    },
    "C3": {
      "value": "Property B"
    },
    "D3": {
      "value": "Property C"
    },
    "A4": {
      "value": "Address"
    },
    "B4": {
      "value": "200 Market St"
    },
    "C4": {
      "value": "55 Broadway"
    },
    "D4": {
      "value": "1800 Industrial Blvd"
    },
    "A5": {
      "value": "Sq Ft"
    },
    "B5": {
      "value": 2500
    },
    "C5": {
      "value": 3200
    },
    "D5": {
      "value": 4100
    },
    "A6": {
      "value": "Monthly Rent"
    },
    "B6": {
      "value": 4500
    },
    "C6": {
      "value": 6400
    },
    "D6": {
      "value": 5750
    },
    "A7": {
      "value": "$/Sq Ft/Month"
    },
    "B7": {
      "value": null,
      "formula": "=B6/B5"
    },
    "C7": {
      "value": null,
      "formula": "=C6/C5"
    },
    "D7": {
      "value": null,
      "formula": "=D6/D5"
    },
    "A8": {
      "value": "Lease Term (yrs)"
    },
    "B8": {
      "value": 3
    },
    "C8": {
      "value": 5
    },
    "D8": {
      "value": 5
    },
    "A9": {
      "value": "Annual Escalation %"
    },
    "B9": {
      "value": 0.03
    },
    "C9": {
      "value": 0.025
    },
    "D9": {
      "value": 0.02
    },
    "A10": {
      "value": "NNN Costs/Month"
    },
    "B10": {
      "value": 800
    },
    "C10": {
      "value": 1100
    },
    "D10": {
      "value": 950
    },
    "A11": {
      "value": "Total Monthly Cost"
    },
    "B11": {
      "value": null,
      "formula": "=B6+B10"
    },
    "C11": {
      "value": null,
      "formula": "=C6+C10"
    },
    "D11": {
      "value": null,
      "formula": "=D6+D10"
    },
    "A12": {
      "value": "Total Lease Cost"
    },
    "B12": {
      "value": null,
      "formula": "=B11*12*B8"
    },
    "C12": {
      "value": null,
      "formula": "=C11*12*C8"
    },
    "D12": {
      "value": null,
      "formula": "=D11*12*D8"
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
        "A4",
        "A5",
        "A6",
        "A7",
        "A8",
        "A9",
        "A10",
        "A11",
        "A12"
      ],
      "format": {
        "bold": true
      }
    },
    {
      "ids": [
        "B11",
        "C11",
        "D11",
        "B12",
        "C12",
        "D12"
      ],
      "format": {
        "bold": true,
        "bgColor": "#EDE9FE"
      }
    }
  ]
},
{
  "tool": "create_property_tax_tracker",
  "label": "property tax tracker",
  "cells": {
    "A1": {
      "value": "Property Tax Tracker"
    },
    "A3": {
      "value": "Property"
    },
    "B3": {
      "value": "Assessed Value"
    },
    "C3": {
      "value": "Tax Rate"
    },
    "D3": {
      "value": "Annual Tax"
    },
    "E3": {
      "value": "Monthly Escrow"
    },
    "F3": {
      "value": "Due Date"
    },
    "G3": {
      "value": "Status"
    },
    "A4": {
      "value": "123 Main St"
    },
    "B4": {
      "value": 385000
    },
    "C4": {
      "value": 0.0125
    },
    "D4": {
      "value": null,
      "formula": "=B4*C4"
    },
    "E4": {
      "value": null,
      "formula": "=D4/12"
    },
    "F4": {
      "value": "2025-03-01"
    },
    "G4": {
      "value": "Paid"
    },
    "A5": {
      "value": "456 Oak Ave"
    },
    "B5": {
      "value": 520000
    },
    "C5": {
      "value": 0.0138
    },
    "D5": {
      "value": null,
      "formula": "=B5*C5"
    },
    "E5": {
      "value": null,
      "formula": "=D5/12"
    },
    "F5": {
      "value": "2025-03-01"
    },
    "G5": {
      "value": "Pending"
    },
    "A6": {
      "value": "789 Elm Dr"
    },
    "B6": {
      "value": 295000
    },
    "C6": {
      "value": 0.0112
    },
    "D6": {
      "value": null,
      "formula": "=B6*C6"
    },
    "E6": {
      "value": null,
      "formula": "=D6/12"
    },
    "F6": {
      "value": "2025-06-01"
    },
    "G6": {
      "value": "Upcoming"
    },
    "A7": {
      "value": "1010 Pine Ct"
    },
    "B7": {
      "value": 440000
    },
    "C7": {
      "value": 0.0145
    },
    "D7": {
      "value": null,
      "formula": "=B7*C7"
    },
    "E7": {
      "value": null,
      "formula": "=D7/12"
    },
    "F7": {
      "value": "2025-06-01"
    },
    "G7": {
      "value": "Upcoming"
    },
    "A9": {
      "value": "TOTALS"
    },
    "B9": {
      "value": null,
      "formula": "=SUM(B4:B7)"
    },
    "D9": {
      "value": null,
      "formula": "=SUM(D4:D7)"
    },
    "E9": {
      "value": null,
      "formula": "=SUM(E4:E7)"
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
        "B9",
        "D9",
        "E9"
      ],
      "format": {
        "bold": true,
        "bgColor": "#EDE9FE"
      }
    }
  ]
}
];
