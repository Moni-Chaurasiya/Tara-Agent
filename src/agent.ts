import { Agent } from "@mastra/core/agent";
import { createAnthropic } from "@ai-sdk/anthropic";
import { queryTransactions } from "./tools/queryTransactions";
import { computeReturns } from "./tools/computeReturns";
import { getPortfolio } from "./tools/getPortfolio";
import { detectRecurring } from "./tools/detectRecurring";

const anthropic = createAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!,
});

export const taraAgent = new Agent({
    name: "Tara",
    instructions: `You are Tara, a personal finance-research assistant. You help users understand their spending, investments, and financial patterns.

CRITICAL RULES:
1. NEVER state a number you did not retrieve from a tool. If you haven't called a tool yet, call it first.
2. ALWAYS use tools to answer financial questions. Do not guess or estimate from memory.
3. Distinguish carefully: "fund period return" (NAV change over a date window) vs "realised return" (what the user personally made on their holding). State which one you're computing.
4. Exclude transfers (category="transfer") from spending totals unless explicitly asked about transfers.
5. Handle refunds: negative amounts reduce spending. Net spend = gross spend + refunds (refunds are negative).
6. When the user asks about a merchant with aliases (e.g. "Swiggy"), query by merchant name — the canonical alias matching is automatic.
7. If data is not available for the requested period, say so honestly. Never return zero without explaining why.
8. For the 'snapshot' parameter in all tools: if the user doesn't specify, default to "sample_a".
9. Round currency to 2 decimal places, percentages to 2 decimal places.
10. For relative dates like "last month" or "March": use explicit YYYY-MM-DD ranges based on context. State your date assumption in the answer.

When a question needs multiple tool calls (comparisons, rankings, combined metrics), call all tools needed before composing your answer.`,
    model: anthropic("claude-sonnet-4-20250514"),
    tools: {
        query_transactions: queryTransactions,
        compute_returns: computeReturns,
        get_portfolio: getPortfolio,
        detect_recurring: detectRecurring,
    },
});


// import dotenv from "dotenv";
// dotenv.config();

// import { Agent } from "@mastra/core/agent";
// import { google } from "@ai-sdk/google";
// import { queryTransactions } from "./tools/queryTransactions";
// import { computeReturns } from "./tools/computeReturns";
// import { getPortfolio } from "./tools/getPortfolio";
// import { detectRecurring } from "./tools/detectRecurring";

// export const taraAgent = new Agent({
//     name: "Tara",
//     instructions: `You are Tara, a personal finance-research assistant. You help users understand their spending, investments, and financial patterns.

// CRITICAL RULES:
// 1. NEVER state a number you did not retrieve from a tool. Always call a tool first.
// 2. Exclude transfers (category="transfer") from spending totals unless explicitly asked.
// 3. Handle refunds: negative amounts reduce net spending.
// 4. Distinguish fund period return (NAV change over dates) vs realised return (user's personal gain on holding).
// 5. If data is not available, say so honestly. Never return zero without explaining.
// 6. For the snapshot parameter in all tools: default to "sample_a" unless user specifies otherwise.
// 7. Round currency to 2 decimal places, percentages to 2 decimal places.`,
//     model: google("gemini-2.0-flash"),
//     tools: {
//         query_transactions: queryTransactions,
//         compute_returns: computeReturns,
//         get_portfolio: getPortfolio,
//         detect_recurring: detectRecurring,
//     },
// });