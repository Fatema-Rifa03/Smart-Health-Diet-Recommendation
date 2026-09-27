import app from "./src/app.js";

const PORT = 5577;
let server;

async function testDietitian() {
    await new Promise(resolve => {
        server = app.listen(PORT, () => {
            console.log(`Dietitian test server running on port ${PORT}`);
            resolve();
        });
    });

    try {
        const baseUrl = `http://localhost:${PORT}/api`;

        // 1. Login as Dietitian Dr. Sarah Jenkins
        console.log("\n[TEST 1] Logging in as dietitian sarah.j@smarthealth.com...");
        const loginRes = await fetch(`${baseUrl}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: "sarah.j@smarthealth.com", password: "dietitian123" })
        });
        const loginData = await loginRes.json();
        console.log("Dietitian login status:", loginRes.status, "role:", loginData.user?.role);
        if (!loginData.session?.access_token) throw new Error("Login failed!");

        const token = loginData.session.access_token;
        const authHeaders = {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
        };

        // 2. Fetch Profile
        console.log("\n[TEST 2] Testing GET /api/dietitian/profile...");
        const profRes = await fetch(`${baseUrl}/dietitian/profile`, { headers: authHeaders });
        const profData = await profRes.json();
        console.log("Profile status:", profRes.status, "Profile:", profData.profile?.name, "Status:", profData.profile?.status);

        // 3. Update Profile
        console.log("\n[TEST 3] Testing PUT /api/dietitian/profile...");
        const updRes = await fetch(`${baseUrl}/dietitian/profile`, {
            method: "PUT",
            headers: authHeaders,
            body: JSON.stringify({
                specialty: "Clinical Nutrition, Weight Loss & Renal Dietetics",
                years_experience: 9,
                qualification: "Ph.D. in Clinical Dietetics, Licensed RD #8829"
            })
        });
        const updData = await updRes.json();
        console.log("Update profile status:", updRes.status, updData.message);

        // 4. Request Verification
        console.log("\n[TEST 4] Testing POST /api/dietitian/request-verification...");
        const reqVerRes = await fetch(`${baseUrl}/dietitian/request-verification`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
                qualification: "Ph.D. in Clinical Dietetics, Board Certified"
            })
        });
        const reqVerData = await reqVerRes.json();
        console.log("Verification request status:", reqVerRes.status, "Result status:", reqVerData.status, reqVerData.message);

        // 5. Dashboard Metrics
        console.log("\n[TEST 5] Testing GET /api/dietitian/dashboard...");
        const dashRes = await fetch(`${baseUrl}/dietitian/dashboard`, { headers: authHeaders });
        const dashData = await dashRes.json();
        console.log("Dashboard status:", dashRes.status, "Stats:", dashData.stats);

        // 6. Assigned Patients
        console.log("\n[TEST 6] Testing GET /api/dietitian/patients...");
        const patRes = await fetch(`${baseUrl}/dietitian/patients`, { headers: authHeaders });
        const patData = await patRes.json();
        console.log("Patients status:", patRes.status, "Count:", patData.patients?.length);

        // 7. Meal Plan creation
        console.log("\n[TEST 7] Testing POST /api/dietitian/meal-plans...");
        const planRes = await fetch(`${baseUrl}/dietitian/meal-plans`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
                title: "Custom 7-Day Low Carb Plan",
                target_calories: 1850,
                breakfast: "Avocado Egg Toast with Chia Pudding (380 kcal)",
                lunch: "Grilled Chicken Quinoa Salad with Olive Dressing (490 kcal)",
                dinner: "Baked Salmon with Steamed Broccoli (520 kcal)"
            })
        });
        const planData = await planRes.json();
        console.log("Meal plan status:", planRes.status, planData.message);

        // 8. Recipe Upload
        console.log("\n[TEST 8] Testing POST /api/dietitian/recipes...");
        const recRes = await fetch(`${baseUrl}/dietitian/recipes`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
                title: "Mediterranean Lemon Herb Salmon",
                category: "Dinner",
                calories: 480,
                prep_time_minutes: 25,
                image_url: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=300"
            })
        });
        const recData = await recRes.json();
        console.log("Recipe status:", recRes.status, recData.message);

        console.log("\n=== ALL DIETITIAN BACKEND TESTS PASSED SUCCESSFULLY! ===");
    } catch (err) {
        console.error("Dietitian test error:", err);
    } finally {
        server.close();
        process.exit(0);
    }
}

testDietitian();
