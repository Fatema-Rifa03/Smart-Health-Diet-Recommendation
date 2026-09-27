import express from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorize } from "../middleware/role.middleware.js";
import {
    getDietitianProfile,
    updateDietitianProfile,
    requestVerification,
    getDietitianDashboard,
    getAssignedPatients,
    getGuidanceRequests,
    updateGuidanceRequestStatus,
    createDietitianMealPlan,
    createDietitianRecipe
} from "../controllers/dietitian.controller.js";

const router = express.Router();

// Enforce authentication & dietitian authorization
router.use(authenticate);
router.use(authorize("dietitian"));

// 1. Profile & Verification
router.get("/profile", getDietitianProfile);
router.put("/profile", updateDietitianProfile);
router.post("/request-verification", requestVerification);

// 2. Dashboard Metrics
router.get("/dashboard", getDietitianDashboard);

// 3. Patients
router.get("/patients", getAssignedPatients);

// 4. Guidance Requests
router.get("/guidance-requests", getGuidanceRequests);
router.patch("/guidance-requests/:id", updateGuidanceRequestStatus);

// 5. Meal Plans
router.post("/meal-plans", createDietitianMealPlan);

// 6. Recipes & Guides
router.post("/recipes", createDietitianRecipe);

export default router;
