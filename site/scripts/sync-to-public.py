"""Single-source bidirectional sync between GPTsite and Public (EdgeOne) checkouts.

Eliminates manual patch porting and hand-editing private/public IDs by:
1. Syncing shared business/UI/data/asset directories from one source checkout to another.
2. Strictly protecting the thin platform-adapter boundary (auth, DB/R2, build configs).
3. Automatically remapping Feishu block IDs and team UUIDs via the private alias map.
4. Enforcing fail-closed leak checks (private URLs, tokens, local paths) in gpt-to-public mode.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import sys

BLOCK_ID = re.compile(r"(?<![A-Za-z0-9])doxc[A-Za-z0-9]{14,}(?![A-Za-z0-9])")
TEAM_ID = re.compile(
    r"(?<![\da-f])[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}(?![\da-f])",
    re.I,
)
PUBLIC_BLOCK_ID = re.compile(r"(?<![A-Za-z0-9])sample-block-\d{4}(?![A-Za-z0-9])")
PUBLIC_TEAM_ID = re.compile(r"(?<![\da-f])00000000-0000-4000-8000-\d{12}(?![\da-f])", re.I)

PRIVATE_URL = re.compile(
    r'https?://[^\s/"<>]*(?:feishu\.cn|larksuite\.com|chatgpt\.site|chatgpt-team\.site)(?::\d+)?(?:/[^\s"<>]*)?',
    re.I,
)
PRIVATE_TEXT = re.compile(
    r"\bappg(?:prj|dep|ver)_[a-z0-9]+\b|[a-z]:[\\/](?:users|codex)[\\/]|"
    r"-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{32,}|"
    r"\bgithub_pat_[A-Za-z0-9_]{55,}|\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|"
    r"\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}|"
    r"\b[A-Za-z0-9_.+-]+@(?:gmail\.com|qq\.com|163\.com|outlook\.com)\b",
    re.I,
)

# Shared top-level directories inside site/ that belong to single-source maintenance.
DEFAULT_SHARED_DIRS = (
    "app",
    "components",
    "data",
    "domain",
    "hooks",
    "lib",
    "public",
    "scripts",
    "server",
    "tests",
)

# Thin platform-adapter files that differ intentionally between GPTsite (Cloudflare/Vinext)
# and Public/EdgeOne (Next.js standalone) and must never overwrite each other.
PLATFORM_ADAPTER_PATHS = frozenset({
    "app/chatgpt-auth.ts",
    "app/layout.tsx",
    "app/owner-login.css",
    "app/api/document/open/route.ts",
    "app/api/media/[token]/route.ts",
    "app/api/session/route.ts",
    "app/api/writeback/route.ts",
    "components/OwnerGate.tsx",
    "components/OwnerSession.tsx",
    "components/player-team-storage.ts",
    "data/public-preview.json",
    "domain/links.ts",
    "server/access.ts",
    "server/feishu.ts",
    "server/owner-session.ts",
    "server/runtime-db.ts",
    "server/runtime-media.ts",
})

# Path prefixes ignored completely during sync.
IGNORED_PREFIXES = (
    ".next/",
    ".vinext/",
    ".wrangler/",
    ".sites-runtime/",
    "node_modules/",
    "dist/",
    "outputs/",
    "work/",
    "__pycache__/",
)

TEXT_SUFFIXES = frozenset({
    ".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs",
    ".json", ".css", ".md", ".py", ".yml", ".yaml", ".txt", ".svg",
})

# Scripts whose own regex patterns intentionally describe private/secret patterns.
LEAK_CHECK_EXEMPT_PATHS = frozenset({
    "scripts/prepare-public-snapshot.py",
    "scripts/sync-to-public.py",
    "scripts/verify-public-release.py",
    "tests/workflow-sync.test.mjs",
})


def is_ignored(rel_posix: str) -> bool:
    if rel_posix in PLATFORM_ADAPTER_PATHS:
        return True
    if any(rel_posix.startswith(prefix) or f"/{prefix}" in rel_posix for prefix in IGNORED_PREFIXES):
        return True
    if rel_posix.endswith(".pyc"):
        return True
    return False


def is_text_file(path: Path) -> bool:
    return path.suffix.lower() in TEXT_SUFFIXES


def build_reverse_aliases(aliases: dict) -> tuple[dict[str, str], dict[str, str]]:
    rev_blocks = {pub: priv for priv, pub in aliases.get("blocks", {}).items()}
    rev_teams = {pub.lower(): priv for priv, pub in aliases.get("teams", {}).items()}
    return rev_blocks, rev_teams


def transform_text(content: str, rel_posix: str, direction: str, aliases: dict | None) -> str:
    # Normalize CRLF -> LF so Windows/Linux checkouts never produce fake diffs.
    text = content.replace("\r\n", "\n")
    if aliases:
        if direction == "gpt-to-public":
            block_map = aliases.get("blocks", {})
            team_map = {k.lower(): v for k, v in aliases.get("teams", {}).items()}
            text = BLOCK_ID.sub(lambda m: block_map.get(m.group(0), m.group(0)), text)
            text = TEAM_ID.sub(lambda m: team_map.get(m.group(0).lower(), m.group(0)), text)
        else:
            rev_blocks, rev_teams = build_reverse_aliases(aliases)
            text = PUBLIC_BLOCK_ID.sub(lambda m: rev_blocks.get(m.group(0), m.group(0)), text)
            text = PUBLIC_TEAM_ID.sub(lambda m: rev_teams.get(m.group(0).lower(), m.group(0)), text)

    if direction == "gpt-to-public" and rel_posix not in LEAK_CHECK_EXEMPT_PATHS:
        leak = PRIVATE_TEXT.search(text) or PRIVATE_URL.search(text)
        if leak:
            raise ValueError(
                f"Refusing to sync sensitive content in {rel_posix}: matched {leak.group(0)!r}"
            )
        if aliases and BLOCK_ID.search(text):
            unmapped = sorted(set(BLOCK_ID.findall(text)))
            raise ValueError(
                f"Refusing to sync unmapped private Feishu block IDs in {rel_posix}: {', '.join(unmapped[:5])}"
            )
    return text


def file_digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def collect_files(root: Path, subdirs: tuple[str, ...]) -> dict[str, Path]:
    result: dict[str, Path] = {}
    for sub in subdirs:
        base = root / sub
        if not base.exists():
            continue
        for item in sorted(base.rglob("*")):
            if not item.is_file():
                continue
            rel = item.relative_to(root).as_posix()
            if is_ignored(rel):
                continue
            result[rel] = item
    return result


def sync_directories(
    source_root: Path,
    target_root: Path,
    direction: str,
    aliases: dict | None,
    subdirs: tuple[str, ...],
    delete_extra: bool,
    dry_run: bool,
) -> dict:
    src_files = collect_files(source_root, subdirs)
    dst_files = collect_files(target_root, subdirs)

    added: list[str] = []
    updated: list[str] = []
    unchanged = 0
    deleted: list[str] = []
    skipped_adapters = sorted(
        rel for rel in PLATFORM_ADAPTER_PATHS if (source_root / rel).exists() or (target_root / rel).exists()
    )

    for rel, src_path in src_files.items():
        dst_path = target_root / rel
        if is_text_file(src_path):
            raw_text = src_path.read_text(encoding="utf-8")
            out_bytes = transform_text(raw_text, rel, direction, aliases).encode("utf-8")
        else:
            out_bytes = src_path.read_bytes()

        if dst_path.exists():
            existing = dst_path.read_bytes()
            if is_text_file(dst_path):
                existing = existing.replace(b"\r\n", b"\n")
            if file_digest(existing) == file_digest(out_bytes):
                unchanged += 1
                continue
            updated.append(rel)
        else:
            added.append(rel)

        if not dry_run:
            dst_path.parent.mkdir(parents=True, exist_ok=True)
            dst_path.write_bytes(out_bytes)

    if delete_extra:
        for rel, dst_path in dst_files.items():
            if rel not in src_files:
                deleted.append(rel)
                if not dry_run:
                    dst_path.unlink()

    return {
        "direction": direction,
        "dryRun": dry_run,
        "added": added,
        "updated": updated,
        "unchanged": unchanged,
        "deleted": deleted,
        "protectedAdapters": len(skipped_adapters),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True, help="Source site/ directory")
    parser.add_argument("--target", type=Path, required=True, help="Target site/ directory")
    parser.add_argument(
        "--direction",
        choices=("gpt-to-public", "public-to-gpt"),
        default="gpt-to-public",
        help="Sync direction for ID mapping and leak checks",
    )
    parser.add_argument(
        "--aliases",
        type=Path,
        default=None,
        help="Optional private public-id-map.json for automatic bidirectional ID remapping",
    )
    parser.add_argument(
        "--only",
        action="append",
        dest="only",
        help="Restrict sync to one or more top-level site subdirectories (repeatable)",
    )
    parser.add_argument(
        "--delete",
        action="store_true",
        help="Delete files in target shared dirs that no longer exist in source",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview changes without modifying target files",
    )
    args = parser.parse_args()

    if not args.source.is_dir():
        raise SystemExit(f"Source directory not found: {args.source}")
    if not args.target.is_dir():
        raise SystemExit(f"Target directory not found: {args.target}")

    aliases = json.loads(args.aliases.read_text(encoding="utf-8")) if args.aliases else None
    subdirs = tuple(args.only) if args.only else DEFAULT_SHARED_DIRS

    summary = sync_directories(
        source_root=args.source.resolve(),
        target_root=args.target.resolve(),
        direction=args.direction,
        aliases=aliases,
        subdirs=subdirs,
        delete_extra=args.delete,
        dry_run=args.dry_run,
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ValueError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
