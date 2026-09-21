import pool from "./src/config/db.js";

try {
    const columns = await pool.query(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'sleep_logs'
           AND column_name IN ('date', 'sleep_date')`
    );
    const names = new Set(columns.rows.map(row => row.column_name));

    if (names.has("sleep_date") && !names.has("date")) {
        await pool.query('ALTER TABLE sleep_logs RENAME COLUMN sleep_date TO "date"');
        console.log('Renamed sleep_logs.sleep_date to sleep_logs.date');
    } else if (!names.has("date")) {
        await pool.query('ALTER TABLE sleep_logs ADD COLUMN "date" DATE NOT NULL DEFAULT CURRENT_DATE');
        console.log('Added sleep_logs.date');
    } else {
        console.log('sleep_logs.date already exists');
    }

    const duplicateRows = await pool.query(
        `SELECT user_id, "date"
         FROM sleep_logs
         GROUP BY user_id, "date"
         HAVING COUNT(*) > 1`
    );
    for (const duplicate of duplicateRows.rows) {
        await pool.query(
            `DELETE FROM sleep_logs older
             USING sleep_logs newer
             WHERE older.user_id = $1 AND older."date" = $2
               AND newer.user_id = older.user_id AND newer."date" = older."date"
               AND newer.created_at > older.created_at`,
            [duplicate.user_id, duplicate.date]
        );
    }

    const constraint = await pool.query(
        `SELECT 1 FROM pg_constraint
         WHERE conrelid = 'sleep_logs'::regclass
           AND contype = 'u'
           AND pg_get_constraintdef(oid) LIKE '%(user_id, date)%'`
    );
    if (!constraint.rows.length) {
        await pool.query('ALTER TABLE sleep_logs ADD CONSTRAINT sleep_logs_user_date_unique UNIQUE (user_id, "date")');
        console.log('Added unique constraint for sleep_logs(user_id, date)');
    }

    await pool.query('CREATE INDEX IF NOT EXISTS sleep_logs_user_date_idx ON sleep_logs (user_id, "date" DESC)');
} catch (error) {
    console.error('Sleep date migration failed:', error.message);
    process.exitCode = 1;
} finally {
    await pool.end();
}
