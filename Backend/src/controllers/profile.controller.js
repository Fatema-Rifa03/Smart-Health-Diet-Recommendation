import pool from "../config/db.js";
import bcrypt from "bcryptjs";

// Get user profile
export const getProfile = async (req, res) => {
    try {
        const userId = req.account.id;

        const result = await pool.query(
            `
            SELECT 
                a.id, a.full_name, a.email, a.role, a.status, a.joined_at, a.created_at,
                up.age, up.gender, up.height_cm, up.starting_weight_kg, up.current_weight_kg, up.target_weight_kg, 
                up.primary_goal, up.daily_calorie_target, up.water_target_liters, up.sleep_target_hours,
                up.avatar_url
            FROM accounts a
            LEFT JOIN user_profiles up ON a.id = up.account_id
            WHERE a.id = $1
            `,
            [userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Account not found"
            });
        }

        const row = result.rows[0];

        return res.status(200).json({
            success: true,
            profile: row,
            user: {
                id: row.id,
                full_name: row.full_name,
                email: row.email,
                role: row.role,
                status: row.status,
                avatar_url: row.avatar_url || null
            }
        });

    } catch (error) {
        console.error("Error fetching profile:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch profile"
        });
    }
};

// Update or create user profile
export const updateProfile = async (req, res) => {
    try {
        const userId = req.account.id;
        let {
            full_name,
            avatar_url,
            age, gender, height_cm, current_weight_kg, target_weight_kg,
            primary_goal, daily_calorie_target, water_target_liters, sleep_target_hours,
            current_password, new_password
        } = req.body;

        // If full_name is provided, update accounts table
        if (full_name && typeof full_name === "string" && full_name.trim().length > 0) {
            await pool.query(
                `UPDATE accounts SET full_name = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
                [full_name.trim(), userId]
            );
        }

        // If new_password is provided, verify current_password and update
        if (new_password) {
            if (!current_password) {
                return res.status(400).json({
                    success: false,
                    message: "Current password is required to set a new password"
                });
            }
            if (new_password.length < 6) {
                return res.status(400).json({
                    success: false,
                    message: "New password must be at least 6 characters long"
                });
            }
            const accRes = await pool.query(`SELECT password_hash FROM accounts WHERE id = $1`, [userId]);
            const isMatch = await bcrypt.compare(current_password, accRes.rows[0]?.password_hash || "");
            if (!isMatch) {
                return res.status(400).json({
                    success: false,
                    message: "Current password is incorrect"
                });
            }
            const salt = await bcrypt.genSalt(10);
            const newHash = await bcrypt.hash(new_password, salt);
            await pool.query(
                `UPDATE accounts SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
                [newHash, userId]
            );
        }

        gender = gender ? String(gender).toLowerCase() : null;

        const result = await pool.query(
            `
            INSERT INTO user_profiles (
                account_id, age, gender, height_cm, starting_weight_kg, current_weight_kg, 
                target_weight_kg, primary_goal, daily_calorie_target, 
                water_target_liters, sleep_target_hours, avatar_url, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
            ON CONFLICT (account_id) DO UPDATE SET
                age = COALESCE(EXCLUDED.age, user_profiles.age),
                gender = COALESCE(EXCLUDED.gender, user_profiles.gender),
                height_cm = COALESCE(EXCLUDED.height_cm, user_profiles.height_cm),
                starting_weight_kg = COALESCE(user_profiles.starting_weight_kg, EXCLUDED.starting_weight_kg),
                current_weight_kg = COALESCE(EXCLUDED.current_weight_kg, user_profiles.current_weight_kg),
                target_weight_kg = COALESCE(EXCLUDED.target_weight_kg, user_profiles.target_weight_kg),
                primary_goal = COALESCE(EXCLUDED.primary_goal, user_profiles.primary_goal),
                daily_calorie_target = COALESCE(EXCLUDED.daily_calorie_target, user_profiles.daily_calorie_target),
                water_target_liters = COALESCE(EXCLUDED.water_target_liters, user_profiles.water_target_liters),
                sleep_target_hours = COALESCE(EXCLUDED.sleep_target_hours, user_profiles.sleep_target_hours),
                avatar_url = COALESCE(EXCLUDED.avatar_url, user_profiles.avatar_url),
                updated_at = CURRENT_TIMESTAMP
            RETURNING *;
            `,
            [
                userId, 
                age !== undefined && age !== null && age !== "" ? parseInt(age) : null, 
                gender || null, 
                height_cm !== undefined && height_cm !== null && height_cm !== "" ? parseFloat(height_cm) : null, 
                current_weight_kg !== undefined && current_weight_kg !== null && current_weight_kg !== "" ? parseFloat(current_weight_kg) : null,
                target_weight_kg !== undefined && target_weight_kg !== null && target_weight_kg !== "" ? parseFloat(target_weight_kg) : null, 
                primary_goal || null, 
                daily_calorie_target !== undefined && daily_calorie_target !== null && daily_calorie_target !== "" ? parseInt(daily_calorie_target) : null,
                water_target_liters || 2.50, 
                sleep_target_hours || 8.00,
                avatar_url !== undefined ? avatar_url : null
            ]
        );

        // Fetch refreshed account data
        const updatedAcc = await pool.query(
            `SELECT full_name, email, role, status FROM accounts WHERE id = $1`,
            [userId]
        );

        const updatedProfile = {
            ...result.rows[0],
            full_name: updatedAcc.rows[0]?.full_name,
            email: updatedAcc.rows[0]?.email,
            role: updatedAcc.rows[0]?.role
        };

        return res.status(200).json({
            success: true,
            message: "Profile updated successfully",
            profile: updatedProfile,
            user: {
                id: userId,
                full_name: updatedAcc.rows[0]?.full_name,
                email: updatedAcc.rows[0]?.email,
                role: updatedAcc.rows[0]?.role,
                status: updatedAcc.rows[0]?.status,
                avatar_url: result.rows[0]?.avatar_url || null
            }
        });

    } catch (error) {
        console.error("Error updating profile:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to update profile"
        });
    }
};
