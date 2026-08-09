// Category: Small Business: Sales & Marketing. Edit as data — no logic here.
import type { TemplateSpec } from './types';

export const smallBusinessSalesTemplates: TemplateSpec[] = [
{
  "tool": "create_sales_pipeline",
  "label": "sales pipeline CRM",
  "cells": {
    "A1": {
      "value": "Sales Pipeline CRM"
    },
    "A3": {
      "value": "Deal"
    },
    "B3": {
      "value": "Company"
    },
    "C3": {
      "value": "Contact"
    },
    "D3": {
      "value": "Stage"
    },
    "E3": {
      "value": "Value"
    },
    "F3": {
      "value": "Probability"
    },
    "G3": {
      "value": "Weighted"
    },
    "H3": {
      "value": "Close Date"
    },
    "A4": {
      "value": "Enterprise License"
    },
    "B4": {
      "value": "Acme Corp"
    },
    "C4": {
      "value": "Sarah Chen"
    },
    "D4": {
      "value": "Proposal"
    },
    "E4": {
      "value": 85000
    },
    "F4": {
      "value": 0.6
    },
    "G4": {
      "value": null,
      "formula": "=E4*F4"
    },
    "H4": {
      "value": "2024-03-15"
    },
    "A5": {
      "value": "Platform Migration"
    },
    "B5": {
      "value": "TechNova Inc"
    },
    "C5": {
      "value": "Marcus Webb"
    },
    "D5": {
      "value": "Negotiation"
    },
    "E5": {
      "value": 120000
    },
    "F5": {
      "value": 0.8
    },
    "G5": {
      "value": null,
      "formula": "=E5*F5"
    },
    "H5": {
      "value": "2024-02-28"
    },
    "A6": {
      "value": "Consulting Package"
    },
    "B6": {
      "value": "Meridian Health"
    },
    "C6": {
      "value": "Lisa Park"
    },
    "D6": {
      "value": "Discovery"
    },
    "E6": {
      "value": 45000
    },
    "F6": {
      "value": 0.3
    },
    "G6": {
      "value": null,
      "formula": "=E6*F6"
    },
    "H6": {
      "value": "2024-04-30"
    },
    "A7": {
      "value": "Annual Renewal"
    },
    "B7": {
      "value": "GlobalFinance"
    },
    "C7": {
      "value": "James Okafor"
    },
    "D7": {
      "value": "Closed Won"
    },
    "E7": {
      "value": 62000
    },
    "F7": {
      "value": 1.0
    },
    "G7": {
      "value": null,
      "formula": "=E7*F7"
    },
    "H7": {
      "value": "2024-01-31"
    },
    "A9": {
      "value": "PIPELINE TOTAL"
    },
    "E9": {
      "value": null,
      "formula": "=SUM(E4:E7)"
    },
    "G9": {
      "value": null,
      "formula": "=SUM(G4:G7)"
    }
  },
  "formats": [
    {
      "ids": ["A3", "B3", "C3", "D3", "E3", "F3", "G3", "H3"],
      "format": {
        "bold": true,
        "bgColor": "#7C3AED",
        "fontColor": "#FFFFFF",
        "textAlign": "center"
      }
    },
    {
      "ids": ["A1"],
      "format": {
        "bold": true,
        "fontSize": 16,
        "fontColor": "#7C3AED"
      }
    },
    {
      "ids": ["A9"],
      "format": {
        "bold": true
      }
    },
    {
      "ids": ["E9", "G9"],
      "format": {
        "bold": true,
        "bgColor": "#EDE9FE"
      }
    }
  ]
},
{
  "tool": "create_revenue_dashboard",
  "label": "revenue dashboard",
  "cells": {
    "A1": {
      "value": "Revenue Dashboard"
    },
    "A3": {
      "value": "Month"
    },
    "B3": {
      "value": "New MRR"
    },
    "C3": {
      "value": "Expansion"
    },
    "D3": {
      "value": "Churn"
    },
    "E3": {
      "value": "Net MRR"
    },
    "F3": {
      "value": "Customers"
    },
    "A4": {
      "value": "Jan"
    },
    "B4": {
      "value": 12500
    },
    "C4": {
      "value": 3200
    },
    "D4": {
      "value": -1800
    },
    "E4": {
      "value": null,
      "formula": "=B4+C4+D4"
    },
    "F4": {
      "value": 142
    },
    "A5": {
      "value": "Feb"
    },
    "B5": {
      "value": 15800
    },
    "C5": {
      "value": 4100
    },
    "D5": {
      "value": -2200
    },
    "E5": {
      "value": null,
      "formula": "=B5+C5+D5"
    },
    "F5": {
      "value": 158
    },
    "A6": {
      "value": "Mar"
    },
    "B6": {
      "value": 18200
    },
    "C6": {
      "value": 5500
    },
    "D6": {
      "value": -1500
    },
    "E6": {
      "value": null,
      "formula": "=B6+C6+D6"
    },
    "F6": {
      "value": 175
    },
    "A7": {
      "value": "Apr"
    },
    "B7": {
      "value": 21000
    },
    "C7": {
      "value": 6800
    },
    "D7": {
      "value": -2900
    },
    "E7": {
      "value": null,
      "formula": "=B7+C7+D7"
    },
    "F7": {
      "value": 193
    },
    "A9": {
      "value": "TOTALS"
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
    "E9": {
      "value": null,
      "formula": "=SUM(E4:E7)"
    }
  },
  "formats": [
    {
      "ids": ["A3", "B3", "C3", "D3", "E3", "F3"],
      "format": {
        "bold": true,
        "bgColor": "#7C3AED",
        "fontColor": "#FFFFFF",
        "textAlign": "center"
      }
    },
    {
      "ids": ["A1"],
      "format": {
        "bold": true,
        "fontSize": 16,
        "fontColor": "#7C3AED"
      }
    },
    {
      "ids": ["A9"],
      "format": {
        "bold": true
      }
    },
    {
      "ids": ["B9", "C9", "D9", "E9"],
      "format": {
        "bold": true,
        "bgColor": "#EDE9FE"
      }
    }
  ]
},
{
  "tool": "create_marketing_campaign_budget",
  "label": "marketing campaign budget",
  "cells": {
    "A1": {
      "value": "Marketing Campaign Budget"
    },
    "A3": {
      "value": "Campaign"
    },
    "B3": {
      "value": "Channel"
    },
    "C3": {
      "value": "Budget"
    },
    "D3": {
      "value": "Spent"
    },
    "E3": {
      "value": "Remaining"
    },
    "F3": {
      "value": "Leads"
    },
    "G3": {
      "value": "CPL"
    },
    "A4": {
      "value": "Spring Product Launch"
    },
    "B4": {
      "value": "Google Ads"
    },
    "C4": {
      "value": 15000
    },
    "D4": {
      "value": 9800
    },
    "E4": {
      "value": null,
      "formula": "=C4-D4"
    },
    "F4": {
      "value": 245
    },
    "G4": {
      "value": null,
      "formula": "=D4/F4"
    },
    "A5": {
      "value": "Brand Awareness Q2"
    },
    "B5": {
      "value": "LinkedIn Ads"
    },
    "C5": {
      "value": 8000
    },
    "D5": {
      "value": 6200
    },
    "E5": {
      "value": null,
      "formula": "=C5-D5"
    },
    "F5": {
      "value": 132
    },
    "G5": {
      "value": null,
      "formula": "=D5/F5"
    },
    "A6": {
      "value": "Webinar Series"
    },
    "B6": {
      "value": "Email"
    },
    "C6": {
      "value": 3500
    },
    "D6": {
      "value": 2100
    },
    "E6": {
      "value": null,
      "formula": "=C6-D6"
    },
    "F6": {
      "value": 89
    },
    "G6": {
      "value": null,
      "formula": "=D6/F6"
    },
    "A7": {
      "value": "Retargeting Blitz"
    },
    "B7": {
      "value": "Facebook Ads"
    },
    "C7": {
      "value": 5000
    },
    "D7": {
      "value": 4750
    },
    "E7": {
      "value": null,
      "formula": "=C7-D7"
    },
    "F7": {
      "value": 198
    },
    "G7": {
      "value": null,
      "formula": "=D7/F7"
    },
    "A9": {
      "value": "TOTALS"
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
    },
    "F9": {
      "value": null,
      "formula": "=SUM(F4:F7)"
    }
  },
  "formats": [
    {
      "ids": ["A3", "B3", "C3", "D3", "E3", "F3", "G3"],
      "format": {
        "bold": true,
        "bgColor": "#7C3AED",
        "fontColor": "#FFFFFF",
        "textAlign": "center"
      }
    },
    {
      "ids": ["A1"],
      "format": {
        "bold": true,
        "fontSize": 16,
        "fontColor": "#7C3AED"
      }
    },
    {
      "ids": ["A9"],
      "format": {
        "bold": true
      }
    },
    {
      "ids": ["C9", "D9", "E9", "F9"],
      "format": {
        "bold": true,
        "bgColor": "#EDE9FE"
      }
    }
  ]
},
{
  "tool": "create_lead_tracking",
  "label": "lead tracking",
  "cells": {
    "A1": {
      "value": "Lead Tracking"
    },
    "A3": {
      "value": "Lead Name"
    },
    "B3": {
      "value": "Company"
    },
    "C3": {
      "value": "Source"
    },
    "D3": {
      "value": "Score"
    },
    "E3": {
      "value": "Status"
    },
    "F3": {
      "value": "Last Contact"
    },
    "G3": {
      "value": "Est. Value"
    },
    "A4": {
      "value": "Rachel Torres"
    },
    "B4": {
      "value": "Vertex Solutions"
    },
    "C4": {
      "value": "Webinar"
    },
    "D4": {
      "value": 87
    },
    "E4": {
      "value": "Hot"
    },
    "F4": {
      "value": "2024-02-12"
    },
    "G4": {
      "value": 35000
    },
    "A5": {
      "value": "David Kim"
    },
    "B5": {
      "value": "Pinnacle Media"
    },
    "C5": {
      "value": "LinkedIn"
    },
    "D5": {
      "value": 62
    },
    "E5": {
      "value": "Warm"
    },
    "F5": {
      "value": "2024-02-08"
    },
    "G5": {
      "value": 22000
    },
    "A6": {
      "value": "Emily Zhao"
    },
    "B6": {
      "value": "NorthStar AI"
    },
    "C6": {
      "value": "Referral"
    },
    "D6": {
      "value": 94
    },
    "E6": {
      "value": "Hot"
    },
    "F6": {
      "value": "2024-02-14"
    },
    "G6": {
      "value": 58000
    },
    "A7": {
      "value": "Carlos Mendez"
    },
    "B7": {
      "value": "BlueSky Retail"
    },
    "C7": {
      "value": "Cold Outreach"
    },
    "D7": {
      "value": 41
    },
    "E7": {
      "value": "Cold"
    },
    "F7": {
      "value": "2024-01-30"
    },
    "G7": {
      "value": 15000
    },
    "A9": {
      "value": "TOTAL PIPELINE"
    },
    "G9": {
      "value": null,
      "formula": "=SUM(G4:G7)"
    }
  },
  "formats": [
    {
      "ids": ["A3", "B3", "C3", "D3", "E3", "F3", "G3"],
      "format": {
        "bold": true,
        "bgColor": "#7C3AED",
        "fontColor": "#FFFFFF",
        "textAlign": "center"
      }
    },
    {
      "ids": ["A1"],
      "format": {
        "bold": true,
        "fontSize": 16,
        "fontColor": "#7C3AED"
      }
    },
    {
      "ids": ["A9"],
      "format": {
        "bold": true
      }
    },
    {
      "ids": ["G9"],
      "format": {
        "bold": true,
        "bgColor": "#EDE9FE"
      }
    }
  ]
},
{
  "tool": "create_customer_churn_calculator",
  "label": "customer churn calculator",
  "cells": {
    "A1": {
      "value": "Customer Churn Calculator"
    },
    "A3": {
      "value": "Month"
    },
    "B3": {
      "value": "Start Customers"
    },
    "C3": {
      "value": "New Customers"
    },
    "D3": {
      "value": "Churned"
    },
    "E3": {
      "value": "End Customers"
    },
    "F3": {
      "value": "Churn Rate"
    },
    "G3": {
      "value": "Revenue Lost"
    },
    "A4": {
      "value": "Jan"
    },
    "B4": {
      "value": 520
    },
    "C4": {
      "value": 45
    },
    "D4": {
      "value": 28
    },
    "E4": {
      "value": null,
      "formula": "=B4+C4-D4"
    },
    "F4": {
      "value": null,
      "formula": "=D4/B4"
    },
    "G4": {
      "value": null,
      "formula": "=D4*89"
    },
    "A5": {
      "value": "Feb"
    },
    "B5": {
      "value": null,
      "formula": "=E4"
    },
    "C5": {
      "value": 52
    },
    "D5": {
      "value": 31
    },
    "E5": {
      "value": null,
      "formula": "=B5+C5-D5"
    },
    "F5": {
      "value": null,
      "formula": "=D5/B5"
    },
    "G5": {
      "value": null,
      "formula": "=D5*89"
    },
    "A6": {
      "value": "Mar"
    },
    "B6": {
      "value": null,
      "formula": "=E5"
    },
    "C6": {
      "value": 61
    },
    "D6": {
      "value": 22
    },
    "E6": {
      "value": null,
      "formula": "=B6+C6-D6"
    },
    "F6": {
      "value": null,
      "formula": "=D6/B6"
    },
    "G6": {
      "value": null,
      "formula": "=D6*89"
    },
    "A7": {
      "value": "Apr"
    },
    "B7": {
      "value": null,
      "formula": "=E6"
    },
    "C7": {
      "value": 48
    },
    "D7": {
      "value": 35
    },
    "E7": {
      "value": null,
      "formula": "=B7+C7-D7"
    },
    "F7": {
      "value": null,
      "formula": "=D7/B7"
    },
    "G7": {
      "value": null,
      "formula": "=D7*89"
    },
    "A9": {
      "value": "TOTAL CHURNED"
    },
    "D9": {
      "value": null,
      "formula": "=SUM(D4:D7)"
    },
    "G9": {
      "value": null,
      "formula": "=SUM(G4:G7)"
    }
  },
  "formats": [
    {
      "ids": ["A3", "B3", "C3", "D3", "E3", "F3", "G3"],
      "format": {
        "bold": true,
        "bgColor": "#7C3AED",
        "fontColor": "#FFFFFF",
        "textAlign": "center"
      }
    },
    {
      "ids": ["A1"],
      "format": {
        "bold": true,
        "fontSize": 16,
        "fontColor": "#7C3AED"
      }
    },
    {
      "ids": ["A9"],
      "format": {
        "bold": true
      }
    },
    {
      "ids": ["D9", "G9"],
      "format": {
        "bold": true,
        "bgColor": "#EDE9FE"
      }
    }
  ]
},
{
  "tool": "create_social_media_calendar",
  "label": "social media calendar",
  "cells": {
    "A1": {
      "value": "Social Media Calendar"
    },
    "A3": {
      "value": "Date"
    },
    "B3": {
      "value": "Platform"
    },
    "C3": {
      "value": "Content Type"
    },
    "D3": {
      "value": "Caption"
    },
    "E3": {
      "value": "Status"
    },
    "F3": {
      "value": "Impressions"
    },
    "G3": {
      "value": "Engagement"
    },
    "A4": {
      "value": "2024-03-04"
    },
    "B4": {
      "value": "Instagram"
    },
    "C4": {
      "value": "Carousel"
    },
    "D4": {
      "value": "5 tips for remote teams"
    },
    "E4": {
      "value": "Published"
    },
    "F4": {
      "value": 4200
    },
    "G4": {
      "value": 312
    },
    "A5": {
      "value": "2024-03-05"
    },
    "B5": {
      "value": "LinkedIn"
    },
    "C5": {
      "value": "Article"
    },
    "D5": {
      "value": "Q1 industry trends recap"
    },
    "E5": {
      "value": "Published"
    },
    "F5": {
      "value": 8900
    },
    "G5": {
      "value": 567
    },
    "A6": {
      "value": "2024-03-07"
    },
    "B6": {
      "value": "X/Twitter"
    },
    "C6": {
      "value": "Thread"
    },
    "D6": {
      "value": "Product update announcement"
    },
    "E6": {
      "value": "Scheduled"
    },
    "F6": {
      "value": null
    },
    "G6": {
      "value": null
    },
    "A7": {
      "value": "2024-03-08"
    },
    "B7": {
      "value": "TikTok"
    },
    "C7": {
      "value": "Video"
    },
    "D7": {
      "value": "Behind the scenes office tour"
    },
    "E7": {
      "value": "Draft"
    },
    "F7": {
      "value": null
    },
    "G7": {
      "value": null
    },
    "A9": {
      "value": "TOTAL REACH"
    },
    "F9": {
      "value": null,
      "formula": "=SUM(F4:F7)"
    },
    "G9": {
      "value": null,
      "formula": "=SUM(G4:G7)"
    }
  },
  "formats": [
    {
      "ids": ["A3", "B3", "C3", "D3", "E3", "F3", "G3"],
      "format": {
        "bold": true,
        "bgColor": "#7C3AED",
        "fontColor": "#FFFFFF",
        "textAlign": "center"
      }
    },
    {
      "ids": ["A1"],
      "format": {
        "bold": true,
        "fontSize": 16,
        "fontColor": "#7C3AED"
      }
    },
    {
      "ids": ["A9"],
      "format": {
        "bold": true
      }
    },
    {
      "ids": ["F9", "G9"],
      "format": {
        "bold": true,
        "bgColor": "#EDE9FE"
      }
    }
  ]
},
{
  "tool": "create_email_campaign_metrics",
  "label": "email campaign metrics",
  "cells": {
    "A1": {
      "value": "Email Campaign Metrics"
    },
    "A3": {
      "value": "Campaign"
    },
    "B3": {
      "value": "Sent"
    },
    "C3": {
      "value": "Delivered"
    },
    "D3": {
      "value": "Opens"
    },
    "E3": {
      "value": "Open Rate"
    },
    "F3": {
      "value": "Clicks"
    },
    "G3": {
      "value": "CTR"
    },
    "H3": {
      "value": "Conversions"
    },
    "A4": {
      "value": "Welcome Series"
    },
    "B4": {
      "value": 2500
    },
    "C4": {
      "value": 2420
    },
    "D4": {
      "value": 1089
    },
    "E4": {
      "value": null,
      "formula": "=D4/C4"
    },
    "F4": {
      "value": 312
    },
    "G4": {
      "value": null,
      "formula": "=F4/C4"
    },
    "H4": {
      "value": 48
    },
    "A5": {
      "value": "Monthly Newsletter"
    },
    "B5": {
      "value": 8200
    },
    "C5": {
      "value": 7954
    },
    "D5": {
      "value": 2148
    },
    "E5": {
      "value": null,
      "formula": "=D5/C5"
    },
    "F5": {
      "value": 486
    },
    "G5": {
      "value": null,
      "formula": "=F5/C5"
    },
    "H5": {
      "value": 72
    },
    "A6": {
      "value": "Flash Sale Alert"
    },
    "B6": {
      "value": 5100
    },
    "C6": {
      "value": 4947
    },
    "D6": {
      "value": 1978
    },
    "E6": {
      "value": null,
      "formula": "=D6/C6"
    },
    "F6": {
      "value": 891
    },
    "G6": {
      "value": null,
      "formula": "=F6/C6"
    },
    "H6": {
      "value": 156
    },
    "A7": {
      "value": "Re-engagement Drip"
    },
    "B7": {
      "value": 1800
    },
    "C7": {
      "value": 1746
    },
    "D7": {
      "value": 524
    },
    "E7": {
      "value": null,
      "formula": "=D7/C7"
    },
    "F7": {
      "value": 105
    },
    "G7": {
      "value": null,
      "formula": "=F7/C7"
    },
    "H7": {
      "value": 18
    },
    "A9": {
      "value": "TOTALS"
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
    },
    "H9": {
      "value": null,
      "formula": "=SUM(H4:H7)"
    }
  },
  "formats": [
    {
      "ids": ["A3", "B3", "C3", "D3", "E3", "F3", "G3", "H3"],
      "format": {
        "bold": true,
        "bgColor": "#7C3AED",
        "fontColor": "#FFFFFF",
        "textAlign": "center"
      }
    },
    {
      "ids": ["A1"],
      "format": {
        "bold": true,
        "fontSize": 16,
        "fontColor": "#7C3AED"
      }
    },
    {
      "ids": ["A9"],
      "format": {
        "bold": true
      }
    },
    {
      "ids": ["B9", "C9", "D9", "F9", "H9"],
      "format": {
        "bold": true,
        "bgColor": "#EDE9FE"
      }
    }
  ]
},
{
  "tool": "create_competitor_analysis",
  "label": "competitor analysis",
  "cells": {
    "A1": {
      "value": "Competitor Analysis"
    },
    "A3": {
      "value": "Competitor"
    },
    "B3": {
      "value": "Market Share"
    },
    "C3": {
      "value": "Pricing"
    },
    "D3": {
      "value": "Strengths"
    },
    "E3": {
      "value": "Weaknesses"
    },
    "F3": {
      "value": "Threat Level"
    },
    "G3": {
      "value": "Our Advantage"
    },
    "A4": {
      "value": "AlphaTech"
    },
    "B4": {
      "value": 0.32
    },
    "C4": {
      "value": 299
    },
    "D4": {
      "value": "Brand recognition, enterprise deals"
    },
    "E4": {
      "value": "Slow support, dated UI"
    },
    "F4": {
      "value": "High"
    },
    "G4": {
      "value": "Faster onboarding"
    },
    "A5": {
      "value": "BetaWorks"
    },
    "B5": {
      "value": 0.18
    },
    "C5": {
      "value": 199
    },
    "D5": {
      "value": "Low price, easy setup"
    },
    "E5": {
      "value": "Limited features, no API"
    },
    "F5": {
      "value": "Medium"
    },
    "G5": {
      "value": "Full API, integrations"
    },
    "A6": {
      "value": "GammaSoft"
    },
    "B6": {
      "value": 0.12
    },
    "C6": {
      "value": 449
    },
    "D6": {
      "value": "Premium support, security certs"
    },
    "E6": {
      "value": "Expensive, complex"
    },
    "F6": {
      "value": "Low"
    },
    "G6": {
      "value": "Simplicity, value pricing"
    },
    "A7": {
      "value": "DeltaCloud"
    },
    "B7": {
      "value": 0.08
    },
    "C7": {
      "value": 149
    },
    "D7": {
      "value": "Modern UI, mobile-first"
    },
    "E7": {
      "value": "New entrant, small team"
    },
    "F7": {
      "value": "Medium"
    },
    "G7": {
      "value": "Established trust, scale"
    },
    "A9": {
      "value": "OUR MARKET SHARE"
    },
    "B9": {
      "value": null,
      "formula": "=1-SUM(B4:B7)"
    }
  },
  "formats": [
    {
      "ids": ["A3", "B3", "C3", "D3", "E3", "F3", "G3"],
      "format": {
        "bold": true,
        "bgColor": "#7C3AED",
        "fontColor": "#FFFFFF",
        "textAlign": "center"
      }
    },
    {
      "ids": ["A1"],
      "format": {
        "bold": true,
        "fontSize": 16,
        "fontColor": "#7C3AED"
      }
    },
    {
      "ids": ["A9"],
      "format": {
        "bold": true
      }
    },
    {
      "ids": ["B9"],
      "format": {
        "bold": true,
        "bgColor": "#D1FAE5"
      }
    }
  ]
}
];
