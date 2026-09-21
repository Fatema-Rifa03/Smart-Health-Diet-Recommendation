import pool from "./src/config/db.js";

async function alterTable() {
    try {
        await pool.query(`
            ALTER TABLE accounts
            ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
        `);
        
        const res = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'accounts';
        `);
        console.log("Accounts table schema:", res.rows);
        
        console.log("Table updated successfully");
    } catch (err) {
        console.error("Error altering table:", err);
    } finally {
        pool.end();
    }
}

alterTable();
