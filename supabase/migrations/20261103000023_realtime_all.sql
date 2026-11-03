-- T-079 / D-028: mọi thao tác hiện ngay trên máy khác — đưa các bảng dữ liệu chính vào publication supabase_realtime.
-- Realtime vẫn áp RLS select cho từng người nghe (người chưa duyệt / bị khóa không nhận dữ liệu). Chạy lại được.
begin;

do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['transport_plans', 'transport_plan_material_exporters', 'inspection_details', 'lookup_items', 'profiles'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

do $$
begin
  assert (select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'
          and tablename in ('transport_plans', 'transport_plan_material_exporters', 'inspection_details', 'lookup_items', 'profiles')) = 5,
    'thiếu bảng trong publication supabase_realtime';
end $$;

commit;
