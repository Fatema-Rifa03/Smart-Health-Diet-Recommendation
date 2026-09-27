import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

pool.on("connect", () => {
    console.log("PostgreSQL database connected");
});

pool.on("error", (error) => {
    console.error("Unexpected PostgreSQL error:", error);
});

// Auto-migration: Ensure user_profiles has avatar_url column
pool.query(`
    ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
`).catch(err => {
    console.error("Migration error (user_profiles.avatar_url):", err.message);
});

export default pool;