#!/usr/bin/env bash
set -e

# ─── Colors ───────────────────────────────────────────────────────────────────
BOLD="\033[1m"
CYAN="\033[36m"
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
RESET="\033[0m"

# ─── Ensure dialog is available ───────────────────────────────────────────────
if ! command -v dialog &>/dev/null; then
  echo -e "  ${YELLOW}◈ Menginstall 'dialog' terlebih dahulu...${RESET}"
  if command -v apt-get &>/dev/null; then
    sudo apt-get install -y dialog -qq
  elif command -v brew &>/dev/null; then
    brew install dialog
  else
    echo -e "  ${RED}✖ Tidak bisa install dialog. Lanjut tanpa TUI.${RESET}"
    USE_PLAIN=1
  fi
fi

TITLE="KuroCodex Installer"
HEIGHT=20
WIDTH=60

# ─── Helper: dialog atau plain fallback ───────────────────────────────────────
msg() {
  if [[ -z "$USE_PLAIN" ]]; then
    dialog --title "$TITLE" --msgbox "$1" $HEIGHT $WIDTH
  else
    echo -e "\n  $1\n"
  fi
}

yesno() {
  # $1 = pertanyaan, return 0=yes 1=no
  if [[ -z "$USE_PLAIN" ]]; then
    dialog --title "$TITLE" --yesno "$1" 10 $WIDTH
    return $?
  else
    read -rp "  $1 [y/N] " ans
    [[ "$ans" =~ ^[Yy]$ ]]
  fi
}

checklist() {
  # Tampilkan checklist paket, return item yang dipilih ke stdout
  if [[ -z "$USE_PLAIN" ]]; then
    dialog --title "$TITLE" \
      --checklist "Pilih paket yang ingin diinstall:\n(SPACE untuk pilih, ENTER konfirmasi)" \
      $HEIGHT $WIDTH 12 \
      "${@}" \
      3>&1 1>&2 2>&3
  else
    # Plain fallback: print semua dan minta konfirmasi
    echo -e "  Paket yang bisa diinstall:"
    local items=("$@")
    local i=0
    local names=()
    while [[ $i -lt ${#items[@]} ]]; do
      echo -e "    - ${items[$i]}"
      names+=("${items[$i]}")
      i=$((i + 3))
    done
    read -rp "  Install semua? [y/N] " ans
    if [[ "$ans" =~ ^[Yy]$ ]]; then
      printf '%s\n' "${names[@]}"
    fi
  fi
}

gauge() {
  # $1 = pesan, $2 = persen
  if [[ -z "$USE_PLAIN" ]]; then
    echo "$2" | dialog --title "$TITLE" --gauge "$1" 7 $WIDTH "$2"
  else
    echo -e "  [$2%] $1"
  fi
}

infobox() {
  if [[ -z "$USE_PLAIN" ]]; then
    dialog --title "$TITLE" --infobox "$1" 5 $WIDTH
    sleep 0.6
  else
    echo -e "  $1"
  fi
}

clear

# ─── Welcome screen ───────────────────────────────────────────────────────────
if [[ -z "$USE_PLAIN" ]]; then
  dialog --title "$TITLE" \
    --msgbox "\nSelamat datang di KuroCodex Installer!\n\nTool ini akan:\n  • Cek & install system dependencies\n  • Install npm packages\n  • Register command 'kurocodex' global\n\nTekan OK untuk melanjutkan." \
    $HEIGHT $WIDTH
fi

# ─── Node.js check ────────────────────────────────────────────────────────────
infobox "Mengecek Node.js..."

NODE_VER=$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1)
if [[ -z "$NODE_VER" || "$NODE_VER" -lt 18 ]]; then
  msg "✖ Node.js 18+ diperlukan!\n\nInstall Node.js:\n  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -\n  sudo apt-get install -y nodejs\n\nKemudian jalankan install.sh lagi."
  clear
  exit 1
fi

infobox "✔ Node.js v$(node -v | sed 's/v//') ditemukan"

# ─── Detect package manager ───────────────────────────────────────────────────
PKG_MGR=""
command -v apt-get &>/dev/null && PKG_MGR="apt"
command -v brew    &>/dev/null && PKG_MGR="brew"

# ─── System dependencies checklist ───────────────────────────────────────────
declare -A SYS_PKGS=(
  [whois]="whois"
  [python3]="python3"
  [gcc]="gcc"
  [g++]="g++"
  [java]="default-jdk"
  [ruby]="ruby"
  [php]="php-cli"
  [go]="golang-go"
  [perl]="perl"
  [lua5.4]="lua5.4"
  [zip]="zip"
  [unzip]="unzip"
  [curl]="curl"
  [jq]="jq"
)

BREW_MAP=(
  [default-jdk]="openjdk"
  [php-cli]="php"
  [lua5.4]="lua"
  [golang-go]="go"
)

# Build checklist items: name  description  on/off
CHECKLIST_ARGS=()
MISSING_CMDS=()

for cmd in "${!SYS_PKGS[@]}"; do
  pkg="${SYS_PKGS[$cmd]}"
  if ! command -v "$cmd" &>/dev/null; then
    CHECKLIST_ARGS+=("$pkg" "($cmd tidak ditemukan)" "on")
    MISSING_CMDS+=("$cmd")
  fi
done

SELECTED_PKGS=()
if [[ ${#CHECKLIST_ARGS[@]} -gt 0 ]]; then
  SELECTED_RAW=$(checklist "${CHECKLIST_ARGS[@]}" 2>/dev/null || true)
  # Parse hasil dialog (quoted strings)
  eval "SELECTED_PKGS=($SELECTED_RAW)"
fi

# ─── Install selected packages ────────────────────────────────────────────────
if [[ ${#SELECTED_PKGS[@]} -gt 0 && -n "$PKG_MGR" ]]; then
  infobox "Menginstall ${#SELECTED_PKGS[@]} paket sistem..."

  if [[ "$PKG_MGR" == "apt" ]]; then
    (
      sudo apt-get update -qq 2>/dev/null
      sudo apt-get install -y "${SELECTED_PKGS[@]}" 2>&1
    ) | {
      total=${#SELECTED_PKGS[@]}
      done_count=0
      while IFS= read -r line; do
        if [[ "$line" == *"Setting up"* ]]; then
          done_count=$((done_count + 1))
          pct=$(( done_count * 100 / total ))
          gauge "Menginstall: $line" "$pct"
        fi
      done
    }

  elif [[ "$PKG_MGR" == "brew" ]]; then
    BREW_PKGS=()
    for p in "${SELECTED_PKGS[@]}"; do
      mapped="${BREW_MAP[$p]:-$p}"
      BREW_PKGS+=("$mapped")
    done
    brew install "${BREW_PKGS[@]}" 2>&1 | while IFS= read -r line; do
      infobox "$line"
    done
  fi

  infobox "✔ System dependencies selesai"

elif [[ ${#CHECKLIST_ARGS[@]} -gt 0 && -z "$PKG_MGR" ]]; then
  msg "⚠ Package manager tidak dikenali.\nInstall manual:\n  ${MISSING_CMDS[*]}"
fi

# ─── npm install ──────────────────────────────────────────────────────────────
infobox "Menginstall npm dependencies..."

gauge "npm install..." 10
npm install --silent 2>/dev/null
gauge "npm install selesai" 100

infobox "✔ npm install selesai"

# ─── Make bin executable ──────────────────────────────────────────────────────
chmod +x bin/kurocodex.js

# ─── Global install ───────────────────────────────────────────────────────────
infobox "Registrasi command global 'kurocodex'..."

if npm install -g . --silent 2>/dev/null; then
  infobox "✔ kurocodex installed globally"
else
  npm link 2>/dev/null || true
fi

# ─── PATH check & fix ─────────────────────────────────────────────────────────
NPM_BIN=$(npm bin -g 2>/dev/null || npm prefix -g 2>/dev/null | xargs -I{} echo {}/bin)

if ! echo "$PATH" | grep -q "$NPM_BIN"; then
  SHELL_RC=""
  [[ -f "$HOME/.zshrc" ]]  && SHELL_RC="$HOME/.zshrc"
  [[ -f "$HOME/.bashrc" ]] && SHELL_RC="$HOME/.bashrc"

  if [[ -n "$SHELL_RC" ]]; then
    if ! grep -q "kurocodex" "$SHELL_RC" 2>/dev/null; then
      echo "" >> "$SHELL_RC"
      echo "# KuroCodex - npm global bin" >> "$SHELL_RC"
      echo "export PATH=\"\$PATH:$NPM_BIN\"" >> "$SHELL_RC"
    fi
  fi
fi

# ─── Symlink fallback ─────────────────────────────────────────────────────────
if ! command -v kurocodex &>/dev/null; then
  BIN_FILE="$(pwd)/bin/kurocodex.js"
  ln -sf "$BIN_FILE" /usr/local/bin/kurocodex 2>/dev/null \
    || sudo ln -sf "$BIN_FILE" /usr/local/bin/kurocodex 2>/dev/null \
    || true
fi

# ─── Config dir ───────────────────────────────────────────────────────────────
mkdir -p "$HOME/.kurocodex"
chmod 700 "$HOME/.kurocodex"

# ─── Done ─────────────────────────────────────────────────────────────────────
clear

if [[ -z "$USE_PLAIN" ]]; then
  dialog --title "$TITLE" \
    --msgbox "\n✔ Installation Complete!\n\nKuroCodex sudah siap digunakan.\n\nJalankan:\n  kurocodex\n\nJika command tidak ditemukan, restart terminal\natau jalankan: source ~/.bashrc" \
    $HEIGHT $WIDTH
fi

clear
echo ""
echo -e "  ${GREEN}${BOLD}✔ KuroCodex berhasil diinstall!${RESET}"
echo -e "  ${BOLD}Jalankan: ${CYAN}kurocodex${RESET}"
echo ""
