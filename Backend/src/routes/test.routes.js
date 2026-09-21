import express from "express";
import { testDatabase } from "../controllers/test.controller.js";

const router = express.Router();

router.get("/db", testDatabase);

export default router;