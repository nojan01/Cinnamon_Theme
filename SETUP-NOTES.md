# Einrichtungsprotokoll (Grundlage für das spätere Installationsprogramm)

Alle bisher vorgenommenen Einstellungen, in Reihenfolge. Jede neue Änderung wird hier ergänzt.
Zielsystem: Linux Mint 22.3 Cinnamon (Cinnamon 6.6.9), X11.

Legende: **[sudo]** = benötigt Root-Rechte · **[maschinenspezifisch]** = muss der Installer erkennen bzw. abfragen.

## Ausgangszustand (für Deinstallation / Rücksetzen)

| Einstellung | Vorher |
|---|---|
| `org.cinnamon.theme name` | `CBlue` (war bereits gesetzt) |
| `org.cinnamon.desktop.interface gtk-theme` | `Mint-L-Dark-Blue` (unverändert) |
| `org.cinnamon.desktop.interface icon-theme` | `Mint-L-Blue` (unverändert) |
| `org.cinnamon.desktop.wm.preferences theme` | `Mint-Y` (unverändert) |
| `org.cinnamon.desktop.background picture-uri` | `file:///usr/share/backgrounds/linuxmint/sele_ring_center.jpg` (gesichert in `~/.themes/.previous-wallpaper-uri`) |
| `org.cinnamon panels-enabled` | `['1:0:bottom']` (gesichert in `~/.themes/.previous-panel-settings`) |
| `org.cinnamon panels-height` | `['1:50']` (unverändert) |
| Plank | nicht installiert |

## 1. Cinnamon-Theme CBlue

- Quelle: `CBlue/` in diesem Repository (CBlue 4.0, Bundy01, GPL-3.0).
- Installieren: `CBlue/` nach `~/.themes/CBlue` kopieren.
- Aktivieren: `gsettings set org.cinnamon.theme name 'CBlue'`

## 2. Wallpaper

```bash
gsettings set org.cinnamon.desktop.background picture-options 'zoom'
gsettings set org.cinnamon.desktop.background picture-uri "file://$HOME/.themes/CBlue/cinnamon/Wallpaper.png"
```

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
2. Plank-Theme: `CBlue/cinnamon/dock.theme` nach `~/.local/share/plank/themes/CBlue/dock.theme`.
3. Einstellungen (Schema `net.launchpad.plank.dock.settings`, Pfad `/net/launchpad/plank/docks/dock1/`):

   | Schlüssel | Wert |
   |---|---|
   | `theme` | `'CBlue'` |
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

   **[maschinenspezifisch]** Die App-Liste ist persönlich; der Installer sollte nur vorhandene `.desktop`-Dateien eintragen.
   Minimales Format einer `.dockitem`-Datei:
   ```ini
   [PlankDockItemPreferences]
   Launcher=file:///usr/share/applications/xyz.desktop
   ```
   Änderungen an `.dockitem`-Dateien nur bei beendetem Plank vornehmen, sonst überschreibt Plank sie.

## 6. Desktop-Starter wiederhergestellt

Beim Ziehen vom Desktop aufs Dock gingen Desktop-Dateien verloren (vermutlich verschoben statt verlinkt); Plank entfernte die dann ungültigen Einträge beim Neustart.
Wiederhergestellt als Kopien in `~/Schreibtisch` (ausführbar, `gio set … metadata::trusted true`):
`WebApp-HomeAssistant0327.desktop`, `hardwaretest.desktop`, `ubuntu-package-backup.desktop`.

**Regel für den Installer:** Dock-Einträge immer auf `/usr/share/applications` bzw. `~/.local/share/applications` zeigen lassen, nie auf Dateien in `~/Schreibtisch`.

## Sicherungen auf dem System

- `~/.themes/.previous-wallpaper-uri`
- `~/.themes/.previous-panel-settings`
- `~/.config/plank-backup/launchers-HHMM/` (alte Dock-Einträge)

## Offene Punkte / Ideen

- Höhe der Cinnamon-Leiste (Original schmaler)
- Eigener Theme-Name statt „CBlue“
- Weitere Anpassungen am Theme folgen
