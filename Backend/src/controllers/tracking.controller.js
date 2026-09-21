import pool from "../config/db.js";

// --- Meals ---
export const logMeal = async (req, res) => {
    try {
        const userId = req.account.id;
        const { category, meal_name, calories, food_item_id, recipe_id } = req.body;
        const normalizedCategory = String(category || '').toLowerCase() === 'snack' ? 'snacks' : String(category || '').toLowerCase();
        // logged_for defaults to CURRENT_DATE in DB, logged_at to CURRENT_TIMESTAMP

        const result = await pool.query(
            `
            INSERT INTO meal_logs (user_id, category, meal_name, calories, food_item_id, recipe_id)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *;
            `,
            [userId, normalizedCategory, meal_name, calories, food_item_id || null, recipe_id || null]
        );

        return res.status(201).json({
            success: true,
            meal: result.rows[0]
        });
    } catch (error) {
        console.error("Error logging meal:", error);
        return res.status(500).json({ success: false, message: "Failed to log meal" });
    }
};

export const deleteMeal = async (req, res) => {
    try {
        const result = await pool.query(`DELETE FROM meal_logs WHERE id = $1 AND user_id = $2`, [req.params.id, req.account.id]);
        if (!result.rowCount) return res.status(404).json({ success: false, message: "Meal not found" });
        return res.status(204).send();
    } catch (error) {
        console.error("Error deleting meal:", error);
        return res.status(500).json({ success: false, message: "Failed to delete meal" });
    }
};

export const clearTodayMeals = async (req, res) => {
    try {
        await pool.query(`DELETE FROM meal_logs WHERE user_id = $1 AND logged_for = CURRENT_DATE`, [req.account.id]);
        return res.status(204).send();
    } catch (error) {
        console.error("Error clearing meals:", error);
        return res.status(500).json({ success: false, message: "Failed to clear meals" });
    }
};

export const getMealsByDate = async (req, res) => {
    try {
        const userId = req.account.id;
        const { date } = req.query; // optional, defaults to today
        
        let query = `SELECT * FROM meal_logs WHERE user_id = $1`;
        const params = [userId];

        if (date) {
            query += ` AND logged_for = $2`;
            params.push(date);
        } else {
            query += ` AND logged_for = CURRENT_DATE`;
        }

        query += ` ORDER BY logged_at DESC`;

        const result = await pool.query(query, params);

        return res.status(200).json({
            success: true,
            meals: result.rows
        });
    } catch (error) {
        console.error("Error fetching meals:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch meals" });
    }
};

// --- Water ---
export const logWater = async (req, res) => {
    try {
        const userId = req.account.id;
        const { amount_liters } = req.body;

        // Get target from profile
        const profileResult = await pool.query(
            `SELECT water_target_liters FROM user_profiles WHERE account_id = $1`,
            [userId]
        );
        const target_liters = profileResult.rows.length > 0 ? profileResult.rows[0].water_target_liters : 2.50;

        // Upsert water log for today
        const result = await pool.query(
            `
            INSERT INTO water_logs (user_id, log_date, amount_liters, target_liters)
            VALUES ($1, CURRENT_DATE, $2, $3)
            ON CONFLICT (user_id, log_date) DO UPDATE SET
                amount_liters = water_logs.amount_liters + EXCLUDED.amount_liters,
                updated_at = CURRENT_TIMESTAMP
            RETURNING *;
            `,
            [userId, amount_liters, target_liters]
        );

        return res.status(200).json({
            success: true,
            water: result.rows[0]
        });
    } catch (error) {
        console.error("Error logging water:", error);
        return res.status(500).json({ success: false, message: "Failed to log water" });
    }
};

export const getWater = async (req, res) => {
    try {
        const userId = req.account.id;
        const { date } = req.query;

        let query = `SELECT * FROM water_logs WHERE user_id = $1`;
        const params = [userId];

        if (date) {
            query += ` AND log_date = $2`;
            params.push(date);
        } else {
            query += ` AND log_date = CURRENT_DATE`;
        }

        const result = await pool.query(query, params);

        return res.status(200).json({
            success: true,
            water: result.rows.length > 0 ? result.rows[0] : { amount_liters: 0, target_liters: 2.50 }
        });
    } catch (error) {
        console.error("Error fetching water:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch water" });
    }
};

export const resetWater = async (req, res) => {
    try {
        await pool.query(`DELETE FROM water_logs WHERE user_id = $1 AND log_date = CURRENT_DATE`, [req.account.id]);
        return res.status(204).send();
    } catch (error) {
        console.error("Error resetting water:", error);
        return res.status(500).json({ success: false, message: "Failed to reset water" });
    }
};

// --- Sleep ---
export const logSleep = async (req, res) => {
    try {
        const userId = req.account.id;
        const { date, sleep_date, duration_hours, quality_score, bedtime, wake_time, notes } = req.body;
        const sleepDate = date || sleep_date || new Date().toISOString().split('T')[0];
        if (!/^\d{4}-\d{2}-\d{2}$/.test(sleepDate) || Number.isNaN(Date.parse(`${sleepDate}T00:00:00Z`))) {
            return res.status(400).json({ success: false, message: "Sleep date must be a valid YYYY-MM-DD date" });
        }

        const result = await pool.query(
            `
            INSERT INTO sleep_logs (user_id, date, duration_hours, quality_score, bedtime, wake_time, notes)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (user_id, date) DO UPDATE SET
                duration_hours = EXCLUDED.duration_hours,
                quality_score = EXCLUDED.quality_score,
                bedtime = EXCLUDED.bedtime,
                wake_time = EXCLUDED.wake_time,
                notes = EXCLUDED.notes
            RETURNING *;
            `,
            [userId, sleepDate, duration_hours, quality_score, bedtime, wake_time, notes]
        );

        return res.status(200).json({
            success: true,
            sleep: result.rows[0]
        });
    } catch (error) {
        console.error("Error logging sleep:", error);
        return res.status(500).json({ success: false, message: "Failed to log sleep" });
    }
};

export const getSleepLogs = async (req, res) => {
    try {
        const userId = req.account.id;
        const result = await pool.query(
            `SELECT * FROM sleep_logs WHERE user_id = $1 ORDER BY date DESC LIMIT 30`,
            [userId]
        );

        return res.status(200).json({
            success: true,
            sleep_logs: result.rows
        });
    } catch (error) {
        console.error("Error fetching sleep logs:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch sleep logs" });
    }
};

// --- Weight ---
export const logWeight = async (req, res) => {
    try {
        const userId = req.account.id;
        const { date, measured_on, weight_kg } = req.body;
        const measuredDate = date || measured_on || new Date().toISOString().split('T')[0];
        if (!/^\d{4}-\d{2}-\d{2}$/.test(measuredDate) || Number.isNaN(Date.parse(`${measuredDate}T00:00:00Z`))) {
            return res.status(400).json({ success: false, message: "Weight date must be a valid YYYY-MM-DD date" });
        }
        if (!Number.isFinite(Number(weight_kg)) || Number(weight_kg) <= 0) {
            return res.status(400).json({ success: false, message: "Weight must be greater than zero" });
        }

        const result = await pool.query(
            `
            INSERT INTO weight_entries (user_id, date, weight_kg)
            VALUES ($1, $2, $3)
            ON CONFLICT (user_id, date) DO UPDATE SET
                weight_kg = EXCLUDED.weight_kg
            RETURNING *;
            `,
            [userId, measuredDate, weight_kg]
        );

        // Also update current_weight_kg in user_profiles
        await pool.query(
            `UPDATE user_profiles SET current_weight_kg = $1 WHERE account_id = $2`,
            [weight_kg, userId]
        );

        return res.status(200).json({
            success: true,
            weight: result.rows[0]
        });
    } catch (error) {
        console.error("Error logging weight:", error);
        return res.status(500).json({
            success: false,
            message: process.env.NODE_ENV === "production" ? "Failed to log weight" : error.message
        });
    }
};

export const getWeightLogs = async (req, res) => {
    try {
        const userId = req.account.id;
        const result = await pool.query(
            `SELECT * FROM weight_entries WHERE user_id = $1 ORDER BY date DESC LIMIT 30`,
            [userId]
        );

        return res.status(200).json({
            success: true,
            weight_logs: result.rows
        });
    } catch (error) {
        console.error("Error fetching weight logs:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch weight logs" });
    }
};

// --- Dashboard Summary ---
export const getDashboardSummary = async (req, res) => {
    try {
        const userId = req.account.id;
        
        // 1. Profile goals
        const profileResult = await pool.query(
            `SELECT daily_calorie_target, water_target_liters FROM user_profiles WHERE account_id = $1`,
            [userId]
        );
        const profile = profileResult.rows.length > 0 ? profileResult.rows[0] : { daily_calorie_target: 2000, water_target_liters: 2.5 };

        // 2. Today's meals & calories
        const mealsResult = await pool.query(
            `SELECT category, meal_name, calories, logged_at FROM meal_logs WHERE user_id = $1 AND logged_for = CURRENT_DATE ORDER BY logged_at DESC`,
            [userId]
        );
        const meals = mealsResult.rows;
        const totalCalories = meals.reduce((sum, meal) => sum + parseInt(meal.calories), 0);

        // 3. Today's water
        const waterResult = await pool.query(
            `SELECT amount_liters FROM water_logs WHERE user_id = $1 AND log_date = CURRENT_DATE`,
            [userId]
        );
        const water = waterResult.rows.length > 0 ? parseFloat(waterResult.rows[0].amount_liters) : 0;

        // 4. Latest sleep
        const sleepResult = await pool.query(
            `SELECT duration_hours, quality_score FROM sleep_logs WHERE user_id = $1 ORDER BY date DESC LIMIT 1`,
            [userId]
        );
        const sleep = sleepResult.rows.length > 0 ? sleepResult.rows[0] : { duration_hours: 0, quality_score: 0 };

        return res.status(200).json({
            success: true,
            data: {
                calories: {
                    consumed: totalCalories,
                    target: profile.daily_calorie_target || 2000
                },
                water: {
                    consumed: water,
                    target: profile.water_target_liters || 2.5
                },
                sleep: {
                    duration: sleep.duration_hours,
                    quality: sleep.quality_score
                },
                meals: meals
            }
        });

    } catch (error) {
        console.error("Error fetching dashboard summary:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch dashboard summary" });
    }
};
