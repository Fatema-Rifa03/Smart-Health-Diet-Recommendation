import pool from "../config/db.js";

const today = () => new Date().toISOString().slice(0, 10);

export const listDietitians = async (req, res) => {
    try {
        const search = String(req.query.search || "").trim();
        const result = await pool.query(
            `SELECT a.id, a.full_name, dp.specialty, dp.years_experience, dp.rating, dp.avatar_url
             FROM accounts a
             JOIN dietitian_profiles dp ON dp.account_id = a.id
             WHERE a.status = 'active' AND dp.status = 'approved'
               AND ($1 = '' OR a.full_name ILIKE '%' || $1 || '%' OR dp.specialty ILIKE '%' || $1 || '%')
             ORDER BY dp.rating DESC, a.full_name ASC`,
            [search]
        );
        return res.json({ success: true, dietitians: result.rows });
    } catch (error) {
        console.error("Error fetching dietitians:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch dietitians" });
    }
};

export const listGuidanceRequests = async (req, res) => {
    try {
        const column = req.account.role === "user" ? "gr.patient_id" : "gr.dietitian_id";
        const result = await pool.query(
            `SELECT gr.*, p.full_name AS patient_name, p.email AS patient_email,
                    d.full_name AS dietitian_name, d.email AS dietitian_email
             FROM guidance_requests gr
             JOIN accounts p ON p.id = gr.patient_id
             JOIN accounts d ON d.id = gr.dietitian_id
             WHERE ${column} = $1 ORDER BY gr.created_at DESC`,
            [req.account.id]
        );
        return res.json({ success: true, requests: result.rows });
    } catch (error) {
        console.error("Error fetching guidance requests:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch guidance requests" });
    }
};

export const createGuidanceRequest = async (req, res) => {
    try {
        const { dietitian_id, goal } = req.body;
        if (!dietitian_id || !goal) return res.status(400).json({ success: false, message: "Dietitian and goal are required" });
        const result = await pool.query(
            `INSERT INTO guidance_requests (patient_id, dietitian_id, goal)
             SELECT $1, dp.account_id, $3
             FROM dietitian_profiles dp
             JOIN accounts a ON a.id = dp.account_id
             WHERE dp.account_id = $2 AND dp.status = 'approved' AND a.status = 'active'
             RETURNING *`,
            [req.account.id, dietitian_id, goal]
        );
        if (!result.rows.length) return res.status(404).json({ success: false, message: "Approved dietitian not found" });
        return res.status(201).json({ success: true, request: result.rows[0] });
    } catch (error) {
        if (error.code === "23505") return res.status(409).json({ success: false, message: "A pending request already exists" });
        console.error("Error creating guidance request:", error);
        return res.status(500).json({ success: false, message: "Failed to create guidance request" });
    }
};

export const listRecipes = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT r.id, r.title, r.category, r.calories, r.prep_time_minutes,
                    r.image_url, r.instructions, r.serving_size, a.full_name AS author
             FROM recipes r JOIN accounts a ON a.id = r.author_id
             WHERE r.is_published = true
             ORDER BY r.created_at DESC`
        );
        return res.json({ success: true, recipes: result.rows });
    } catch (error) {
        console.error("Error fetching recipes:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch recipes" });
    }
};

export const listMealPlans = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT mp.id, mp.title, mp.target_calories, mp.status, mp.start_date, mp.end_date,
                    a.full_name AS dietitian_name, dp.specialty,
                    COALESCE(json_agg(json_build_object('category', mpi.category, 'recommendation', mpi.recommendation)
                        ORDER BY mpi.sort_order) FILTER (WHERE mpi.id IS NOT NULL), '[]') AS items
             FROM meal_plans mp
             JOIN accounts a ON a.id = mp.dietitian_id
             LEFT JOIN dietitian_profiles dp ON dp.account_id = a.id
             LEFT JOIN meal_plan_items mpi ON mpi.meal_plan_id = mp.id
             WHERE mp.patient_id = $1 AND mp.status <> 'archived'
             GROUP BY mp.id, a.full_name, dp.specialty
             ORDER BY mp.created_at DESC`,
            [req.account.id]
        );
        return res.json({ success: true, plans: result.rows });
    } catch (error) {
        console.error("Error fetching meal plans:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch meal plans" });
    }
};

export const getProgressReport = async (req, res) => {
    try {
        const userId = req.account.id;
        const [profile, calories, water, weights] = await Promise.all([
            pool.query(`SELECT daily_calorie_target, water_target_liters FROM user_profiles WHERE account_id = $1`, [userId]),
            pool.query(`SELECT logged_for, SUM(calories)::int AS calories FROM meal_logs WHERE user_id = $1 AND logged_for >= CURRENT_DATE - INTERVAL '30 days' GROUP BY logged_for ORDER BY logged_for`, [userId]),
            pool.query(`SELECT log_date, amount_liters, target_liters FROM water_logs WHERE user_id = $1 AND log_date >= CURRENT_DATE - INTERVAL '30 days' ORDER BY log_date`, [userId]),
            pool.query(`SELECT date, weight_kg FROM weight_entries WHERE user_id = $1 ORDER BY date DESC LIMIT 30`, [userId])
        ]);
        const target = Number(profile.rows[0]?.daily_calorie_target || 2000);
        const calorieRows = calories.rows.map(row => ({ ...row, calories: Number(row.calories) }));
        const averageCalories = calorieRows.length ? Math.round(calorieRows.reduce((sum, row) => sum + row.calories, 0) / calorieRows.length) : 0;
        const warningDays = calorieRows.filter(row => row.calories >= target * 0.8).length;
        const hydrationDays = water.rows.filter(row => Number(row.amount_liters) >= Number(row.target_liters)).length;
        return res.json({ success: true, report: { averageCalories, targetCalories: target, warningDays, hydrationConsistency: water.rows.length ? Math.round(hydrationDays / water.rows.length * 100) : 0, calories: calorieRows, water: water.rows, weights: weights.rows } });
    } catch (error) {
        console.error("Error generating progress report:", error);
        return res.status(500).json({ success: false, message: "Failed to generate progress report" });
    }
};

export const listConversations = async (req, res) => {
    try {
        const column = req.account.role === "user" ? "c.patient_id" : "c.dietitian_id";
        const result = await pool.query(
            `SELECT c.id, c.patient_id, c.dietitian_id, p.full_name AS patient_name, d.full_name AS dietitian_name
             FROM conversations c JOIN accounts p ON p.id = c.patient_id JOIN accounts d ON d.id = c.dietitian_id
             WHERE ${column} = $1 ORDER BY c.created_at DESC`,
            [req.account.id]
        );
        return res.json({ success: true, conversations: result.rows });
    } catch (error) {
        console.error("Error fetching conversations:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch conversations" });
    }
};

export const listMessages = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT m.id, m.message_text, m.sent_at, m.read_at, m.sender_id, a.full_name AS sender_name
             FROM messages m JOIN conversations c ON c.id = m.conversation_id JOIN accounts a ON a.id = m.sender_id
             WHERE m.conversation_id = $1 AND (c.patient_id = $2 OR c.dietitian_id = $2)
             ORDER BY m.sent_at ASC`,
            [req.params.conversationId, req.account.id]
        );
        return res.json({ success: true, messages: result.rows });
    } catch (error) {
        console.error("Error fetching messages:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch messages" });
    }
};

export const sendMessage = async (req, res) => {
    try {
        const text = String(req.body.text || req.body.message_text || "").trim();
        if (!text) return res.status(400).json({ success: false, message: "Message cannot be empty" });
        const result = await pool.query(
            `INSERT INTO messages (conversation_id, sender_id, message_text)
             SELECT $1, $2, $3 WHERE EXISTS (
                 SELECT 1 FROM conversations WHERE id = $1 AND (patient_id = $2 OR dietitian_id = $2)
             ) RETURNING *`,
            [req.params.conversationId, req.account.id, text]
        );
        if (!result.rows.length) return res.status(404).json({ success: false, message: "Conversation not found" });
        return res.status(201).json({ success: true, message: result.rows[0] });
    } catch (error) {
        console.error("Error sending message:", error);
        return res.status(500).json({ success: false, message: "Failed to send message" });
    }
};

export const markMessagesRead = async (req, res) => {
    try {
        await pool.query(
            `UPDATE messages m SET read_at = CURRENT_TIMESTAMP
             FROM conversations c WHERE m.conversation_id = c.id AND m.conversation_id = $1
             AND m.sender_id <> $2 AND (c.patient_id = $2 OR c.dietitian_id = $2)`,
            [req.params.conversationId, req.account.id]
        );
        return res.status(204).send();
    } catch (error) {
        console.error("Error marking messages read:", error);
        return res.status(500).json({ success: false, message: "Failed to mark messages read" });
    }
};
