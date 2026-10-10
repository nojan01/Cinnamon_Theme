// Copyright (c) 2026 Norbert Jander – MIT-Lizenz (siehe LICENSE)
// Ergänzt im Rechtsklickmenü der Programme im Mint-Menü (menu@cinnamon.org)
// den Eintrag „Zum Dock hinzufügen“. Die Klassen des Menü-Applets sind nicht
// exportiert, daher wird der Prototyp über eine laufende Instanz gefunden.
const GLib = imports.gi.GLib;
const St = imports.gi.St;
const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;
const AppletManager = imports.ui.appletManager;
const Util = imports.misc.util;

const MENU_UUID = "menu@cinnamon.org";
const MARK = "__nebelDockPatched";
const HELPER = GLib.build_filenamev([GLib.get_home_dir(), ".local", "bin", "nebel-dock-add"]);

let patched = [];
let timerId = 0;
let settingsId = 0;

function addDockItem(menu, button) {
    let appinfo = button.app && button.app.get_app_info && button.app.get_app_info();
    if (!appinfo || !appinfo.get_filename())
        return;
    let item = new PopupMenu.PopupIconMenuItem("Zum Dock hinzufügen", "xsi-list-add", St.IconType.SYMBOLIC);
    item.connect("activate", () => {
        Util.spawn([HELPER, appinfo.get_filename()]);
        button.applet.toggleContextMenu(button);
        button.applet.menu.close();
    });
    let items = menu._getMenuItems();
    let idx = items.findIndex(i => i._action === "add_to_panel");
    menu.addMenuItem(item, idx >= 0 ? idx + 1 : 0);
}

function findGenericPrototype(applet) {
    let buttons = (applet._applicationsButtons || []).concat(applet._favoriteAppButtons || []);
    for (let b of buttons) {
        let proto = Object.getPrototypeOf(b);
        while (proto && !Object.prototype.hasOwnProperty.call(proto, "populateMenu"))
            proto = Object.getPrototypeOf(proto);
        if (proto)
            return proto;
    }
    return null;
}

function patchAll() {
    let instances = AppletManager.getRunningInstancesForUuid(MENU_UUID) || [];
    for (let applet of instances) {
        let proto = findGenericPrototype(applet);
        if (!proto || proto[MARK])
            continue;
        let orig = proto.populateMenu;
        proto.populateMenu = function (menu) {
            orig.call(this, menu);
            try {
                addDockItem(menu, this);
            } catch (e) {
                global.logError("dock-menu@cinnamon-theme: " + e);
            }
        };
        proto[MARK] = orig;
        patched.push(proto);
    }
    return GLib.SOURCE_CONTINUE;
}

function init(metadata) {}

function enable() {
    patchAll();
    // Menü-Applet kann neu geladen werden (neue Klassen) – regelmäßig nachziehen
    timerId = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, 5, patchAll);
    settingsId = global.settings.connect("changed::enabled-applets", () => patchAll());
}

function disable() {
    if (timerId) GLib.source_remove(timerId);
    if (settingsId) global.settings.disconnect(settingsId);
    timerId = settingsId = 0;
    for (let proto of patched) {
        proto.populateMenu = proto[MARK];
        delete proto[MARK];
    }
    patched = [];
}
