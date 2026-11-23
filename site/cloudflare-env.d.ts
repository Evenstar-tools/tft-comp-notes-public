declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    ALLOW_OWNER_SETUP?: string;
    FEISHU_APP_ID?: string;
    FEISHU_APP_SECRET?: string;
    FEISHU_DOCUMENT_ID?: string;
  }
}
