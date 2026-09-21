import pool from "../config/db.js";

// Get user profile
export const getProfile = async (req, res) => {
    try {
        const userId = req.account.id;

        const result = await pool.query(
            `
            SELECT 
                age, gender, height_cm, starting_weight_kg, current_weight_kg, target_weight_kg, 
                primary_goal, daily_calorie_target, water_target_liters, sleep_target_hours
            FROM user_profiles
            WHERE account_id = $1
            `,
            [userId]
        );

        if (result.rows.length === 0) {
            // Profile doesn't exist yet, return defaults or empty
            return res.status(200).json({
                success: true,
                profile: null
            });
        }

        return res.status(200).json({
            success: true,
            profile: result.rows[0]
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
            age, gender, height_cm, current_weight_kg, target_weight_kg,
            primary_goal, daily_calorie_target, water_target_liters, sleep_target_hours
        } = req.body;
        gender = gender ? String(gender).toLowerCase() : null;

        const result = await pool.query(
            `
            INSERT INTO user_profiles (
                account_id, age, gender, height_cm, starting_weight_kg, current_weight_kg, 
                target_weight_kg, primary_goal, daily_calorie_target, 
                water_target_liters, sleep_target_hours, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
            ON CONFLICT (account_id) DO UPDATE SET
                age = EXCLUDED.age,
                gender = EXCLUDED.gender,
                height_cm = EXCLUDED.height_cm,
                starting_weight_kg = COALESCE(user_profiles.starting_weight_kg, EXCLUDED.starting_weight_kg),
                current_weight_kg = EXCLUDED.current_weight_kg,
                target_weight_kg = EXCLUDED.target_weight_kg,
                primary_goal = EXCLUDED.primary_goal,
                daily_calorie_target = EXCLUDED.daily_calorie_target,
                water_target_liters = EXCLUDED.water_target_liters,
                sleep_target_hours = EXCLUDED.sleep_target_hours,
                updated_at = CURRENT_TIMESTAMP
            RETURNING *;
            `,
            [
                userId, 
                age || null, 
                gender || null, 
                height_cm || null, 
                current_weight_kg || null,
                target_weight_kg || null, 
                primary_goal || null, 
                daily_calorie_target || null,
                water_target_liters || 2.50, 
                sleep_target_hours || 8.00
            ]
        );

        return res.status(200).json({
            success: true,
            message: "Profile updated successfully",
            profile: result.rows[0]
        });

    } catch (error) {
        console.error("Error updating profile:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to update profile"
        });
    }
};
