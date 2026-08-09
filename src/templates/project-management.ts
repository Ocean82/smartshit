// Category: Project Management. Edit as data — no logic here.
import type { TemplateSpec } from './types';

export const projectManagementTemplates: TemplateSpec[] = [
{
  "tool": "create_project_timeline",
  "label": "project timeline",
  "cells": {
    "A1": { "value": "Project Timeline / Gantt" },
    "A3": { "value": "Task" },
    "B3": { "value": "Owner" },
    "C3": { "value": "Start Date" },
    "D3": { "value": "End Date" },
    "E3": { "value": "Duration (days)" },
    "F3": { "value": "Status" },
    "G3": { "value": "Dependencies" },
    "A4": { "value": "Requirements Gathering" },
    "B4": { "value": "Alice Nguyen" },
    "C4": { "value": "2024-07-01" },
    "D4": { "value": "2024-07-12" },
    "E4": { "value": 10 },
    "F4": { "value": "Complete" },
    "G4": { "value": "—" },
    "A5": { "value": "UI/UX Design" },
    "B5": { "value": "Carlos Ruiz" },
    "C5": { "value": "2024-07-15" },
    "D5": { "value": "2024-07-26" },
    "E5": { "value": 10 },
    "F5": { "value": "In Progress" },
    "G5": { "value": "Requirements Gathering" },
    "A6": { "value": "Backend Development" },
    "B6": { "value": "Mei Chen" },
    "C6": { "value": "2024-07-22" },
    "D6": { "value": "2024-08-16" },
    "E6": { "value": 20 },
    "F6": { "value": "Not Started" },
    "G6": { "value": "UI/UX Design" },
    "A7": { "value": "Frontend Integration" },
    "B7": { "value": "David Park" },
    "C7": { "value": "2024-08-05" },
    "D7": { "value": "2024-08-23" },
    "E7": { "value": 15 },
    "F7": { "value": "Not Started" },
    "G7": { "value": "UI/UX Design, Backend Development" },
    "A8": { "value": "QA Testing" },
    "B8": { "value": "Fatima Ali" },
    "C8": { "value": "2024-08-19" },
    "D8": { "value": "2024-08-30" },
    "E8": { "value": 10 },
    "F8": { "value": "Not Started" },
    "G8": { "value": "Frontend Integration" },
    "A10": { "value": "TOTAL PROJECT DAYS" },
    "E10": { "value": null, "formula": "=SUM(E4:E8)" }
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
      "ids": ["A10"],
      "format": { "bold": true }
    },
    {
      "ids": ["E10"],
      "format": { "bold": true, "bgColor": "#EDE9FE" }
    }
  ]
},
{
  "tool": "create_sprint_planning",
  "label": "sprint planning",
  "cells": {
    "A1": { "value": "Sprint Planning" },
    "A2": { "value": "Sprint 14 — Jun 24 to Jul 5, 2024" },
    "A4": { "value": "Story" },
    "B4": { "value": "Assignee" },
    "C4": { "value": "Priority" },
    "D4": { "value": "Story Points" },
    "E4": { "value": "Status" },
    "F4": { "value": "Sprint Goal" },
    "A5": { "value": "Implement user auth flow" },
    "B5": { "value": "Mei Chen" },
    "C5": { "value": "High" },
    "D5": { "value": 8 },
    "E5": { "value": "In Progress" },
    "F5": { "value": "Core Auth" },
    "A6": { "value": "Design settings page" },
    "B6": { "value": "Carlos Ruiz" },
    "C6": { "value": "Medium" },
    "D6": { "value": 5 },
    "E6": { "value": "To Do" },
    "F6": { "value": "Settings MVP" },
    "A7": { "value": "Fix payment webhook retry" },
    "B7": { "value": "David Park" },
    "C7": { "value": "High" },
    "D7": { "value": 3 },
    "E7": { "value": "Done" },
    "F7": { "value": "Core Auth" },
    "A8": { "value": "Add CSV export to reports" },
    "B8": { "value": "Alice Nguyen" },
    "C8": { "value": "Low" },
    "D8": { "value": 2 },
    "E8": { "value": "To Do" },
    "F8": { "value": "QoL" },
    "A9": { "value": "Write API rate-limit tests" },
    "B9": { "value": "Fatima Ali" },
    "C9": { "value": "Medium" },
    "D9": { "value": 3 },
    "E9": { "value": "In Progress" },
    "F9": { "value": "Core Auth" },
    "A11": { "value": "TOTAL POINTS" },
    "D11": { "value": null, "formula": "=SUM(D5:D9)" },
    "A12": { "value": "VELOCITY TARGET" },
    "D12": { "value": 22 }
  },
  "formats": [
    {
      "ids": ["A4", "B4", "C4", "D4", "E4", "F4"],
      "format": { "bold": true, "bgColor": "#7C3AED", "fontColor": "#FFFFFF", "textAlign": "center" }
    },
    {
      "ids": ["A1"],
      "format": { "bold": true, "fontSize": 16, "fontColor": "#7C3AED" }
    },
    {
      "ids": ["A11", "A12"],
      "format": { "bold": true }
    },
    {
      "ids": ["D11"],
      "format": { "bold": true, "bgColor": "#EDE9FE" }
    }
  ]
},
{
  "tool": "create_resource_allocation",
  "label": "resource allocation",
  "cells": {
    "A1": { "value": "Resource Allocation" },
    "A2": { "value": "Q3 2024" },
    "A4": { "value": "Team Member" },
    "B4": { "value": "Role" },
    "C4": { "value": "Project A (%)" },
    "D4": { "value": "Project B (%)" },
    "E4": { "value": "Project C (%)" },
    "F4": { "value": "Admin (%)" },
    "G4": { "value": "Total (%)" },
    "H4": { "value": "Available" },
    "A5": { "value": "Alice Nguyen" },
    "B5": { "value": "Tech Lead" },
    "C5": { "value": 50 },
    "D5": { "value": 20 },
    "E5": { "value": 0 },
    "F5": { "value": 10 },
    "G5": { "value": null, "formula": "=C5+D5+E5+F5" },
    "H5": { "value": null, "formula": "=100-G5" },
    "A6": { "value": "Carlos Ruiz" },
    "B6": { "value": "Designer" },
    "C6": { "value": 30 },
    "D6": { "value": 40 },
    "E6": { "value": 20 },
    "F6": { "value": 5 },
    "G6": { "value": null, "formula": "=C6+D6+E6+F6" },
    "H6": { "value": null, "formula": "=100-G6" },
    "A7": { "value": "Mei Chen" },
    "B7": { "value": "Backend Dev" },
    "C7": { "value": 60 },
    "D7": { "value": 30 },
    "E7": { "value": 0 },
    "F7": { "value": 10 },
    "G7": { "value": null, "formula": "=C7+D7+E7+F7" },
    "H7": { "value": null, "formula": "=100-G7" },
    "A8": { "value": "David Park" },
    "B8": { "value": "Frontend Dev" },
    "C8": { "value": 40 },
    "D8": { "value": 0 },
    "E8": { "value": 50 },
    "F8": { "value": 5 },
    "G8": { "value": null, "formula": "=C8+D8+E8+F8" },
    "H8": { "value": null, "formula": "=100-G8" }
  },
  "formats": [
    {
      "ids": ["A4", "B4", "C4", "D4", "E4", "F4", "G4", "H4"],
      "format": { "bold": true, "bgColor": "#7C3AED", "fontColor": "#FFFFFF", "textAlign": "center" }
    },
    {
      "ids": ["A1"],
      "format": { "bold": true, "fontSize": 16, "fontColor": "#7C3AED" }
    }
  ]
},
{
  "tool": "create_project_budget",
  "label": "project budget",
  "cells": {
    "A1": { "value": "Project Budget" },
    "A2": { "value": "Website Redesign — 2024" },
    "A4": { "value": "Category" },
    "B4": { "value": "Description" },
    "C4": { "value": "Estimated" },
    "D4": { "value": "Actual" },
    "E4": { "value": "Variance" },
    "F4": { "value": "Status" },
    "A5": { "value": "Design" },
    "B5": { "value": "UX research & mockups" },
    "C5": { "value": 15000 },
    "D5": { "value": 14200 },
    "E5": { "value": null, "formula": "=C5-D5" },
    "F5": { "value": "Under Budget" },
    "A6": { "value": "Development" },
    "B6": { "value": "Frontend & backend build" },
    "C6": { "value": 45000 },
    "D6": { "value": 48500 },
    "E6": { "value": null, "formula": "=C6-D6" },
    "F6": { "value": "Over Budget" },
    "A7": { "value": "QA & Testing" },
    "B7": { "value": "Manual + automated testing" },
    "C7": { "value": 8000 },
    "D7": { "value": 7800 },
    "E7": { "value": null, "formula": "=C7-D7" },
    "F7": { "value": "On Track" },
    "A8": { "value": "Infrastructure" },
    "B8": { "value": "Hosting, CDN, CI/CD" },
    "C8": { "value": 6000 },
    "D8": { "value": 5900 },
    "E8": { "value": null, "formula": "=C8-D8" },
    "F8": { "value": "On Track" },
    "A9": { "value": "Contingency" },
    "B9": { "value": "10% buffer" },
    "C9": { "value": 7400 },
    "D9": { "value": 0 },
    "E9": { "value": null, "formula": "=C9-D9" },
    "F9": { "value": "Unspent" },
    "A11": { "value": "TOTALS" },
    "C11": { "value": null, "formula": "=SUM(C5:C9)" },
    "D11": { "value": null, "formula": "=SUM(D5:D9)" },
    "E11": { "value": null, "formula": "=C11-D11" }
  },
  "formats": [
    {
      "ids": ["A4", "B4", "C4", "D4", "E4", "F4"],
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
      "ids": ["C11", "D11", "E11"],
      "format": { "bold": true, "bgColor": "#EDE9FE" }
    }
  ]
},
{
  "tool": "create_risk_register",
  "label": "risk register",
  "cells": {
    "A1": { "value": "Risk Register" },
    "A2": { "value": "Platform Migration Project" },
    "A4": { "value": "Risk ID" },
    "B4": { "value": "Description" },
    "C4": { "value": "Probability" },
    "D4": { "value": "Impact" },
    "E4": { "value": "Score" },
    "F4": { "value": "Mitigation" },
    "G4": { "value": "Owner" },
    "H4": { "value": "Status" },
    "A5": { "value": "R-001" },
    "B5": { "value": "Key developer leaves mid-sprint" },
    "C5": { "value": 3 },
    "D5": { "value": 5 },
    "E5": { "value": null, "formula": "=C5*D5" },
    "F5": { "value": "Cross-train team, maintain docs" },
    "G5": { "value": "Alice Nguyen" },
    "H5": { "value": "Open" },
    "A6": { "value": "R-002" },
    "B6": { "value": "Third-party API deprecation" },
    "C6": { "value": 2 },
    "D6": { "value": 4 },
    "E6": { "value": null, "formula": "=C6*D6" },
    "F6": { "value": "Abstract integration layer" },
    "G6": { "value": "David Park" },
    "H6": { "value": "Mitigating" },
    "A7": { "value": "R-003" },
    "B7": { "value": "Scope creep from stakeholders" },
    "C7": { "value": 4 },
    "D7": { "value": 3 },
    "E7": { "value": null, "formula": "=C7*D7" },
    "F7": { "value": "Strict change-request process" },
    "G7": { "value": "Carlos Ruiz" },
    "H7": { "value": "Open" },
    "A8": { "value": "R-004" },
    "B8": { "value": "Data migration causes downtime" },
    "C8": { "value": 2 },
    "D8": { "value": 5 },
    "E8": { "value": null, "formula": "=C8*D8" },
    "F8": { "value": "Staged rollout with rollback plan" },
    "G8": { "value": "Mei Chen" },
    "H8": { "value": "Mitigating" }
  },
  "formats": [
    {
      "ids": ["A4", "B4", "C4", "D4", "E4", "F4", "G4", "H4"],
      "format": { "bold": true, "bgColor": "#7C3AED", "fontColor": "#FFFFFF", "textAlign": "center" }
    },
    {
      "ids": ["A1"],
      "format": { "bold": true, "fontSize": 16, "fontColor": "#7C3AED" }
    }
  ]
},
{
  "tool": "create_milestone_tracker",
  "label": "milestone tracker",
  "cells": {
    "A1": { "value": "Milestone Tracker" },
    "A2": { "value": "Mobile App Launch — 2024" },
    "A4": { "value": "Milestone" },
    "B4": { "value": "Target Date" },
    "C4": { "value": "Actual Date" },
    "D4": { "value": "Owner" },
    "E4": { "value": "Status" },
    "F4": { "value": "Notes" },
    "A5": { "value": "Project Kickoff" },
    "B5": { "value": "2024-04-01" },
    "C5": { "value": "2024-04-01" },
    "D5": { "value": "PM Team" },
    "E5": { "value": "Complete" },
    "F5": { "value": "Stakeholder alignment meeting held" },
    "A6": { "value": "Design Sign-off" },
    "B6": { "value": "2024-05-15" },
    "C6": { "value": "2024-05-18" },
    "D6": { "value": "Carlos Ruiz" },
    "E6": { "value": "Complete" },
    "F6": { "value": "3 days late due to revision cycle" },
    "A7": { "value": "Alpha Release" },
    "B7": { "value": "2024-07-01" },
    "C7": { "value": "—" },
    "D7": { "value": "Mei Chen" },
    "E7": { "value": "In Progress" },
    "F7": { "value": "Core features 80% done" },
    "A8": { "value": "Beta Testing" },
    "B8": { "value": "2024-08-01" },
    "C8": { "value": "—" },
    "D8": { "value": "Fatima Ali" },
    "E8": { "value": "Not Started" },
    "F8": { "value": "Waiting on alpha stability" },
    "A9": { "value": "App Store Submission" },
    "B9": { "value": "2024-09-01" },
    "C9": { "value": "—" },
    "D9": { "value": "Alice Nguyen" },
    "E9": { "value": "Not Started" },
    "F9": { "value": "Requires legal review" }
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
  "tool": "create_meeting_notes",
  "label": "meeting notes",
  "cells": {
    "A1": { "value": "Meeting Notes" },
    "A2": { "value": "Sprint Retrospective — Jul 5, 2024" },
    "A4": { "value": "Item #" },
    "B4": { "value": "Category" },
    "C4": { "value": "Description" },
    "D4": { "value": "Action Owner" },
    "E4": { "value": "Due Date" },
    "F4": { "value": "Status" },
    "A5": { "value": 1 },
    "B5": { "value": "What went well" },
    "C5": { "value": "Shipped auth feature ahead of schedule" },
    "D5": { "value": "—" },
    "E5": { "value": "—" },
    "F5": { "value": "Noted" },
    "A6": { "value": 2 },
    "B6": { "value": "What went well" },
    "C6": { "value": "Cross-team pairing improved code quality" },
    "D6": { "value": "—" },
    "E6": { "value": "—" },
    "F6": { "value": "Noted" },
    "A7": { "value": 3 },
    "B7": { "value": "Improvement" },
    "C7": { "value": "Stand-ups running too long—cap at 10 min" },
    "D7": { "value": "Scrum Master" },
    "E7": { "value": "2024-07-08" },
    "F7": { "value": "Action" },
    "A8": { "value": 4 },
    "B8": { "value": "Improvement" },
    "C8": { "value": "Deploy pipeline flaky — investigate root cause" },
    "D8": { "value": "David Park" },
    "E8": { "value": "2024-07-12" },
    "F8": { "value": "Action" },
    "A9": { "value": 5 },
    "B9": { "value": "Decision" },
    "C9": { "value": "Switch to trunk-based development next sprint" },
    "D9": { "value": "Alice Nguyen" },
    "E9": { "value": "2024-07-08" },
    "F9": { "value": "Decided" }
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
  "tool": "create_client_deliverables",
  "label": "client deliverables",
  "cells": {
    "A1": { "value": "Client Deliverables" },
    "A2": { "value": "Acme Corp — Brand Refresh Project" },
    "A4": { "value": "Deliverable" },
    "B4": { "value": "Phase" },
    "C4": { "value": "Due Date" },
    "D4": { "value": "Submitted" },
    "E4": { "value": "Approved" },
    "F4": { "value": "Invoice Amount" },
    "G4": { "value": "Status" },
    "A5": { "value": "Discovery Report" },
    "B5": { "value": "Phase 1" },
    "C5": { "value": "2024-05-10" },
    "D5": { "value": "2024-05-09" },
    "E5": { "value": "2024-05-12" },
    "F5": { "value": 5000 },
    "G5": { "value": "Paid" },
    "A6": { "value": "Brand Guidelines v1" },
    "B6": { "value": "Phase 2" },
    "C6": { "value": "2024-06-15" },
    "D6": { "value": "2024-06-14" },
    "E6": { "value": "2024-06-20" },
    "F6": { "value": 12000 },
    "G6": { "value": "Paid" },
    "A7": { "value": "Website Mockups" },
    "B7": { "value": "Phase 2" },
    "C7": { "value": "2024-07-01" },
    "D7": { "value": "2024-07-03" },
    "E7": { "value": "—" },
    "F7": { "value": 8000 },
    "G7": { "value": "Under Review" },
    "A8": { "value": "Final Assets Package" },
    "B8": { "value": "Phase 3" },
    "C8": { "value": "2024-08-01" },
    "D8": { "value": "—" },
    "E8": { "value": "—" },
    "F8": { "value": 15000 },
    "G8": { "value": "Not Started" },
    "A10": { "value": "TOTAL CONTRACT VALUE" },
    "F10": { "value": null, "formula": "=SUM(F5:F8)" }
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
      "ids": ["F10"],
      "format": { "bold": true, "bgColor": "#EDE9FE" }
    }
  ]
}
];
