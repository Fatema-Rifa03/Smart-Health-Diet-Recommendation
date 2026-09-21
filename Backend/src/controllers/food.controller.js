import pool from "../config/db.js";

export const getFoods = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, name, category, calories, portion_description FROM food_items ORDER BY name ASC`
        );
        return res.status(200).json({ success: true, foods: result.rows });
    } catch (error) {
        console.error("Error fetching foods:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch foods" });
    }
};
