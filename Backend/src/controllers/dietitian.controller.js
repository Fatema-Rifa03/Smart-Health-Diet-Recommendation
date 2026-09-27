import pool from "../config/db.js";
import { logAudit } from "./admin.controller.js";

// ==========================================
// 1. DIETITIAN PROFILE & VERIFICATION
// ==========================================

export const getDietitianProfile = async (req, res) => {
    try {
        const dietitianId = req.account.id;

        // Check if profile row exists, if not create default
        let profileRes = await pool.query(
            `SELECT
                a.id,
                a.full_name AS name,
                a.email,
                a.status AS account_status,
                a.joined_at,
                dp.specialty,
                dp.years_experience,
                dp.qualification,
                dp.avatar_url,
                dp.rating,
                dp.status AS verification_status,
                dp.reviewed_at,
                dp.review_note,
                reviewer.full_name AS reviewed_by_name
             FROM accounts a
             LEFT JOIN dietitian_profiles dp ON dp.account_id = a.id
             LEFT JOIN accounts reviewer ON reviewer.id = dp.reviewed_by
             WHERE a.id = $1`,
            [dietitianId]
        );

        if (profileRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Dietitian account not found" });
        }

        let profile = profileRes.rows[0];

        // If no dietitian_profiles record exists yet, insert a pending profile
        if (!profile.specialty) {
            await pool.query(
                `INSERT INTO dietitian_profiles (account_id, specialty, years_experience, qualification, status)
                 VALUES ($1, 'Clinical Nutrition & Dietetics', 3.0, 'Certified Nutritionist', 'pending')
                 ON CONFLICT (account_id) DO NOTHING`,
                [dietitianId]
            );

            profileRes = await pool.query(
                `SELECT
                    a.id,
                    a.full_name AS name,
                    a.email,
                    a.status AS account_status,
                    a.joined_at,
                    dp.specialty,
                    dp.years_experience,
                    dp.qualification,
                    dp.avatar_url,
                    dp.rating,
                    dp.status AS verification_status,
                    dp.reviewed_at,
                    dp.review_note,
                    reviewer.full_name AS reviewed_by_name
                 FROM accounts a
                 JOIN dietitian_profiles dp ON dp.account_id = a.id
                 LEFT JOIN accounts reviewer ON reviewer.id = dp.reviewed_by
                 WHERE a.id = $1`,
                [dietitianId]
            );
            profile = profileRes.rows[0];
        }

        return res.status(200).json({
            success: true,
            profile: {
                id: profile.id,
                name: profile.name,
                email: profile.email,
                specialty: profile.specialty || "Clinical Nutrition",
                yearsExperience: parseFloat(profile.years_experience) || 0,
                qualification: profile.qualification || "",
                avatarUrl: profile.avatar_url || "https://images.unsplash.com/photo-1594824813566-78a933f2c38f?w=150",
                rating: parseFloat(profile.rating) || 5.0,
                status: profile.verification_status, // 'pending', 'approved', 'rejected', 'suspended'
                reviewedAt: profile.reviewed_at,
                reviewNote: profile.review_note,
                reviewedByName: profile.reviewed_by_name
            }
        });
    } catch (error) {
        console.error("getDietitianProfile error:", error);
        return res.status(500).json({ success: false, message: "Failed to load dietitian profile" });
    }
};

export const updateDietitianProfile = async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const dietitianId = req.account.id;

        const {
            name,
            full_name,
            specialty,
            years_experience,
            experience,
            qualification,
            avatar_url,
            avatar
        } = req.body;

        const resolvedName = (name || full_name || req.account.full_name).trim();
        const resolvedSpecialty = (specialty || "Clinical Nutrition").trim();
        const expNum = parseFloat(years_experience ?? experience) || 0;
        const qual = (qualification || "").trim();
        const avatarUrl = avatar_url || avatar || null;

        // 1. Update accounts table
        await client.query(
            "UPDATE accounts SET full_name = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
            [resolvedName, dietitianId]
        );

        // 2. Upsert dietitian_profiles table
        await client.query(
            `INSERT INTO dietitian_profiles (account_id, specialty, years_experience, qualification, avatar_url, updated_at)
             VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
             ON CONFLICT (account_id) DO UPDATE
             SET specialty = EXCLUDED.specialty,
                 years_experience = EXCLUDED.years_experience,
                 qualification = EXCLUDED.qualification,
                 avatar_url = COALESCE(EXCLUDED.avatar_url, dietitian_profiles.avatar_url),
                 updated_at = CURRENT_TIMESTAMP`,
            [dietitianId, resolvedSpecialty, expNum, qual, avatarUrl]
        );

        await client.query("COMMIT");

        return res.status(200).json({
            success: true,
            message: "Profile details updated successfully."
        });
    } catch (error) {
        await client.query("ROLLBACK");
        console.error("updateDietitianProfile error:", error);
        return res.status(500).json({ success: false, message: "Failed to update profile details" });
    } finally {
        client.release();
    }
};

export const requestVerification = async (req, res) => {
    try {
        const dietitianId = req.account.id;
        const { specialty, years_experience, qualification, avatar_url } = req.body;

        // Check if auto_approve_dietitians is enabled in system_settings
        const settingsRes = await pool.query("SELECT auto_approve_dietitians FROM system_settings WHERE id = true");
        const autoApprove = settingsRes.rows[0]?.auto_approve_dietitians || false;
        const newStatus = autoApprove ? "approved" : "pending";

        // Update profile and set status to pending (or approved if auto-approve is active)
        const updateRes = await pool.query(
            `UPDATE dietitian_profiles
             SET status = $1,
                 specialty = COALESCE($2, specialty),
                 years_experience = COALESCE($3, years_experience),
                 qualification = COALESCE($4, qualification),
                 avatar_url = COALESCE($5, avatar_url),
                 reviewed_at = ${autoApprove ? 'CURRENT_TIMESTAMP' : 'NULL'},
                 review_note = ${autoApprove ? "'Auto-approved by system configuration'" : 'NULL'},
                 updated_at = CURRENT_TIMESTAMP
             WHERE account_id = $6
             RETURNING status`,
            [
                newStatus,
                specialty ? specialty.trim() : null,
                years_experience !== undefined ? parseFloat(years_experience) : null,
                qualification ? qualification.trim() : null,
                avatar_url || null,
                dietitianId
            ]
        );

        if (updateRes.rows.length === 0) {
            // Insert if missing
            await pool.query(
                `INSERT INTO dietitian_profiles (account_id, specialty, years_experience, qualification, avatar_url, status)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                    dietitianId,
                    specialty || "Clinical Nutrition",
                    parseFloat(years_experience) || 3.0,
                    qualification || "Certified Clinical Nutritionist",
                    avatar_url || null,
                    newStatus
                ]
            );
        }

        // Log audit event
        await logAudit(pool, {
            eventType: "Dietitian Action",
            description: `Dietitian ${req.account.full_name} (${req.account.email}) submitted profile credentials for verification${autoApprove ? ' [Auto-Approved]' : ' [Pending Review]'}.`,
            status: autoApprove ? "approved" : "logged",
            actorId: dietitianId,
            actorLabel: req.account.full_name || "Dietitian Specialist",
            metadata: { dietitianId, autoApproved: autoApprove }
        });

        return res.status(200).json({
            success: true,
            status: newStatus,
            autoApproved: autoApprove,
            message: autoApprove
                ? "Your credentials have been automatically verified! Your account is now active and visible to patients."
                : "Your profile has been submitted for admin verification. An administrator will review your credentials shortly."
        });
    } catch (error) {
        console.error("requestVerification error:", error);
        return res.status(500).json({ success: false, message: "Failed to submit verification request" });
    }
};

// ==========================================
// 2. DIETITIAN DASHBOARD METRICS
// ==========================================

export const getDietitianDashboard = async (req, res) => {
    try {
        const dietitianId = req.account.id;

        const profileRes = await pool.query(
            "SELECT specialty, rating, status, review_note FROM dietitian_profiles WHERE account_id = $1",
            [dietitianId]
        );

        const profile = profileRes.rows[0] || { status: "pending", specialty: "Clinical Nutrition", rating: 5.0 };

        // If not verified/approved, dietitian has 0 assigned patients and 0 active requests
        if (profile.status !== 'approved') {
            return res.status(200).json({
                success: true,
                status: profile.status, // 'pending', 'rejected', 'suspended'
                stats: {
                    assignedPatients: 0,
                    pendingRequests: 0,
                    activeConsultations: 0,
                    rating: parseFloat(profile.rating) || 5.0,
                    specialty: profile.specialty || "Clinical Nutrition"
                },
                recentRequests: []
            });
        }

        const [
            assignedPatientsRes,
            pendingRequestsRes,
            conversationsRes,
            recentRequestsRes
        ] = await Promise.all([
            pool.query(
                `SELECT COUNT(DISTINCT patient_id)::int AS count
                 FROM guidance_requests
                 WHERE dietitian_id = $1 AND status = 'accepted'`,
                [dietitianId]
            ),
            pool.query(
                `SELECT COUNT(*)::int AS count
                 FROM guidance_requests
                 WHERE dietitian_id = $1 AND status = 'pending'`,
                [dietitianId]
            ),
            pool.query(
                `SELECT COUNT(*)::int AS count
                 FROM conversations
                 WHERE dietitian_id = $1`,
                [dietitianId]
            ),
            pool.query(
                `SELECT
                    gr.id,
                    gr.goal,
                    gr.status,
                    to_char(gr.created_at, 'Mon DD, YYYY') AS date,
                    p.full_name AS "patientName",
                    p.email AS "patientEmail",
                    up.age,
                    up.gender,
                    up.current_weight_kg AS weight,
                    up.height_cm AS height,
                    up.daily_calorie_target AS "calorieTarget"
                 FROM guidance_requests gr
                 JOIN accounts p ON p.id = gr.patient_id
                 LEFT JOIN user_profiles up ON up.account_id = p.id
                 WHERE gr.dietitian_id = $1
                 ORDER BY gr.created_at DESC
                 LIMIT 5`,
                [dietitianId]
            )
        ]);

        return res.status(200).json({
            success: true,
            status: profile.status,
            stats: {
                assignedPatients: assignedPatientsRes.rows[0].count,
                pendingRequests: pendingRequestsRes.rows[0].count,
                activeConsultations: conversationsRes.rows[0].count,
                rating: parseFloat(profile.rating) || 5.0,
                specialty: profile.specialty
            },
            recentRequests: recentRequestsRes.rows
        });
    } catch (error) {
        console.error("getDietitianDashboard error:", error);
        return res.status(500).json({ success: false, message: "Failed to load dietitian dashboard data" });
    }
};

// ==========================================
// 3. ASSIGNED PATIENTS LIST
// ==========================================

export const getAssignedPatients = async (req, res) => {
    try {
        const dietitianId = req.account.id;

        // Check if dietitian is approved
        const profileRes = await pool.query(
            "SELECT status FROM dietitian_profiles WHERE account_id = $1",
            [dietitianId]
        );
        const profileStatus = profileRes.rows[0]?.status || 'pending';

        if (profileStatus !== 'approved') {
            return res.status(200).json({
                success: true,
                verified: false,
                status: profileStatus,
                message: "Dietitian profile is not verified yet. Verification by administrator is required.",
                patients: []
            });
        }

        // Fetch patients who have ACCEPTED guidance requests with this dietitian
        const result = await pool.query(
            `SELECT DISTINCT ON (p.id)
                p.id,
                p.full_name AS name,
                p.email,
                up.age,
                INITCAP(COALESCE(up.gender, 'Unspecified')) AS gender,
                up.height_cm AS height,
                up.starting_weight_kg AS "startingWeight",
                COALESCE(up.current_weight_kg, up.starting_weight_kg) AS weight,
                up.target_weight_kg AS "targetWeight",
                COALESCE(up.primary_goal, 'General Nutrition') AS goal,
                COALESCE(up.daily_calorie_target, 2000) AS "dailyCalorieLimit",
                gr.status AS "guidanceStatus",
                gr.id AS "requestId",
                gr.goal AS "patientNote",
                conv.id AS "conversationId"
             FROM guidance_requests gr
             JOIN accounts p ON p.id = gr.patient_id
             LEFT JOIN user_profiles up ON up.account_id = p.id
             LEFT JOIN conversations conv ON conv.patient_id = p.id AND conv.dietitian_id = $1
             WHERE gr.dietitian_id = $1 AND gr.status = 'accepted'
             ORDER BY p.id, gr.created_at DESC`,
            [dietitianId]
        );

        const patients = result.rows;
        const patientIds = patients.map(p => p.id);
        
        let plansMap = {};
        let logsMap = {};

        if (patientIds.length > 0) {
            // Get active meal plans for these patients
            const plansRes = await pool.query(
                `SELECT DISTINCT ON (patient_id)
                    id, patient_id, title, target_calories, created_at
                 FROM meal_plans
                 WHERE patient_id = ANY($1::uuid[]) AND status = 'active'
                 ORDER BY patient_id, created_at DESC`,
                [patientIds]
            );
            plansRes.rows.forEach(pl => {
                plansMap[pl.patient_id] = pl;
            });

            // Get today's meal logs for these patients
            const logsRes = await pool.query(
                `SELECT id, user_id, category, meal_name, calories, is_extra, notes, logged_at
                 FROM meal_logs
                 WHERE user_id = ANY($1::uuid[]) AND logged_for = CURRENT_DATE
                 ORDER BY logged_at DESC`,
                [patientIds]
            );
            logsRes.rows.forEach(log => {
                if (!logsMap[log.user_id]) logsMap[log.user_id] = [];
                logsMap[log.user_id].push(log);
            });
        }

        // Calculate BMI and Diet Adherence for each patient
        const formatted = patients.map(p => {
            let bmi = "N/A";
            if (p.height && p.weight) {
                const heightM = p.height / 100;
                bmi = (p.weight / (heightM * heightM)).toFixed(1);
            }

            const activePlan = plansMap[p.id] || null;
            const targetCalories = activePlan?.target_calories || p.dailyCalorieLimit || 2000;
            const todayLogs = logsMap[p.id] || [];

            let regularCalories = 0;
            let extraCalories = 0;
            const extraLogs = [];

            for (const log of todayLogs) {
                const cal = parseInt(log.calories, 10) || 0;
                if (log.is_extra) {
                    extraCalories += cal;
                    extraLogs.push(log);
                } else {
                    regularCalories += cal;
                }
            }
            const totalCalories = regularCalories + extraCalories;

            let adherenceStatus = 'maintained';
            let adherenceBadge = 'Maintaining Diet';
            let adherenceType = 'success';

            if (todayLogs.length === 0) {
                adherenceStatus = 'no_logs';
                adherenceBadge = 'No Logs Today';
                adherenceType = 'muted';
            } else if (extraLogs.length > 0 || extraCalories > 0) {
                adherenceStatus = 'extra_reported';
                adherenceBadge = `Extra Food Reported (+${extraCalories} kcal)`;
                adherenceType = 'warning';
            } else if (totalCalories > targetCalories + 50) {
                adherenceStatus = 'exceeded';
                adherenceBadge = `Exceeded (${totalCalories - targetCalories} kcal over)`;
                adherenceType = 'danger';
            } else {
                adherenceStatus = 'maintained';
                adherenceBadge = 'On Track (Maintained)';
                adherenceType = 'success';
            }

            return {
                ...p,
                bmi,
                activePlanTitle: activePlan ? activePlan.title : "No Active Plan",
                activePlanId: activePlan ? activePlan.id : null,
                targetCalories,
                todayTotalCalories: totalCalories,
                todayRegularCalories: regularCalories,
                todayExtraCalories: extraCalories,
                todayLogsCount: todayLogs.length,
                extraLogsCount: extraLogs.length,
                extraLogs,
                todayLogs,
                adherenceStatus,
                adherenceBadge,
                adherenceType
            };
        });

        return res.status(200).json({
            success: true,
            verified: true,
            status: 'approved',
            patients: formatted
        });
    } catch (error) {
        console.error("getAssignedPatients error:", error);
        return res.status(500).json({ success: false, message: "Failed to load patient records" });
    }
};

export const getPatientAdherenceDetails = async (req, res) => {
    try {
        const dietitianId = req.account.id;
        const { patientId } = req.params;

        // Verify patient is assigned to this dietitian
        const requestCheck = await pool.query(
            `SELECT id FROM guidance_requests WHERE dietitian_id = $1 AND patient_id = $2 AND status = 'accepted'`,
            [dietitianId, patientId]
        );
        if (requestCheck.rows.length === 0) {
            return res.status(403).json({ success: false, message: "Patient is not assigned to your account" });
        }

        // Fetch patient info
        const patientRes = await pool.query(
            `SELECT p.id, p.full_name, p.email, up.age, up.gender, up.height_cm, up.current_weight_kg, up.primary_goal, up.daily_calorie_target
             FROM accounts p
             LEFT JOIN user_profiles up ON up.account_id = p.id
             WHERE p.id = $1`,
            [patientId]
        );
        const patient = patientRes.rows[0];

        // Fetch active meal plan
        const planRes = await pool.query(
            `SELECT mp.id, mp.title, mp.target_calories, mp.start_date, mp.end_date, mp.status,
                    COALESCE(json_agg(
                        json_build_object(
                            'id', mpi.id,
                            'category', mpi.category,
                            'recommendation', mpi.recommendation,
                            'sort_order', mpi.sort_order
                        ) ORDER BY mpi.sort_order
                    ) FILTER (WHERE mpi.id IS NOT NULL), '[]') AS items
             FROM meal_plans mp
             LEFT JOIN meal_plan_items mpi ON mpi.meal_plan_id = mp.id
             WHERE mp.patient_id = $1 AND mp.status = 'active'
             GROUP BY mp.id
             ORDER BY mp.created_at DESC
             LIMIT 1`,
            [patientId]
        );
        const activePlan = planRes.rows[0] || null;

        // Fetch today's meal logs
        const todayLogsRes = await pool.query(
            `SELECT id, category, meal_name, calories, is_extra, notes, logged_at
             FROM meal_logs
             WHERE user_id = $1 AND logged_for = CURRENT_DATE
             ORDER BY logged_at DESC`,
            [patientId]
        );
        const todayLogs = todayLogsRes.rows;

        // Fetch past 7 days meal logs
        const recentLogsRes = await pool.query(
            `SELECT id, logged_for, category, meal_name, calories, is_extra, notes, logged_at
             FROM meal_logs
             WHERE user_id = $1 AND logged_for >= CURRENT_DATE - INTERVAL '7 days'
             ORDER BY logged_for DESC, logged_at DESC`,
            [patientId]
        );

        return res.status(200).json({
            success: true,
            patient,
            activePlan,
            todayLogs,
            recentLogs: recentLogsRes.rows
        });
    } catch (error) {
        console.error("getPatientAdherenceDetails error:", error);
        return res.status(500).json({ success: false, message: "Failed to load patient adherence details" });
    }
};

// ==========================================
// 4. GUIDANCE REQUESTS MANAGEMENT
// ==========================================

export const getGuidanceRequests = async (req, res) => {
    try {
        const dietitianId = req.account.id;

        // Check if dietitian is approved
        const profileRes = await pool.query(
            "SELECT status FROM dietitian_profiles WHERE account_id = $1",
            [dietitianId]
        );
        const profileStatus = profileRes.rows[0]?.status || 'pending';

        if (profileStatus !== 'approved') {
            return res.status(200).json({
                success: true,
                verified: false,
                status: profileStatus,
                requests: []
            });
        }

        const result = await pool.query(
            `SELECT
                gr.id,
                gr.patient_id AS "userId",
                p.full_name AS "userName",
                p.email AS "userEmail",
                gr.goal,
                INITCAP(gr.status::text) AS status,
                gr.created_at AS "createdAt",
                to_char(gr.created_at, 'YYYY-MM-DD') AS "formattedDate"
             FROM guidance_requests gr
             JOIN accounts p ON p.id = gr.patient_id
             WHERE gr.dietitian_id = $1
             ORDER BY CASE WHEN gr.status = 'pending' THEN 0 ELSE 1 END, gr.created_at DESC`,
            [dietitianId]
        );

        return res.status(200).json({
            success: true,
            verified: true,
            status: 'approved',
            requests: result.rows
        });
    } catch (error) {
        console.error("getGuidanceRequests error:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch guidance requests" });
    }
};

export const updateGuidanceRequestStatus = async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const { id } = req.params;
        const dietitianId = req.account.id;
        const { status } = req.body; // 'accepted' or 'rejected'

        const normalizedStatus = (status || "").toLowerCase().trim();
        if (!["accepted", "rejected"].includes(normalizedStatus)) {
            await client.query("ROLLBACK");
            return res.status(400).json({ success: false, message: "Status must be 'accepted' or 'rejected'" });
        }

        // Update the guidance request
        const updateRes = await client.query(
            `UPDATE guidance_requests
             SET status = $1::guidance_request_status, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2 AND dietitian_id = $3
             RETURNING patient_id`,
            [normalizedStatus, id, dietitianId]
        );

        if (updateRes.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ success: false, message: "Guidance request not found" });
        }

        const patientId = updateRes.rows[0].patient_id;

        // If accepted, ensure conversation exists between patient and dietitian
        let conversationId = null;
        if (normalizedStatus === "accepted") {
            const convRes = await client.query(
                `INSERT INTO conversations (patient_id, dietitian_id)
                 VALUES ($1, $2)
                 ON CONFLICT (patient_id, dietitian_id) DO UPDATE
                 SET created_at = conversations.created_at
                 RETURNING id`,
                [patientId, dietitianId]
            );
            conversationId = convRes.rows[0]?.id;

            // Optional welcome message
            await client.query(
                `INSERT INTO messages (conversation_id, sender_id, message_text)
                 VALUES ($1, $2, $3)`,
                [
                    conversationId,
                    dietitianId,
                    `Hello! I have reviewed and accepted your nutrition guidance request. Feel free to ask any dietary questions here!`
                ]
            );
        }

        await client.query("COMMIT");

        return res.status(200).json({
            success: true,
            status: normalizedStatus === "accepted" ? "Accepted" : "Rejected",
            conversationId,
            message: `Guidance request ${normalizedStatus} successfully!`
        });
    } catch (error) {
        await client.query("ROLLBACK");
        console.error("updateGuidanceRequestStatus error:", error);
        return res.status(500).json({ success: false, message: "Failed to update guidance request" });
    } finally {
        client.release();
    }
};

// ==========================================
// 5. CREATE & MANAGE CUSTOM MEAL PLANS
// ==========================================

export const getFoodItems = async (req, res) => {
    try {
        const { category, search } = req.query;
        let query = `
            SELECT
                id,
                name,
                category,
                calories,
                protein_g AS protein,
                carbohydrates_g AS carbs,
                fat_g AS fat,
                portion_description AS portion
            FROM food_items
            WHERE 1=1
        `;
        const params = [];

        if (category && ['breakfast', 'lunch', 'dinner', 'snacks'].includes(category.toLowerCase())) {
            params.push(category.toLowerCase());
            query += ` AND category = $${params.length}`;
        }

        if (search && search.trim()) {
            params.push(`%${search.trim().toLowerCase()}%`);
            query += ` AND lower(name) LIKE $${params.length}`;
        }

        query += " ORDER BY category ASC, name ASC";

        const result = await pool.query(query, params);

        return res.status(200).json({
            success: true,
            foods: result.rows
        });
    } catch (error) {
        console.error("getFoodItems error:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch food items catalog" });
    }
};

export const getPlanTitlesAndTemplates = async (req, res) => {
    try {
        const [dbTitlesRes, goalsRes] = await Promise.all([
            pool.query("SELECT DISTINCT title FROM meal_plans WHERE title IS NOT NULL AND TRIM(title) != '' ORDER BY title ASC"),
            pool.query("SELECT DISTINCT primary_goal FROM user_profiles WHERE primary_goal IS NOT NULL AND TRIM(primary_goal) != '' ORDER BY primary_goal ASC")
        ]);

        const clinicalTemplates = [
            { title: "Weight Loss & Calorie Deficit Plan", defaultCalories: 1600 },
            { title: "High-Protein Muscle Building Plan", defaultCalories: 2400 },
            { title: "Cardiovascular & Heart-Healthy Plan", defaultCalories: 1900 },
            { title: "Diabetic Friendly & Low-Glycemic Plan", defaultCalories: 1700 },
            { title: "Clean Eating Balanced Maintenance Plan", defaultCalories: 2000 },
            { title: "Keto & Low-Carbohydrate Metabolic Plan", defaultCalories: 1800 },
            { title: "Hypertension DASH Nutritional Protocol", defaultCalories: 1850 }
        ];

        const titlesFromDb = dbTitlesRes.rows.map(r => r.title);
        const goalTitles = goalsRes.rows.map(r => `${r.primary_goal} Targeted Plan`);

        const allUniqueTitles = Array.from(new Set([
            ...clinicalTemplates.map(t => t.title),
            ...titlesFromDb,
            ...goalTitles
        ]));

        return res.status(200).json({
            success: true,
            titles: allUniqueTitles,
            templates: clinicalTemplates
        });
    } catch (error) {
        console.error("getPlanTitlesAndTemplates error:", error);
        return res.status(500).json({ success: false, message: "Failed to load plan titles" });
    }
};

export const createDietitianMealPlan = async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const dietitianId = req.account.id;

        const {
            patient_id,
            patient_name,
            title,
            target_calories,
            start_date,
            end_date,
            breakfast,
            lunch,
            dinner,
            items
        } = req.body;

        if (!title || !title.trim()) {
            await client.query("ROLLBACK");
            return res.status(400).json({ success: false, message: "Plan title is required" });
        }

        // Check if dietitian is approved
        const profileCheck = await client.query(
            "SELECT status FROM dietitian_profiles WHERE account_id = $1",
            [dietitianId]
        );
        if (profileCheck.rows[0]?.status !== 'approved') {
            await client.query("ROLLBACK");
            return res.status(403).json({
                success: false,
                message: "You must be a verified and approved dietitian to create and assign meal plans."
            });
        }

        let resolvedPatientId = patient_id;

        // If patient_id wasn't passed directly, find by name among assigned patients
        if (!resolvedPatientId && patient_name) {
            const userFind = await client.query(
                `SELECT a.id FROM accounts a
                 JOIN guidance_requests gr ON gr.patient_id = a.id
                 WHERE a.full_name ILIKE $1 AND a.role = 'user' AND gr.dietitian_id = $2 AND gr.status = 'accepted'
                 LIMIT 1`,
                [patient_name.trim(), dietitianId]
            );
            if (userFind.rows.length > 0) {
                resolvedPatientId = userFind.rows[0].id;
            }
        }

        if (!resolvedPatientId) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                success: false,
                message: "Please select an assigned patient to create a meal plan for."
            });
        }

        const caloriesVal = parseInt(target_calories) || 2000;

        // Insert into meal_plans
        const planRes = await client.query(
            `INSERT INTO meal_plans (patient_id, dietitian_id, title, target_calories, status, start_date, end_date)
             VALUES ($1, $2, $3, $4, 'active', COALESCE($5, CURRENT_DATE), $6)
             RETURNING id, title, target_calories, status, created_at`,
            [resolvedPatientId, dietitianId, title.trim(), caloriesVal, start_date || null, end_date || null]
        );

        const newPlanId = planRes.rows[0].id;

        // Build item array with sequential sort_order per category
        const planItems = [];
        if (Array.isArray(items) && items.length > 0) {
            const orderCounters = { breakfast: 0, lunch: 0, dinner: 0, snacks: 0 };
            for (const item of items) {
                const cat = (item.category || "breakfast").toLowerCase();
                const validCat = ["breakfast", "lunch", "dinner", "snacks"].includes(cat) ? cat : "breakfast";
                const rec = item.recommendation || item.text || item.name || "Nutritious balanced meal";
                const order = item.sort_order !== undefined && typeof item.sort_order === 'number'
                    ? item.sort_order
                    : (orderCounters[validCat]++);
                planItems.push({ category: validCat, recommendation: rec, sort_order: order });
            }
        } else {
            if (breakfast) planItems.push({ category: "breakfast", recommendation: breakfast, sort_order: 0 });
            if (lunch) planItems.push({ category: "lunch", recommendation: lunch, sort_order: 0 });
            if (dinner) planItems.push({ category: "dinner", recommendation: dinner, sort_order: 0 });
        }

        for (const item of planItems) {
            await client.query(
                `INSERT INTO meal_plan_items (meal_plan_id, category, recommendation, sort_order)
                 VALUES ($1, $2::meal_category, $3, $4)
                 ON CONFLICT (meal_plan_id, category, sort_order) DO UPDATE
                 SET recommendation = EXCLUDED.recommendation`,
                [newPlanId, item.category, item.recommendation, item.sort_order]
            );
        }

        await client.query("COMMIT");

        return res.status(201).json({
            success: true,
            message: `Meal plan "${title.trim()}" created and assigned to patient successfully!`,
            plan: planRes.rows[0],
            itemsCount: planItems.length
        });
    } catch (error) {
        await client.query("ROLLBACK");
        console.error("createDietitianMealPlan error:", error);
        return res.status(500).json({ success: false, message: "Failed to publish meal plan" });
    } finally {
        client.release();
    }
};

// ==========================================
// 6. UPLOAD RECIPES & GUIDES
// ==========================================

export const createDietitianRecipe = async (req, res) => {
    try {
        const dietitianId = req.account.id;
        const {
            title,
            category,
            calories,
            prepTime,
            prep_time_minutes,
            image,
            image_url,
            instructions,
            serving_size
        } = req.body;

        if (!title) {
            return res.status(400).json({ success: false, message: "Recipe title is required" });
        }

        const cat = (category || "lunch").toLowerCase().trim();
        const validCats = ["breakfast", "lunch", "dinner", "snacks"];
        const resolvedCategory = validCats.includes(cat) ? cat : "lunch";

        const calVal = parseInt(calories) || 350;
        const prepNum = parseInt(prep_time_minutes || prepTime) || 20;
        const img = image_url || image || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=300";

        const result = await pool.query(
            `INSERT INTO recipes
                (title, category, calories, prep_time_minutes, author_id, image_url, instructions, serving_size, is_published)
             VALUES ($1, $2::meal_category, $3, $4, $5, $6, $7, $8, true)
             RETURNING id, title, category, calories, prep_time_minutes, image_url, created_at`,
            [
                title.trim(),
                resolvedCategory,
                calVal,
                prepNum,
                dietitianId,
                img,
                instructions || "Prepare fresh ingredients and serve balanced.",
                serving_size || "1 serving"
            ]
        );

        return res.status(201).json({
            success: true,
            message: `Recipe "${title}" published successfully!`,
            recipe: result.rows[0]
        });
    } catch (error) {
        console.error("createDietitianRecipe error:", error);
        return res.status(500).json({ success: false, message: "Failed to publish recipe" });
    }
};
