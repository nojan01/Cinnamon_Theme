// Copyright (c) 2026 Norbert Jander – MIT-Lizenz (siehe LICENSE)
// Wetter auf dem Desktop: Regenschauer, Blätter im Wind und Schneefall in
// unregelmäßigen Abständen. Die Ebene liegt über Hintergrundbild, Desktop-Symbolen
// und Desklets, aber immer unter allen Programmfenstern.
const Clutter = imports.gi.Clutter;
const Cogl = imports.gi.Cogl;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Meta = imports.gi.Meta;
const St = imports.gi.St;
const Main = imports.ui.main;
const Settings = imports.ui.settings;
const Cairo = imports.cairo;

const UUID = "weather@cinnamon-theme";
const SPLASH_MAX = 220;
const CAP_BIN = 2;         // Spaltenbreite der Schneedecke (px)
const CAP_MAX = 9;         // größte Höhe der Schneedecke (px)
const LEAF_COLORS = [
    [0.82, 0.45, 0.14], [0.74, 0.27, 0.12], [0.88, 0.64, 0.20],
    [0.58, 0.35, 0.16], [0.64, 0.56, 0.22], [0.78, 0.36, 0.10],
];
const MAPLE_COLORS = [
    [0.80, 0.16, 0.10], [0.88, 0.32, 0.08], [0.70, 0.12, 0.14], [0.92, 0.50, 0.10],
];
// rechte Hälfte eines Ahornblatts (Spitze oben bei y=1, Blattgrund bei 0), wird gespiegelt
const MAPLE = [
    [0, 1], [0.09, 0.80], [0.19, 0.83], [0.16, 0.62], [0.12, 0.42],
    [0.38, 0.52], [0.47, 0.67], [0.57, 0.57], [0.86, 0.60], [0.67, 0.39], [0.73, 0.29],
    [0.45, 0.24], [0.24, 0.15], [0.47, 0.03], [0.60, -0.13], [0.36, -0.06], [0.06, -0.06],
];
const MAPLE_TIPS = [[0, 1], [0.86, 0.60], [0.60, -0.13], [-0.86, 0.60], [-0.60, -0.13]];

let weather = null;
let extDir = "";

function rand(a, b) { return a + Math.random() * (b - a); }
function smooth(x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }

class Weather {
    constructor() {
        this.settings = new Settings.ExtensionSettings(this, UUID);
        this._keepSettings();
        this._keepId = this.settings.connect("settings-changed", () => this._saveKeep());
        const resched = () => { if (!this.event) this._schedule(); };
        this.settings.bind("active", "active", () => this._onActive());
        this.settings.bind("toggle-key", "toggleKey", () => this._bindKey());
        for (let [k, p] of [["rain", "rain"], ["leaves", "leaves"], ["snow", "snow"], ["sun", "sun"], ["seasonal", "seasonal"],
                            ["pause-min", "pauseMin"], ["pause-max", "pauseMax"]])
            this.settings.bind(k, p, resched);
        for (let [k, p] of [["duration-min", "durMin"], ["duration-max", "durMax"], ["intensity", "intensity"],
                            ["size", "size"], ["wind", "wind"]])
            this.settings.bind(k, p);
        this.settings.bind("fps", "fps", () => { if (this.timer) { this._stopTimer(); this._startTimer(); } });
        this.settings.bind("pause-covered", "pauseCovered", () => this._checkCovered());
        this.settings.bind("show-in-rdp", "showInRdp", () => this._checkCovered());
        this.settings.bind("splash", "splash");
        this.settings.bind("snowcap", "snowCap", () => { if (!this.snowCap) this._capDrop(); });
        this.settings.bind("fog", "fog", () => this._fogUpdate());
        this.settings.bind("fog-intensity", "fogIntensity");
        this.settings.bind("fog-fps", "fogFps");

        this.isRdp = !!GLib.getenv("XRDP_SESSION");
        this.layer = new Clutter.Actor({ reactive: false, clip_to_allocation: true, visible: false });
        this.shade = new St.Widget({ reactive: false, style: "background-color: rgb(16,20,28);", opacity: 0 });
        this.layer.add_child(this.shade);
        global.window_group.add_child(this.layer);
        this._restack();

        this.parts = [];
        this.pool = { rain: [], leaf: [], snow: [], splash: [], mote: [] };
        this.dock = null;          // sichtbare Plank-Leiste {x1, x2, y}
        this.dockCheck = 0;
        this.splashCount = 0;
        this.cap = null;           // Schneedecke auf dem Dock
        this.acc = { rain: 0, leaf: 0, snow: 0, sun: 0 };
        this.sunRays = null;       // Lichtkegel {sx, sy, beams[]}
        this.sunLevel = 0;
        this.lastMain = null;      // Haupteffekt des letzten Ereignisses (Wechsel Regen/Sonne)
        this.event = null;
        this.paused = false;
        this.shadeLevel = 0;
        this.timer = 0;
        this.checkTimer = 0;
        this.schedId = 0;
        this._later = 0;

        this._restackId = global.display.connect("restacked", () => this._queueRestack());
        // Dock-Größe geändert (Symbolgröße, Einträge, Thema, Position) → Leiste neu lesen
        this.plankSettings = null;
        this.dockTimers = [];
        let src = Gio.SettingsSchemaSource.get_default();
        if (src && src.lookup("net.launchpad.plank.dock.settings", true)) {
            this.plankSettings = Gio.Settings.new_with_path("net.launchpad.plank.dock.settings",
                                                            "/net/launchpad/plank/docks/dock1/");
            this._plankId = this.plankSettings.connect("changed", () => this._dockChanged());
        }
        this._mapId = global.window_manager.connect("map", (wm, a) => {
            if (a.meta_window.get_window_type() === Meta.WindowType.DOCK) this._dockChanged();
        });
        this._monitorsId = Main.layoutManager.connect("monitors-changed", () => { this._resize(); this._fogRebuild(); });
        this._resize();
        this._fogInit();
        this._bindKey();
        this._schedule(rand(30, 90));
    }

    _bindKey() {
        Main.keybindingManager.removeHotKey(UUID + "-toggle");
        if (this.toggleKey)
            Main.keybindingManager.addHotKey(UUID + "-toggle", this.toggleKey, () => {
                this.active = !this.active;
                this._onActive();
                Main.notify("Nebel: Wetter", this.active ? "Wettereffekte eingeschaltet" : "Wettereffekte ausgeschaltet");
            });
    }

    _onActive() {
        if (this.active) { if (!this.event) this._schedule(rand(20, 60)); }
        else this.stop();
        this._fogUpdate();
    }

    // ------------------------------------------------------------ Ebene
    // Muffin sortiert bei jeder Stapeländerung nur Fenster und Desklets ein; fremde
    // Ebenen rutschen dabei nach oben. Deshalb direkt unter das unterste Fenster setzen.
    _restack() {
        let wg = global.window_group;
        if (this.layer.get_parent() !== wg) return;
        let first = wg.get_children().find(c => c !== this.layer && c instanceof Meta.WindowActor);
        if (first) wg.set_child_below_sibling(this.layer, first);
        else wg.set_child_above_sibling(this.layer, null);
    }

    _queueRestack() {
        if (this._later) return;
        this._later = Meta.later_add(Meta.LaterType.BEFORE_REDRAW, () => {
            this._later = 0;
            this._restack();
            this._fogRestack();
            return false;
        });
    }

    // ------------------------------------------------------------ Nebelschwaden
    // Dauerhaft, zart, über Hintergrund, Desktop-Symbolen und Desklets, unter allen Fenstern.
    // Sparsam: 4 Schwaden werden einmal in Drittel-Auflösung gezeichnet und hochskaliert
    // (weich, wenig Speicher); danach ändern sich nur Lage, Höhe und Deckkraft – mit
    // eigener, niedriger Bildrate. Ist der Desktop verdeckt (maximiertes Fenster), steht alles.
    // Cinnamon übernimmt bei einem Update (geändertes settings-schema.json) Zahlenwerte nur,
    // wenn sie strikt zwischen min und max liegen – ein Regler am Rand (z. B. Pause 1 min)
    // fällt auf den Standard zurück. Daher eine eigene Kopie der Werte, die nach einem Update
    // genau solche verworfenen Werte wiederherstellt.
    _keepPath() {
        return GLib.build_filenamev([GLib.get_user_config_dir(), "nebel", "weather-settings.json"]);
    }

    _keepSettings() {
        let data = this.settings.settingsData;
        try {
            let [ok, bytes] = GLib.file_get_contents(this._keepPath());
            let keep = JSON.parse(new TextDecoder().decode(bytes));
            if (ok && keep.md5 !== data.__md5__) {
                for (let key in keep.values) {
                    let d = data[key], v = keep.values[key];
                    if (!d || (d.type !== "spinbutton" && d.type !== "scale")) continue;
                    if (d.value === d.default && v !== d.value && v >= d.min && v <= d.max)
                        this.settings.setValue(key, v);
                }
            }
        } catch (e) { /* noch keine Kopie */ }
        this._saveKeep();
    }

    _saveKeep() {
        let data = this.settings.settingsData, values = {};
        for (let key in data)
            if (data[key] && data[key].value !== undefined && typeof data[key].value !== "object")
                values[key] = data[key].value;
        try {
            let path = this._keepPath();
            GLib.mkdir_with_parents(GLib.path_get_dirname(path), 0o755);
            GLib.file_set_contents(path, JSON.stringify({ md5: data.__md5__, values }, null, 1));
        } catch (e) {
            global.logError("weather: Sicherung der Einstellungen: " + e);
        }
    }

    _fogInit() {
        this.fogLayer = new Clutter.Actor({ reactive: false, clip_to_allocation: true, visible: false });
        global.window_group.add_child(this.fogLayer);
        this.fogParts = [];
        this.fogTimer = 0;
        this.fogCheck = 0;
        this.fogLevel = 0;
        this._fogRebuild();
        this._fogUpdate();
    }

    _fogRebuild() {
        if (!this.fogLayer) return;
        for (let f of this.fogParts) f.actor.destroy();
        this.fogParts = [];
        let W = this.W, H = this.H, SC = 2, n = 6;
        this.fogLayer.set_position(0, 0);
        this.fogLayer.set_size(W, H);
        for (let i = 0; i < n; i++) {
            let w = Math.round(W * rand(0.5, 0.9)), h = Math.round(H * rand(0.25, 0.4));
            let a = new Clutter.Actor({ reactive: false, width: w, height: h });
            let img = this._fogTexture(Math.round(w / SC), Math.round(h / SC), Math.random() * 1e9);
            if (img) {
                a.set_content(img);
                a.set_content_gravity(Clutter.ContentGravity.RESIZE_FILL);
                a.set_content_scaling_filters(Clutter.ScalingFilter.LINEAR, Clutter.ScalingFilter.LINEAR);
            }
            a.set_pivot_point(0.5, 0.5);
            this.fogLayer.add_child(a);
            this.fogParts.push({
                actor: a, w: w, h: h,
                bx: rand(-0.3, 1.0) * W,
                by: (0.1 + 0.8 * (i + rand(0, 1)) / n) * H - h / 2,
                ax: rand(0.01, 0.03) * W, wx: 2 * Math.PI / rand(90, 180),
                ay: rand(0.02, 0.05) * H, wy: 2 * Math.PI / rand(50, 110),
                wo: 2 * Math.PI / rand(25, 60), ws: 2 * Math.PI / rand(30, 70),
                ph: rand(0, 6.28), a0: rand(0.7, 1), dx: 0, sp: rand(0.7, 1.3),
            });
        }
    }

    // Einmal berechnete Nebeltextur: Dichte aus weichen Gauß-Wolken, zum Rand hin sicher auf 0,
    // mit leichtem Rauschen (Dithering), damit die blassen Verläufe keine Stufen/Streifen bilden.
    _fogTexture(tw, th, seed) {
        let r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
        let blobs = [];
        for (let k = 0; k < 30; k++) {
            let u = 0.1 + 0.8 * (r() + r()) / 2;
            let s = th * (0.08 + r() * 0.14);
            blobs.push([u * tw, th * (0.5 + (r() - 0.5) * 0.35), 1 / (2 * s * s), 0.4 + r() * 0.6]);
        }
        // Dichte auf grobem Raster, dazwischen bilinear
        let G = 8, gw = Math.ceil(tw / G) + 2, gh = Math.ceil(th / G) + 2;
        let grid = new Float32Array(gw * gh), max = 0;
        for (let gy = 0; gy < gh; gy++)
            for (let gx = 0; gx < gw; gx++) {
                let x = gx * G, y = gy * G, d = 0;
                for (let b of blobs) {
                    let dx = x - b[0], dy = y - b[1];
                    d += b[3] * Math.exp(-(dx * dx + dy * dy) * b[2]);
                }
                let ex = Math.max(0, Math.sin(Math.PI * Math.min(1, x / tw)));
                let ey = Math.max(0, Math.sin(Math.PI * Math.min(1, y / th)));
                d *= Math.pow(ex, 1.5) * ey * ey;
                grid[gy * gw + gx] = d;
                if (d > max) max = d;
            }
        if (max <= 0) return null;
        let data = new Uint8Array(tw * th * 4), cr = 0.88, cg = 0.90, cb = 0.93, top = 0.6;
        for (let y = 0; y < th; y++) {
            let gy = y / G, y0 = Math.floor(gy), fy = gy - y0;
            for (let x = 0; x < tw; x++) {
                let gx = x / G, x0 = Math.floor(gx), fx = gx - x0, o = y0 * gw + x0;
                let d = (grid[o] * (1 - fx) + grid[o + 1] * fx) * (1 - fy) +
                        (grid[o + gw] * (1 - fx) + grid[o + gw + 1] * fx) * fy;
                let al = top * (1 - Math.exp(-2.2 * d / max)) / (1 - Math.exp(-2.2));
                let v = al * 255;
                // Rauschen ±3 Stufen, nur wo Nebel ist (Ränder bleiben exakt 0)
                if (v > 0.5) v += (Math.random() + Math.random() - 1) * 3 * Math.min(1, v / 8);
                let A = Math.max(0, Math.min(255, Math.round(v))), i = (y * tw + x) * 4;
                data[i] = Math.round(A * cr); data[i + 1] = Math.round(A * cg);
                data[i + 2] = Math.round(A * cb); data[i + 3] = A;
            }
        }
        let img = new Clutter.Image();
        try {
            img.set_data(data, Cogl.PixelFormat.RGBA_8888_PRE, tw, th, tw * 4);
        } catch (e) {
            global.logError("weather: Nebeltextur: " + e);
            return null;
        }
        return img;
    }

    _fogRestack() {
        if (!this.fogLayer) return;
        // direkt unter der Wetterebene: über Hintergrund, Symbolen und Desklets, unter allen Fenstern
        let wg = global.window_group;
        if (this.layer.get_parent() === wg) wg.set_child_below_sibling(this.fogLayer, this.layer);
    }

    _fogCovered() {
        if (this.isRdp && !this.showInRdp) return true;
        if (!this.pauseCovered) return false;
        let ws = global.workspace_manager.get_active_workspace();
        return ws.list_windows().some(w =>
            !w.minimized && w.showing_on_its_workspace() && w.get_window_type() === Meta.WindowType.NORMAL &&
            (w.is_fullscreen() || w.get_maximized() === Meta.MaximizeFlags.BOTH));
    }

    _fogUpdate() {
        if (!this.fogLayer) return;
        let on = this.active && this.fog;
        if (on && !this.fogCheck)
            this.fogCheck = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, 2, () => { this._fogUpdate(); return GLib.SOURCE_CONTINUE; });
        if (!on && this.fogCheck) { GLib.source_remove(this.fogCheck); this.fogCheck = 0; }
        let run = on && !this._fogCovered();
        if (run && !this.fogTimer) {
            this._fogRestack();
            this.fogLayer.show();
            this.fogLast = 0;
            let tl = new Clutter.Timeline({ duration: 1000, repeat_count: -1 });
            tl.connect("new-frame", () => {
                let now = GLib.get_monotonic_time();
                if ((now - this.fogLast) / 1000 < 1000 / Math.max(2, this.fogFps) - 4) return;
                this.fogLast = now;
                this._fogStep(now / 1e6);
            });
            this.fogTimer = tl;
            tl.start();
        } else if (!run && this.fogTimer) {
            this._fogStopTimer();
            this.fogLayer.hide();
        }
    }

    _fogStopTimer() {
        let tl = this.fogTimer;
        this.fogTimer = 0;
        if (tl) { tl.stop(); tl.run_dispose(); }
    }

    _fogStep(t) {
        // Regen verdichtet den Nebel, Sonne lichtet ihn
        let ev = this.event, boost = 1;
        if (ev && ev.kinds.rain) boost += 0.4 * Math.min(1, this.shadeLevel / 40);
        if (this.sunRays) boost -= 0.35 * this.sunLevel;
        let k = this.fogIntensity / 100 * boost;
        // langsames Treiben in Windrichtung (Einstellung „Wind“; bei 0 Richtung des letzten
        // Ereignisses), Richtungswechsel weich überblendet
        let dt = this.fogT ? Math.min(1, Math.max(0, t - this.fogT)) : 0;
        this.fogT = t;
        if (ev) this.fogDir = ev.dir;
        if (!this.fogDir) this.fogDir = Math.random() < 0.5 ? -1 : 1;
        let dir = Math.sign(this.wind) || this.fogDir;
        let target = dir * (6 + Math.abs(this.wind) / 100 * 24);
        this.fogV = (this.fogV || 0) + (target - (this.fogV || 0)) * Math.min(1, dt / 20);
        for (let f of this.fogParts) {
            let a = f.actor;
            f.dx += this.fogV * f.sp * dt;
            let x = f.bx + f.dx, span = this.W + f.w + 2 * f.ax;
            if (x - f.ax > this.W) f.dx -= span;
            else if (x + f.w + f.ax < 0) f.dx += span;
            a.set_position(f.bx + f.dx + Math.sin(t * f.wx + f.ph) * f.ax, f.by + Math.sin(t * f.wy + f.ph * 1.3) * f.ay);
            a.opacity = Math.round(255 * Math.min(1, k * f.a0 * (0.55 + 0.45 * Math.sin(t * f.wo + f.ph * 0.7))));
            a.scale_y = 1 + 0.08 * Math.sin(t * f.ws + f.ph);
        }
    }

    _resize() {
        let w = 0, h = 0;
        for (let m of Main.layoutManager.monitors) {
            w = Math.max(w, m.x + m.width);
            h = Math.max(h, m.y + m.height);
        }
        this.W = w; this.H = h;
        this.layer.set_position(0, 0);
        this.layer.set_size(w, h);
        this.shade.set_size(w, h);
    }

    // ------------------------------------------------------------ Zeitplan
    _schedule(secs) {
        if (this.schedId) GLib.source_remove(this.schedId);
        this.schedId = 0;
        if (!this.active) return;
        if (secs === undefined) {
            let lo = Math.max(1, this.pauseMin), hi = Math.max(lo, this.pauseMax);
            secs = rand(lo, hi) * 60;
        }
        this.schedId = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, Math.max(1, Math.round(secs)), () => {
            this.schedId = 0;
            this._startEvent(this._pickKinds());
            return GLib.SOURCE_REMOVE;
        });
    }

    _pickKinds() {
        let m = GLib.DateTime.new_now_local().get_month();
        let s = this.seasonal;
        let h = GLib.DateTime.new_now_local().get_hour();
        let ok = {
            rain: this.rain && (!s || (m >= 3 && m <= 11)),
            leaf: this.leaves && (!s || (m >= 9 && m <= 11)),
            snow: this.snow && (!s || m === 12 || m <= 2),
            sun: this.sun && h >= 8 && h < 18,      // Sonne nur tagsüber
        };
        // Sonne im Wechsel mit dem Regen: Sie folgt auf einen Regenschauer und wird sonst nicht
        // gelost (nur wenn gerade kein Regen möglich ist). Die übrigen Effekte bleiben zufällig.
        let avail = Object.keys(ok).filter(k => ok[k] && (k !== "sun" || !ok.rain));
        let main = this.lastMain === "rain" && ok.sun ? "sun"
                 : avail.length ? avail[Math.floor(Math.random() * avail.length)] : null;
        if (!main) return null;
        this.lastMain = main;
        let kinds = { [main]: 1 };
        if (main === "leaf" && ok.rain && Math.random() < 0.3) kinds.rain = 0.6;     // Herbststurm
        if (main === "rain" && ok.leaf && Math.random() < 0.4) kinds.leaf = 0.5;
        return kinds;
    }

    _startEvent(kinds, manual) {
        if (!kinds) { this._schedule(); return; }
        if (this.schedId) { GLib.source_remove(this.schedId); this.schedId = 0; }
        let lo = Math.max(10, this.durMin), hi = Math.max(lo, this.durMax);
        let windDir = this.wind !== 0 ? Math.sign(this.wind) : (Math.random() < 0.5 ? -1 : 1);
        let dur = rand(lo, hi);
        this.event = {
            kinds,
            manual: !!manual,
            t0: GLib.get_monotonic_time() / 1e6,
            dur,
            rise: manual ? 2 : dur * 0.15,     // Testknopf: sofort sichtbar
            dir: windDir,
            minWind: kinds.leaf ? rand(0.5, 0.9) : 0.15,
            ph: rand(0, 6.28),
        };
        if (!this.checkTimer)
            this.checkTimer = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, 1, () => {
                this._checkCovered();
                this._restack();
                this._fogRestack();
                return GLib.SOURCE_CONTINUE;
            });
        this.paused = false;
        this._checkCovered(true);
        if (!this.paused) this._run();
        if (kinds.sun && !this.sunRays) this._makeSun();
        if (manual) this._seed(kinds);
    }

    trigger(kinds) {
        if (kinds.rain || kinds.sun) this.lastMain = kinds.rain ? "rain" : "sun";
        this._startEvent(kinds, true);
    }

    // Testknopf: gleich einige Teilchen über den Bildschirm verteilen statt nur am Rand
    _seed(kinds) {
        let k = this.intensity / 100;
        let wind = (Math.sign(this.wind) || this.event.dir) * Math.max(Math.abs(this.wind / 100), this.event.minWind) * 200;
        let n = { rain: 120 * k, leaf: 6 * k, snow: 60 * k, sun: 30 * k };
        for (let kind in kinds) {
            for (let i = 0; i < Math.round(n[kind] * kinds[kind]); i++) {
                if (kind === "rain") this._spawnRain(wind);
                else if (kind === "leaf") this._spawnLeaf(wind);
                else if (kind === "sun") { this._spawnMote(); continue; }
                else this._spawnSnow();
                let p = this.parts[this.parts.length - 1];
                p.x = rand(0, this.W);
                p.y = rand(-0.05, kind === "rain" ? 0.9 : 0.6) * this.H;
            }
        }
    }

    stop() {
        this.event = null;
        this._clearParts();
        this._dropSun();
        this._idle();
    }

    // ------------------------------------------------------------ Ablauf
    _startTimer() {
        // Clutter-Zeitleiste statt GLib-Zeitgeber: läuft im Zeichentakt der Bühne, damit jede
        // berechnete Position auch genau einmal gezeigt wird (kein Überspringen/Verdoppeln).
        // Die Bildrate wirkt als Obergrenze.
        this.last = GLib.get_monotonic_time();
        let tl = new Clutter.Timeline({ duration: 1000, repeat_count: -1 });
        tl.connect("new-frame", () => {
            let now = GLib.get_monotonic_time();
            if ((now - this.last) / 1000 < 1000 / Math.max(5, this.fps) - 4) return;
            this._step();
        });
        this.timer = tl;
        tl.start();
    }

    _stopTimer() {
        let tl = this.timer;
        this.timer = 0;
        if (tl) { tl.stop(); tl.run_dispose(); }
    }

    // ------------------------------------------------------------ Dock (Spritzer)
    // Plank begrenzt seine Klickfläche (X-Input-Shape) auf die sichtbare Leiste;
    // dockshape.py liest sie aus.
    _updateDock() {
        this.dockCheck = GLib.get_monotonic_time();
        let win = global.get_window_actors().map(a => a.meta_window)
            .find(w => w.get_window_type() === Meta.WindowType.DOCK && /plank/i.test(w.get_wm_class() || ""));
        if (!win || (!this.splash && !this.snowCap)) { this.dock = null; return; }
        let r = win.get_buffer_rect();
        try {
            let proc = Gio.Subprocess.new(["python3", extDir + "/dockshape.py", win.get_description()],
                                          Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE);
            proc.communicate_utf8_async(null, null, (pr, res) => {
                let out = "";
                try { [, out] = pr.communicate_utf8_finish(res); } catch (e) { out = ""; }
                let v = (out || "").trim().split(/\s+/).map(Number);
                if (v.length !== 4 || v[3] < 20 || v[2] < 40) { this.dock = null; return; }
                // Beim Zoomen (Maus über dem Dock) vergrößert Plank die Klickfläche kurz –
                // dann die alte Leiste behalten. Maßstab: der für das Dock reservierte Rand.
                let mon = Main.layoutManager.primaryMonitor;
                let wa = global.workspace_manager.get_active_workspace().get_work_area_for_monitor(mon.index);
                let strut = mon.y + mon.height - (wa.y + wa.height);
                if (v[3] > (strut > 0 ? strut + 4 : 150)) return;
                this.dock = { x1: r.x + v[0], x2: r.x + v[0] + v[2], y: r.y + v[1] };
            });
        } catch (e) {
            this.dock = null;
        }
    }

    // Plank zeichnet nach einer Änderung kurz später neu; mehrmals nachlesen
    _dockChanged() {
        for (let id of this.dockTimers) GLib.source_remove(id);
        this.dockTimers = [300, 1000, 2500].map(ms => {
            let id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
                this.dockTimers = this.dockTimers.filter(x => x !== id);
                this._updateDock();
                return GLib.SOURCE_REMOVE;
            });
            return id;
        });
    }

    _spawnSplash(x, y, drop) {
        let d = drop.d, n = 2 + Math.floor(Math.random() * (2 + d * 2));
        for (let i = 0; i < n && this.splashCount < SPLASH_MAX; i++) {
            let p = this._get("splash");
            this.splashCount++;
            let s = d > 0.6 && Math.random() < 0.5 ? 2 : 1;
            p.actor.set_size(s, s);
            p.a0 = Math.min(255, drop.actor.opacity * 1.3);
            p.actor.opacity = p.a0;
            p.vx = (Math.random() < 0.5 ? -1 : 1) * rand(30, 130) + drop.vx * 0.25;
            p.vy = -rand(80, 210) * (0.6 + d * 0.6);
            p.x = x + rand(-1.5, 1.5);
            p.y = y - 1;
            p.t = 0;
            p.floor = y;
        }
    }

    // ------------------------------------------------------------ Schnee auf dem Dock
    // Höhenprofil in 2-px-Spalten über der sichtbaren Plank-Leiste; eine Zeichenfläche,
    // höchstens 4× pro Sekunde neu gezeichnet. Liegt, solange es schneit, schmilzt danach.
    _capEnsure() {
        let d = this.dock;
        if (!d) return null;
        let c = this.cap, n = Math.max(2, Math.ceil((d.x2 - d.x1) / CAP_BIN));
        if (!c) {
            let a = new St.DrawingArea({ reactive: false });
            a.connect("repaint", area => this._capDraw(area));
            this.layer.add_child(a);
            c = this.cap = { actor: a, h: new Float32Array(n), dirty: true, drawn: 0, alpha: 1 };
        } else if (c.h.length !== n) {
            // Leiste breiter/schmaler geworden: Profil umrechnen
            let o = c.h, h = new Float32Array(n);
            for (let i = 0; i < n; i++) h[i] = o[Math.min(o.length - 1, Math.floor(i * o.length / n))];
            c.h = h; c.dirty = true;
        }
        if (c.x1 !== d.x1 || c.y !== d.y || c.n !== n) {
            c.x1 = d.x1; c.y = d.y; c.n = n;
            c.actor.set_size(n * CAP_BIN, CAP_MAX + 3);
            c.actor.set_position(d.x1, d.y - CAP_MAX - 1);
            c.dirty = true;
        }
        return c;
    }

    _capHeight(x) {
        let c = this.cap;
        if (!c || c.x1 === undefined) return 0;
        let i = Math.floor((x - c.x1) / CAP_BIN);
        return i >= 0 && i < c.h.length ? c.h[i] : 0;
    }

    _capAdd(x, size) {
        let c = this._capEnsure();
        if (!c) return;
        c.alpha = 1;
        let i0 = Math.floor((x - c.x1) / CAP_BIN), amt = size * 0.6;
        for (let j = -3; j <= 3; j++) {
            let i = i0 + j;
            if (i < 0 || i >= c.h.length) continue;
            // an den abgerundeten Enden der Leiste bleibt weniger liegen
            let edge = smooth(Math.min(i, c.h.length - 1 - i) * CAP_BIN / 14);
            c.h[i] = Math.min(CAP_MAX * edge, c.h[i] + amt * Math.exp(-j * j / 4));
        }
        c.dirty = true;
    }

    _capStep(dt, snowing, now) {
        let c = this.cap;
        if (snowing) this._capEnsure();
        if (!snowing) {
            // Tauen: Höhe nimmt ab, zum Schluss ausblenden
            let any = false;
            for (let i = 0; i < c.h.length; i++) {
                c.h[i] = Math.max(0, c.h[i] - dt * (0.25 + c.h[i] * 0.12));
                if (c.h[i] > 0.3) any = true;
            }
            c.alpha = any ? 1 : Math.max(0, c.alpha - dt);
            c.dirty = true;
            if (!any && c.alpha <= 0) { this._capDrop(); return; }
        }
        if (c.dirty && now - c.drawn > 250000) {
            // Schnee rutscht: zu steile Stufen ausgleichen
            let h = c.h;
            for (let i = 1; i < h.length; i++) {
                let d = h[i] - h[i - 1];
                if (Math.abs(d) > 1.2) { let m = (Math.abs(d) - 1.2) / 2 * Math.sign(d); h[i] -= m; h[i - 1] += m; }
            }
            c.actor.opacity = Math.round(255 * c.alpha);
            c.actor.queue_repaint();
            c.dirty = false;
            c.drawn = now;
        }
    }

    _capDraw(area) {
        let c = this.cap, cr = area.get_context(), [w, hh] = area.get_surface_size();
        if (c) {
            // nur Abschnitte zeichnen, auf denen wirklich Schnee liegt (sonst entsteht ein Strich)
            let base = hh - 2, h = c.h, n = h.length, MIN = 0.6;
            let g = new Cairo.LinearGradient(0, base - CAP_MAX, 0, base + 1);
            g.addColorStopRGBA(0, 1, 1, 1, 0.97);
            g.addColorStopRGBA(1, 0.88, 0.91, 0.96, 0.95);
            for (let i = 0; i < n; i++) {
                if (h[i] < MIN) continue;
                let j = i;
                while (j + 1 < n && h[j + 1] >= MIN) j++;
                let x0 = i * CAP_BIN, x1 = (j + 1) * CAP_BIN;
                cr.moveTo(x0, base + 1);
                for (let k = i; k <= j; k++) cr.lineTo(k * CAP_BIN + CAP_BIN / 2, base + 1 - (h[k] - MIN));
                cr.lineTo(x1, base + 1);
                cr.closePath();
                i = j;
            }
            cr.setSource(g);
            cr.fill();
        }
        cr.$dispose();
    }

    _capDrop() {
        if (!this.cap) return;
        this.cap.actor.destroy();
        this.cap = null;
    }

    _run() {
        this._updateDock();
        this._restack();
        this.layer.show();
        if (!this.timer) this._startTimer();
    }

    _idle() {
        this._stopTimer();
        if (this.checkTimer) GLib.source_remove(this.checkTimer);
        this.checkTimer = 0;
        this.layer.hide();
        this.shade.opacity = 0;
        this.shadeLevel = 0;
        this._dropSun();
        this._capDrop();
        this.event = null;
        for (let k in this.pool) {
            for (let p of this.pool[k]) p.actor.destroy();
            this.pool[k] = [];
        }
        this._schedule();
    }

    _covered() {
        if (this.isRdp && !this.showInRdp) return true;
        if (!this.pauseCovered || (this.event && this.event.manual)) return false;
        let ws = global.workspace_manager.get_active_workspace();
        return ws.list_windows().some(w =>
            !w.minimized && w.showing_on_its_workspace() && w.get_window_type() === Meta.WindowType.NORMAL &&
            (w.is_fullscreen() || w.get_maximized() === Meta.MaximizeFlags.BOTH));
    }

    _checkCovered(force) {
        if (!this.event && !this.parts.length && !force) return;
        let c = this._covered();
        if (c && this.event && GLib.get_monotonic_time() / 1e6 - this.event.t0 > this.event.dur) {
            this.event = null;
            this._clearParts();
            this._dropSun();
            this._idle();
            return;
        }
        if (c === this.paused && !force) return;
        this.paused = c;
        if (c) { this._stopTimer(); this.layer.hide(); }
        else this._run();
    }

    // ------------------------------------------------------------ Teilchen
    _makeActor(kind) {
        let a;
        if (kind === "rain") {
            a = new Clutter.Actor({ reactive: false,
                background_color: new Clutter.Color({ red: 205, green: 216, blue: 230, alpha: 255 }) });
        } else if (kind === "splash") {
            a = new Clutter.Actor({ reactive: false,
                background_color: new Clutter.Color({ red: 215, green: 225, blue: 238, alpha: 255 }) });
        } else if (kind === "mote") {
            a = new St.Widget({ reactive: false });
        } else if (kind === "leaf") {
            a = new St.DrawingArea({ reactive: false });
            a.connect("repaint", area => this._drawLeaf(area));
        } else {
            a = new St.Widget({ reactive: false });
        }
        a.set_pivot_point(0.5, 0.5);
        this.layer.add_child(a);
        return a;
    }

    _get(kind) {
        let p = this.pool[kind].pop();
        if (!p) p = { kind, actor: this._makeActor(kind) };
        p.actor.show();
        this.parts.push(p);
        return p;
    }

    _free(i) {
        let p = this.parts[i];
        p.actor.hide();
        if (p.kind === "splash") this.splashCount--;
        this.parts[i] = this.parts[this.parts.length - 1];
        this.parts.pop();
        this.pool[p.kind].push(p);
    }

    _clearParts() {
        while (this.parts.length) this._free(this.parts.length - 1);
    }

    _spawnRain(windPx) {
        let p = this._get("rain"), d = Math.random(), sz = this.size / 100;
        p.vy = (750 + d * 650) * (0.9 + sz * 0.1);
        p.vx = windPx * 0.7;
        let len = Math.round((12 + d * 24) * sz);
        p.d = d; p.len = len;
        p.actor.set_size(d > 0.75 ? 2 : 1, len);
        p.actor.opacity = Math.round(60 + d * 110);
        p.x = rand(-0.2 * this.W, 1.2 * this.W);
        p.y = -len - rand(0, 60);
    }

    _spawnSnow() {
        let p = this._get("snow"), d = Math.random();
        let r = (1.2 + d * 2.8) * this.size / 100, dd = Math.max(2, Math.round(r * 2));
        p.vy = 25 + d * 55;
        p.amp = 8 + Math.random() * 22;
        p.freq = 0.3 + Math.random() * 0.8;
        p.ph = rand(0, 6.28);
        p.drift = 0.4 + d * 0.8;
        p.x = rand(-0.1 * this.W, 1.1 * this.W);
        p.y = -dd - rand(0, 40);
        p.actor.set_size(dd, dd);
        p.actor.style = `background-color: rgba(255,255,255,${(0.45 + d * 0.5).toFixed(2)}); border-radius: ${dd}px;`;
    }

    _spawnLeaf(windPx) {
        let p = this._get("leaf"), d = Math.random();
        let s = Math.round((20 + d * 22) * this.size / 100);
        let a = p.actor;
        a._maple = Math.random() < 0.25;          // etwa jedes vierte Blatt: Ahorn
        if (a._maple) s = Math.round(s * 1.2);
        let pal = a._maple ? MAPLE_COLORS : LEAF_COLORS;
        a._color = pal[Math.floor(Math.random() * pal.length)]
            .map(c => Math.max(0, Math.min(1, c + rand(-0.06, 0.06))));
        a._shape = Math.random();
        a.set_size(s, s);
        a.queue_repaint();
        a.opacity = 235;
        p.s = s;
        p.vy = 35 + d * 45;
        p.drag = 0.8 + d * 0.9;
        p.vx = windPx * p.drag;
        p.f1 = rand(0.6, 1.6); p.f2 = rand(1.0, 2.6); p.flip = rand(1.5, 4.5);
        p.ph = rand(0, 6.28);
        p.rot = rand(0, 360);
        p.spin = rand(-160, 160);
        p.t = 0;
        if (Math.abs(windPx) > 60 && Math.random() < 0.65) {
            p.x = windPx > 0 ? -s - 10 : this.W + 10;
            p.y = rand(-0.05, 0.65) * this.H;
        } else {
            p.x = rand(0, this.W);
            p.y = -s - rand(0, 40);
        }
    }

    // ------------------------------------------------------------ Sonnenstrahlen
    // Eine Sonne knapp über dem oberen Rand, davon fächern 5–8 weiche Lichtkegel nach unten.
    // Jeder Kegel wird nur einmal gezeichnet (Textur); pro Bild ändern sich nur Deckkraft
    // und Winkel – das kostet kaum Rechenzeit.
    _makeSun() {
        let W = this.W, H = this.H;
        let sx = rand(0.04, 0.16) * W, sy = -rand(0.08, 0.18) * H;   // links oben
        let sun = { sx, sy, beams: [] };
        // Richtung zur Bildschirmmitte unten, Fächer darum
        let mid = Math.atan2(W * 0.5 - sx, H - sy) * 180 / Math.PI;
        let n = Math.round(rand(5, 8)), spread = rand(38, 55);
        let len = Math.hypot(Math.max(sx, W - sx), H - sy) * 1.05;
        for (let i = 0; i < n; i++) {
            let w = Math.round(rand(0.05, 0.16) * W * this.size / 100);
            let a = new St.DrawingArea({ reactive: false, width: w, height: Math.round(len) });
            a.connect("repaint", area => this._drawBeam(area));
            a.set_pivot_point(0.5, 0);
            a.set_position(sx - w / 2, sy);
            a.opacity = 0;
            this.layer.add_child(a);
            sun.beams.push({
                actor: a,
                ang: mid + (i / Math.max(1, n - 1) - 0.5) * spread + rand(-4, 4),
                half: Math.atan2(w / 2, len * 0.6) * 180 / Math.PI,
                f1: rand(0.08, 0.2), f2: rand(0.25, 0.5), ph: rand(0, 6.28),
                sway: rand(0.6, 1.6), a0: rand(0.7, 1), cur: 0,
            });
        }
        // warmer Schein an der Sonne
        let r = Math.round(Math.min(W, H) * 0.45);
        let glow = new St.DrawingArea({ reactive: false, width: 2 * r, height: 2 * r });
        glow.connect("repaint", area => {
            let cr = area.get_context(), [w, h] = area.get_surface_size();
            let g = new Cairo.RadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
            g.addColorStopRGBA(0, 1, 0.95, 0.8, 0.55);
            g.addColorStopRGBA(0.4, 1, 0.92, 0.75, 0.2);
            g.addColorStopRGBA(1, 1, 0.9, 0.7, 0);
            cr.setSource(g);
            cr.paint();
            cr.$dispose();
        });
        glow.set_position(sx - r, sy - r);
        glow.opacity = 0;
        this.layer.add_child(glow);
        sun.glow = glow;
        this.sunRays = sun;
        this.sunLevel = 0;
    }

    _drawBeam(area) {
        let cr = area.get_context(), [w, h] = area.get_surface_size();
        // mehrere ineinanderliegende Keile → weiche Ränder; längs nach unten ausblenden
        let layers = 6;
        for (let j = 0; j < layers; j++) {
            let f = 1 - j / layers;                     // Breite: außen → innen
            let top = w * 0.06 * f, bot = w * 0.5 * f;
            let g = new Cairo.LinearGradient(0, 0, 0, h);
            g.addColorStopRGBA(0, 1, 0.96, 0.84, 0.16);
            g.addColorStopRGBA(0.4, 1, 0.95, 0.82, 0.11);
            g.addColorStopRGBA(1, 1, 0.94, 0.8, 0);
            cr.setSource(g);
            cr.moveTo(w / 2 - top, 0);
            cr.lineTo(w / 2 + top, 0);
            cr.lineTo(w / 2 + bot, h);
            cr.lineTo(w / 2 - bot, h);
            cr.closePath();
            cr.fill();
        }
        cr.$dispose();
    }

    _dropSun() {
        if (!this.sunRays) return;
        for (let b of this.sunRays.beams) b.actor.destroy();
        this.sunRays.glow.destroy();
        this.sunRays = null;
        this.sunLevel = 0;
    }

    _stepSun(t, dt, level, windPx) {
        let sun = this.sunRays, k = Math.min(1.5, this.intensity / 100);
        this.sunLevel += (level - this.sunLevel) * Math.min(1, dt * 0.8);
        if (level === 0 && this.sunLevel < 0.004) { this._dropSun(); return; }
        let L = this.sunLevel * k;
        for (let b of sun.beams) {
            // Nebel zieht durch: zwei langsame Schwingungen, gelegentlich fast ganz weg
            let fog = 0.5 + 0.3 * Math.sin(t * b.f1 + b.ph) + 0.2 * Math.sin(t * b.f2 + b.ph * 1.7);
            b.cur = b.a0 * (0.3 + 0.7 * smooth(fog));
            b.actor.opacity = Math.round(255 * Math.min(1, 1.3 * L * b.cur));
            b.actor.rotation_angle_z = -(b.ang + Math.sin(t * 0.05 + b.ph) * b.sway + windPx * 0.004);
        }
        sun.glow.opacity = Math.round(255 * Math.min(1, L * 0.8));
    }

    // Helligkeit eines Staubkorns: nur im Lichtkegel sichtbar
    _inBeam(x, y) {
        let sun = this.sunRays;
        if (!sun) return 0;
        let ang = Math.atan2(x - sun.sx, y - sun.sy) * 180 / Math.PI, best = 0;
        for (let b of sun.beams) {
            let d = (ang + b.actor.rotation_angle_z) / b.half;
            best = Math.max(best, Math.exp(-d * d) * b.cur);
        }
        return best;
    }

    _spawnMote() {
        let p = this._get("mote"), sun = this.sunRays;
        let r = rand(1, 2.4) * this.size / 100, d = Math.max(1, Math.round(r * 2));
        p.actor.set_size(d, d);
        p.actor.set_style("background-color: rgb(255,246,220); border-radius: %dpx;".replace("%d", Math.ceil(d / 2)));
        p.actor.opacity = 0;
        p.t = 0;
        p.life = rand(8, 16);
        p.vx = rand(-6, 6);
        p.vy = rand(-3, 6);
        p.amp = rand(4, 14); p.freq = rand(0.2, 0.6); p.ph = rand(0, 6.28);
        p.a0 = rand(120, 230);
        // bevorzugt dort, wo Licht ist
        let x = rand(0, this.W), y = rand(0, this.H);
        if (sun && sun.beams.length) {
            let b = sun.beams[Math.floor(Math.random() * sun.beams.length)];
            let dist = rand(0.15, 0.95) * (this.H - sun.sy) * 1.1;
            let a = (-b.actor.rotation_angle_z + rand(-1, 1) * b.half) * Math.PI / 180;
            x = sun.sx + Math.sin(a) * dist;
            y = sun.sy + Math.cos(a) * dist;
        }
        p.x = x; p.y = y;
    }

    _drawLeaf(area) {
        let cr = area.get_context();
        let [w, h] = area.get_surface_size();
        let c = area._color || LEAF_COLORS[0];
        if (area._maple) { this._drawMaple(cr, w, h, c); cr.$dispose(); return; }
        let cy = h / 2, x0 = w * 0.14, x1 = w * 0.97, L = x1 - x0;
        let bw = h * (0.24 + (area._shape || 0) * 0.2);
        cr.moveTo(x0, cy);
        cr.curveTo(x0 + L * 0.2, cy - bw, x0 + L * 0.68, cy - bw * 0.95, x1, cy);
        cr.curveTo(x0 + L * 0.68, cy + bw * 0.95, x0 + L * 0.2, cy + bw, x0, cy);
        cr.closePath();
        cr.setSourceRGBA(c[0], c[1], c[2], 0.95);
        cr.fillPreserve();
        cr.setSourceRGBA(c[0] * 0.55, c[1] * 0.55, c[2] * 0.55, 0.9);
        cr.setLineWidth(Math.max(0.7, w / 30));
        cr.stroke();
        cr.moveTo(0, cy + h * 0.05);
        cr.lineTo(x0 + L * 0.85, cy);
        cr.stroke();
        cr.$dispose();
    }

    // Ahornblatt, Spitze nach rechts (wie das einfache Blatt), Stiel links
    _drawMaple(cr, w, h, c) {
        let S = w / 1.9, x0 = w * 0.06 + 0.4 * S, cy = h / 2;
        let P = (x, y) => [x0 + y * S, cy + x * S];
        let pts = MAPLE.concat(MAPLE.slice(1).reverse().map(([x, y]) => [-x, y]));
        let [sx, sy] = P(pts[0][0], pts[0][1]);
        cr.moveTo(sx, sy);
        for (let [x, y] of pts.slice(1)) { let [px, py] = P(x, y); cr.lineTo(px, py); }
        cr.closePath();
        cr.setSourceRGBA(c[0], c[1], c[2], 0.95);
        cr.fillPreserve();
        cr.setSourceRGBA(c[0] * 0.5, c[1] * 0.5, c[2] * 0.5, 0.9);
        cr.setLineWidth(Math.max(0.6, w / 40));
        cr.setLineJoin(1);
        cr.stroke();
        // Adern vom Blattgrund zu den Lappenspitzen, Stiel
        let [bx, by] = P(0, 0.02);
        cr.setLineWidth(Math.max(0.5, w / 55));
        for (let [x, y] of MAPLE_TIPS) {
            let [tx, ty] = P(x * 0.8, y * 0.8);
            cr.moveTo(bx, by); cr.lineTo(tx, ty);
        }
        let [ex, ey] = P(0.03, -0.4);
        cr.moveTo(bx, by); cr.lineTo(ex, ey);
        cr.stroke();
    }

    _step() {
        let now = GLib.get_monotonic_time();
        let dt = Math.min((now - this.last) / 1e6, 0.1);
        this.last = now;
        let t = now / 1e6, k = this.intensity / 100;
        let ev = this.event, env = 0;
        if (ev) {
            let el = t - ev.t0;
            if (el > ev.dur) { this.event = ev = null; }
            else env = smooth(el / ev.rise) * smooth((ev.dur - el) / (ev.dur * 0.25)) *
                       (0.7 + 0.3 * Math.sin(el * 0.35 + ev.ph));
        }

        // Wind mit Böen
        let base = this.wind / 100;
        let dir = ev ? ev.dir : (Math.sign(base) || 1);
        let mag = Math.max(Math.abs(base), ev ? ev.minWind : 0);
        let gust = Math.max(0.15, 0.75 + 0.35 * Math.sin(t * 0.31) + 0.25 * Math.sin(t * 1.07 + 2) +
                                         0.15 * Math.sin(t * 2.3 + 1));
        let windPx = dir * mag * gust * 200;

        if (ev) {
            let rates = { rain: 170 * k, leaf: 5 * k * gust, snow: 5 * k, sun: 3 * k };
            for (let kind in ev.kinds) {
                this.acc[kind] += rates[kind] * ev.kinds[kind] * env * dt;
                let n = Math.min(Math.floor(this.acc[kind]), 40);
                this.acc[kind] -= Math.floor(this.acc[kind]);
                for (let i = 0; i < n; i++) {
                    if (kind === "rain") this._spawnRain(windPx);
                    else if (kind === "leaf") this._spawnLeaf(windPx);
                    else if (kind === "sun") { if (this.sunRays) this._spawnMote(); }
                    else this._spawnSnow();
                }
            }
        }

        let rainLevel = ev && ev.kinds.rain ? env * ev.kinds.rain : 0;
        let target = Math.round(Math.min(1.6, k) * 50 * rainLevel);
        this.shadeLevel += (target - this.shadeLevel) * Math.min(1, dt * 2);
        if (Math.abs(target - this.shadeLevel) < 0.5) this.shadeLevel = target;
        this.shade.opacity = Math.round(this.shadeLevel);
        if (this.sunRays) this._stepSun(t, dt, ev && ev.kinds.sun ? env * ev.kinds.sun : 0, windPx);

        let W = this.W, H = this.H;
        let rainRot = -Math.atan2(windPx * 0.7, 1000) * 180 / Math.PI;
        let tilt = Math.sin(rainRot * Math.PI / 180);
        let capOn = this.snowCap && ev && ev.kinds.snow;
        if (now - this.dockCheck > 2e6 && ev && ((this.splash && ev.kinds.rain) || capOn)) this._updateDock();
        let dock = this.splash ? this.dock : null;
        let capDock = capOn ? this.dock : null;
        for (let i = this.parts.length - 1; i >= 0; i--) {
            let p = this.parts[i], a = p.actor;
            if (p.kind === "rain") {
                p.vx += (windPx * 0.7 - p.vx) * Math.min(1, dt * 3);
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                if (p.y > H) { this._free(i); continue; }
                if (dock && p.y + p.len >= dock.y) {
                    // Spitze des (gedrehten) Tropfens
                    let bx = p.x - tilt * p.len / 2;
                    if (bx >= dock.x1 && bx <= dock.x2) {
                        if (p.y + p.len - p.vy * dt < dock.y + 2) this._spawnSplash(bx, dock.y, p);
                        this._free(i);
                        continue;
                    }
                }
                a.rotation_angle_z = rainRot;
                a.set_position(Math.round(p.x), Math.round(p.y));
            } else if (p.kind === "splash") {
                p.t += dt;
                p.vy += 1100 * dt;
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                if (p.y > p.floor || p.t > 0.8) { this._free(i); continue; }
                a.opacity = Math.round(p.a0 * Math.max(0, 1 - p.t / 0.8));
                a.set_position(p.x, p.y);
            } else if (p.kind === "mote") {
                p.t += dt;
                p.x += (p.vx + windPx * 0.03) * dt;
                p.y += p.vy * dt;
                if (p.t > p.life || !this.sunRays) { this._free(i); continue; }
                let fade = smooth(p.t / 2) * smooth((p.life - p.t) / 2);
                let x = p.x + Math.sin(t * p.freq + p.ph) * p.amp;
                a.opacity = Math.round(p.a0 * fade * this.sunLevel * this._inBeam(x, p.y) *
                                       (0.75 + 0.25 * Math.sin(t * 3 + p.ph)));
                a.set_position(x, p.y);
            } else if (p.kind === "snow") {
                p.y += p.vy * dt;
                p.x += windPx * 0.25 * p.drift * dt;
                if (p.y > H + 10) { this._free(i); continue; }
                let x = p.x + Math.sin(t * p.freq + p.ph) * p.amp;
                if (capDock) {
                    let sz = a.width, cx = x + sz / 2, bottom = p.y + sz;
                    if (bottom >= capDock.y - this._capHeight(cx) && bottom - p.vy * dt < capDock.y + 2 &&
                        cx >= capDock.x1 && cx <= capDock.x2) {
                        this._capAdd(cx, sz);
                        this._free(i);
                        continue;
                    }
                }
                a.set_position(x, p.y);  // Bruchteile: langsame Teilchen gleiten statt zu springen
            } else {
                p.t += dt;
                let want = windPx * p.drag + Math.sin(p.t * p.f1 + p.ph) * 45;
                p.vx += (want - p.vx) * Math.min(1, dt * 1.2);
                p.x += p.vx * dt;
                p.y += p.vy * (0.55 + 0.6 * Math.abs(Math.sin(p.t * p.f2 + p.ph))) * dt;
                p.rot += p.spin * (0.4 + gust * 0.6) * dt;
                if (p.y > H + 40 || p.x < -80 || p.x > W + 80) { this._free(i); continue; }
                let fl = Math.cos(p.t * p.flip + p.ph);
                a.scale_x = Math.abs(fl) < 0.15 ? (fl < 0 ? -0.15 : 0.15) : fl;
                a.rotation_angle_z = p.rot;
                a.set_position(p.x, p.y);
            }
        }

        if (this.cap) this._capStep(dt, capOn, now);

        if (!ev && !this.parts.length && this.shadeLevel < 0.5 && !this.sunRays && !this.cap) this._idle();
    }

    destroy() {
        this._stopTimer();
        if (this.checkTimer) GLib.source_remove(this.checkTimer);
        if (this.schedId) GLib.source_remove(this.schedId);
        if (this._later) Meta.later_remove(this._later);
        this._fogStopTimer();
        if (this.fogCheck) GLib.source_remove(this.fogCheck);
        if (this.fogLayer) this.fogLayer.destroy();
        Main.keybindingManager.removeHotKey(UUID + "-toggle");
        global.display.disconnect(this._restackId);
        global.window_manager.disconnect(this._mapId);
        if (this.plankSettings) this.plankSettings.disconnect(this._plankId);
        for (let id of this.dockTimers) GLib.source_remove(id);
        Main.layoutManager.disconnect(this._monitorsId);
        if (this._keepId) this.settings.disconnect(this._keepId);
        this.settings.finalize();
        this._dropSun();
        this._capDrop();
        this.layer.destroy();
    }
}

function init(metadata) { extDir = metadata.path; }

function enable() {
    weather = new Weather();
    return {
        startRain: () => weather && weather.trigger({ rain: 1 }),
        startLeaves: () => weather && weather.trigger({ leaf: 1 }),
        startSnow: () => weather && weather.trigger({ snow: 1 }),
        startSun: () => weather && weather.trigger({ sun: 1 }),
        stop: () => weather && weather.stop(),
        instance: () => weather,
    };
}

function disable() {
    if (weather) weather.destroy();
    weather = null;
}
