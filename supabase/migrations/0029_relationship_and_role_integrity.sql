-- Security audit SEC-001 and SEC-002.
--
-- SEC-001. Until now a trainer could INSERT or UPDATE rows of trainer_client_relationships directly (policy rel_trainer_write, FOR ALL).
-- Nothing tied a relationship to an accepted invitation, so a trainer who knew a client's UUID could attach themselves, and
-- can_access_client() then gave them that client's health data, photos and messages. A trainer could also reactivate an archived
-- relationship on their own, so a former trainer kept a permanent way back in.
--   * Relationships are now created ONLY by the service role (invitation acceptance).
--   * Archive / reactivate go through set_client_relationship_status(): reactivation is refused when the client ended the
--     relationship themselves or already has another active trainer.
--   * The client can end the relationship (end_my_relationship) and the trainer cannot undo it.
-- SEC-002. profiles.role is read by the application guard and by several SQL functions (send_message, schedule_call, ai_reserve):
--   a user must not be able to change it, nor their own id.

-- ===== SEC-002 ==========================================================================
create function guard_profile_update() returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') and (new.role is distinct from old.role or new.id is distinct from old.id or new.created_at is distinct from old.created_at) then
    raise exception 'role, id and creation date cannot be changed';
  end if;
  return new;
end $$;
create trigger trg_guard_profile before update on profiles for each row execute function guard_profile_update();
revoke execute on function guard_profile_update() from public, anon;

-- ===== SEC-001 ==========================================================================
alter table trainer_client_relationships add column archived_by text check (archived_by in ('trainer', 'client'));
update trainer_client_relationships set archived_by = 'trainer' where status = 'archived';   -- before this migration only trainers could archive

drop policy rel_trainer_write on trainer_client_relationships;                                -- leaves rel_trainer (SELECT) as the only policy
revoke insert, update, delete, truncate on trainer_client_relationships from anon, authenticated;   -- defence in depth: no policy AND no privilege

create function set_client_relationship_status(p_rel uuid, p_status text) returns void language plpgsql security definer set search_path = public as $$
declare r trainer_client_relationships;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_status not in ('active', 'archived') then raise exception 'invalid status'; end if;
  select * into r from trainer_client_relationships where id = p_rel for update;
  if r.id is null or r.trainer_id is distinct from auth.uid() then raise exception 'not allowed'; end if;
  if p_status = r.status::text then return; end if;
  if p_status = 'archived' then
    update trainer_client_relationships set status = 'archived', archived_by = 'trainer' where id = r.id;
    return;
  end if;
  if not trainer_has_access(auth.uid()) then raise exception 'workspace not active'; end if;
  if r.archived_by is distinct from 'trainer' then raise exception 'the relationship was ended by the client'; end if;
  if exists (select 1 from trainer_client_relationships o where o.client_id = r.client_id and o.status = 'active' and o.id <> r.id) then raise exception 'the client already has another active trainer'; end if;
  update trainer_client_relationships set status = 'active', archived_by = null where id = r.id;    -- the capacity trigger still applies
end $$;

create function end_my_relationship() returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  update trainer_client_relationships set status = 'archived', archived_by = 'client' where client_id = auth.uid() and status = 'active';
  if not found then raise exception 'no active relationship'; end if;
end $$;

revoke execute on function set_client_relationship_status(uuid, text), end_my_relationship() from public, anon;
grant execute on function set_client_relationship_status(uuid, text), end_my_relationship() to authenticated;
