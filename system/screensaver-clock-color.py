#!/usr/bin/python3
import hashlib
import os
from pathlib import Path
import shutil
import stat
import sys
import tempfile


CLOCK = Path("/usr/share/cinnamon-screensaver/clock.py")
STATE_DIR = Path("/var/lib/cinnamon-theme-nebel")
BACKUP = STATE_DIR / "cinnamon-screensaver-clock.py.original"
OLD_COLOR = r'foreground=\"#FFFFFF\"'
NEW_COLOR = r'foreground=\"#B8B8B8\"'


def atomic_write(path, content):
    fd, temporary = tempfile.mkstemp(dir=path.parent, prefix=path.name + ".")
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(content)
        os.chmod(temporary, stat.S_IMODE(path.stat().st_mode))
        os.replace(temporary, path)
        invalidate_bytecode(path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def invalidate_bytecode(path):
    cache_dir = path.parent / "__pycache__"
    if cache_dir.is_dir():
        for bytecode in cache_dir.glob(f"{path.stem}.*.pyc"):
            bytecode.unlink()


def install():
    if not CLOCK.is_file():
        raise FileNotFoundError(f"Cinnamon screensaver source not found: {CLOCK}")

    content = CLOCK.read_bytes()
    old_count = content.count(OLD_COLOR.encode())
    new_count = content.count(NEW_COLOR.encode())
    if old_count == 0 and new_count == 2:
        invalidate_bytecode(CLOCK)
        return
    if old_count != 2 or new_count:
        raise ValueError(f"Unexpected Cinnamon screensaver clock markup in {CLOCK}")

    STATE_DIR.mkdir(parents=True, exist_ok=True)
    if not BACKUP.exists() or hashlib.sha256(content).digest() != hashlib.sha256(BACKUP.read_bytes()).digest():
        shutil.copy2(CLOCK, BACKUP)

    atomic_write(CLOCK, content.replace(OLD_COLOR.encode(), NEW_COLOR.encode()))


def uninstall():
    if not BACKUP.exists():
        return
    if CLOCK.is_file():
        content = CLOCK.read_bytes()
        if content.count(NEW_COLOR.encode()) == 2 and not content.count(OLD_COLOR.encode()):
            atomic_write(CLOCK, BACKUP.read_bytes())
    BACKUP.unlink()
    try:
        STATE_DIR.rmdir()
    except OSError:
        pass


def main():
    if os.geteuid() != 0:
        raise PermissionError("This operation must run as root")
    if len(sys.argv) != 2 or sys.argv[1] not in ("install", "uninstall"):
        raise ValueError("Usage: install-screensaver-color.sh install|uninstall")
    if sys.argv[1] == "install":
        install()
    else:
        uninstall()


if __name__ == "__main__":
    main()
