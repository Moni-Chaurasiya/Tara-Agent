import fs from "fs";
import path from "path";
import dotenv from "dotenv";
dotenv.config();

import { pool, query } from "../src/db";
import { createSchema } from "../src/schema";


function cleanMemo(memo: string): string {
    return memo
        .replace(/UPI\/\d+\//g, "")
        .replace(/NEFT\/.+?\//g, "")
        .replace(/\d{6,}/g, "")
        .replace(/[@#\*]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function extractMerchantTokens(raw: string): string[] {
    const cleaned = cleanMemo(raw)
        .toUpperCase()
        .replace(/[^A-Z0-9 ]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length > 2);
    return cleaned;
}

function canonicalize(merchant: string): string {

    const tokens = extractMerchantTokens(merchant).slice(0, 2);
    if (tokens.length === 0) return merchant.trim();
    return tokens
        .map((t) => t.charAt(0) + t.slice(1).toLowerCase())
        .join(" ");
}

function buildAliasMap(merchants: string[]): Map<string, string> {

    const groups = new Map<string, string[]>();
    for (const m of merchants) {
        const tokens = extractMerchantTokens(m);
        const key = tokens[0] || m.toUpperCase();
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(m);
    }

    const aliasMap = new Map<string, string>();
    for (const [, group] of groups) {

        const canonical = group.reduce((a, b) =>
            canonicalize(a).length <= canonicalize(b).length ? a : b
        );
        const canonName = canonicalize(canonical);
        for (const alias of group) {
            aliasMap.set(alias.trim(), canonName);
        }
    }
    return aliasMap;
}


async function ingest(dataDir: string) {
    const snapshot = path.basename(dataDir);

    console.log(`\n Ingesting snapshot: ${snapshot} from ${dataDir}`);

    const txFile = path.join(dataDir, "transactions.json");
    const fundsFile = path.join(dataDir, "funds.json");
    const holdingsFile = path.join(dataDir, "holdings.json");

    const transactions: Array<{
        id: string; date: string; merchant: string;
        category: string; amount: number; currency: string; memo?: string;
    }> = JSON.parse(fs.readFileSync(txFile, "utf-8"));

    const funds: Array<{
        id: string; name: string; category: string;
        nav: Array<{ date: string; value: number }>;
    }> = JSON.parse(fs.readFileSync(fundsFile, "utf-8"));

    const holdings: Array<{
        fund_id: string; fund_name: string; units: number;
        purchase_date: string; purchase_nav: number;
    }> = JSON.parse(fs.readFileSync(holdingsFile, "utf-8"));

    await createSchema();


    await query(`DELETE FROM transactions      WHERE snapshot = $1`, [snapshot]);
    await query(`DELETE FROM fund_navs         WHERE snapshot = $1`, [snapshot]);
    await query(`DELETE FROM holdings          WHERE snapshot = $1`, [snapshot]);
    await query(`DELETE FROM merchant_aliases  WHERE snapshot = $1`, [snapshot]);

    const allMerchants = [...new Set(transactions.map((t) => t.merchant))];
    const aliasMap = buildAliasMap(allMerchants);

    for (const [alias, canonical] of aliasMap) {
        await query(
            `INSERT INTO merchant_aliases(alias, canonical, snapshot)
       VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
            [alias, canonical, snapshot]
        );
    }
    console.log(` ${aliasMap.size} merchant aliases`);


    let txCount = 0;
    for (const tx of transactions) {
        const canonical = aliasMap.get(tx.merchant.trim()) ||
            canonicalize(tx.merchant);
        await query(
            `INSERT INTO transactions(id,date,merchant,merchant_canonical,category,amount,currency,memo,snapshot)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO NOTHING`,
            [
                tx.id,
                tx.date,
                tx.merchant,
                canonical,
                tx.category || "uncategorized",
                tx.amount,
                tx.currency || "INR",
                tx.memo || null,
                snapshot,
            ]
        );
        txCount++;
    }
    console.log(` ${txCount} transactions`);


    let navCount = 0;
    for (const fund of funds) {
        for (const point of fund.nav) {
            await query(
                `INSERT INTO fund_navs(fund_id,fund_name,category,nav_date,nav,snapshot)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
                [fund.id, fund.name, fund.category, point.date, point.value, snapshot]
            );
            navCount++;
        }
    }
    console.log(`${navCount} NAV points across ${funds.length} funds`);

    for (const h of holdings) {
        await query(
            `INSERT INTO holdings(fund_id,fund_name,units,purchase_date,purchase_nav,snapshot)
           VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (fund_id, snapshot) DO NOTHING`,
            [h.fund_id, h.fund_name, h.units, h.purchase_date, h.purchase_nav, snapshot]
        );
    }
    console.log(`${holdings.length} holdings`);

    console.log(`Snapshot ${snapshot} ingested.\n`);
}


const dataDir = process.env.DATA_DIR || "./data/sample_a";
ingest(dataDir)
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => pool.end());