#!/bin/sh
set -eu

repo='lohit-dev/alibi'
api="https://api.github.com/repos/$repo/releases?per_page=10"
bin_dir="${XDG_BIN_HOME:-$HOME/.local/bin}"
app_dir="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
install_dir="${XDG_DATA_HOME:-$HOME/.local/share}/alibi"

case "$(uname -s):$(uname -m)" in
  Linux:x86_64|Linux:amd64) ;;
  *) echo 'Alibi’s curl installer currently supports 64-bit Linux. Download the installer for your system from https://github.com/lohit-dev/alibi/releases.' >&2; exit 1 ;;
esac

command -v curl >/dev/null 2>&1 || { echo 'Install curl, then run this command again.' >&2; exit 1; }

asset_url=$(curl -fsSL "$api" | grep -oE '"browser_download_url"[[:space:]]*:[[:space:]]*"[^"]+\.AppImage"' | head -n 1 | cut -d '"' -f 4 || true)
if [ -z "$asset_url" ]; then
  echo 'No Linux AppImage is available yet. Check https://github.com/lohit-dev/alibi/releases and try again when the preview finishes.' >&2
  exit 1
fi

mkdir -p "$bin_dir" "$app_dir" "$install_dir"
curl -fL "$asset_url" -o "$install_dir/Alibi.AppImage"
chmod 755 "$install_dir/Alibi.AppImage"

cat > "$bin_dir/alibi" <<EOF
#!/bin/sh
exec "$install_dir/Alibi.AppImage" "\$@"
EOF
chmod 755 "$bin_dir/alibi"

cat > "$app_dir/alibi.desktop" <<EOF
[Desktop Entry]
Name=Alibi
Comment=Private desktop work ledger
Exec=$install_dir/Alibi.AppImage
Terminal=false
Type=Application
Categories=Office;Utility;
EOF

echo 'Alibi is installed. Launch it from your applications menu or run:'
echo '  ~/.local/bin/alibi'
case ":$PATH:" in
  *":$bin_dir:"*) ;;
  *) echo "Add $bin_dir to PATH to run 'alibi' directly." ;;
esac
