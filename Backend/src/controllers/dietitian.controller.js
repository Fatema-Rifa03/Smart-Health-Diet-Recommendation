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

        // Calculate BMI for each patient
        const formatted = patients.map(p => {
            let bmi = "N/A";
            if (p.height && p.weight) {
                const heightM = p.height / 100;
                bmi = (p.weight / (heightM * heightM)).toFixed(1);
            }
            return {
                ...p,
                bmi
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
// 5. CREATE CUSTOM MEAL PLANS
// ==========================================

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

        if (!title) {
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
            [resolvedPatientId, dietitianId, title, caloriesVal, start_date || null, end_date || null]
        );

        const newPlanId = planRes.rows[0].id;

        // Build item array
        const planItems = items || [];
        if (breakfast) planItems.push({ category: "breakfast", recommendation: breakfast, sort_order: 1 });
        if (lunch) planItems.push({ category: "lunch", recommendation: lunch, sort_order: 2 });
        if (dinner) planItems.push({ category: "dinner", recommendation: dinner, sort_order: 3 });

        for (const item of planItems) {
            const cat = (item.category || "breakfast").toLowerCase();
            const rec = item.recommendation || item.text || "Nutritious balanced meal";
            const order = item.sort_order || 0;

            await client.query(
                `INSERT INTO meal_plan_items (meal_plan_id, category, recommendation, sort_order)
                 VALUES ($1, $2::meal_category, $3, $4)
                 ON CONFLICT (meal_plan_id, category, sort_order) DO UPDATE
                 SET recommendation = EXCLUDED.recommendation`,
                [newPlanId, cat, rec, order]
            );
        }

        await client.query("COMMIT");

        return res.status(201).json({
            success: true,
            message: `Meal plan "${title}" created and assigned to patient successfully!`,
            plan: planRes.rows[0]
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
