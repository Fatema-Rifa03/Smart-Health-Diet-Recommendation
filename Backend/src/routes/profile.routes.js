import express from "express";
import { getProfile, updateProfile } from "../controllers/profile.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(authenticate);

router.get("/", getProfile);
router.put("/", updateProfile);

export default router;
