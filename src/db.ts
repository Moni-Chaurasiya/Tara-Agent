import { Pool } from "pg";
import dotenv from "dotenv";
dotenv.config();

export const pool = new Pool({
    connectionString: process.env.DATABASE_URL ||
        "postgres://postgres:postgres@localhost:5432/provue_tara",
    max: 10,
});

export async function query(sql: string, params?: unknown[]) {
    const client = await pool.connect();
    try {
        return await client.query(sql, params);
    } finally {
        client.release();
    }
}