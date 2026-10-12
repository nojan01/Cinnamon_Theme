// Nebel: Desklet-Anker
// Cinnamon speichert Desklet-Positionen als feste Pixel. Wird der Bildschirm kleiner
// (z. B. RDP-Fenster verkleinert), landen Desklets außerhalb. Diese Erweiterung merkt
// sich zu jeder gespeicherten Position die Bildschirmgröße und verschiebt die Desklets
// bei anderer Größe anteilig im freien Raum. Die Einstellung enabled-desklets bleibt
// unverändert; verschoben wird nur die Anzeige.

const GLib = imports.gi.GLib;
const ByteArray = imports.byteArray;
const Main = imports.ui.main;
const DeskletManager = imports.ui.deskletManager;

const KEY = 'enabled-desklets';
const FILE = GLib.build_filenamev([GLib.get_user_config_dir(), 'nebel', 'desklet-anchor.json']);

let refs = {};
let monitorsId = 0, settingsId = 0, timeoutId = 0;

function _load() {
    try {
        let [ok, data] = GLib.file_get_contents(FILE);
        refs = ok ? JSON.parse(ByteArray.toString(data)) : {};
    } catch (e) {
        refs = {};
    }
}

function _save() {
    try {
        GLib.mkdir_with_parents(GLib.path_get_dirname(FILE), 0o755);
        GLib.file_set_contents(FILE, JSON.stringify(refs));
    } catch (e) {
        global.logError('desklet-anchor: ' + e);
    }
}

function _entries() {
    return global.settings.get_strv(KEY).map(s => s.split(':'))
        .filter(e => e.length === 4)
        .map(e => ({ key: e[0] + ':' + e[1], id: e[1], x: parseInt(e[2]), y: parseInt(e[3]) }));
}

function _actor(id) {
    let d = DeskletManager.get_object_for_instance(id);
    return d && d.actor ? d.actor : null;
}

// Neue oder vom Nutzer geänderte Positionen mit der aktuellen Bildschirmgröße merken
function _record() {
    let W = global.screen_width, H = global.screen_height, changed = false, seen = {};
    for (let e of _entries()) {
        seen[e.key] = true;
        let r = refs[e.key];
        if (r && r.x === e.x && r.y === e.y)
            continue;
        let a = _actor(e.id);
        refs[e.key] = { x: e.x, y: e.y, w: a ? a.width : 0, h: a ? a.height : 0, sw: W, sh: H };
        changed = true;
    }
    for (let k in refs)
        if (!seen[k]) { delete refs[k]; changed = true; }
    if (changed)
        _save();
}

function _axis(pos, size, refScreen, curSize, screen) {
    if (refScreen === screen)
        return pos;
    let free = refScreen - size, f = free > 0 ? pos / free : 0;
    f = Math.max(0, Math.min(1, f));
    return Math.round(f * Math.max(0, screen - curSize));
}

function apply(W, H) {
    W = W || global.screen_width;
    H = H || global.screen_height;
    let pending = false;
    for (let e of _entries()) {
        let r = refs[e.key], a = _actor(e.id);
        if (!r || !a)
            continue;
        if (!a.width) { pending = true; continue; }
        if (!r.w) { r.w = a.width; r.h = a.height; }
        a.set_position(_axis(r.x, r.w, r.sw, a.width, W), _axis(r.y, r.h, r.sh, a.height, H));
    }
    return pending;
}

function _schedule(delay) {
    if (timeoutId)
        GLib.source_remove(timeoutId);
    let tries = 0;
    timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
        _record();
        if (apply() && ++tries < 20)
            return GLib.SOURCE_CONTINUE;   // Desklets noch nicht gezeichnet
        timeoutId = 0;
        return GLib.SOURCE_REMOVE;
    });
}

function init(meta) {}

function enable() {
    _load();
    monitorsId = Main.layoutManager.connect('monitors-changed', () => _schedule(400));
    // nach Ziehen, Hinzufügen oder Entfernen eines Desklets (Cinnamon lädt es dabei neu)
    settingsId = global.settings.connect('changed::' + KEY, () => _schedule(300));
    _schedule(1500);
}

function disable() {
    if (timeoutId) { GLib.source_remove(timeoutId); timeoutId = 0; }
    if (monitorsId) { Main.layoutManager.disconnect(monitorsId); monitorsId = 0; }
    if (settingsId) { global.settings.disconnect(settingsId); settingsId = 0; }
    // zurück an die gespeicherten Positionen
    for (let e of _entries()) {
        let a = _actor(e.id);
        if (a) a.set_position(e.x, e.y);
    }
}
