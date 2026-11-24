"""The verified MetaTFT interval for the site's active S19 PBE build."""
import json
import re
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


def current_window(data):
    active = json.loads((data / "current-patch.json").read_text(encoding="utf-8"))
    patch = active.get("metaTftPatch") or {}
    version, subpatch = patch.get("patch", ""), patch.get("bPatch", "")
    if (active.get("seasonId") != "s19-pbe" or not str(active.get("build", "")).isdigit()
            or not re.fullmatch(r"19\.\d+", version) or not re.fullmatch("[a-z]", subpatch)
            or not re.search(r"\b" + re.escape(version + subpatch) + r"\b", active["label"])):
        raise ValueError("Set the verified current-patch.json build and MetaTFT subpatch before collecting")
    return active["build"], {"queue": "PBE", "patch": version, "b_patch": subpatch, "days": "3"}


def scoped_url(url, window):
    parts = urlsplit(url)
    filters = [(k, v) for k, v in parse_qsl(parts.query) if k not in window]
    return urlunsplit(parts._replace(query=urlencode([*filters, *window.items()])))
