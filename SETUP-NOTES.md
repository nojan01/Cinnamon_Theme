# Einrichtungsprotokoll (Grundlage für das spätere Installationsprogramm)

Alle bisher vorgenommenen Einstellungen, in Reihenfolge. Jede neue Änderung wird hier ergänzt.
Zielsystem: Linux Mint 22.3 Cinnamon (Cinnamon 6.6.9), X11.

Legende: **[sudo]** = benötigt Root-Rechte · **[maschinenspezifisch]** = muss der Installer erkennen bzw. abfragen.

## Ausgangszustand (für Deinstallation / Rücksetzen)

| Einstellung | Vorher |
|---|---|
| `org.cinnamon.theme name` | `CBlue` (war bereits gesetzt) |
| `org.cinnamon.desktop.interface gtk-theme` | `Mint-L-Dark-Blue` (jetzt `Mint-L-Dark-Grey`, siehe 7) |
| `org.cinnamon.desktop.interface icon-theme` | `Mint-L-Blue` (jetzt `Mint-L-Grey`, siehe 7) |
| `org.cinnamon.desktop.wm.preferences theme` | `Mint-Y` (unverändert) |
| `org.cinnamon.desktop.background picture-uri` | `file:///usr/share/backgrounds/linuxmint/sele_ring_center.jpg` (gesichert in `~/.themes/.previous-wallpaper-uri`) |
| `org.cinnamon panels-enabled` | `['1:0:bottom']` (gesichert in `~/.themes/.previous-panel-settings`) |
| `org.cinnamon panels-height` | `['1:50']` (unverändert) |
| Plank | nicht installiert |

## 1. Cinnamon-Theme CBlue

- Quelle: `CBlue/` in diesem Repository (CBlue 4.0, Bundy01, GPL-3.0).
- Installieren: `CBlue/` nach `~/.themes/CBlue` kopieren.
- Aktivieren: `gsettings set org.cinnamon.theme name 'CBlue'`

## 2. Wallpaper „Linux Mint Nebel“

Zwei Größen im Repo unter `wallpapers/` (JPEG, sRGB, ohne Alpha, 16:9):

| Datei | Auflösung | Einsatz |
|---|---|---|
| `Linux_Mint_Nebel_3840x2160.jpg` | 3840×2160 (4K) | Standard, bis 4K-Monitore |
| `Linux_Mint_Nebel_5120x2880.jpg` | 5120×2880 (5K) | Monitore breiter als 3840 px oder höher als 2160 px |

Installer: Bildschirmauflösung ermitteln (z. B. `xrandr --current`) und passende
Größe wählen; beide nach `~/.local/share/backgrounds/Cinnamon_Theme/` kopieren.
Auf diesem Rechner (1828×1166) ist die 4K-Variante installiert:

```bash
mkdir -p ~/.local/share/backgrounds/Cinnamon_Theme
cp wallpapers/Linux_Mint_Nebel_3840x2160.jpg ~/.local/share/backgrounds/Cinnamon_Theme/
gsettings set org.cinnamon.desktop.background picture-options 'zoom'
gsettings set org.cinnamon.desktop.background picture-uri "file://$HOME/.local/share/backgrounds/Cinnamon_Theme/Linux_Mint_Nebel_3840x2160.jpg"
```

(Vorher: CBlue-Original `~/.themes/CBlue/cinnamon/Wallpaper.png`, 1920×1080.)

## 3. Cinnamon-Leiste oben

```bash
gsettings set org.cinnamon panels-enabled "['1:0:top']"
```

Höhe bleibt vorerst 50 px (Original-CBlue wirkt mit ca. 24–28 px; noch offen).

## 4. Conky-Uhr „TimeFull“

1. **[sudo]** Paket: `conky-all` (vom Nutzer installiert).
2. Schrift **Brizel** (SIL Open Font License 1.1, Alessandro Morelli):
   - Download: `https://dl.dafont.com/dl/?f=brizel`
   - `Brizel.ttf` und `readme.txt` (Lizenz) nach `~/.local/share/fonts/Brizel/`, dann `fc-cache -f ~/.local/share/fonts`
3. Konfiguration: `CBlue/cinnamon/TimeFull` nach `~/.conky/TimeFull`, `chmod 750`, mit Anpassungen:
   - **[maschinenspezifisch]** Netzwerk-Interface `enp0s31f6` → `enp46s0` (Standardroute: `ip route show default`).
   - **[maschinenspezifisch]** Batterieanzeige (`BATT: ${battery_percent BAT0}%`) entfernt, da kein Akku (`/sys/class/power_supply/BAT*` fehlt).
   - CPU-Temperatur über `sensors | grep "Core 0"` (Intel coretemp) – funktioniert hier; bei AMD wäre `Tctl` nötig **[maschinenspezifisch]**.
   - IP-Anzeige fragt alle 120 s `https://icanhazip.com` ab (wie im Original).
4. Autostart `~/.config/autostart/conky-timefull.desktop`:
   ```ini
   [Desktop Entry]
   Type=Application
   Name=Conky TimeFull (CBlue)
   Exec=sh -c "sleep 10 && conky -c $HOME/.conky/TimeFull"
   X-GNOME-Autostart-enabled=true
   NoDisplay=false
   ```
   (`$HOME` wurde beim Schreiben durch den absoluten Pfad ersetzt.)

## 4a. Systeminfo-Desklet (ersetzt Conky TimeFull)

Conky ist **abgeschaltet**: Prozess beendet, in `~/.config/autostart/conky-timefull.desktop`
`Hidden=true` und `X-GNOME-Autostart-enabled=false` gesetzt (Dateien bleiben für Rückbau).
Der Installer richtet Conky (Abschnitt 4) nicht mehr ein.

Stattdessen eigenes Cinnamon-Desklet `desklets/fastfetch@cinnamon-theme/`
(mit der Maus frei verschiebbar, Rechtsklick → Einstellungen):

- Oben Uhrzeit (40 pt, JetBrains Mono Light), darunter Datum in Mint-Grün
  („Samstag, 10. Oktober 2026“), dann `fastfetch --logo none --pipe --structure …`.
  Schlüssel grün (`#8fc46b`), Werte hellgrau; Aktualisierung alle 60 s.
- fastfetch läuft über `bash -c '…; :'`, sonst meldet es „Shell: cinnamon“.
- Standardmodule ohne Terminal/Terminal Font (wäre im Desklet „cinnamon“).
- Hintergrund `rgba(30,30,30,0.30)`, Rand hellgrau, Radius 14 px; Deckkraft per Regler.
- Voraussetzung: Paket `fastfetch` (Mint 22.3: `sudo apt install fastfetch`).

Schrift **JetBrains Mono** 2.304 (SIL OFL, `fonts/JetBrainsMono/`) nach
`~/.local/share/fonts/JetBrainsMono/`, dann `fc-cache -f`. **Cinnamon muss danach neu
gestartet werden** (Strg+Alt+Esc bzw. `cinnamon --replace`), sonst kennt es die Schrift nicht.

Installation:

```bash
cp -r desklets/fastfetch@cinnamon-theme ~/.local/share/cinnamon/desklets/
id=$(gsettings get org.cinnamon next-desklet-id)
gsettings set org.cinnamon enabled-desklets "['fastfetch@cinnamon-theme:$id:1375:275']"
gsettings set org.cinnamon next-desklet-id $((id+1))
```

(Position x:y wird von Cinnamon beim Verschieben aktualisiert; der Installer sollte
sie aus der Bildschirmbreite berechnen, z. B. rechts mit 450 px Abstand.)

Vorher: `enabled-desklets` = `@as []`.

Hinweis für das eigene Theme: CBlue färbt hervorgehobene Desklets rot
(`.desklet:highlight { background-color: #aa5555 }`) → auf Grau ändern.

## 4b. Systemlast-Desklet (CPU, RAM, Netzwerk)

Eigenes Desklet `desklets/sysmon@cinnamon-theme/`, gleicher Stil wie 4a
(JetBrains Mono, `rgba(30,30,30,0.30)`, Radius 14 px, Mint-Grün `#8fc46b`).
Liest nur `/proc` (keine Zusatzpakete), aktualisiert jede Sekunde, Verlauf 60 Punkte.

- **CPU**: Auslastung in % aus `/proc/stat` + Load Average aus `/proc/loadavg`.
- **RAM**: belegt = `MemTotal − MemAvailable`, in GiB und %.
- **Netz**: Download (grün) / Upload (grau) pro Sekunde aus `/proc/net/dev`;
  Schnittstelle automatisch über die Standardroute (`/proc/net/route`), in den
  Einstellungen überschreibbar. Skala passt sich automatisch an.
- Einstellungen: Schriftgröße, Graphbreite (380 px → gleich breit wie 4a),
  Graphhöhe (46 px), Deckkraft, Intervall, Verlaufslänge, Schnittstelle.

Installation analog 4a; Position auf diesem Rechner rechts oben über dem
fastfetch-Desklet:

```bash
cp -r desklets/sysmon@cinnamon-theme ~/.local/share/cinnamon/desklets/
gsettings set org.cinnamon enabled-desklets "['fastfetch@cinnamon-theme:5:1375:375', 'sysmon@cinnamon-theme:6:1375:60']"
gsettings set org.cinnamon next-desklet-id 7
```

## 5. Dock: Plank Reloaded

1. **[sudo]** Altes `plank` (0.11.89 aus Ubuntu) wurde zuerst installiert, dann durch **Plank Reloaded** ersetzt (Konflikt wird von apt aufgelöst). Installation über die offizielle PPA:
   ```bash
   curl -fsSL https://zquestz.github.io/ppa/ubuntu/KEY.gpg | sudo gpg --dearmor -o /usr/share/keyrings/zquestz-archive-keyring.gpg
   echo "deb [signed-by=/usr/share/keyrings/zquestz-archive-keyring.gpg] https://zquestz.github.io/ppa/ubuntu ./" | sudo tee /etc/apt/sources.list.d/zquestz.list
   sudo apt update && sudo apt install plank-reloaded
   ```
   Installierte Version: 0.11.176. Projekt: https://github.com/zquestz/plank-reloaded
2. Plank-Themes: alle Ordner aus `plank/themes/` nach `~/.local/share/plank/themes/` kopieren.
   - `Nebel-Grau` (**Standard**, passend zum Nebel-Wallpaper): halbtransparentes Dunkelgrau
     (Füllung `60,60,60,190` → `35,35,35,150`), heller Rand `150,150,150,140`.
   - `Nebel-Transparent`: keine Füllung, nur feiner Rand `200,200,200,90`.
   - `CBlue`: blaues Original aus `CBlue/cinnamon/dock.theme`.
3. Einstellungen (Schema `net.launchpad.plank.dock.settings`, Pfad `/net/launchpad/plank/docks/dock1/`):

   | Schlüssel | Wert |
   |---|---|
   | `theme` | `'Nebel-Grau'` (vorher `'CBlue'`) |
   | `position` | `'bottom'` |
   | `alignment` / `items-alignment` | `'center'` (Standard) |
   | `hide-mode` | `'none'` |
   | `icon-size` | `52` |
   | `zoom-enabled` / `zoom-percent` | `true` / `200` |

4. Autostart `~/.config/autostart/plank.desktop`:
   ```ini
   [Desktop Entry]
   Type=Application
   Name=Plank
   Exec=plank
   X-GNOME-Autostart-enabled=true
   X-GNOME-Autostart-Phase=Desktop
   X-GNOME-Autostart-Delay=0
   NoDisplay=false
   ```
   Ohne `X-GNOME-Autostart-Phase` startet cinnamon-session Plank erst in der letzten
   Phase „Application“, also spürbar spät nach der Anmeldung. Mit `Desktop` erscheint
   es gleich nach Leiste und Desktop (Sicherung der alten Datei: `plank.desktop.bak`).
5. Dock-Einträge (`~/.config/plank/dock1/launchers/*.dockitem`, Reihenfolge = `dock-items`):

   | Datei | Launcher |
   |---|---|
   | `applications-1.dockitem` | `docklet://applications`, `[DockyApplicationsPreferences] CustomIcon=linuxmint-logo-badge` |
   | `github-copilot.dockitem` | `file://$HOME/.local/share/applications/Github%20Copilot.desktop` |
   | `google-chrome.dockitem` | `file:///usr/share/applications/google-chrome.desktop` |
   | `home-assistant.dockitem` | `file://$HOME/.local/share/applications/WebApp-HomeAssistant0327.desktop` |
   | `ubuntu-process-manager.dockitem` | `file:///usr/share/applications/ubuntu-process-manager.desktop` |
   | `hardwaretest.dockitem` | `file:///usr/share/applications/hardwaretest.desktop` |
   | `ubuntu-package-backup.dockitem` | `file:///usr/share/applications/ubuntu-package-backup.desktop` |
   | `virtualbox.dockitem` | `file:///usr/share/applications/virtualbox.desktop` |
   | `org.gnome.Terminal.dockitem` | `file:///usr/share/applications/org.gnome.Terminal.desktop` |
   | `org.gnome.Screenshot.dockitem` | `file:///usr/share/applications/org.gnome.Screenshot.desktop` |
   | `trash.dockitem` | `docklet://trash` |

   **[maschinenspezifisch]** Diese App-Liste ist die persönliche Belegung auf diesem Rechner, nicht die Installer-Vorgabe (siehe 5a).
   Minimales Format einer `.dockitem`-Datei:
   ```ini
   [PlankDockItemPreferences]
   Launcher=file:///usr/share/applications/xyz.desktop
   ```
   Änderungen an `.dockitem`-Dateien nur bei beendetem Plank vornehmen, sonst überschreibt Plank sie.

### 5a. Standardbelegung des Docks für das Installationsprogramm

Festgelegt in `plank/default-apps.conf` (Vorlagen in `plank/launchers/`). Bei der Installation soll das Dock enthalten:

1. Anwendungsmenü (`docklet://applications`) mit Linux-Mint-Logo `linuxmint-logo-badge`
2. Dateimanager Nemo (`nemo.desktop`)
3. Firefox (`firefox.desktop`, Alternativen: Snap/Flatpak)
4. Terminal (`org.gnome.Terminal.desktop`, Alternativen: xfce4-/mate-terminal, Ptyxis)
5. Papierkorb (`docklet://trash`)

Ablauf im Installer: Plank beenden → vorhandene `~/.config/plank/dock1/launchers` sichern → Einträge gemäß `default-apps.conf` erzeugen (nur vorhandene `.desktop`-Dateien) → `dock-items` in dieser Reihenfolge setzen → Plank starten.
Offen: Bestehendes Dock des Nutzers ersetzen oder nur fehlende Standardeinträge ergänzen (beim Installer abfragen).

## 5b. Sitzungsmenü im Dock

Plank Reloaded hat kein Docklet für Sitzungsaktionen, daher ein eigener Starter
(Ordner `session/`):

- `cinnamon-theme-session` (Python/GTK3) → `~/.local/bin/` (Modus 755).
  Ohne Argument: dunkler Dialog mit Herunterfahren, Neustarten, Abmelden,
  Benutzer wechseln, Bereitschaft, Abbrechen (Esc schließt). Öffnet waagerecht
  mittig, ca. 2 cm über dem Dock (Unterkante Arbeitsbereich; DPI vom Monitor, bei
  unplausiblen Werten wie unter xrdp 96 dpi).
  Mit Argument (`shutdown|reboot|logout|switch-user|suspend`) direkte Ausführung.
- `cinnamon-theme-session.desktop` → `~/.local/share/applications/`; `Exec=` beim
  Installieren auf absoluten Pfad setzen (PATH von Plank enthält `~/.local/bin` evtl. nicht):
  `sed "s|Exec=cinnamon-theme-session|Exec=$HOME/.local/bin/cinnamon-theme-session|"`.
  Desktop-Actions → Rechtsklick im Dock zeigt die Aktionen direkt.
- Dockitem `cinnamon-theme-session.dockitem` (Plank vorher beenden), in `dock-items`
  vor `trash.dockitem` einfügen.

Befehle: `cinnamon-session-quit --power-off|--reboot|--logout --no-prompt`,
`dm-tool switch-to-greeter` (LightDM; in xrdp-Sitzungen wirkungslos), `systemctl suspend`.

## 6. Desktop-Starter wiederhergestellt

Beim Ziehen vom Desktop aufs Dock gingen Desktop-Dateien verloren (vermutlich verschoben statt verlinkt); Plank entfernte die dann ungültigen Einträge beim Neustart.
Wiederhergestellt als Kopien in `~/Schreibtisch` (ausführbar, `gio set … metadata::trusted true`):
`WebApp-HomeAssistant0327.desktop`, `hardwaretest.desktop`, `ubuntu-package-backup.desktop`.

**Regel für den Installer:** Dock-Einträge immer auf `/usr/share/applications` bzw. `~/.local/share/applications` zeigen lassen, nie auf Dateien in `~/Schreibtisch`.

## 6b. Symbol für GitHub Copilot (nur dieser Rechner)

Der eigene Starter `~/.local/share/applications/Github Copilot.desktop` nutzte
`Icon=xsi-github-symbolic`. Das ist ein einfarbiges Symbol für Leisten und wird
auf dunklem Hintergrund fast unsichtbar. Ersetzt durch das App-Symbol aus der AppImage:

```bash
~/Downloads/GitHub-Copilot-linux-x64.AppImage --appimage-extract '*.png'
cp "squashfs-root/GitHub Copilot.png" ~/.local/share/icons/hicolor/256x256/apps/github-copilot-app.png
# im .desktop: Icon=github-copilot-app   (Sicherung: *.desktop.bak)
```

Für den Installer: Starter mit `Icon=*-symbolic` im Dock erkennen und den Nutzer
auf ein farbiges Symbol hinweisen. Das GitHub-Symbol wird nicht mitgeliefert (Markenrecht).

## 7. Darstellung: Mauszeiger, Anwendungen, Symbole

Vom Nutzer in *Systemeinstellungen → Themen* gewählt (passend zum grauen Nebel).
Alle Pakete gehören zu Linux Mint (`mint-themes`, `mint-l-icons`, `mint-cursor-themes`),
müssen also nicht mitgeliefert werden.

| Bereich | Wert |
|---|---|
| Mauszeiger | `Bibata-Modern-Classic`, Größe 23 → jetzt `Nebel-Cursor` (siehe 7a) |
| Anwendungen (GTK) | `Mint-L-Dark-Grey` |
| Symbole | `Mint-L-Grey` |
| Schreibtisch (Cinnamon) | `CBlue` → wird später durch das eigene Theme ersetzt |
| Fensterrahmen | `Mint-Y` (unverändert) |
| Dunkler Modus | Dunklen Modus bevorzugen |
| Symbole in Menüs | an |
| Symbole auf Knöpfen | aus |
| Zur Klickposition in der Bildlaufleiste springen | an (GTK-Standard) |
| Überlagerungsrollbalken | an |
| Bildlaufleistenbreite überschreiben | an, 10 px |

```bash
for s in org.cinnamon.desktop.interface org.gnome.desktop.interface; do
  gsettings set $s cursor-theme 'Bibata-Modern-Classic'
  gsettings set $s gtk-theme    'Mint-L-Dark-Grey'
  gsettings set $s icon-theme   'Mint-L-Grey'
done
gsettings set org.cinnamon.desktop.interface cursor-size 23
gsettings set org.x.apps.portal color-scheme 'prefer-dark'
gsettings set org.cinnamon.desktop.interface menus-have-icons true
gsettings set org.cinnamon.desktop.interface buttons-have-icons false
gsettings set org.cinnamon.desktop.interface gtk-overlay-scrollbars true
```

Bildlaufleistenbreite: Cinnamon schreibt sie nach `~/.config/gtk-3.0/gtk.css`
(Installer: Block nur ergänzen, vorhandene Datei nicht überschreiben):

```css
/***** scrollbar slider - cinnamon-settings-generated - do not edit *****/
scrollbar slider {
	min-width: 10px;
	min-height: 10px;}
```

### 7a. Mauszeiger „Nebel-Cursor“ (dunkelgrau mit weißem Rand)

`python3 tools/build-nebel-cursor.py` erzeugt aus `/usr/share/icons/Bibata-Modern-Classic`
den Ordner `~/.icons/Nebel-Cursor`. Die schwarze Füllung wird `#3c3c3c`, der weiße Rand
bleibt; Symlinks werden übernommen. Benötigt `python3-numpy`.
Die Datei wird beim Installieren erzeugt und nicht im Repository abgelegt (Bibata, GPL-3.0).

```bash
gsettings set org.cinnamon.desktop.interface cursor-theme 'Nebel-Cursor'
gsettings set org.gnome.desktop.interface   cursor-theme 'Nebel-Cursor'
```

## 8. Eigenes Theme „Nebel“ (ersetzt CBlue)

- Wird mit `python3 tools/build-nebel-theme.py` aus `CBlue/cinnamon/` erzeugt und liegt in `Nebel/cinnamon/`. Lizenz GPL-3.0, Grundlage CBlue von Bundy01.
- Farbtausch in CSS und SVGs:
  - Blau `#5294e2` wird Mint-Grün `#7ab058`.
  - `#5a65bd` wird `#5f8c41`.
  - Bläuliche Grautöne werden neutrale Grautöne.
  - Die rote Hervorhebung `#aa5555` wird halbtransparentes Grau.
- Leiste: Hintergrund `rgba(30,30,30,0.35)`, Schrift 10.5pt.
- Ohne `Wallpaper.png`, `dock.theme` und `TimeFull`.
- Installation:
  ```bash
  cp -r Nebel ~/.themes/Nebel
  gsettings set org.cinnamon.theme name 'Nebel'
  ```

## 9. Leiste und Uhr

- `gsettings set org.cinnamon panels-height "['1:34']"` (vorher `['1:50']`).
- Uhr-Applet `calendar@cinnamon.org` mit eigenem Format:
  - In `~/.config/cinnamon/spices/calendar@cinnamon.org/<id>.json` (hier `13.json`, Sicherung `.bak`) setzen:
    - `use-custom-format` = true
    - `custom-format` = `%H:%M   %a, %-d. %b`
    - `custom-tooltip-format` = `%A, %-d. %B %Y`
  - Danach das Applet neu laden mit `ReloadXlet calendar@cinnamon.org APPLET`.
  - Die Applet-ID ermittelt das Installationsprogramm aus `enabled-applets`.

## 10. Bildschirmschoner (Sperrbildschirm)

```bash
S=org.cinnamon.desktop.screensaver
gsettings set $S use-custom-format true
gsettings set $S time-format '%H:%M'
gsettings set $S date-format '%A, %-d. %B'
gsettings set $S font-time 'JetBrains Mono Light 64'
gsettings set $S font-date 'JetBrains Mono 22'
gsettings set $S font-message 'JetBrains Mono 13'
```
Vorher war überall die Schrift `Ubuntu` eingestellt (64/24/14), `use-custom-format` stand auf false und das Datumsformat war `%A %B %-e`.

## 11. Terminal-Profil „Nebel“

- Das GNOME-Terminal-Profil mit der UUID `4e3b6c1a-9d2f-4c57-b8a1-6e0f2c9d7a11` ist als Export in `terminal/nebel-profile.dconf` abgelegt.
- Profil laden:
  ```bash
  dconf load /org/gnome/terminal/legacy/profiles:/:<uuid>/ < terminal/nebel-profile.dconf
  ```
- Danach die UUID an `/org/gnome/terminal/legacy/profiles:/list` anhängen und als `default` setzen.
- Einstellungen: Schrift JetBrains Mono 11, Hintergrund `#1e1e1e` mit 8 % Transparenz, Text `#d6d6d6`, Cursor und Grün `#8fc46b`, Markierung `#5f8c41`.
- Das alte Standardprofil `b1dcc9dd-…` bleibt erhalten.

## 12. Tag/Nacht-Wallpaper

- `python3 tools/make-day-wallpaper.py` erzeugt aus den Wallpapern eine hellere Tagvariante `*_Tag.jpg` (Helligkeit 1.45, Kontrast 0.88, PIL).
- Das Skript `daynight/cinnamon-theme-daynight` kommt nach `~/.local/bin/`. Es setzt das Tagbild von 07:00 bis 18:59, sonst das Nachtbild. Andere Uhrzeiten lassen sich in `~/.config/cinnamon-theme/daynight.conf` festlegen:
  ```bash
  CINNAMON_THEME_DAY_START=7
  CINNAMON_THEME_NIGHT_START=19
  ```
- systemd-User-Units `cinnamon-theme-daynight.{service,timer}` kommen nach `~/.config/systemd/user/`. Der Timer läuft um 07:00 und 19:00, 20 s nach dem Start und zur Sicherheit alle 15 Minuten.
  ```bash
  systemctl --user enable --now cinnamon-theme-daynight.timer
  ```
- Die Tagvariante muss im selben Ordner liegen: `~/.local/share/backgrounds/Cinnamon_Theme/`.

## 13. Anmeldebildschirm (LightDM / slick-greeter)

- Braucht root, deshalb mit `sudo system/install-lightdm.sh` ausführen.
  - Kopiert das Wallpaper nach `/usr/share/backgrounds/cinnamon-theme/`.
  - Kopiert JetBrains Mono nach `/usr/local/share/fonts/JetBrainsMono/`.
  - Schreibt `/etc/lightdm/slick-greeter.conf` mit Hintergrund, Mint-L-Dark-Grey, Mint-L-Grey, Bibata, JetBrains Mono und Uhrformat.
- Rückgängig machen mit `sudo system/install-lightdm.sh --uninstall`. Dabei wird die Sicherung `slick-greeter.conf.cinnamon-theme.bak` zurückgespielt.
- Vorher gab es keine `slick-greeter.conf`.

## 14. Installationsprogramm `install.sh`

- Aufruf: `bash install.sh` (zenity-Auswahl), `--all`, `--components a,b`, `--dock replace|add`, `--no-gui`, `--uninstall`.
- Bausteine in dieser Reihenfolge: fonts, theme, wallpaper, daynight, appearance, panel, desklets, session, plank, screensaver, terminal, lightdm.
- **Abhängigkeiten** werden aus der Auswahl ermittelt und in einem Schritt über `system/install-packages.sh` (pkexec bzw. sudo) installiert:
  - Immer: python3, python3-gi, gir1.2-gtk-3.0, dconf-cli, x11-xserver-utils, fontconfig, zenity, desktop-file-utils
  - appearance: mint-l-theme, mint-l-icons, mint-cursor-themes
  - desklets: fastfetch. Fehlt es in den Quellen (Mint 22 / Ubuntu 24.04), wird `ppa:zhangsongcui3371/fastfetch` ergänzt.
  - plank: plank-reloaded. Fehlt es, wird die Quelle von zquestz mit Schlüssel ergänzt. Das alte `plank` ersetzt apt.
  - session: cinnamon-session · terminal: gnome-terminal · lightdm: lightdm, slick-greeter · daynight: systemd
- **Sicherung**: `~/.config/cinnamon-theme/backup.tsv`
  - Je Zeile ein vorheriger gsettings- oder dconf-Wert oder eine Datei samt Vermerk „existed/new“; überschriebene Dateien liegen unter `~/.config/cinnamon-theme/orig/`.
  - `--uninstall` spielt alles rückwärts zurück und benennt den Ordner in `cinnamon-theme.removed-<Zeit>` um. Pakete bleiben installiert.
- **Maschinenspezifische Werte** werden automatisch erkannt:
  - Wallpapergröße nach dem größten Monitor (`xrandr`)
  - Desklet-x = Bildschirmbreite − 453 (sysmon y=60, fastfetch y=375)
  - Panel-ID, Uhr-Applet-ID
  - Startdatei für Firefox und Terminal
- Danach wird Cinnamon über D-Bus `org.Cinnamon.RestartCinnamon` neu gestartet, damit Schriften und Theme greifen.
- Hinweis am Ende: Dock-Starter mit `Icon=*-symbolic` (schlecht sichtbar, siehe 6b).
- Root-Skripte immer mit `/bin/bash <skript>` aufrufen, weil das Netzlaufwerk Ausführungsrechte nicht zuverlässig behält.
- Getestet in einer Sandbox (`HOME=/tmp/…`, `GSETTINGS_BACKEND=memory`): Installation und Deinstallation hinterlassen keine Reste.

## Sicherungen auf dem System

- `~/.themes/.previous-wallpaper-uri`
- `~/.themes/.previous-panel-settings`
- `~/.config/plank-backup/launchers-HHMM/` (alte Dock-Einträge)
- `~/.config/cinnamon/spices/calendar@cinnamon.org/13.json.bak`

## Offene Punkte / Ideen

- `install-lightdm.sh` muss auf diesem Rechner noch einmal mit sudo ausgeführt werden.
- Installationsprogramm auf einem frischen Mint-System testen (z. B. in VirtualBox).
