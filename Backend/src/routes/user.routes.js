import express from "express";

import { getMe } from "../controllers/user.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get(
    "/me",
    authenticate,
    getMe
);

export default router;