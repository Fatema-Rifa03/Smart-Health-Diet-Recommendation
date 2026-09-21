import express from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import {
    listDietitians,
    listGuidanceRequests,
    createGuidanceRequest,
    listRecipes,
    listMealPlans,
    getProgressReport,
    listConversations,
    listMessages,
    sendMessage,
    markMessagesRead
} from "../controllers/user-resources.controller.js";

const router = express.Router();
router.use(authenticate);

router.get("/dietitians", listDietitians);
router.get("/guidance-requests", listGuidanceRequests);
router.post("/guidance-requests", createGuidanceRequest);
router.get("/recipes", listRecipes);
router.get("/meal-plans", listMealPlans);
router.get("/reports/progress", getProgressReport);
router.get("/conversations", listConversations);
router.get("/conversations/:conversationId/messages", listMessages);
router.post("/conversations/:conversationId/messages", sendMessage);
router.post("/conversations/:conversationId/read", markMessagesRead);

export default router;