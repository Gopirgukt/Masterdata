const PAGE_SIZE = 1000;

/**
 * Fetches every row matching a query, paginating past Supabase/PostgREST's
 * default 1000-row response cap. Confirmed 2026-08-21: the candidates table
 * passed 1000 rows and several pages (Company Analytics, Skills Analytics,
 * Recruiter Pipeline) were silently truncating to an arbitrary first 1000
 * with no error — this affected real counts, not just a display limit.
 *
 * `makeQuery` must build the query fresh each call (with all filters already
 * applied) and end with `.range(start, end)` — Supabase query builders are
 * single-use, so the same instance can't be re-awaited across pages.
 */
export async function fetchAllRows<T>(makeQuery: (start: number, end: number) => PromiseLike<{ data: unknown }>): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;

  while (true) {
    const { data } = await makeQuery(offset, offset + PAGE_SIZE - 1);
    const page = (data as T[] | null) ?? [];
    all.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return all;
}
