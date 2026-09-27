import pool from "./src/config/db.js";

try {
    await pool.query(`
        ALTER TABLE user_profiles
        ADD COLUMN IF NOT EXISTS starting_weight_kg NUMERIC(6, 2)
        CHECK (starting_weight_kg > 0 AND starting_weight_kg < 1000)
    `);

    await pool.query(`
        UPDATE user_profiles
        SET starting_weight_kg = current_weight_kg
        WHERE starting_weight_kg IS NULL AND current_weight_kg IS NOT NULL
    `);

    console.log("user_profiles schema is up to date");
} catch (error) {
    console.error("user_profiles migration failed:", error.message);
    process.exitCode = 1;
} finally {
    await pool.end();
}