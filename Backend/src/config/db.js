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

// Auto-migration: Ensure user_profiles has avatar_url column and dietitian_profiles has extended settings
pool.query(`
    ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
    ALTER TABLE dietitian_profiles ADD COLUMN IF NOT EXISTS phone_number VARCHAR(50);
    ALTER TABLE dietitian_profiles ADD COLUMN IF NOT EXISTS license_number VARCHAR(100);
    ALTER TABLE dietitian_profiles ADD COLUMN IF NOT EXISTS consultation_fee NUMERIC(8, 2) DEFAULT 0.00;
    ALTER TABLE dietitian_profiles ADD COLUMN IF NOT EXISTS max_clients INTEGER DEFAULT 50;
    ALTER TABLE dietitian_profiles ADD COLUMN IF NOT EXISTS bio TEXT;
    CREATE INDEX IF NOT EXISTS water_logs_user_date_idx ON water_logs (user_id, log_date DESC);
    CREATE OR REPLACE VIEW user_monthly_water_summary AS
    SELECT
        user_id,
        DATE_TRUNC('month', log_date)::DATE AS month_date,
        TO_CHAR(log_date, 'YYYY-MM') AS month_key,
        TO_CHAR(DATE_TRUNC('month', log_date), 'FMMonth YYYY') AS month_label,
        ROUND(SUM(amount_liters), 2)::FLOAT AS total_liters,
        ROUND(AVG(amount_liters), 2)::FLOAT AS avg_daily_liters,
        ROUND(AVG(target_liters), 2)::FLOAT AS avg_target_liters,
        COUNT(DISTINCT log_date)::INTEGER AS days_logged,
        COUNT(CASE WHEN amount_liters >= target_liters THEN 1 END)::INTEGER AS days_target_met,
        ROUND(MAX(amount_liters), 2)::FLOAT AS max_daily_liters
    FROM water_logs
    GROUP BY user_id, DATE_TRUNC('month', log_date), TO_CHAR(log_date, 'YYYY-MM');

    CREATE OR REPLACE VIEW user_monthly_sleep_summary AS
    SELECT
        user_id,
        DATE_TRUNC('month', date)::DATE AS month_date,
        TO_CHAR(date, 'YYYY-MM') AS month_key,
        TO_CHAR(DATE_TRUNC('month', date), 'FMMonth YYYY') AS month_label,
        ROUND(SUM(duration_hours), 1)::FLOAT AS total_sleep_hours,
        ROUND(AVG(duration_hours), 2)::FLOAT AS avg_duration_hours,
        ROUND(AVG(quality_score), 1)::FLOAT AS avg_quality_score,
        COUNT(DISTINCT date)::INTEGER AS days_logged,
        ROUND(MAX(duration_hours), 1)::FLOAT AS max_duration_hours
    FROM sleep_logs
    GROUP BY user_id, DATE_TRUNC('month', date), TO_CHAR(date, 'YYYY-MM');

    CREATE INDEX IF NOT EXISTS sleep_logs_user_date_idx ON sleep_logs (user_id, date DESC);
`).catch(err => {
    console.error("Migration error (user_profiles.avatar_url, water_summary, or sleep_summary):", err.message);
});

export default pool;