import express from "express";
import cors from "cors";

import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import profileRoutes from "./routes/profile.routes.js";
import trackingRoutes from "./routes/tracking.routes.js";
import foodRoutes from "./routes/food.routes.js";
import userResourceRoutes from "./routes/user-resources.routes.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
    res.json({
        message: "Backend API is running"
    });
});

//authentication
app.use("/api/auth", authRoutes);

app.use("/api/users", userRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/tracking", trackingRoutes);
app.use("/api/foods", foodRoutes);
app.use("/api/user", userResourceRoutes);

app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "Route not found"
    });
});

export default app;