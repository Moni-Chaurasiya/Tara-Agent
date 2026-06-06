import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { query } from "../db";

export const computeReturns = createTool({
    id: "compute_returns",
    description: `Compute fund or holding returns.
  - mode 'period_return': fund's NAV-based return between two dates (market return, not user's).
  - mode 'realised_return': user's actual return on a specific holding (current NAV vs purchase cost).
  - mode 'rank_funds': rank all funds by period return between two dates.
  Use 'period_return' when the question is about a fund's performance over a window. Use 'realised_return' when the question is about what the user made on their investment.`,
    inputSchema: z.object({
        mode: z.enum(["period_return", "realised_return", "rank_funds"]),
        fund_id: z.string().optional().describe("Required for period_return and realised_return."),
        fund_name: z.string().optional().describe("Partial name match if fund_id unknown."),
        date_from: z.string().optional().describe("ISO date. Required for period_return and rank_funds."),
        date_to: z.string().optional().describe("ISO date. Defaults to latest available NAV."),
        snapshot: z.string().default("sample_a"),
    }),
    execute: async ({ context }) => {
        const { mode, snapshot } = context;

        if (mode === "period_return") {
            // Resolve fund
            let fundId = context.fund_id;
            if (!fundId && context.fund_name) {
                const r = await query(
                    `SELECT DISTINCT fund_id FROM fund_navs
           WHERE LOWER(fund_name) LIKE LOWER($1) AND snapshot=$2 LIMIT 1`,
                    [`%${context.fund_name}%`, snapshot]
                );
                if (!r.rows.length) return { error: "Fund not found." };
                fundId = r.rows[0].fund_id;
            }
            if (!fundId) return { error: "Provide fund_id or fund_name." };

            const navFrom = await query(
                `SELECT nav, nav_date FROM fund_navs
         WHERE fund_id=$1 AND snapshot=$2 AND nav_date <= $3::date
         ORDER BY nav_date DESC LIMIT 1`,
                [fundId, snapshot, context.date_from]
            );
            const navTo = await query(
                `SELECT nav, nav_date, fund_name FROM fund_navs
         WHERE fund_id=$1 AND snapshot=$2 AND nav_date <= $3::date
         ORDER BY nav_date DESC LIMIT 1`,
                [fundId, snapshot, context.date_to || "2099-01-01"]
            );
            if (!navFrom.rows.length || !navTo.rows.length)
                return { error: "NAV data not available for specified dates." };

            const from = parseFloat(navFrom.rows[0].nav);
            const to = parseFloat(navTo.rows[0].nav);
            const returnPct = ((to - from) / from * 100).toFixed(2);

            return {
                fund_id: fundId,
                fund_name: navTo.rows[0].fund_name,
                from_date: navFrom.rows[0].nav_date,
                to_date: navTo.rows[0].nav_date,
                nav_from: from,
                nav_to: to,
                period_return_pct: parseFloat(returnPct),
                note: "Period return = (NAV_to - NAV_from) / NAV_from × 100. This is the fund's market return, not your personal return.",
            };
        }

        if (mode === "realised_return") {
            let fundId = context.fund_id;
            if (!fundId && context.fund_name) {
                const r = await query(
                    `SELECT DISTINCT fund_id FROM holdings
           WHERE LOWER(fund_name) LIKE LOWER($1) AND snapshot=$2 LIMIT 1`,
                    [`%${context.fund_name}%`, snapshot]
                );
                if (!r.rows.length) return { error: "Holding not found." };
                fundId = r.rows[0].fund_id;
            }

            const hRow = await query(
                `SELECT units, purchase_date, purchase_nav, fund_name
         FROM holdings WHERE fund_id=$1 AND snapshot=$2 LIMIT 1`,
                [fundId, snapshot]
            );
            if (!hRow.rows.length) return { error: "No holding found for this fund." };

            const h = hRow.rows[0];
            const units = parseFloat(h.units);
            const purchaseNav = parseFloat(h.purchase_nav);

            // Get latest NAV
            const latestNav = await query(
                `SELECT nav, nav_date FROM fund_navs
         WHERE fund_id=$1 AND snapshot=$2
         ORDER BY nav_date DESC LIMIT 1`,
                [fundId, snapshot]
            );
            if (!latestNav.rows.length) return { error: "No NAV data found." };

            const currentNav = parseFloat(latestNav.rows[0].nav);
            const currentValue = units * currentNav;
            const costBasis = units * purchaseNav;
            const gainLoss = currentValue - costBasis;
            const returnPct = ((gainLoss) / costBasis * 100).toFixed(2);

            return {
                fund_id: fundId,
                fund_name: h.fund_name,
                units,
                purchase_date: h.purchase_date,
                purchase_nav: purchaseNav,
                current_nav: currentNav,
                current_nav_date: latestNav.rows[0].nav_date,
                cost_basis_inr: parseFloat(costBasis.toFixed(2)),
                current_value_inr: parseFloat(currentValue.toFixed(2)),
                gain_loss_inr: parseFloat(gainLoss.toFixed(2)),
                realised_return_pct: parseFloat(returnPct),
                note: "Realised return = (current_value - cost_basis) / cost_basis × 100. This is YOUR return on YOUR investment.",
            };
        }

        if (mode === "rank_funds") {
            const allFunds = await query(
                `SELECT DISTINCT fund_id, fund_name FROM fund_navs WHERE snapshot=$1`,
                [snapshot]
            );

            const results = [];
            for (const fund of allFunds.rows) {
                const navFrom = await query(
                    `SELECT nav, nav_date FROM fund_navs
           WHERE fund_id=$1 AND snapshot=$2 AND nav_date <= $3::date
           ORDER BY nav_date DESC LIMIT 1`,
                    [fund.fund_id, snapshot, context.date_from || "2024-01-01"]
                );
                const navTo = await query(
                    `SELECT nav, nav_date FROM fund_navs
           WHERE fund_id=$1 AND snapshot=$2 AND nav_date <= $3::date
           ORDER BY nav_date DESC LIMIT 1`,
                    [fund.fund_id, snapshot, context.date_to || "2099-01-01"]
                );
                if (!navFrom.rows.length || !navTo.rows.length) continue;

                const from = parseFloat(navFrom.rows[0].nav);
                const to = parseFloat(navTo.rows[0].nav);
                const ret = parseFloat(((to - from) / from * 100).toFixed(2));
                results.push({ fund_id: fund.fund_id, fund_name: fund.fund_name, return_pct: ret });
            }

            results.sort((a, b) => b.return_pct - a.return_pct);
            const spread = results.length >= 2
                ? parseFloat((results[0].return_pct - results[results.length - 1].return_pct).toFixed(2))
                : 0;

            return { ranked: results, spread_pct: spread };
        }
    },
});