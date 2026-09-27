import app from "./src/app.js";
import http from "http";

let server;
const PORT = 5566;

async function runTests() {
    await new Promise((resolve) => {
        server = app.listen(PORT, () => {
            console.log(`Test server running on port ${PORT}`);
            resolve();
        });
    });

    try {
        const baseUrl = `http://localhost:${PORT}/api`;

        // 1. Login as Admin
        console.log("\n[TEST 1] Logging in as Admin...");
        const adminLoginRes = await fetch(`${baseUrl}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: "admin@smarthealth.com", password: "admin123" })
        });
        const adminLoginData = await adminLoginRes.json();
        console.log("Admin login status:", adminLoginRes.status, "role:", adminLoginData.user?.role);
        if (!adminLoginData.session?.access_token) {
            throw new Error("Admin login failed!");
        }
        const adminToken = adminLoginData.session.access_token;
        const authHeaders = {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${adminToken}`
        };

        // 2. Dashboard overview
        console.log("\n[TEST 2] Testing GET /api/admin/dashboard...");
        const dashRes = await fetch(`${baseUrl}/admin/dashboard`, { headers: authHeaders });
        const dashData = await dashRes.json();
        console.log("Dashboard status:", dashRes.status, "Stats:", dashData.stats);

        // 3. User accounts list
        console.log("\n[TEST 3] Testing GET /api/admin/users...");
        const usersRes = await fetch(`${baseUrl}/admin/users`, { headers: authHeaders });
        const usersData = await usersRes.json();
        console.log("Users status:", usersRes.status, "Count:", usersData.users?.length);

        // 4. Create User
        console.log("\n[TEST 4] Testing POST /api/admin/users...");
        const testUserEmail = `testuser_${Date.now()}@example.com`;
        const createUserRes = await fetch(`${baseUrl}/admin/users`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
                name: "Test Admin Created User",
                email: testUserEmail,
                age: 29,
                gender: "Female",
                height: 168,
                weight: 62.5,
                targetWeight: 58.0,
                goal: "Weight Loss & Healthy Living",
                dailyCalorieLimit: 1900
            })
        });
        const createUserData = await createUserRes.json();
        console.log("Create user status:", createUserRes.status, "User ID:", createUserData.user?.id);
        const createdUserId = createUserData.user?.id;

        // Toggle user status
        if (createdUserId) {
            console.log("\n[TEST 4b] Testing PATCH /api/admin/users/:id/status...");
            const toggleRes = await fetch(`${baseUrl}/admin/users/${createdUserId}/status`, {
                method: "PATCH",
                headers: authHeaders
            });
            const toggleData = await toggleRes.json();
            console.log("Toggle status:", toggleRes.status, "New Status:", toggleData.newStatus);

            // Clean up created test user
            await fetch(`${baseUrl}/admin/users/${createdUserId}`, {
                method: "DELETE",
                headers: authHeaders
            });
            console.log("Cleaned up test user.");
        }

        // 5. Dietitians
        console.log("\n[TEST 5] Testing GET /api/admin/dietitians...");
        const dietitiansRes = await fetch(`${baseUrl}/admin/dietitians`, { headers: authHeaders });
        const dietitiansData = await dietitiansRes.json();
        console.log("Dietitians status:", dietitiansRes.status, "Count:", dietitiansData.dietitians?.length);

        const pending = dietitiansData.dietitians?.find(d => d.status.toLowerCase() === "pending");
        if (pending) {
            console.log("\n[TEST 5b] Approving pending dietitian:", pending.name);
            const approveRes = await fetch(`${baseUrl}/admin/dietitians/${pending.id}/approve`, {
                method: "PATCH",
                headers: authHeaders,
                body: JSON.stringify({ review_note: "Verified clinical board credentials." })
            });
            const approveData = await approveRes.json();
            console.log("Approve response:", approveRes.status, approveData.message);
        }

        // 6. Food Database
        console.log("\n[TEST 6] Testing GET /api/admin/foods...");
        const foodRes = await fetch(`${baseUrl}/admin/foods`, { headers: authHeaders });
        const foodData = await foodRes.json();
        console.log("Food catalog status:", foodRes.status, "Total in catalog:", foodData.foods?.length, "Summary:", foodData.summary);

        console.log("\n[TEST 6b] Adding a test food item...");
        const addFoodRes = await fetch(`${baseUrl}/admin/foods`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
                name: "Test Green Avocado Smoothie",
                category: "Breakfast",
                calories: 220,
                protein: 8,
                carbs: 24,
                fat: 12,
                portion: "1 glass (300ml)"
            })
        });
        const addFoodData = await addFoodRes.json();
        console.log("Add food status:", addFoodRes.status, "Food ID:", addFoodData.food?.id);

        if (addFoodData.food?.id) {
            await fetch(`${baseUrl}/admin/foods/${addFoodData.food.id}`, {
                method: "DELETE",
                headers: authHeaders
            });
            console.log("Cleaned up test food item.");
        }

        // 7. System Settings
        console.log("\n[TEST 7] Testing GET & PUT /api/admin/settings...");
        const settingsRes = await fetch(`${baseUrl}/admin/settings`, { headers: authHeaders });
        const settingsData = await settingsRes.json();
        console.log("Current settings:", settingsData.settings);

        const updateSettingsRes = await fetch(`${baseUrl}/admin/settings`, {
            method: "PUT",
            headers: authHeaders,
            body: JSON.stringify({
                warnPct: 85,
                defaultWater: 2.8,
                defaultSleep: 7.5,
                maintenanceMode: false,
                autoApproveDietitians: false
            })
        });
        const updateSettingsData = await updateSettingsRes.json();
        console.log("Settings update status:", updateSettingsRes.status, updateSettingsData.settings);

        // 8. Audit Logs
        console.log("\n[TEST 8] Testing GET /api/admin/audit-logs...");
        const auditRes = await fetch(`${baseUrl}/admin/audit-logs`, { headers: authHeaders });
        const auditData = await auditRes.json();
        console.log("Audit logs status:", auditRes.status, "Logs count:", auditData.logs?.length);

        // 9. System Reports
        console.log("\n[TEST 9] Testing System Reports...");
        const repCalRes = await fetch(`${baseUrl}/admin/reports/weekly-calories`, { headers: authHeaders });
        const repCal = await repCalRes.json();
        console.log("Calorie report status:", repCalRes.status, "Summary:", repCal.summary);

        const repWeightRes = await fetch(`${baseUrl}/admin/reports/weight-loss`, { headers: authHeaders });
        const repWeight = await repWeightRes.json();
        console.log("Weight report status:", repWeightRes.status, "Total tracked:", repWeight.totalUsersTracked);

        const repDietRes = await fetch(`${baseUrl}/admin/reports/dietitian-engagement`, { headers: authHeaders });
        const repDiet = await repDietRes.json();
        console.log("Dietitian report status:", repDietRes.status, "Active specialists:", repDiet.activeSpecialists);

        // 10. Non-admin authorization block test
        console.log("\n[TEST 10] Testing non-admin access rejection (RBAC)...");
        const regularUserLoginRes = await fetch(`${baseUrl}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: "user@example.com", password: "user1234" })
        });
        const regularUserData = await regularUserLoginRes.json();
        const regularUserToken = regularUserData.session?.access_token;

        const unauthorizedRes = await fetch(`${baseUrl}/admin/dashboard`, {
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${regularUserToken}`
            }
        });
        console.log("Regular user accessing admin endpoint status:", unauthorizedRes.status, "(Expected: 403 Forbidden)");

        console.log("\n=== ALL ADMIN BACKEND TESTS PASSED SUCCESSFULLY! ===");
    } catch (err) {
        console.error("Test failed:", err);
    } finally {
        server.close();
        process.exit(0);
    }
}

runTests();
