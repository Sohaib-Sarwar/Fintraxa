# Superseded

The two `.sql` files in this directory are no longer the source of truth and
should not be run.

| File | Why it is superseded |
|---|---|
| `user_preferences.sql` | Duplicates the table now defined in the baseline migration, and its UPDATE policy has no `WITH CHECK` — a user could reassign `user_id` while editing their own row. |
| `seed_default_investment_categories.sql` | Inserts categories with `user_id` NULL. The live SELECT policy is `auth.uid() = user_id`, so those rows are invisible to every user, and the app's free-cash lookups never find them. Defaults are seeded per user by the app instead (see `DEFAULT_CATEGORIES` in `src/lib/defaultCategories.js`). |

The schema lives in one place:

    supabase/migrations/20260927000000_baseline_live_schema.sql

Neither of these files was ever run by the Supabase CLI — they sit outside
`supabase/migrations/`, so they were applied by hand, which is how the
repository and the live database drifted apart in the first place.
