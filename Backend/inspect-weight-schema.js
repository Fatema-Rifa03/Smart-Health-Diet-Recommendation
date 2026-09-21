import pool from "./src/config/db.js";

try {
    const columns = await pool.query(
        `SELECT column_name, is_nullable, column_default
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'weight_entries'
         ORDER BY ordinal_position`
    );
    const constraints = await pool.query(
        `SELECT conname, pg_get_constraintdef(oid) AS definition
         FROM pg_constraint
         WHERE conrelid = 'weight_entries'::regclass`
    );
    console.log(JSON.stringify({ columns: columns.rows, constraints: constraints.rows }, null, 2));
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
} finally {
    await pool.end();
}