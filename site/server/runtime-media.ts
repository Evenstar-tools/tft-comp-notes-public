import { randomUUID } from "node:crypto";
import { mkdir, open, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { getStore } from "@edgeone/pages-blob";
import { AwsClient } from "aws4fetch";

type MediaRange = { offset: number; length: number };
type MediaObject = {
  body: ReadableStream<Uint8Array>;
  contentType: string;
  size?: number;
};

interface MediaStore {
  maxObjectBytes?: number;
  head(key: string): Promise<boolean>;
  get(key: string, range?: MediaRange): Promise<MediaObject | null>;
  put(key: string, bytes: ArrayBuffer, contentType: string): Promise<void>;
  signedReadUrl(key: string): Promise<string | null>;
}

let store: MediaStore | undefined;
const blobMaxObjectBytes = 4 * 1024 * 1024;

function verifyKey(key: string) {
  if (!/^media\/[a-zA-Z0-9_-]+$/.test(key)) throw new Error("图片标识无效");
}

function contentType(value: string | null) {
  return value?.split(";")[0].match(/^image\/(png|jpeg|gif|webp|avif)$/i)?.[0] ??
    "application/octet-stream";
}

function detectedContentType(bytes: Buffer) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (["GIF87a", "GIF89a"].includes(bytes.toString("ascii", 0, 6))) return "image/gif";
  if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (bytes.toString("ascii", 4, 8) === "ftyp" && ["avif", "avis"].includes(bytes.toString("ascii", 8, 12))) return "image/avif";
  return "application/octet-stream";
}

function missing(error: unknown) {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

function filesystemStore(directory: string): MediaStore {
  function file(key: string) {
    verifyKey(key);
    return join(directory, key);
  }
  return {
    async head(key) {
      try {
        return (await stat(file(key))).isFile();
      } catch (error) {
        if (missing(error)) return false;
        throw error;
      }
    },
    async get(key, range) {
      const handle = await open(file(key), "r").catch(error => {
        if (missing(error)) return null;
        throw error;
      });
      if (!handle) return null;
      try {
        const { size } = await handle.stat();
        const header = Buffer.alloc(12);
        await handle.read(header, 0, header.length, 0);
        const stream = handle.createReadStream(range
          ? { start: range.offset, end: range.offset + range.length - 1 }
          : {});
        return {
          body: Readable.toWeb(stream) as ReadableStream<Uint8Array>,
          contentType: detectedContentType(header),
          size,
        };
      } catch (error) {
        await handle.close();
        throw error;
      }
    },
    async put(key, bytes) {
      const destination = file(key);
      await mkdir(dirname(destination), { recursive: true });
      const temporary = destination + "." + randomUUID() + ".tmp";
      try {
        await writeFile(temporary, new Uint8Array(bytes), { flag: "wx" });
        await rename(temporary, destination);
      } finally {
        await rm(temporary, { force: true });
      }
    },
    async signedReadUrl() {
      return null;
    },
  };
}

function edgeOneBlobStore(name: string): MediaStore {
  const projectId = process.env.EDGEONE_BLOB_PROJECT_ID;
  const token = process.env.EDGEONE_BLOB_TOKEN;
  if ((projectId || token) && !(projectId && token))
    throw new Error("本机导入 Makers Blob 需要同时配置项目 ID 和 API Token");
  const blob = projectId && token ? getStore({ name, projectId, token }) : getStore(name);
  return {
    maxObjectBytes: blobMaxObjectBytes,
    async head(key) {
      verifyKey(key);
      return (await blob.getMetadata(key, { consistency: "strong" })) !== null;
    },
    async get(key, range) {
      verifyKey(key);
      const bytes = projectId
        ? await blob.get(key, { type: "arrayBuffer", consistency: "strong" })
        : await blob.get(key, { type: "arrayBuffer" }) ??
          await blob.get(key, { type: "arrayBuffer", consistency: "strong" });
      if (!bytes) return null;
      let type = detectedContentType(Buffer.from(bytes, 0, Math.min(bytes.byteLength, 12)));
      if (type === "application/octet-stream") {
        const metadata = await blob.getMetadata(key, { consistency: "strong" });
        type = contentType(metadata?.contentType ?? null);
      }
      const body = range ? bytes.slice(range.offset, range.offset + range.length) : bytes;
      return { body: new Blob([body]).stream(), contentType: type, size: bytes.byteLength };
    },
    async put(key, bytes, type) {
      verifyKey(key);
      if (bytes.byteLength > blobMaxObjectBytes) throw new RangeError("Makers Blob 单张图片最多 4 MiB");
      await blob.set(key, new Blob([bytes], { type: contentType(type) }));
    },
    async signedReadUrl() {
      return null;
    },
  };
}

function s3Store(endpoint: string): MediaStore {
  const root = new URL(endpoint);
  if (root.protocol !== "https:" || root.search || root.hash || root.username || root.password)
    throw new Error("图片存储须配置无凭据和查询参数的 S3 HTTPS 地址");
  const bucket = process.env.S3_BUCKET;
  const region = process.env.S3_REGION;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!bucket || !/^[a-z0-9][a-z0-9.-]+$/.test(bucket) || !region || !accessKeyId || !secretAccessKey)
    throw new Error("图片存储尚未配置 S3 容器、区域或访问凭据");
  const pathStyle = process.env.S3_PATH_STYLE !== "false";
  if (!pathStyle) root.hostname = bucket + "." + root.hostname;
  const prefix = root.pathname.replace(/\/$/, "") + (pathStyle ? "/" + bucket : "");
  const client = new AwsClient({
    accessKeyId,
    secretAccessKey,
    sessionToken: process.env.S3_SESSION_TOKEN,
    service: "s3",
    region,
    retries: 1,
  });

  function objectUrl(key: string) {
    verifyKey(key);
    const url = new URL(root);
    url.pathname = prefix + "/" + key;
    return url;
  }

  return {
    async head(key) {
      const response = await client.fetch(objectUrl(key), { method: "HEAD", signal: AbortSignal.timeout(15_000) });
      if (response.status === 404) return false;
      if (!response.ok) throw new Error("无法核验图片存储对象状态：" + response.status);
      return true;
    },
    async get(key, range) {
      const response = await client.fetch(objectUrl(key), {
        headers: range ? { Range: `bytes=${range.offset}-${range.offset + range.length - 1}` } : undefined,
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok || !response.body) {
        await response.body?.cancel();
        if (response.status === 404) return null;
        throw new Error("无法读取图片存储对象：" + response.status);
      }
      const length = response.headers.get("content-length");
      return {
        body: response.body,
        contentType: contentType(response.headers.get("content-type")),
        size: length === null ? undefined : Number(length),
      };
    },
    async put(key, bytes, type) {
      const response = await client.fetch(objectUrl(key), {
        method: "PUT",
        body: bytes,
        headers: { "Content-Type": contentType(type) },
        signal: AbortSignal.timeout(20_000),
      });
      await response.body?.cancel();
      if (!response.ok) throw new Error("无法写入图片存储对象：" + response.status);
    },
    async signedReadUrl(key) {
      const url = objectUrl(key);
      url.searchParams.set("X-Amz-Expires", "60");
      return (await client.sign(url, { method: "GET", aws: { signQuery: true } })).url;
    },
  };
}

export function mediaStore(): MediaStore {
  if (store) return store;
  if (process.env.S3_ENDPOINT) return store = s3Store(process.env.S3_ENDPOINT);
  if (process.env.EDGEONE_BLOB_STORE) return store = edgeOneBlobStore(process.env.EDGEONE_BLOB_STORE);
  if (process.env.MEDIA_DIRECTORY) return store = filesystemStore(process.env.MEDIA_DIRECTORY);
  throw new Error("图片存储尚未配置 EDGEONE_BLOB_STORE、S3_ENDPOINT 或本机 MEDIA_DIRECTORY");
}
