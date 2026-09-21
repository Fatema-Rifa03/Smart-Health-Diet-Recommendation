import pool from "./src/config/db.js";

try {
    await pool.query(`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS starting_weight_kg NUMERIC(6, 2)`);
    await pool.query(`UPDATE user_profiles SET starting_weight_kg = current_weight_kg WHERE starting_weight_kg IS NULL AND current_weight_kg IS NOT NULL`);
    console.log("Starting profile weights initialized");
} catch (error) {
    console.error("Starting weight migration failed:", error.message);
    process.exitCode = 1;
} finally {
    await pool.end();
}
