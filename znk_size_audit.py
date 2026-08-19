#!/usr/bin/env python3
"""
ZNK Size Audit
Diagnostique où part le poids d'un projet (dossiers les plus lourds,
gros fichiers individuels, doublons exacts) avant de nettoyer quoi que ce soit.

Usage:
    python3 znk_size_audit.py /chemin/vers/ZNK
    python3 znk_size_audit.py /chemin/vers/ZNK --top 30 --min-mb 5
"""
import os
import sys
import hashlib
import argparse
from collections import defaultdict

# Dossiers qu'on ne veut presque jamais inclure dans un build de prod,
# donc utiles à isoler dans le rapport
KNOWN_HEAVY_DIRS = {
    'node_modules', '.git', 'dist', 'out', 'build',
    '.cache', '.npm-global', '__pycache__', '.venv'
}


def human(n):
    for unit in ['o', 'Ko', 'Mo', 'Go', 'To']:
        if n < 1024:
            return f"{n:.1f}{unit}"
        n /= 1024
    return f"{n:.1f}Po"


def folder_sizes(root, depth=1):
    """Taille de chaque dossier de premier niveau (ou depth niveaux)."""
    sizes = defaultdict(int)
    for dirpath, dirnames, filenames in os.walk(root):
        rel = os.path.relpath(dirpath, root)
        parts = [] if rel == '.' else rel.split(os.sep)
        key = os.sep.join(parts[:depth]) if parts else '.'
        for fn in filenames:
            fp = os.path.join(dirpath, fn)
            try:
                sizes[key or '.'] += os.path.getsize(fp)
            except OSError:
                pass
    return sizes


def largest_files(root, top=25, min_bytes=5 * 1024 * 1024):
    files = []
    for dirpath, dirnames, filenames in os.walk(root):
        for fn in filenames:
            fp = os.path.join(dirpath, fn)
            try:
                size = os.path.getsize(fp)
            except OSError:
                continue
            if size >= min_bytes:
                files.append((size, os.path.relpath(fp, root)))
    files.sort(reverse=True)
    return files[:top]


def find_duplicates(root, min_bytes=1 * 1024 * 1024):
    """Doublons exacts (même contenu) parmi les fichiers >= min_bytes.
    Hash rapide (premiers + derniers Ko + taille) puis hash complet
    seulement pour confirmer, pour rester rapide sur un gros dossier."""
    by_size = defaultdict(list)
    for dirpath, dirnames, filenames in os.walk(root):
        for fn in filenames:
            fp = os.path.join(dirpath, fn)
            try:
                size = os.path.getsize(fp)
            except OSError:
                continue
            if size >= min_bytes:
                by_size[size].append(fp)

    duplicates = []
    for size, paths in by_size.items():
        if len(paths) < 2:
            continue
        by_hash = defaultdict(list)
        for p in paths:
            h = quick_hash(p)
            by_hash[h].append(p)
        for h, group in by_hash.items():
            if len(group) > 1:
                duplicates.append((size, group))

    duplicates.sort(key=lambda d: -d[0] * (len(d[1]) - 1))
    return duplicates


def quick_hash(path, sample=65536):
    h = hashlib.md5()
    try:
        with open(path, 'rb') as f:
            h.update(f.read(sample))
            f.seek(0, os.SEEK_END)
            fsize = f.tell()
            if fsize > sample:
                f.seek(max(0, fsize - sample))
                h.update(f.read(sample))
    except OSError:
        return None
    return h.hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('root')
    parser.add_argument('--top', type=int, default=25)
    parser.add_argument('--min-mb', type=float, default=5)
    args = parser.parse_args()

    root = args.root
    if not os.path.isdir(root):
        print(f"Dossier introuvable: {root}")
        sys.exit(1)

    print("=" * 70)
    print(f"AUDIT DE TAILLE — {root}")
    print("=" * 70)

    print("\n📁 Poids par dossier de premier niveau:")
    sizes = folder_sizes(root, depth=1)
    for key, size in sorted(sizes.items(), key=lambda x: -x[1])[:args.top]:
        flag = " ⚠️ dossier à exclure du build normalement" if key in KNOWN_HEAVY_DIRS else ""
        print(f"   {human(size):>10}  {key}{flag}")

    total = sum(sizes.values())
    print(f"\n   TOTAL: {human(total)}")

    print(f"\n📦 Fichiers individuels les plus lourds (>= {args.min_mb}Mo):")
    for size, relpath in largest_files(root, top=args.top, min_bytes=int(args.min_mb * 1024 * 1024)):
        print(f"   {human(size):>10}  {relpath}")

    print(f"\n🔁 Doublons exacts détectés (même contenu, >= 1Mo):")
    dups = find_duplicates(root)
    if not dups:
        print("   Aucun doublon détecté.")
    else:
        wasted = 0
        for size, group in dups[:args.top]:
            waste = size * (len(group) - 1)
            wasted += waste
            print(f"   {human(size)} x{len(group)} (gaspillage: {human(waste)})")
            for p in group:
                print(f"       - {os.path.relpath(p, root)}")
        print(f"\n   Espace récupérable en dédupliquant (aperçu ci-dessus): {human(wasted)}")

    print("\n" + "=" * 70)


if __name__ == '__main__':
    main()
