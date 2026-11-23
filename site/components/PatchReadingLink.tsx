"use client";

import type { ComponentProps, SyntheticEvent } from "react";

export function PatchReadingLink({ href, ...props }: ComponentProps<"a"> & { href: string }) {
  function preserveFilters(event: SyntheticEvent<HTMLAnchorElement>) {
    const current = new URL(window.location.href);
    const target = new URL(href, current.origin);
    const from = target.searchParams.get("from");
    const filterTarget = from ? new URL(from, current.origin) : target;
    if (filterTarget.origin !== current.origin || filterTarget.pathname !== "/updates") return;

    for (const key of ["q", "category"]) {
      const value = current.searchParams.get(key);
      if (value) filterTarget.searchParams.set(key, value);
      else filterTarget.searchParams.delete(key);
    }
    if (from) target.searchParams.set("from", filterTarget.pathname + filterTarget.search + filterTarget.hash);
    event.currentTarget.href = target.href;
  }
  return <a {...props} href={href} onClick={preserveFilters} onPointerDown={preserveFilters} onContextMenu={preserveFilters} />;
}
