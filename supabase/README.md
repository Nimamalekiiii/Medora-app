# Supabase cloud backup

MedExam keeps working with its on-device storage when Supabase is not configured. To enable a personal cloud copy:

1. Create a Supabase project, then run `migrations/20261002000000_create_medexam_study_data.sql` in the Supabase SQL Editor.
2. Run `migrations/20261003000000_profile_storage_and_deletion.sql` in the same SQL Editor. This creates private profile-image storage and the account-deletion function. It is safe to apply again if needed.
3. Copy `.env.example` to `.env.local` in the app root. Fill in the project URL and its **publishable** key from the project's API settings.
4. Restart Expo. In Profile, create or sign into the account that should own the study data, then choose **Sync now**.

Never put a `service_role` key or any secret key in an `EXPO_PUBLIC_` variable. The app's table has row-level security so a signed-in account can access only its own backup. The first sync asks before choosing between existing local and cloud data. Later local changes sync automatically when a safe version match is available; a competing cloud update is left untouched and must be resolved from Profile.

The cloud copy is a backup of all current MedExam study records. Deleting a Supabase account also deletes its cloud row. Keep the export-backup option in Profile as an additional portable copy.
