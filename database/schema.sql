-- Smart Health & Diet Recommendation System
-- PostgreSQL 15+
-- Durable schema for the current frontend workflows.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE account_role AS ENUM ('user', 'dietitian', 'admin');
CREATE TYPE account_status AS ENUM ('active', 'inactive');
CREATE TYPE dietitian_status AS ENUM ('pending', 'approved', 'rejected', 'suspended');
CREATE TYPE guidance_request_status AS ENUM ('pending', 'accepted', 'rejected');
CREATE TYPE meal_category AS ENUM ('breakfast', 'lunch', 'dinner', 'snacks');
CREATE TYPE plan_status AS ENUM ('draft', 'active', 'archived');
CREATE TYPE audit_status AS ENUM ('logged', 'completed', 'approved', 'warning', 'rejected', 'active');

CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(320) NOT NULL,
    password_hash TEXT NOT NULL,
    role account_role NOT NULL,
    status account_status NOT NULL DEFAULT 'active',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT accounts_email_lowercase CHECK (email = lower(email))
);

CREATE UNIQUE INDEX accounts_email_unique ON accounts (lower(email));
CREATE INDEX accounts_role_status_idx ON accounts (role, status);

CREATE TABLE user_profiles (
    account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
    age SMALLINT CHECK (age BETWEEN 1 AND 130),
    gender VARCHAR(30) CHECK (gender IN ('female', 'male', 'other', 'prefer_not_to_say')),
    height_cm NUMERIC(5, 2) CHECK (height_cm > 0 AND height_cm < 300),
    starting_weight_kg NUMERIC(6, 2) CHECK (starting_weight_kg > 0 AND starting_weight_kg < 1000),
    current_weight_kg NUMERIC(6, 2) CHECK (current_weight_kg > 0 AND current_weight_kg < 1000),
    target_weight_kg NUMERIC(6, 2) CHECK (target_weight_kg > 0 AND target_weight_kg < 1000),
    primary_goal VARCHAR(150),
    daily_calorie_target INTEGER CHECK (daily_calorie_target > 0 AND daily_calorie_target < 10000),
    water_target_liters NUMERIC(5, 2) NOT NULL DEFAULT 2.50 CHECK (water_target_liters > 0 AND water_target_liters < 100),
    sleep_target_hours NUMERIC(4, 2) NOT NULL DEFAULT 8.00 CHECK (sleep_target_hours > 0 AND sleep_target_hours < 24),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE dietitian_profiles (
    account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
    specialty VARCHAR(200) NOT NULL,
    years_experience NUMERIC(5, 2) CHECK (years_experience >= 0 AND years_experience < 100),
    qualification TEXT,
    avatar_url TEXT,
    rating NUMERIC(2, 1) NOT NULL DEFAULT 5.0 CHECK (rating BETWEEN 0 AND 5),
    status dietitian_status NOT NULL DEFAULT 'pending',
    reviewed_by UUID REFERENCES accounts(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    review_note TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX dietitian_directory_idx ON dietitian_profiles (status, specialty);

CREATE TABLE food_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    category meal_category NOT NULL,
    calories INTEGER NOT NULL CHECK (calories >= 0),
    protein_g NUMERIC(7, 2) NOT NULL DEFAULT 0 CHECK (protein_g >= 0),
    carbohydrates_g NUMERIC(7, 2) NOT NULL DEFAULT 0 CHECK (carbohydrates_g >= 0),
    fat_g NUMERIC(7, 2) NOT NULL DEFAULT 0 CHECK (fat_g >= 0),
    portion_description VARCHAR(200) NOT NULL,
    created_by UUID REFERENCES accounts(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX food_items_category_idx ON food_items (category);
CREATE INDEX food_items_name_idx ON food_items (lower(name));

CREATE TABLE recipes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(200) NOT NULL,
    category meal_category NOT NULL,
    calories INTEGER NOT NULL CHECK (calories >= 0),
    prep_time_minutes INTEGER CHECK (prep_time_minutes >= 0),
    author_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    image_url TEXT,
    instructions TEXT,
    serving_size VARCHAR(100),
    is_published BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX recipes_category_published_idx ON recipes (category, is_published);
CREATE INDEX recipes_author_idx ON recipes (author_id);

CREATE TABLE recipe_ingredients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    food_item_id UUID REFERENCES food_items(id) ON DELETE SET NULL,
    ingredient_name VARCHAR(200) NOT NULL,
    quantity VARCHAR(100),
    sort_order INTEGER NOT NULL DEFAULT 0,
    UNIQUE (recipe_id, sort_order)
);

CREATE TABLE meal_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    dietitian_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    title VARCHAR(200) NOT NULL,
    target_calories INTEGER CHECK (target_calories > 0),
    status plan_status NOT NULL DEFAULT 'draft',
    start_date DATE,
    end_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

CREATE INDEX meal_plans_patient_idx ON meal_plans (patient_id, status);
CREATE INDEX meal_plans_dietitian_idx ON meal_plans (dietitian_id, status);

CREATE TABLE meal_plan_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meal_plan_id UUID NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
    category meal_category NOT NULL,
    recommendation TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    UNIQUE (meal_plan_id, category, sort_order)
);

CREATE TABLE meal_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    logged_for DATE NOT NULL DEFAULT CURRENT_DATE,
    category meal_category NOT NULL,
    meal_name VARCHAR(200) NOT NULL,
    calories INTEGER NOT NULL CHECK (calories >= 0),
    food_item_id UUID REFERENCES food_items(id) ON DELETE SET NULL,
    recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL,
    logged_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX meal_logs_user_date_idx ON meal_logs (user_id, logged_for DESC);

CREATE TABLE water_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    log_date DATE NOT NULL DEFAULT CURRENT_DATE,
    amount_liters NUMERIC(6, 2) NOT NULL DEFAULT 0 CHECK (amount_liters >= 0),
    target_liters NUMERIC(6, 2) NOT NULL CHECK (target_liters > 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, log_date)
);

CREATE TABLE sleep_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    duration_hours NUMERIC(4, 2) NOT NULL CHECK (duration_hours >= 0 AND duration_hours < 24),
    quality_score SMALLINT CHECK (quality_score BETWEEN 0 AND 100),
    bedtime TIMESTAMPTZ,
    wake_time TIMESTAMPTZ,
    notes TEXT,
    UNIQUE (user_id, date)
);

CREATE INDEX sleep_logs_user_date_idx ON sleep_logs (user_id, date DESC);

CREATE TABLE weight_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    weight_kg NUMERIC(6, 2) NOT NULL CHECK (weight_kg > 0 AND weight_kg < 1000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, date)
);

CREATE INDEX weight_entries_user_date_idx ON weight_entries (user_id, date DESC);

CREATE TABLE guidance_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    dietitian_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    goal TEXT NOT NULL,
    status guidance_request_status NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX one_pending_guidance_request_idx
    ON guidance_requests (patient_id, dietitian_id)
    WHERE status = 'pending';
CREATE INDEX guidance_requests_dietitian_idx ON guidance_requests (dietitian_id, status);
CREATE INDEX guidance_requests_patient_idx ON guidance_requests (patient_id, status);

CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    dietitian_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (patient_id, dietitian_id)
);

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    message_text TEXT NOT NULL CHECK (length(trim(message_text)) > 0),
    sent_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMPTZ
);

CREATE INDEX messages_conversation_sent_idx ON messages (conversation_id, sent_at);

CREATE TABLE system_settings (
    id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
    warning_percentage SMALLINT NOT NULL DEFAULT 80 CHECK (warning_percentage BETWEEN 0 AND 100),
    default_water_liters NUMERIC(5, 2) NOT NULL DEFAULT 2.50 CHECK (default_water_liters > 0),
    default_sleep_hours NUMERIC(4, 2) NOT NULL DEFAULT 8.00 CHECK (default_sleep_hours > 0 AND default_sleep_hours < 24),
    maintenance_mode BOOLEAN NOT NULL DEFAULT FALSE,
    auto_approve_dietitians BOOLEAN NOT NULL DEFAULT FALSE,
    updated_by UUID REFERENCES accounts(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO system_settings (id)
VALUES (TRUE)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE audit_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_type VARCHAR(60) NOT NULL,
    description TEXT NOT NULL,
    status audit_status NOT NULL DEFAULT 'logged',
    actor_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
    actor_label VARCHAR(150),
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX audit_logs_occurred_idx ON audit_logs (occurred_at DESC);
CREATE INDEX audit_logs_type_idx ON audit_logs (event_type, status);

-- Reports can be calculated from durable records rather than stored as static rows.
CREATE VIEW user_daily_calorie_summary AS
SELECT
    user_id,
    logged_for,
    SUM(calories)::INTEGER AS calories_consumed,
    COUNT(*)::INTEGER AS meals_logged
FROM meal_logs
GROUP BY user_id, logged_for;

CREATE VIEW user_weight_progress AS
WITH ranked_weights AS (
    SELECT
        user_id,
        weight_kg,
        ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY date ASC) AS first_row,
        ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY date DESC) AS latest_row
    FROM weight_entries
)
SELECT
    user_id,
    MAX(weight_kg) FILTER (WHERE first_row = 1) AS first_weight_kg,
    MAX(weight_kg) FILTER (WHERE latest_row = 1) AS latest_weight_kg
FROM ranked_weights
GROUP BY user_id;
