"""Prepare the EdgeOne Git snapshot from one exported, already published guide version."""

import argparse
import json
from pathlib import Path
import re


BLOCK_ID = re.compile(r'(?<![A-Za-z0-9])doxc[A-Za-z0-9]{14,}(?![A-Za-z0-9])')
TEAM_ID = re.compile(r'(?<![\da-f])[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}(?![\da-f])', re.I)
PRIVATE_URL = re.compile(r'https?://[^\s/"<>]*(?:feishu\.cn|larksuite\.com|chatgpt\.site|chatgpt-team\.site)(?::\d+)?(?:/[^\s"<>]*)?', re.I)
PRIVATE_TEXT = re.compile(
    r'\bappg(?:prj|dep|ver)_[a-z0-9]+\b|[a-z]:[\\/](?:users|codex)[\\/]|'
    r'-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{32,}|'
    r'\bgithub_pat_[A-Za-z0-9_]{55,}|\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|'
    r'\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}|'
    r'\b[A-Za-z0-9_.+-]+@(?:gmail\.com|qq\.com|163\.com|outlook\.com)\b',
    re.I,
)


def clean_blocks(blocks, generated):
    for block in blocks:
        if block['id'] in generated:
            continue
        if block['type'] == 'image':
            raise ValueError('Reviewed assets are required for authored guide images; generated board pictures are rebuilt from the boards.')
        block.pop('imageToken', None)
        if 'children' in block:
            block['children'] = list(clean_blocks(block['children'], generated))
        yield block


def redact_links(value):
    if isinstance(value, dict):
        return {
            key: redact_links(child)
            for key, child in value.items()
            if key != 'mention_doc' and not (
                key == 'link' and isinstance(child, dict)
                and PRIVATE_URL.search(str(child.get('url', '')))
            )
        }
    if isinstance(value, list):
        return [redact_links(item) for item in value]
    return PRIVATE_URL.sub('', value) if isinstance(value, str) else value


def remap_ids(snapshot, aliases):
    for pattern, key, template in (
        (BLOCK_ID, 'blocks', 'sample-block-{:04d}'),
        (TEAM_ID, 'teams', '00000000-0000-4000-8000-{:012d}'),
    ):
        mapping = aliases[key]
        for private_id in sorted(set(pattern.findall(snapshot)) - mapping.keys()):
            # Use the same alias sequence as the public source import.
            mapping[private_id] = template.format(len(mapping) + 1)
        snapshot = pattern.sub(lambda match: mapping[match[0]], snapshot)
    return snapshot


def public_snapshot(live, aliases):
    fields = ('id', 'title', 'revision', 'syncedAt', 'publishedAt', 'sections', 'season')
    if not isinstance(live, dict) or not all(key in live for key in fields) or not live['sections']:
        raise ValueError('Expected one nonempty published snapshot, not a draft or API envelope.')
    snapshot = {key: live[key] for key in fields}
    snapshot.update(media=[], warnings=[])
    for key in ('boardLayouts', 'boardEdits'):
        if live.get(key):
            snapshot[key] = live[key]
    for section in snapshot['sections']:
        regions = section.pop('generatedRegions', {})
        section.pop('sourceHeadingIds', None)
        generated = {region[key] for region in regions.values() for key in ('textId', 'imageId')}
        section['blocks'] = list(clean_blocks(section['blocks'], generated))
    serialized = json.dumps(redact_links(snapshot), ensure_ascii=False, separators=(',', ':'))
    if PRIVATE_TEXT.search(serialized):
        raise ValueError('Review possible sensitive content in the published snapshot before releasing.')
    remapped = json.loads(remap_ids(serialized, aliases))
    for record in remapped.get('boardLayouts', []):
        for key in ('source', 'layout'):
            record[key]['pieces'].sort(key=lambda piece: piece['instanceId'])
    return json.dumps(remapped, ensure_ascii=False, separators=(',', ':')) + '\n'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--published', type=Path, required=True)
    parser.add_argument('--aliases', type=Path, required=True,
                        help='Existing private ID map outside the checkout. Do not commit the source snapshot or map.')
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    live = json.loads(args.published.read_text(encoding='utf-8'))
    aliases = json.loads(args.aliases.read_text(encoding='utf-8'))
    output = public_snapshot(live, aliases)
    args.out.write_text(output, encoding='utf-8', newline='\n')
    args.aliases.write_text(json.dumps(aliases, indent=2) + '\n', encoding='utf-8', newline='\n')
    print(f"Prepared {len(live['sections'])} published sections for EdgeOne.")


if __name__ == '__main__':
    main()
