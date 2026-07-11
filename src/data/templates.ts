import type { Skill } from '@/types';

export const templateCategories = [
  'Personal Finance',
  'Freelancer',
  'Real Estate',
  'Small Business',
  'Education',
  'Health & Wellness',
] as const;

export type TemplateCategory = typeof templateCategories[number];

export interface Template extends Skill {
  category: TemplateCategory;
  popular?: boolean;
}

export const templates: Template[] = [
  // ═══════════════════════════════════════════════════════════════════════════════
  // ANALYSIS SKILLS (no template generation, just analysis)
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'explain-loaded-sheet',
    name: 'Explain My Sheet',
    category: 'Personal Finance',
    description: 'Explain what this spreadsheet means in plain English with key totals and risks',
    prompt: 'Explain this spreadsheet I just loaded and highlight the biggest budget risks',
    tools: [],
    icon: '🔎',
    popular: true,
  },
  {
    id: 'overspending-check',
    name: 'Find Overspending',
    category: 'Personal Finance',
    description: 'Detect categories that are over budget and rank them by impact',
    prompt: 'Where am I overspending and what are the top 3 categories to fix first?',
    tools: [],
    icon: '🚨',
    popular: true,
  },
  {
    id: 'savings-plan',
    name: 'Savings Plan',
    category: 'Personal Finance',
    description: 'Recommend practical monthly savings targets based on my numbers',
    prompt: 'I make $5000/month. How much should I save and where should I cut spending?',
    tools: [],
    icon: '🎯',
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // PERSONAL FINANCE (12 templates)
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'budget-generator',
    name: 'Monthly Budget',
    category: 'Personal Finance',
    description: 'Create a comprehensive monthly budget template with income, expenses, and totals',
    prompt: 'Create a monthly budget template',
    tools: ['create_budget_template'],
    icon: '💰',
    popular: true,
  },
  {
    id: 'wedding-budget',
    name: 'Wedding Budget',
    category: 'Personal Finance',
    description: 'Track wedding expenses by category with vendor payments and deposits',
    prompt: 'Create a wedding budget tracker',
    tools: ['create_wedding_budget'],
    icon: '💒',
  },
  {
    id: 'student-loan-payoff',
    name: 'Student Loan Payoff',
    category: 'Personal Finance',
    description: 'Track multiple student loans with payoff dates and interest calculations',
    prompt: 'Create a student loan payoff tracker',
    tools: ['create_student_loan_payoff'],
    icon: '🎓',
  },
  {
    id: 'retirement-calculator',
    name: 'Retirement Calculator',
    category: 'Personal Finance',
    description: 'Calculate retirement savings needed based on current age and goals',
    prompt: 'Create a retirement savings calculator',
    tools: ['create_retirement_calculator'],
    icon: '🏖️',
  },
  {
    id: 'emergency-fund',
    name: 'Emergency Fund Tracker',
    category: 'Personal Finance',
    description: 'Track progress toward your emergency fund goal with monthly contributions',
    prompt: 'Create an emergency fund savings tracker',
    tools: ['create_emergency_fund'],
    icon: '🛡️',
  },
  {
    id: 'debt-snowball',
    name: 'Debt Snowball',
    category: 'Personal Finance',
    description: 'Track debts smallest to largest with payoff dates and interest saved',
    prompt: 'Create a debt snowball payoff tracker',
    tools: ['create_debt_snowball'],
    icon: '❄️',
  },
  {
    id: 'savings-goal',
    name: 'Savings Goal',
    category: 'Personal Finance',
    description: 'Track progress toward any savings goal with monthly contributions',
    prompt: 'Create a savings goal tracker',
    tools: ['create_savings_goal'],
    icon: '🎯',
  },
  {
    id: 'net-worth-tracker',
    name: 'Net Worth Tracker',
    category: 'Personal Finance',
    description: 'Track assets vs liabilities to calculate and monitor net worth over time',
    prompt: 'Create a net worth tracker',
    tools: ['create_net_worth_tracker'],
    icon: '📊',
  },
  {
    id: 'holiday-budget',
    name: 'Holiday Budget',
    category: 'Personal Finance',
    description: 'Track gift spending by person with budget limits and totals',
    prompt: 'Create a holiday gift budget tracker',
    tools: ['create_holiday_budget'],
    icon: '🎄',
  },
  {
    id: 'travel-budget',
    name: 'Travel Budget',
    category: 'Personal Finance',
    description: 'Plan and track trip expenses including flights, hotels, food, and activities',
    prompt: 'Create a travel budget planner',
    tools: ['create_travel_budget'],
    icon: '✈️',
  },
  {
    id: 'baby-budget',
    name: 'Baby Budget',
    category: 'Personal Finance',
    description: 'Track baby-related expenses including nursery, gear, diapers, and healthcare',
    prompt: 'Create a baby expense tracker',
    tools: ['create_baby_budget'],
    icon: '👶',
  },
  {
    id: 'college-savings',
    name: 'College Savings',
    category: 'Personal Finance',
    description: 'Track 529 plan or college savings with projected growth over time',
    prompt: 'Create a college savings tracker',
    tools: ['create_college_savings'],
    icon: '🎓',
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // FREELANCER (10 templates)
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'freelancer-invoice',
    name: 'Freelancer Invoice',
    category: 'Freelancer',
    description: 'Professional invoice template with hourly rates and project breakdown',
    prompt: 'Create a freelancer invoice template',
    tools: ['create_freelancer_invoice'],
    icon: '💼',
    popular: true,
  },
  {
    id: 'quarterly-tax',
    name: 'Quarterly Tax Estimator',
    category: 'Freelancer',
    description: 'Estimate quarterly tax payments based on income and deductions',
    prompt: 'Create a quarterly tax payment estimator',
    tools: ['create_quarterly_tax'],
    icon: '🧮',
  },
  {
    id: 'mileage-tracker',
    name: 'Mileage Tracker',
    category: 'Freelancer',
    description: 'Track business miles with dates, destinations, and purpose for tax deductions',
    prompt: 'Create a mileage tracking spreadsheet',
    tools: ['create_mileage_tracker'],
    icon: '🚗',
  },
  {
    id: 'client-tracker',
    name: 'Client Tracker',
    category: 'Freelancer',
    description: 'Track client projects, invoices, and payments in one place',
    prompt: 'Create a client project tracker',
    tools: ['create_client_tracker'],
    icon: '👥',
  },
  {
    id: 'hourly-timesheet',
    name: 'Hourly Timesheet',
    category: 'Freelancer',
    description: 'Track hourly work by project with daily and weekly totals',
    prompt: 'Create an hourly timesheet',
    tools: ['create_hourly_timesheet'],
    icon: '⏰',
  },
  {
    id: 'project-quote',
    name: 'Project Quote',
    category: 'Freelancer',
    description: 'Create professional project quotes with line items and totals',
    prompt: 'Create a project quote template',
    tools: ['create_project_quote'],
    icon: '📝',
  },
  {
    id: 'income-expense-log',
    name: 'Income & Expense Log',
    category: 'Freelancer',
    description: 'Track all business income and expenses with categories',
    prompt: 'Create an income and expense log',
    tools: ['create_income_expense_log'],
    icon: '📒',
  },
  {
    id: 'equipment-depreciation',
    name: 'Equipment Depreciation',
    category: 'Freelancer',
    description: 'Track business equipment with purchase dates and depreciation schedules',
    prompt: 'Create an equipment depreciation tracker',
    tools: ['create_equipment_depreciation'],
    icon: '📉',
  },
  {
    id: 'profit-margin',
    name: 'Profit Margin Calculator',
    category: 'Freelancer',
    description: 'Calculate profit margins for products or services',
    prompt: 'Create a profit margin calculator',
    tools: ['create_profit_margin'],
    icon: '💹',
  },
  {
    id: 'freelancer-dashboard',
    name: 'Freelancer Dashboard',
    category: 'Freelancer',
    description: 'Overview of income, expenses, and outstanding invoices',
    prompt: 'Create a freelancer financial dashboard',
    tools: ['create_freelancer_dashboard'],
    icon: '📊',
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // REAL ESTATE (8 templates)
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'rental-property',
    name: 'Rental Property Tracker',
    category: 'Real Estate',
    description: 'Track rental income, expenses, and occupancy for investment properties',
    prompt: 'Create a rental property income tracker',
    tools: ['create_rental_property'],
    icon: '🏠',
    popular: true,
  },
  {
    id: 'mortgage-calculator',
    name: 'Mortgage Calculator',
    category: 'Real Estate',
    description: 'Calculate monthly payments, interest, and amortization schedules',
    prompt: 'Create a mortgage payment calculator',
    tools: ['create_mortgage_calculator'],
    icon: '🏦',
  },
  {
    id: 'airbnb-income',
    name: 'Airbnb Income Tracker',
    category: 'Real Estate',
    description: 'Track short-term rental income, expenses, and occupancy rates',
    prompt: 'Create an Airbnb income tracker',
    tools: ['create_airbnb_income'],
    icon: '🏡',
  },
  {
    id: 'property-comparison',
    name: 'Property Comparison',
    category: 'Real Estate',
    description: 'Compare multiple properties side by side with key metrics',
    prompt: 'Create a property comparison spreadsheet',
    tools: ['create_property_comparison'],
    icon: '⚖️',
  },
  {
    id: 'rent-roll',
    name: 'Rent Roll',
    category: 'Real Estate',
    description: 'Track tenant rent payments and balances for multi-unit properties',
    prompt: 'Create a rent roll tracker',
    tools: ['create_rent_roll'],
    icon: '📋',
  },
  {
    id: 'lease-tracker',
    name: 'Lease Tracker',
    category: 'Real Estate',
    description: 'Track lease terms, expiration dates, and renewal status',
    prompt: 'Create a lease expiration tracker',
    tools: ['create_lease_tracker'],
    icon: '📅',
  },
  {
    id: 'renovation-budget',
    name: 'Renovation Budget',
    category: 'Real Estate',
    description: 'Track renovation costs by room with contractor payments',
    prompt: 'Create a home renovation budget tracker',
    tools: ['create_renovation_budget'],
    icon: '🔨',
  },
  {
    id: 'roi-calculator',
    name: 'ROI Calculator',
    category: 'Real Estate',
    description: 'Calculate return on investment for property purchases',
    prompt: 'Create a real estate ROI calculator',
    tools: ['create_roi_calculator'],
    icon: '📈',
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // SMALL BUSINESS (10 templates)
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'sales-tracker',
    name: 'Sales Tracker',
    category: 'Small Business',
    description: 'Generate a sales tracking spreadsheet with products, revenue, and profit calculations',
    prompt: 'Create a sales tracking spreadsheet',
    tools: ['create_sales_tracker'],
    icon: '📈',
    popular: true,
  },
  {
    id: 'pnl-statement',
    name: 'Profit & Loss Statement',
    category: 'Small Business',
    description: 'Track revenue, costs, and profit over a reporting period',
    prompt: 'Create a profit and loss statement',
    tools: ['create_pnl_statement'],
    icon: '💼',
  },
  {
    id: 'cash-flow',
    name: 'Cash Flow Forecast',
    category: 'Small Business',
    description: 'Project cash inflows and outflows to avoid shortfalls',
    prompt: 'Create a cash flow forecast',
    tools: ['create_cash_flow'],
    icon: '💵',
  },
  {
    id: 'inventory-tracker',
    name: 'Inventory Tracker',
    category: 'Small Business',
    description: 'Track stock levels, reorder points, and inventory value',
    prompt: 'Create an inventory tracking spreadsheet',
    tools: ['create_inventory_tracker'],
    icon: '📦',
  },
  {
    id: 'payroll-sheet',
    name: 'Payroll Sheet',
    category: 'Small Business',
    description: 'Track employee hours, wages, deductions, and net pay',
    prompt: 'Create a payroll tracking sheet',
    tools: ['create_payroll_sheet'],
    icon: '💰',
  },
  {
    id: 'accounts-receivable',
    name: 'Accounts Receivable',
    category: 'Small Business',
    description: 'Track outstanding customer invoices and payment status',
    prompt: 'Create an accounts receivable tracker',
    tools: ['create_accounts_receivable'],
    icon: '📥',
  },
  {
    id: 'accounts-payable',
    name: 'Accounts Payable',
    category: 'Small Business',
    description: 'Track vendor bills and payment due dates',
    prompt: 'Create an accounts payable tracker',
    tools: ['create_accounts_payable'],
    icon: '📤',
  },
  {
    id: 'break-even',
    name: 'Break-Even Analysis',
    category: 'Small Business',
    description: 'Calculate break-even point for products or services',
    prompt: 'Create a break-even analysis spreadsheet',
    tools: ['create_break_even'],
    icon: '⚖️',
  },
  {
    id: 'unit-economics',
    name: 'Unit Economics',
    category: 'Small Business',
    description: 'Track CAC, LTV, and other per-unit financial metrics',
    prompt: 'Create a unit economics tracker',
    tools: ['create_unit_economics'],
    icon: '🔢',
  },
  {
    id: 'startup-costs',
    name: 'Startup Costs',
    category: 'Small Business',
    description: 'Track initial business expenses and funding sources',
    prompt: 'Create a startup costs tracker',
    tools: ['create_startup_costs'],
    icon: '🚀',
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // EDUCATION (5 templates)
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'gpa-calculator',
    name: 'GPA Calculator',
    category: 'Education',
    description: 'Calculate GPA by semester with credit hours and grades',
    prompt: 'Create a GPA calculator spreadsheet',
    tools: ['create_gpa_calculator'],
    icon: '🎓',
  },
  {
    id: 'class-schedule',
    name: 'Class Schedule',
    category: 'Education',
    description: 'Organize classes by day and time with room numbers and professors',
    prompt: 'Create a class schedule spreadsheet',
    tools: ['create_class_schedule'],
    icon: '📅',
  },
  {
    id: 'student-gradebook',
    name: 'Student Gradebook',
    category: 'Education',
    description: 'Track student grades by assignment type with weighted averages',
    prompt: 'Create a student gradebook',
    tools: ['create_student_gradebook'],
    icon: '📝',
  },
  {
    id: 'assignment-tracker',
    name: 'Assignment Tracker',
    category: 'Education',
    description: 'Track assignments with due dates, status, and grades',
    prompt: 'Create an assignment tracker',
    tools: ['create_assignment_tracker'],
    icon: '✅',
  },
  {
    id: 'scholarship-tracker',
    name: 'Scholarship Tracker',
    category: 'Education',
    description: 'Track scholarship applications, deadlines, and award amounts',
    prompt: 'Create a scholarship application tracker',
    tools: ['create_scholarship_tracker'],
    icon: '🏆',
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // HEALTH & WELLNESS (5 templates)
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'workout-log',
    name: 'Workout Log',
    category: 'Health & Wellness',
    description: 'Track exercises, sets, reps, and weights over time',
    prompt: 'Create a workout tracking log',
    tools: ['create_workout_log'],
    icon: '💪',
  },
  {
    id: 'meal-planner',
    name: 'Meal Planner',
    category: 'Health & Wellness',
    description: 'Plan weekly meals with calories and grocery list',
    prompt: 'Create a weekly meal planner',
    tools: ['create_meal_planner'],
    icon: '🍽️',
  },
  {
    id: 'weight-tracker',
    name: 'Weight Tracker',
    category: 'Health & Wellness',
    description: 'Track weight over time with daily or weekly measurements',
    prompt: 'Create a weight tracking spreadsheet',
    tools: ['create_weight_tracker'],
    icon: '⚖️',
  },
  {
    id: 'habit-tracker',
    name: 'Habit Tracker',
    category: 'Health & Wellness',
    description: 'Track daily habits with streaks and completion rates',
    prompt: 'Create a habit tracking spreadsheet',
    tools: ['create_habit_tracker'],
    icon: '✅',
  },
  {
    id: 'medical-expenses',
    name: 'Medical Expenses',
    category: 'Health & Wellness',
    description: 'Track healthcare costs including insurance, prescriptions, and visits',
    prompt: 'Create a medical expenses tracker',
    tools: ['create_medical_expenses'],
    icon: '🏥',
  },
];

export function getTemplatesByCategory(category: TemplateCategory): Template[] {
  return templates.filter(t => t.category === category);
}

export function getPopularTemplates(): Template[] {
  return templates.filter(t => t.popular);
}

export function searchTemplates(query: string): Template[] {
  const lower = query.toLowerCase();
  return templates.filter(t =>
    t.name.toLowerCase().includes(lower) ||
    t.description.toLowerCase().includes(lower) ||
    t.category.toLowerCase().includes(lower)
  );
}
