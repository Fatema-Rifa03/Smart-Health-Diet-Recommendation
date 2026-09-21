import express from "express";
import { getFoods } from "../controllers/food.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(authenticate);

router.get("/", getFoods);

export default router;
