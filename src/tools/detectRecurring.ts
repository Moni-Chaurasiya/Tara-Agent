import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { query } from "../db";

export const detectRecurring = createTool({
    id: "detect_recurring",
    description: `Detect merchants that look like recurring subscriptions or regular charges. A merchant is considered recurring if it appears at least 2 times in at least 2 distinct calendar months with consistent amounts. Use this when the user asks about subscriptions or recurring charges.`,
    inputSchema: z.object({
        snapshot: z.string().default("sample_a"),
        min_months: z.number().int().min(2).default(2).describe("Minimum distinct months to qualify."),
        min_occurrences: z.number().int().min(2).default(2),
    }),
    execute: async ({ context }) => {
        const { snapshot, min_months, min_occurrences } = context;

        const r = await query(
            `SELECT
         merchant_canonical AS merchant,
         COUNT(*)::int AS occurrences,
         COUNT(DISTINCT TO_CHAR(date,'YYYY-MM'))::int AS distinct_months,
         ROUND(AVG(amount),2) AS avg_amount,
         ROUND(STDDEV(amount),2) AS stddev_amount,
         MIN(date) AS first_seen,
         MAX(date) AS last_seen
       FROM transactions
       WHERE snapshot=$1
         AND LOWER(category) != 'transfer'
         AND amount > 0
       GROUP BY merchant_canonical
       HAVING COUNT(*) >= $2
         AND COUNT(DISTINCT TO_CHAR(date,'YYYY-MM')) >= $3
       ORDER BY distinct_months DESC, occurrences DESC`,
            [snapshot, min_occurrences, min_months]
        );

        // Further filter: stddev < 20% of mean (consistent amounts)
        const recurring = r.rows.filter((row) => {
            const stddev = parseFloat(row.stddev_amount || "0");
            const avg = parseFloat(row.avg_amount);
            return avg > 0 && stddev / avg < 0.2;
        });

        return {
            recurring_merchants: recurring,
            count: recurring.length,
            note: "Flagged as recurring if they appear in 2+ months with consistent amounts (stddev < 20% of mean).",
        };
    },
});