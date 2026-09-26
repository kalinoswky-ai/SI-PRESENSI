/**
 * Supabase/PostgREST membatasi 1000 baris per query. Untuk rekap/ekspor absensi (95 pegawai ×
 * banyak hari) batas itu terlampaui, sehingga data terpotong diam-diam. Helper ini mengambil
 * semua halaman berurutan. `build` harus menyertakan order() yang stabil (mis. server_time lalu id).
 */
export async function fetchAllRows<T = any>( // eslint-disable-line @typescript-eslint/no-explicit-any
  build: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  opts: { pageSize?: number; max?: number } = {}
): Promise<{ data: T[]; error: string | null }> {
  const pageSize = opts.pageSize ?? 1000;
  const max = opts.max ?? 20000;
  const all: T[] = [];

  for (let from = 0; from < max; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) return { data: all, error: error.message };
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < pageSize) break;
  }
  return { data: all, error: null };
}
