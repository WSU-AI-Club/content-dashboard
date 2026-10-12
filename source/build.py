#!/usr/bin/env python3
"""
Builds public/index.html, the single page the Worker serves as the content desk.

Why a build step at all: the desk ships as ONE self-contained HTML file (no bundler, no npm
packages at runtime). This script stitches four sources into it:

  source/desk.html               the desk itself: layout, styles and all the app logic
  source/components/bundle.js    the brand templates (EventPost, SpeakerPost, ...) as React components
  source/components/bundle.css   how those templates look, for every format
  source/tokens.json             the brand colors, spacing and type, compiled to CSS variables
  source/logos/*.png             the club logo, inlined so exports never wait on a network request

Run it from anywhere:   python3 source/build.py
Then commit public/index.html. Cloudflare deploys whatever is committed on main.
"""
import base64
import json
import pathlib
import re

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE.parent / "public" / "index.html"


def css_variables(tokens, theme):
    """Turn tokens.json into CSS custom properties for one theme (light = Paper, dark = Ink)."""
    out = []
    for t in tokens["color"]["tokens"]:
        v = t["value"]
        # A token is either one value, or a {light, dark} pair.
        v = v if isinstance(v, str) else v.get(theme, v["light"])
        # "{brand-black}" style references become var(--brand-black).
        v = re.sub(r"^\{(.+)\}$", r"var(--\1)", v)
        out.append(f"--{t['name']}:{v}")
    if theme == "light":  # spacing, radius, stroke and fonts are the same in both themes
        for family in ["spacing", "radius", "stroke"]:
            for t in tokens[family]["tokens"]:
                out.append(f"--{t['name']}:{t['value']}")
        for k, v in tokens["type"]["families"].items():
            out.append(f"--font-{k}:{v}")
    shadow = tokens["shadow"]["tokens"][0]["value"]
    out.append(f"--shadow-panel:{shadow[theme]}")
    return ";".join(out)


def main():
    tokens = json.loads((HERE / "tokens.json").read_text())
    token_css = (
        f":root{{{css_variables(tokens, 'light')};color-scheme:light}}\n"
        f":root[data-theme=\"dark\"]{{{css_variables(tokens, 'dark')};color-scheme:dark}}"
    )
    # Drop the @import line at the top of bundle.css: the desk loads the same fonts in its <head>.
    bundle_css = (HERE / "components" / "bundle.css").read_text().split("\n", 1)[1]
    bundle_js = (HERE / "components" / "bundle.js").read_text()
    assert "</script" not in bundle_js, "bundle.js must not contain a closing script tag"
    logos = {
        k: "data:image/png;base64," + base64.b64encode((HERE / "logos" / f"aiclub-horizontal-{k}.png").read_bytes()).decode()
        for k in ["black", "white"]
    }
    page = (HERE / "desk.html").read_text()
    for marker, value in [("/*TOKENS*/", token_css), ("/*BUNDLE_CSS*/", bundle_css),
                          ("/*LOGOS*/", json.dumps(logos)), ("/*BUNDLE_JS*/", bundle_js)]:
        assert marker in page, f"{marker} missing from desk.html"
        page = page.replace(marker, value)
    OUT.write_text(page)
    print(f"wrote {OUT.relative_to(HERE.parent)} ({len(page):,} bytes)")


if __name__ == "__main__":
    main()
