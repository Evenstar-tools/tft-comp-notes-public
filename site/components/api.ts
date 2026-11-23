export async function request<T = any>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok)
    throw new Error(
      (body as { error?: string }).error ?? `请求失败（${response.status}）`,
    );
  return body as T;
}
export const jsonPost = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
