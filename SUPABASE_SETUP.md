1. Create a Supabase project.
2. Open the SQL editor and run [supabase-schema.sql](/c:/Users/asiapac1/Downloads/gutguard/supabase-schema.sql).
3. In Supabase Dashboard, enable `Authentication > Providers > Email`.
4. Open [supabase-config.js](/c:/Users/asiapac1/Downloads/gutguard/supabase-config.js) and set:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
5. Open [gutguard_90day_plan (4).html](/c:/Users/asiapac1/Downloads/gutguard/gutguard_90day_plan (4).html) in the browser.
6. Sign up or sign in from the `Account Access` section on the home screen.
7. Save a plan. The page will store the last saved `plan_id` per role in `localStorage` so `Load Saved Plan` can rehydrate it.

Notes:
- This implementation now expects Supabase Auth and row-level security.
- If you already created the old schema, rerun [supabase-schema.sql](/c:/Users/asiapac1/Downloads/gutguard/supabase-schema.sql) so `user_id`, `parent_plan_id`, and RLS policies are added.
