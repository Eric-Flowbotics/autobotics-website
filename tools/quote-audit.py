#!/usr/bin/env python3
"""
Quote attribution audit.

Guards against the two failure modes found on 2026-07-25:

  CHECK 1 — ATTRIBUTED QUOTES.
    Any quotation attributed to Eric. Each one must be verbatim from a saved
    transcript. No recording, no quote. This check finds them; a human (or the
    transcript diff) confirms them. Attribution is caught in every form seen in
    the wild, not just the one the original audit grepped for.

  CHECK 2 — SPEAKER-LESS QUOTATIONS.   <-- the gap that hid field-reports/hvac.html
    A quotation-marked sentence with NO speaker, on a page that carries a byline.
    Check 1 cannot see these: there is no "— Eric" to match. But a reader — and an
    LLM scraping the page — resolves the speaker from the byline. That is
    attribution by proximity, and it is the same defect wearing no marker.

Usage:
    python3 tools/quote-audit.py                     # audit the site repo
    python3 tools/quote-audit.py PATH [PATH ...]     # audit specific files/dirs
    python3 tools/quote-audit.py --vault             # also audit the vault articles

Exit code 1 if any finding, so it can gate a deploy.
"""

import os
import re
import sys
import glob

VAULT_ARTICLES = os.path.expanduser(
    "~/Obsidian/Autobotics/Autobotics/03 Content Engine/Pipeline/Article — *.md"
)

# ---------------------------------------------------------------- check 1

# Every attribution form observed. The repo is uniform today (" — Eric", U+2014,
# first name only) but drift is exactly how the next one hides, so match broadly.
ATTRIBUTION = re.compile(
    r"""(
          [—–\-]{1,2}\s*Eric\b            # — Eric / – Eric / -- Eric / - Eric
        | &mdash;\s*Eric\b                # HTML entity form
        | \bEric\s+(?:says|said|puts\s+it|explains|notes)\b
        | \b(?:says|said|per|according\s+to)\s+Eric\b
        | <cite[^>]*>\s*Eric              # <cite>Eric</cite>
    )""",
    re.X | re.I,
)

# ---------------------------------------------------------------- check 2

# A quoted span holding at least one complete sentence. Deliberately requires
# terminal punctuation inside the quotes — that is what separates a QUOTED CLAIM
# ("The first business to answer wins the job.") from a quoted LABEL ("auto-text")
# or scare quotes ("everyone"), which are fine and must not be flagged.
QUOTED_SENTENCE = re.compile(r'["“]([^"”]{40,}?[.!?])["”]')

# If any of these sit on the line, the quote already HAS a speaker and is fine.
HAS_SPEAKER = re.compile(
    r"""(
          [—–\-]{1,2}\s*[<\w"“]                  # em-dash attribution (may open a tag)
        | &mdash;
        | \b\w[\w.\- ]{1,40}\s+
          (?:says|said|states|writes|reports|puts\s+it|found|adds|notes|
             confirms|explains|tells|announced)\b
        | \baccording\s+to\b
        | \bper\s+[A-Z]
        | \bin\s+\w+(?:'s)?\s+own\s+words\b      # "in Google's own words, ..."
        | \bI\s+(?:say|describe|call|put\s+it)\b # author quoting themselves, on record
        | \bin\s+(?:the\s+)?(?:video|walkthrough|transcript|interview|report|survey|doc)\b
        | <cite
        | <a\s+href                              # an inline citation link
    )""",
    re.X | re.I,
)

# Surfaces where quoted sentences are legitimate and not attribution at all.
EXEMPT_CLASS = re.compile(
    r'class="[^"]*\b(paste|prompt-text|prompt-plain|prompt-block)\b', re.I
)

BYLINE = re.compile(
    r"""(
          class="[^"]*\b(?:article-byline|report-byline)\b
        | \bby\s+Eric\s+Lenhardt\b
        | reviewed\s+by\s+Eric\s+Lenhardt
        | "author"\s*:\s*\{[^}]*Eric\s+Lenhardt
        | ^author:\s*Eric\s+Lenhardt
    )""",
    re.X | re.I | re.M,
)

SKIP_DIRS = {".git", "node_modules", "design"}

# Attribute values are delimited by the same double quotes as prose, so
# <meta content="How do you follow up on a quote?"> looks exactly like a quoted
# sentence until the tags come off. Check 2 runs on text content only.
TAG = re.compile(r"<[^>]+>")
HEAD_OR_SCRIPT = re.compile(
    r"<head\b.*?</head>|<script\b.*?</script>|<style\b.*?</style>", re.S | re.I
)


def text_content(line):
    """Strip tags so only rendered prose remains."""
    return TAG.sub(" ", line)


def iter_files(paths):
    for p in paths:
        if os.path.isfile(p):
            yield p
        for root, dirs, files in os.walk(p):
            dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
            for fn in sorted(files):
                if fn.endswith((".html", ".md")):
                    yield os.path.join(root, fn)


def audit(path):
    try:
        text = open(path, encoding="utf-8").read()
    except (UnicodeDecodeError, OSError):
        return [], []

    has_byline = bool(BYLINE.search(text))
    attributed, speakerless = [], []

    # Blank out <head>, <script> and <style> so their contents cannot be read as
    # prose, while keeping line numbering identical to the file on disk.
    body = HEAD_OR_SCRIPT.sub(lambda m: re.sub(r"[^\n]", " ", m.group(0)), text)

    for n, (line, body_line) in enumerate(zip(text.split("\n"), body.split("\n")), 1):
        if EXEMPT_CLASS.search(line):
            continue

        if ATTRIBUTION.search(line):
            # A signature closing a first-person letter is not a quotation.
            if re.search(r'class="[^"]*\b(yi-sign|signoff|footer)\b', line, re.I):
                continue
            if '"' in line or "“" in line or "<blockquote" in line:
                attributed.append((n, line.strip()[:150]))

        # Check 2 only makes sense where a byline supplies an implied speaker.
        # HAS_SPEAKER reads the raw line (it looks for <cite> and <a href>);
        # QUOTED_SENTENCE reads text content only, so attribute values are invisible.
        if has_byline and not HAS_SPEAKER.search(line):
            for m in QUOTED_SENTENCE.finditer(text_content(body_line)):
                speakerless.append((n, m.group(1)[:120]))

    return attributed, speakerless


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    paths = args or ["."]
    if "--vault" in sys.argv:
        paths = list(paths) + sorted(glob.glob(VAULT_ARTICLES))

    n_attr = n_spk = 0
    for path in iter_files(paths):
        attributed, speakerless = audit(path)
        if not attributed and not speakerless:
            continue
        print(f"\n{path}")
        for n, snip in attributed:
            n_attr += 1
            print(f"  ATTRIBUTED    :{n}  {snip}")
            print("                 -> must be verbatim from a saved transcript.")
        for n, snip in speakerless:
            n_spk += 1
            print(f"  SPEAKER-LESS  :{n}  \"{snip}\"")
            print("                 -> quoted sentence, no speaker, bylined page:")
            print("                    reads as an Eric quote. Drop the quote marks")
            print("                    or attribute it to its real source.")

    print(f"\n{'=' * 62}")
    print(f"  {n_attr} attributed quote(s) — each needs a transcript line.")
    print(f"  {n_spk} speaker-less quotation(s) on bylined pages.")
    print(f"{'=' * 62}")
    return 1 if (n_attr or n_spk) else 0


if __name__ == "__main__":
    sys.exit(main())
