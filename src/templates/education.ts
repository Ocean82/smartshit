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
}
];
