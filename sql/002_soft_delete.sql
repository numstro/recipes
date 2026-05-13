-- Add soft delete to recipes
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Hide deleted recipes from regular users via RLS
DROP POLICY IF EXISTS "read_recipes" ON recipes;
CREATE POLICY "read_recipes" ON recipes
    FOR SELECT TO authenticated USING (deleted_at IS NULL);
