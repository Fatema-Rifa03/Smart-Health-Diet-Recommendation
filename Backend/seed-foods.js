import fs from "fs/promises";
import pool from "./src/config/db.js";

const seedPath = new URL("../database/food-items-seed.sql", import.meta.url);

try {
    const sql = await fs.readFile(seedPath, "utf8");
    await pool.query(sql);
    const result = await pool.query(
        "SELECT category, COUNT(*)::int AS count FROM food_items GROUP BY category ORDER BY category"
    );
    console.log("Food catalog seeded successfully:", result.rows);
} catch (error) {
    console.error("Food catalog seed failed:", error.message);
    process.exitCode = 1;
} finally {
    await pool.end();
}
