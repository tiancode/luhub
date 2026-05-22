export type SearchParamsPromise = Promise<
  Record<string, string | string[] | undefined>
>;

/** 取查询参数的首个非空字符串值 */
export function pick(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.length > 0 ? s : undefined;
}
