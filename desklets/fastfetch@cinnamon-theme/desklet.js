// Copyright (c) 2026 Norbert Jander – MIT-Lizenz (siehe LICENSE)
const St = imports.gi.St;
const GLib = imports.gi.GLib;
const Mainloop = imports.mainloop;
const Desklet = imports.ui.desklet;
const Settings = imports.ui.settings;
const Util = imports.misc.util;

const KEY_COLOR = "#8fc46b";
const FONT = "JetBrains Mono";
const TITLE_COLOR = "#f0f0f0";

class FastfetchDesklet extends Desklet.Desklet {
    constructor(metadata, deskletId) {
        super(metadata, deskletId);
        this._clockTimer = 0;
        this._fetchTimer = 0;
        this._proc = null;

        this.settings = new Settings.DeskletSettings(this, metadata.uuid, deskletId);
        this.settings.bind("font-size", "fontSize", () => this._applyStyle());
        this.settings.bind("clock-size", "clockSize", () => this._applyStyle());
        this.settings.bind("opacity", "opacity", () => this._applyStyle());
        this.settings.bind("show-seconds", "showSeconds", () => this._tick());
        this.settings.bind("refresh-interval", "refreshInterval", () => this._scheduleFetch(0));
        this.settings.bind("modules", "modules", () => this._scheduleFetch(0));

        this._box = new St.BoxLayout({ vertical: true, style_class: "ff-desklet" });
        this._clock = new St.Label({ style_class: "ff-clock" });
        this._date = new St.Label({ style_class: "ff-date" });
        this._rule = new St.Widget({ style_class: "ff-rule" });
        this._info = new St.Label({ style_class: "ff-info", text: "fastfetch wird geladen …" });
        this._info.clutter_text.line_wrap = false;
        [this._clock, this._date, this._rule, this._info].forEach(a => this._box.add_actor(a));
        this.setContent(this._box);
        this._applyStyle();
    }

    on_desklet_added_to_desktop() {
        this._tick();
        this._scheduleFetch(0);
    }

    on_desklet_removed() {
        if (this._clockTimer) Mainloop.source_remove(this._clockTimer);
        if (this._fetchTimer) Mainloop.source_remove(this._fetchTimer);
        this._clockTimer = this._fetchTimer = 0;
        if (this._proc && this._proc.cancellable) this._proc.cancellable.cancel();
    }

    _applyStyle() {
        let a = Math.max(0, Math.min(100, this.opacity)) / 100;
        this._box.style = `background-color: rgba(30, 30, 30, ${a.toFixed(2)});`;
        this._info.style = `font-family: "${FONT}"; font-size: ${this.fontSize}pt;`;
        this._date.style = `font-family: "${FONT}"; font-size: ${Math.round(this.fontSize * 1.4)}pt;`;
        this._clock.style = `font-family: "${FONT}"; font-weight: 300; font-size: ${this.clockSize}pt;`;
    }

    _tick() {
        if (this._clockTimer) Mainloop.source_remove(this._clockTimer);
        let now = GLib.DateTime.new_now_local();
        this._clock.set_text(now.format(this.showSeconds ? "%H:%M:%S" : "%H:%M"));
        this._date.set_text(now.format("%A, %-d. %B %Y"));
        let delay = this.showSeconds ? 1000 - Math.floor(now.get_microsecond() / 1000)
                                     : (60 - now.get_second()) * 1000;
        this._clockTimer = Mainloop.timeout_add(Math.max(delay, 50), () => {
            this._clockTimer = 0;
            this._tick();
            return false;
        });
    }

    _scheduleFetch(delayMs) {
        if (this._fetchTimer) Mainloop.source_remove(this._fetchTimer);
        this._fetchTimer = Mainloop.timeout_add(delayMs, () => {
            this._fetchTimer = 0;
            this._fetch();
            this._scheduleFetch(Math.max(10, this.refreshInterval) * 1000);
            return false;
        });
    }

    _fetch() {
        if (!GLib.find_program_in_path("fastfetch")) {
            this._info.set_text("fastfetch ist nicht installiert\n(sudo apt install fastfetch)");
            return;
        }
        let cmd = "fastfetch --logo none --pipe";
        let modules = (this.modules || "").trim();
        if (modules) cmd += " --structure " + GLib.shell_quote(modules);
        // bash bleibt Elternprozess, damit fastfetch die Shell richtig erkennt.
        let argv = ["bash", "-c", cmd + "; :"];
        this._proc = Util.spawnCommandLineAsyncIO(null, (out, err, code) => {
            this._proc = null;
            if (code !== 0 || !out) {
                this._info.set_text("fastfetch-Fehler:\n" + (err || code));
                return;
            }
            this._info.clutter_text.set_markup(
                `<span font_family="${FONT}">${this._format(out)}</span>`);
        }, { argv: argv });
    }

    _format(text) {
        let esc = s => GLib.markup_escape_text(s, -1);
        return text.replace(/\s+$/, "").split("\n").map(line => {
            if (/^-+$/.test(line.trim())) return null;
            let i = line.indexOf(": ");
            if (i > 0) {
                return `<span foreground="${KEY_COLOR}" weight="bold">${esc(line.slice(0, i))}:</span> ${esc(line.slice(i + 2))}`;
            }
            return `<span foreground="${TITLE_COLOR}" weight="bold">${esc(line)}</span>`;
        }).filter(l => l !== null).join("\n");
    }
}

function main(metadata, deskletId) {
    return new FastfetchDesklet(metadata, deskletId);
}
