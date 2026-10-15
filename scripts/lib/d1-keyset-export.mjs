export function quoteSqlIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

// Discover the actual primary key, including composite keys on policy tables.
export async function exportD1Keyset({ query, table, pageSize, maxRows = 0, delayMs = 0 }) {
  const info = await query(`PRAGMA table_info(${quoteSqlIdentifier(table)})`, []);
  const keys = info.filter((column) => column.pk > 0).sort((a, b) => a.pk - b.pk).map((column) => column.name);
  if (!keys.length) throw new Error(`D1 backup requires a stable primary key: ${table}`);
  const columns = keys.map(quoteSqlIdentifier);
  const tuple = columns.length === 1 ? columns[0] : `(${columns.join(', ')})`;
  const placeholders = columns.length === 1 ? '?' : `(${columns.map(() => '?').join(', ')})`;
  const rows = [];
  let cursor = null;
  while (true) {
    const limit = maxRows ? Math.min(pageSize, maxRows - rows.length) : pageSize;
    if (limit <= 0) break;
    const page = await query(
      `SELECT * FROM ${quoteSqlIdentifier(table)}${cursor ? ` WHERE ${tuple} > ${placeholders}` : ''} ORDER BY ${columns.join(', ')} LIMIT ?`,
      [...(cursor || []), limit],
    );
    rows.push(...page);
    if (page.length < limit || (maxRows && rows.length >= maxRows)) break;
    const next = keys.map((key) => page.at(-1)[key]);
    if (next.some((value) => value == null)) throw new Error(`Null primary key in D1 backup: ${table}`);
    if (JSON.stringify(next) === JSON.stringify(cursor)) throw new Error(`D1 backup cursor did not advance: ${table}`);
    cursor = next;
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return rows;
}
