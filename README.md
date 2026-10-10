# Cinnamon_Theme

Cinnamon-Desktop-Theme für Cinnamon 6.6, weiterentwickelt aus **CBlue 4.0**.

## Herkunft und Lizenz

- Ausgangsthema: [CBlue](https://github.com/linuxmint/cinnamon-spices-themes/tree/master/CBlue) von Bundy01 (Cinnamon Spices), inspiriert von CBlack (cloweling).
- Lizenz: GPL-3.0 (siehe `LICENSE`). Abgeleitete Versionen stehen ebenfalls unter GPL-3.0.
- Original-Dokumentation (Wallpaper, Conky, Plank): `CBlue/README.upstream.md`.

## Installation

```bash
git clone https://github.com/nojan01/Cinnamon_Theme.git
cd Cinnamon_Theme
bash install.sh              # Auswahl der Bausteine per Dialog
bash install.sh --all        # alles ohne Rückfrage
bash install.sh --uninstall  # alles rückgängig machen
```

Alle benötigten Programme werden automatisch mitinstalliert, auch fastfetch (PPA
`zhangsongcui3371/fastfetch`) und Plank Reloaded (Paketquelle von zquestz). Für diese
Schritte und für den Anmeldebildschirm wird das Passwort abgefragt.

Bausteine: Schrift JetBrains Mono, Cinnamon-Theme „Nebel“, Hintergrundbild,
Tag/Nacht-Hintergrund, Darstellung (Mint-L-Grey, Bibata), Leiste, Desklets
(Systeminfo und Systemlast), Sitzungsmenü, Dock Plank, Sperrbildschirm,
Terminal-Profil und Anmeldebildschirm.

Einzelheiten zu jeder Einstellung stehen in `SETUP-NOTES.md`.

## Inhalt

- `Nebel/` – eigenes Cinnamon-Theme (erzeugt mit `tools/build-nebel-theme.py`)
- `wallpapers/` – Hintergrundbilder 4K/5K, jeweils Nacht und Tag
- `desklets/`, `session/`, `plank/`, `daynight/`, `terminal/`, `system/`, `fonts/`
- `CBlue/` – unverändertes Ausgangsthema
- `CBlue/cinnamon/cinnamon.css` – Cinnamon-Shell-Theme
- `CBlue/cinnamon/common-assets/` – SVG-Grafiken
- `CBlue/cinnamon/dock.theme` – Plank-Theme
- `CBlue/cinnamon/TimeFull` – Conky-Konfiguration
- `CBlue/cinnamon/Wallpaper.png` – Hintergrundbild


