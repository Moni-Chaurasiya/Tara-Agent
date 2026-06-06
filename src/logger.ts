import fs from "fs";
import path from "path";

const LOG_DIR = path.join(process.cwd(), "logs");
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR);

export interface TraceEntry {
    request_id: string;
    question: string;
    tools_called: string[];
    tool_inputs: Record<string, unknown>[];
    tables_read: string[];
    latency_ms: number;
    status: "success" | "error";
    error?: string;
    answer?: string;
}

export function writeTrace(entry: TraceEntry) {
    const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n";
    fs.appendFileSync(path.join(LOG_DIR, "traces.ndjson"), line);
    console.log(
        `[${entry.request_id}] ${entry.status.toUpperCase()} | ${entry.latency_ms}ms | tools: ${entry.tools_called.join(",")} | q: "${entry.question.slice(0, 60)}"`
    );
}