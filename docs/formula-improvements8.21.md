## Formula and chat improvements 8/21/2026

Most users don't know:

which cells matter
what the operation is called
whether they need SUMIFS, VLOOKUP, FILTER, INDEX/MATCH, etc.
how to describe the problem clearly

They think in terms of outcomes:

"I want to see how much I spent on groceries this month."

Not:

"Create a SUMIFS using column C where category equals Groceries and date is between A and B."

I'd use 3 layers
Layer 1: Guided Formula Builder (80% of users)

Think TurboTax.

Instead of asking for a formula:

What do you want to calculate?

○ Total
 ○ Count
 ○ Average
 ○ Find a value
 ○ Lookup information
 ○ Compare values
 ○ Filter data
 ○ Calculate dates
 ○ Custom

Then:

What data should be used?

User highlights columns or ranges.

Amount
Category
Date
Vendor


Then:

Add conditions?

Category = Groceries
Date = This Month


Live result:

Generated Formula

=SUMIFS(C:C,B:B,"Groceries",A:A,">="&DATE(...))


Most users never see the formula unless they want to.

Layer 2: Formula Templates

Create a formula bank.

Examples:

Financial
Sum expenses by category
Monthly spending
Running total
Profit margin
Tax calculation
Data Analysis
Count duplicates
Find missing entries
Lookup matching records
Percentage change
Date & Time
Days between dates
Age calculation
Next business day
Text
Extract first name
Split email domain
Combine columns

Users click:

Monthly Spending


Then answer 3-4 questions.

Much easier than prompting AI.

Layer 3: AI Conversation Builder

This is where AI shines.

User says:

I want to know which employees exceeded 40 hours this week.

AI doesn't generate a formula immediately.

Instead it asks structured followups:

I found:

Employee column: B
Hours column: D
Week column: E

Is this correct?


Then:

Would you like:

A) Flag employees over 40 hours

B) Show only employees over 40

C) Calculate overtime pay


Now AI understands intent.

The problem becomes easier.

The best idea: Formula "Recipes"

Instead of exposing formulas, expose recipes.

Example:

Recipe:
Calculate total spending

Ingredients:
✓ Amount column
✓ Category column

Optional:
✓ Date range
✓ Vendor
✓ Location


Internally this maps to:

SUM
SUMIF
SUMIFS


The user never learns formulas.

They learn outcomes.

Another killer feature

After import:

Analyze spreadsheet structure automatically.

Show:

Detected Data

Expenses Table
------------
Date
Vendor
Category
Amount

Suggested Actions

✓ Total Spending
✓ Largest Expense
✓ Monthly Trend
✓ Category Breakdown
✓ Tax Summary


The user clicks one.

No prompting.

No formulas.

No confusion.

What I would build

For smartsh!t specifically, I'd create a Spreadsheet Intent Engine rather than a Formula Generator.

Flow:

Detect table structure automatically.
Detect semantic column types.
money
dates
names
categories
percentages
Show common goals.
Let AI ask only missing questions.
Generate formula.
Hide formula by default.
Show:

"This calculates total grocery spending for the current month."

The formula becomes an implementation detail.