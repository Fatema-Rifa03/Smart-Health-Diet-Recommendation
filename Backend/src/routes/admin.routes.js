import express from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorize } from "../middleware/role.middleware.js";
import {
    getDashboardOverview,
    getUsers,
    getUserById,
    createUser,
    updateUser,
    toggleUserStatus,
    deleteUser,
    getDietitians,
    getDietitianById,
    createDietitian,
    approveDietitian,
    rejectDietitian,
    suspendDietitian,
    deleteDietitian,
    getFoodCatalog,
    getFoodById,
    createFoodItem,
    updateFoodItem,
    deleteFoodItem,
    getSystemSettings,
    updateSystemSettings,
    getAuditLogs,
    clearAuditLogs,
    getWeeklyCalorieReport,
    getWeightLossTrendsReport,
    getDietitianEngagementReport,
    exportReportData
} from "../controllers/admin.controller.js";

const router = express.Router();

// Enforce authentication & admin authorization for all administrative endpoints
router.use(authenticate);
router.use(authorize("admin"));

// 1. Dashboard Overview
router.get("/dashboard", getDashboardOverview);

// 2. User Accounts Management
router.get("/users", getUsers);
router.post("/users", createUser);
router.get("/users/:id", getUserById);
router.put("/users/:id", updateUser);
router.patch("/users/:id/status", toggleUserStatus);
router.delete("/users/:id", deleteUser);

// 3. Dietitian Management & Approvals
router.get("/dietitians", getDietitians);
router.post("/dietitians", createDietitian);
router.get("/dietitians/:id", getDietitianById);
router.patch("/dietitians/:id/approve", approveDietitian);
router.patch("/dietitians/:id/reject", rejectDietitian);
router.patch("/dietitians/:id/suspend", suspendDietitian);
router.delete("/dietitians/:id", deleteDietitian);

// 4. Food Database Catalog Management
router.get("/foods", getFoodCatalog);
router.post("/foods", createFoodItem);
router.get("/foods/:id", getFoodById);
router.put("/foods/:id", updateFoodItem);
router.delete("/foods/:id", deleteFoodItem);

// 5. System Settings & Configuration
router.get("/settings", getSystemSettings);
router.put("/settings", updateSystemSettings);

// 6. System Audit Logs
router.get("/audit-logs", getAuditLogs);
router.delete("/audit-logs", clearAuditLogs);

// 7. System Analytics & Reports
router.get("/reports/weekly-calories", getWeeklyCalorieReport);
router.get("/reports/weight-loss", getWeightLossTrendsReport);
router.get("/reports/dietitian-engagement", getDietitianEngagementReport);
router.get("/reports/export/:type", exportReportData);

export default router;
