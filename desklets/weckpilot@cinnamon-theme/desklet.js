// Copyright (c) 2026 Norbert Jander – MIT-Lizenz (siehe LICENSE)
// Uhr mit Leuchtziffern und nächster Wecker aus WeckPilot (github.com/nojan01/WeckPilot-Linux).
// Geweckt wird von der App selbst; das Desklet zeigt nur an und startet sie per Klick.
const St = imports.gi.St;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const PopupMenu = imports.ui.popupMenu;
const Mainloop = imports.mainloop;
const Desklet = imports.ui.desklet;
const Settings = imports.ui.settings;
const Main = imports.ui.main;
const Util = imports.misc.util;

const APP_BIN = "weckpilot";
const STATUS_FILE = GLib.build_filenamev([GLib.get_user_config_dir(), "weckpilot", "next-alarm.json"]);
const WINDOW_CHECK_MS = 3000;

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
        today: "Heute", tomorrow: "Morgen",
        none: "Kein Wecker gestellt",
        notRunning: "WeckPilot läuft nicht – Klick startet ihn",
        notInstalled: "WeckPilot ist nicht installiert",
        open: "WeckPilot öffnen",
    },
    en: {
        days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
        months: ["January", "February", "March", "April", "May", "June", "July", "August",
                 "September", "October", "November", "December"],
        date: (d, m, day, y) => `${d}, ${m} ${day}, ${y}`,
        today: "Today", tomorrow: "Tomorrow",
        none: "No alarm set",
        notRunning: "WeckPilot is not running – click to start",
        notInstalled: "WeckPilot is not installed",
        open: "Open WeckPilot",
    },
};

// Liest den nächsten Wecker, den WeckPilot in ~/.config/weckpilot/next-alarm.json ablegt
function readNextAlarm() {
    try {
        let [ok, data] = GLib.file_get_contents(STATUS_FILE);
        if (!ok) return null;
        let s = JSON.parse(imports.byteArray.toString(data));
        if (!s.enabled || typeof s.nextWake !== "string") return null;
        let m = s.nextWake.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
        if (!m) return null;
        let when = GLib.DateTime.new_local(+m[1], +m[2], +m[3], +m[4], +m[5], 0);
        if (!when) return null;
        return { when: when, label: typeof s.label === "string" ? s.label : "" };
    } catch (e) {
        return null;
    }
}

function findAppWindow() {
    for (let actor of global.get_window_actors()) {
        let win = actor.get_meta_window();
        let cls = (win.get_wm_class() || "").toLowerCase();
        let inst = (win.get_wm_class_instance() || "").toLowerCase();
        if (cls === APP_BIN || inst === APP_BIN) return win;
    }
    return null;
}

class WeckPilotDesklet extends Desklet.Desklet {
    constructor(metadata, deskletId) {
        super(metadata, deskletId);
        this._clockTimer = 0;
        this._windowTimer = 0;
        this._appRunning = null;

        this.settings = new Settings.DeskletSettings(this, metadata.uuid, deskletId);
        this.settings.bind("clock-size", "clockSize", () => this._applyStyle());
        this.settings.bind("font-size", "fontSize", () => this._applyStyle());
        this.settings.bind("opacity", "opacity", () => this._applyStyle());
        this.settings.bind("show-seconds", "showSeconds", () => this._tick());
        this.settings.bind("show-date", "showDate", () => this._tick());

        this._box = new St.BoxLayout({ vertical: true, style_class: "wp-desklet" });
        this._clock = new St.Label({ style_class: "wp-clock" });
        this._date = new St.Label({ style_class: "wp-date" });
        this._alarm = new St.Label({ style_class: "wp-alarm" });
        this._warning = new St.Label({ style_class: "wp-warning" });
        [this._clock, this._date, this._alarm, this._warning].forEach(a => this._box.add_actor(a));
        this.setContent(this._box);

        this._openItem = new PopupMenu.PopupMenuItem("");
        this._openItem.connect("activate", () => this._openApp());
        this._menu.addMenuItem(this._openItem, 0);
        setupLanguage(this, () => this._render());
        this._applyStyle();
    }

    on_desklet_added_to_desktop() {
        GLib.mkdir_with_parents(GLib.path_get_dirname(STATUS_FILE), 0o755);
        this._statusMonitor = Gio.File.new_for_path(STATUS_FILE).monitor_file(Gio.FileMonitorFlags.NONE, null);
        this._statusMonitor.connect("changed", () => this._render());
        this._windowTimer = Mainloop.timeout_add(WINDOW_CHECK_MS, () => {
            this._checkApp();
            return true;
        });
        this._render();
    }

    on_desklet_removed() {
        if (this._clockTimer) Mainloop.source_remove(this._clockTimer);
        if (this._windowTimer) Mainloop.source_remove(this._windowTimer);
        this._clockTimer = this._windowTimer = 0;
        if (this._statusMonitor) this._statusMonitor.cancel();
        if (this._langMonitor) this._langMonitor.cancel();
    }

    on_desklet_clicked(event) {
        this._openApp();
    }

    _openApp() {
        let win = findAppWindow();
        if (win) {
            Main.activateWindow(win);
        } else if (GLib.find_program_in_path(APP_BIN)) {
            Util.spawn([APP_BIN]);
        }
    }

    _applyStyle() {
        let a = Math.max(0, Math.min(100, this.opacity)) / 100;
        this._box.style = `background-color: rgba(30, 30, 30, ${a.toFixed(2)});`;
        let glow = Math.max(4, Math.round(this.clockSize / 4));
        this._clock.style = `font-size: ${this.clockSize}pt; text-shadow: 0 0 ${glow}px #6fcf4c;`;
        let small = `font-size: ${this.fontSize}pt;`;
        [this._date, this._alarm, this._warning].forEach(l => l.style = small);
    }

    _render() {
        this._checkApp(true);
        this._tick();
    }

    _checkApp(force) {
        let running = findAppWindow() !== null;
        if (!force && running === this._appRunning) return;
        this._appRunning = running;
        let t = T[this.lang];
        this._openItem.label.set_text(t.open);
        if (running) {
            this._warning.hide();
        } else {
            this._warning.set_text(GLib.find_program_in_path(APP_BIN) ? t.notRunning : t.notInstalled);
            this._warning.show();
        }
    }

    _tick() {
        if (this._clockTimer) Mainloop.source_remove(this._clockTimer);
        let now = GLib.DateTime.new_now_local();
        let t = T[this.lang];
        this._clock.set_text(now.format(this.showSeconds ? "%H:%M:%S" : "%H:%M"));
        this._date.set_text(t.date(t.days[now.get_day_of_week() - 1], t.months[now.get_month() - 1],
                                   now.get_day_of_month(), now.get_year()));
        this.showDate ? this._date.show() : this._date.hide();
        this._showAlarm(now);
        let delay = this.showSeconds ? 1000 - Math.floor(now.get_microsecond() / 1000)
                                     : (60 - now.get_second()) * 1000;
        this._clockTimer = Mainloop.timeout_add(Math.max(delay, 50), () => {
            this._clockTimer = 0;
            this._tick();
            return false;
        });
    }

    _showAlarm(now) {
        let t = T[this.lang];
        let next = readNextAlarm();
        if (!next || next.when.compare(now) <= 0) {
            this._alarm.set_text("⏰ " + t.none);
            this._alarm.style_class = "wp-alarm wp-alarm-none";
            return;
        }
        let day0 = GLib.DateTime.new_local(now.get_year(), now.get_month(), now.get_day_of_month(), 0, 0, 0);
        let days = Math.floor(next.when.difference(day0) / GLib.TIME_SPAN_DAY);
        let dayText = days === 0 ? t.today : days === 1 ? t.tomorrow
                    : t.days[next.when.get_day_of_week() - 1];
        let text = `⏰ ${dayText}, ${next.when.format("%H:%M")}`;
        if (next.label) text += ` · ${next.label}`;
        this._alarm.set_text(text);
        this._alarm.style_class = "wp-alarm";
    }
}

function main(metadata, deskletId) {
    return new WeckPilotDesklet(metadata, deskletId);
}
