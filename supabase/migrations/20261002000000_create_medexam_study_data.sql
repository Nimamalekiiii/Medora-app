create table if not exists public.medexam_study_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default now()
);

alter table public.medexam_study_data enable row level security;

revoke all on table public.medexam_study_data from anon, public;
grant select, insert, update, delete on table public.medexam_study_data to authenticated;

drop policy if exists "Users can read their MedExam backup" on public.medexam_study_data;
create policy "Users can read their MedExam backup"
  on public.medexam_study_data for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their MedExam backup" on public.medexam_study_data;
create policy "Users can create their MedExam backup"
  on public.medexam_study_data for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their MedExam backup" on public.medexam_study_data;
create policy "Users can update their MedExam backup"
  on public.medexam_study_data for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their MedExam backup" on public.medexam_study_data;
create policy "Users can delete their MedExam backup"
  on public.medexam_study_data for delete to authenticated
  using ((select auth.uid()) = user_id);
