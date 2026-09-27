import pool from "../config/db.js";
import bcrypt from "bcryptjs";
import crypto from "crypto";

// ==========================================
// Helper: Create an Audit Log Record
// ==========================================
export const logAudit = async (clientOrPool, {
    eventType,
    description,
    status = "logged",
    actorId = null,
    actorLabel = "System Administrator",
    metadata = {}
}) => {
    try {
        const executor = clientOrPool || pool;
        // Normalize status to valid audit_status ENUM: 'logged', 'completed', 'approved', 'warning', 'rejected', 'active'
        const allowedStatuses = ["logged", "completed", "approved", "warning", "rejected", "active"];
        const normalizedStatus = allowedStatuses.includes(String(status).toLowerCase())
            ? String(status).toLowerCase()
            : "logged";

        await executor.query(
            `INSERT INTO audit_logs (event_type, description, status, actor_id, actor_label, metadata)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
                eventType.slice(0, 60),
                description,
                normalizedStatus,
                actorId,
                actorLabel.slice(0, 150),
                JSON.stringify(metadata)
            ]
        );
    } catch (err) {
        console.error("Audit log error:", err.message);
    }
};

// ==========================================
// 1. DASHBOARD & OVERVIEW
// ==========================================
export const getDashboardOverview = async (req, res) => {
    try {
        const [
            usersRes,
            activeDietitiansRes,
            pendingDietitiansRes,
            foodsRes,
            recentLogsRes,
            plansRes,
            todayMealsRes
        ] = await Promise.all([
            pool.query("SELECT COUNT(*)::int AS count FROM accounts WHERE role = 'user'"),
            pool.query("SELECT COUNT(*)::int AS count FROM dietitian_profiles WHERE status = 'approved'"),
            pool.query("SELECT COUNT(*)::int AS count FROM dietitian_profiles WHERE status = 'pending'"),
            pool.query("SELECT COUNT(*)::int AS count FROM food_items"),
            pool.query(`
                SELECT
                    id,
                    event_type AS type,
                    description,
                    status,
                    actor_label AS actor,
                    to_char(occurred_at, 'Mon DD, HH12:MI AM') AS timestamp,
                    occurred_at
                FROM audit_logs
                ORDER BY occurred_at DESC
                LIMIT 8
            `),
            pool.query("SELECT COUNT(*)::int AS count FROM meal_plans WHERE status = 'active'"),
            pool.query("SELECT COUNT(*)::int AS count FROM meal_logs WHERE logged_for = CURRENT_DATE")
        ]);

        return res.status(200).json({
            success: true,
            stats: {
                totalUsers: usersRes.rows[0].count,
                approvedDietitians: activeDietitiansRes.rows[0].count,
                pendingDietitians: pendingDietitiansRes.rows[0].count,
                totalFoodItems: foodsRes.rows[0].count,
                activeMealPlans: plansRes.rows[0].count,
                todayLoggedMeals: todayMealsRes.rows[0].count
            },
            recentActivity: recentLogsRes.rows
        });
    } catch (error) {
        console.error("getDashboardOverview error:", error);
        return res.status(500).json({ success: false, message: "Failed to load dashboard overview data" });
    }
};

// ==========================================
// 2. USER MANAGEMENT
// ==========================================
export const getUsers = async (req, res) => {
    try {
        const search = String(req.query.search || "").trim();
        const status = String(req.query.status || "All").trim();

        let query = `
            SELECT
                a.id,
                a.full_name AS name,
                a.email,
                a.role,
                INITCAP(a.status::text) AS status,
                to_char(a.joined_at, 'YYYY-MM-DD') AS "joinedDate",
                a.joined_at,
                a.last_login_at,
                up.age,
                up.gender,
                up.height_cm AS height,
                up.starting_weight_kg AS "startingWeight",
                COALESCE(up.current_weight_kg, up.starting_weight_kg) AS weight,
                up.target_weight_kg AS "targetWeight",
                up.primary_goal AS goal,
                up.daily_calorie_target AS "dailyCalorieLimit",
                up.water_target_liters AS "waterTarget",
                up.sleep_target_hours AS "sleepTarget"
            FROM accounts a
            LEFT JOIN user_profiles up ON up.account_id = a.id
            WHERE a.role = 'user'
        `;
        const params = [];

        if (search) {
            params.push(`%${search}%`);
            query += ` AND (a.full_name ILIKE $${params.length} OR a.email ILIKE $${params.length} OR a.id::text ILIKE $${params.length})`;
        }

        if (status && status !== "All") {
            params.push(status.toLowerCase());
            query += ` AND a.status = $${params.length}::account_status`;
        }

        query += ` ORDER BY a.joined_at DESC`;

        const result = await pool.query(query, params);
        return res.status(200).json({ success: true, users: result.rows });
    } catch (error) {
        console.error("getUsers error:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch user accounts" });
    }
};

export const getUserById = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            `SELECT
                a.id,
                a.full_name AS name,
                a.email,
                a.role,
                INITCAP(a.status::text) AS status,
                a.joined_at,
                up.age,
                up.gender,
                up.height_cm AS height,
                up.starting_weight_kg AS "startingWeight",
                up.current_weight_kg AS weight,
                up.target_weight_kg AS "targetWeight",
                up.primary_goal AS goal,
                up.daily_calorie_target AS "dailyCalorieLimit",
                up.water_target_liters AS "waterTarget",
                up.sleep_target_hours AS "sleepTarget"
             FROM accounts a
             LEFT JOIN user_profiles up ON up.account_id = a.id
             WHERE a.id = $1 AND a.role = 'user'`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: "User account not found" });
        }

        // Fetch recent weight entries
        const weights = await pool.query(
            "SELECT date, weight_kg AS weight FROM weight_entries WHERE user_id = $1 ORDER BY date ASC",
            [id]
        );

        return res.status(200).json({
            success: true,
            user: { ...result.rows[0], weightHistory: weights.rows }
        });
    } catch (error) {
        console.error("getUserById error:", error);
        return res.status(500).json({ success: false, message: "Failed to retrieve user details" });
    }
};

export const createUser = async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const {
            name,
            full_name,
            email,
            password = "User@1234",
            age,
            gender,
            height,
            height_cm,
            weight,
            current_weight_kg,
            targetWeight,
            target_weight_kg,
            goal,
            primary_goal,
            dailyCalorieLimit,
            daily_calorie_target,
            waterTarget,
            sleepTarget
        } = req.body;

        const resolvedName = (name || full_name || "").trim();
        const resolvedEmail = (email || "").toLowerCase().trim();

        if (!resolvedName || !resolvedEmail) {
            await client.query("ROLLBACK");
            return res.status(400).json({ success: false, message: "Full name and email are required" });
        }

        const existing = await client.query("SELECT id FROM accounts WHERE lower(email) = $1", [resolvedEmail]);
        if (existing.rows.length > 0) {
            await client.query("ROLLBACK");
            return res.status(409).json({ success: false, message: "An account with this email already exists" });
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);
        const newUserId = crypto.randomUUID();

        // 1. Insert into accounts
        const accountResult = await client.query(
            `INSERT INTO accounts (id, full_name, email, password_hash, role, status)
             VALUES ($1, $2, $3, $4, 'user', 'active')
             RETURNING id, full_name, email, role, status, joined_at`,
            [newUserId, resolvedName, resolvedEmail, passwordHash]
        );

        // 2. Normalize profile fields
        const ageVal = parseInt(age) || null;
        let genderVal = (gender || "other").toLowerCase();
        if (!["female", "male", "other", "prefer_not_to_say"].includes(genderVal)) {
            genderVal = "other";
        }
        const heightVal = parseFloat(height || height_cm) || null;
        const currentWeightVal = parseFloat(weight || current_weight_kg) || null;
        const targetWeightVal = parseFloat(targetWeight || target_weight_kg) || null;
        const goalVal = goal || primary_goal || "General Health";
        const caloriesVal = parseInt(dailyCalorieLimit || daily_calorie_target) || 2000;
        const waterVal = parseFloat(waterTarget) || 2.50;
        const sleepVal = parseFloat(sleepTarget) || 8.00;

        // 3. Insert user_profile
        await client.query(
            `INSERT INTO user_profiles
                (account_id, age, gender, height_cm, starting_weight_kg, current_weight_kg, target_weight_kg, primary_goal, daily_calorie_target, water_target_liters, sleep_target_hours)
             VALUES ($1, $2, $3, $4, $5, $5, $6, $7, $8, $9, $10)`,
            [
                newUserId,
                ageVal,
                genderVal,
                heightVal,
                currentWeightVal,
                targetWeightVal,
                goalVal,
                caloriesVal,
                waterVal,
                sleepVal
            ]
        );

        // 4. Record initial weight entry if provided
        if (currentWeightVal) {
            await client.query(
                `INSERT INTO weight_entries (user_id, date, weight_kg)
                 VALUES ($1, CURRENT_DATE, $2)
                 ON CONFLICT (user_id, date) DO NOTHING`,
                [newUserId, currentWeightVal]
            );
        }

        // 5. Audit log
        await logAudit(client, {
            eventType: "Admin Action",
            description: `Created user account: ${resolvedName} (${resolvedEmail})`,
            status: "completed",
            actorId: req.account.id,
            actorLabel: req.account.full_name || "System Administrator",
            metadata: { userId: newUserId, email: resolvedEmail }
        });

        await client.query("COMMIT");

        return res.status(201).json({
            success: true,
            message: `User account for ${resolvedName} created successfully`,
            user: {
                id: newUserId,
                name: resolvedName,
                email: resolvedEmail,
                status: "Active",
                age: ageVal,
                gender: genderVal,
                height: heightVal,
                weight: currentWeightVal,
                targetWeight: targetWeightVal,
                goal: goalVal,
                dailyCalorieLimit: caloriesVal
            }
        });
    } catch (error) {
        await client.query("ROLLBACK");
        console.error("createUser error:", error);
        return res.status(500).json({ success: false, message: "Failed to create user account" });
    } finally {
        client.release();
    }
};

export const updateUser = async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const { id } = req.params;

        const checkRes = await client.query("SELECT id, full_name, email FROM accounts WHERE id = $1 AND role = 'user'", [id]);
        if (checkRes.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ success: false, message: "User account not found" });
        }

        const {
            name,
            full_name,
            email,
            age,
            gender,
            height,
            height_cm,
            weight,
            current_weight_kg,
            targetWeight,
            target_weight_kg,
            goal,
            primary_goal,
            dailyCalorieLimit,
            daily_calorie_target
        } = req.body;

        const resolvedName = (name || full_name || checkRes.rows[0].full_name).trim();
        const resolvedEmail = (email || checkRes.rows[0].email).toLowerCase().trim();

        // 1. Update accounts
        await client.query(
            `UPDATE accounts
             SET full_name = $1, email = $2, updated_at = CURRENT_TIMESTAMP
             WHERE id = $3`,
            [resolvedName, resolvedEmail, id]
        );

        // 2. Normalize profile fields
        let genderVal = gender ? gender.toLowerCase() : null;
        if (genderVal && !["female", "male", "other", "prefer_not_to_say"].includes(genderVal)) {
            genderVal = "other";
        }

        const ageVal = age ? parseInt(age) : null;
        const heightVal = (height || height_cm) ? parseFloat(height || height_cm) : null;
        const currentWeightVal = (weight || current_weight_kg) ? parseFloat(weight || current_weight_kg) : null;
        const targetWeightVal = (targetWeight || target_weight_kg) ? parseFloat(targetWeight || target_weight_kg) : null;
        const goalVal = goal || primary_goal || null;
        const caloriesVal = (dailyCalorieLimit || daily_calorie_target) ? parseInt(dailyCalorieLimit || daily_calorie_target) : null;

        // 3. Update or upsert user_profiles
        await client.query(
            `INSERT INTO user_profiles (account_id, age, gender, height_cm, current_weight_kg, target_weight_kg, primary_goal, daily_calorie_target, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
             ON CONFLICT (account_id) DO UPDATE
             SET age = COALESCE($2, user_profiles.age),
                 gender = COALESCE($3, user_profiles.gender),
                 height_cm = COALESCE($4, user_profiles.height_cm),
                 current_weight_kg = COALESCE($5, user_profiles.current_weight_kg),
                 target_weight_kg = COALESCE($6, user_profiles.target_weight_kg),
                 primary_goal = COALESCE($7, user_profiles.primary_goal),
                 daily_calorie_target = COALESCE($8, user_profiles.daily_calorie_target),
                 updated_at = CURRENT_TIMESTAMP`,
            [id, ageVal, genderVal, heightVal, currentWeightVal, targetWeightVal, goalVal, caloriesVal]
        );

        // 4. If current weight is provided, record today's entry
        if (currentWeightVal) {
            await client.query(
                `INSERT INTO weight_entries (user_id, date, weight_kg)
                 VALUES ($1, CURRENT_DATE, $2)
                 ON CONFLICT (user_id, date) DO UPDATE
                 SET weight_kg = EXCLUDED.weight_kg`,
                [id, currentWeightVal]
            );
        }

        // 5. Audit log
        await logAudit(client, {
            eventType: "Admin Action",
            description: `Updated profile details for user: ${resolvedName}`,
            status: "completed",
            actorId: req.account.id,
            actorLabel: req.account.full_name || "System Administrator",
            metadata: { userId: id }
        });

        await client.query("COMMIT");

        return res.status(200).json({
            success: true,
            message: `User ${resolvedName} updated successfully`
        });
    } catch (error) {
        await client.query("ROLLBACK");
        console.error("updateUser error:", error);
        return res.status(500).json({ success: false, message: "Failed to update user profile" });
    } finally {
        client.release();
    }
};

export const toggleUserStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const current = await pool.query("SELECT id, full_name, status FROM accounts WHERE id = $1 AND role = 'user'", [id]);
        if (current.rows.length === 0) {
            return res.status(404).json({ success: false, message: "User account not found" });
        }

        const currentStatus = current.rows[0].status;
        const newStatus = currentStatus === "active" ? "inactive" : "active";

        await pool.query(
            "UPDATE accounts SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
            [newStatus, id]
        );

        await logAudit(pool, {
            eventType: "Admin Action",
            description: `Toggled user status for ${current.rows[0].full_name} to ${newStatus}`,
            status: "completed",
            actorId: req.account.id,
            actorLabel: req.account.full_name || "System Administrator",
            metadata: { userId: id, status: newStatus }
        });

        return res.status(200).json({
            success: true,
            message: `User status changed to ${newStatus}`,
            newStatus: newStatus === "active" ? "Active" : "Inactive"
        });
    } catch (error) {
        console.error("toggleUserStatus error:", error);
        return res.status(500).json({ success: false, message: "Failed to change user status" });
    }
};

export const deleteUser = async (req, res) => {
    try {
        const { id } = req.params;
        const target = await pool.query("SELECT id, full_name, email FROM accounts WHERE id = $1 AND role = 'user'", [id]);
        if (target.rows.length === 0) {
            return res.status(404).json({ success: false, message: "User account not found" });
        }

        await pool.query("DELETE FROM accounts WHERE id = $1", [id]);

        await logAudit(pool, {
            eventType: "Admin Action",
            description: `Permanently deleted user account: ${target.rows[0].full_name} (${target.rows[0].email})`,
            status: "warning",
            actorId: req.account.id,
            actorLabel: req.account.full_name || "System Administrator",
            metadata: { deletedUserId: id, email: target.rows[0].email }
        });

        return res.status(200).json({
            success: true,
            message: `User ${target.rows[0].full_name} was deleted successfully`
        });
    } catch (error) {
        console.error("deleteUser error:", error);
        return res.status(500).json({ success: false, message: "Failed to delete user account" });
    }
};

// ==========================================
// 3. DIETITIAN MANAGEMENT & APPROVALS
// ==========================================
export const getDietitians = async (req, res) => {
    try {
        const search = String(req.query.search || "").trim();
        const status = String(req.query.status || "All").trim();

        let query = `
            SELECT
                a.id,
                a.full_name AS name,
                a.email,
                INITCAP(a.status::text) AS "accountStatus",
                a.joined_at,
                dp.specialty,
                COALESCE(dp.years_experience::text || ' Years', '0 Years') AS experience,
                dp.years_experience AS "experienceYears",
                dp.qualification,
                dp.rating,
                INITCAP(dp.status::text) AS status,
                dp.status AS "rawStatus",
                dp.avatar_url AS avatar,
                dp.reviewed_by,
                dp.reviewed_at,
                dp.review_note,
                reviewer.full_name AS "reviewedByName"
            FROM accounts a
            JOIN dietitian_profiles dp ON dp.account_id = a.id
            LEFT JOIN accounts reviewer ON reviewer.id = dp.reviewed_by
            WHERE a.role = 'dietitian'
        `;
        const params = [];

        if (search) {
            params.push(`%${search}%`);
            query += ` AND (a.full_name ILIKE $${params.length} OR a.email ILIKE $${params.length} OR dp.specialty ILIKE $${params.length})`;
        }

        if (status && status !== "All") {
            params.push(status.toLowerCase());
            query += ` AND dp.status = $${params.length}::dietitian_status`;
        }

        query += ` ORDER BY CASE WHEN dp.status = 'pending' THEN 0 ELSE 1 END, a.joined_at DESC`;

        const result = await pool.query(query, params);
        return res.status(200).json({ success: true, dietitians: result.rows });
    } catch (error) {
        console.error("getDietitians error:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch dietitians" });
    }
};

export const getDietitianById = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            `SELECT
                a.id,
                a.full_name AS name,
                a.email,
                a.status AS "accountStatus",
                dp.specialty,
                dp.years_experience AS "yearsExperience",
                dp.qualification,
                dp.avatar_url AS avatar,
                dp.rating,
                INITCAP(dp.status::text) AS status,
                dp.reviewed_by,
                dp.reviewed_at,
                dp.review_note,
                reviewer.full_name AS "reviewedByName"
             FROM accounts a
             JOIN dietitian_profiles dp ON dp.account_id = a.id
             LEFT JOIN accounts reviewer ON reviewer.id = dp.reviewed_by
             WHERE a.id = $1 AND a.role = 'dietitian'`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Dietitian profile not found" });
        }

        return res.status(200).json({ success: true, dietitian: result.rows[0] });
    } catch (error) {
        console.error("getDietitianById error:", error);
        return res.status(500).json({ success: false, message: "Failed to retrieve dietitian profile" });
    }
};

export const createDietitian = async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const {
            name,
            full_name,
            email,
            password = "Dietitian@123",
            specialty,
            experience,
            years_experience,
            qualification,
            avatar,
            avatar_url
        } = req.body;

        const resolvedName = (name || full_name || "").trim();
        const resolvedEmail = (email || "").toLowerCase().trim();

        if (!resolvedName || !resolvedEmail || !specialty) {
            await client.query("ROLLBACK");
            return res.status(400).json({ success: false, message: "Name, email, and specialty are required" });
        }

        const existing = await client.query("SELECT id FROM accounts WHERE lower(email) = $1", [resolvedEmail]);
        if (existing.rows.length > 0) {
            await client.query("ROLLBACK");
            return res.status(409).json({ success: false, message: "Account with this email already exists" });
        }

        // Check auto_approve_dietitians setting
        const settingsRes = await client.query("SELECT auto_approve_dietitians FROM system_settings WHERE id = true");
        const autoApprove = settingsRes.rows[0]?.auto_approve_dietitians || false;
        const initialStatus = autoApprove ? "approved" : "pending";

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);
        const newDietitianId = crypto.randomUUID();

        // 1. Insert into accounts
        await client.query(
            `INSERT INTO accounts (id, full_name, email, password_hash, role, status)
             VALUES ($1, $2, $3, $4, 'dietitian', 'active')`,
            [newDietitianId, resolvedName, resolvedEmail, passwordHash]
        );

        // 2. Parse years of experience
        const expNum = parseFloat(years_experience || experience) || 3.0;
        const avatarUrl = avatar || avatar_url || "https://images.unsplash.com/photo-1594824813566-78a933f2c38f?w=150";

        // 3. Insert into dietitian_profiles
        await client.query(
            `INSERT INTO dietitian_profiles (account_id, specialty, years_experience, qualification, rating, status, avatar_url, reviewed_by, reviewed_at)
             VALUES ($1, $2, $3, $4, 5.0, $5, $6, $7, $8)`,
            [
                newDietitianId,
                specialty,
                expNum,
                qualification || "Certified Clinical Nutritionist",
                initialStatus,
                avatarUrl,
                autoApprove ? req.account.id : null,
                autoApprove ? new Date() : null
            ]
        );

        // 4. Audit log
        await logAudit(client, {
            eventType: "Dietitian Registration",
            description: `Registered new dietitian: ${resolvedName} (${specialty})${autoApprove ? ' [Auto-Approved]' : ' [Pending Review]'}`,
            status: autoApprove ? "approved" : "logged",
            actorId: req.account.id,
            actorLabel: req.account.full_name || "System Administrator",
            metadata: { dietitianId: newDietitianId, autoApproved: autoApprove }
        });

        await client.query("COMMIT");

        return res.status(201).json({
            success: true,
            message: `Dietitian ${resolvedName} registered successfully!`,
            dietitian: {
                id: newDietitianId,
                name: resolvedName,
                email: resolvedEmail,
                specialty,
                experience: `${expNum} Years`,
                status: autoApprove ? "Approved" : "Pending",
                rating: 5.0,
                avatar: avatarUrl
            }
        });
    } catch (error) {
        await client.query("ROLLBACK");
        console.error("createDietitian error:", error);
        return res.status(500).json({ success: false, message: "Failed to register dietitian profile" });
    } finally {
        client.release();
    }
};

export const approveDietitian = async (req, res) => {
    try {
        const { id } = req.params;
        const { review_note } = req.body;

        const checkRes = await pool.query(
            `SELECT a.full_name, dp.status FROM dietitian_profiles dp
             JOIN accounts a ON a.id = dp.account_id
             WHERE dp.account_id = $1`,
            [id]
        );

        if (checkRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Dietitian application not found" });
        }

        await pool.query(
            `UPDATE dietitian_profiles
             SET status = 'approved',
                 reviewed_by = $1,
                 reviewed_at = CURRENT_TIMESTAMP,
                 review_note = COALESCE($2, review_note),
                 updated_at = CURRENT_TIMESTAMP
             WHERE account_id = $3`,
            [req.account.id, review_note || "Approved by Administrator", id]
        );

        // Ensure account is active
        await pool.query("UPDATE accounts SET status = 'active' WHERE id = $1", [id]);

        await logAudit(pool, {
            eventType: "Admin Action",
            description: `Approved dietitian registration for ${checkRes.rows[0].full_name}`,
            status: "approved",
            actorId: req.account.id,
            actorLabel: req.account.full_name || "System Administrator",
            metadata: { dietitianId: id }
        });

        return res.status(200).json({
            success: true,
            message: `Dietitian registration for ${checkRes.rows[0].full_name} approved successfully!`
        });
    } catch (error) {
        console.error("approveDietitian error:", error);
        return res.status(500).json({ success: false, message: "Failed to approve dietitian" });
    }
};

export const rejectDietitian = async (req, res) => {
    try {
        const { id } = req.params;
        const { review_note } = req.body;

        const checkRes = await pool.query(
            `SELECT a.full_name FROM dietitian_profiles dp
             JOIN accounts a ON a.id = dp.account_id
             WHERE dp.account_id = $1`,
            [id]
        );

        if (checkRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Dietitian application not found" });
        }

        await pool.query(
            `UPDATE dietitian_profiles
             SET status = 'rejected',
                 reviewed_by = $1,
                 reviewed_at = CURRENT_TIMESTAMP,
                 review_note = $2,
                 updated_at = CURRENT_TIMESTAMP
             WHERE account_id = $3`,
            [req.account.id, review_note || "Application does not meet requirements", id]
        );

        await logAudit(pool, {
            eventType: "Admin Action",
            description: `Rejected dietitian registration for ${checkRes.rows[0].full_name}`,
            status: "rejected",
            actorId: req.account.id,
            actorLabel: req.account.full_name || "System Administrator",
            metadata: { dietitianId: id, reason: review_note }
        });

        return res.status(200).json({
            success: true,
            message: `Dietitian application for ${checkRes.rows[0].full_name} rejected`
        });
    } catch (error) {
        console.error("rejectDietitian error:", error);
        return res.status(500).json({ success: false, message: "Failed to reject dietitian application" });
    }
};

export const suspendDietitian = async (req, res) => {
    try {
        const { id } = req.params;
        const { review_note } = req.body;

        const checkRes = await pool.query(
            `SELECT a.full_name, dp.status FROM dietitian_profiles dp
             JOIN accounts a ON a.id = dp.account_id
             WHERE dp.account_id = $1`,
            [id]
        );

        if (checkRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Dietitian not found" });
        }

        await pool.query(
            `UPDATE dietitian_profiles
             SET status = 'suspended',
                 reviewed_by = $1,
                 reviewed_at = CURRENT_TIMESTAMP,
                 review_note = $2,
                 updated_at = CURRENT_TIMESTAMP
             WHERE account_id = $3`,
            [req.account.id, review_note || "Account suspended by Administrator", id]
        );

        await pool.query("UPDATE accounts SET status = 'inactive' WHERE id = $1", [id]);

        await logAudit(pool, {
            eventType: "Admin Action",
            description: `Suspended clinical dietitian profile: ${checkRes.rows[0].full_name}`,
            status: "warning",
            actorId: req.account.id,
            actorLabel: req.account.full_name || "System Administrator",
            metadata: { dietitianId: id }
        });

        return res.status(200).json({
            success: true,
            message: `Dietitian account for ${checkRes.rows[0].full_name} has been suspended`
        });
    } catch (error) {
        console.error("suspendDietitian error:", error);
        return res.status(500).json({ success: false, message: "Failed to suspend dietitian" });
    }
};

export const deleteDietitian = async (req, res) => {
    try {
        const { id } = req.params;
        const checkRes = await pool.query(
            `SELECT a.full_name, a.email FROM dietitian_profiles dp
             JOIN accounts a ON a.id = dp.account_id
             WHERE dp.account_id = $1`,
            [id]
        );

        if (checkRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Dietitian not found" });
        }

        await pool.query("DELETE FROM accounts WHERE id = $1", [id]);

        await logAudit(pool, {
            eventType: "Admin Action",
            description: `Deleted dietitian profile: ${checkRes.rows[0].full_name} (${checkRes.rows[0].email})`,
            status: "warning",
            actorId: req.account.id,
            actorLabel: req.account.full_name || "System Administrator",
            metadata: { dietitianId: id }
        });

        return res.status(200).json({
            success: true,
            message: `Dietitian ${checkRes.rows[0].full_name} removed from system`
        });
    } catch (error) {
        console.error("deleteDietitian error:", error);
        return res.status(500).json({ success: false, message: "Failed to remove dietitian profile" });
    }
};

// ==========================================
// 4. FOOD DATABASE CATALOG MANAGEMENT
// ==========================================
export const getFoodCatalog = async (req, res) => {
    try {
        const search = String(req.query.search || "").trim();
        const category = String(req.query.category || "All").trim();

        let query = `
            SELECT
                id,
                name,
                INITCAP(category::text) AS category,
                category AS "rawCategory",
                calories,
                ROUND(protein_g::numeric, 1) AS protein,
                ROUND(carbohydrates_g::numeric, 1) AS carbs,
                ROUND(fat_g::numeric, 1) AS fat,
                portion_description AS portion,
                created_at,
                updated_at
            FROM food_items
            WHERE 1=1
        `;
        const params = [];

        if (search) {
            params.push(`%${search}%`);
            query += ` AND (name ILIKE $${params.length} OR category::text ILIKE $${params.length})`;
        }

        if (category && category !== "All") {
            params.push(category.toLowerCase());
            query += ` AND category = $${params.length}::meal_category`;
        }

        query += ` ORDER BY name ASC`;

        const [itemsRes, summaryRes] = await Promise.all([
            pool.query(query, params),
            pool.query(`
                SELECT
                    COUNT(*)::int AS "totalCount",
                    COALESCE(ROUND(AVG(calories)), 0)::int AS "avgCalories"
                FROM food_items
            `)
        ]);

        return res.status(200).json({
            success: true,
            foods: itemsRes.rows,
            summary: summaryRes.rows[0]
        });
    } catch (error) {
        console.error("getFoodCatalog error:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch food catalog" });
    }
};

export const getFoodById = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            `SELECT
                id,
                name,
                INITCAP(category::text) AS category,
                calories,
                protein_g AS protein,
                carbohydrates_g AS carbs,
                fat_g AS fat,
                portion_description AS portion
             FROM food_items WHERE id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Food item not found" });
        }

        return res.status(200).json({ success: true, food: result.rows[0] });
    } catch (error) {
        console.error("getFoodById error:", error);
        return res.status(500).json({ success: false, message: "Failed to retrieve food item" });
    }
};

export const createFoodItem = async (req, res) => {
    try {
        const {
            name,
            category,
            calories,
            protein = 0,
            protein_g,
            carbs = 0,
            carbohydrates_g,
            fat = 0,
            fat_g,
            portion,
            portion_description
        } = req.body;

        const resolvedName = (name || "").trim();
        const resolvedPortion = (portion || portion_description || "1 serving").trim();
        const resolvedCategory = (category || "breakfast").toLowerCase().trim();

        if (!resolvedName || calories === undefined) {
            return res.status(400).json({ success: false, message: "Food name and calories are required" });
        }

        const validCategories = ["breakfast", "lunch", "dinner", "snacks"];
        if (!validCategories.includes(resolvedCategory)) {
            return res.status(400).json({
                success: false,
                message: `Invalid meal category. Must be one of: ${validCategories.join(", ")}`
            });
        }

        const calVal = parseInt(calories) || 0;
        const proteinVal = parseFloat(protein_g ?? protein) || 0;
        const carbsVal = parseFloat(carbohydrates_g ?? carbs) || 0;
        const fatVal = parseFloat(fat_g ?? fat) || 0;

        const insertRes = await pool.query(
            `INSERT INTO food_items
                (name, category, calories, protein_g, carbohydrates_g, fat_g, portion_description, created_by)
             VALUES ($1, $2::meal_category, $3, $4, $5, $6, $7, $8)
             RETURNING id, name, category, calories, protein_g AS protein, carbohydrates_g AS carbs, fat_g AS fat, portion_description AS portion`,
            [
                resolvedName,
                resolvedCategory,
                calVal,
                proteinVal,
                carbsVal,
                fatVal,
                resolvedPortion,
                req.account.id
            ]
        );

        await logAudit(pool, {
            eventType: "Admin Action",
            description: `Added food item "${resolvedName}" to catalog`,
            status: "completed",
            actorId: req.account.id,
            actorLabel: req.account.full_name || "System Administrator",
            metadata: { foodId: insertRes.rows[0].id, category: resolvedCategory, calories: calVal }
        });

        return res.status(201).json({
            success: true,
            message: `Food item "${resolvedName}" added to catalog!`,
            food: {
                ...insertRes.rows[0],
                category: resolvedCategory.charAt(0).toUpperCase() + resolvedCategory.slice(1)
            }
        });
    } catch (error) {
        console.error("createFoodItem error:", error);
        return res.status(500).json({ success: false, message: "Failed to create food item" });
    }
};

export const updateFoodItem = async (req, res) => {
    try {
        const { id } = req.params;
        const checkRes = await pool.query("SELECT id, name FROM food_items WHERE id = $1", [id]);
        if (checkRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Food item not found in catalog" });
        }

        const {
            name,
            category,
            calories,
            protein,
            protein_g,
            carbs,
            carbohydrates_g,
            fat,
            fat_g,
            portion,
            portion_description
        } = req.body;

        const resolvedName = (name || checkRes.rows[0].name).trim();
        const resolvedCategory = (category ? category.toLowerCase().trim() : null);

        const validCategories = ["breakfast", "lunch", "dinner", "snacks"];
        if (resolvedCategory && !validCategories.includes(resolvedCategory)) {
            return res.status(400).json({ success: false, message: "Invalid category" });
        }

        const calVal = calories !== undefined ? parseInt(calories) : null;
        const proteinVal = (protein_g ?? protein) !== undefined ? parseFloat(protein_g ?? protein) : null;
        const carbsVal = (carbohydrates_g ?? carbs) !== undefined ? parseFloat(carbohydrates_g ?? carbs) : null;
        const fatVal = (fat_g ?? fat) !== undefined ? parseFloat(fat_g ?? fat) : null;
        const portionVal = portion || portion_description || null;

        await pool.query(
            `UPDATE food_items
             SET name = COALESCE($1, name),
                 category = COALESCE($2::meal_category, category),
                 calories = COALESCE($3, calories),
                 protein_g = COALESCE($4, protein_g),
                 carbohydrates_g = COALESCE($5, carbohydrates_g),
                 fat_g = COALESCE($6, fat_g),
                 portion_description = COALESCE($7, portion_description),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $8`,
            [resolvedName, resolvedCategory, calVal, proteinVal, carbsVal, fatVal, portionVal, id]
        );

        await logAudit(pool, {
            eventType: "Admin Action",
            description: `Updated food catalog item "${resolvedName}"`,
            status: "completed",
            actorId: req.account.id,
            actorLabel: req.account.full_name || "System Administrator",
            metadata: { foodId: id }
        });

        return res.status(200).json({
            success: true,
            message: `Updated food item "${resolvedName}"`
        });
    } catch (error) {
        console.error("updateFoodItem error:", error);
        return res.status(500).json({ success: false, message: "Failed to update food item" });
    }
};

export const deleteFoodItem = async (req, res) => {
    try {
        const { id } = req.params;
        const checkRes = await pool.query("SELECT id, name FROM food_items WHERE id = $1", [id]);
        if (checkRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Food item not found" });
        }

        await pool.query("DELETE FROM food_items WHERE id = $1", [id]);

        await logAudit(pool, {
            eventType: "Admin Action",
            description: `Deleted food item "${checkRes.rows[0].name}" from catalog`,
            status: "warning",
            actorId: req.account.id,
            actorLabel: req.account.full_name || "System Administrator",
            metadata: { foodId: id }
        });

        return res.status(200).json({
            success: true,
            message: `Food item "${checkRes.rows[0].name}" removed from catalog`
        });
    } catch (error) {
        console.error("deleteFoodItem error:", error);
        return res.status(500).json({ success: false, message: "Failed to delete food item" });
    }
};

// ==========================================
// 5. SYSTEM SETTINGS
// ==========================================
export const getSystemSettings = async (req, res) => {
    try {
        let result = await pool.query("SELECT * FROM system_settings WHERE id = true");
        if (result.rows.length === 0) {
            await pool.query(
                `INSERT INTO system_settings (id, warning_percentage, default_water_liters, default_sleep_hours, maintenance_mode, auto_approve_dietitians)
                 VALUES (true, 80, 2.50, 8.00, false, false)
                 ON CONFLICT (id) DO NOTHING`
            );
            result = await pool.query("SELECT * FROM system_settings WHERE id = true");
        }

        const s = result.rows[0];
        return res.status(200).json({
            success: true,
            settings: {
                warnPct: s.warning_percentage,
                warningPercentage: s.warning_percentage,
                defaultWater: parseFloat(s.default_water_liters),
                defaultSleep: parseFloat(s.default_sleep_hours),
                maintenanceMode: s.maintenance_mode,
                autoApproveDietitians: s.auto_approve_dietitians,
                updatedAt: s.updated_at
            }
        });
    } catch (error) {
        console.error("getSystemSettings error:", error);
        return res.status(500).json({ success: false, message: "Failed to retrieve system settings" });
    }
};

export const updateSystemSettings = async (req, res) => {
    try {
        const {
            warnPct,
            warning_percentage,
            defaultWater,
            default_water_liters,
            defaultSleep,
            default_sleep_hours,
            maintenanceMode,
            maintenance_mode,
            autoApproveDietitians,
            auto_approve_dietitians
        } = req.body;

        const warnVal = parseInt(warnPct ?? warning_percentage) || 80;
        const waterVal = parseFloat(defaultWater ?? default_water_liters) || 2.50;
        const sleepVal = parseFloat(defaultSleep ?? default_sleep_hours) || 8.00;
        const maintenanceVal = (maintenanceMode ?? maintenance_mode) === true || (maintenanceMode ?? maintenance_mode) === "true";
        const autoApproveVal = (autoApproveDietitians ?? auto_approve_dietitians) === true || (autoApproveDietitians ?? auto_approve_dietitians) === "true";

        await pool.query(
            `UPDATE system_settings
             SET warning_percentage = $1,
                 default_water_liters = $2,
                 default_sleep_hours = $3,
                 maintenance_mode = $4,
                 auto_approve_dietitians = $5,
                 updated_by = $6,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = true`,
            [warnVal, waterVal, sleepVal, maintenanceVal, autoApproveVal, req.account.id]
        );

        await logAudit(pool, {
            eventType: "Admin Action",
            description: "Updated system threshold and configuration settings",
            status: "completed",
            actorId: req.account.id,
            actorLabel: req.account.full_name || "System Administrator",
            metadata: {
                warning_percentage: warnVal,
                default_water: waterVal,
                default_sleep: sleepVal,
                maintenance_mode: maintenanceVal,
                auto_approve: autoApproveVal
            }
        });

        return res.status(200).json({
            success: true,
            message: "System configuration settings saved successfully!",
            settings: {
                warnPct: warnVal,
                defaultWater: waterVal,
                defaultSleep: sleepVal,
                maintenanceMode: maintenanceVal,
                autoApproveDietitians: autoApproveVal
            }
        });
    } catch (error) {
        console.error("updateSystemSettings error:", error);
        return res.status(500).json({ success: false, message: "Failed to save system settings" });
    }
};

// ==========================================
// 6. SYSTEM AUDIT LOGS
// ==========================================
export const getAuditLogs = async (req, res) => {
    try {
        const filterType = String(req.query.type || "All").trim();
        const limit = parseInt(req.query.limit) || 100;
        const offset = parseInt(req.query.offset) || 0;

        let query = `
            SELECT
                'AUD-' || id AS id,
                id AS "rawId",
                event_type AS type,
                description,
                INITCAP(status::text) AS status,
                actor_label AS actor,
                to_char(occurred_at, 'Mon DD, HH12:MI AM') AS timestamp,
                occurred_at
            FROM audit_logs
            WHERE 1=1
        `;
        const params = [];

        if (filterType && filterType !== "All") {
            params.push(`%${filterType}%`);
            query += ` AND event_type ILIKE $${params.length}`;
        }

        params.push(limit);
        query += ` ORDER BY occurred_at DESC LIMIT $${params.length}`;

        params.push(offset);
        query += ` OFFSET $${params.length}`;

        const result = await pool.query(query, params);
        return res.status(200).json({ success: true, logs: result.rows });
    } catch (error) {
        console.error("getAuditLogs error:", error);
        return res.status(500).json({ success: false, message: "Failed to retrieve audit logs" });
    }
};

export const clearAuditLogs = async (req, res) => {
    try {
        await pool.query("TRUNCATE TABLE audit_logs RESTART IDENTITY");

        // Record a fresh log documenting that logs were cleared
        await logAudit(pool, {
            eventType: "Admin Action",
            description: "Cleared historical audit logs and reset log store",
            status: "warning",
            actorId: req.account.id,
            actorLabel: req.account.full_name || "System Administrator"
        });

        return res.status(200).json({
            success: true,
            message: "System audit logs cleared successfully."
        });
    } catch (error) {
        console.error("clearAuditLogs error:", error);
        return res.status(500).json({ success: false, message: "Failed to clear audit logs" });
    }
};

// ==========================================
// 7. SYSTEM REPORTS & ANALYTICS
// ==========================================
export const getWeeklyCalorieReport = async (req, res) => {
    try {
        const [statsRes, mealsRes] = await Promise.all([
            pool.query(`
                SELECT
                    COUNT(*)::int AS "totalMeals",
                    COALESCE(ROUND(AVG(calories)), 0)::int AS "avgCalories",
                    COALESCE(SUM(calories), 0)::int AS "totalCalories"
                FROM meal_logs
                WHERE logged_for >= CURRENT_DATE - INTERVAL '7 days'
            `),
            pool.query(`
                SELECT
                    ml.id,
                    a.full_name AS "userName",
                    a.email AS "userEmail",
                    INITCAP(ml.category::text) AS category,
                    ml.meal_name AS name,
                    ml.calories,
                    to_char(ml.logged_for, 'YYYY-MM-DD') AS date,
                    to_char(ml.logged_at, 'HH12:MI AM') AS "loggedAt"
                FROM meal_logs ml
                JOIN accounts a ON a.id = ml.user_id
                WHERE ml.logged_for >= CURRENT_DATE - INTERVAL '7 days'
                ORDER BY ml.logged_at DESC
                LIMIT 50
            `)
        ]);

        return res.status(200).json({
            success: true,
            summary: {
                loggedMeals: statsRes.rows[0].totalMeals,
                avgCaloriesPerMeal: statsRes.rows[0].avgCalories,
                totalCalories: statsRes.rows[0].totalCalories,
                targetAdherence: "94.2%"
            },
            meals: mealsRes.rows
        });
    } catch (error) {
        console.error("getWeeklyCalorieReport error:", error);
        return res.status(500).json({ success: false, message: "Failed to generate calorie report" });
    }
};

export const getWeightLossTrendsReport = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                a.id,
                a.full_name AS name,
                a.email,
                COALESCE(up.starting_weight_kg, up.current_weight_kg, 70.0) AS "startingWeight",
                COALESCE(up.current_weight_kg, up.starting_weight_kg, 70.0) AS "currentWeight",
                COALESCE(up.target_weight_kg, up.current_weight_kg, 65.0) AS "targetWeight",
                ROUND((COALESCE(up.current_weight_kg, 0) - COALESCE(up.starting_weight_kg, up.current_weight_kg, 0))::numeric, 1) AS "weightChangeKg"
            FROM accounts a
            JOIN user_profiles up ON up.account_id = a.id
            WHERE a.role = 'user'
            ORDER BY a.full_name ASC
        `);

        const formatted = result.rows.map(row => {
            const diff = row.weightChangeKg;
            let status = "On Track";
            if (diff < 0) {
                status = `On Track (${diff} kg)`;
            } else if (diff > 0) {
                status = `Gaining (+${diff} kg)`;
            } else {
                status = "Stable (0.0 kg)";
            }
            return {
                ...row,
                progressStatus: status
            };
        });

        return res.status(200).json({
            success: true,
            totalUsersTracked: formatted.length,
            trends: formatted
        });
    } catch (error) {
        console.error("getWeightLossTrendsReport error:", error);
        return res.status(500).json({ success: false, message: "Failed to generate weight loss report" });
    }
};

export const getDietitianEngagementReport = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                a.id,
                a.full_name AS name,
                a.email,
                dp.specialty,
                INITCAP(dp.status::text) AS status,
                dp.rating,
                COALESCE(req_count.assigned_patients, 0)::int AS "assignedPatients",
                COALESCE(plan_count.created_plans, 0)::int AS "createdPlans"
            FROM accounts a
            JOIN dietitian_profiles dp ON dp.account_id = a.id
            LEFT JOIN (
                SELECT dietitian_id, COUNT(DISTINCT patient_id) AS assigned_patients
                FROM guidance_requests
                GROUP BY dietitian_id
            ) req_count ON req_count.dietitian_id = a.id
            LEFT JOIN (
                SELECT dietitian_id, COUNT(*) AS created_plans
                FROM meal_plans
                GROUP BY dietitian_id
            ) plan_count ON plan_count.dietitian_id = a.id
            WHERE a.role = 'dietitian'
            ORDER BY dp.rating DESC, a.full_name ASC
        `);

        return res.status(200).json({
            success: true,
            activeSpecialists: result.rows.filter(d => d.status === "Approved").length,
            dietitians: result.rows
        });
    } catch (error) {
        console.error("getDietitianEngagementReport error:", error);
        return res.status(500).json({ success: false, message: "Failed to generate dietitian engagement report" });
    }
};

export const exportReportData = async (req, res) => {
    try {
        const { type } = req.params;

        if (type === "Users") {
            const users = await pool.query(`
                SELECT
                    a.id,
                    a.full_name AS name,
                    a.email,
                    a.status,
                    a.joined_at,
                    up.age,
                    up.gender,
                    up.height_cm,
                    up.starting_weight_kg,
                    up.current_weight_kg,
                    up.target_weight_kg,
                    up.primary_goal,
                    up.daily_calorie_target
                FROM accounts a
                LEFT JOIN user_profiles up ON up.account_id = a.id
                WHERE a.role = 'user'
                ORDER BY a.joined_at DESC
            `);
            return res.status(200).json({ success: true, rows: users.rows });
        } else if (type === "FoodCatalog") {
            const foods = await pool.query(`
                SELECT id, name, category, calories, protein_g, carbohydrates_g, fat_g, portion_description
                FROM food_items
                ORDER BY category, name ASC
            `);
            return res.status(200).json({ success: true, rows: foods.rows });
        } else if (type === "Dietitians") {
            const dietitians = await pool.query(`
                SELECT a.id, a.full_name, a.email, dp.specialty, dp.years_experience, dp.rating, dp.status
                FROM accounts a
                JOIN dietitian_profiles dp ON dp.account_id = a.id
                ORDER BY a.full_name ASC
            `);
            return res.status(200).json({ success: true, rows: dietitians.rows });
        } else if (type === "AuditLogs") {
            const logs = await pool.query(`
                SELECT id, event_type, description, status, actor_label, occurred_at
                FROM audit_logs
                ORDER BY occurred_at DESC
            `);
            return res.status(200).json({ success: true, rows: logs.rows });
        } else {
            const meals = await pool.query(`
                SELECT ml.id, a.full_name AS user, ml.logged_for AS date, ml.category, ml.meal_name, ml.calories, ml.logged_at
                FROM meal_logs ml
                JOIN accounts a ON a.id = ml.user_id
                ORDER BY ml.logged_at DESC
                LIMIT 500
            `);
            return res.status(200).json({ success: true, rows: meals.rows });
        }
    } catch (error) {
        console.error("exportReportData error:", error);
        return res.status(500).json({ success: false, message: "Export failed" });
    }
};
