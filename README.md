# Cinnamon_Theme

Cinnamon-Desktop-Theme für Cinnamon 6.6, weiterentwickelt aus **CBlue 4.0**.

## Herkunft und Lizenz

- Ausgangsthema: [CBlue](https://github.com/linuxmint/cinnamon-spices-themes/tree/master/CBlue) von Bundy01 (Cinnamon Spices), inspiriert von CBlack (cloweling).
- Lizenz: GPL-3.0 (siehe `LICENSE`). Abgeleitete Versionen stehen ebenfalls unter GPL-3.0.
- Original-Dokumentation (Wallpaper, Conky, Plank): `CBlue/README.upstream.md`.

## Inhalt

- `CBlue/cinnamon/cinnamon.css` – Cinnamon-Shell-Theme
- `CBlue/cinnamon/common-assets/` – SVG-Grafiken
- `CBlue/cinnamon/dock.theme` – Plank-Theme
- `CBlue/cinnamon/TimeFull` – Conky-Konfiguration
- `CBlue/cinnamon/Wallpaper.png` – Hintergrundbild

## Installation (Test)

```bash
cp -r CBlue ~/.themes/
gsettings set org.cinnamon.theme name 'CBlue'
```

Cinnamon neu laden: `Strg+Alt+Esc`.
