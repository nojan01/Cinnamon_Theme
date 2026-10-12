#!/bin/bash
# Copyright (c) 2026 Norbert Jander – MIT-Lizenz (siehe LICENSE)
# Baut dist/cinnamon-theme-nebel_<VERSION>_all.deb
set -euo pipefail
REPO="$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)"
VERSION="$(cat "$REPO/VERSION")"
PKG=cinnamon-theme-nebel
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
ROOT="$WORK/root"; SHARE="$ROOT/usr/share/$PKG"; DOC="$ROOT/usr/share/doc/$PKG"

mkdir -p "$SHARE" "$DOC" "$ROOT/usr/bin" "$ROOT/usr/share/applications" "$ROOT/DEBIAN"
cp -r "$REPO"/{install.sh,VERSION,LICENSE,LICENSE.GPL-3.0,COPYRIGHT.md,Nebel,wallpapers,desklets,session,plank,dock,extensions,daynight,terminal,system,fonts} "$SHARE/"
mkdir -p "$SHARE/tools"; cp "$REPO/tools/build-nebel-cursor.py" "$SHARE/tools/"
cp "$REPO/packaging/nebel-einrichten" "$ROOT/usr/bin/"
cp "$REPO/settings/nebel-einstellungen" "$ROOT/usr/bin/"
cp "$REPO/settings/nebel-einstellungen.desktop" "$ROOT/usr/share/applications/"
cp "$REPO/packaging/debian/copyright" "$DOC/copyright"
cp "$REPO/README.md" "$REPO/SETUP-NOTES.md" "$REPO/COPYRIGHT.md" "$DOC/"
printf '%s (%s) stable; urgency=low\n\n  * Version %s\n\n -- Norbert Jander <n.jander@posteo.de>  %s\n' \
  "$PKG" "$VERSION" "$VERSION" "$(LC_ALL=C date -R)" | gzip -9n > "$DOC/changelog.gz"

# Rechte (Quelle kann ein Netzlaufwerk ohne Unix-Rechte sein)
find "$ROOT" -type d -exec chmod 755 {} +
find "$ROOT" -type f -exec chmod 644 {} +
chmod 755 "$ROOT/usr/bin/nebel-einrichten" "$ROOT/usr/bin/nebel-einstellungen" "$SHARE/install.sh" "$SHARE"/system/*.sh \
  "$SHARE/session/cinnamon-theme-session" "$SHARE/daynight/cinnamon-theme-daynight" "$SHARE/tools/build-nebel-cursor.py" "$SHARE/dock/nebel-dock-add"

SIZE=$(du -sk --exclude=DEBIAN "$ROOT" | cut -f1)
sed -e "s/@VERSION@/$VERSION/" -e "s/@SIZE@/$SIZE/" "$REPO/packaging/debian/control" > "$ROOT/DEBIAN/control"
install -m 755 "$REPO/packaging/debian/postinst" "$REPO/packaging/debian/prerm" "$ROOT/DEBIAN/"
(cd "$ROOT" && find usr -type f -exec md5sum {} + | sort -k2) > "$ROOT/DEBIAN/md5sums"
chmod 644 "$ROOT/DEBIAN/md5sums"

mkdir -p "$REPO/dist"
OUT="$REPO/dist/${PKG}_${VERSION}_all.deb"
dpkg-deb --root-owner-group -Zxz --build "$ROOT" "$WORK/pkg.deb" >/dev/null
cp "$WORK/pkg.deb" "$OUT"
echo "$OUT"
