import { env } from "cloudflare:workers";
import { ApiError } from "./access";
import { readPngSize } from "./png-size";

// Feishu payloads are retained so unsupported block types remain visible in preview.
export interface FeishuBlock {
  block_id: string;
  block_type: number;
  parent_id?: string;
  children?: string[];
  [key: string]: any;
}
let cachedToken: { value: string; expires: number } | undefined;
export function documentId() {
  if (!env.FEISHU_DOCUMENT_ID) throw new ApiError(503, "尚未配置 S19 编辑文档");
  return env.FEISHU_DOCUMENT_ID;
}
async function token() {
  if (cachedToken && cachedToken.expires > Date.now()) return cachedToken.value;
  if (!env.FEISHU_APP_ID || !env.FEISHU_APP_SECRET)
    throw new ApiError(503, "飞书应用尚未配置");
  const response = await fetch("https://accounts.feishu.cn/oauth/v3/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: env.FEISHU_APP_ID,
      client_secret: env.FEISHU_APP_SECRET,
    }),
  });
  const result = (await response.json()) as {
    code?: number;
    access_token?: string;
    expires_in?: number;
  };
  if (!response.ok || !result.access_token)
    throw new ApiError(
      502,
      `飞书应用认证失败（${result.code ?? response.status}）`,
    );
  cachedToken = {
    value: result.access_token,
    expires: Date.now() + ((result.expires_in ?? 0) - 120) * 1000,
  };
  return cachedToken.value;
}
export async function feishu(path: string, init: RequestInit = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(`https://open.feishu.cn/open-apis${path}`, {
      ...init,
      headers: {
        ...(init.body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
        Authorization: `Bearer ${await token()}`,
        ...init.headers,
      },
    });
    const result = (await response.json()) as {
      code: number;
      msg: string;
      data: any;
    };
    if ((response.status === 429 || result.code === 99991400) && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 700 * 2 ** attempt));
      continue;
    }
    if (!response.ok || result.code !== 0)
      throw new ApiError(
        result.code === 1770040 ? 409 : 502,
        `飞书操作失败（${result.code ?? response.status}）：${result.msg ?? "请检查连接"}`,
      );
    return result.data;
  }
  throw new ApiError(503, "飞书请求较多，请稍后重试");
}
export async function documentInfo() {
  return (await feishu(`/docx/v1/documents/${documentId()}`)).document as {
    revision_id: number;
    title: string;
  };
}
export async function readDocument() {
  const info = await documentInfo();
  const blocks: FeishuBlock[] = [];
  let page = "";
  do {
    const data = await feishu(
      `/docx/v1/documents/${documentId()}/blocks?page_size=500&document_revision_id=${info.revision_id}${page ? `&page_token=${encodeURIComponent(page)}` : ""}`,
    );
    blocks.push(...data.items);
    page = data.has_more ? data.page_token : "";
  } while (page);
  return { ...info, blocks };
}
export function blockText(block?: FeishuBlock): string {
  if (!block) return "";
  const body =
    block.text ??
    block[`heading${block.block_type - 2}`] ??
    block.bullet ??
    block.ordered ??
    block.quote ??
    block.code ??
    block.todo ??
    block.page;
  return (body?.elements ?? [])
    .map(
      (element: any) =>
        element.text_run?.content ?? element.mention_doc?.title ?? "",
    )
    .join("");
}
export function textElements(content: string) {
  return [{ text_run: { content } }];
}
export async function cacheMedia(fileToken: string) {
  if (!env.BUCKET) throw new ApiError(503, "图片存储尚未连接");
  if (await env.BUCKET.head(`media/${fileToken}`)) return;
  const response = await fetch(
    `https://open.feishu.cn/open-apis/drive/v1/medias/${encodeURIComponent(fileToken)}/download`,
    { headers: { Authorization: `Bearer ${await token()}` } },
  );
  const type = response.headers.get("content-type") ?? "";
  if (!response.ok || !/^image\/(png|jpeg|gif|webp|avif)/.test(type))
    throw new ApiError(
      502,
      "飞书图片下载失败或图片格式暂不支持，尚未生成可发布快照",
    );
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > 20 * 1024 * 1024)
    throw new ApiError(413, "文档图片超过 20 MB");
  await env.BUCKET.put(`media/${fileToken}`, bytes, {
    httpMetadata: { contentType: type },
  });
}

// For images written before dimensions were saved, read the original attached
// PNG. Today's rendered team can have a different layout for the same revision.
export async function storedPosterSize(fileToken: string) {
  await cacheMedia(fileToken);
  const object = await env.BUCKET!.get(`media/${fileToken}`, { range: { offset: 0, length: 24 } });
  const size = object && await readPngSize(new Blob([await object.arrayBuffer()]));
  if (!size) throw new ApiError(502, "无法核验飞书原图尺寸，请重新读取后再试");
  return size;
}
