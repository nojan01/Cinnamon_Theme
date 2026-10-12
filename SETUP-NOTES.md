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

## 4c. Sprache der Desklets (Deutsch / English)

- Rechtsklick auf eine der beiden Anzeigen → „Switch to English“ bzw. „Auf Deutsch
  umschalten“. Die Wahl gilt für beide Desklets gleichzeitig.
- Gespeichert in `~/.config/cinnamon-theme/desklet-language` (`de` oder `en`);
  ohne Datei richtet sich die Sprache nach der Systemsprache. Beide Desklets
  beobachten die Datei und schalten sofort um.
- Übersetzt werden Datum (Wochentag, Monat, Reihenfolge), die fastfetch-Bezeichnungen
  (z. B. Uptime → Laufzeit, Memory → Speicher), Zeitangaben der Laufzeit sowie die
  Texte der Systemlast (Netz/Net, Last/Load).

## 4d. Desklet-Anker (andere Bildschirmauflösung, z. B. RDP)

- Cinnamon speichert Desklet-Positionen in `org.cinnamon enabled-desklets` als feste
  Pixel und passt sie bei geänderter Auflösung nicht an; bei kleinerem RDP-Fenster
  verschwinden rechts/unten stehende Desklets.
- Erweiterung `extensions/desklet-anchor@cinnamon-theme` (aktiviert über den Baustein
  „Desklets“ in install.sh): merkt sich zu jeder gespeicherten Position die
  Bildschirmgröße in `~/.config/nebel/desklet-anchor.json`. Bei anderer Größe
  (`monitors-changed`) wird jedes Desklet anteilig im freien Raum verschoben
  (Anteil = x / (Breite − Desklet-Breite), ebenso für y) und bleibt so ganz sichtbar.
  Zurück bei der Ausgangsgröße steht es wieder pixelgenau am alten Platz.
- `enabled-desklets` bleibt unverändert; verschoben wird nur die Anzeige. Zieht man ein
  Desklet, gilt die neue Position mit der dann aktuellen Größe als Bezug.

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
   Exec=sh -c "plank >/dev/null 2>&1 &"
   X-GNOME-Autostart-enabled=true
   X-GNOME-Autostart-Phase=Desktop
   X-GNOME-Autostart-Delay=0
   NoDisplay=false
   ```
   Ohne `X-GNOME-Autostart-Phase` startet cinnamon-session Plank erst in der letzten
   Phase „Application“, also spürbar spät nach der Anmeldung. Mit `Desktop` erscheint
   es gleich nach Leiste und Desktop (Sicherung der alten Datei: `plank.desktop.bak`).
   Plank meldet sich aber nicht bei der Sitzung an; mit `Exec=plank` wartete
   cinnamon-session deshalb 30 s („failed to register before timeout“) und startete
   Desktop/Hintergrund erst danach. Der `sh -c "… &"`-Starter beendet sich sofort,
   damit läuft die Anmeldung ohne Wartezeit weiter.
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
gsettings set org.cinnamon.desktop.interface cursor-size 24   # früher 23 – gibt es im Thema nicht
printf '[icon theme]\nInherits=Nebel-Cursor\n' > ~/.icons/default/index.theme   # ebenso ~/.local/share/icons/default
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
  - Mauszeiger: mit `--cursor ~/.icons/Nebel-Cursor` wird der graue Nebel-Cursor nach
    `/usr/share/icons/Nebel-Cursor` kopiert und eingestellt (sonst Bibata schwarz).
    `install.sh` übergibt ihn automatisch, wenn er erzeugt wurde.
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
- Stand „eingerichtet“ (`--list`, Nebel-Einstellungen): Nach jedem ausgeführten Baustein schreibt die Hauptschleife eine Zeile `mark<TAB>baustein` in `backup.tsv` (nur einmal). Ausnahme: der Anmeldebildschirm wird nur bei Erfolg markiert. Bis 1.0.12 markierten sich nur fünf Bausteine selbst.

## 15. Installationspaket (.deb) und Lizenzen

- `bash tools/build-deb.sh` baut `dist/cinnamon-theme-nebel_<VERSION>_all.deb`. Die Version steht in `VERSION`, `dist/` ist von Git ausgeschlossen.
- Inhalt:
  - `/usr/share/cinnamon-theme-nebel/`: install.sh, Theme, Wallpaper, Desklets usw.
  - `/usr/bin/nebel-einrichten`: ruft install.sh auf (für das Terminal, ohne eigenen Menüeintrag).
  - `/usr/bin/nebel-einstellungen` und `/usr/share/applications/nebel-einstellungen.desktop`:
    ein einziger Menüeintrag für Einrichten, Einstellen und Entfernen (siehe 19), mit den
    Aktionen „Einrichten“ und „Nebel entfernen“.
  - `/usr/share/doc/cinnamon-theme-nebel/copyright` im DEP-5-Format.
- Die Einstellungen sind pro Benutzer und werden daher nicht vom Paket gesetzt, sondern über „Nebel-Einstellungen“ → Einrichtung.
- Depends: nur Standardpakete. fastfetch und plank-reloaded stehen unter Suggests, weil sie Fremdquellen brauchen. Diese richtet `nebel-einrichten` selbst ein (siehe 14).
- Lizenzen (siehe `COPYRIGHT.md`):
  - MIT, © 2026 Norbert Jander (`LICENSE`): eigene Bestandteile
  - GPL-3.0 (`LICENSE.GPL-3.0`): `Nebel/` (abgeleitet von CBlue) und `CBlue/`
  - OFL 1.1: JetBrains Mono
  - Der Mauszeiger (Bibata, GPL-3.0) wird nur erzeugt und nicht mitgeliefert.
- Copyright-Kopfzeile in allen eigenen Skripten und Desklets, Anzeige im Einrichtungsdialog und mit `nebel-einrichten --version`.

## 16. Mint-Menü → Dock

Das Mint-Menü kann Programme nicht per Ziehen an externe Fenster wie Plank
übergeben (nur internes Clutter-Drag-and-drop). Ersatz:

- **Rechtsklick „Zum Dock hinzufügen“** – Cinnamon-Erweiterung
  `extensions/dock-menu@cinnamon-theme` (installiert nach
  `~/.local/share/cinnamon/extensions/`, aktiviert in
  `org.cinnamon enabled-extensions`). Sie ergänzt `populateMenu` der
  Programmknöpfe des Menü-Applets `menu@cinnamon.org`.
- **Favoriten → Dock** – `~/.local/bin/nebel-dock-add --watch-favorites`
  (Autostart `~/.config/autostart/nebel-dock-sync.desktop`) beobachtet
  `org.cinnamon favorite-apps`; neu hinzugefügte Favoriten kommen ins Dock.
  Bekannter Stand: `~/.config/cinnamon-theme/dock-sync.json`. Entfernen aus den
  Favoriten lässt das Dock unverändert.
  Es läuft immer nur ein Exemplar (D-Bus-Name `de.little_tools.NebelDockSync`,
  ein neues löst ein älteres ab – wichtig bei mehreren xrdp-Sitzungen).
- Beides nutzt die D-Bus-Schnittstelle von Plank:
  `net.launchpad.plank /net/launchpad/plank/dock1 net.launchpad.plank.Items.Add(file-URI)`.
- Von Hand: `nebel-dock-add org.gnome.Calculator.desktop`.
- **Dock-Punkt „Anwendungen“ mit Suche** (ab 1.0.8) – Planks Docklet
  `applications` kennt keine Suche. Ersetzt durch den Starter
  `~/.local/share/applications/nebel-menu.desktop` (aus `dock/`), Dock-Eintrag
  `nebel-menu.dockitem`. Er ruft
  `gdbus call --session --dest org.Cinnamon --object-path /de/little_tools/NebelMenu --method de.little_tools.NebelMenu.Open`.
  Die Erweiterung `dock-menu@cinnamon-theme` stellt diese Methode bereit und
  öffnet das Original-Mint-Menü (`menu@cinnamon.org`, mit Suchfeld) unten im
  Arbeitsbereich direkt über dem Dock, linksbündig mit dem Außenrand des Docks
  (ersetzt dafür vorübergehend `_calculatePosition` des Menüs). Der Rand wird
  berechnet aus Plank-D-Bus `GetHoverPosition` des ersten Dock-Eintrags (Mitte)
  − halbe `icon-size` − (`HorizPadding` + `ItemPadding`/2)/10 × `icon-size`
  − `LineWidth` aus `dock.theme`; ohne Plank-Daten mittig über der Maus. Erneuter Aufruf
  schließt es. In `plank/default-apps.conf` steht dafür `menu`; ohne Baustein
  `dockmenu` wird weiter das Docklet verwendet. Bei „nur ergänzen“ ersetzt der
  Installer ein vorhandenes Docklet `applications` an derselben Stelle.
  Altes Docklet hier gesichert: `~/.config/plank-backup/applications-1.dockitem.docklet`.
- **Durchsichtigkeit des Mint-Menüs** – Systemeinstellungen → Erweiterungen →
  „Nebel: Zum Dock hinzufügen“ → Zahnrad → „Deckkraft des Menühintergrunds“
  (10–100 %, Standard 75 %). Farbe wie die Füllung des Plank-Docks
  (`FillStartColor` aus `dock.theme` des eingestellten Plank-Themes,
  Nebel-Grau: Grau 60), Rahmen wie `OuterStrokeColor`, Seitenleiste
  (`.appmenu-sidebar`) durchsichtig. Stolpersteine:
  - Das Menü-Applet setzt beim Öffnen `max-height`/`max-width` per
    `set_style` und löscht damit fremde Inline-Stile → die Erweiterung ergänzt
    ihre Angaben nach jedem Öffnen (`open-state-changed`).
  - `box-shadow` aus `.menu` liegt bei St unter der ganzen durchsichtigen
    Fläche und dunkelt sie ab → `box-shadow: none`.
  - Verläufe mit Transparenz zeichnet St nur in der Endfarbe → kein Verlauf.
  Beim Abschalten der Erweiterung gilt wieder `.menu` aus dem Theme.

## 17. Wetter auf dem Desktop (Regen, Blätter, Schnee)

- Cinnamon-Erweiterung `extensions/weather@cinnamon-theme` „Nebel: Wetter“, Baustein
  `weather` in `install.sh`. Ersetzt den Schneefall-Prototyp `snow@cinnamon-theme`
  (wird beim Einrichten aus `enabled-extensions` entfernt).
- Ablauf: Nach einer zufälligen Pause (Standard 4–15 min) startet ein Ereignis mit
  zufälliger Dauer (40–120 s), sanftem Ein- und Ausblenden und schwankender Stärke.
  Ereignisse: Regenschauer (Desktop wird leicht abgedunkelt), Blätter im Wind
  (Böen, Taumeln, Drehen), Schneefall; gelegentlich Regen + Blätter („Herbststurm“).
- „Nach Jahreszeit“ (Standard an): Blätter Sep–Nov, Schnee Dez–Feb, Regen März–Nov.
- Zwischen den Ereignissen läuft kein Timer – die Erweiterung kostet dann nichts.
- **Abschalten:** Hauptschalter „Wettereffekte eingeschaltet“, einzelne Schalter je
  Effekt, Tastenkürzel **Super+Alt+W** (Ein/Aus mit Meldung) oder die Erweiterung in
  Systemeinstellungen → Erweiterungen deaktivieren. Dort auch Knöpfe zum sofortigen
  Auslösen bzw. Beenden.
- **Programme bleiben effektfrei:** Die Ebene liegt in `global.window_group` direkt
  unter dem untersten Fenster (über Hintergrund, Desktop-Symbolen und Desklets).
  Muffin sortiert bei jedem Stapelwechsel nur Fenster und Desklets ein, fremde Ebenen
  rutschen nach oben (beim Prototyp lag der Schnee deshalb über dem Copilot-Fenster).
  Lösung: bei `global.display` „restacked“ (über `Meta.later_add`) und während eines
  Ereignisses jede Sekunde neu einsortieren.
- Weitere Einstellungen: Stärke, Größe, Wind, Bildrate, Anhalten bei
  maximiertem/Vollbild-Fenster, Anzeige in RDP-Sitzungen (seit 1.0.7 Standard an,
  damit sich die Effekte auch per RDP testen lassen; unter xrdp rendert llvmpipe per
  Prozessor, bei Bedarf abschalten).
- Takt: Die Animation läuft über eine `Clutter.Timeline` (Signal `new-frame`) im Zeichentakt
  der Bühne, nicht über einen GLib-Zeitgeber – sonst wurden Positionen gelegentlich
  übersprungen oder doppelt gezeigt. Die Bildrate ist nur noch Obergrenze. Blätter und Schnee
  werden auf Bruchteile von Pixeln gesetzt (nicht gerundet), damit langsame Teilchen gleiten
  statt in 1-px-Schritten zu springen. Über RDP überträgt xrdp jedes Bild, das erzeugt
  Netzlast; Bildrate senken oder „Auch in RDP-Sitzungen zeigen“ ausschalten.
- Spritzer auf dem Dock (Schalter „Spritzer auf dem Dock“, Standard an): Plank begrenzt
  seine Klickfläche (X-Input-Shape) genau auf die sichtbare Leiste. `dockshape.py` liest sie
  per ctypes (libXext `XShapeGetRectangles`, ShapeInput) aus; die Erweiterung ruft es beim
  Start und während Regen alle 5 s asynchron auf (Fenster: Typ DOCK, Klasse Plank). Trifft
  die Tropfenspitze die Oberkante, verschwindet der Tropfen und 2–5 Tröpfchen (1–2 px)
  fliegen im Bogen hoch (Schwerkraft 1100 px/s², höchstens 0,8 s, insgesamt max. 220).
  Bei ausgeblendetem Dock (Klickfläche < 20 px hoch) gibt es keine Spritzer.
  Größenänderungen: Bei jeder Änderung der Plank-Einstellungen (`dock1`: Symbolgröße,
  Einträge, Thema, Position) und beim Erscheinen eines Dock-Fensters wird die Leiste nach
  0,3 / 1 / 2,5 s neu gelesen, während Regen zusätzlich alle 2 s. Ist die Klickfläche höher
  als der reservierte Dock-Rand (Bildschirmunterkante − Arbeitsbereich, +4 px) – etwa
  beim Zoomen –, bleibt die alte Leiste gültig. Getestet: 36 / 52 / 64 px.
- 1.0.7 behebt: Beim Ausblenden blieb die Regen-Abdunkelung durch Rundung bei
  Deckkraft 3 hängen – das Ereignis endete nie, es wurde kein neues eingeplant.
- Hinweis: Wird die Einstellungsdatei unter `~/.config/cinnamon/spices/` von außen
  ersetzt, übernimmt die laufende Erweiterung das erst nach dem Neuladen.

- Testknöpfe („Regen jetzt“ …): blenden in 2 s ein statt über 15 % der Dauer, verteilen
  gleich Teilchen über den Bildschirm und laufen auch bei maximierten Fenstern
  (sonst wirkte der Knopf minutenlang wirkungslos).

## 18. RDP mit Grafikbeschleunigung (glamor) – nur dieser Rechner

Nicht Teil von install.sh/.deb (betrifft den Systemtreiber von xrdp).
Der selbst gebaute `xorgxrdp` 0.10.5 war ohne glamor kompiliert → RDP-Sitzungen
renderten per Software (llvmpipe). Neu gebaut mit glamor (Intel RPL-P über
`/dev/dri/renderD128`, `xorg.conf` unverändert):

```bash
sudo apt install -y libgbm-dev libegl-dev
git -C ~/Downloads/xorgxrdp archive v0.10.5 | tar -x -C /tmp/xorgxrdp-glamor
cd /tmp/xorgxrdp-glamor && ./bootstrap && ./configure --enable-glamor && make -j
sudo make install        # vorher Sicherung der Paketdateien nach /var/backups
```

Danach RDP **abmelden** und neu anmelden. Prüfen:
`glxinfo -B` → „Accelerated: yes“, „Mesa Intel(R) Graphics (RPL-P)“;
`~/.xorgxrdp.10.log` → „use glamor set“.

Rückweg: `sudo tar -xzf /var/backups/xorgxrdp-ohne-glamor-20261011-164329.tgz -C /`
(oder alte .deb aus `~/Downloads/xorgxrdp` mit `dpkg -i`). Achtung: ein
xorgxrdp-Update aus dem Paket würde glamor wieder entfernen.

## 19. Programm „Nebel-Einstellungen“

`settings/nebel-einstellungen` (Python 3, GTK 3), Starter `nebel-einstellungen.desktop`
(Kategorie Einstellungen). Das .deb legt es nach `/usr/bin`, `install.sh` (Baustein
`settings`) ohne Paket nach `~/.local/bin` und `~/.local/share/applications`.
Aufruf mit `--page setup|appearance|panel|menu|dock|background|desklets|weather` öffnet
gleich die passende Seite. Texte deutsch, sonst englisch (nach `LANGUAGE`/`LANG`).

Alle Änderungen wirken sofort:

| Seite | Was | Wie |
|---|---|---|
| Einrichtung | Bausteine auswählen und einrichten, alles entfernen | ruft `install.sh --components a,b` bzw. `--uninstall` auf, Ausgabe im Protokoll; Stand aus `install.sh --list` (Marken in `backup.tsv`) |
| Darstellung | Cinnamon-, GTK-, Symbol-, Zeiger-Theme, Zeigergröße, Farbschema, Schriften, Textskalierung | gsettings; GTK/Symbole/Zeiger in `org.cinnamon.desktop.interface` **und** `org.gnome.desktop.interface` |
| Leiste | Höhe der ersten Leiste, eigenes Uhrformat | `org.cinnamon panels-height`; Kalender-Applet wie unten |
| Mint-Menü | Deckkraft des Menüs | Erweiterung `dock-menu@cinnamon-theme` |
| Dock | Theme, Symbolgröße, Zoom, Ausblenden, Position | `net.launchpad.plank.dock.settings` unter `/net/launchpad/plank/docks/dock1/` |
| Hintergrund | Tag/Nacht an/aus, Uhrzeiten | `systemctl --user enable/disable --now cinnamon-theme-daynight.timer`; `~/.config/cinnamon-theme/daynight.conf`, danach einmal `cinnamon-theme-daynight` |
| Desklets | Sprache, Systeminfo, Systemlast | Datei `~/.config/cinnamon-theme/desklet-language`; Desklet-Einstellungen wie unten |
| Wetter | alle Optionen der Erweiterung, Knöpfe „Regen jetzt“ … | Erweiterung `weather@cinnamon-theme` |

**Mauszeiger:** Die Zeigergröße bietet nur die Größen an, die das gewählte Zeigerthema
enthält (aus der Xcursor-Datei `cursors/left_ptr`). Nebel-Cursor enthält zusätzlich 16, 18 und 20 px; `tools/build-nebel-cursor.py`
rechnet sie aus der 96-px-Stufe herunter (Bibata selbst beginnt bei 22 px): weißen Rand um 1 px
verdicken, dann Lanczos (python3-pil). Einfaches Mitteln verwischte den dünnen Rand. Zwischengrößen wie 20 oder 23 werden auf
die nächste vorhandene gerundet, deshalb änderte sich vorher sichtbar nichts. Ein Wechsel des
Zeigerthemas schreibt außerdem `~/.icons/default/index.theme` und
`~/.local/share/icons/default/index.theme` (`Inherits=<Thema>`), so wie Cinnamons Themen-Modul.

**Farbschema:** `org.x.apps.portal color-scheme` allein wirkt nur bei Programmen mit
Dunkelmodus (libadwaita, Firefox …). „Hell“ und „Dunkel“ wechseln daher auch das GTK-Thema auf
die passende Variante (Mint-L-Grey ↔ Mint-L-Dark-Grey, Mint-Y ↔ Mint-Y-Dark, Adwaita ↔
Adwaita-dark), falls es sie gibt. „Programme entscheiden“ lässt das Thema unverändert.

**Xlet-Einstellungen (Erweiterungen, Desklets, Applets)** werden aus der Datei
`~/.config/cinnamon/spices/<uuid>/<instanz>.json` gelesen und die Bedienelemente aus
deren Schema gebaut (header, switch, spinbutton, scale, combobox, entry, button,
`dependency`). Zum Ändern: Wert in die Datei schreiben **und**
`org.Cinnamon.updateSetting(uuid, instanz, key, json)` per D-Bus aufrufen – erst das
löst in Cinnamon das `changed`-Signal aus. Knöpfe rufen
`org.Cinnamon.activateCallback(callback, uuid, instanz)`. Tastenkürzel werden nur
angezeigt; „Alle Optionen …“ öffnet dafür `xlet-settings`.

„Nebel einrichten“ ist seit 1.0.8 kein eigener Menüeintrag mehr, sondern die erste Seite
„Einrichtung“. Ist noch nichts eingerichtet, öffnet das Programm auf dieser Seite, sonst
auf „Darstellung“. install.sh vermerkt seinen Pfad in `~/.config/cinnamon-theme/install-path`,
damit das Programm es auch ohne Paket (Aufruf aus dem Repository) findet. Mit
`NEBEL_FROM_SETTINGS=1` lässt install.sh den abschließenden zenity-Hinweis weg;
Rückfragen (Passwort, Dock ersetzen?) kommen weiter als Dialog.
`nebel-einstellungen --uninstall` entspricht `install.sh --uninstall`.

Die Uhrzeiten von Tag/Nacht brauchen keinen eigenen Timer: der Timer läuft
zusätzlich alle 15 Minuten, das Skript entscheidet nach `daynight.conf`.

## Sicherungen auf dem System

- `/var/backups/xorgxrdp-ohne-glamor-20261011-164329.tgz` – xorgxrdp-Treiber vor glamor (Abschnitt 18)

- `~/.themes/.previous-wallpaper-uri`
- `~/.themes/.previous-panel-settings`
- `~/.config/plank-backup/launchers-HHMM/` (alte Dock-Einträge)
- `~/.config/cinnamon/spices/calendar@cinnamon.org/13.json.bak`

## Offene Punkte / Ideen

- `install-lightdm.sh` muss auf diesem Rechner noch einmal mit sudo ausgeführt werden.
- Installationsprogramm auf einem frischen Mint-System testen (z. B. in VirtualBox).
