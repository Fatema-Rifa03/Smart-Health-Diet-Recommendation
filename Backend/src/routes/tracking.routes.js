import express from "express";
import { 
    logMeal, getMealsByDate, deleteMeal, clearTodayMeals,
    logWater, getWater, resetWater,
    logSleep, getSleepLogs,
    logWeight, getWeightLogs,
    getDashboardSummary
} from "../controllers/tracking.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(authenticate);

// Dashboard
router.get("/dashboard", getDashboardSummary);

// Meals
router.post("/meals", logMeal);
router.get("/meals", getMealsByDate);
router.delete("/meals/today", clearTodayMeals);
router.delete("/meals/:id", deleteMeal);

// Water
router.post("/water", logWater);
router.get("/water", getWater);
router.delete("/water", resetWater);

// Sleep
router.post("/sleep", logSleep);
router.get("/sleep", getSleepLogs);

// Weight
router.post("/weight", logWeight);
router.get("/weight", getWeightLogs);

export default router;
