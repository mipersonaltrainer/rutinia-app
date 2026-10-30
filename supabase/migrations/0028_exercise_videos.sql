-- Exercise demonstration videos (the gray-mannequin clips). Library content, not personal data: the bucket is public-read so the <video>
-- tag works anywhere, and ONLY the service role can write (bulk upload script); no signed-in user can upload or replace a clip.
alter table exercises add column video_path text check (video_path is null or video_path ~ '^[a-z0-9][a-z0-9-]{1,100}-[0-9a-f]{8}\.(mp4|webm)$');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('exercise-videos', 'exercise-videos', true, 15728640, array['video/mp4','video/webm'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
-- No policies for INSERT/UPDATE/DELETE on storage.objects for this bucket: with row-level security on, that means nobody but the service role.
