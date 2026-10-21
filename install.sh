#!/bin/bash
# Copyright (c) 2026 Norbert Jander – MIT-Lizenz (siehe LICENSE)
# Cinnamon_Theme „Nebel“ – Installationsprogramm
#
#   ./install.sh                    Auswahl per Dialog (zenity) bzw. Rückfrage im Terminal
#   ./install.sh --all              alles installieren (ohne Auswahl)
#   ./install.sh --components a,b   nur bestimmte Bausteine (siehe COMPONENTS)
#   ./install.sh --dock replace|add Dock ersetzen oder nur ergänzen (Standard: fragen)
#   ./install.sh --uninstall        alle Änderungen rückgängig machen
#   ./install.sh --list             Bausteine mit Beschreibung und Stand (für Nebel-Einstellungen)
#
# Alle vorherigen Werte und überschriebenen Dateien werden in ~/.config/cinnamon-theme/
# gesichert. Benötigte Pakete (auch fastfetch, Plank Reloaded samt Paketquelle und WeckPilot)
# werden automatisch installiert; Root-Schritte laufen über pkexec bzw. sudo.
set -u

REPO="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
STATE="$HOME/.config/cinnamon-theme"
BACKUP="$STATE/backup.tsv"
ORIG="$STATE/orig"
TAB=$'\t'
VERSION="$(cat "$REPO/VERSION" 2>/dev/null || echo dev)"
COPYRIGHT="© 2026 Norbert Jander · MIT-Lizenz (Theme „Nebel“: GPL-3.0, basiert auf CBlue)"

COMPONENTS=(fonts theme wallpaper daynight appearance panel desklets wecker session plank dockmenu weather screensaver terminal settings lightdm)
declare -A DESC=(
  [fonts]="Schrift JetBrains Mono"
  [theme]="Cinnamon-Theme „Nebel“"
  [wallpaper]="Hintergrundbild „Linux Mint Nebel“"
  [daynight]="Tag/Nacht-Hintergrund (07:00 / 19:00)"
  [appearance]="Mauszeiger, Anwendungen, Symbole (Mint-L-Grey, Bibata)"
  [panel]="Leiste oben, 34 px, Uhrformat"
  [desklets]="Desklets Systeminfo (fastfetch) und Systemlast"
  [wecker]="Wecker WeckPilot mit Uhr-Desklet (lädt die App von GitHub)"
  [session]="Sitzungsmenü (Herunterfahren, Neustart …)"
  [plank]="Dock Plank mit Theme Nebel-Grau"
  [dockmenu]="Mint-Menü → Dock (Rechtsklick „Zum Dock hinzufügen“, Favoriten)"
  [weather]="Wetter auf dem Desktop: Regen, Blätter, Schnee, Sonnenstrahlen, Nebelschwaden (abschaltbar)"
  [screensaver]="Sperrbildschirm mit JetBrains Mono"
  [terminal]="Terminal-Profil „Nebel“"
  [settings]="Programm „Nebel-Einstellungen“ (alle Einstellungen an einem Ort)"
  [lightdm]="Anmeldebildschirm (root)"
)

GUI=0
[ -n "${DISPLAY:-}" ] && command -v zenity >/dev/null && GUI=1

log()  { printf '\e[32m==>\e[0m %s\n' "$*"; }
warn() { printf '\e[33m!!\e[0m %s\n' "$*" >&2; WARNINGS+=("$*"); }
die()  { printf '\e[31mFehler:\e[0m %s\n' "$*" >&2; [ $GUI = 1 ] && zenity --error --text="$*" 2>/dev/null; exit 1; }
WARNINGS=()

ask_yes_no() { # Frage, Standard (y/n)
  if [ $GUI = 1 ]; then zenity --question --title="Cinnamon_Theme" --width=420 --text="$1" 2>/dev/null; return; fi
  local a; read -r -p "$1 [j/n] " a; [[ "$a" =~ ^[jJyY] ]]
}

# ---------------------------------------------------------------- Sicherung
has_backup() { [ -f "$BACKUP" ] && grep -qF -- "$1$TAB$2$TAB$3$TAB" "$BACKUP"; }

gset() { # schema[:pfad] key value
  local cur; cur=$(gsettings get "$1" "$2" 2>/dev/null) || { warn "gsettings: $1 $2 nicht vorhanden"; return 0; }
  has_backup gsettings "$1" "$2" || printf 'gsettings\t%s\t%s\t%s\n' "$1" "$2" "$cur" >> "$BACKUP"
  gsettings set "$1" "$2" "$3"
}

dset() { # dconf-pfad wert
  has_backup dconf "$1" - || printf 'dconf\t%s\t-\t%s\n' "$1" "$(dconf read "$1")" >> "$BACKUP"
  dconf write "$1" "$2"
}

remember_path() { # zieldatei/-ordner sichern, bevor sie überschrieben wird
  local dst="$1"
  has_backup file "$dst" - && return 0
  if [ -e "$dst" ]; then
    mkdir -p "$ORIG$(dirname "$dst")"; cp -a "$dst" "$ORIG$dst"
    printf 'file\t%s\t-\texisted\n' "$dst" >> "$BACKUP"
  else
    printf 'file\t%s\t-\tnew\n' "$dst" >> "$BACKUP"
  fi
}

put() { # quelle ziel [modus]
  remember_path "$2"; mkdir -p "$(dirname "$2")"
  rm -rf "$2"; cp -r "$1" "$2"; [ -n "${3:-}" ] && chmod "$3" "$2"; return 0
}

mark() { has_backup mark "$1" - || printf 'mark\t%s\t-\t1\n' "$1" >> "$BACKUP"; }

# ---------------------------------------------------------------- Hilfen
screen_size() { # gibt "B H" des gesamten Bildschirms aus
  xrandr --current 2>/dev/null | sed -n 's/.*current \([0-9]*\) x \([0-9]*\).*/\1 \2/p' | head -1
}
max_monitor() { # größter angeschlossener Monitor "B H"
  xrandr --current 2>/dev/null | grep -oE ' connected( primary)? [0-9]+x[0-9]+' | grep -oE '[0-9]+x[0-9]+' \
    | awk -Fx '{ if ($1*$2 > m) { m=$1*$2; r=$1" "$2 } } END { print r }'
}
find_desktop() { # erste vorhandene .desktop-Datei aus a|b|c
  local n d IFS='|'
  for n in $1; do
    for d in "$HOME/.local/share/applications" /usr/share/applications \
             /var/lib/flatpak/exports/share/applications /var/lib/snapd/desktop/applications; do
      [ -f "$d/$n" ] && { echo "$d/$n"; return 0; }
    done
  done
  return 1
}
plank_running() { pgrep -u "$USER" -x plank >/dev/null; }
stop_plank() {
  local p; for p in $(pgrep -u "$USER" -x plank); do kill "$p"; done
  for _ in 1 2 3 4 5 6 7 8 9 10; do plank_running || return 0; sleep 0.5; done
}
start_plank() { # nur den Startbefehl in den Hintergrund – eine Subshell würde auf Plank warten und
  # die Ausgabeleitung offen halten (Nebel-Einstellungen bliebe dann bei „Läuft …“)
  command -v plank >/dev/null || return 0
  setsid plank >/dev/null 2>&1 < /dev/null &
}

# ---------------------------------------------------------------- Bausteine
# Benötigte Pakete je Baustein (werden automatisch mitinstalliert)
BASE_PKGS=(python3 python3-gi gir1.2-gtk-3.0 dconf-cli x11-xserver-utils fontconfig zenity desktop-file-utils)
declare -A PKGS=(
  [fonts]="fontconfig"
  [appearance]="mint-l-theme mint-l-icons mint-cursor-themes python3-numpy python3-pil"
  [daynight]="systemd"
  [desklets]="fastfetch"
  [session]="python3-gi gir1.2-gtk-3.0 cinnamon-session"
  [plank]="plank-reloaded"
  [terminal]="gnome-terminal"
  [lightdm]="lightdm slick-greeter"
)

as_root() {
  if [ -n "${DISPLAY:-}" ] && command -v pkexec >/dev/null; then pkexec "$@"
  elif command -v sudo >/dev/null; then sudo "$@"
  else die "Weder pkexec noch sudo vorhanden."; fi
}

root_script() { # skript (aus system/) [argumente] – als root ausführen
  # root darf auf Netzlaufwerken (FUSE, z. B. RDP-Laufwerke) oft nicht lesen: Skript und
  # benötigte Dateien daher vorher in einen lokalen temporären Ordner kopieren.
  local name="$1" tmp rc=0; shift
  tmp=$(mktemp -d /tmp/nebel-root.XXXXXX) || return 1
  mkdir -p "$tmp/wallpapers" "$tmp/fonts"
  cp -r "$REPO/system" "$tmp/" && cp "$REPO/wallpapers/Linux_Mint_Nebel_3840x2160.jpg" "$tmp/wallpapers/" \
    && cp -r "$REPO/fonts/JetBrainsMono" "$tmp/fonts/" || { rm -rf "$tmp"; return 1; }
  chmod -R a+rX "$tmp"
  as_root /bin/bash "$tmp/system/$name" "$@" || rc=$?
  rm -rf "$tmp"
  return $rc
}

install_dependencies() {
  local want=() p c
  for p in "${BASE_PKGS[@]}"; do want+=("$p"); done
  for c in "${SELECTED[@]}"; do for p in ${PKGS[$c]:-}; do want+=("$p"); done; done
  local missing=()
  for p in $(printf '%s\n' "${want[@]}" | sort -u); do
    dpkg-query -W -f='${Status}' "$p" 2>/dev/null | grep -q 'install ok installed' || missing+=("$p")
  done
  # das alte plank kollidiert mit plank-reloaded und wird von apt ersetzt
  [ ${#missing[@]} -eq 0 ] && { log "Alle benötigten Pakete sind vorhanden"; return; }
  log "Pakete installieren: ${missing[*]} (Administratorrechte, ggf. Passwort)"
  root_script install-packages.sh "${missing[@]}" \
    || die "Paketinstallation fehlgeschlagen oder abgebrochen: ${missing[*]}"
  command -v zenity >/dev/null && [ -n "${DISPLAY:-}" ] && [ "$NO_GUI" = 0 ] && GUI=1
}

do_fonts() {
  log "Schrift JetBrains Mono"
  put "$REPO/fonts/JetBrainsMono" "$HOME/.local/share/fonts/JetBrainsMono"
  fc-cache -f "$HOME/.local/share/fonts" >/dev/null
  NEED_RESTART=1
}

do_theme() {
  log "Cinnamon-Theme Nebel"
  put "$REPO/Nebel" "$HOME/.themes/Nebel"
  gset org.cinnamon.theme name 'Nebel'
}

do_wallpaper() {
  log "Hintergrundbild"
  local dir="$HOME/.local/share/backgrounds/Cinnamon_Theme" size w h
  read -r w h <<< "$(max_monitor)"; w=${w:-1920}; h=${h:-1080}
  if [ "$w" -gt 3840 ] || [ "$h" -gt 2160 ]; then size=5120x2880; else size=3840x2160; fi
  remember_path "$dir"; mkdir -p "$dir"
  cp "$REPO/wallpapers/Linux_Mint_Nebel_${size}.jpg" "$REPO/wallpapers/Linux_Mint_Nebel_${size}_Tag.jpg" "$dir/"
  gset org.cinnamon.desktop.background picture-options 'zoom'
  gset org.cinnamon.desktop.background picture-uri "file://$dir/Linux_Mint_Nebel_${size}.jpg"
}

do_daynight() {
  log "Tag/Nacht-Umschaltung"
  ls "$HOME/.local/share/backgrounds/Cinnamon_Theme/"*_Tag.jpg >/dev/null 2>&1 || do_wallpaper
  put "$REPO/daynight/cinnamon-theme-daynight" "$HOME/.local/bin/cinnamon-theme-daynight" 755
  put "$REPO/daynight/cinnamon-theme-daynight.service" "$HOME/.config/systemd/user/cinnamon-theme-daynight.service"
  put "$REPO/daynight/cinnamon-theme-daynight.timer" "$HOME/.config/systemd/user/cinnamon-theme-daynight.timer"
  systemctl --user daemon-reload
  systemctl --user enable --now cinnamon-theme-daynight.timer >/dev/null 2>&1 || warn "Timer konnte nicht aktiviert werden"
  mark daynight
  "$HOME/.local/bin/cinnamon-theme-daynight"
}

do_appearance() {
  log "Mauszeiger, Anwendungen, Symbole"
  local s
  local cursor='Bibata-Modern-Classic'
  remember_path "$HOME/.icons/Nebel-Cursor"
  python3 "$REPO/tools/build-nebel-cursor.py" "$HOME/.icons/Nebel-Cursor" >/dev/null \
    && cursor='Nebel-Cursor' || warn "Grauer Mauszeiger konnte nicht erzeugt werden – Bibata schwarz bleibt"
  for s in org.cinnamon.desktop.interface org.gnome.desktop.interface; do
    gset $s cursor-theme "$cursor"
    gset $s gtk-theme 'Mint-L-Dark-Grey'
    gset $s icon-theme 'Mint-L-Grey'
  done
  # wie Cinnamons Themen-Modul: Standard-Zeiger für X und Programme ohne xsettings
  for s in "$HOME/.icons/default" "$HOME/.local/share/icons/default"; do
    mkdir -p "$s" && rm -f "$s/index.theme" && printf '[icon theme]\nInherits=%s\n' "$cursor" > "$s/index.theme"
  done
  gset org.cinnamon.desktop.interface cursor-size 24
  gset org.gnome.desktop.interface cursor-size 24
  gset org.x.apps.portal color-scheme 'prefer-dark'
  gset org.cinnamon.desktop.interface menus-have-icons true
  gset org.cinnamon.desktop.interface buttons-have-icons false
  gset org.cinnamon.desktop.interface gtk-overlay-scrollbars true
  local css="$HOME/.config/gtk-3.0/gtk.css"
  if ! grep -q 'scrollbar slider - cinnamon-settings-generated' "$css" 2>/dev/null; then
    remember_path "$css"; mkdir -p "$(dirname "$css")"
    printf '/***** scrollbar slider - cinnamon-settings-generated - do not edit *****/\nscrollbar slider {\n\tmin-width: 10px;\n\tmin-height: 10px;}\n' >> "$css"
  fi
}

do_panel() {
  log "Leiste oben, 34 px, Uhr"
  local cur new
  cur=$(gsettings get org.cinnamon panels-enabled)
  new=$(python3 -c "import ast,sys; l=ast.literal_eval(sys.argv[1]); l[0]=':'.join(l[0].split(':')[:2]+['top']) if l else None; print(repr(l))" "$cur")
  gset org.cinnamon panels-enabled "$new"
  local pid; pid=$(python3 -c "import ast,sys; l=ast.literal_eval(sys.argv[1]); print(l[0].split(':')[0] if l else 1)" "$cur")
  gset org.cinnamon panels-height "['$pid:34']"
  local id f
  for id in $(gsettings get org.cinnamon enabled-applets | grep -oE 'calendar@cinnamon\.org:[0-9]+' | cut -d: -f2); do
    f="$HOME/.config/cinnamon/spices/calendar@cinnamon.org/$id.json"
    [ -f "$f" ] || { warn "Uhr-Einstellungen $f fehlen (Applet einmal öffnen und erneut installieren)"; continue; }
    remember_path "$f"
    python3 - "$f" <<'PY'
import json, sys
p = sys.argv[1]; d = json.load(open(p))
for k, v in (("use-custom-format", True), ("custom-format", "%H:%M   %a, %-d. %b"),
             ("custom-tooltip-format", "%A, %-d. %B %Y")):
    if k in d: d[k]["value"] = v
json.dump(d, open(p, "w"), indent=4)
PY
    dbus-send --session --dest=org.Cinnamon --type=method_call /org/Cinnamon \
      org.Cinnamon.ReloadXlet string:'calendar@cinnamon.org' string:'APPLET' 2>/dev/null
  done
}

enable_desklets() { # uuid:x:y … – fehlende Desklets an der Position x,y ergänzen
  local id cur new
  id=$(gsettings get org.cinnamon next-desklet-id | grep -oE '[0-9]+')
  cur=$(gsettings get org.cinnamon enabled-desklets)
  new=$(python3 -c "
import ast,sys
# vorhandene Desklets behalten Nummer, Position und Einstellungen; nur fehlende ergänzen
l=ast.literal_eval(sys.argv[1].replace('@as ',''))
have={e.split(':')[0] for e in l}
i=int(sys.argv[2])
for spec in sys.argv[3:]:
    u,x,y=spec.split(':')
    if u not in have: l.append('%s:%d:%s:%s'%(u,i,x,y)); i+=1
print(repr(l)); print(i, file=sys.stderr)" "$cur" "$id" "$@" 2>"$STATE/.next-id")
  gset org.cinnamon enabled-desklets "$new"
  gset org.cinnamon next-desklet-id "$(cat "$STATE/.next-id")"; rm -f "$STATE/.next-id"
}

do_desklets() {
  log "Desklets"
  local d u
  for u in fastfetch@cinnamon-theme sysmon@cinnamon-theme; do
    put "$REPO/desklets/$u" "$HOME/.local/share/cinnamon/desklets/$u"
  done
  local w h x cur new
  read -r w h <<< "$(screen_size)"; w=${w:-1920}
  x=$(( w - 453 )); [ $x -lt 20 ] && x=20
  enable_desklets "sysmon@cinnamon-theme:$x:60" "fastfetch@cinnamon-theme:$x:375"
  # Desklet-Anker: Desklets bei anderer Auflösung (RDP-Fenster) anteilig mitverschieben
  put "$REPO/extensions/desklet-anchor@cinnamon-theme" "$HOME/.local/share/cinnamon/extensions/desklet-anchor@cinnamon-theme"
  remember_path "$HOME/.config/nebel/desklet-anchor.json"
  cur=$(gsettings get org.cinnamon enabled-extensions)
  new=$(python3 -c "
import ast,sys
l=ast.literal_eval(sys.argv[1].replace('@as ',''))
if 'desklet-anchor@cinnamon-theme' not in l: l.append('desklet-anchor@cinnamon-theme')
print(repr(l))" "$cur")
  gset org.cinnamon enabled-extensions "$new"
  # Conky-Uhr von CBlue abschalten, falls vorhanden
  local a="$HOME/.config/autostart/conky-timefull.desktop"
  if [ -f "$a" ] && ! grep -q '^Hidden=true' "$a"; then
    remember_path "$a"; echo "Hidden=true" >> "$a"
    sed -i 's/^X-GNOME-Autostart-enabled=true/X-GNOME-Autostart-enabled=false/' "$a"
  fi
  NEED_RESTART=1
}

WECKPILOT_REPO=nojan01/WeckPilot-Linux
WECKPILOT_PKG=weck-pilot

install_weckpilot() { # neueste Version von GitHub laden, falls nicht schon installiert
  local arch info tag url have tmp rc=0
  arch=$(dpkg --print-architecture)
  [ "$arch" = amd64 ] || { warn "WeckPilot gibt es nur für amd64 (hier: $arch)"; return 1; }
  info=$(python3 - "$WECKPILOT_REPO" <<'PY'
import json, sys, urllib.request
req = urllib.request.Request("https://api.github.com/repos/%s/releases/latest" % sys.argv[1],
                             headers={"Accept": "application/vnd.github+json", "User-Agent": "nebel-install"})
rel = json.load(urllib.request.urlopen(req, timeout=30))
debs = [a["browser_download_url"] for a in rel.get("assets", []) if a["name"].endswith("_amd64.deb")]
print(rel["tag_name"].lstrip("v"), debs[0] if debs else "")
PY
) || { warn "WeckPilot: GitHub nicht erreichbar"; return 1; }
  read -r tag url <<< "$info"
  [ -n "$url" ] || { warn "WeckPilot: kein Paket in der Freigabe $tag"; return 1; }
  have=$(dpkg-query -W -f='${Status} ${Version}' "$WECKPILOT_PKG" 2>/dev/null | sed -n 's/^install ok installed //p')
  if [ -n "$have" ] && dpkg --compare-versions "$have" ge "$tag"; then
    log "WeckPilot $have ist aktuell"; return 0
  fi
  log "WeckPilot $tag laden und installieren (Administratorrechte, ggf. Passwort)"
  tmp=$(mktemp -d /tmp/nebel-weckpilot.XXXXXX) || return 1
  if python3 -c "import sys, urllib.request; urllib.request.urlretrieve(sys.argv[1], sys.argv[2])" \
       "$url" "$tmp/weckpilot_${tag}_amd64.deb"; then
    chmod -R a+rX "$tmp"
    as_root env DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=600 install -y \
      "$tmp/weckpilot_${tag}_amd64.deb" || rc=$?
  else
    warn "WeckPilot: Download fehlgeschlagen"; rc=1
  fi
  rm -rf "$tmp"
  return $rc
}

do_wecker() {
  log "Wecker WeckPilot mit Uhr-Desklet"
  install_weckpilot || warn "WeckPilot nicht installiert – das Desklet zeigt trotzdem die Uhr"
  put "$REPO/fonts/Orbitron" "$HOME/.local/share/fonts/Orbitron"
  fc-cache -f "$HOME/.local/share/fonts" >/dev/null 2>&1
  put "$REPO/desklets/weckpilot@cinnamon-theme" "$HOME/.local/share/cinnamon/desklets/weckpilot@cinnamon-theme"
  enable_desklets "weckpilot@cinnamon-theme:40:60"
  NEED_RESTART=1
}

do_session() {
  log "Sitzungsmenü"
  put "$REPO/session/cinnamon-theme-session" "$HOME/.local/bin/cinnamon-theme-session" 755
  local df="$HOME/.local/share/applications/cinnamon-theme-session.desktop"
  remember_path "$df"; mkdir -p "$(dirname "$df")"
  sed "s|Exec=cinnamon-theme-session|Exec=$HOME/.local/bin/cinnamon-theme-session|" \
    "$REPO/session/cinnamon-theme-session.desktop" > "$df"
  update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
}

do_plank() {
  command -v plank >/dev/null || { warn "Plank ist nicht installiert"; return; }
  log "Dock Plank"
  local t
  for t in "$REPO"/plank/themes/*/; do
    put "${t%/}" "$HOME/.local/share/plank/themes/$(basename "$t")"
  done
  local was_running=0; plank_running && was_running=1
  stop_plank
  local S="net.launchpad.plank.dock.settings:/net/launchpad/plank/docks/dock1/"
  gset "$S" theme 'Nebel-Grau'
  gset "$S" position 'bottom'
  gset "$S" hide-mode 'none'
  gset "$S" icon-size 52
  gset "$S" zoom-enabled true
  gset "$S" zoom-percent 200
  local auto="$HOME/.config/autostart/plank.desktop"
  # Phase „Desktop“: startet vor den übrigen Programmen statt am Ende der Anmeldung.
  # Plank meldet sich nicht bei der Sitzung an; der Starter beendet sich sofort,
  # sonst wartet cinnamon-session 30 s (Hintergrund/Desktop erscheinen spät).
  remember_path "$auto"; mkdir -p "$(dirname "$auto")"
  printf '[Desktop Entry]\nType=Application\nName=Plank\nExec=sh -c "plank >/dev/null 2>&1 &"\nX-GNOME-Autostart-enabled=true\nX-GNOME-Autostart-Phase=Desktop\nX-GNOME-Autostart-Delay=0\nNoDisplay=false\n' > "$auto"

  local L="$HOME/.config/plank/dock1/launchers" mode="${DOCK_MODE:-}"
  if [ -z "$mode" ]; then
    if [ -n "$(ls -A "$L" 2>/dev/null)" ] && \
       ! ask_yes_no $'Vorhandenes Dock durch die Standardbelegung ersetzen?\n(Nein = nur fehlende Einträge ergänzen; die alte Belegung wird gesichert.)'; then
      mode=add; else mode=replace; fi
  fi
  remember_path "$L"; mkdir -p "$L"
  # „Anwendungen“: Starter öffnet das Mint-Menü (mit Suche) über dem Dock;
  # braucht die Erweiterung dock-menu@cinnamon-theme (Baustein dockmenu).
  local menu_df="$HOME/.local/share/applications/nebel-menu.desktop" use_menu=0
  if selected dockmenu || [ -d "$HOME/.local/share/cinnamon/extensions/dock-menu@cinnamon-theme" ]; then
    use_menu=1; put "$REPO/dock/nebel-menu.desktop" "$menu_df"
  fi
  local items=() line name file base
  if [ "$mode" = add ]; then
    mapfile -t items < <(gsettings get "$S" dock-items | grep -oE "'[^']+'" | tr -d "'")
    if [ $use_menu = 1 ]; then # altes Docklet „Anwendungen“ an gleicher Stelle ersetzen
      local i
      for i in "${!items[@]}"; do
        if grep -qs '^Launcher=docklet://applications' "$L/${items[$i]}"; then
          rm -f "$L/${items[$i]}"; items[$i]=nebel-menu.dockitem
          printf '[PlankDockItemPreferences]\nLauncher=file://%s\n' "$menu_df" > "$L/nebel-menu.dockitem"
        fi
      done
    fi
  else
    rm -f "$L"/*.dockitem
  fi
  while IFS= read -r line; do
    line="${line%%#*}"; line="$(echo "$line" | xargs)"; [ -z "$line" ] && continue
    [ "$line" = menu ] && { [ $use_menu = 1 ] && line="app:nebel-menu.desktop" || line="docklet:applications"; }
    case "$line" in
      docklet:*) name="${line#docklet:}"; base="$name.dockitem"
                 [ -f "$L/$base" ] || cp "$REPO/plank/launchers/$base" "$L/$base" ;;
      app:*)     file=$(find_desktop "${line#app:}") || { warn "Dock: ${line#app:} nicht gefunden"; continue; }
                 base="$(basename "$file" .desktop).dockitem"
                 if [ "$mode" = add ] && grep -qsF "/$(basename "$file")" "$L"/*.dockitem; then continue; fi
                 printf '[PlankDockItemPreferences]\nLauncher=file://%s\n' "${file// /%20}" > "$L/$base" ;;
      *) continue ;;
    esac
    if [[ " ${items[*]-} " != *" $base "* ]]; then
      if [ "$mode" = add ] && [ "$base" != trash.dockitem ] && [[ " ${items[*]-} " == *" trash.dockitem "* ]]; then
        local n=() i; for i in "${items[@]}"; do [ "$i" = trash.dockitem ] && n+=("$base"); n+=("$i"); done; items=("${n[@]}")
      else
        items+=("$base")
      fi
    fi
  done < "$REPO/plank/default-apps.conf"
  local list; list=$(printf "'%s', " "${items[@]}"); gset "$S" dock-items "[${list%, }]"
  mark plank
  start_plank
}

do_dockmenu() {
  log "Mint-Menü → Dock"
  put "$REPO/dock/nebel-dock-add" "$HOME/.local/bin/nebel-dock-add" 755
  put "$REPO/extensions/dock-menu@cinnamon-theme" "$HOME/.local/share/cinnamon/extensions/dock-menu@cinnamon-theme"
  local auto="$HOME/.config/autostart/nebel-dock-sync.desktop"
  remember_path "$auto"; mkdir -p "$(dirname "$auto")"
  sed "s|Exec=nebel-dock-add|Exec=$HOME/.local/bin/nebel-dock-add|" "$REPO/dock/nebel-dock-sync.desktop" > "$auto"
  local cur new
  cur=$(gsettings get org.cinnamon enabled-extensions)
  new=$(python3 -c "
import ast,sys
l=ast.literal_eval(sys.argv[1].replace('@as ',''))
if 'dock-menu@cinnamon-theme' not in l: l.append('dock-menu@cinnamon-theme')
print(repr(l))" "$cur")
  gset org.cinnamon enabled-extensions "$new"
  mark dockmenu
  if [ -n "${DBUS_SESSION_BUS_ADDRESS:-}" ] && ! pgrep -f 'nebel-dock-add --watch-favorites' >/dev/null; then
    setsid "$HOME/.local/bin/nebel-dock-add" --watch-favorites >/dev/null 2>&1 < /dev/null &
  fi
}

do_weather() {
  log "Wetter auf dem Desktop"
  put "$REPO/extensions/weather@cinnamon-theme" "$HOME/.local/share/cinnamon/extensions/weather@cinnamon-theme"
  local cur new
  cur=$(gsettings get org.cinnamon enabled-extensions)
  new=$(python3 -c "
import ast,sys
l=ast.literal_eval(sys.argv[1].replace('@as ',''))
l=[x for x in l if x!='snow@cinnamon-theme']
if 'weather@cinnamon-theme' not in l: l.append('weather@cinnamon-theme')
print(repr(l))" "$cur")
  gset org.cinnamon enabled-extensions "$new"
}

do_screensaver() {
  log "Sperrbildschirm"
  local S=org.cinnamon.desktop.screensaver
  gset $S use-custom-format true
  gset $S time-format '%H:%M'
  gset $S date-format '%A, %-d. %B'
  gset $S font-time 'JetBrains Mono Light 64'
  gset $S font-date 'JetBrains Mono 22'
  gset $S font-message 'JetBrains Mono 13'
}

do_terminal() {
  command -v gnome-terminal >/dev/null || { warn "GNOME-Terminal nicht installiert"; return; }
  log "Terminal-Profil Nebel"
  local U=4e3b6c1a-9d2f-4c57-b8a1-6e0f2c9d7a11 B=/org/gnome/terminal/legacy/profiles:/
  has_backup dconf "$B:$U/" - || printf 'dconf-dir\t%s\t-\t-\n' "$B:$U/" >> "$BACKUP"
  dconf load "$B:$U/" < "$REPO/terminal/nebel-profile.dconf"
  local list; list=$(dconf read "${B}list"); [ -z "$list" ] && list="[]"
  if [[ "$list" != *"$U"* ]]; then
    list=$(python3 -c "import ast,sys; l=ast.literal_eval(sys.argv[1]); l.append(sys.argv[2]); print(repr(l))" "$list" "$U")
    dset "${B}list" "$list"
  fi
  dset "${B}default" "'$U'"
}

do_settings() {
  log "Nebel-Einstellungen"
  if [ -x /usr/bin/nebel-einstellungen ]; then mark settings; return; fi  # aus dem .deb-Paket
  put "$REPO/settings/nebel-einstellungen" "$HOME/.local/bin/nebel-einstellungen" 755
  local app="$HOME/.local/share/applications/nebel-einstellungen.desktop"
  remember_path "$app"; mkdir -p "$(dirname "$app")"
  sed "s|^Exec=nebel-einstellungen|Exec=$HOME/.local/bin/nebel-einstellungen|" "$REPO/settings/nebel-einstellungen.desktop" > "$app"
  mark settings
}

do_lightdm() {
  log "Anmeldebildschirm (Administratorrechte, ggf. Passwort)"
  local cur=(); [ -f "$HOME/.icons/Nebel-Cursor/index.theme" ] && cur=(--cursor "$HOME/.icons/Nebel-Cursor")
  if root_script install-lightdm.sh "${cur[@]}"; then mark lightdm; else warn "Anmeldebildschirm nicht eingerichtet"; fi
}

# ---------------------------------------------------------------- Deinstallation
uninstall() {
  [ -f "$BACKUP" ] || die "Keine Installation gefunden ($BACKUP)."
  local plank_touched=0; grep -q "^mark${TAB}plank" "$BACKUP" && plank_touched=1
  [ $plank_touched = 1 ] && stop_plank
  local type a b v
  while IFS="$TAB" read -r type a b v; do
    case "$type" in
      gsettings) gsettings set "$a" "$b" "$v" 2>/dev/null || warn "Zurücksetzen fehlgeschlagen: $a $b" ;;
      dconf)     if [ -z "$v" ]; then dconf reset "$a"; else dconf write "$a" "$v"; fi ;;
      dconf-dir) dconf reset -f "$a" ;;
      file)      rm -rf "$a"; [ "$v" = existed ] && { mkdir -p "$(dirname "$a")"; cp -a "$ORIG$a" "$a"; } ;;
      mark)
        case "$a" in
          daynight) systemctl --user disable --now cinnamon-theme-daynight.timer >/dev/null 2>&1 ;;
          dockmenu) local pid; for pid in $(pgrep -f 'nebel-dock-add --watch-favorites'); do kill "$pid"; done ;;
          lightdm)  root_script install-lightdm.sh --uninstall || warn "Anmeldebildschirm nicht zurückgesetzt" ;;
        esac ;;
    esac
  done < <(tac "$BACKUP")
  systemctl --user daemon-reload 2>/dev/null
  fc-cache -f "$HOME/.local/share/fonts" >/dev/null 2>&1
  mv "$STATE" "$STATE.removed-$(date +%Y%m%d-%H%M%S)"
  [ $plank_touched = 1 ] && start_plank
  dbus-send --session --dest=org.Cinnamon --type=method_call /org/Cinnamon org.Cinnamon.RestartCinnamon boolean:true 2>/dev/null
  log "Deinstallation abgeschlossen. Pakete (fastfetch, Plank, WeckPilot) bleiben installiert."
  [ $GUI = 1 ] && zenity --info --width=380 --title="Nebel" --text="Nebel wurde entfernt." 2>/dev/null
  exit 0
}

# ---------------------------------------------------------------- Ablauf
SELECTED=(); DOCK_MODE=""; ALL=0; NO_GUI=0
while [ $# -gt 0 ]; do
  case "$1" in
    --uninstall) MODE=uninstall ;;
    --all) ALL=1 ;;
    --components) shift; IFS=, read -r -a SELECTED <<< "$1" ;;
    --dock) shift; DOCK_MODE="$1" ;;
    --no-gui) GUI=0; NO_GUI=1 ;;
    --list)
      for c in "${COMPONENTS[@]}"; do
        i=0; grep -q "^mark$TAB$c$TAB" "$BACKUP" 2>/dev/null && i=1
        printf '%s\t%s\t%s\n' "$c" "${DESC[$c]}" "$i"
      done; exit 0 ;;
    -v|--version) echo "Cinnamon_Theme Nebel $VERSION"; echo "$COPYRIGHT"; exit 0 ;;
    -h|--help) sed -n '3,13p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "Unbekannte Option: $1" ;;
  esac
  shift
done

[ "$(id -u)" -eq 0 ] && die "Bitte nicht als root starten – das Programm fragt selbst nach dem Passwort."
command -v gsettings >/dev/null || die "gsettings fehlt – ist das ein Cinnamon-System?"
mkdir -p "$STATE"
echo "$REPO/install.sh" > "$STATE/install-path"  # damit Nebel-Einstellungen es auch ohne Paket findet
[ "${MODE:-}" = uninstall ] && uninstall

if [ $ALL = 1 ]; then
  SELECTED=("${COMPONENTS[@]}")
elif [ ${#SELECTED[@]} -eq 0 ]; then
  if [ $GUI = 1 ]; then
    args=(); for c in "${COMPONENTS[@]}"; do args+=(TRUE "$c" "${DESC[$c]}"); done
    out=$(zenity --list --checklist --title="Nebel $VERSION einrichten" \
      --text="Bausteine auswählen. Vorherige Einstellungen werden gesichert;"$'\n'"rückgängig mit „Nebel entfernen“ bzw. --uninstall."$'\n\n'"<small>$COPYRIGHT</small>" \
      --width=620 --height=560 --column="" --column="Baustein" --column="Beschreibung" \
      --separator=, "${args[@]}" 2>/dev/null) || exit 0
    IFS=, read -r -a SELECTED <<< "$out"
  else
    echo "Bausteine:"; for c in "${COMPONENTS[@]}"; do printf '  %-12s %s\n' "$c" "${DESC[$c]}"; done
    ask_yes_no "Alle installieren?" && SELECTED=("${COMPONENTS[@]}") || {
      read -r -p "Bausteine (durch Komma getrennt): " out; IFS=, read -r -a SELECTED <<< "$out"; }
  fi
fi
[ ${#SELECTED[@]} -eq 0 ] && exit 0
for c in "${SELECTED[@]}"; do [ -n "${DESC[$c]:-}" ] || die "Unbekannter Baustein: $c"; done

install_dependencies

NEED_RESTART=0
selected() { [[ " ${SELECTED[*]} " == *" $1 "* ]]; }
for c in "${COMPONENTS[@]}"; do
  selected "$c" || continue
  "do_$c"
  # „eingerichtet“ in Nebel-Einstellungen; der Anmeldebildschirm markiert sich nur bei Erfolg selbst
  [ "$c" = lightdm ] || mark "$c"
done

# Prüfen, ob Anwendungs- und Symbolthema wirklich gesetzt und vorhanden sind
if selected appearance; then
  for s in org.cinnamon.desktop.interface org.gnome.desktop.interface; do
    [ "$(gsettings get $s gtk-theme 2>/dev/null)" = "'Mint-L-Dark-Grey'" ] || warn "Anwendungsthema in $s nicht gesetzt: $(gsettings get $s gtk-theme 2>/dev/null)"
    [ "$(gsettings get $s icon-theme 2>/dev/null)" = "'Mint-L-Grey'" ] || warn "Symbolthema in $s nicht gesetzt: $(gsettings get $s icon-theme 2>/dev/null)"
  done
  [ -d /usr/share/themes/Mint-L-Dark-Grey/gtk-3.0 ] || warn "Mint-L-Dark-Grey fehlt (Paket mint-l-theme)"
  [ -f /usr/share/icons/Mint-L-Grey/index.theme ] || warn "Mint-L-Grey fehlt (Paket mint-l-icons)"
fi

if [ $NEED_RESTART = 1 ] || selected theme || selected appearance; then
  log "Cinnamon neu starten"
  if [ "${XDG_SESSION_TYPE:-}" = wayland ]; then
    warn "Wayland-Sitzung: Cinnamon lässt sich nicht neu starten – bitte ab- und wieder anmelden"
  elif ! gdbus introspect --session --dest org.Cinnamon --object-path /org/Cinnamon 2>/dev/null | grep -q RestartCinnamon; then
    warn "Cinnamon nicht erreichbar – bitte mit Strg+Alt+Esc neu starten oder ab- und wieder anmelden"
  else
    # kurz warten, damit Einstellungen und Dateien sicher geschrieben sind
    sleep 1
    dbus-send --session --dest=org.Cinnamon --type=method_call /org/Cinnamon \
      org.Cinnamon.RestartCinnamon boolean:true 2>/dev/null || warn "Bitte Cinnamon mit Strg+Alt+Esc neu starten"
  fi
fi

msg="Nebel $VERSION ist eingerichtet."
[ ${#WARNINGS[@]} -gt 0 ] && msg+=$'\n\nHinweise:\n'"$(printf -- '- %s\n' "${WARNINGS[@]}")"
for f in "$HOME"/.local/share/applications/*.desktop; do
  grep -q '^Icon=.*-symbolic$' "$f" 2>/dev/null && [ -f "$HOME/.config/plank/dock1/launchers/$(basename "$f" .desktop).dockitem" ] \
    && msg+=$'\n'"- $(basename "$f"): einfarbiges Symbol, im Dock evtl. schlecht sichtbar"
done
log "$msg"
[ $GUI = 1 ] && [ -z "${NEBEL_FROM_SETTINGS:-}" ] && zenity --info --width=460 --title="Nebel $VERSION" --text="$msg"$'\n\n'"<small>$COPYRIGHT</small>" 2>/dev/null
exit 0
