-- Run in Supabase Dashboard → SQL Editor

-- Recipes table
CREATE TABLE recipes (
    id          SERIAL PRIMARY KEY,
    url         TEXT NOT NULL UNIQUE,
    title       TEXT,
    description TEXT,
    image_url   TEXT,
    favicon_url TEXT,
    domain      TEXT,
    notes       TEXT NOT NULL DEFAULT '',
    ingredients JSONB NOT NULL DEFAULT '[]',
    steps       JSONB NOT NULL DEFAULT '[]',
    tags        JSONB NOT NULL DEFAULT '[]',
    text_snapshot TEXT,
    added_by    UUID REFERENCES auth.users(id),
    saved_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- IP logs for recipe creates
CREATE TABLE recipe_logs (
    id          SERIAL PRIMARY KEY,
    recipe_id   INTEGER REFERENCES recipes(id) ON DELETE SET NULL,
    user_id     UUID REFERENCES auth.users(id),
    ip_address  TEXT,
    action      TEXT NOT NULL, -- 'create', 'update', 'delete'
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- IP ban list
CREATE TABLE banned_ips (
    id          SERIAL PRIMARY KEY,
    ip_address  TEXT NOT NULL UNIQUE,
    reason      TEXT,
    expires_at  TIMESTAMPTZ,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at on recipes
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER recipes_updated_at
    BEFORE UPDATE ON recipes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE banned_ips ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all recipes
CREATE POLICY "read_recipes" ON recipes
    FOR SELECT TO authenticated USING (TRUE);

-- Authenticated users can insert their own recipes
CREATE POLICY "insert_recipes" ON recipes
    FOR INSERT TO authenticated WITH CHECK (added_by = auth.uid());

-- Users can update their own recipes; service role bypasses this
CREATE POLICY "update_recipes" ON recipes
    FOR UPDATE TO authenticated USING (added_by = auth.uid());

-- Users can delete their own recipes; service role bypasses this
CREATE POLICY "delete_recipes" ON recipes
    FOR DELETE TO authenticated USING (added_by = auth.uid());
