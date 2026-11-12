-- Báo cáo ma trận (theo file bao-cao-tk.xlsx): nhóm mặt hàng × loại hình xuất, theo dự án, top dự án.
-- Dự án = tên công trình. Nhóm mặt hàng = mặt hàng danh mục có tên dạng "N - Tên" (24 nhóm); mọi mặt hàng khác (gõ tự do, hoặc chưa chọn) gom thành một mục 'Mặt hàng khác'.
-- security invoker: đọc qua RLS của người gọi, như inspection_stats. Khoảng ngày nửa mở [p_from, p_to).

create or replace function public.report_matrix(
  p_from date, p_to date,
  p_by text,                 -- 'product' (hàng = nhóm mặt hàng) | 'project' (hàng = dự án)
  p_project text default null, -- chỉ tính dòng của dự án này (chỉ có nghĩa khi p_by = 'product')
  p_limit int default null    -- p_by = 'project': chỉ giữ N dự án khối lượng lớn nhất
)
returns table (row_key text, export_type_id bigint, row_count bigint, weight_kg_sum numeric)
language sql stable security invoker set search_path = public as $$
  with src as (
    select
      case p_by when 'project' then c.name when 'product' then case when pr.name ~ '^[0-9]+ - ' then pr.name else 'Mặt hàng khác' end end as k,
      d.export_type_id, d.total_weight_kg
    from inspection_details d
    left join lookup_items c on c.id = d.construction_id
    left join lookup_items pr on pr.id = d.product_id
    where d.export_date >= p_from and d.export_date < p_to
      and p_by in ('product', 'project')
      and (p_by <> 'project' or c.name is not null) -- dòng chưa gắn công trình không thuộc dự án nào
      and (p_project is null or c.name = p_project)
  ),
  agg as (
    select k, export_type_id, count(*) as n, coalesce(sum(total_weight_kg), 0) as w from src group by k, export_type_id
  ),
  top as (
    select k from agg group by k order by sum(w) desc, k limit coalesce(p_limit, 2147483647)
  )
  select a.k, a.export_type_id, a.n, a.w from agg a where a.k in (select k from top)
$$;

-- Danh sách dự án có dòng trong kỳ (cho ô chọn dự án), nhiều khối lượng nhất trước.
create or replace function public.report_projects(p_from date, p_to date)
returns table (project text, row_count bigint, weight_kg_sum numeric)
language sql stable security invoker set search_path = public as $$
  select c.name, count(*), coalesce(sum(d.total_weight_kg), 0)
  from inspection_details d join lookup_items c on c.id = d.construction_id
  where d.export_date >= p_from and d.export_date < p_to 
  group by 1 order by 3 desc, 1
$$;

grant execute on function public.report_matrix(date, date, text, text, int) to authenticated;
grant execute on function public.report_projects(date, date) to authenticated;
