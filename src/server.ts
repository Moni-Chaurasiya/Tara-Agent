import express from "express";
import dotenv from "dotenv";
dotenv.config();

import { taraAgent } from "./agent";
import { writeTrace } from "./logger";
import { createSchema } from "./schema";
import { pool } from "./db";
import { v4 as uuidv4 } from "uuid";

const app = express();
app.use(express.json());


app.post("/ask", async (req, res) => {
    const requestId = uuidv4();
    const start = Date.now();
    const { question } = req.body;

    if (!question || typeof question !== "string") {
        return res.status(400).json({ error: "question is required and must be a string." });
    }

    const toolsCalled: string[] = [];
    const toolInputs: Record<string, unknown>[] = [];

    try {
        const result = await taraAgent.generate(question, {
            onStepFinish: (step) => {
                if (step.toolCalls) {
                    for (const tc of step.toolCalls) {
                        toolsCalled.push(tc.toolName);
                        // Sanitize: never log sensitive fields
                        toolInputs.push({ tool: tc.toolName, args: tc.args });
                    }
                }
            },
        });

        const answer = result.text;
        const latency = Date.now() - start;

        writeTrace({
            request_id: requestId,
            question,
            tools_called: toolsCalled,
            tool_inputs: toolInputs,
            tables_read: [...new Set(toolsCalled.flatMap(t => {
                if (t === "query_transactions") return ["transactions", "merchant_aliases"];
                if (t === "compute_returns") return ["fund_navs", "holdings"];
                if (t === "get_portfolio") return ["holdings", "fund_navs"];
                if (t === "detect_recurring") return ["transactions"];
                return [];
            }))],
            latency_ms: latency,
            status: "success",
            answer,
        });

        return res.json({ answer });
    } catch (err: unknown) {
        const latency = Date.now() - start;
        const message = err instanceof Error ? err.message : String(err);

        writeTrace({
            request_id: requestId,
            question,
            tools_called: toolsCalled,
            tool_inputs: toolInputs,
            tables_read: [],
            latency_ms: latency,
            status: "error",
            error: message,
        });

        return res.status(500).json({ error: "Internal error. Check logs for trace." });
    }
});


app.get("/health", (_req, res) => {
    res.json({ status: "ok", agent: "Tara" });
});


const PORT = parseInt(process.env.PORT || "3000", 10);

async function boot() {
    await createSchema();
    app.listen(PORT, () => {
        console.log(`\n Tara is running at http://localhost:${PORT}`);
        console.log(`   POST /ask with { "question": "..." }`);
    });
}

boot().catch((e) => {
    console.error("Failed to start:", e);
    process.exit(1);
});

process.on("SIGTERM", async () => {
    await pool.end();
    process.exit(0);
});