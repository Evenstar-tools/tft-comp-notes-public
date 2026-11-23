"""Convert an authorized, complete SQLite/SQL and R2 export into a private EdgeOne archive."""
import argparse
from contextlib import closing
import json
from pathlib import Path
import re
import shutil
import sqlite3
import tempfile

COLUMNS = {
    "settings": ("key", "value"),
    "snapshots": ("id", "body", "created_at"),
    "teams": ("id", "owner_id", "body", "revision", "updated_at"),
    "sync_jobs": ("id", "kind", "status", "detail", "updated_at"),
}
IMAGE_NAME = re.compile(r"[a-zA-Z0-9_-]{1,256}\Z")


def authorizer(action, first, second, database, trigger):
    if action in (sqlite3.SQLITE_ATTACH, sqlite3.SQLITE_DETACH):
        return sqlite3.SQLITE_DENY
    if action == sqlite3.SQLITE_FUNCTION and second and second.lower() in ("load_extension", "readfile", "writefile"):
        return sqlite3.SQLITE_DENY
    if action == sqlite3.SQLITE_PRAGMA and first.lower() not in ("foreign_keys", "defer_foreign_keys", "encoding"):
        return sqlite3.SQLITE_DENY
    return sqlite3.SQLITE_OK


def read_tables(path):
    if path.suffix.lower() == ".sql":
        db = sqlite3.connect(":memory:")
        try:
            db.set_authorizer(authorizer)
            db.executescript(path.read_text(encoding="utf-8-sig"))
        except Exception:
            db.close()
            raise RuntimeError("Unable to open the standalone SQLite SQL export.") from None
        finally:
            if db:
                try:
                    db.set_authorizer(None)
                except sqlite3.ProgrammingError:
                    pass
    else:
        db = sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True)
    with closing(db):
        db.row_factory = sqlite3.Row
        db.execute("BEGIN")
        result = {
            table: [dict(row) for row in db.execute("SELECT " +
                ",".join('"' + key + '"' for key in fields) + ' FROM "' + table + '"')]
            for table, fields in COLUMNS.items()
        }
    settings = {row["key"]: row["value"] for row in result["settings"]}
    if settings.get("edgeone_import_mode") == "public-only":
        raise RuntimeError("A public-only seed is not an original full backup.")
    return result


def image_type(path):
    with path.open("rb") as file:
        data = file.read(12)
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[4:8] == b"ftyp" and data[8:12] in (b"avif", b"avis"):
        return "image/avif"
    raise RuntimeError("A media object is not a supported raster image.")


def archive_media(root, out):
    if not root.is_dir() or root.is_symlink():
        raise RuntimeError("Provide the original R2 export's media directory.")
    destination = out / "media"
    destination.mkdir()
    manifest = []
    for path in sorted(root.iterdir()):
        if not path.is_file() or path.is_symlink() or not IMAGE_NAME.fullmatch(path.name):
            raise RuntimeError("The media export must contain original token filenames, without directories.")
        mime = image_type(path)
        target = destination / path.name
        shutil.copyfile(path, target)
        key = "media/" + path.name
        manifest.append({"key": key, "file": key, "contentType": mime})
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", required=True, type=Path, help="Complete original SQLite database file or SQL export")
    parser.add_argument("--media", required=True, type=Path, help="Original media/ directory with R2 objects named by token")
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    target = args.out.resolve()
    if target.exists():
        raise RuntimeError("Export requires a fresh destination directory.")
    target.parent.mkdir(parents=True, exist_ok=True)
    tables = read_tables(args.database)
    with tempfile.TemporaryDirectory(prefix=".edgeone-full-", dir=target.parent) as temporary:
        stage = Path(temporary) / "archive"
        stage.mkdir()
        manifest = archive_media(args.media, stage)
        archive = {"version": 1, "kind": "full", "tables": tables, "media": manifest}
        with (stage / "archive.json").open("w", encoding="utf-8") as stream:
            json.dump(archive, stream, ensure_ascii=False, separators=(",", ":"))
            stream.write("\n")
        stage.rename(target)
    print(json.dumps({"mode": "full", "tables": {key: len(value) for key, value in tables.items()}, "media": len(manifest)}))


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, sqlite3.Error, OSError) as error:
        raise SystemExit(str(error) if isinstance(error, RuntimeError) else "Unable to read the complete database or media export.") from None
