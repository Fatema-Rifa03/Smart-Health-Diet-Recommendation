BEGIN;

-- Remove records that use RESTRICT references to dietitian accounts first.
DELETE FROM meal_plans
WHERE dietitian_id IN (
    SELECT id FROM accounts WHERE role = 'dietitian'
);

DELETE FROM recipes
WHERE author_id IN (
    SELECT id FROM accounts WHERE role = 'dietitian'
);

-- Remove food items created by dietitians. Recipe references are already gone.
DELETE FROM food_items
WHERE created_by IN (
    SELECT id FROM accounts WHERE role = 'dietitian'
);

-- Messages retain their sender with RESTRICT, so remove dietitian-authored
-- messages before deleting the sender accounts.
DELETE FROM messages
WHERE sender_id IN (
    SELECT id FROM accounts WHERE role = 'dietitian'
);

-- Remove dietitian accounts. Related profiles, requests, conversations,
-- messages, and other CASCADE records are removed automatically.
DELETE FROM accounts
WHERE role = 'dietitian';

COMMIT;