#!/usr/bin/env python3
"""
ZNK Responsive Audit
Scanne un ou plusieurs fichiers HTML et repère les signaux classiques
de non-responsivité mobile, pour prioriser le travail manuel.

Usage:
    python3 znk_responsive_audit.py fichier1.html fichier2.html ...
    python3 znk_responsive_audit.py --dir /chemin/vers/dossier
"""
import re
import sys
import os
import argparse

FIXED_WIDTH_RE = re.compile(r'\bwidth\s*:\s*(\d{3,})px', re.IGNORECASE)
MIN_WIDTH_RE = re.compile(r'\bmin-width\s*:\s*(\d{3,})px', re.IGNORECASE)
GRID_RE = re.compile(r'grid-template-columns\s*:\s*([^;]+)', re.IGNORECASE)
POSITION_FIXED_RE = re.compile(r'position\s*:\s*fixed', re.IGNORECASE)
MEDIA_RE = re.compile(r'@media[^{]*\{', re.IGNORECASE)
VIEWPORT_RE = re.compile(r'<meta[^>]+name=["\']viewport["\']', re.IGNORECASE)


def brace_balance(style_block):
    depth = 0
    for ch in style_block:
        if ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
    return depth


def audit_file(path):
    with open(path, encoding='utf-8', errors='replace') as f:
        content = f.read()

    issues = []
    score = 0  # plus haut = plus urgent

    # viewport meta
    if not VIEWPORT_RE.search(content):
        issues.append(("CRITIQUE", "Balise <meta viewport> absente"))
        score += 5

    # style blocks (peut y en avoir plusieurs)
    style_blocks = re.findall(r'<style[^>]*>(.*?)</style>', content, re.DOTALL | re.IGNORECASE)
    total_style = "\n".join(style_blocks)

    if style_blocks:
        depth = brace_balance(total_style)
        if depth != 0:
            issues.append(("CRITIQUE", f"Accolades CSS déséquilibrées (depth={depth}) — une media query ou une règle n'est pas fermée correctement"))
            score += 10
    else:
        issues.append(("INFO", "Aucun bloc <style> trouvé dans le fichier (CSS externe ou inline uniquement)"))

    media_queries = MEDIA_RE.findall(total_style)
    if not media_queries:
        issues.append(("CRITIQUE", "Aucune media query — le fichier n'a probablement aucune adaptation mobile"))
        score += 8
    else:
        issues.append(("OK", f"{len(media_queries)} media quer(y/ies) trouvée(s)"))

    # position: fixed elements (souvent des barres/lecteurs qui débordent sur mobile)
    fixed_count = len(POSITION_FIXED_RE.findall(total_style))
    if fixed_count:
        issues.append(("A VERIFIER", f"{fixed_count} élément(s) en position:fixed — vérifier qu'ils ont une largeur/hauteur adaptées au mobile et que le contenu en dessous a un padding pour ne pas être masqué"))
        score += 2 * fixed_count

    # grilles à colonnes fixes (hors auto-fit/auto-fill, qui sont déjà responsives)
    grid_fixed = GRID_RE.findall(total_style)
    grid_fixed = [g.strip() for g in grid_fixed
                  if not g.strip().lower().startswith('repeat(auto-fit')
                  and not g.strip().lower().startswith('repeat(auto-fill')
                  and g.strip() != '1fr']
    if grid_fixed:
        issues.append(("A VERIFIER", f"{len(grid_fixed)} grille(s) à colonnes fixes sans auto-fit/auto-fill : {grid_fixed[:5]}{'...' if len(grid_fixed) > 5 else ''} — vérifier qu'elles sont bien réduites dans une media query"))
        score += 2 * len(grid_fixed)

    # largeurs fixes suspectes (>=300px), en dehors des media queries
    # (approximation : on ignore le contenu à l'intérieur des blocs @media pour ne pas
    #  compter les valeurs qui sont déjà des corrections mobiles)
    non_media_style = re.sub(r'@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}', '', total_style, flags=re.DOTALL)
    wide_fixed = [int(w) for w in FIXED_WIDTH_RE.findall(non_media_style) if int(w) >= 300]
    wide_minwidth = [int(w) for w in MIN_WIDTH_RE.findall(non_media_style) if int(w) >= 300]
    if wide_fixed:
        issues.append(("A VERIFIER", f"{len(wide_fixed)} largeur(s) fixe(s) >= 300px hors media query (max: {max(wide_fixed)}px) — risque de débordement sur téléphone (< 400px de large)"))
        score += len(wide_fixed)
    if wide_minwidth:
        issues.append(("A VERIFIER", f"{len(wide_minwidth)} min-width >= 300px hors media query (max: {max(wide_minwidth)}px) — même risque"))
        score += len(wide_minwidth)

    return score, issues


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('files', nargs='*')
    parser.add_argument('--dir', help="Scanner tous les .html d'un dossier")
    args = parser.parse_args()

    targets = list(args.files)
    if args.dir:
        for root, _, files in os.walk(args.dir):
            for fn in files:
                if fn.lower().endswith('.html'):
                    targets.append(os.path.join(root, fn))

    if not targets:
        print("Aucun fichier à analyser.")
        return

    results = []
    for path in targets:
        try:
            score, issues = audit_file(path)
            results.append((score, path, issues))
        except Exception as e:
            results.append((999, path, [("ERREUR", str(e))]))

    results.sort(key=lambda r: -r[0])

    print("=" * 70)
    print("RAPPORT D'AUDIT RESPONSIVE — ZNK")
    print("=" * 70)
    for score, path, issues in results:
        print(f"\n📄 {os.path.basename(path)}  (score de risque: {score})")
        for level, msg in issues:
            icon = {"CRITIQUE": "🔴", "A VERIFIER": "🟡", "OK": "🟢", "INFO": "ℹ️", "ERREUR": "💥"}.get(level, "•")
            print(f"   {icon} [{level}] {msg}")

    print("\n" + "=" * 70)
    print(f"{len(results)} fichier(s) analysé(s). Trié du plus urgent au moins urgent.")
    print("=" * 70)


if __name__ == '__main__':
    main()
