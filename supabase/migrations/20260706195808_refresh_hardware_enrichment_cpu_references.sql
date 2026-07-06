with cpu_reference_map(pattern, normalized_name) as (
  values
    ('%intel%core%i5%1334u%', 'intel core i5 1334u'),
    ('%intel%core%i7%1250u%', 'intel core i7 1250u'),
    ('%intel%core%i7%1260p%', 'intel core i7 1260p'),
    ('%intel%core%7%150u%', 'intel core 7 150u'),
    ('%intel%core%ultra%5%125h%', 'intel core ultra 5 125h'),
    ('%intel%core%ultra%7%155h%', 'intel core ultra 7 155h'),
    ('%intel%core%ultra%7%165u%', 'intel core ultra 7 165u'),
    ('%intel%core%ultra%5%226v%', 'intel core ultra 5 226v'),
    ('%intel%core%ultra%7%256v%', 'intel core ultra 7 256v'),
    ('%intel%core%ultra%9%288v%', 'intel core ultra 9 288v'),
    ('%amd%ryzen%5%7520u%', 'amd ryzen 5 7520u'),
    ('%amd%ryzen%ai%7%350%', 'amd ryzen ai 7 350'),
    ('%amd%ryzen%ai%7%445%', 'amd ryzen ai 7 445'),
    ('%apple%m1%pro%', 'apple m1 pro'),
    ('%snapdragon%x%x126100%', 'snapdragon x x126100'),
    ('%snapdragon%x%plus%x1p42100%', 'snapdragon x plus x1p42100')
),
mapped_enrichment as (
  select
    he.device_id,
    cb.cpu_name,
    cb.cpu_mark_score,
    cb.release_year,
    cb.generation
  from public.hardware_enrichment he
  join public.devices d on d.id = he.device_id
  join cpu_reference_map map
    on lower(coalesce(d.cpu, he.cpu_name, '')) like map.pattern
  join public.cpu_benchmarks cb
    on cb.normalized_name = map.normalized_name
)
update public.hardware_enrichment he
set
  cpu_name = mapped_enrichment.cpu_name,
  cpu_score = mapped_enrichment.cpu_mark_score,
  cpu_benchmark_score = mapped_enrichment.cpu_mark_score,
  cpu_release_year = mapped_enrichment.release_year,
  cpu_generation = mapped_enrichment.generation,
  model_release_year = case
    when he.model_release_year is null or he.model_release_year = he.cpu_release_year
      then mapped_enrichment.release_year
    else he.model_release_year
  end,
  release_year = case
    when he.release_year is null or he.release_year = he.cpu_release_year
      then mapped_enrichment.release_year
    else he.release_year
  end,
  last_enriched_at = now()
from mapped_enrichment
where he.device_id = mapped_enrichment.device_id;
