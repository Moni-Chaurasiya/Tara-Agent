import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { query } from "../db";

export const queryTransactions = createTool({
    id: "query_transactions",
    description: `Query the user's transactions. Supports filtering by category, merchant (uses canonical alias matching), date range, and exclusion of transfers/refunds. Can return a list of rows, aggregated totals, month-over-month breakdown, or top merchants. Use this for ALL spending questions.`,
    inputSchema: z.object({
        filter: z.object({
            category: z.string().optional().describe("e.g. 'food', 'travel'. Omit to include all."),
            merchant: z.string().optional().describe("Partial match against canonical merchant name."),
            date_from: z.string().optional().describe("ISO date YYYY-MM-DD inclusive."),
            date_to: z.string().optional().describe("ISO date YYYY-MM-DD inclusive."),
            exclude_transfers: z.boolean().default(true).describe("Exclude category='transfer' rows."),
            exclude_refunds: z.boolean().default(false).describe("If true, exclude negative amounts."),
            include_only_refunds: z.boolean().default(false).describe("If true, only return refunds."),
            snapshot: z.string().default("sample_a").describe("Which data snapshot to query."),
        }),
        aggregate: z.enum([
            "none",            // return individual rows (capped at 50)
            "total",           // net sum of amounts
            "by_month",        // total per calendar month
            "by_category",     // total per category
            "top_merchants",   // top N merchants by net spend
        ]).default("total"),
        top_n: z.number().int().min(1).max(20).default(5)
            .describe("For top_merchants aggregate."),
    }),
    execute: async ({ context }) => {
        const { filter, aggregate, top_n } = context;
        const params: unknown[] = [];
        const conditions: string[] = [`snapshot = $${params.push(filter.snapshot)}`];

        if (filter.exclude_transfers) {
            conditions.push(`LOWER(category) != 'transfer'`);
        }
        if (filter.exclude_refunds) {
            conditions.push(`amount >= 0`);
        }
        if (filter.include_only_refunds) {
            conditions.push(`amount < 0`);
        }
        if (filter.category) {
            conditions.push(`LOWER(category) = LOWER($${params.push(filter.category)})`);
        }
        if (filter.merchant) {
            conditions.push(
                `(LOWER(merchant_canonical) LIKE LOWER($${params.push(`%${filter.merchant}%`)})
         OR LOWER(merchant) LIKE LOWER($${params.push(`%${filter.merchant}%`)}))`
            );
        }
        if (filter.date_from) {
            conditions.push(`date >= $${params.push(filter.date_from)}::date`);
        }
        if (filter.date_to) {
            conditions.push(`date <= $${params.push(filter.date_to)}::date`);
        }

        const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

        if (aggregate === "total") {
            const r = await query(
                `SELECT
           COUNT(*)::int AS transaction_count,
           ROUND(SUM(amount),2) AS net_total,
           ROUND(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END),2) AS gross_spend,
           ROUND(SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END),2) AS total_refunds
         FROM transactions ${where}`,
                params
            );
            return r.rows[0];
        }

        if (aggregate === "by_month") {
            const r = await query(
                `SELECT
           TO_CHAR(date,'YYYY-MM') AS month,
           ROUND(SUM(amount),2) AS net_total,
           COUNT(*)::int AS count
         FROM transactions ${where}
         GROUP BY 1 ORDER BY 1`,
                params
            );
            return { rows: r.rows };
        }

        if (aggregate === "by_category") {
            const r = await query(
                `SELECT
           category,
           ROUND(SUM(amount),2) AS net_total,
           COUNT(*)::int AS count
         FROM transactions ${where}
         GROUP BY category ORDER BY net_total DESC`,
                params
            );
            return { rows: r.rows };
        }

        if (aggregate === "top_merchants") {
            params.push(top_n);
            const r = await query(
                `SELECT
           merchant_canonical AS merchant,
           ROUND(SUM(amount),2) AS net_total,
           COUNT(*)::int AS count
         FROM transactions ${where}
         GROUP BY merchant_canonical
         ORDER BY SUM(amount) DESC
         LIMIT $${params.length}`,
                params
            );
            return { rows: r.rows };
        }

        const r = await query(
            `SELECT id, date, merchant, merchant_canonical, category, amount, currency, memo
       FROM transactions ${where}
       ORDER BY date DESC LIMIT 50`,
            params
        );
        return { rows: r.rows, note: r.rows.length === 50 ? "Result capped at 50 rows." : undefined };
    },
});