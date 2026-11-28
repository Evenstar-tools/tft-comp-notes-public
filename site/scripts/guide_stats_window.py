"""The MetaTFT collection scope derived from current-patch.json."""
import json
import re
from dataclasses import dataclass
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

WINDOW_KEYS = {"queue", "patch", "b_patch", "days", "rank"}
RANKS = set("IRON BRONZE SILVER GOLD PLATINUM EMERALD DIAMOND MASTER GRANDMASTER CHALLENGER".split())


@dataclass(frozen=True)
class Cohort:
    number: int
    pbe: bool
    edition: str
    build: str
    effective_at: str
    window: dict

    @property
    def set_name(self):
        return f"TFTSet{self.number}"

    @property
    def queue(self):
        return "PBE" if self.pbe else "RANKED"

    @property
    def match_queue(self):
        return "1090" if self.pbe else "1100"

    @property
    def version(self):
        return self.window["patch"] + self.window["b_patch"]

    def lookup_url(self, locale):
        return f"https://data.metatft.com/lookups/{self.set_name}_{'pbe' if self.pbe else 'latest'}_{locale}.json"

    def verify_lookup(self, lookup, *, exact_pbe_build=False):
        metadata = lookup["_metadata"]
        release = metadata.get("release", "")
        version = re.match(r"rls-(\d+\.\d+)\.", release)
        pbe_metadata = str(metadata.get("patch", "")).lower() == "pbe"
        pbe_release = release.lower().endswith(".pbe")
        if (metadata.get("set") != self.set_name or (self.pbe and not pbe_metadata)
                or (not self.pbe and (pbe_metadata or pbe_release))
                or not version or version[1] != self.window["patch"]):
            raise ValueError("MetaTFT lookup does not match the active season and patch")
        if self.pbe and exact_pbe_build and not re.fullmatch(
            rf"rls-{re.escape(self.window['patch'])}\.\d+\.{re.escape(self.build)}\.Set{self.number}\.Shipping\.pbe",
            release,
        ):
            raise ValueError("MetaTFT PBE lookup does not match the active build")


def current_cohort(data):
    active = json.loads((data / "current-patch.json").read_text(encoding="utf-8-sig"))
    scope = re.fullmatch(r"s([1-9]\d*)-(pbe|live)", active.get("seasonId", ""))
    pbe = bool(scope and scope[2] == "pbe")
    patch = active.get("metaTftPatch") or {}
    version, subpatch = patch.get("patch", ""), patch.get("bPatch", None if pbe else "")
    build = active.get("build", "")
    if (not scope or not re.fullmatch(r"\d+", str(build)) or not re.fullmatch(r"\d+\.\d+", version)
            or not isinstance(subpatch, str) or not re.fullmatch("[a-z]?", subpatch)
            or (pbe and not re.search(r"\b" + re.escape(version + subpatch) + r"\b", active.get("label", "")))):
        raise ValueError("Set the verified current-patch.json season, build and MetaTFT patch before collecting")
    queues = {"PBE"} if pbe else {"RANKED", "RANKED_TFT", "1100"}
    if "queue" in active and str(active["queue"]).upper() not in queues:
        raise ValueError("current-patch.json season and queue differ")
    window = {"queue": "PBE" if pbe else "1100", "patch": version, "b_patch": subpatch, "days": "3"}
    if "tierFilter" in active:
        tiers = active["tierFilter"]
        ranks = {str(tier).strip().upper() for tier in (tiers if isinstance(tiers, list) else str(tiers).split(","))}
        if pbe or not ranks or not ranks <= RANKS:
            raise ValueError("tierFilter must contain valid ranked tiers")
        window["rank"] = ",".join(sorted(ranks))
    return Cohort(int(scope[1]), pbe, f"{scope[0]}-{version}", str(build), active["effectiveAt"], window)


def scoped_url(url, window):
    parts = urlsplit(url)
    filters = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True) if k not in WINDOW_KEYS and k not in window]
    return urlunsplit(parts._replace(query=urlencode([*filters, *window.items()])))
