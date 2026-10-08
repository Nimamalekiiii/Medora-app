-- Private profile photo storage. Each signed-in user can access only their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'medexam-profile-images',
  'medexam-profile-images',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can read their MedExam profile image" on storage.objects;
create policy "Users can read their MedExam profile image"
  on storage.objects for select to authenticated
  using (bucket_id = 'medexam-profile-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Users can upload their MedExam profile image" on storage.objects;
create policy "Users can upload their MedExam profile image"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'medexam-profile-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Users can update their MedExam profile image" on storage.objects;
create policy "Users can update their MedExam profile image"
  on storage.objects for update to authenticated
  using (bucket_id = 'medexam-profile-images' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'medexam-profile-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Users can delete their MedExam profile image" on storage.objects;
create policy "Users can delete their MedExam profile image"
  on storage.objects for delete to authenticated
  using (bucket_id = 'medexam-profile-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Account deletion is performed only for the currently authenticated user.
create or replace function public.delete_my_medexam_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_medexam_account() from public, anon;
grant execute on function public.delete_my_medexam_account() to authenticated;
