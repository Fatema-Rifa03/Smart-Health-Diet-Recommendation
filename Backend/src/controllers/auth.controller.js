import pool from "../config/db.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";

const JWT_SECRET = process.env.JWT_SECRET || "supersecretjwtkey";
const JWT_EXPIRES_IN = "7d";

// ===============================
// REGISTER
// ===============================
export const register = async (req, res) => {
    try {
        const {
            full_name,
            email,
            password,
            role = "user"
        } = req.body;

        // Validate required fields
        if (!full_name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "Full name, email and password are required"
            });
        }

        // Only allow public roles
        if (!["user", "dietitian"].includes(role)) {
            return res.status(400).json({
                success: false,
                message: "Invalid role"
            });
        }

        const normalizedEmail = email.toLowerCase().trim();

        // Check if user already exists
        const userExists = await pool.query(
            "SELECT id FROM accounts WHERE lower(email) = $1",
            [normalizedEmail]
        );

        if (userExists.rows.length > 0) {
            return res.status(409).json({
                success: false,
                message: "User with this email already exists"
            });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // Generate UUID
        const newUserId = crypto.randomUUID();

        // Create application account and role-specific onboarding data.
        const result = await pool.query(
            `
            INSERT INTO accounts
                (id, full_name, email, role, password_hash)
            VALUES
                ($1, $2, $3, $4, $5)
            RETURNING
                id,
                full_name,
                email,
                role,
                status,
                joined_at
            `,
            [
                newUserId,
                full_name,
                normalizedEmail,
                role,
                passwordHash
            ]
        );

        const user = result.rows[0];

        if (role === "user") {
            const { age, height_cm, current_weight_kg, primary_goal, daily_calorie_target } = req.body;
            await pool.query(
                `INSERT INTO user_profiles (account_id, age, height_cm, starting_weight_kg, current_weight_kg, primary_goal, daily_calorie_target)
                 VALUES ($1, $2, $3, $4, $4, $5, $6)`,
                [newUserId, age || null, height_cm || null, current_weight_kg || null, primary_goal || null, daily_calorie_target || 2000]
            );
        } else {
            const { specialty, qualification, years_experience } = req.body;
            await pool.query(
                `INSERT INTO dietitian_profiles (account_id, specialty, qualification, years_experience)
                 VALUES ($1, $2, $3, $4)`,
                [newUserId, specialty || "Clinical Dietitian", qualification || null, years_experience || null]
            );
        }

        // Generate JWT
        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        return res.status(201).json({
            success: true,
            message: "Registration successful",
            user: user,
            session: {
                access_token: token
            }
        });

    } catch (error) {
        console.error("Register error:", error);

        // Keep the response correct even if two registrations pass the pre-check at once.
        if (error.code === "23505" && error.constraint === "accounts_email_unique") {
            return res.status(409).json({
                success: false,
                message: "User with this email already exists"
            });
        }

        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};


// ===============================
// LOGIN
// ===============================
export const login = async (req, res) => {
    try {
        const {
            email,
            password
        } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required"
            });
        }

        const normalizedEmail = email.toLowerCase().trim();

        // Get application account
        const result = await pool.query(
            `
            SELECT
                id,
                full_name,
                email,
                role,
                status,
                password_hash,
                joined_at,
                last_login_at
            FROM accounts
            WHERE email = $1
            `,
            [normalizedEmail]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        const account = result.rows[0];

        // Verify password
        const isMatch = await bcrypt.compare(password, account.password_hash || "");
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        if (account.status !== "active") {
            return res.status(403).json({
                success: false,
                message: "Your account is inactive"
            });
        }

        // Update last login
        await pool.query(
            `
            UPDATE accounts
            SET last_login_at = CURRENT_TIMESTAMP
            WHERE id = $1
            `,
            [account.id]
        );

        // Generate JWT
        const token = jwt.sign(
            { id: account.id, email: account.email, role: account.role },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        return res.status(200).json({
            success: true,
            message: "Login successful",
            user: {
                id: account.id,
                full_name: account.full_name,
                email: account.email,
                role: account.role,
                status: account.status
            },
            session: {
                access_token: token
            }
        });

    } catch (error) {
        console.error("Login error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};

// ===============================
// LOGOUT
// ===============================
export const logout = async (req, res) => {
    // For JWT, logout is usually handled client-side by deleting the token.
    // We can just return a success message here.
    return res.status(200).json({
        success: true,
        message: "Logout successful"
    });
};