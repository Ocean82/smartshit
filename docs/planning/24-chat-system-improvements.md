# Chat System Improvements: Phased Implementation Plan

This document outlines a phased approach to enhance the chat system's reliability for open-ended questions by integrating advanced AI capabilities.

## Phase 1: LLM-Powered Intent Parsing

**Goal:** Replace the keyword-based intent parser with a Large Language Model (LLM) for more semantic understanding of user queries.

**Tasks:**
- **Task 1.1: Choose and Integrate an LLM**: Select an appropriate LLM (e.g., OpenAI, Anthropic, or a locally hosted model like Llama 3) that can be integrated with the existing `SpreadsheetBrain`.
- **Task 1.2: Design LLM Prompt for Intent Extraction**: Create a robust prompt for the chosen LLM to extract `IntentType`, `target_sheet`, `target_columns`, `target_rows`, and `parameters` from user messages, returning the output in a structured JSON format consistent with `UserIntent`.
- **Task 1.3: Update `IntentParser` to Use LLM**: Modify the `shared/intentParser.ts` (and potentially `server/src/intentParser.ts` if the LLM call needs to happen server-side) to call the LLM, parse its JSON response, and map it to the `UserIntent` object.
- **Task 1.4: Implement Confidence Scoring**: Leverage the LLM's confidence score (if available) or develop a heuristic to determine the confidence of the extracted intent. This will be crucial for Phase 2.
- **Task 1.5: Unit and Integration Tests**: Write comprehensive tests to ensure the LLM-powered intent parsing is accurate and robust across a variety of open-ended questions.

## Phase 2: Clarification Dialogue and Low-Confidence Handling

**Goal:** Implement a mechanism to engage the user in a clarifying dialogue when the system has low confidence in the detected intent.

**Tasks:**
- **Task 2.1: Define Low-Confidence Threshold**: Establish a threshold for the intent confidence score below which the system will initiate a clarification dialogue.
- **Task 2.2: Develop Clarification Prompts**: Create dynamic prompts that ask the user for more information or offer multiple interpretations of their query. For example, if the intent is `ANALYZE` but the columns are unclear, the system could ask, "What aspects of the data would you like to analyze?"
- **Task 2.3: Modify `SpreadsheetBrain` for Clarification Flow**: Update the `SpreadsheetBrain`'s `process` method to detect low-confidence intents and route the conversation to a clarification sub-flow.
- **Task 2.4: Handle User Responses to Clarification**: Implement logic to interpret user's responses to clarification questions and refine the original intent. This might involve another LLM call or a simpler keyword match on the clarification response.

## Phase 3: Contextual Understanding with Conversation History

**Goal:** Enhance the intent parser to leverage conversational history for improved understanding and reduced ambiguity.

**Tasks:**
- **Task 3.1: Pass Conversation History to LLM**: Modify the LLM prompt in Phase 1 to include a summary of the recent conversation turns. This will allow the LLM to interpret new messages in context.
- **Task 3.2: Implement Contextual Entity Resolution**: Develop logic (potentially LLM-driven) to resolve ambiguous references (e.g., "it," "that," "them") based on previous turns. For example, if the previous turn mentioned "sales data," "it" in the next turn could refer to "sales data."
- **Task 3.3: Test Contextual Intent Resolution**: Design test cases that specifically target multi-turn conversations and ensure the system correctly maintains context.

## Phase 4: Vector Embeddings for "More-Like-This" Suggestions

**Goal:** Provide intelligent, context-aware suggestions for follow-up actions based on vector embeddings.

**Tasks:**
- **Task 4.1: Choose an Embedding Model**: Select a suitable text embedding model (e.g., Sentence Transformers, OpenAI Embeddings).
- **Task 4.2: Create a Knowledge Base of Actions/Questions**: Curate a list of common user questions, available tools, and skills, along with their expected intents.
- **Task 4.3: Generate Embeddings for Knowledge Base**: Compute and store vector embeddings for all items in the knowledge base.
- **Task 4.4: Implement Similarity Search**: When generating suggestions, embed the current user query (and potentially the conversation history) and perform a similarity search against the knowledge base embeddings to retrieve relevant suggestions.
- **Task 4.5: Integrate Suggestions into `ResponseBuilder`**: Modify the `ResponseBuilder` to include these contextually relevant "more-like-this" suggestions in its output.

## Phase 5: Continuous Learning and Feedback Loop

**Goal:** Establish a system for monitoring, evaluating, and continuously improving the chat system's performance, especially for open-ended questions.

**Tasks:**
- **Task 5.1: Log User Interactions and Intent Discrepancies**: Record user queries, detected intents, confidence scores, and actual actions taken. Pay special attention to instances where clarification dialogues were initiated or the `UNKNOWN` intent was triggered.
- **Task 5.2: Implement Human Feedback Mechanism**: Create a simple interface or process for users to provide feedback on the system's understanding (e.g., "Was this helpful? Yes/No").
- **Task 5.3: Data Annotation and Fine-tuning (Optional)**: Use logged data and human feedback to create a dataset for fine-tuning the LLM intent parser, further improving its accuracy over time.
- **Task 5.4: Monitor Performance Metrics**: Track key metrics such as intent recognition accuracy, clarification rate, and successful task completion for open-ended questions.

This phased approach allows for incremental improvements, enabling testing and validation at each stage before moving to the next.

## Phase 6: Future Enhancements and Continuous Improvement

This phase outlines further adjustments, enhancements, and corrections to continually improve the chat system.

### **Corrections & Robustness Improvements**

*   **Robust LLM Response Parsing**: Implement a schema validation library (e.g., Zod, Joi) to strictly validate the LLM's JSON output against the `UserIntent` interface. This will enhance error handling and type safety, preventing issues from malformed responses.
*   **Enhanced LLM Error Handling**: Improve error logging in `llmIntentParser.ts` to capture more diagnostic information, including full stack traces, for better debugging of LLM call failures.

### **Enhancements & Further Development**

*   **Dynamic Clarification Prompts**: Develop more sophisticated clarification messages that suggest specific alternatives or ask targeted questions based on the ambiguity detected. For instance, if a `targetColumn` is unclear, the system could ask for clarification on specific columns.
*   **Handle User Responses to Clarification**: Implement logic to re-evaluate user intent after they provide clarification. This involves passing the new information back to the LLM-powered intent parser to refine the original intent.
*   **Real-world Embedding Model for Suggestions**: Integrate a robust, production-ready embedding model (e.g., from OpenAI, Cohere, or a self-hosted Sentence Transformer) to generate higher-quality vector embeddings. This will significantly improve the relevance and accuracy of "more-like-this" suggestions.
*   **Dynamic Knowledge Base for Suggestions**: Automate the population of the suggestion knowledge base from available skills, tool definitions, and common user query patterns, rather than relying on a hardcoded list.
*   **Comprehensive Unit and Integration Tests**: Develop a thorough test suite covering various user queries, edge cases, and multi-turn interactions to ensure the stability and correctness of the new LLM-powered features.
*   **UI for Human Feedback**: Implement a user interface for collecting explicit feedback on the system's understanding (e.g., "Was this helpful?", intent correctness ratings). This data is crucial for continuous improvement.
*   **Persistent Logging and Analytics**: Migrate from console logging to a dedicated logging infrastructure (e.g., cloud logging, ELK stack). Establish metrics to track intent recognition accuracy, clarification rates, fallback rates, and suggestion engagement to monitor performance.

### **Adjustments**

*   **Iterative Prompt Engineering**: Continuously iterate and refine the LLM prompt in `llmIntentParser.ts` based on real-world usage data and performance metrics to optimize intent extraction accuracy.
*   **Dynamic Confidence Threshold**: Evaluate and potentially implement a dynamic `intentConfidenceThreshold` in `config.ts` that adapts based on factors like user history, query complexity, or specific domain contexts to improve the balance between proactive clarification and direct action.
