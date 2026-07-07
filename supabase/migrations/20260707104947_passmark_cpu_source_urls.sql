with fixes(normalized_name, cpu_name, score, source_url) as (
  values
    (
      'apple m1 pro',
      'Apple M1 Pro',
      21940,
      'https://www.cpubenchmark.net/cpu.php?cpu=Apple+M1+Pro+10+Core+3200+MHz&id=4580'
    ),
    (
      'amd ryzen 7 5800h',
      'AMD Ryzen 7 5800H',
      20541,
      'https://www.cpubenchmark.net/cpu.php?cpu=AMD+Ryzen+7+5800H&id=3907'
    ),
    (
      'amd ryzen 7 3700u',
      'AMD Ryzen 7 3700U',
      7300,
      'https://www.cpubenchmark.net/cpu_lookup.php?cpu=AMD+Ryzen+7+3700U'
    )
)
update public.cpu_benchmarks cb
set cpu_name = fixes.cpu_name,
    cpu_mark_score = fixes.score,
    source = 'passmark-cpu-mark',
    source_url = fixes.source_url,
    updated_at = now()
from fixes
where cb.normalized_name = fixes.normalized_name;
