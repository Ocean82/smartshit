// GENERATED from the legacy template switch (see registry.test.ts for the
// equivalence proof). Category: Education. Edit as data — no logic here.
import type { TemplateSpec } from './types';

export const educationTemplates: TemplateSpec[] = [
{
  "tool": "create_gpa_calculator",
  "label": "gpa calculator",
  "cells": {
    "A1": {
      "value": "GPA Calculator"
    },
    "A3": {
      "value": "Course"
    },
    "B3": {
      "value": "Credits"
    },
    "C3": {
      "value": "Grade Points"
    },
    "D3": {
      "value": "Quality Points"
    },
    "A4": {
      "value": "English 101"
    },
    "B4": {
      "value": 3
    },
    "C4": {
      "value": 4
    },
    "D4": {
      "value": null,
      "formula": "=B4*C4"
    },
    "A5": {
      "value": "Math 201"
    },
    "B5": {
      "value": 4
    },
    "C5": {
      "value": 3
    },
    "D5": {
      "value": null,
      "formula": "=B5*C5"
    },
    "A6": {
      "value": "History 110"
    },
    "B6": {
      "value": 3
    },
    "C6": {
      "value": 3.5
    },
    "D6": {
      "value": null,
      "formula": "=B6*C6"
    },
    "A7": {
      "value": "Biology 101"
    },
    "B7": {
      "value": 4
    },
    "C7": {
      "value": 2.7
    },
    "D7": {
      "value": null,
      "formula": "=B7*C7"
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
    "A10": {
      "value": "SEMESTER GPA"
    },
    "C10": {
      "value": null,
      "formula": "=D9/B9"
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
        "bgColor": "#4338CA",
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
        "fontColor": "#4338CA"
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
        "A10"
      ],
      "format": {
        "bold": true,
        "fontSize": 14
      }
    },
    {
      "ids": [
        "C10"
      ],
      "format": {
        "bold": true,
        "fontSize": 14,
        "bgColor": "#E0E7FF"
      }
    }
  ]
},
{
  "tool": "create_class_schedule",
  "label": "class schedule",
  "cells": {
    "A1": {
      "value": "Class Schedule"
    },
    "A2": {
      "value": "Semester: __________"
    },
    "A3": {
      "value": "Time"
    },
    "B3": {
      "value": "Monday"
    },
    "C3": {
      "value": "Tuesday"
    },
    "D3": {
      "value": "Wednesday"
    },
    "E3": {
      "value": "Thursday"
    },
    "F3": {
      "value": "Friday"
    },
    "A4": {
      "value": "8:00 AM"
    },
    "B4": {
      "value": "English 101"
    },
    "D4": {
      "value": "English 101"
    },
    "F4": {
      "value": "English 101"
    },
    "A5": {
      "value": "10:00 AM"
    },
    "C5": {
      "value": "Math 201"
    },
    "E5": {
      "value": "Math 201"
    },
    "A6": {
      "value": "1:00 PM"
    },
    "B6": {
      "value": "History 110"
    },
    "D6": {
      "value": "History 110"
    },
    "A7": {
      "value": "3:00 PM"
    },
    "C7": {
      "value": "Biology 101"
    },
    "E7": {
      "value": "Biology 101"
    },
    "A9": {
      "value": "Total Credits"
    },
    "B9": {
      "value": 14
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
        "bgColor": "#4338CA",
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
        "fontColor": "#4338CA"
      }
    }
  ]
},
{
  "tool": "create_student_gradebook",
  "label": "student gradebook",
  "cells": {
    "A1": {
      "value": "Student Gradebook"
    },
    "A3": {
      "value": "Student"
    },
    "B3": {
      "value": "Homework"
    },
    "C3": {
      "value": "Midterm"
    },
    "D3": {
      "value": "Final"
    },
    "E3": {
      "value": "Weighted Avg"
    },
    "F3": {
      "value": "Letter Grade"
    },
    "A4": {
      "value": "Alice"
    },
    "B4": {
      "value": 92
    },
    "C4": {
      "value": 85
    },
    "D4": {
      "value": 88
    },
    "E4": {
      "value": null,
      "formula": "=B4*0.3+C4*0.3+D4*0.4"
    },
    "A5": {
      "value": "Bob"
    },
    "B5": {
      "value": 78
    },
    "C5": {
      "value": 82
    },
    "D5": {
      "value": 75
    },
    "E5": {
      "value": null,
      "formula": "=B5*0.3+C5*0.3+D5*0.4"
    },
    "A6": {
      "value": "Carol"
    },
    "B6": {
      "value": 95
    },
    "C6": {
      "value": 91
    },
    "D6": {
      "value": 94
    },
    "E6": {
      "value": null,
      "formula": "=B6*0.3+C6*0.3+D6*0.4"
    },
    "A7": {
      "value": "David"
    },
    "B7": {
      "value": 65
    },
    "C7": {
      "value": 70
    },
    "D7": {
      "value": 68
    },
    "E7": {
      "value": null,
      "formula": "=B7*0.3+C7*0.3+D7*0.4"
    },
    "A9": {
      "value": "Class Average"
    },
    "E9": {
      "value": null,
      "formula": "=AVERAGE(E4:E7)"
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
        "bgColor": "#4338CA",
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
        "fontColor": "#4338CA"
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
        "bgColor": "#E0E7FF"
      }
    }
  ]
},
{
  "tool": "create_assignment_tracker",
  "label": "assignment tracker",
  "cells": {
    "A1": {
      "value": "Assignment Tracker"
    },
    "A3": {
      "value": "Assignment"
    },
    "B3": {
      "value": "Course"
    },
    "C3": {
      "value": "Due Date"
    },
    "D3": {
      "value": "Status"
    },
    "E3": {
      "value": "Grade"
    },
    "F3": {
      "value": "Weight"
    },
    "A4": {
      "value": "Essay 1"
    },
    "B4": {
      "value": "English 101"
    },
    "C4": {
      "value": "2024-02-01"
    },
    "D4": {
      "value": "Done"
    },
    "E4": {
      "value": 92
    },
    "F4": {
      "value": 0.15
    },
    "A5": {
      "value": "Problem Set 3"
    },
    "B5": {
      "value": "Math 201"
    },
    "C5": {
      "value": "2024-02-05"
    },
    "D5": {
      "value": "In Progress"
    },
    "F5": {
      "value": 0.1
    },
    "A6": {
      "value": "Research Paper"
    },
    "B6": {
      "value": "History 110"
    },
    "C6": {
      "value": "2024-02-15"
    },
    "D6": {
      "value": "Not Started"
    },
    "F6": {
      "value": 0.25
    },
    "A7": {
      "value": "Lab Report 2"
    },
    "B7": {
      "value": "Biology 101"
    },
    "C7": {
      "value": "2024-02-08"
    },
    "D7": {
      "value": "Done"
    },
    "E7": {
      "value": 88
    },
    "F7": {
      "value": 0.15
    },
    "A8": {
      "value": "Midterm"
    },
    "B8": {
      "value": "English 101"
    },
    "C8": {
      "value": "2024-03-01"
    },
    "D8": {
      "value": "Not Started"
    },
    "F8": {
      "value": 0.25
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
        "bgColor": "#4338CA",
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
        "fontColor": "#4338CA"
      }
    }
  ]
},
{
  "tool": "create_scholarship_tracker",
  "label": "scholarship tracker",
  "cells": {
    "A1": {
      "value": "Scholarship Tracker"
    },
    "A3": {
      "value": "Scholarship"
    },
    "B3": {
      "value": "Amount"
    },
    "C3": {
      "value": "Deadline"
    },
    "D3": {
      "value": "Requirements"
    },
    "E3": {
      "value": "Status"
    },
    "F3": {
      "value": "Applied"
    },
    "A4": {
      "value": "Academic Excellence"
    },
    "B4": {
      "value": 5000
    },
    "C4": {
      "value": "2024-03-01"
    },
    "D4": {
      "value": "GPA 3.5+"
    },
    "E4": {
      "value": "Eligible"
    },
    "F4": {
      "value": "No"
    },
    "A5": {
      "value": "Community Service"
    },
    "B5": {
      "value": 2500
    },
    "C5": {
      "value": "2024-02-15"
    },
    "D5": {
      "value": "50+ hrs service"
    },
    "E5": {
      "value": "Eligible"
    },
    "F5": {
      "value": "Yes"
    },
    "A6": {
      "value": "STEM Grant"
    },
    "B6": {
      "value": 10000
    },
    "C6": {
      "value": "2024-04-01"
    },
    "D6": {
      "value": "STEM major"
    },
    "E6": {
      "value": "Eligible"
    },
    "F6": {
      "value": "No"
    },
    "A7": {
      "value": "Need-Based Aid"
    },
    "B7": {
      "value": 3000
    },
    "C7": {
      "value": "2024-03-15"
    },
    "D7": {
      "value": "Financial need"
    },
    "E7": {
      "value": "Pending Review"
    },
    "F7": {
      "value": "Yes"
    },
    "A9": {
      "value": "TOTAL POTENTIAL"
    },
    "B9": {
      "value": null,
      "formula": "=SUM(B4:B7)"
    },
    "A10": {
      "value": "TOTAL APPLIED"
    },
    "B10": {
      "value": null,
      "formula": "=SUMIF(F4:F7,\"Yes\",B4:B7)"
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
        "bgColor": "#4338CA",
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
        "fontColor": "#4338CA"
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
        "B9"
      ],
      "format": {
        "bold": true,
        "bgColor": "#E0E7FF"
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
        "B10"
      ],
      "format": {
        "bold": true,
        "bgColor": "#E0E7FF"
      }
    }
  ]
},
{
  "tool": "create_student_loan_calculator",
  "label": "student loan payoff calculator",
  "cells": {
    "A1": { "value": "Student Loan Payoff Calculator" },
    "A3": { "value": "Loan Name" },
    "B3": { "value": "Principal" },
    "C3": { "value": "Interest Rate" },
    "D3": { "value": "Monthly Payment" },
    "E3": { "value": "Months Left" },
    "F3": { "value": "Total Interest" },
    "A4": { "value": "Federal Subsidized" },
    "B4": { "value": 25000 },
    "C4": { "value": 0.045 },
    "D4": { "value": 280 },
    "E4": { "value": null, "formula": "=ROUND(B4/D4,0)" },
    "F4": { "value": null, "formula": "=ROUND((D4*E4)-B4,2)" },
    "A5": { "value": "Federal Unsubsidized" },
    "B5": { "value": 18000 },
    "C5": { "value": 0.053 },
    "D5": { "value": 210 },
    "E5": { "value": null, "formula": "=ROUND(B5/D5,0)" },
    "F5": { "value": null, "formula": "=ROUND((D5*E5)-B5,2)" },
    "A6": { "value": "Private Loan" },
    "B6": { "value": 15000 },
    "C6": { "value": 0.072 },
    "D6": { "value": 185 },
    "E6": { "value": null, "formula": "=ROUND(B6/D6,0)" },
    "F6": { "value": null, "formula": "=ROUND((D6*E6)-B6,2)" },
    "A7": { "value": "Parent PLUS" },
    "B7": { "value": 32000 },
    "C7": { "value": 0.06 },
    "D7": { "value": 350 },
    "E7": { "value": null, "formula": "=ROUND(B7/D7,0)" },
    "F7": { "value": null, "formula": "=ROUND((D7*E7)-B7,2)" },
    "A9": { "value": "TOTAL DEBT" },
    "B9": { "value": null, "formula": "=SUM(B4:B7)" },
    "A10": { "value": "TOTAL MONTHLY" },
    "D10": { "value": null, "formula": "=SUM(D4:D7)" },
    "A11": { "value": "TOTAL INTEREST" },
    "F11": { "value": null, "formula": "=SUM(F4:F7)" }
  },
  "formats": [
    { "ids": ["A3","B3","C3","D3","E3","F3"], "format": { "bold": true, "bgColor": "#7C3AED", "fontColor": "#FFFFFF", "textAlign": "center" } },
    { "ids": ["A1"], "format": { "bold": true, "fontSize": 16, "fontColor": "#7C3AED" } },
    { "ids": ["A9","A10","A11"], "format": { "bold": true } },
    { "ids": ["B9","D10","F11"], "format": { "bold": true, "bgColor": "#EDE9FE" } }
  ]
},
{
  "tool": "create_college_cost_comparison",
  "label": "college cost comparison",
  "cells": {
    "A1": { "value": "College Cost Comparison" },
    "A3": { "value": "College" },
    "B3": { "value": "Tuition" },
    "C3": { "value": "Room & Board" },
    "D3": { "value": "Fees" },
    "E3": { "value": "Financial Aid" },
    "F3": { "value": "Net Annual Cost" },
    "A4": { "value": "State University" },
    "B4": { "value": 12500 },
    "C4": { "value": 9800 },
    "D4": { "value": 1500 },
    "E4": { "value": 6000 },
    "F4": { "value": null, "formula": "=B4+C4+D4-E4" },
    "A5": { "value": "Private College" },
    "B5": { "value": 42000 },
    "C5": { "value": 14200 },
    "D5": { "value": 2800 },
    "E5": { "value": 28000 },
    "F5": { "value": null, "formula": "=B5+C5+D5-E5" },
    "A6": { "value": "Community College" },
    "B6": { "value": 4200 },
    "C6": { "value": 0 },
    "D6": { "value": 800 },
    "E6": { "value": 2000 },
    "F6": { "value": null, "formula": "=B6+C6+D6-E6" },
    "A7": { "value": "Out-of-State Public" },
    "B7": { "value": 28000 },
    "C7": { "value": 11500 },
    "D7": { "value": 2100 },
    "E7": { "value": 8000 },
    "F7": { "value": null, "formula": "=B7+C7+D7-E7" },
    "A9": { "value": "4-YEAR TOTAL (cheapest)" },
    "F9": { "value": null, "formula": "=MIN(F4:F7)*4" }
  },
  "formats": [
    { "ids": ["A3","B3","C3","D3","E3","F3"], "format": { "bold": true, "bgColor": "#7C3AED", "fontColor": "#FFFFFF", "textAlign": "center" } },
    { "ids": ["A1"], "format": { "bold": true, "fontSize": 16, "fontColor": "#7C3AED" } },
    { "ids": ["A9"], "format": { "bold": true } },
    { "ids": ["F9"], "format": { "bold": true, "bgColor": "#EDE9FE" } }
  ]
},
{
  "tool": "create_gpa_what_if",
  "label": "GPA what-if planner",
  "cells": {
    "A1": { "value": "GPA What-If Planner" },
    "A3": { "value": "Scenario" },
    "B3": { "value": "Course" },
    "C3": { "value": "Credits" },
    "D3": { "value": "Expected Grade" },
    "E3": { "value": "Quality Points" },
    "A4": { "value": "Best Case" },
    "B4": { "value": "Organic Chemistry" },
    "C4": { "value": 4 },
    "D4": { "value": 4.0 },
    "E4": { "value": null, "formula": "=C4*D4" },
    "A5": { "value": "Best Case" },
    "B5": { "value": "Statistics" },
    "C5": { "value": 3 },
    "D5": { "value": 3.7 },
    "E5": { "value": null, "formula": "=C5*D5" },
    "A6": { "value": "Likely Case" },
    "B6": { "value": "Organic Chemistry" },
    "C6": { "value": 4 },
    "D6": { "value": 3.3 },
    "E6": { "value": null, "formula": "=C6*D6" },
    "A7": { "value": "Likely Case" },
    "B7": { "value": "Statistics" },
    "C7": { "value": 3 },
    "D7": { "value": 3.0 },
    "E7": { "value": null, "formula": "=C7*D7" },
    "A8": { "value": "Worst Case" },
    "B8": { "value": "Organic Chemistry" },
    "C8": { "value": 4 },
    "D8": { "value": 2.0 },
    "E8": { "value": null, "formula": "=C8*D8" },
    "A9": { "value": "Worst Case" },
    "B9": { "value": "Statistics" },
    "C9": { "value": 3 },
    "D9": { "value": 2.3 },
    "E9": { "value": null, "formula": "=C9*D9" },
    "A11": { "value": "Current GPA" },
    "B11": { "value": 3.45 },
    "C11": { "value": "Credits Earned" },
    "D11": { "value": 60 },
    "A12": { "value": "Best Semester GPA" },
    "B12": { "value": null, "formula": "=(E4+E5)/(C4+C5)" },
    "A13": { "value": "Likely Semester GPA" },
    "B13": { "value": null, "formula": "=(E6+E7)/(C6+C7)" },
    "A14": { "value": "Worst Semester GPA" },
    "B14": { "value": null, "formula": "=(E8+E9)/(C8+C9)" }
  },
  "formats": [
    { "ids": ["A3","B3","C3","D3","E3"], "format": { "bold": true, "bgColor": "#7C3AED", "fontColor": "#FFFFFF", "textAlign": "center" } },
    { "ids": ["A1"], "format": { "bold": true, "fontSize": 16, "fontColor": "#7C3AED" } },
    { "ids": ["A11","A12","A13","A14"], "format": { "bold": true } },
    { "ids": ["B12","B13","B14"], "format": { "bold": true, "bgColor": "#EDE9FE" } }
  ]
},
{
  "tool": "create_teacher_gradebook",
  "label": "teacher grade book",
  "cells": {
    "A1": { "value": "Teacher Grade Book" },
    "A2": { "value": "Course: Algebra II — Period 3" },
    "A3": { "value": "Student" },
    "B3": { "value": "Quiz 1" },
    "C3": { "value": "Quiz 2" },
    "D3": { "value": "Homework Avg" },
    "E3": { "value": "Midterm" },
    "F3": { "value": "Final Grade" },
    "A4": { "value": "Martinez, Sofia" },
    "B4": { "value": 88 },
    "C4": { "value": 92 },
    "D4": { "value": 95 },
    "E4": { "value": 87 },
    "F4": { "value": null, "formula": "=(B4+C4)*0.2+D4*0.3+E4*0.3" },
    "A5": { "value": "Chen, Kevin" },
    "B5": { "value": 76 },
    "C5": { "value": 81 },
    "D5": { "value": 72 },
    "E5": { "value": 79 },
    "F5": { "value": null, "formula": "=(B5+C5)*0.2+D5*0.3+E5*0.3" },
    "A6": { "value": "Patel, Anya" },
    "B6": { "value": 95 },
    "C6": { "value": 98 },
    "D6": { "value": 97 },
    "E6": { "value": 94 },
    "F6": { "value": null, "formula": "=(B6+C6)*0.2+D6*0.3+E6*0.3" },
    "A7": { "value": "Johnson, Tyler" },
    "B7": { "value": 62 },
    "C7": { "value": 58 },
    "D7": { "value": 65 },
    "E7": { "value": 60 },
    "F7": { "value": null, "formula": "=(B7+C7)*0.2+D7*0.3+E7*0.3" },
    "A9": { "value": "Class Average" },
    "F9": { "value": null, "formula": "=AVERAGE(F4:F7)" },
    "A10": { "value": "Highest Grade" },
    "F10": { "value": null, "formula": "=MAX(F4:F7)" },
    "A11": { "value": "Lowest Grade" },
    "F11": { "value": null, "formula": "=MIN(F4:F7)" }
  },
  "formats": [
    { "ids": ["A3","B3","C3","D3","E3","F3"], "format": { "bold": true, "bgColor": "#7C3AED", "fontColor": "#FFFFFF", "textAlign": "center" } },
    { "ids": ["A1"], "format": { "bold": true, "fontSize": 16, "fontColor": "#7C3AED" } },
    { "ids": ["A2"], "format": { "bold": false, "fontColor": "#6B7280" } },
    { "ids": ["A9","A10","A11"], "format": { "bold": true } },
    { "ids": ["F9"], "format": { "bold": true, "bgColor": "#EDE9FE" } }
  ]
},
{
  "tool": "create_homeschool_curriculum",
  "label": "homeschool curriculum planner",
  "cells": {
    "A1": { "value": "Homeschool Curriculum Planner" },
    "A3": { "value": "Subject" },
    "B3": { "value": "Curriculum" },
    "C3": { "value": "Grade Level" },
    "D3": { "value": "Hours/Week" },
    "E3": { "value": "Cost" },
    "F3": { "value": "Status" },
    "A4": { "value": "Mathematics" },
    "B4": { "value": "Saxon Math 7/6" },
    "C4": { "value": "6th" },
    "D4": { "value": 5 },
    "E4": { "value": 85 },
    "F4": { "value": "In Progress" },
    "A5": { "value": "Language Arts" },
    "B5": { "value": "IEW Writing" },
    "C5": { "value": "6th" },
    "D5": { "value": 4 },
    "E5": { "value": 120 },
    "F5": { "value": "In Progress" },
    "A6": { "value": "Science" },
    "B6": { "value": "Apologia General" },
    "C6": { "value": "6th" },
    "D6": { "value": 3 },
    "E6": { "value": 75 },
    "F6": { "value": "Not Started" },
    "A7": { "value": "History" },
    "B7": { "value": "Story of the World 3" },
    "C7": { "value": "6th" },
    "D7": { "value": 3 },
    "E7": { "value": 45 },
    "F7": { "value": "Complete" },
    "A8": { "value": "Art" },
    "B8": { "value": "ArtAchieve Online" },
    "C8": { "value": "6th" },
    "D8": { "value": 2 },
    "E8": { "value": 65 },
    "F8": { "value": "In Progress" },
    "A10": { "value": "TOTAL HOURS/WEEK" },
    "D10": { "value": null, "formula": "=SUM(D4:D8)" },
    "A11": { "value": "TOTAL CURRICULUM COST" },
    "E11": { "value": null, "formula": "=SUM(E4:E8)" }
  },
  "formats": [
    { "ids": ["A3","B3","C3","D3","E3","F3"], "format": { "bold": true, "bgColor": "#7C3AED", "fontColor": "#FFFFFF", "textAlign": "center" } },
    { "ids": ["A1"], "format": { "bold": true, "fontSize": 16, "fontColor": "#7C3AED" } },
    { "ids": ["A10","A11"], "format": { "bold": true } },
    { "ids": ["D10","E11"], "format": { "bold": true, "bgColor": "#EDE9FE" } }
  ]
},
{
  "tool": "create_study_schedule",
  "label": "study schedule builder",
  "cells": {
    "A1": { "value": "Study Schedule Builder" },
    "A3": { "value": "Time Block" },
    "B3": { "value": "Monday" },
    "C3": { "value": "Tuesday" },
    "D3": { "value": "Wednesday" },
    "E3": { "value": "Thursday" },
    "F3": { "value": "Friday" },
    "A4": { "value": "6:00–7:30 AM" },
    "B4": { "value": "Calculus Review" },
    "D4": { "value": "Calculus Review" },
    "F4": { "value": "Calculus Review" },
    "A5": { "value": "4:00–5:30 PM" },
    "B5": { "value": "Chemistry Lab Prep" },
    "C5": { "value": "English Essay" },
    "D5": { "value": "Chemistry Lab Prep" },
    "E5": { "value": "English Essay" },
    "A6": { "value": "7:00–8:30 PM" },
    "B6": { "value": "Physics Problems" },
    "C6": { "value": "History Reading" },
    "D6": { "value": "Physics Problems" },
    "E6": { "value": "History Reading" },
    "F6": { "value": "Exam Review" },
    "A7": { "value": "9:00–10:00 PM" },
    "B7": { "value": "Flashcards" },
    "C7": { "value": "Flashcards" },
    "D7": { "value": "Flashcards" },
    "E7": { "value": "Flashcards" },
    "A9": { "value": "Total Study Blocks/Week" },
    "B9": { "value": 16 },
    "A10": { "value": "Hours/Week" },
    "B10": { "value": 24 }
  },
  "formats": [
    { "ids": ["A3","B3","C3","D3","E3","F3"], "format": { "bold": true, "bgColor": "#7C3AED", "fontColor": "#FFFFFF", "textAlign": "center" } },
    { "ids": ["A1"], "format": { "bold": true, "fontSize": 16, "fontColor": "#7C3AED" } },
    { "ids": ["A9","A10"], "format": { "bold": true } },
    { "ids": ["B9","B10"], "format": { "bold": true, "bgColor": "#EDE9FE" } }
  ]
},
{
  "tool": "create_tuition_savings",
  "label": "tuition savings planner",
  "cells": {
    "A1": { "value": "Tuition Savings Planner" },
    "A3": { "value": "Year" },
    "B3": { "value": "Annual Contribution" },
    "C3": { "value": "Interest Rate" },
    "D3": { "value": "Interest Earned" },
    "E3": { "value": "Balance" },
    "A4": { "value": "Year 1" },
    "B4": { "value": 3000 },
    "C4": { "value": 0.05 },
    "D4": { "value": null, "formula": "=B4*C4" },
    "E4": { "value": null, "formula": "=B4+D4" },
    "A5": { "value": "Year 2" },
    "B5": { "value": 3000 },
    "C5": { "value": 0.05 },
    "D5": { "value": null, "formula": "=(E4+B5)*C5" },
    "E5": { "value": null, "formula": "=E4+B5+D5" },
    "A6": { "value": "Year 3" },
    "B6": { "value": 3500 },
    "C6": { "value": 0.05 },
    "D6": { "value": null, "formula": "=(E5+B6)*C6" },
    "E6": { "value": null, "formula": "=E5+B6+D6" },
    "A7": { "value": "Year 4" },
    "B7": { "value": 3500 },
    "C7": { "value": 0.05 },
    "D7": { "value": null, "formula": "=(E6+B7)*C7" },
    "E7": { "value": null, "formula": "=E6+B7+D7" },
    "A9": { "value": "TOTAL CONTRIBUTIONS" },
    "B9": { "value": null, "formula": "=SUM(B4:B7)" },
    "A10": { "value": "TOTAL INTEREST" },
    "D10": { "value": null, "formula": "=SUM(D4:D7)" },
    "A11": { "value": "PROJECTED BALANCE" },
    "E11": { "value": null, "formula": "=E7" }
  },
  "formats": [
    { "ids": ["A3","B3","C3","D3","E3"], "format": { "bold": true, "bgColor": "#7C3AED", "fontColor": "#FFFFFF", "textAlign": "center" } },
    { "ids": ["A1"], "format": { "bold": true, "fontSize": 16, "fontColor": "#7C3AED" } },
    { "ids": ["A9","A10","A11"], "format": { "bold": true } },
    { "ids": ["B9","D10","E11"], "format": { "bold": true, "bgColor": "#EDE9FE" } }
  ]
},
{
  "tool": "create_course_registration",
  "label": "course registration planner",
  "cells": {
    "A1": { "value": "Course Registration Planner" },
    "A3": { "value": "Course" },
    "B3": { "value": "Section" },
    "C3": { "value": "Credits" },
    "D3": { "value": "Day/Time" },
    "E3": { "value": "Instructor" },
    "F3": { "value": "Prerequisite Met" },
    "A4": { "value": "CHEM 301" },
    "B4": { "value": "001" },
    "C4": { "value": 4 },
    "D4": { "value": "MWF 9:00 AM" },
    "E4": { "value": "Dr. Nguyen" },
    "F4": { "value": "Yes" },
    "A5": { "value": "MATH 310" },
    "B5": { "value": "002" },
    "C5": { "value": 3 },
    "D5": { "value": "TTh 11:00 AM" },
    "E5": { "value": "Prof. Adams" },
    "F5": { "value": "Yes" },
    "A6": { "value": "ENGL 205" },
    "B6": { "value": "001" },
    "C6": { "value": 3 },
    "D6": { "value": "MWF 1:00 PM" },
    "E6": { "value": "Dr. Liu" },
    "F6": { "value": "Yes" },
    "A7": { "value": "PHYS 201" },
    "B7": { "value": "003" },
    "C7": { "value": 4 },
    "D7": { "value": "TTh 2:00 PM" },
    "E7": { "value": "Prof. Baker" },
    "F7": { "value": "No" },
    "A8": { "value": "ART 110" },
    "B8": { "value": "001" },
    "C8": { "value": 3 },
    "D8": { "value": "W 6:00 PM" },
    "E8": { "value": "Ms. Rivera" },
    "F8": { "value": "Yes" },
    "A10": { "value": "TOTAL CREDITS" },
    "C10": { "value": null, "formula": "=SUM(C4:C8)" },
    "A11": { "value": "MAX ALLOWED" },
    "C11": { "value": 18 }
  },
  "formats": [
    { "ids": ["A3","B3","C3","D3","E3","F3"], "format": { "bold": true, "bgColor": "#7C3AED", "fontColor": "#FFFFFF", "textAlign": "center" } },
    { "ids": ["A1"], "format": { "bold": true, "fontSize": 16, "fontColor": "#7C3AED" } },
    { "ids": ["A10","A11"], "format": { "bold": true } },
    { "ids": ["C10"], "format": { "bold": true, "bgColor": "#EDE9FE" } }
  ]
}
];
