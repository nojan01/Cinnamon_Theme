# Cinnamon_Theme

Cinnamon-Desktop-Theme für Cinnamon 6.6, weiterentwickelt aus **CBlue 4.0**.

## Herkunft und Lizenz

- Ausgangsthema: [CBlue](https://github.com/linuxmint/cinnamon-spices-themes/tree/master/CBlue) von Bundy01 (Cinnamon Spices), inspiriert von CBlack (cloweling). Vielen Dank dafür!
- Das Paket enthält Teile unter verschiedenen Lizenzen:
  - **MIT** (`LICENSE`), © 2026 Norbert Jander: alle eigenen Bestandteile – Installationsprogramm, Einstellungsprogramm, Erweiterungen, Desklets, Skripte, Hintergrundbilder, Dokumentation.
  - **GPL-3.0** (`LICENSE.GPL-3.0`), © Bundy01 (CBlue) und 2026 Norbert Jander (Änderungen): das Cinnamon-Theme `Nebel/` und die Dock-Themes `Nebel-Grau`/`Nebel-Transparent`, weil sie von CBlue abgeleitet sind; außerdem das unveränderte `CBlue/`.
  - **SIL OFL 1.1**: Schrift JetBrains Mono (The JetBrains Mono Project Authors).
- Genaue Aufstellung: `COPYRIGHT.md`.
- Original-Dokumentation (Wallpaper, Conky, Plank): `CBlue/README.upstream.md`.

## Installation

**Paket (empfohlen):** `cinnamon-theme-nebel_<version>_all.deb` per Doppelklick installieren
oder mit `sudo apt install ./cinnamon-theme-nebel_*_all.deb`. Danach im Menü
**„Nebel-Einstellungen“** starten und auf der Seite **Einrichtung** die Bausteine
einrichten. Dort oder per Rechtsklick im Menü → „Nebel entfernen“ werden die eigenen
Einstellungen wieder rückgängig gemacht. Im Terminal geht beides mit `nebel-einrichten`.

Paket selbst bauen: `bash tools/build-deb.sh` → `dist/`.

**Ohne Paket:**

```bash
git clone https://github.com/nojan01/Cinnamon_Theme.git
cd Cinnamon_Theme
bash install.sh              # Auswahl der Bausteine per Dialog
bash install.sh --all        # alles ohne Rückfrage
bash install.sh --uninstall  # alles rückgängig machen
```

Alle benötigten Programme werden automatisch mitinstalliert, auch fastfetch (PPA
`zhangsongcui3371/fastfetch`) und Plank Reloaded (Paketquelle von zquestz). Für diese
Schritte und für den Anmeldebildschirm sind Administratorrechte nötig; das Passwort wird
abgefragt, sofern das System (polkit) nicht ohnehin ohne Passwort freigibt.

Bausteine: Schrift JetBrains Mono, Cinnamon-Theme „Nebel“, Hintergrundbild,
Tag/Nacht-Hintergrund, Darstellung (Mint-L-Grey, Bibata), Leiste, Desklets
(Systeminfo und Systemlast), Sitzungsmenü, Dock Plank, Mint-Menü → Dock, Wetter auf dem Desktop (Regen,
Blätter, Schnee, Sonnenstrahlen und wabernde Nebelschwaden – abschaltbar mit Super+Alt+W), Sperrbildschirm,
Terminal-Profil, Programm „Nebel-Einstellungen“ und Anmeldebildschirm.

Im selben Programm **Nebel-Einstellungen** (Mint-Menü → Einstellungen) lassen sich
danach alle Einstellungen ändern: Darstellung, Leiste, Mint-Menü, Dock,
Hintergrund, Desklets und Wetter. Änderungen wirken sofort.

Einzelheiten zu jeder Einstellung stehen in `SETUP-NOTES.md`.

## Inhalt

- `Nebel/` – eigenes Cinnamon-Theme (erzeugt mit `tools/build-nebel-theme.py`)
- `wallpapers/` – Hintergrundbilder 4K/5K, jeweils Nacht und Tag
- `dock/`, `extensions/dock-menu@…` – Programme aus dem Mint-Menü ins Dock aufnehmen;
  Dock-Punkt „Anwendungen“ öffnet das Mint-Menü mit Suche
- `extensions/weather@cinnamon-theme` – Wettereffekte auf dem Desktop
- `extensions/desklet-anchor@cinnamon-theme` – hält Desklets bei anderer Auflösung (RDP) sichtbar
- `settings/` – Programm „Nebel-Einstellungen“ (Python/GTK 3)
- `desklets/`, `session/`, `plank/`, `daynight/`, `terminal/`, `system/`, `fonts/`
- `CBlue/` – unverändertes Ausgangsthema
- `CBlue/cinnamon/cinnamon.css` – Cinnamon-Shell-Theme
- `CBlue/cinnamon/common-assets/` – SVG-Grafiken
- `CBlue/cinnamon/dock.theme` – Plank-Theme
- `CBlue/cinnamon/TimeFull` – Conky-Konfiguration
- `CBlue/cinnamon/Wallpaper.png` – Hintergrundbild


