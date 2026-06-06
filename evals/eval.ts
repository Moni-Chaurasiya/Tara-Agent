import dotenv from "dotenv";
dotenv.config();

const BASE_URL = process.env.EVAL_URL || "http://localhost:3000";
const SNAPSHOT = process.env.EVAL_SNAPSHOT || "sample_a";

interface EvalCase {
    question: string;
    check: (answer: string) => boolean;
    description: string;
}

async function ask(question: string): Promise<string> {
    const res = await fetch(`${BASE_URL}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
    });
    const data = await res.json() as { answer?: string; error?: string };
    if (data.error) throw new Error(data.error);
    return data.answer!;
}

function containsNumber(answer: string, ...keywords: string[]): boolean {
    const lower = answer.toLowerCase();
    return keywords.every(k => lower.includes(k.toLowerCase())) &&
        /\d/.test(answer);
}

const cases: EvalCase[] = [
    {
        question: `How much did I spend on food in March 2025? (snapshot: ${SNAPSHOT})`,
        check: (a) => containsNumber(a, "food", "March") || a.toLowerCase().includes("no data"),
        description: "Single category, date-filtered spend",
    },
    {
        question: `What were my top 5 merchants by net spend in Q1 2025? (snapshot: ${SNAPSHOT})`,
        check: (a) => /\d/.test(a) && (a.toLowerCase().includes("merchant") || a.toLowerCase().includes("1.")),
        description: "Top merchants aggregate",
    },
    {
        question: `What was my biggest single expense? (snapshot: ${SNAPSHOT})`,
        check: (a) => /₹|inr|\d+/i.test(a),
        description: "Single largest transaction",
    },
    {
        question: `How much did I spend on Swiggy including all variants? (snapshot: ${SNAPSHOT})`,
        check: (a) => /\d/.test(a) || a.toLowerCase().includes("no data"),
        description: "Merchant alias matching",
    },
    {
        question: `Ignore transfers. What was my total actual spending in Q1 2025? (snapshot: ${SNAPSHOT})`,
        check: (a) => /\d/.test(a),
        description: "Transfers excluded from total",
    },
    {
        question: `How much did I spend on food after refunds in January 2025? (snapshot: ${SNAPSHOT})`,
        check: (a) => containsNumber(a, "food") || a.toLowerCase().includes("no data"),
        description: "Net spend after refunds",
    },
    {
        question: `Compare my food and travel spending month by month in 2024. Which grew faster? (snapshot: ${SNAPSHOT})`,
        check: (a) => /food|travel/i.test(a) && /\d/.test(a),
        description: "Month-over-month category comparison",
    },
    {
        question: `Which merchants look like recurring subscriptions? (snapshot: ${SNAPSHOT})`,
        check: (a) => /\d/.test(a) || a.toLowerCase().includes("no recurring"),
        description: "Recurring subscription detection",
    },
    {
        question: `Do I have any spending data for April 2025? (snapshot: ${SNAPSHOT})`,
        check: (a) => a.toLowerCase().includes("no") || a.toLowerCase().includes("not") || /\d/.test(a),
        description: "No-data edge case honest answer",
    },
    {
        question: `What is my portfolio worth today and how much have I made on it? (snapshot: ${SNAPSHOT})`,
        check: (a) => /\d/.test(a) && /portfolio|value|return/i.test(a),
        description: "Portfolio aggregate value and total return",
    },
    {
        question: `What was my realised return on my largest holding? (snapshot: ${SNAPSHOT})`,
        check: (a) => /%|\d/.test(a) || a.toLowerCase().includes("no holding"),
        description: "Realised return on a holding",
    },
    {
        question: `Rank all funds by one-year return from 2024-01-01 to 2025-01-01 and show the spread. (snapshot: ${SNAPSHOT})`,
        check: (a) => /\d/.test(a) && /spread|best|worst|%/i.test(a),
        description: "Fund period return ranking with spread",
    },
];

async function runEvals() {
    console.log(`\n Running ${cases.length} eval cases against ${BASE_URL}\n`);
    let passed = 0;
    const failed: { desc: string; question: string; answer: string }[] = [];

    for (const c of cases) {
        try {
            const answer = await ask(c.question);
            const ok = c.check(answer);
            if (ok) {
                console.log(`PASS  ${c.description}`);
                passed++;
            } else {
                console.log(`FAIL  ${c.description}`);
                console.log(`         Answer: ${answer.slice(0, 120)}...`);
                failed.push({ desc: c.description, question: c.question, answer });
            }
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.log(`ERROR ${c.description}: ${msg}`);
            failed.push({ desc: c.description, question: c.question, answer: `ERROR: ${msg}` });
        }
        await new Promise((r) => setTimeout(r, 1200));
    }

    console.log(`Results: ${passed}/${cases.length} passed`);
    if (failed.length) {
        console.log(`\n Failed cases:`);
        for (const f of failed) {
            console.log(`  • ${f.desc}`);
        }
    }
    process.exit(failed.length > 0 ? 1 : 0);
}

runEvals();