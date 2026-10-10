#!/bin/bash
# Anmeldebildschirm (slick-greeter) im Nebel-Stil. Ausführen mit: sudo ./install-lightdm.sh
# Rückgängig: sudo ./install-lightdm.sh --uninstall
set -e
[ "$(id -u)" -eq 0 ] || { echo "Bitte mit sudo ausführen."; exit 1; }
REPO="$(cd "$(dirname "$0")/.." && pwd)"
CONF=/etc/lightdm/slick-greeter.conf
BG_DIR=/usr/share/backgrounds/cinnamon-theme
FONT_DIR=/usr/local/share/fonts/JetBrainsMono

if [ "$1" = "--uninstall" ]; then
    if [ -f "$CONF.cinnamon-theme.bak" ]; then mv "$CONF.cinnamon-theme.bak" "$CONF"; else rm -f "$CONF"; fi
    rm -rf "$BG_DIR" "$FONT_DIR"; fc-cache -f >/dev/null
    echo "Anmeldebildschirm zurückgesetzt."; exit 0
fi

install -d "$BG_DIR" "$FONT_DIR"
install -m 644 "$REPO/wallpapers/Linux_Mint_Nebel_3840x2160.jpg" "$BG_DIR/"
install -m 644 "$REPO"/fonts/JetBrainsMono/*.ttf "$REPO/fonts/JetBrainsMono/OFL.txt" "$FONT_DIR/"
fc-cache -f >/dev/null
[ -f "$CONF" ] && [ ! -f "$CONF.cinnamon-theme.bak" ] && cp "$CONF" "$CONF.cinnamon-theme.bak"
cat > "$CONF" <<CONF
[Greeter]
background=$BG_DIR/Linux_Mint_Nebel_3840x2160.jpg
background-color=#1e1e1e
draw-user-backgrounds=false
draw-grid=false
show-hostname=true
theme-name=Mint-L-Dark-Grey
icon-theme-name=Mint-L-Grey
cursor-theme-name=Bibata-Modern-Classic
cursor-theme-size=24
font-name=JetBrains Mono 11
xft-antialias=true
xft-hintstyle=hintslight
xft-rgba=rgb
clock-format=%H:%M   %a, %-d. %b
CONF
echo "Fertig. Wirkt beim nächsten Abmelden bzw. Neustart."
