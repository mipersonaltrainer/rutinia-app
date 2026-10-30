drop function ai_finish(uuid, text, text, text, int, int, int, uuid, text, jsonb, jsonb, text[], text);
create function ai_finish(p_usage uuid, p_status text, p_provider text, p_model text, p_in int, p_out int, p_ms int, p_client uuid, p_digest text, p_output jsonb, p_violations jsonb, p_flags text[], p_inter_status text)
returns uuid language plpgsql security definer set search_path = public as $$
declare u ai_usage; iid uuid;
begin
  select * into u from ai_usage where id = p_usage and user_id = auth.uid() and status = 'reserved' for update;
  if u.id is null then raise exception 'unknown usage'; end if;
  update ai_usage set status = p_status, provider = p_provider, model = p_model, input_tokens = greatest(0, coalesce(p_in, 0)), output_tokens = greatest(0, coalesce(p_out, 0)), latency_ms = p_ms where id = u.id;
  insert into ai_interactions (usage_id, user_id, client_id, kind, input_digest, output, violations, flags, status)
    values (u.id, u.user_id, p_client, u.kind, p_digest, p_output, coalesce(p_violations, '[]'), coalesce(p_flags, '{}'), p_inter_status) returning id into iid;
  return iid;
end $$;
revoke execute on function ai_finish(uuid, text, text, text, int, int, int, uuid, text, jsonb, jsonb, text[], text) from public, anon;
grant execute on function ai_finish(uuid, text, text, text, int, int, int, uuid, text, jsonb, jsonb, text[], text) to authenticated;
