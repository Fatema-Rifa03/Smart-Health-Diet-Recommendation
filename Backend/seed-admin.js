import pool from "./src/config/db.js";
import bcrypt from "bcryptjs";
import crypto from "crypto";

async function seedAdmin() {
    try {
        console.log("Checking admin account...");

        const adminEmail = "admin@smarthealth.com";
        const adminCheck = await pool.query(
            "SELECT id FROM accounts WHERE lower(email) = $1",
            [adminEmail]
        );

        let adminId;
        if (adminCheck.rows.length === 0) {
            const salt = await bcrypt.genSalt(10);
            const passwordHash = await bcrypt.hash("admin123", salt);
            adminId = crypto.randomUUID();

            await pool.query(
                `INSERT INTO accounts (id, full_name, email, password_hash, role, status)
                 VALUES ($1, $2, $3, $4, 'admin', 'active')`,
                [adminId, "System Administrator", adminEmail, passwordHash]
            );
            console.log("Admin account created: admin@smarthealth.com / admin123");
        } else {
            adminId = adminCheck.rows[0].id;
            console.log("Admin account exists:", adminId);
        }

        // Seed system_settings if missing
        await pool.query(
            `INSERT INTO system_settings (id, warning_percentage, default_water_liters, default_sleep_hours, maintenance_mode, auto_approve_dietitians, updated_by)
             VALUES (TRUE, 80, 2.50, 8.00, FALSE, FALSE, $1)
             ON CONFLICT (id) DO NOTHING`,
            [adminId]
        );

        // Ensure user_profiles for user@example.com if account exists
        const u1 = await pool.query("SELECT id FROM accounts WHERE lower(email) = 'user@example.com'");
        if (u1.rows.length > 0) {
            await pool.query(
                `INSERT INTO user_profiles (account_id, age, gender, height_cm, starting_weight_kg, current_weight_kg, target_weight_kg, primary_goal, daily_calorie_target, water_target_liters, sleep_target_hours)
                 VALUES ($1, 24, 'female', 165, 67.5, 64.5, 60.0, 'Weight Loss & Healthy Living', 2000, 2.5, 8.0)
                 ON CONFLICT (account_id) DO NOTHING`,
                [u1.rows[0].id]
            );
            await pool.query(
                `INSERT INTO weight_entries (user_id, date, weight_kg)
                 VALUES ($1, CURRENT_DATE - INTERVAL '14 days', 67.5),
                        ($1, CURRENT_DATE - INTERVAL '7 days', 66.0),
                        ($1, CURRENT_DATE, 64.5)
                 ON CONFLICT (user_id, date) DO NOTHING`,
                [u1.rows[0].id]
            );
        }

        // Check if sample user 2 exists
        const u2 = await pool.query("SELECT id FROM accounts WHERE lower(email) = 'tanvir@example.com'");
        if (u2.rows.length === 0) {
            const salt = await bcrypt.genSalt(10);
            const userPass = await bcrypt.hash("user1234", salt);
            const u2Id = crypto.randomUUID();
            await pool.query(
                `INSERT INTO accounts (id, full_name, email, password_hash, role, status)
                 VALUES ($1, 'Tanvir Ahmed', 'tanvir@example.com', $2, 'user', 'active')`,
                [u2Id, userPass]
            );
            await pool.query(
                `INSERT INTO user_profiles (account_id, age, gender, height_cm, starting_weight_kg, current_weight_kg, target_weight_kg, primary_goal, daily_calorie_target, water_target_liters, sleep_target_hours)
                 VALUES ($1, 28, 'male', 178, 76.0, 77.5, 80.0, 'Muscle Building', 2500, 3.0, 8.0)
                 ON CONFLICT (account_id) DO NOTHING`,
                [u2Id]
            );
        }

        // Add some sample meal logs for reports
        if (u1.rows.length > 0) {
            const uId = u1.rows[0].id;
            const mealCount = await pool.query("SELECT COUNT(*)::int AS count FROM meal_logs WHERE user_id = $1", [uId]);
            if (mealCount.rows[0].count === 0) {
                await pool.query(
                    `INSERT INTO meal_logs (user_id, logged_for, category, meal_name, calories)
                     VALUES 
                     ($1, CURRENT_DATE, 'breakfast', 'Berry Oatmeal Bowl', 350),
                     ($1, CURRENT_DATE, 'lunch', 'Grilled Chicken Salad', 480),
                     ($1, CURRENT_DATE, 'snacks', 'Mixed Roasted Nuts', 180),
                     ($1, CURRENT_DATE - INTERVAL '1 day', 'breakfast', 'Scrambled Eggs with Avocado', 420),
                     ($1, CURRENT_DATE - INTERVAL '1 day', 'lunch', 'Quinoa & Veggie Bowl', 410),
                     ($1, CURRENT_DATE - INTERVAL '1 day', 'dinner', 'Grilled Salmon with Asparagus', 550)`,
                    [uId]
                );
                console.log("Sample meal logs inserted for reports.");
            }
        }

        // Check audit logs
        const auditCount = await pool.query("SELECT COUNT(*)::int AS count FROM audit_logs");
        if (auditCount.rows[0].count === 0) {
            await pool.query(
                `INSERT INTO audit_logs (event_type, description, status, actor_id, actor_label)
                 VALUES 
                 ('System Alert', 'Database synchronized with durable schema', 'completed', $1, 'System Administrator'),
                 ('Admin Action', 'Initialized administrative control center and roles', 'completed', $1, 'System Administrator'),
                 ('Admin Action', 'Approved Dietitian Dr. Sarah Jenkins', 'approved', $1, 'System Administrator')`,
                [adminId]
            );
            console.log("Initial audit logs created.");
        }

        console.log("Admin seed completed successfully!");
    } catch (error) {
        console.error("Seed error:", error);
    } finally {
        await pool.end();
    }
}

seedAdmin();
