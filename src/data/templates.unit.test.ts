import { describe, it, expect } from 'vitest';
import { templates, templateCategories, getTemplatesByCategory, TEMPLATE_TAGS, searchTemplates } from './templates';

describe('Category Structure', () => {
  it('has exactly 11 categories', () => {
    expect(templateCategories).toHaveLength(11);
  });

  it('includes all required categories', () => {
    const expected = [
      'Personal Finance', 'Freelancer', 'Real Estate',
      'Small Business: Operations & HR', 'Small Business: Sales & Marketing', 'Small Business: Accounting & Tax',
      'Education', 'Health & Wellness', 'Project Management', 'Nonprofit', 'Legal & Compliance',
    ];
    for (const cat of expected) {
      expect(templateCategories).toContain(cat);
    }
  });
});

describe('Template Counts', () => {
  it('total template count is between 110 and 130', () => {
    expect(templates.length).toBeGreaterThanOrEqual(110);
    expect(templates.length).toBeLessThanOrEqual(130);
  });

  it('Personal Finance has at least 18 templates (15 existing + 3 new)', () => {
    expect(getTemplatesByCategory('Personal Finance').length).toBeGreaterThanOrEqual(18);
  });

  it('Freelancer has at least 14 templates', () => {
    expect(getTemplatesByCategory('Freelancer').length).toBeGreaterThanOrEqual(14);
  });

  it('Real Estate has at least 12 templates', () => {
    expect(getTemplatesByCategory('Real Estate').length).toBeGreaterThanOrEqual(12);
  });

  it('Small Business: Operations & HR has at least 8 templates', () => {
    expect(getTemplatesByCategory('Small Business: Operations & HR').length).toBeGreaterThanOrEqual(8);
  });

  it('Small Business: Sales & Marketing has at least 8 templates', () => {
    expect(getTemplatesByCategory('Small Business: Sales & Marketing').length).toBeGreaterThanOrEqual(8);
  });

  it('Small Business: Accounting & Tax has at least 8 templates', () => {
    expect(getTemplatesByCategory('Small Business: Accounting & Tax').length).toBeGreaterThanOrEqual(8);
  });

  it('Education has at least 12 templates', () => {
    expect(getTemplatesByCategory('Education').length).toBeGreaterThanOrEqual(12);
  });

  it('Health & Wellness has at least 12 templates', () => {
    expect(getTemplatesByCategory('Health & Wellness').length).toBeGreaterThanOrEqual(12);
  });

  it('Project Management has at least 8 templates', () => {
    expect(getTemplatesByCategory('Project Management').length).toBeGreaterThanOrEqual(8);
  });

  it('Nonprofit has at least 8 templates', () => {
    expect(getTemplatesByCategory('Nonprofit').length).toBeGreaterThanOrEqual(8);
  });

  it('Legal & Compliance has at least 6 templates', () => {
    expect(getTemplatesByCategory('Legal & Compliance').length).toBeGreaterThanOrEqual(6);
  });

  it('no category has fewer than 6 templates', () => {
    for (const cat of templateCategories) {
      expect(getTemplatesByCategory(cat).length, `${cat}`).toBeGreaterThanOrEqual(6);
    }
  });
});

describe('Backward Compatibility', () => {
  const existingIds = [
    'budget-generator', 'wedding-budget', 'student-loan-payoff', 'retirement-calculator',
    'emergency-fund', 'debt-snowball', 'savings-goal', 'net-worth-tracker',
    'holiday-budget', 'travel-budget', 'baby-budget', 'college-savings',
    'freelancer-invoice', 'quarterly-tax', 'mileage-tracker', 'client-tracker',
    'hourly-timesheet', 'project-quote', 'income-expense-log', 'equipment-depreciation',
    'profit-margin', 'freelancer-dashboard',
    'rental-property', 'mortgage-calculator', 'airbnb-income', 'property-comparison',
    'rent-roll', 'lease-tracker', 'renovation-budget', 'roi-calculator',
  ];

  it('all existing template IDs are still present', () => {
    const ids = templates.map(t => t.id);
    for (const id of existingIds) {
      expect(ids).toContain(id);
    }
  });
});

describe('Tag System', () => {
  const requiredTags = ['budget', 'tracker', 'calculator', 'planning', 'reporting', 'tax', 'invoice', 'schedule', 'analysis', 'forecast'];

  it('required tag vocabulary terms all appear in at least one template', () => {
    const allTags = templates.flatMap(t => t.tags ?? []);
    for (const tag of requiredTags) {
      expect(allTags).toContain(tag);
    }
  });

  it('TEMPLATE_TAGS includes all 10 required terms', () => {
    for (const tag of requiredTags) {
      expect(TEMPLATE_TAGS).toContain(tag);
    }
  });
});

describe('searchTemplates', () => {
  it('matches by name', () => {
    const results = searchTemplates('Wedding Budget');
    expect(results.some(t => t.id === 'wedding-budget')).toBe(true);
  });

  it('matches by description', () => {
    const results = searchTemplates('retirement savings');
    expect(results.some(t => t.id === 'retirement-calculator')).toBe(true);
  });

  it('matches by category', () => {
    const results = searchTemplates('Nonprofit');
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(t => t.category === 'Nonprofit')).toBe(true);
  });

  it('matches by tag', () => {
    const results = searchTemplates('fitness');
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(t => (t.tags ?? []).includes('fitness') || t.name.toLowerCase().includes('fitness') || t.description.toLowerCase().includes('fitness') || t.category.toLowerCase().includes('fitness'))).toBe(true);
  });

  it('is case-insensitive', () => {
    const lower = searchTemplates('gpa');
    const upper = searchTemplates('GPA');
    expect(lower.length).toBe(upper.length);
  });
});

function templatesInCategory(category: string) {
  return templates.filter(t => t.category === category).map(t => t.name);
}

describe('Named Templates Per Category', () => {
  describe('Education (Req 2.2)', () => {
    const names = [
      'GPA Calculator',
      'Class Schedule',
      'Student Gradebook',
      'Assignment Tracker',
      'Scholarship Tracker',
      'College Cost Comparison',
      'GPA What-If Planner',
      'Teacher Grade Book',
      'Homeschool Curriculum Planner',
      'Study Schedule Builder',
    ];
    // Note: "Student Loan Payoff Calculator" from req 2.2 is in Personal Finance category
    it.each(names)('contains %s', (name) => {
      expect(templatesInCategory('Education')).toContain(name);
    });
  });

  describe('Health & Wellness (Req 3.2)', () => {
    const names = [
      'Workout Log',
      'Meal Planner',
      'Weight Tracker',
      'Habit Tracker',
      'Medical Expenses',
      'Medical Expense Tracker with HSA',
      'Medication Schedule',
      'Macro/Nutrition Calculator',
      'Workout Progress Tracker',
      'Mental Health Mood Journal',
      'Sleep Tracker',
      'Weight Loss Progress Calculator',
    ];
    it.each(names)('contains %s', (name) => {
      expect(templatesInCategory('Health & Wellness')).toContain(name);
    });
  });

  describe('Small Business: Operations & HR (Req 4.4)', () => {
    const names = [
      'Employee Schedule',
      'PTO Tracker',
      'Hiring Pipeline',
      'Vendor Manager',
      'Inventory Reorder',
      'Meeting Agenda',
      'Performance Review',
      'Onboarding Checklist',
    ];
    it.each(names)('contains %s', (name) => {
      expect(templatesInCategory('Small Business: Operations & HR')).toContain(name);
    });
  });

  describe('Small Business: Sales & Marketing (Req 4.5)', () => {
    const names = [
      'Sales Pipeline CRM',
      'Revenue Dashboard',
      'Marketing Campaign Budget',
      'Lead Tracking',
      'Customer Churn Calculator',
      'Social Media Calendar',
      'Email Campaign Metrics',
      'Competitor Analysis',
    ];
    it.each(names)('contains %s', (name) => {
      expect(templatesInCategory('Small Business: Sales & Marketing')).toContain(name);
    });
  });

  describe('Small Business: Accounting & Tax (Req 4.6)', () => {
    const names = [
      'Profit & Loss Statement',
      'Cash Flow Forecast',
      'Quarterly Tax Estimator',
      'AR Aging',
      'Business Expense Report',
      'Mileage Log',
      'Annual Budget vs Actual',
      'Break-Even Analysis',
    ];
    it.each(names)('contains %s', (name) => {
      expect(templatesInCategory('Small Business: Accounting & Tax')).toContain(name);
    });
  });

  describe('Project Management (Req 5.2)', () => {
    const names = [
      'Project Timeline / Gantt',
      'Sprint Planning',
      'Resource Allocation',
      'Project Budget',
      'Risk Register',
      'Milestone Tracker',
      'Meeting Notes',
      'Client Deliverables',
    ];
    it.each(names)('contains %s', (name) => {
      expect(templatesInCategory('Project Management')).toContain(name);
    });
  });

  describe('Nonprofit (Req 6.2)', () => {
    const names = [
      'Grant Tracker',
      'Donor Database',
      'Event Fundraising P&L',
      'Volunteer Hours',
      'Program Budget',
      'Board Meeting Minutes',
      'Annual Report Data',
      'In-Kind Donation Valuation',
    ];
    it.each(names)('contains %s', (name) => {
      expect(templatesInCategory('Nonprofit')).toContain(name);
    });
  });

  describe('Legal & Compliance (Req 7.2)', () => {
    const names = [
      'Contract Renewal Calendar',
      'Legal Matter Tracker',
      'Compliance Audit Checklist',
      'NDA Log',
      'Insurance Policy Tracker',
      'Regulatory Filing Deadlines',
    ];
    it.each(names)('contains %s', (name) => {
      expect(templatesInCategory('Legal & Compliance')).toContain(name);
    });
  });
});
