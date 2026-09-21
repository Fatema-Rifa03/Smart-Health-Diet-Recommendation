import pool from "./src/config/db.js";

try {
    const columns = await pool.query(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'weight_entries'`
    );
    const names = new Set(columns.rows.map(row => row.column_name));

    if (names.has("measured_on") && !names.has("date")) {
        await pool.query('ALTER TABLE weight_entries RENAME COLUMN measured_on TO "date"');
        console.log("Renamed weight_entries.measured_on to weight_entries.date");
    } else if (names.has("measured_on") && names.has("date")) {
        await pool.query(`UPDATE weight_entries SET "date" = measured_on`);
        await pool.query('DROP VIEW IF EXISTS user_weight_progress');
        const legacyConstraints = await pool.query(
            `SELECT conname, pg_get_constraintdef(oid) AS definition
             FROM pg_constraint
             WHERE conrelid = 'weight_entries'::regclass AND contype = 'u'`
        );
        for (const constraint of legacyConstraints.rows) {
            if (constraint.definition.includes("measured_on")) {
                await pool.query(`ALTER TABLE weight_entries DROP CONSTRAINT "${constraint.conname.replaceAll('"', '""')}"`);
                console.log(`Removed legacy constraint ${constraint.conname}`);
            }
        }
        const legacyIndexes = await pool.query(
            `SELECT indexname, indexdef
             FROM pg_indexes
             WHERE schemaname = 'public' AND tablename = 'weight_entries'`
        );
        for (const index of legacyIndexes.rows) {
            if (index.indexdef.includes('measured_on')) {
                await pool.query(`DROP INDEX IF EXISTS "${index.indexname.replaceAll('"', '""')}"`);
                console.log(`Removed legacy index ${index.indexname}`);
            }
        }
        await pool.query('ALTER TABLE weight_entries DROP COLUMN measured_on');
        console.log("Removed obsolete weight_entries.measured_on column");
    } else if (!names.has("date")) {
        await pool.query('ALTER TABLE weight_entries ADD COLUMN "date" DATE NOT NULL DEFAULT CURRENT_DATE');
        console.log("Added weight_entries.date");
    }

    const indexes = await pool.query(
        `SELECT indexname, indexdef
         FROM pg_indexes
         WHERE schemaname = 'public' AND tablename = 'weight_entries'`
    );

    for (const index of indexes.rows) {
        const definition = index.indexdef.toLowerCase().replace(/\s+/g, " ");
        const isSingleUserUnique = definition.includes("unique") &&
            definition.includes("(user_id)") &&
            !definition.includes("measured_on");
        if (isSingleUserUnique) {
            await pool.query(`DROP INDEX IF EXISTS "${index.indexname.replaceAll('"', '""')}"`);
            console.log(`Removed old unique index ${index.indexname}`);
        }
    }

    const constraints = await pool.query(
        `SELECT conname, pg_get_constraintdef(oid) AS definition
         FROM pg_constraint
         WHERE conrelid = 'weight_entries'::regclass AND contype = 'u'`
    );
    for (const constraint of constraints.rows) {
        const definition = constraint.definition.toLowerCase().replace(/\s+/g, " ");
        if (definition.includes("unique (date)") || definition.includes("(user_id, measured_on)")) {
            await pool.query(`ALTER TABLE weight_entries DROP CONSTRAINT "${constraint.conname.replaceAll('"', '""')}"`);
            console.log(`Removed old unique constraint ${constraint.conname}`);
        }
    }

    const duplicateRows = await pool.query(
        `SELECT user_id, "date"
         FROM weight_entries
         GROUP BY user_id, "date"
         HAVING COUNT(*) > 1`
    );
    for (const duplicate of duplicateRows.rows) {
        await pool.query(
                        `DELETE FROM weight_entries older
             USING weight_entries newer
                         WHERE older.user_id = $1 AND older."date" = $2
               AND newer.user_id = older.user_id
                             AND newer."date" = older."date"
               AND newer.created_at > older.created_at`,
                        [duplicate.user_id, duplicate.date]
        );
    }

    const pairConstraint = await pool.query(
        `SELECT 1
         FROM pg_constraint
         WHERE conrelid = 'weight_entries'::regclass
           AND contype = 'u'
           AND pg_get_constraintdef(oid) LIKE '%(user_id, date)%'`
    );
    if (!pairConstraint.rows.length) {
        await pool.query('ALTER TABLE weight_entries ADD CONSTRAINT weight_entries_user_date_unique UNIQUE (user_id, "date")');
        console.log("Added unique history key (user_id, date)");
    }

    await pool.query('CREATE INDEX IF NOT EXISTS weight_entries_user_date_idx ON weight_entries (user_id, "date" DESC)');
    await pool.query(`
        CREATE VIEW user_weight_progress AS
        WITH ranked_weights AS (
            SELECT user_id, weight_kg,
                   ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY "date" ASC) AS first_row,
                   ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY "date" DESC) AS latest_row
            FROM weight_entries
        )
        SELECT user_id,
               MAX(weight_kg) FILTER (WHERE first_row = 1) AS first_weight_kg,
               MAX(weight_kg) FILTER (WHERE latest_row = 1) AS latest_weight_kg
        FROM ranked_weights
        GROUP BY user_id
    `);
    console.log("Weight history migration completed");
} catch (error) {
    console.error("Weight history migration failed:", error.message);
    process.exitCode = 1;
} finally {
    await pool.end();
}
