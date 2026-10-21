// Copyright (c) 2026 Norbert Jander – MIT-Lizenz (siehe LICENSE)
const St = imports.gi.St;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const PopupMenu = imports.ui.popupMenu;
const Mainloop = imports.mainloop;
const Desklet = imports.ui.desklet;
const Settings = imports.ui.settings;
const Util = imports.misc.util;

const KEY_COLOR = "#8fc46b";
const FONT = "JetBrains Mono";
const TITLE_COLOR = "#f0f0f0";

// Sprache gemeinsam für alle Nebel-Desklets (Datei, Rechtsklick „Switch to English“)
const LANG_FILE = GLib.build_filenamev([GLib.get_user_config_dir(), "cinnamon-theme", "desklet-language"]);

function readLang() {
    try {
        let [ok, data] = GLib.file_get_contents(LANG_FILE);
        let v = ok ? imports.byteArray.toString(data).trim() : "";
        if (v === "de" || v === "en") return v;
    } catch (e) {}
    return GLib.get_language_names()[0].startsWith("de") ? "de" : "en";
}

function writeLang(v) {
    GLib.mkdir_with_parents(GLib.path_get_dirname(LANG_FILE), 0o755);
    GLib.file_set_contents(LANG_FILE, v + "\n");
}

function setupLanguage(desklet, onChange) {
    GLib.mkdir_with_parents(GLib.path_get_dirname(LANG_FILE), 0o755);
    desklet.lang = readLang();
    let item = new PopupMenu.PopupMenuItem("");
    let label = () => item.label.set_text(desklet.lang === "de" ? "Switch to English" : "Auf Deutsch umschalten");
    label();
    item.connect("activate", () => writeLang(desklet.lang === "de" ? "en" : "de"));
    desklet._menu.addMenuItem(item, 0);
    desklet._langMonitor = Gio.File.new_for_path(LANG_FILE).monitor_file(Gio.FileMonitorFlags.NONE, null);
    desklet._langMonitor.connect("changed", () => {
        let l = readLang();
        if (l === desklet.lang) return;
        desklet.lang = l;
        label();
        onChange();
    });
}

const T = {
    de: {
        days: ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"],
        months: ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August",
                 "September", "Oktober", "November", "Dezember"],
        date: (d, m, day, y) => `${d}, ${day}. ${m} ${y}`,
        loading: "fastfetch wird geladen …",
        missing: "fastfetch ist nicht installiert\n(sudo apt install fastfetch)",
        error: "fastfetch-Fehler:",
    },
    en: {
        days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
        months: ["January", "February", "March", "April", "May", "June", "July", "August",
                 "September", "October", "November", "December"],
        date: (d, m, day, y) => `${d}, ${m} ${day}, ${y}`,
        loading: "Loading fastfetch …",
        missing: "fastfetch is not installed\n(sudo apt install fastfetch)",
        error: "fastfetch error:",
    },
};

// fastfetch gibt englische Bezeichnungen aus; für Deutsch werden sie übersetzt
const KEYS_DE = {
    "OS": "System", "Host": "Rechner", "Kernel": "Kernel", "Uptime": "Laufzeit",
    "Packages": "Pakete", "Shell": "Shell", "Display": "Bildschirm",
    "Desktop Environment": "Desktop", "DE": "Desktop", "Window Manager": "Fenstermanager",
    "WM": "Fenstermanager", "WM Theme": "Fensterthema", "Theme": "Thema", "Icons": "Symbole",
    "Font": "Schrift", "Cursor": "Mauszeiger", "Terminal": "Terminal",
    "Terminal Font": "Terminalschrift", "CPU": "Prozessor", "GPU": "Grafik",
    "Memory": "Speicher", "Swap": "Auslagerung", "Disk": "Datenträger",
    "Local IP": "Lokale IP", "Locale": "Sprache", "Battery": "Akku", "Board": "Mainboard",
    "BIOS": "BIOS", "Bluetooth": "Bluetooth", "Sound": "Ton", "Wifi": "WLAN",
};
const VALUES_DE = [
    [/\b(\d+) days?\b/g, (m, n) => n + (n === "1" ? " Tag" : " Tage")],
    [/\b(\d+) hours?\b/g, "$1 Std."],
    [/\b(\d+) mins?\b/g, "$1 Min."],
    [/\[Integrated\]/g, "[integriert]"], [/\[Discrete\]/g, "[separat]"],
    [/\[External\]/g, "[extern]"], [/\[Built-in\]/g, "[intern]"],
];

function translateKey(key) {
    let m = key.match(/^([^(]+?)(\s*\(.*\))?$/);
    if (!m || !(m[1] in KEYS_DE)) return key;
    return KEYS_DE[m[1]] + (m[2] || "");
}

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
        this.settings.bind("show-clock", "showClock", () => this._applyVisibility());
        this.settings.bind("show-date", "showDate", () => this._applyVisibility());
        this.settings.bind("refresh-interval", "refreshInterval", () => this._scheduleFetch(0));
        this.settings.bind("modules", "modules", () => this._scheduleFetch(0));

        this._box = new St.BoxLayout({ vertical: true, style_class: "ff-desklet" });
        this._clock = new St.Label({ style_class: "ff-clock" });
        this._date = new St.Label({ style_class: "ff-date" });
        this._rule = new St.Widget({ style_class: "ff-rule" });
        this._raw = null;
        this._info = new St.Label({ style_class: "ff-info" });
        this._info.clutter_text.line_wrap = false;
        [this._clock, this._date, this._rule, this._info].forEach(a => this._box.add_actor(a));
        this.setContent(this._box);
        setupLanguage(this, () => { this._tick(); this._render(); });
        this._info.set_text(T[this.lang].loading);
        this._applyStyle();
        this._applyVisibility();
    }

    _applyVisibility() {
        this._clock.visible = this.showClock;
        this._date.visible = this.showDate;
        this._rule.visible = this.showClock || this.showDate;
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
        if (this._langMonitor) this._langMonitor.cancel();
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
        let t = T[this.lang];
        this._date.set_text(t.date(t.days[now.get_day_of_week() - 1], t.months[now.get_month() - 1],
                                   now.get_day_of_month(), now.get_year()));
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
            this._raw = null;
            this._info.set_text(T[this.lang].missing);
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
                this._raw = null;
                this._info.set_text(T[this.lang].error + "\n" + (err || code));
                return;
            }
            this._raw = out;
            this._render();
        }, { argv: argv });
    }

    _render() {
        if (!this._raw) return;
        this._info.clutter_text.set_markup(
            `<span font_family="${FONT}">${this._format(this._raw)}</span>`);
    }

    _format(text) {
        let esc = s => GLib.markup_escape_text(s, -1);
        return text.replace(/\s+$/, "").split("\n").map(line => {
            if (/^-+$/.test(line.trim())) return null;
            let i = line.indexOf(": ");
            if (i > 0) {
                let key = line.slice(0, i), val = line.slice(i + 2);
                if (this.lang === "de") {
                    key = translateKey(key);
                    for (let [re, rep] of VALUES_DE) val = val.replace(re, rep);
                }
                return `<span foreground="${KEY_COLOR}" weight="bold">${esc(key)}:</span> ${esc(val)}`;
            }
            return `<span foreground="${TITLE_COLOR}" weight="bold">${esc(line)}</span>`;
        }).filter(l => l !== null).join("\n");
    }
}

function main(metadata, deskletId) {
    return new FastfetchDesklet(metadata, deskletId);
}
