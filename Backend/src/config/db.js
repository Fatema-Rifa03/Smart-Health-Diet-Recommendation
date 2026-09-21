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

export default pool;