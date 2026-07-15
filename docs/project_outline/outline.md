# SmartSht — End Goal Architecture (v2.0+)

> **Status:** This is the LONG-TERM VISION. Do not implement until the foundation is proven with real users.  
> **Working toward:** Each phase below will be unlocked as the product gains traction and revenue justifies the engineering investment.  
> **Current focus:** See `roadmap-v1.md` for the immediate, scaled-down execution plan.

---

Instead, use a Sparse Matrix / EAV (Entity-Attribute-Value) model in Postgres.

The Ideal Postgres Schema:

CREATE TABLE spreadsheets (

    id UUID PRIMARY KEY,

    name VARCHAR(255),

    created_at TIMESTAMP DEFAULT NOW()

);

CREATE TABLE cells (

    spreadsheet_id UUID REFERENCES spreadsheets(id) ON DELETE CASCADE,

    row_index INT NOT NULL,

    col_index INT NOT NULL,

    raw_value TEXT,       -- What the user typed (e.g., "100" or "=SUM(A1:A5)")

    computed_value TEXT,  -- The calculated result (e.g., "500")

    data_type VARCHAR(20),-- 'number', 'string', 'boolean', 'formula', 'date'

    PRIMARY KEY (spreadsheet_id, row_index, col_index)

);





this layout is a cheat code for Agents:

Dynamic Everything: To add a column or a row, your backend doesn't alter tables (ALTER TABLE). It just inserts a new coordinate.

Perfect Context Compression: When your Cursor-style agent needs to see the sheet, you don't send a massive grid layout. You can run a simple query to fetch only populated cells, converting them into a compact JSON payload like {"A1": 10, "A2": "=A1*2"}. This keeps your token count tiny.

The Twin Engine Challenge: Execution vs. Evaluation

In your architecture, you need two separate "engines" working together. Understanding who does what prevents your application from lagging.

The Evaluation Engine (The Math)

Where it lives: The Browser (Frontend) and the Backend Server.

What it does: This handles the deterministic, real-time math. If a user changes cell A1, this engine recalculates A2 instantly.

The Tooling: Don't write a formula parser from scratch. Use Hyperformula (by Handsontree) or MFormula. They manage dependency graphs natively. If cell C1 depends on B1, which depends on A1, these engines handle the chain reaction flawlessly. 



The Execution Engine (The Agent)

Where it lives: The LLM API + your t3.large.

What it does: This handles the probabilistic, creative requests ("Clean this data," "Generate a growth projection," "Build a template for an inventory tracker").

The Agent Toolset: Give your agent "Tools" (Function Calling). The agent should never edit the database directly. Instead, give the agent API functions like update_cell(row, col, value) or insert_column(after_col_index).



Making it Feel Like "Cursor for Spreadsheets"

To get that magical, fast, autonomous experience, focus heavily on these three UX and technical implementations:

The Ghost Cell Preview (Streaming UI): When Cursor writes code, you see it typing in real-time. When your agent is writing a complex sequence or formula across dozens of cells, do not make the user wait for the backend to finish. Stream the cell updates via WebSockets. Render the incoming data in a "ghostly/italic" font state in the grid so the user can see the agent actively calculating and writing data cell-by-cell.

The "Diff" View: If an agent changes an entire column's formulas, show a side-by-side or highlighted grid color layout showing exactly what changed, allowing the user to press Tab to accept or Esc to reject the agent's rewrite.

Contextual Anchor (Where is the Cursor?): Just like Cursor looks at your currently active file, your agent needs to know the user's selected cell range. If a user highlights cells B2:D20 and types "format this as currency and fix anomalies," your UI must pass the targeted coordinate bounding box as primary context to the agent.


Smartsht’s biggest strength is that it isn’t just a grid; it is a relational database disguised as a spreadsheet that lets users build automated workflows, building an AI-first version of this from scratch, you have a massive opportunity. Here is how to architect your platform to beat legacy tools in the AI era.
------------------------------
## The Smartsht Advantage: Structure is King
Smartsht forces users into strict column types (e.g., a column must be a "Date", a "Dropdown List", or "Contact List"). While traditional Excel users sometimes find this restrictive, this is your ultimate secret weapon for AI agents.

   1. Perfect Context for the LLM: Because columns have strict types, your agent instantly understands the data schema. It doesn't have to guess if 05/06/2026 is a date or a string.
   2. Deterministic Validation: When your agent generates an automated update, your system can validate the data before it hits the database. If the agent generates a text string for a "Status Dropdown" column that doesn't exist, your backend can reject it or auto-correct it.

------------------------------
## Designing the "Smartsht IDE Agent" Framework
To make the app feel like a true IDE for project management and relational grids,  autonomous agents need to operate on three distinct levels, just like developer tools do.

       [ USER PROMPT ]
              │
              ▼
   ┌──────────────────────┐
   │    The Orchestrator  │ (Classifies the user's intent)
   └──────────┬───────────┘
              │
      ┌───────┼───────┐
      ▼       ▼       ▼
   [Level 1] [Level 2] [Level 3]

## Level 1: Structure & Schema Agents (The Architect)

* User Prompt: "Build me an onboarding checklist template for new engineers."
* What the Agent does: It doesn't just fill in rows. It acts like an IDE project wizard. It decides what columns are needed (Task Name, Assignee, Due Date, Status), sets up the column data types, creates the dropdown options, and populates the initial baseline rows.

## Level 2: Data & Calculation Agents (The Engineer)

* User Prompt: "Calculate the health of each project based on how many tasks are past their due date."
* What the Agent does: It writes the formulas. Because you are building a custom engine, the agent will write formulas using your custom syntax (or cross-sheet references) to dynamically link columns together.

## Level 3: Workflow & Automation Agents (The DevOps)

* User Prompt: "When a task status changes to 'Blocked', alert the project manager via email and highlight the row in red."
* What the Agent does: This is where you destroy classic Smartsheet. Instead of the user clicking through a complex, manual workflow builder UI, your agent writes a JSON-based workflow script that your backend executes whenever database triggers fire.

------------------------------
## 3 Technical Pillars to Perfect Your Platform
 prioritize these three architectural implementations to ensure it scales:

* Column-Level Metadata: In Postgres schema, ensure you have a robust columns table tracking constraints. Store things like allow_bulk_edit, validation_regex, and ai_description. The ai_description lets users tell the AI what the column is for (e.g., "This column tracks internal budget overrides"), which the agent reads as system prompt context.
* The "Workspace" Agent Context: In Smartsheet, sheets don't live in a vacuum—they live in workspaces and reference each other. Your agent needs a RAG (Retrieval-Augmented Generation) vector index of the entire user workspace. If a user says "Pull the latest figures from the Q2 Budget sheet into this grid," your agent needs to search the workspace, find the correct sheet ID, map its columns, and write the cross-sheet formula.
* Granular Action Logs (For Rollbacks): When an autonomous agent modifies a project board, it might edit 50 rows at once. If it makes a mistake, the user will panic. You must build a transaction log system. Every agent action must be grouped under a single transaction_id so the user can hit "Undo" and reverse all 50 cell modifications in one click.

 here is the technical advice to make smartsht.com an AI-first juggernaut.
------------------------------
## 1. Shift from "Chat Bot" to "Inline Agent Mutations"
Most spreadsheet apps throw a basic AI chat sidebar on the screen. The user types something, and the AI suggests a formula. That is not the Cursor style.
To build a true IDE experience, your frontend grid must support diff highlights and ghost-text streaming:

* 
* The Mutation Engine: When a user triggers the agent, your frontend passes the active selection (row_start, col_start, row_end, col_end) and the prompt. the t3.large backend sends the schema and the snippet of data to a model like one of the finetuned modedels i have either in the project already or i have a small collection located at "D:\spreadsht_workbook".
* The Payload Structure: Teach your agent to respond strictly in a structured mutation array:

[
  {"action": "SET_CELL", "row": 4, "col": 2, "value": "=B4*0.15"},
  {"action": "ADD_COLUMN", "name": "AI_Risk_Score", "type": "NUMBER"}
]

* The UI Treatment: Instead of instantly changing Postgres, your WebSocket backend streams these updates to the browser. The browser renders the changes in an italicized, translucent color (Ghost text). The user presses Ctrl + Enter to commit the transaction to Postgres, or Esc to reject it.
* 

------------------------------
## 2. Leverage a Sparse Vector Index for Search/RAG
If a user wants an agent to join data from two different tabs or sheets, passing every cell of both sheets to an LLM will break your backend and your wallet.
Because you own the infrastructure, you can set up pgvector inside your Postgres instance:

* 
* Embed the Metadata: When a user creates a new sheet or column, generate text embeddings of the metadata (e.g., "Sheet: Q4 Sales, Column: ARR, Type: Currency").
* The Workflow: When the user prompts: "Look up the tax rates from our compliance sheet and apply them here," your backend searches the metadata vector index first. It identifies the correct target sheet ID and column positions, extracts only those specific vectors/cells, and feeds that highly compressed context to the agent.
* 

------------------------------
## 3. Move Execute Off the Main Database
Right now, you are hosting on a t3.large. If you give an autonomous agent the power to run large calculations, loops, or complex updates, a single bad loop will run up your CPU usage, deplete your burstable credits, and lock your entire application.

* 
* Isolate Execution: Keep your t3.large as the API routing gateway and frontend server.
* Worker Pools: When the agent returns a massive mutation array (e.g., modifying 10,000 cells), offload the processing to an independent queue (like Celery with Redis, or AWS Lambda). Let the worker pool process the changes in batches, write them to Postgres, and push a completion signal back via WebSockets.
* 

------------------------------
## 4. Build a Native "Formula Compiler"
Since you built this from scratch, do not rely on standard JavaScript evaluation for heavy agent-generated code. Build a server-side dependency graph.
If an agent writes a formula into cell A1 that impacts 5,000 downstream cells, your backend should process that computation deterministically using a lightning-fast graph engine before updating the UI grid.


------------------------------
## 5. Asynchronous Task Queuing

If a user asks for a structural alteration, don't let the model process it directly inside the main request thread.

**The Strategy:** Offload heavy model execution and bulk mutations to a background worker queue (BullMQ + Redis for Node.js, or AWS Lambda for serverless bursts).

**The Payoff:** The API remains snappy and immediately tells the user "Processing...", while the worker handles model inference and bulk DB writes at its own pace without dropping network requests.

**Implementation path:**
- v1 (current): Node.js async I/O + SSE streaming is sufficient. LLM calls are non-blocking `fetch()`. Cell sync fires after response. No queue needed yet.
- v2 (scale trigger: 1000+ cell mutations per request): Add BullMQ (Redis-backed) on the same EC2. Heavy mutation arrays get queued; completion pushes via WebSocket.
- v3 (scale trigger: 50+ concurrent agent sessions): Move inference to Lambda or dedicated GPU workers. Main API becomes a thin routing layer.

**Current architecture is non-blocking because:**
- Express + Node event loop handles concurrent requests without thread blocking
- All LLM calls (Ollama, cloud BYOK) are async network I/O
- Cell sync to Postgres is fire-and-forget after HTTP response
- SSE streaming gives users immediate feedback during inference

------------------------------

we can then look at a fast node-based execution layout for handling those streaming cell mutations, and the best UX design patterns for showing agent errors inside a spreadsheet grid.







