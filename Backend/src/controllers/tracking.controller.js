import pool from "../config/db.js";

// --- Meals ---
export const logMeal = async (req, res) => {
    try {
        const userId = req.account.id;
        const { category, meal_name, calories, food_item_id, recipe_id, is_extra, notes } = req.body;
        const cat = String(category || '').toLowerCase().trim();
        const normalizedCategory = (cat === 'snack' || cat === 'snacks') ? 'snacks' : (['breakfast', 'lunch', 'dinner'].includes(cat) ? cat : 'snacks');
        
        const validUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
        const cleanFoodId = (food_item_id && validUuid.test(food_item_id)) ? food_item_id : null;
        const cleanRecipeId = (recipe_id && validUuid.test(recipe_id)) ? recipe_id : null;
        const cleanCalories = Math.max(0, parseInt(calories, 10) || 0);
        const cleanMealName = String(meal_name || '').trim() || 'Logged Meal';
        const cleanIsExtra = Boolean(is_extra);
        const cleanNotes = notes ? String(notes).trim() : null;

        const result = await pool.query(
            `
            INSERT INTO meal_logs (user_id, category, meal_name, calories, food_item_id, recipe_id, is_extra, notes)
            VALUES ($1, $2::meal_category, $3, $4, $5, $6, $7, $8)
            RETURNING *;
            `,
            [userId, normalizedCategory, cleanMealName, cleanCalories, cleanFoodId, cleanRecipeId, cleanIsExtra, cleanNotes]
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
        
        let query = `SELECT id, user_id, logged_for, category, meal_name, calories, food_item_id, recipe_id, is_extra, notes, logged_at FROM meal_logs WHERE user_id = $1`;
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
        const { amount_liters, log_date } = req.body;

        // Get target from profile
        const profileResult = await pool.query(
            `SELECT water_target_liters FROM user_profiles WHERE account_id = $1`,
            [userId]
        );
        const target_liters = profileResult.rows.length > 0 && profileResult.rows[0].water_target_liters 
            ? profileResult.rows[0].water_target_liters 
            : 2.50;

        const targetDate = log_date || null;

        // Upsert water log for date
        const result = await pool.query(
            `
            INSERT INTO water_logs (user_id, log_date, amount_liters, target_liters)
            VALUES ($1, COALESCE($2::DATE, CURRENT_DATE), $3, $4)
            ON CONFLICT (user_id, log_date) DO UPDATE SET
                amount_liters = water_logs.amount_liters + EXCLUDED.amount_liters,
                updated_at = CURRENT_TIMESTAMP
            RETURNING *;
            `,
            [userId, targetDate, amount_liters, target_liters]
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
        const targetDate = req.query.date || null;
        await pool.query(
            `DELETE FROM water_logs WHERE user_id = $1 AND log_date = COALESCE($2::DATE, CURRENT_DATE)`,
            [req.account.id, targetDate]
        );
        return res.status(204).send();
    } catch (error) {
        console.error("Error resetting water:", error);
        return res.status(500).json({ success: false, message: "Failed to reset water" });
    }
};

export const getMonthlyWater = async (req, res) => {
    try {
        const userId = req.account.id;
        let monthParam = (req.query.month || "").trim(); // "YYYY-MM"
        
        const now = new Date();
        const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

        if (!/^\d{4}-\d{2}$/.test(monthParam)) {
            monthParam = currentMonthKey;
        }

        const [yearStr, monthStr] = monthParam.split("-");
        const year = parseInt(yearStr, 10);
        const month = parseInt(monthStr, 10); // 1 - 12
        const daysInMonth = new Date(year, month, 0).getDate();
        const startDate = `${yearStr}-${monthStr.padStart(2, "0")}-01`;
        const endDate = `${yearStr}-${monthStr.padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

        // Get user water target
        const profileResult = await pool.query(
            `SELECT water_target_liters FROM user_profiles WHERE account_id = $1`,
            [userId]
        );
        const defaultTarget = profileResult.rows.length > 0 && profileResult.rows[0].water_target_liters 
            ? parseFloat(profileResult.rows[0].water_target_liters) 
            : 2.50;

        // Query daily water logs for this month
        const dailyLogsResult = await pool.query(
            `
            SELECT 
                TO_CHAR(log_date, 'YYYY-MM-DD') AS date,
                EXTRACT(DAY FROM log_date)::INTEGER AS day_number,
                amount_liters::NUMERIC(6, 2)::FLOAT AS amount_liters,
                target_liters::NUMERIC(6, 2)::FLOAT AS target_liters,
                updated_at
            FROM water_logs
            WHERE user_id = $1 
              AND log_date >= $2::DATE 
              AND log_date <= $3::DATE
            ORDER BY log_date ASC
            `,
            [userId, startDate, endDate]
        );

        // Fetch monthly historical summary for user from user_monthly_water_summary view
        const historyResult = await pool.query(
            `
            SELECT 
                month_key,
                month_label,
                total_liters,
                avg_daily_liters,
                avg_target_liters,
                days_logged,
                days_target_met,
                max_daily_liters
            FROM user_monthly_water_summary
            WHERE user_id = $1
            ORDER BY month_key DESC
            LIMIT 12
            `,
            [userId]
        );

        const logsMap = new Map();
        dailyLogsResult.rows.forEach(row => {
            logsMap.set(row.day_number, row);
        });

        const dailyBreakdown = [];
        let totalLiters = 0;
        let daysLogged = 0;
        let daysTargetMet = 0;
        let bestDay = null;

        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${yearStr}-${monthStr.padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            const dayDate = new Date(year, month - 1, d);
            const dayName = dayDate.toLocaleDateString("en-US", { weekday: "short" });
            const logged = logsMap.get(d);
            const amount = logged ? parseFloat(logged.amount_liters) : 0;
            const target = logged ? parseFloat(logged.target_liters) : defaultTarget;
            const isLogged = !!logged && amount > 0;
            const targetMet = isLogged && amount >= target;

            if (isLogged) {
                totalLiters += amount;
                daysLogged += 1;
                if (targetMet) daysTargetMet += 1;
                if (!bestDay || amount > bestDay.amount_liters) {
                    bestDay = { day: d, date: dateStr, amount_liters: amount };
                }
            }

            dailyBreakdown.push({
                day: d,
                date: dateStr,
                day_name: dayName,
                amount_liters: amount,
                target_liters: target,
                is_logged: isLogged,
                target_met: targetMet,
                percentage: target > 0 ? Math.min(200, Math.round((amount / target) * 100)) : 0
            });
        }

        const avgDailyLiters = daysLogged > 0 ? parseFloat((totalLiters / daysLogged).toFixed(2)) : 0;
        const completionRate = daysLogged > 0 ? Math.round((daysTargetMet / daysLogged) * 100) : 0;

        // Month list for selection: combine current month with any distinct months in logs
        const availableMonthsSet = new Set();
        availableMonthsSet.add(currentMonthKey);
        availableMonthsSet.add(monthParam);
        historyResult.rows.forEach(h => availableMonthsSet.add(h.month_key));
        const availableMonths = Array.from(availableMonthsSet).sort().reverse();

        const monthDate = new Date(year, month - 1, 1);
        const monthLabel = monthDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });

        return res.status(200).json({
            success: true,
            month: monthParam,
            month_label: monthLabel,
            days_in_month: daysInMonth,
            summary: {
                total_liters: parseFloat(totalLiters.toFixed(2)),
                avg_daily_liters: avgDailyLiters,
                target_liters: defaultTarget,
                days_logged: daysLogged,
                days_target_met: daysTargetMet,
                completion_rate: completionRate,
                best_day: bestDay
            },
            daily_breakdown: dailyBreakdown,
            history: historyResult.rows,
            available_months: availableMonths
        });

    } catch (error) {
        console.error("Error fetching monthly water:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch monthly water intake" });
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

export const getMonthlySleep = async (req, res) => {
    try {
        const userId = req.account.id;
        let monthParam = (req.query.month || "").trim(); // "YYYY-MM"
        
        const now = new Date();
        const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

        if (!/^\d{4}-\d{2}$/.test(monthParam)) {
            monthParam = currentMonthKey;
        }

        const [yearStr, monthStr] = monthParam.split("-");
        const year = parseInt(yearStr, 10);
        const month = parseInt(monthStr, 10); // 1 - 12
        const daysInMonth = new Date(year, month, 0).getDate();
        const startDate = `${yearStr}-${monthStr.padStart(2, "0")}-01`;
        const endDate = `${yearStr}-${monthStr.padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

        // Get user sleep target from profile
        const profileResult = await pool.query(
            `SELECT sleep_target_hours FROM user_profiles WHERE account_id = $1`,
            [userId]
        );
        const targetHours = profileResult.rows.length > 0 && profileResult.rows[0].sleep_target_hours 
            ? parseFloat(profileResult.rows[0].sleep_target_hours) 
            : 8.00;

        // Query daily sleep logs for this month from the existing sleep_logs table
        const dailyLogsResult = await pool.query(
            `
            SELECT 
                TO_CHAR(date, 'YYYY-MM-DD') AS date,
                EXTRACT(DAY FROM date)::INTEGER AS day_number,
                duration_hours::NUMERIC(4, 2)::FLOAT AS duration_hours,
                quality_score::INTEGER AS quality_score,
                bedtime,
                wake_time,
                notes
            FROM sleep_logs
            WHERE user_id = $1 
              AND date >= $2::DATE 
              AND date <= $3::DATE
            ORDER BY date ASC
            `,
            [userId, startDate, endDate]
        );

        // Fetch monthly historical summary for user
        const historyResult = await pool.query(
            `
            SELECT 
                TO_CHAR(date, 'YYYY-MM') AS month_key,
                TO_CHAR(DATE_TRUNC('month', date), 'FMMonth YYYY') AS month_label,
                ROUND(SUM(duration_hours), 1)::FLOAT AS total_sleep_hours,
                ROUND(AVG(duration_hours), 2)::FLOAT AS avg_duration_hours,
                ROUND(AVG(quality_score), 1)::FLOAT AS avg_quality_score,
                COUNT(DISTINCT date)::INTEGER AS days_logged,
                COUNT(CASE WHEN duration_hours >= $2 THEN 1 END)::INTEGER AS days_target_met,
                ROUND(MAX(duration_hours), 1)::FLOAT AS max_duration_hours
            FROM sleep_logs
            WHERE user_id = $1
            GROUP BY user_id, DATE_TRUNC('month', date), TO_CHAR(date, 'YYYY-MM')
            ORDER BY month_key DESC
            LIMIT 12
            `,
            [userId, targetHours]
        );

        const logsMap = new Map();
        dailyLogsResult.rows.forEach(r => logsMap.set(r.day_number, r));

        const dailyBreakdown = [];
        let totalHours = 0;
        let totalQuality = 0;
        let daysLogged = 0;
        let daysTargetMet = 0;
        let optimalDays = 0;
        let bestNight = null;

        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${yearStr}-${monthStr.padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            const dayDate = new Date(year, month - 1, d);
            const dayName = dayDate.toLocaleDateString("en-US", { weekday: "short" });
            const logged = logsMap.get(d);
            const duration = logged ? parseFloat(logged.duration_hours) : 0;
            const quality = logged && logged.quality_score !== null ? parseInt(logged.quality_score, 10) : null;
            const isLogged = !!logged && duration > 0;
            const targetMet = isLogged && duration >= targetHours;

            if (isLogged) {
                totalHours += duration;
                if (quality !== null) totalQuality += quality;
                daysLogged += 1;
                if (targetMet) daysTargetMet += 1;
                if (quality !== null && quality >= 80) optimalDays += 1;
                if (!bestNight || (quality && quality > (bestNight.quality_score || 0)) || duration > bestNight.duration_hours) {
                    bestNight = { day: d, date: dateStr, duration_hours: duration, quality_score: quality };
                }
            }

            dailyBreakdown.push({
                day: d,
                date: dateStr,
                day_name: dayName,
                duration_hours: duration,
                quality_score: quality,
                bedtime: logged?.bedtime || null,
                wake_time: logged?.wake_time || null,
                notes: logged?.notes || '',
                is_logged: isLogged,
                target_met: targetMet,
                target_hours: targetHours,
                percentage: targetHours > 0 ? Math.min(200, Math.round((duration / targetHours) * 100)) : 0
            });
        }

        const avgDuration = daysLogged > 0 ? parseFloat((totalHours / daysLogged).toFixed(2)) : 0;
        const avgQuality = daysLogged > 0 ? Math.round(totalQuality / daysLogged) : 0;
        const completionRate = daysLogged > 0 ? Math.round((daysTargetMet / daysLogged) * 100) : 0;

        const availableMonthsSet = new Set();
        availableMonthsSet.add(currentMonthKey);
        availableMonthsSet.add(monthParam);
        historyResult.rows.forEach(h => availableMonthsSet.add(h.month_key));
        const availableMonths = Array.from(availableMonthsSet).sort().reverse();

        const monthDate = new Date(year, month - 1, 1);
        const monthLabel = monthDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });

        return res.status(200).json({
            success: true,
            month: monthParam,
            month_label: monthLabel,
            days_in_month: daysInMonth,
            target_hours: targetHours,
            summary: {
                total_sleep_hours: parseFloat(totalHours.toFixed(1)),
                avg_duration_hours: avgDuration,
                avg_quality_score: avgQuality,
                target_hours: targetHours,
                days_logged: daysLogged,
                days_target_met: daysTargetMet,
                optimal_days: optimalDays,
                completion_rate: completionRate,
                best_night: bestNight
            },
            daily_breakdown: dailyBreakdown,
            history: historyResult.rows,
            available_months: availableMonths
        });

    } catch (error) {
        console.error("Error fetching monthly sleep logs:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch monthly sleep logs" });
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
        
        // 1. Profile goals & active meal plan
        const [profileResult, activePlanResult] = await Promise.all([
            pool.query(
                `SELECT daily_calorie_target, water_target_liters FROM user_profiles WHERE account_id = $1`,
                [userId]
            ),
            pool.query(
                `SELECT mp.id, mp.title, mp.target_calories, mp.start_date, mp.end_date, mp.status,
                        a.full_name AS dietitian_name, dp.specialty AS dietitian_specialty,
                        COALESCE(json_agg(
                            json_build_object(
                                'id', mpi.id,
                                'category', mpi.category,
                                'recommendation', mpi.recommendation,
                                'sort_order', mpi.sort_order
                            ) ORDER BY mpi.sort_order
                        ) FILTER (WHERE mpi.id IS NOT NULL), '[]') AS items
                 FROM meal_plans mp
                 JOIN accounts a ON a.id = mp.dietitian_id
                 LEFT JOIN dietitian_profiles dp ON dp.account_id = a.id
                 LEFT JOIN meal_plan_items mpi ON mpi.meal_plan_id = mp.id
                 WHERE mp.patient_id = $1 AND mp.status = 'active'
                 GROUP BY mp.id, a.full_name, dp.specialty
                 ORDER BY mp.created_at DESC
                 LIMIT 1`,
                [userId]
            )
        ]);

        const profile = profileResult.rows.length > 0 ? profileResult.rows[0] : { daily_calorie_target: 2000, water_target_liters: 2.5 };
        const activePlan = activePlanResult.rows.length > 0 ? activePlanResult.rows[0] : null;

        // 2. Today's meals & calories breakdown
        const mealsResult = await pool.query(
            `SELECT id, category, meal_name, calories, is_extra, notes, logged_at 
             FROM meal_logs 
             WHERE user_id = $1 AND logged_for = CURRENT_DATE 
             ORDER BY logged_at DESC`,
            [userId]
        );
        const meals = mealsResult.rows;

        let regularCalories = 0;
        let extraCalories = 0;
        let extraCount = 0;

        for (const m of meals) {
            const cal = parseInt(m.calories, 10) || 0;
            if (m.is_extra) {
                extraCalories += cal;
                extraCount++;
            } else {
                regularCalories += cal;
            }
        }
        const totalCalories = regularCalories + extraCalories;
        const targetCalories = activePlan?.target_calories || profile.daily_calorie_target || 2000;

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

        // Adherence status
        let adherenceStatus = 'maintained';
        if (meals.length === 0) {
            adherenceStatus = 'no_logs';
        } else if (extraCount > 0 || extraCalories > 0) {
            adherenceStatus = 'extra_reported';
        } else if (totalCalories > targetCalories + 50) {
            adherenceStatus = 'exceeded';
        }

        return res.status(200).json({
            success: true,
            data: {
                calories: {
                    consumed: totalCalories,
                    regular: regularCalories,
                    extra: extraCalories,
                    target: targetCalories
                },
                adherenceStatus,
                activeMealPlan: activePlan,
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
