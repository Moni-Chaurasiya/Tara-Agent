import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { query } from "../db";

export const getPortfolio = createTool({
    id: "get_portfolio",
    description: `Return the total portfolio value and overall realised return across all holdings. Use when the user asks about their portfolio worth, total gains, or total return in absolute INR.`,
    inputSchema: z.object({
        snapshot: z.string().default("sample_a"),
    }),
    execute: async ({ context }) => {
        const { snapshot } = context;

        const holdings = await query(
            `SELECT h.fund_id, h.fund_name, h.units, h.purchase_date, h.purchase_nav,
              fn.nav AS current_nav, fn.nav_date AS current_nav_date
       FROM holdings h
       JOIN LATERAL (
         SELECT nav, nav_date FROM fund_navs
         WHERE fund_id = h.fund_id AND snapshot = h.snapshot
         ORDER BY nav_date DESC LIMIT 1
       ) fn ON TRUE
       WHERE h.snapshot = $1`,
            [snapshot]
        );

        if (!holdings.rows.length) return { error: "No holdings found." };

        let totalCurrentValue = 0;
        let totalCostBasis = 0;
        const detail = [];

        for (const h of holdings.rows) {
            const units = parseFloat(h.units);
            const purchaseNav = parseFloat(h.purchase_nav);
            const currentNav = parseFloat(h.current_nav);
            const currentValue = units * currentNav;
            const cost = units * purchaseNav;
            const gain = currentValue - cost;
            const ret = ((gain / cost) * 100).toFixed(2);

            totalCurrentValue += currentValue;
            totalCostBasis += cost;
            detail.push({
                fund_name: h.fund_name,
                units,
                current_value_inr: parseFloat(currentValue.toFixed(2)),
                gain_loss_inr: parseFloat(gain.toFixed(2)),
                return_pct: parseFloat(ret),
            });
        }

        const totalGain = totalCurrentValue - totalCostBasis;
        const totalReturn = ((totalGain / totalCostBasis) * 100).toFixed(2);

        return {
            total_current_value_inr: parseFloat(totalCurrentValue.toFixed(2)),
            total_cost_basis_inr: parseFloat(totalCostBasis.toFixed(2)),
            total_gain_loss_inr: parseFloat(totalGain.toFixed(2)),
            total_return_pct: parseFloat(totalReturn),
            holdings_count: detail.length,
            holdings: detail,
        };
    },
});