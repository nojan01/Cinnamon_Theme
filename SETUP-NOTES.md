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
   NoDisplay=false
   ```
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
  Benutzer wechseln, Bereitschaft, Abbrechen (Esc schließt). Öffnet direkt über
  dem Dock (Arbeitsbereich-Unterkante), waagerecht am Mauszeiger ausgerichtet.
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
| Mauszeiger | `Bibata-Modern-Classic`, Größe 23 |
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

## Sicherungen auf dem System

- `~/.themes/.previous-wallpaper-uri`
- `~/.themes/.previous-panel-settings`
- `~/.config/plank-backup/launchers-HHMM/` (alte Dock-Einträge)

## Offene Punkte / Ideen

- Höhe der Cinnamon-Leiste (Original schmaler)
- Eigener Theme-Name statt „CBlue“
- Weitere Anpassungen am Theme folgen
