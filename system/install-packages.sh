#!/bin/bash
# Copyright (c) 2026 Norbert Jander – MIT-Lizenz (siehe LICENSE)
# Installiert Pakete für Cinnamon_Theme (als root, z. B. über pkexec oder sudo).
# Aufruf: install-packages.sh paket1 paket2 …
# Fehlt ein Paket in den Standardquellen, wird die passende Paketquelle ergänzt:
#   fastfetch      -> PPA zhangsongcui3371/fastfetch (Ubuntu 24.04 / Mint 22 hat es nicht)
#   plank-reloaded -> https://zquestz.github.io/ppa/ubuntu
set -e
[ "$(id -u)" -eq 0 ] || { echo "Bitte als root ausführen."; exit 1; }
[ $# -gt 0 ] || exit 0
export DEBIAN_FRONTEND=noninteractive

has_candidate() { LC_ALL=C apt-cache policy "$1" 2>/dev/null | grep -q 'Candidate: [0-9]'; }

apt-get -o DPkg::Lock::Timeout=600 update -q || true
added=0
for p in "$@"; do
  case "$p" in
    fastfetch)
      if ! has_candidate fastfetch; then
        command -v add-apt-repository >/dev/null || apt-get install -y software-properties-common
        add-apt-repository -y -n ppa:zhangsongcui3371/fastfetch; added=1
      fi ;;
    plank-reloaded)
      if ! has_candidate plank-reloaded; then
        command -v curl >/dev/null && command -v gpg >/dev/null || apt-get install -y curl gpg
        KR=/usr/share/keyrings/zquestz-archive-keyring.gpg
        curl -fsSL https://zquestz.github.io/ppa/ubuntu/KEY.gpg | gpg --dearmor --yes -o "$KR"
        echo "deb [signed-by=$KR] https://zquestz.github.io/ppa/ubuntu ./" > /etc/apt/sources.list.d/zquestz.list
        added=1
      fi ;;
  esac
done
[ $added = 1 ] && apt-get -o DPkg::Lock::Timeout=600 update -q
# frisch installiertes System: Aktualisierungsverwaltung hält apt oft noch gesperrt
apt-get -o DPkg::Lock::Timeout=600 install -y "$@"
