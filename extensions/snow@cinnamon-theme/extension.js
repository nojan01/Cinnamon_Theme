// Copyright (c) 2026 Norbert Jander – MIT-Lizenz (siehe LICENSE)
// Fallende Schneeflocken als Ebene direkt über dem Hintergrundbild
// (unter Desktop-Symbolen, Desklets und Fenstern).
const Clutter = imports.gi.Clutter;
const GLib = imports.gi.GLib;
const Meta = imports.gi.Meta;
const St = imports.gi.St;
const Main = imports.ui.main;
const Settings = imports.ui.settings;

let snow = null;

class Snow {
    constructor(uuid) {
        this.settings = new Settings.ExtensionSettings(this, uuid);
        for (let [k, p] of [["count", "count"], ["size", "size"]])
            this.settings.bind(k, p, () => this._build());
        for (let [k, p] of [["speed", "speed"], ["wind", "wind"]])
            this.settings.bind(k, p);
        this.settings.bind("fps", "fps", () => this._start());
        this.settings.bind("pause-covered", "pauseCovered", () => this._checkCovered());
        this.settings.bind("show-in-rdp", "showInRdp", () => this._checkCovered());

        this.layer = new Clutter.Actor({ reactive: false, clip_to_allocation: true });
        let bg = global.background_actor;
        global.window_group.insert_child_above(this.layer, bg);
        this.flakes = [];
        this.timer = 0;
        this.checkTimer = 0;
        this.paused = false;
        this.isRdp = !!GLib.getenv("XRDP_SESSION");

        this._monitorsId = Main.layoutManager.connect("monitors-changed", () => this._build());
        this._build();
        this._start();
        this.checkTimer = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, 1, () => {
            this._checkCovered();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _bounds() {
        let w = 0, h = 0;
        for (let m of Main.layoutManager.monitors) {
            w = Math.max(w, m.x + m.width);
            h = Math.max(h, m.y + m.height);
        }
        return [w, h];
    }

    _newFlake(f, top) {
        let depth = Math.random();                    // 0 = fern, 1 = nah
        let r = (1.2 + depth * 2.8) * this.size / 100;
        f.r = r;
        f.vy = 25 + depth * 55;                       // px/s bei 100 %
        f.amp = 8 + Math.random() * 22;
        f.freq = 0.3 + Math.random() * 0.8;
        f.phase = Math.random() * Math.PI * 2;
        f.x0 = Math.random() * this.W;
        f.y = top ? -2 * r - Math.random() * 40 : Math.random() * this.H;
        let d = Math.round(r * 2);
        f.actor.set_size(d, d);
        f.actor.style = `background-color: rgba(255,255,255,${(0.45 + depth * 0.5).toFixed(2)});` +
                        `border-radius: ${d}px;`;
    }

    _build() {
        [this.W, this.H] = this._bounds();
        this.layer.set_position(0, 0);
        this.layer.set_size(this.W, this.H);
        this.layer.destroy_all_children();
        this.flakes = [];
        for (let i = 0; i < Math.max(1, this.count); i++) {
            let f = { actor: new St.Widget({ reactive: false }) };
            this.layer.add_child(f.actor);
            this._newFlake(f, false);
            this.flakes.push(f);
        }
    }

    _start() {
        if (this.timer) GLib.source_remove(this.timer);
        this.timer = 0;
        this.last = GLib.get_monotonic_time();
        if (this.paused) return;
        this.timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Math.round(1000 / Math.max(5, this.fps)), () => {
            this._step();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _step() {
        let now = GLib.get_monotonic_time();
        let dt = Math.min((now - this.last) / 1e6, 0.25);
        this.last = now;
        let sp = this.speed / 100, wind = this.wind * 0.6;
        let t = now / 1e6;
        for (let f of this.flakes) {
            f.y += f.vy * sp * dt;
            f.x0 += wind * (0.4 + f.vy / 80) * dt;
            if (f.y > this.H + 10) this._newFlake(f, true);
            let x = f.x0 + Math.sin(t * f.freq + f.phase) * f.amp;
            x = ((x % this.W) + this.W) % this.W;
            f.actor.set_position(Math.round(x), Math.round(f.y));
        }
    }

    _covered() {
        if (this.isRdp && !this.showInRdp) return true;
        if (!this.pauseCovered) return false;
        let ws = global.workspace_manager.get_active_workspace();
        return ws.list_windows().some(w =>
            !w.minimized && w.showing_on_its_workspace() && w.get_window_type() === Meta.WindowType.NORMAL &&
            (w.is_fullscreen() || w.get_maximized() === Meta.MaximizeFlags.BOTH));
    }

    _checkCovered() {
        let c = this._covered();
        if (c === this.paused) return;
        this.paused = c;
        this.layer.visible = !c;
        this._start();
    }

    destroy() {
        if (this.timer) GLib.source_remove(this.timer);
        if (this.checkTimer) GLib.source_remove(this.checkTimer);
        Main.layoutManager.disconnect(this._monitorsId);
        this.settings.finalize();
        this.layer.destroy();
    }
}

function init(metadata) { this.uuid = metadata.uuid; }

function enable() { snow = new Snow("snow@cinnamon-theme"); }

function disable() {
    if (snow) snow.destroy();
    snow = null;
}
