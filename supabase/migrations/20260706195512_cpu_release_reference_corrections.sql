insert into public.cpu_benchmarks (
  cpu_name,
  normalized_name,
  cpu_mark_score,
  release_year,
  generation,
  category,
  source,
  updated_at
) values
  ('Intel Core i5-1334U', 'intel core i5 1334u', 14500, 2023, '13th Gen Intel', 'mobile', 'official-intel-ark-reference', now()),
  ('Intel Core i7-1250U', 'intel core i7 1250u', 11700, 2022, '12th Gen Intel', 'mobile', 'official-intel-ark-reference', now()),
  ('Intel Core i7-1260P', 'intel core i7 1260p', 17000, 2022, '12th Gen Intel', 'mobile', 'official-intel-ark-reference', now()),
  ('Intel Core 7 150U', 'intel core 7 150u', 13500, 2024, 'Intel Core Series 1', 'mobile', 'official-intel-core-series-1', now()),
  ('Intel Core Ultra 5 125H', 'intel core ultra 5 125h', 19500, 2023, 'Intel Core Ultra Series 1', 'mobile', 'official-intel-core-ultra-series-1', now()),
  ('Intel Core Ultra 7 155H', 'intel core ultra 7 155h', 25000, 2023, 'Intel Core Ultra Series 1', 'mobile', 'official-intel-core-ultra-series-1', now()),
  ('Intel Core Ultra 7 165U', 'intel core ultra 7 165u', 17500, 2023, 'Intel Core Ultra Series 1', 'mobile', 'official-intel-core-ultra-series-1', now()),
  ('Intel Core Ultra 5 226V', 'intel core ultra 5 226v', 17000, 2024, 'Intel Core Ultra 200V', 'mobile', 'official-intel-core-ultra-200v', now()),
  ('Intel Core Ultra 7 256V', 'intel core ultra 7 256v', 18500, 2024, 'Intel Core Ultra 200V', 'mobile', 'official-intel-core-ultra-200v', now()),
  ('Intel Core Ultra 9 288V', 'intel core ultra 9 288v', 20500, 2024, 'Intel Core Ultra 200V', 'mobile', 'official-intel-core-ultra-200v', now()),
  ('AMD Ryzen 5 7520U', 'amd ryzen 5 7520u', 9500, 2022, 'Ryzen 7000', 'mobile', 'official-amd-product-spec', now()),
  ('AMD Ryzen AI 7 350', 'amd ryzen ai 7 350', 21500, 2025, 'AMD Ryzen AI 300', 'mobile', 'official-amd-ryzen-ai-family', now()),
  ('AMD Ryzen AI 7 445', 'amd ryzen ai 7 445', 22000, 2026, 'AMD Ryzen AI 400', 'mobile', 'amd-ryzen-ai-400-family-rule', now()),
  ('Apple M1 Pro', 'apple m1 pro', 21800, 2021, 'Apple M1 Pro', 'mobile', 'official-apple-newsroom', now()),
  ('Snapdragon X X126100', 'snapdragon x x126100', 13000, 2025, 'Qualcomm Snapdragon X', 'mobile', 'official-qualcomm-snapdragon-x', now()),
  ('Snapdragon X Plus X1P42100', 'snapdragon x plus x1p42100', 15500, 2024, 'Qualcomm Snapdragon X', 'mobile', 'official-qualcomm-snapdragon-x-plus', now())
on conflict (normalized_name) do update set
  cpu_name = excluded.cpu_name,
  cpu_mark_score = excluded.cpu_mark_score,
  release_year = excluded.release_year,
  generation = excluded.generation,
  category = excluded.category,
  source = excluded.source,
  updated_at = now();
