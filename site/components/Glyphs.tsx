"use client";
import { STAR_PATH } from "@/domain/board-layout";
import type { Trait } from "@/domain/types";

/** 星级：金色实心星，1–3 颗。 */
export function Stars({
  count,
  size = 12,
  className = "",
}: {
  count: number;
  size?: number;
  className?: string;
}) {
  return (
    <span className={`stars ${className}`} aria-label={`${count} 星`}>
      {Array.from({ length: count }, (_, index) => (
        <svg
          key={index}
          width={size}
          height={size}
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path d={STAR_PATH} fill="currentColor" />
        </svg>
      ))}
    </span>
  );
}

/** 羁绊徽记：六边形底 + 白色单色图标；没有图标时用名字首字。 */
export function TraitBadge({
  trait,
  size = 22,
  tone = "neutral",
}: {
  trait?: Pick<Trait, "name" | "image">;
  size?: number;
  tone?: "neutral" | "active" | "top" | "dim";
}) {
  return (
    <span
      className={`trait-badge tone-${tone}`}
      style={{ width: size, height: size * 1.1547 }}
      aria-hidden
    >
      {trait?.image ? (
        <img
          src={trait.image}
          alt=""
          width={Math.round(size * 0.62)}
          height={Math.round(size * 0.62)}
          draggable={false}
        decoding="async" />
      ) : (
        <span style={{ fontSize: Math.max(12, Math.round(size * 0.45)) }}>
          {trait?.name.slice(0, 1) ?? "?"}
        </span>
      )}
    </span>
  );
}

/** 页首与浏览器标签共用同一枚站标。 */
export function BrandMark({ size = 42, src = "/favicon.svg" }: { size?: number; src?: string }) {
  return <img className="brand-mark" src={src} alt="" width={size} height={size} draggable={false} />;
}
