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
}
];
