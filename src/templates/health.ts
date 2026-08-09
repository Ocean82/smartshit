// GENERATED from the legacy template switch (see registry.test.ts for the
// equivalence proof). Category: Health & Wellness. Edit as data — no logic here.
import type { TemplateSpec } from './types';

export const healthTemplates: TemplateSpec[] = [
{
  "tool": "create_workout_log",
  "label": "workout log",
  "cells": {
    "A1": {
      "value": "Workout Log"
    },
    "A3": {
      "value": "Date"
    },
    "B3": {
      "value": "Exercise"
    },
    "C3": {
      "value": "Sets"
    },
    "D3": {
      "value": "Reps"
    },
    "E3": {
      "value": "Weight (lbs)"
    },
    "F3": {
      "value": "Notes"
    },
    "A4": {
      "value": "2024-01-15"
    },
    "B4": {
      "value": "Bench Press"
    },
    "C4": {
      "value": 4
    },
    "D4": {
      "value": 8
    },
    "E4": {
      "value": 135
    },
    "F4": {
      "value": ""
    },
    "A5": {
      "value": "2024-01-15"
    },
    "B5": {
      "value": "Squats"
    },
    "C5": {
      "value": 4
    },
    "D5": {
      "value": 10
    },
    "E5": {
      "value": 185
    },
    "F5": {
      "value": ""
    },
    "A6": {
      "value": "2024-01-15"
    },
    "B6": {
      "value": "Deadlift"
    },
    "C6": {
      "value": 3
    },
    "D6": {
      "value": 6
    },
    "E6": {
      "value": 225
    },
    "F6": {
      "value": "PR!"
    },
    "A7": {
      "value": "2024-01-17"
    },
    "B7": {
      "value": "Overhead Press"
    },
    "C7": {
      "value": 4
    },
    "D7": {
      "value": 8
    },
    "E7": {
      "value": 95
    },
    "F7": {
      "value": ""
    },
    "A8": {
      "value": "2024-01-17"
    },
    "B8": {
      "value": "Rows"
    },
    "C8": {
      "value": 4
    },
    "D8": {
      "value": 10
    },
    "E8": {
      "value": 115
    },
    "F8": {
      "value": ""
    },
    "A10": {
      "value": "Total Sets"
    },
    "C10": {
      "value": null,
      "formula": "=SUM(C4:C8)"
    },
    "A11": {
      "value": "Avg Weight"
    },
    "E11": {
      "value": null,
      "formula": "=AVERAGE(E4:E8)"
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
        "bgColor": "#E11D48",
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
        "fontColor": "#E11D48"
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
        "C10"
      ],
      "format": {
        "bold": true,
        "bgColor": "#FFE4E6"
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
        "E11"
      ],
      "format": {
        "bold": true,
        "bgColor": "#FFE4E6"
      }
    }
  ]
},
{
  "tool": "create_meal_planner",
  "label": "meal planner",
  "cells": {
    "A1": {
      "value": "Weekly Meal Planner"
    },
    "A3": {
      "value": "Day"
    },
    "B3": {
      "value": "Breakfast"
    },
    "C3": {
      "value": "Lunch"
    },
    "D3": {
      "value": "Dinner"
    },
    "E3": {
      "value": "Calories"
    },
    "A4": {
      "value": "Monday"
    },
    "B4": {
      "value": "Oatmeal & fruit"
    },
    "C4": {
      "value": "Chicken salad"
    },
    "D4": {
      "value": "Salmon & rice"
    },
    "E4": {
      "value": 1800
    },
    "A5": {
      "value": "Tuesday"
    },
    "B5": {
      "value": "Eggs & toast"
    },
    "C5": {
      "value": "Turkey wrap"
    },
    "D5": {
      "value": "Pasta"
    },
    "E5": {
      "value": 2000
    },
    "A6": {
      "value": "Wednesday"
    },
    "B6": {
      "value": "Smoothie"
    },
    "C6": {
      "value": "Quinoa bowl"
    },
    "D6": {
      "value": "Stir fry"
    },
    "E6": {
      "value": 1750
    },
    "A7": {
      "value": "Thursday"
    },
    "B7": {
      "value": "Yogurt parfait"
    },
    "C7": {
      "value": "Soup & bread"
    },
    "D7": {
      "value": "Grilled chicken"
    },
    "E7": {
      "value": 1850
    },
    "A8": {
      "value": "Friday"
    },
    "B8": {
      "value": "Cereal"
    },
    "C8": {
      "value": "Leftovers"
    },
    "D8": {
      "value": "Pizza (homemade)"
    },
    "E8": {
      "value": 2100
    },
    "A9": {
      "value": "Saturday"
    },
    "B9": {
      "value": "Pancakes"
    },
    "C9": {
      "value": "Sandwich"
    },
    "D9": {
      "value": "BBQ chicken"
    },
    "E9": {
      "value": 2200
    },
    "A10": {
      "value": "Sunday"
    },
    "B10": {
      "value": "French toast"
    },
    "C10": {
      "value": "Salad"
    },
    "D10": {
      "value": "Roast beef"
    },
    "E10": {
      "value": 1950
    },
    "A12": {
      "value": "Weekly Calories"
    },
    "E12": {
      "value": null,
      "formula": "=SUM(E4:E10)"
    },
    "A13": {
      "value": "Daily Average"
    },
    "E13": {
      "value": null,
      "formula": "=AVERAGE(E4:E10)"
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
        "bgColor": "#E11D48",
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
        "fontColor": "#E11D48"
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
        "E12"
      ],
      "format": {
        "bold": true,
        "bgColor": "#FFE4E6"
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
        "E13"
      ],
      "format": {
        "bold": true,
        "bgColor": "#FFE4E6"
      }
    }
  ]
},
{
  "tool": "create_weight_tracker",
  "label": "weight tracker",
  "cells": {
    "A1": {
      "value": "Weight Tracker"
    },
    "A3": {
      "value": "Date"
    },
    "B3": {
      "value": "Weight (lbs)"
    },
    "C3": {
      "value": "Change"
    },
    "D3": {
      "value": "Goal Progress"
    },
    "A4": {
      "value": "2024-01-01"
    },
    "B4": {
      "value": 180
    },
    "C4": {
      "value": ""
    },
    "D4": {
      "value": ""
    },
    "A5": {
      "value": "2024-01-08"
    },
    "B5": {
      "value": 178
    },
    "C5": {
      "value": null,
      "formula": "=B5-B4"
    },
    "D5": {
      "value": null,
      "formula": "=($B$4-B5)/($B$4-165)"
    },
    "A6": {
      "value": "2024-01-15"
    },
    "B6": {
      "value": 177
    },
    "C6": {
      "value": null,
      "formula": "=B6-B5"
    },
    "D6": {
      "value": null,
      "formula": "=($B$4-B6)/($B$4-165)"
    },
    "A7": {
      "value": "2024-01-22"
    },
    "B7": {
      "value": 175
    },
    "C7": {
      "value": null,
      "formula": "=B7-B6"
    },
    "D7": {
      "value": null,
      "formula": "=($B$4-B7)/($B$4-165)"
    },
    "A8": {
      "value": "2024-01-29"
    },
    "B8": {
      "value": 174
    },
    "C8": {
      "value": null,
      "formula": "=B8-B7"
    },
    "D8": {
      "value": null,
      "formula": "=($B$4-B8)/($B$4-165)"
    },
    "A10": {
      "value": "Starting Weight"
    },
    "B10": {
      "value": null,
      "formula": "=B4"
    },
    "A11": {
      "value": "Current Weight"
    },
    "B11": {
      "value": null,
      "formula": "=B8"
    },
    "A12": {
      "value": "Total Lost"
    },
    "B12": {
      "value": null,
      "formula": "=B4-B8"
    },
    "A13": {
      "value": "Goal Weight"
    },
    "B13": {
      "value": 165
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
        "bgColor": "#E11D48",
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
        "fontColor": "#E11D48"
      }
    },
    {
      "ids": [
        "A10",
        "A11",
        "A12",
        "A13"
      ],
      "format": {
        "bold": true
      }
    },
    {
      "ids": [
        "B12"
      ],
      "format": {
        "bold": true,
        "bgColor": "#D1FAE5",
        "fontColor": "#059669"
      }
    },
    {
      "ids": [
        "B13"
      ],
      "format": {
        "bold": true,
        "bgColor": "#FFE4E6"
      }
    }
  ]
},
{
  "tool": "create_habit_tracker",
  "label": "habit tracker",
  "cells": {
    "A1": {
      "value": "Habit Tracker"
    },
    "A3": {
      "value": "Habit"
    },
    "B3": {
      "value": "Mon"
    },
    "C3": {
      "value": "Tue"
    },
    "D3": {
      "value": "Wed"
    },
    "E3": {
      "value": "Thu"
    },
    "F3": {
      "value": "Fri"
    },
    "G3": {
      "value": "Sat"
    },
    "H3": {
      "value": "Sun"
    },
    "I3": {
      "value": "Rate"
    },
    "A4": {
      "value": "Exercise"
    },
    "B4": {
      "value": "Y"
    },
    "C4": {
      "value": "N"
    },
    "D4": {
      "value": "Y"
    },
    "E4": {
      "value": "Y"
    },
    "F4": {
      "value": "N"
    },
    "G4": {
      "value": "Y"
    },
    "H4": {
      "value": "N"
    },
    "A5": {
      "value": "Read 30 min"
    },
    "B5": {
      "value": "Y"
    },
    "C5": {
      "value": "Y"
    },
    "D5": {
      "value": "Y"
    },
    "E5": {
      "value": "Y"
    },
    "F5": {
      "value": "Y"
    },
    "G5": {
      "value": "N"
    },
    "H5": {
      "value": "Y"
    },
    "A6": {
      "value": "Meditate"
    },
    "B6": {
      "value": "N"
    },
    "C6": {
      "value": "Y"
    },
    "D6": {
      "value": "N"
    },
    "E6": {
      "value": "Y"
    },
    "F6": {
      "value": "N"
    },
    "G6": {
      "value": "Y"
    },
    "H6": {
      "value": "Y"
    },
    "A7": {
      "value": "No sugar"
    },
    "B7": {
      "value": "Y"
    },
    "C7": {
      "value": "Y"
    },
    "D7": {
      "value": "N"
    },
    "E7": {
      "value": "Y"
    },
    "F7": {
      "value": "Y"
    },
    "G7": {
      "value": "Y"
    },
    "H7": {
      "value": "Y"
    },
    "A8": {
      "value": "Journal"
    },
    "B8": {
      "value": "Y"
    },
    "C8": {
      "value": "Y"
    },
    "D8": {
      "value": "Y"
    },
    "E8": {
      "value": "Y"
    },
    "F8": {
      "value": "Y"
    },
    "G8": {
      "value": "Y"
    },
    "H8": {
      "value": "Y"
    },
    "A10": {
      "value": "Completion Rate"
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
        "H3",
        "I3"
      ],
      "format": {
        "bold": true,
        "bgColor": "#E11D48",
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
        "fontColor": "#E11D48"
      }
    },
    {
      "ids": [
        "A10"
      ],
      "format": {
        "bold": true
      }
    }
  ]
},
{
  "tool": "create_medical_expenses",
  "label": "medical expenses",
  "cells": {
    "A1": {
      "value": "Medical Expenses Tracker"
    },
    "A3": {
      "value": "Date"
    },
    "B3": {
      "value": "Provider"
    },
    "C3": {
      "value": "Service"
    },
    "D3": {
      "value": "Billed"
    },
    "E3": {
      "value": "Insurance"
    },
    "F3": {
      "value": "Out of Pocket"
    },
    "A4": {
      "value": "2024-01-05"
    },
    "B4": {
      "value": "Dr. Smith"
    },
    "C4": {
      "value": "Annual physical"
    },
    "D4": {
      "value": 300
    },
    "E4": {
      "value": 300
    },
    "F4": {
      "value": 0
    },
    "A5": {
      "value": "2024-01-15"
    },
    "B5": {
      "value": "Lab Corp"
    },
    "C5": {
      "value": "Blood work"
    },
    "D5": {
      "value": 150
    },
    "E5": {
      "value": 120
    },
    "F5": {
      "value": 30
    },
    "A6": {
      "value": "2024-02-01"
    },
    "B6": {
      "value": "City Pharmacy"
    },
    "C6": {
      "value": "Prescription"
    },
    "D6": {
      "value": 45
    },
    "E6": {
      "value": 35
    },
    "F6": {
      "value": 10
    },
    "A7": {
      "value": "2024-02-10"
    },
    "B7": {
      "value": "Dental Care"
    },
    "C7": {
      "value": "Cleaning"
    },
    "D7": {
      "value": 200
    },
    "E7": {
      "value": 160
    },
    "F7": {
      "value": 40
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
        "F3"
      ],
      "format": {
        "bold": true,
        "bgColor": "#E11D48",
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
        "fontColor": "#E11D48"
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
        "bgColor": "#FFE4E6"
      }
    }
  ]
},
{
  "tool": "create_medical_expense_hsa",
  "label": "medical expense tracker with HSA",
  "cells": {
    "A1": { "value": "Medical Expense Tracker with HSA" },
    "A3": { "value": "Date" },
    "B3": { "value": "Provider" },
    "C3": { "value": "Service" },
    "D3": { "value": "Billed" },
    "E3": { "value": "Insurance Paid" },
    "F3": { "value": "HSA Used" },
    "G3": { "value": "Out of Pocket" },
    "A4": { "value": "2024-01-10" },
    "B4": { "value": "Metro Clinic" },
    "C4": { "value": "Specialist visit" },
    "D4": { "value": 450 },
    "E4": { "value": 320 },
    "F4": { "value": 100 },
    "G4": { "value": null, "formula": "=D4-E4-F4" },
    "A5": { "value": "2024-02-03" },
    "B5": { "value": "ClearVision Eye" },
    "C5": { "value": "Eye exam + contacts" },
    "D5": { "value": 275 },
    "E5": { "value": 150 },
    "F5": { "value": 125 },
    "G5": { "value": null, "formula": "=D5-E5-F5" },
    "A6": { "value": "2024-02-18" },
    "B6": { "value": "PhysioWorks" },
    "C6": { "value": "Physical therapy (3 sessions)" },
    "D6": { "value": 600 },
    "E6": { "value": 420 },
    "F6": { "value": 150 },
    "G6": { "value": null, "formula": "=D6-E6-F6" },
    "A7": { "value": "2024-03-05" },
    "B7": { "value": "Walgreens" },
    "C7": { "value": "Prescription (90-day)" },
    "D7": { "value": 180 },
    "E7": { "value": 90 },
    "F7": { "value": 90 },
    "G7": { "value": null, "formula": "=D7-E7-F7" },
    "A9": { "value": "TOTALS" },
    "D9": { "value": null, "formula": "=SUM(D4:D7)" },
    "E9": { "value": null, "formula": "=SUM(E4:E7)" },
    "F9": { "value": null, "formula": "=SUM(F4:F7)" },
    "G9": { "value": null, "formula": "=SUM(G4:G7)" },
    "A11": { "value": "HSA Balance Start" },
    "B11": { "value": 2500 },
    "A12": { "value": "HSA Contributions" },
    "B12": { "value": 750 },
    "A13": { "value": "HSA Used YTD" },
    "B13": { "value": null, "formula": "=F9" },
    "A14": { "value": "HSA Balance" },
    "B14": { "value": null, "formula": "=B11+B12-B13" }
  },
  "formats": [
    { "ids": ["A3","B3","C3","D3","E3","F3","G3"], "format": { "bold": true, "bgColor": "#7C3AED", "fontColor": "#FFFFFF", "textAlign": "center" } },
    { "ids": ["A1"], "format": { "bold": true, "fontSize": 16, "fontColor": "#7C3AED" } },
    { "ids": ["A9"], "format": { "bold": true } },
    { "ids": ["D9","E9","F9","G9"], "format": { "bold": true, "bgColor": "#EDE9FE" } },
    { "ids": ["A11","A12","A13","A14"], "format": { "bold": true } },
    { "ids": ["B14"], "format": { "bold": true, "bgColor": "#D1FAE5", "fontColor": "#059669" } }
  ]
},
// Medication Schedule spec
{
  "tool": "create_medication_schedule",
  "label": "medication schedule",
  "cells": {
    "A1": { "value": "Medication Schedule" },
    "A3": { "value": "Medication" },
    "B3": { "value": "Dosage" },
    "C3": { "value": "Frequency" },
    "D3": { "value": "Time" },
    "E3": { "value": "Prescriber" },
    "F3": { "value": "Refill Date" },
    "G3": { "value": "Remaining" },
    "A4": { "value": "Lisinopril" },
    "B4": { "value": "10mg" },
    "C4": { "value": "Once daily" },
    "D4": { "value": "8:00 AM" },
    "E4": { "value": "Dr. Martinez" },
    "F4": { "value": "2024-03-15" },
    "G4": { "value": 22 },
    "A5": { "value": "Metformin" },
    "B5": { "value": "500mg" },
    "C5": { "value": "Twice daily" },
    "D5": { "value": "8:00 AM / 8:00 PM" },
    "E5": { "value": "Dr. Martinez" },
    "F5": { "value": "2024-03-01" },
    "G5": { "value": 14 },
    "A6": { "value": "Atorvastatin" },
    "B6": { "value": "20mg" },
    "C6": { "value": "Once daily" },
    "D6": { "value": "9:00 PM" },
    "E6": { "value": "Dr. Chen" },
    "F6": { "value": "2024-04-10" },
    "G6": { "value": 48 },
    "A7": { "value": "Vitamin D3" },
    "B7": { "value": "2000 IU" },
    "C7": { "value": "Once daily" },
    "D7": { "value": "8:00 AM" },
    "E7": { "value": "Dr. Martinez" },
    "F7": { "value": "2024-05-20" },
    "G7": { "value": 90 },
    "A9": { "value": "Total Medications" },
    "B9": { "value": null, "formula": "=COUNTA(A4:A7)" },
    "A10": { "value": "Earliest Refill" },
    "B10": { "value": null, "formula": "=MIN(G4:G7)" }
  },
  "formats": [
    { "ids": ["A3","B3","C3","D3","E3","F3","G3"], "format": { "bold": true, "bgColor": "#7C3AED", "fontColor": "#FFFFFF", "textAlign": "center" } },
    { "ids": ["A1"], "format": { "bold": true, "fontSize": 16, "fontColor": "#7C3AED" } },
    { "ids": ["A9","A10"], "format": { "bold": true } },
    { "ids": ["B9","B10"], "format": { "bold": true, "bgColor": "#EDE9FE" } }
  ]
},
// Macro/Nutrition Calculator spec
{
  "tool": "create_macro_calculator",
  "label": "macro/nutrition calculator",
  "cells": {
    "A1": { "value": "Macro & Nutrition Calculator" },
    "A3": { "value": "Meal" },
    "B3": { "value": "Food Item" },
    "C3": { "value": "Serving (g)" },
    "D3": { "value": "Calories" },
    "E3": { "value": "Protein (g)" },
    "F3": { "value": "Carbs (g)" },
    "G3": { "value": "Fat (g)" },
    "A4": { "value": "Breakfast" },
    "B4": { "value": "Greek yogurt" },
    "C4": { "value": 200 },
    "D4": { "value": 130 },
    "E4": { "value": 20 },
    "F4": { "value": 8 },
    "G4": { "value": 2 },
    "A5": { "value": "Breakfast" },
    "B5": { "value": "Granola" },
    "C5": { "value": 50 },
    "D5": { "value": 220 },
    "E5": { "value": 5 },
    "F5": { "value": 30 },
    "G5": { "value": 9 },
    "A6": { "value": "Lunch" },
    "B6": { "value": "Grilled chicken breast" },
    "C6": { "value": 150 },
    "D6": { "value": 248 },
    "E6": { "value": 46 },
    "F6": { "value": 0 },
    "G6": { "value": 5 },
    "A7": { "value": "Lunch" },
    "B7": { "value": "Brown rice" },
    "C7": { "value": 185 },
    "D7": { "value": 216 },
    "E7": { "value": 5 },
    "F7": { "value": 45 },
    "G7": { "value": 2 },
    "A8": { "value": "Dinner" },
    "B8": { "value": "Salmon fillet" },
    "C8": { "value": 170 },
    "D8": { "value": 350 },
    "E8": { "value": 39 },
    "F8": { "value": 0 },
    "G8": { "value": 20 },
    "A10": { "value": "Daily Totals" },
    "D10": { "value": null, "formula": "=SUM(D4:D8)" },
    "E10": { "value": null, "formula": "=SUM(E4:E8)" },
    "F10": { "value": null, "formula": "=SUM(F4:F8)" },
    "G10": { "value": null, "formula": "=SUM(G4:G8)" },
    "A12": { "value": "Target Calories" },
    "B12": { "value": 2200 },
    "A13": { "value": "Remaining" },
    "B13": { "value": null, "formula": "=B12-D10" },
    "A14": { "value": "Protein %" },
    "B14": { "value": null, "formula": "=(E10*4)/D10" },
    "A15": { "value": "Carbs %" },
    "B15": { "value": null, "formula": "=(F10*4)/D10" },
    "A16": { "value": "Fat %" },
    "B16": { "value": null, "formula": "=(G10*9)/D10" }
  },
  "formats": [
    { "ids": ["A3","B3","C3","D3","E3","F3","G3"], "format": { "bold": true, "bgColor": "#7C3AED", "fontColor": "#FFFFFF", "textAlign": "center" } },
    { "ids": ["A1"], "format": { "bold": true, "fontSize": 16, "fontColor": "#7C3AED" } },
    { "ids": ["A10"], "format": { "bold": true } },
    { "ids": ["D10","E10","F10","G10"], "format": { "bold": true, "bgColor": "#EDE9FE" } },
    { "ids": ["A12","A13","A14","A15","A16"], "format": { "bold": true } },
    { "ids": ["B13"], "format": { "bold": true, "bgColor": "#D1FAE5", "fontColor": "#059669" } }
  ]
},
// Workout Progress Tracker spec
{
  "tool": "create_workout_progress",
  "label": "workout progress tracker",
  "cells": {
    "A1": { "value": "Workout Progress Tracker" },
    "A3": { "value": "Week" },
    "B3": { "value": "Exercise" },
    "C3": { "value": "Max Weight (lbs)" },
    "D3": { "value": "Total Volume" },
    "E3": { "value": "Sessions" },
    "F3": { "value": "Progress vs Prev" },
    "A4": { "value": "Week 1" },
    "B4": { "value": "Bench Press" },
    "C4": { "value": 155 },
    "D4": { "value": 4320 },
    "E4": { "value": 3 },
    "F4": { "value": "" },
    "A5": { "value": "Week 2" },
    "B5": { "value": "Bench Press" },
    "C5": { "value": 160 },
    "D5": { "value": 4600 },
    "E5": { "value": 3 },
    "F5": { "value": null, "formula": "=(C5-C4)/C4" },
    "A6": { "value": "Week 3" },
    "B6": { "value": "Bench Press" },
    "C6": { "value": 165 },
    "D6": { "value": 4950 },
    "E6": { "value": 4 },
    "F6": { "value": null, "formula": "=(C6-C5)/C5" },
    "A7": { "value": "Week 4" },
    "B7": { "value": "Bench Press" },
    "C7": { "value": 170 },
    "D7": { "value": 5100 },
    "E7": { "value": 3 },
    "F7": { "value": null, "formula": "=(C7-C6)/C6" },
    "A9": { "value": "Summary" },
    "A10": { "value": "Starting Max" },
    "B10": { "value": null, "formula": "=C4" },
    "A11": { "value": "Current Max" },
    "B11": { "value": null, "formula": "=C7" },
    "A12": { "value": "Total Gain" },
    "B12": { "value": null, "formula": "=C7-C4" },
    "A13": { "value": "Total Sessions" },
    "B13": { "value": null, "formula": "=SUM(E4:E7)" },
    "A14": { "value": "Avg Volume/Week" },
    "B14": { "value": null, "formula": "=AVERAGE(D4:D7)" }
  },
  "formats": [
    { "ids": ["A3","B3","C3","D3","E3","F3"], "format": { "bold": true, "bgColor": "#7C3AED", "fontColor": "#FFFFFF", "textAlign": "center" } },
    { "ids": ["A1"], "format": { "bold": true, "fontSize": 16, "fontColor": "#7C3AED" } },
    { "ids": ["A9"], "format": { "bold": true, "fontSize": 14 } },
    { "ids": ["A10","A11","A12","A13","A14"], "format": { "bold": true } },
    { "ids": ["B12"], "format": { "bold": true, "bgColor": "#D1FAE5", "fontColor": "#059669" } },
    { "ids": ["B14"], "format": { "bold": true, "bgColor": "#EDE9FE" } }
  ]
},
// Mental Health Mood Journal spec
{
  "tool": "create_mood_journal",
  "label": "mental health mood journal",
  "cells": {
    "A1": { "value": "Mental Health Mood Journal" },
    "A3": { "value": "Date" },
    "B3": { "value": "Mood (1-10)" },
    "C3": { "value": "Anxiety (1-10)" },
    "D3": { "value": "Sleep Hrs" },
    "E3": { "value": "Exercise" },
    "F3": { "value": "Triggers/Notes" },
    "A4": { "value": "2024-02-01" },
    "B4": { "value": 7 },
    "C4": { "value": 3 },
    "D4": { "value": 7.5 },
    "E4": { "value": "Y" },
    "F4": { "value": "Good day, walked 30 min" },
    "A5": { "value": "2024-02-02" },
    "B5": { "value": 5 },
    "C5": { "value": 6 },
    "D5": { "value": 5 },
    "E5": { "value": "N" },
    "F5": { "value": "Work deadline stress" },
    "A6": { "value": "2024-02-03" },
    "B6": { "value": 6 },
    "C6": { "value": 4 },
    "D6": { "value": 6.5 },
    "E6": { "value": "Y" },
    "F6": { "value": "Meditation helped" },
    "A7": { "value": "2024-02-04" },
    "B7": { "value": 8 },
    "C7": { "value": 2 },
    "D7": { "value": 8 },
    "E7": { "value": "Y" },
    "F7": { "value": "Social outing, felt great" },
    "A9": { "value": "Weekly Summary" },
    "A10": { "value": "Avg Mood" },
    "B10": { "value": null, "formula": "=AVERAGE(B4:B7)" },
    "A11": { "value": "Avg Anxiety" },
    "B11": { "value": null, "formula": "=AVERAGE(C4:C7)" },
    "A12": { "value": "Avg Sleep" },
    "B12": { "value": null, "formula": "=AVERAGE(D4:D7)" },
    "A13": { "value": "Exercise Days" },
    "B13": { "value": null, "formula": "=COUNTIF(E4:E7,\"Y\")" }
  },
  "formats": [
    { "ids": ["A3","B3","C3","D3","E3","F3"], "format": { "bold": true, "bgColor": "#7C3AED", "fontColor": "#FFFFFF", "textAlign": "center" } },
    { "ids": ["A1"], "format": { "bold": true, "fontSize": 16, "fontColor": "#7C3AED" } },
    { "ids": ["A9"], "format": { "bold": true, "fontSize": 14 } },
    { "ids": ["A10","A11","A12","A13"], "format": { "bold": true } },
    { "ids": ["B10"], "format": { "bold": true, "bgColor": "#D1FAE5", "fontColor": "#059669" } },
    { "ids": ["B11"], "format": { "bold": true, "bgColor": "#FEF3C7" } }
  ]
},
// Sleep Tracker spec
{
  "tool": "create_sleep_tracker",
  "label": "sleep tracker",
  "cells": {
    "A1": { "value": "Sleep Tracker" },
    "A3": { "value": "Date" },
    "B3": { "value": "Bedtime" },
    "C3": { "value": "Wake Time" },
    "D3": { "value": "Hours Slept" },
    "E3": { "value": "Quality (1-5)" },
    "F3": { "value": "Notes" },
    "A4": { "value": "2024-02-05" },
    "B4": { "value": "10:30 PM" },
    "C4": { "value": "6:15 AM" },
    "D4": { "value": 7.75 },
    "E4": { "value": 4 },
    "F4": { "value": "Fell asleep quickly" },
    "A5": { "value": "2024-02-06" },
    "B5": { "value": "11:45 PM" },
    "C5": { "value": "6:30 AM" },
    "D5": { "value": 6.75 },
    "E5": { "value": 3 },
    "F5": { "value": "Woke up once at 3AM" },
    "A6": { "value": "2024-02-07" },
    "B6": { "value": "10:00 PM" },
    "C6": { "value": "6:00 AM" },
    "D6": { "value": 8 },
    "E6": { "value": 5 },
    "F6": { "value": "Best night this week" },
    "A7": { "value": "2024-02-08" },
    "B7": { "value": "12:15 AM" },
    "C7": { "value": "7:00 AM" },
    "D7": { "value": 6.75 },
    "E7": { "value": 2 },
    "F7": { "value": "Screen time before bed" },
    "A9": { "value": "Weekly Stats" },
    "A10": { "value": "Avg Hours" },
    "B10": { "value": null, "formula": "=AVERAGE(D4:D7)" },
    "A11": { "value": "Avg Quality" },
    "B11": { "value": null, "formula": "=AVERAGE(E4:E7)" },
    "A12": { "value": "Best Night" },
    "B12": { "value": null, "formula": "=MAX(D4:D7)" },
    "A13": { "value": "Worst Night" },
    "B13": { "value": null, "formula": "=MIN(D4:D7)" },
    "A14": { "value": "Sleep Goal (hrs)" },
    "B14": { "value": 8 },
    "A15": { "value": "Goal Met Days" },
    "B15": { "value": null, "formula": "=COUNTIF(D4:D7,\">=\"&B14)" }
  },
  "formats": [
    { "ids": ["A3","B3","C3","D3","E3","F3"], "format": { "bold": true, "bgColor": "#7C3AED", "fontColor": "#FFFFFF", "textAlign": "center" } },
    { "ids": ["A1"], "format": { "bold": true, "fontSize": 16, "fontColor": "#7C3AED" } },
    { "ids": ["A9"], "format": { "bold": true, "fontSize": 14 } },
    { "ids": ["A10","A11","A12","A13","A14","A15"], "format": { "bold": true } },
    { "ids": ["B10"], "format": { "bold": true, "bgColor": "#EDE9FE" } },
    { "ids": ["B12"], "format": { "bold": true, "bgColor": "#D1FAE5", "fontColor": "#059669" } }
  ]
},
// Weight Loss Progress Calculator spec
{
  "tool": "create_weight_loss_calculator",
  "label": "weight loss progress calculator",
  "cells": {
    "A1": { "value": "Weight Loss Progress Calculator" },
    "A3": { "value": "Week" },
    "B3": { "value": "Date" },
    "C3": { "value": "Weight (lbs)" },
    "D3": { "value": "Calories/Day" },
    "E3": { "value": "Weekly Loss" },
    "F3": { "value": "Total Lost" },
    "G3": { "value": "BMI" },
    "A4": { "value": 1 },
    "B4": { "value": "2024-01-01" },
    "C4": { "value": 195 },
    "D4": { "value": 1800 },
    "E4": { "value": "" },
    "F4": { "value": "" },
    "G4": { "value": null, "formula": "=(C4*703)/(70*70)" },
    "A5": { "value": 2 },
    "B5": { "value": "2024-01-08" },
    "C5": { "value": 193 },
    "D5": { "value": 1750 },
    "E5": { "value": null, "formula": "=C4-C5" },
    "F5": { "value": null, "formula": "=$C$4-C5" },
    "G5": { "value": null, "formula": "=(C5*703)/(70*70)" },
    "A6": { "value": 3 },
    "B6": { "value": "2024-01-15" },
    "C6": { "value": 191.5 },
    "D6": { "value": 1750 },
    "E6": { "value": null, "formula": "=C5-C6" },
    "F6": { "value": null, "formula": "=$C$4-C6" },
    "G6": { "value": null, "formula": "=(C6*703)/(70*70)" },
    "A7": { "value": 4 },
    "B7": { "value": "2024-01-22" },
    "C7": { "value": 189.5 },
    "D7": { "value": 1700 },
    "E7": { "value": null, "formula": "=C6-C7" },
    "F7": { "value": null, "formula": "=$C$4-C7" },
    "G7": { "value": null, "formula": "=(C7*703)/(70*70)" },
    "A9": { "value": "Progress Summary" },
    "A10": { "value": "Start Weight" },
    "B10": { "value": null, "formula": "=C4" },
    "A11": { "value": "Current Weight" },
    "B11": { "value": null, "formula": "=C7" },
    "A12": { "value": "Goal Weight" },
    "B12": { "value": 175 },
    "A13": { "value": "Total Lost" },
    "B13": { "value": null, "formula": "=C4-C7" },
    "A14": { "value": "Remaining" },
    "B14": { "value": null, "formula": "=C7-B12" },
    "A15": { "value": "Avg Loss/Week" },
    "B15": { "value": null, "formula": "=(C4-C7)/3" },
    "A16": { "value": "Est. Weeks to Goal" },
    "B16": { "value": null, "formula": "=B14/B15" }
  },
  "formats": [
    { "ids": ["A3","B3","C3","D3","E3","F3","G3"], "format": { "bold": true, "bgColor": "#7C3AED", "fontColor": "#FFFFFF", "textAlign": "center" } },
    { "ids": ["A1"], "format": { "bold": true, "fontSize": 16, "fontColor": "#7C3AED" } },
    { "ids": ["A9"], "format": { "bold": true, "fontSize": 14 } },
    { "ids": ["A10","A11","A12","A13","A14","A15","A16"], "format": { "bold": true } },
    { "ids": ["B13"], "format": { "bold": true, "bgColor": "#D1FAE5", "fontColor": "#059669" } },
    { "ids": ["B16"], "format": { "bold": true, "bgColor": "#EDE9FE" } }
  ]
}
];
