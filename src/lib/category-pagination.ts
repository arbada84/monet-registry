export const CATEGORY_PAGE_SIZE = 20;
export const CATEGORY_MAX_PAGE = 10_000;

export interface CategoryPaginationState {
  page: number;
  hasNext: boolean;
}

export function parseCategoryPage(value: string | string[] | undefined): number | null {
  if (value === undefined) return 1;
  if (typeof value !== "string" || !/^[1-9]\d{0,4}$/.test(value)) return null;
  const page = Number(value);
  return page <= CATEGORY_MAX_PAGE ? page : null;
}

export function categoryPageBounds(page: number) {
  if (!Number.isInteger(page) || page < 1 || page > CATEGORY_MAX_PAGE) {
    throw new RangeError("Invalid category page");
  }
  return { limit: CATEGORY_PAGE_SIZE + 1, offset: (page - 1) * CATEGORY_PAGE_SIZE };
}

export function categoryPageHref(category: string, page: number): string {
  categoryPageBounds(page);
  const path = `/category/${encodeURIComponent(category)}`;
  return page === 1 ? path : `${path}?page=${page}`;
}

export function categoryPageResult<T>(rows: T[], page: number) {
  categoryPageBounds(page);
  return {
    articles: rows.slice(0, CATEGORY_PAGE_SIZE),
    page,
    hasNext: page < CATEGORY_MAX_PAGE && rows.length > CATEGORY_PAGE_SIZE,
  };
}
