#!/bin/sh
set -eu

repo='lohit-dev/alibi'
api="https://api.github.com/repos/$repo/releases?per_page=10"
command -v curl >/dev/null 2>&1 || { echo 'Install curl, then run this command again.' >&2; exit 1; }

system=$(uname -s)
architecture=$(uname -m)
assets=$(curl -fsSL "$api" | grep -oE '"browser_download_url"[[:space:]]*:[[:space:]]*"[^"]+"' | cut -d '"' -f 4 || true)

case "$system:$architecture" in
  Linux:x86_64|Linux:amd64)
    if [ -f /etc/debian_version ]; then
      package_type='deb'
      asset_url=$(printf '%s\n' "$assets" | grep -iE '_amd64\.deb$' | head -n 1 || true)
    elif [ -f /etc/redhat-release ] || [ -f /etc/fedora-release ] || command -v zypper >/dev/null 2>&1; then
      package_type='rpm'
      asset_url=$(printf '%s\n' "$assets" | grep -iE '\.x86_64\.rpm$' | head -n 1 || true)
    else
      echo 'The Linux installer supports Debian/Ubuntu and Fedora/RHEL/openSUSE. Download a package at https://github.com/lohit-dev/alibi/releases.' >&2
      exit 1
    fi
    ;;
  Darwin:arm64|Darwin:aarch64)
    asset_url=$(printf '%s\n' "$assets" | grep -iE 'aarch64\.dmg$' | head -n 1 || true)
    ;;
  Darwin:x86_64)
    asset_url=$(printf '%s\n' "$assets" | grep -iE '_x64\.dmg$' | head -n 1 || true)
    ;;
  *)
    echo "Alibi’s installer does not support $system/$architecture yet. Choose an installer at https://github.com/$repo/releases." >&2
    exit 1
    ;;
esac

if [ -z "$asset_url" ]; then
  echo 'No installer for this system is available yet. Check https://github.com/lohit-dev/alibi/releases and try again when the preview finishes.' >&2
  exit 1
fi

if [ "$system" = Darwin ]; then
  temp_dir=$(mktemp -d)
  mount_dir="$temp_dir/mount"
  mkdir -p "$mount_dir" "$HOME/Applications"
  trap 'hdiutil detach "$mount_dir" -quiet >/dev/null 2>&1 || true; rm -rf "$temp_dir"' EXIT
  curl -fL "$asset_url" -o "$temp_dir/Alibi.dmg"
  hdiutil attach "$temp_dir/Alibi.dmg" -nobrowse -quiet -mountpoint "$mount_dir"
  ditto "$mount_dir/Alibi.app" "$HOME/Applications/Alibi.app"
  hdiutil detach "$mount_dir" -quiet
  echo 'Alibi is installed in ~/Applications. Open it from Applications.'
else
  temp_dir=$(mktemp -d)
  trap 'rm -rf "$temp_dir"' EXIT
  package_file="$temp_dir/Alibi.$package_type"
  curl -fL "$asset_url" -o "$package_file"
  if [ "$(id -u)" -eq 0 ]; then
    sudo_command=''
  else
    command -v sudo >/dev/null 2>&1 || { echo 'Install sudo or run this installer as root.' >&2; exit 1; }
    sudo_command='sudo'
  fi
  if [ "$package_type" = deb ]; then
    $sudo_command apt-get install -y "$package_file"
  elif command -v dnf >/dev/null 2>&1; then
    $sudo_command dnf install -y "$package_file"
  elif command -v zypper >/dev/null 2>&1; then
    $sudo_command zypper --non-interactive install "$package_file"
  else
    $sudo_command rpm -Uvh "$package_file"
  fi
  echo 'Alibi is installed. Open it from your applications menu.'
fi
