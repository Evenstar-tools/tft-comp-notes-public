import { feishuBoardIssue, isBoardCaption, isBoardScratchTitle, sameGeneratedSection } from "@/domain/document-flow";
import { mixedForms } from "@/domain/team";
import type { Team } from "@/domain/types";
import { matchesImageRatio, type PngSize } from "./png-size";
import { ApiError, database, setting, setSetting } from "./access";
import {
  blockText,
  cacheMedia,
  documentId,
  feishu,
  readDocument,
  storedPosterSize,
  textElements,
} from "./feishu";

interface Binding {
  sectionId: string;
  textId: string;
  imageId: string;
  expectedText: string;
  imageToken: string;
  imageSize?: PngSize;
  team?: Team;
}
interface Pending {
  clientToken: string;
  text: string;
  sectionId: string;
  textId?: string;
  imageId?: string;
  imageToken?: string;
  imageSize?: PngSize;
  insert?: { parentId: string; index: number; revision: number };
  updateToken?: string;
}
export async function writeTeam(team: Team, sectionId: string, image: Blob, size: PngSize) {
  const issue = feishuBoardIssue(team);
  if (issue) throw new ApiError(400, issue);
  if (mixedForms(team.pieces)) throw new ApiError(400, "请先为阿卡丽选择一种形态并保存");
  const now = Date.now();
  const lockId = crypto.randomUUID();
  const lock = await database()
    .prepare(
      "INSERT INTO settings(key,value) VALUES('feishu_lock',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE CAST(json_extract(settings.value,'$.expires') AS INTEGER)<?",
    )
    .bind(JSON.stringify({ id: lockId, expires: now + 180000 }), now)
    .run();
  if (!lock.meta.changes)
    throw new ApiError(409, "另一项飞书操作正在进行，请稍后重试");
  const jobId = `write:${team.id}:${team.revision}`;
  const caption = team.name.trim().replace(/\s+/g, " ");
  try {
    const doc = await readDocument();
    const section = doc.blocks.find(
      (block) =>
        block.block_id === sectionId && [3, 4, 5].includes(block.block_type),
    );
    if (!section)
      throw new ApiError(409, "绑定章节已删除或类型变化，请选择现有标题");
    if (isBoardScratchTitle(blockText(section))) throw new ApiError(400, "请选择正式阵容标题");
    const bindingText = await setting(`binding:${team.id}`);
    let binding: Binding | null = bindingText ? JSON.parse(bindingText) : null;
    if (binding && !sameGeneratedSection(doc.blocks, documentId(), sectionId, binding.textId, binding.imageId))
      throw new ApiError(409, "两块生成图文与所选章节不一致。请在飞书确认位置，再选择图文当前所在的章节");
    if (binding && sectionId !== binding.sectionId && section.block_type !== 4)
      throw new ApiError(409, "移动图文后，请选择当前所在的二级阵容标题");
    const previousJob = await database()
      .prepare("SELECT status,detail FROM sync_jobs WHERE id=?")
      .bind(jobId)
      .first<{ status: string; detail: string }>();
    const pending: Pending = previousJob && previousJob.status !== "success"
      ? JSON.parse(previousJob.detail)
      : { clientToken: crypto.randomUUID(), text: caption, sectionId };
    if (pending.sectionId !== sectionId && !binding)
      throw new ApiError(409, "上次写入尚未完成，请先选择原阵容标题继续核验");
    // Site corrections can change the reference board without changing the author's revision.
    const storedPieces = binding?.team?.pieces;
    const sameStars = storedPieces?.length === team.pieces.length && team.pieces.every(piece =>
      storedPieces.some(stored => stored.instanceId === piece.instanceId && stored.stars === piece.stars));
    if (previousJob?.status === "success" && binding && binding.sectionId === sectionId && sameStars) {
      const actualText = blockText(doc.blocks.find(block => block.block_id === binding!.textId));
      const actualImage = doc.blocks.find(block => block.block_id === binding!.imageId)?.image;
      const actualToken = actualImage?.token;
      if (actualToken && actualToken === binding.imageToken && isBoardCaption(actualText, binding.expectedText, team.id)) {
        const originalSize = binding.imageSize ?? await storedPosterSize(actualToken);
        pending.imageToken = actualToken;
        pending.imageSize = originalSize;
        if (actualText === caption && matchesImageRatio(actualImage, originalSize)) {
          if (binding.expectedText !== caption || !binding.imageSize) await setSetting(`binding:${team.id}`,
            JSON.stringify({ ...binding, expectedText: caption, imageSize: pending.imageSize }));
          return { url: `https://my.feishu.cn/docx/${documentId()}`, unchanged: true };
        }
      }
    }
    const saveJob = async (status: string) => {
      await database()
        .prepare(
          "INSERT INTO sync_jobs(id,kind,status,detail,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,detail=excluded.detail,updated_at=excluded.updated_at",
        )
        .bind(
          jobId,
          "writeback",
          status,
          JSON.stringify(pending),
          new Date().toISOString(),
        )
        .run();
    };
    // Before captions, the visible marker identified interrupted insertions.
    // Caption-only insertions instead replay the original idempotent create request.
    if (!binding) {
      const marked = doc.blocks.filter((block) =>
        blockText(block).startsWith(`【阵容构建器 · ${team.id}】`),
      );
      if (marked.length) {
        const textBlock = marked[0];
        const parent = doc.blocks.find(
          (block) => block.block_id === textBlock.parent_id,
        );
        const siblings: string[] = parent?.children ?? [];
        const textIndex = siblings.indexOf(textBlock.block_id);
        const imageBlock = doc.blocks.find(
          (block) => block.block_id === siblings[textIndex + 1],
        );
        const precedingHeading = siblings
          .slice(0, textIndex)
          .reverse()
          .find((id) =>
            doc.blocks.some(
              (block) =>
                block.block_id === id && [3, 4, 5].includes(block.block_type),
            ),
          );
        if (
          marked.length !== 1 ||
          blockText(textBlock) !== pending.text ||
          imageBlock?.block_type !== 27 ||
          precedingHeading !== sectionId
        )
          throw new ApiError(
            409,
            "发现尚未完成绑定的生成区域，请保留原文并检查章节后重试；已停止重复插入",
          );
        binding = {
          sectionId,
          textId: textBlock.block_id,
          imageId: imageBlock.block_id,
          expectedText: pending.text,
          imageToken: imageBlock.image?.token ?? "",
        };
        await setSetting(`binding:${team.id}`, JSON.stringify(binding));
      }
    }
    // Recover an existing generated region before applying the new-heading rule.
    if (!binding && section.block_type !== 4)
      throw new ApiError(400, "新阵容请选择二级阵容标题；先在飞书建立标题，再重新读取章节");
    if (binding) {
      const actualText = doc.blocks.find(
        (block) => block.block_id === binding!.textId,
      );
      const actualImage = doc.blocks.find(
        (block) => block.block_id === binding!.imageId,
      );
      const actualCaption = blockText(actualText);
      const matchesPending = !!pending.imageToken && actualImage?.image?.token === pending.imageToken &&
        (actualCaption === caption || actualCaption === pending.text);
      if (
        !matchesPending &&
        (!isBoardCaption(actualCaption, binding.expectedText, team.id) ||
          (actualImage?.image?.token ?? "") !== binding.imageToken)
      )
        throw new ApiError(
          409,
          "生成区域在飞书中被修改或删除。为保留修改，已停止覆盖；可复制为新阵容后重新写入。",
        );
      pending.textId = binding.textId;
      pending.imageId = binding.imageId;
    }
    if (!pending.textId || !pending.imageId) {
      const parentId = section.parent_id ?? documentId();
      const parent = doc.blocks.find((block) => block.block_id === parentId);
      const index = parent?.children?.indexOf(sectionId) ?? -1;
      if (index < 0)
        throw new ApiError(409, "无法定位章节插入位置，请重新同步");
      const retrying = !!pending.insert;
      const insert = pending.insert ?? { parentId, index: index + 1, revision: doc.revision_id };
      pending.insert = insert;
      await saveJob("running");
      const created = await feishu(
        `/docx/v1/documents/${documentId()}/blocks/${insert.parentId}/children?document_revision_id=${insert.revision}&client_token=${pending.clientToken}`,
        {
          method: "POST",
          body: JSON.stringify({
            index: insert.index,
            children: [
              { block_type: 2, text: { elements: textElements(pending.text) } },
              { block_type: 27, image: {} },
            ],
          }),
        },
      ).catch(async (error: unknown) => {
        // A confirmed revision rejection on the first attempt did not insert blocks.
        // An uncertain retry keeps the original request and token.
        if (!retrying && error instanceof ApiError && error.status === 409) {
          delete pending.insert;
          pending.clientToken = crypto.randomUUID();
          await saveJob("failed");
        }
        throw error;
      });
      pending.textId = created.children[0].block_id;
      pending.imageId = created.children[1].block_id;
      binding = {
        sectionId,
        textId: pending.textId!,
        imageId: pending.imageId!,
        expectedText: pending.text,
        imageToken: "",
      };
      await setSetting(`binding:${team.id}`, JSON.stringify(binding));
    }
    await saveJob("running");
    // Older interrupted uploads have no dimensions. If not applied yet, replace
    // that upload so the pixel dimensions always belong to the token being used.
    const attachedToken = doc.blocks.find(block => block.block_id === pending.imageId)?.image?.token;
    if (pending.imageToken && !pending.imageSize && attachedToken === pending.imageToken) {
      pending.imageSize = await storedPosterSize(pending.imageToken);
      delete pending.updateToken;
    } else if (!pending.imageToken || !pending.imageSize) {
      const form = new FormData();
      form.set("file_name", `${team.id}.png`);
      form.set("parent_type", "docx_image");
      form.set("parent_node", pending.imageId!);
      form.set("size", String(image.size));
      form.set("file", image, `${team.id}.png`);
      pending.imageToken = (
        await feishu("/drive/v1/medias/upload_all", {
          method: "POST",
          body: form,
        })
      ).file_token;
      pending.imageSize = size;
      delete pending.updateToken;
      await saveJob("running");
    }
    const latest = await readDocument();
    if (!sameGeneratedSection(latest.blocks, documentId(), sectionId, pending.textId!, pending.imageId!)) throw new ApiError(409, "生成图文所属章节已变化，请重新选择后写回");
    const currentText = latest.blocks.find(
      (block) => block.block_id === pending.textId,
    );
    const currentImage = latest.blocks.find(
      (block) => block.block_id === pending.imageId,
    );
    const currentCaption = blockText(currentText);
    const currentToken = currentImage?.image?.token ?? "";
    const sizeMismatch = !matchesImageRatio(currentImage?.image, pending.imageSize);
    const replaceImage = currentToken !== pending.imageToken || sizeMismatch;
    if (currentCaption !== caption || replaceImage) {
      if (
        (!isBoardCaption(currentCaption, binding!.expectedText, team.id) || currentToken !== binding!.imageToken) &&
        (currentCaption !== pending.text || currentToken !== pending.imageToken)
      )
        throw new ApiError(409, "上传期间生成区域被修改，已停止覆盖");
      // The token may already be attached by a previous attempt while the old
      // image box is still present. This repair has a different request body.
      if (currentToken === pending.imageToken && sizeMismatch) pending.updateToken = undefined;
      pending.updateToken ??= crypto.randomUUID();
      await saveJob("running");
      await feishu(
        `/docx/v1/documents/${documentId()}/blocks/batch_update?document_revision_id=${latest.revision_id}&client_token=${pending.updateToken}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            requests: [
              ...(currentCaption === caption ? [] : [{
                block_id: pending.textId,
                update_text_elements: { elements: textElements(caption) },
              }]),
              ...(!replaceImage ? [] : [{
                block_id: pending.imageId,
                replace_image: { token: pending.imageToken, ...pending.imageSize, align: currentImage?.image?.align ?? 1 },
              }]),
            ],
          }),
        },
      );
    }
    const readback = await readDocument();
    if (!sameGeneratedSection(readback.blocks, documentId(), sectionId, pending.textId!, pending.imageId!)) throw new ApiError(409, "读回时图文已被移动，请重新同步");
    const savedImage = readback.blocks.find(block => block.block_id === pending.imageId)?.image;
    if (
      blockText(
        readback.blocks.find((block) => block.block_id === pending.textId),
      ) !== caption ||
      savedImage?.token !== pending.imageToken ||
      !matchesImageRatio(savedImage, pending.imageSize)
    )
      throw new ApiError(502, "飞书写回后核验未通过，请重试以继续核验");
    await cacheMedia(pending.imageToken!);
    await setSetting(
      `binding:${team.id}`,
      JSON.stringify({
        sectionId,
        textId: pending.textId,
        imageId: pending.imageId,
        expectedText: caption,
        imageToken: pending.imageToken,
        imageSize: pending.imageSize,
        team,
      }),
    );
    await saveJob("success");
    return {
      url: `https://my.feishu.cn/docx/${documentId()}`,
      revision: readback.revision_id,
    };
  } catch (error) {
    await database()
      .prepare(
        "UPDATE sync_jobs SET status='failed',updated_at=? WHERE id=? AND status<>'success'",
      )
      .bind(new Date().toISOString(), jobId)
      .run();
    throw error;
  } finally {
    await database()
      .prepare(
        "DELETE FROM settings WHERE key='feishu_lock' AND json_extract(value,'$.id')=?",
      )
      .bind(lockId)
      .run();
  }
}
