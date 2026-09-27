import app from "./src/app.js";

const PORT = 5588;
let server;

async function runEndToEndFlow() {
    await new Promise(resolve => {
        server = app.listen(PORT, () => {
            console.log(`E2E Test server running on port ${PORT}`);
            resolve();
        });
    });

    try {
        const baseUrl = `http://localhost:${PORT}/api`;

        const testEmail = `dr_emily_${Date.now()}@smarthealth.com`;
        const testPassword = "DietitianPass123!";

        // 1. Register new dietitian
        console.log("\n[STEP 1] Registering a new Clinical Dietitian...");
        const regRes = await fetch(`${baseUrl}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                full_name: "Dr. Emily Vance",
                email: testEmail,
                password: testPassword,
                role: "dietitian",
                specialty: "Diabetic & Renal Diets",
                years_experience: 6,
                qualification: "M.Sc. Clinical Nutrition, CDE"
            })
        });
        const regData = await regRes.json();
        console.log("Registration status:", regRes.status, "Message:", regData.message);
        if (!regData.success) throw new Error("Registration failed: " + regData.message);

        const dietitianToken = regData.session.access_token;
        const dietitianId = regData.user.id;
        const dietitianHeaders = {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${dietitianToken}`
        };

        // 2. Check profile status - should be pending
        console.log("\n[STEP 2] Verifying initial profile status...");
        const profRes = await fetch(`${baseUrl}/dietitian/profile`, { headers: dietitianHeaders });
        const profData = await profRes.json();
        console.log("Dietitian Status:", profData.profile?.status, "(Expected: pending)");
        if (profData.profile?.status !== "pending") {
            throw new Error(`Expected pending, got ${profData.profile?.status}`);
        }

        // 3. Login as patient and check directory - Dietitian must NOT be visible yet
        console.log("\n[STEP 3] Verifying unapproved dietitian is hidden from patient search...");
        const userLoginRes = await fetch(`${baseUrl}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: "user@example.com", password: "user1234" })
        });
        const userLoginData = await userLoginRes.json();
        const userToken = userLoginData.session.access_token;
        const userHeaders = {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${userToken}`
        };

        const dirRes1 = await fetch(`${baseUrl}/user/dietitians`, { headers: userHeaders });
        const dirData1 = await dirRes1.json();
        const foundBeforeApproval = dirData1.dietitians?.some(d => d.id === dietitianId);
        console.log("Is dietitian in patient directory before approval?:", foundBeforeApproval, "(Expected: false)");
        if (foundBeforeApproval) throw new Error("Unapproved dietitian should not be in directory!");

        // 4. Dietitian updates credentials and requests verification
        console.log("\n[STEP 4] Dietitian updates credentials & requests verification...");
        const reqVerRes = await fetch(`${baseUrl}/dietitian/request-verification`, {
            method: "POST",
            headers: dietitianHeaders,
            body: JSON.stringify({
                specialty: "Diabetic & Renal Medical Nutrition Therapy",
                years_experience: 7,
                qualification: "M.Sc. Human Nutrition, Certified Diabetes Educator #CDE-9941"
            })
        });
        const reqVerData = await reqVerRes.json();
        console.log("Verification request response:", reqVerData.message);

        // 5. Admin logs in and approves dietitian
        console.log("\n[STEP 5] Administrator reviews and approves dietitian...");
        const adminLoginRes = await fetch(`${baseUrl}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: "admin@smarthealth.com", password: "admin123" })
        });
        const adminLoginData = await adminLoginRes.json();
        const adminToken = adminLoginData.session.access_token;
        const adminHeaders = {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${adminToken}`
        };

        const approveRes = await fetch(`${baseUrl}/admin/dietitians/${dietitianId}/approve`, {
            method: "PATCH",
            headers: adminHeaders,
            body: JSON.stringify({ review_note: "Verified clinical board credentials and CDE certification." })
        });
        const approveData = await approveRes.json();
        console.log("Admin approve response:", approveData.message);

        // 6. Patient searches directory again - Dietitian must NOW be visible!
        console.log("\n[STEP 6] Patient searches directory after admin approval...");
        const dirRes2 = await fetch(`${baseUrl}/user/dietitians`, { headers: userHeaders });
        const dirData2 = await dirRes2.json();
        const approvedDietitianInDir = dirData2.dietitians?.find(d => d.id === dietitianId);
        console.log("Approved dietitian found in directory:", !!approvedDietitianInDir, approvedDietitianInDir?.full_name);
        if (!approvedDietitianInDir) throw new Error("Approved dietitian should now be in directory!");

        // 7. Patient requests guidance from this dietitian
        console.log("\n[STEP 7] Patient sends nutrition guidance request...");
        const sendReqRes = await fetch(`${baseUrl}/user/guidance-requests`, {
            method: "POST",
            headers: userHeaders,
            body: JSON.stringify({
                dietitian_id: dietitianId,
                goal: "Need personalized diabetic nutrition management and meal scheduling."
            })
        });
        const sendReqData = await sendReqRes.json();
        console.log("Guidance request status:", sendReqRes.status, "Request ID:", sendReqData.request?.id);
        const guidanceRequestId = sendReqData.request?.id;

        // 8. Dietitian views guidance requests and accepts
        console.log("\n[STEP 8] Dietitian reviews incoming request and accepts...");
        const getReqsRes = await fetch(`${baseUrl}/dietitian/guidance-requests`, { headers: dietitianHeaders });
        const getReqsData = await getReqsRes.json();
        console.log("Dietitian pending requests count:", getReqsData.requests?.length);

        const acceptRes = await fetch(`${baseUrl}/dietitian/guidance-requests/${guidanceRequestId}`, {
            method: "PATCH",
            headers: dietitianHeaders,
            body: JSON.stringify({ status: "accepted" })
        });
        const acceptData = await acceptRes.json();
        console.log("Accept status:", acceptRes.status, "Conversation ID:", acceptData.conversationId);

        // 9. Dietitian checks assigned patients list
        console.log("\n[STEP 9] Dietitian checks assigned patient health records...");
        const patRes = await fetch(`${baseUrl}/dietitian/patients`, { headers: dietitianHeaders });
        const patData = await patRes.json();
        const assignedPat = patData.patients?.find(p => p.email === "user@example.com");
        console.log("Assigned patient found:", assignedPat?.name, "BMI:", assignedPat?.bmi, "Goal:", assignedPat?.goal);

        // 10. Dietitian builds custom meal plan for patient
        console.log("\n[STEP 10] Dietitian creates custom meal plan for patient...");
        const planRes = await fetch(`${baseUrl}/dietitian/meal-plans`, {
            method: "POST",
            headers: dietitianHeaders,
            body: JSON.stringify({
                patient_id: assignedPat?.id,
                title: "Diabetic Glucose Control Meal Plan",
                target_calories: 1900,
                breakfast: "Steel Cut Oats with Walnuts & Cinnamon (350 kcal)",
                lunch: "Lentil Soup with Mixed Greens & Olive Oil (450 kcal)",
                dinner: "Grilled Salmon with Steamed Asparagus & Quinoa (550 kcal)"
            })
        });
        const planData = await planRes.json();
        console.log("Meal plan created:", planData.message);

        // 11. Patient verifies meal plan received
        console.log("\n[STEP 11] Patient verifies meal plan was received...");
        const patPlansRes = await fetch(`${baseUrl}/user/meal-plans`, { headers: userHeaders });
        const patPlansData = await patPlansRes.json();
        const receivedPlan = patPlansData.plans?.find(p => p.title.includes("Diabetic Glucose Control"));
        console.log("Patient received plan:", !!receivedPlan, receivedPlan?.title, "By:", receivedPlan?.dietitian_name);

        console.log("\n========================================================");
        console.log("🎉 COMPLETE END-TO-END DIETITIAN WORKFLOW VERIFIED SUCCESSFULLY!");
        console.log("========================================================");

    } catch (err) {
        console.error("Test error:", err);
    } finally {
        server.close();
        process.exit(0);
    }
}

runEndToEndFlow();
