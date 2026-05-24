# KuroCodex CLI AI Agent

> Encrypted · Modular · Multi-Provider · by Zenithx

```
  ██╗  ██╗██╗   ██╗██████╗  ██████╗  ██████╗ ██████╗ ██████╗ ███████╗██╗  ██╗
  ██║ ██╔╝██║   ██║██╔══██╗██╔═══██╗██╔════╝██╔═══██╗██╔══██╗██╔════╝╚██╗██╔╝
  █████╔╝ ██║   ██║██████╔╝██║   ██║██║     ██║   ██║██║  ██║█████╗   ╚███╔╝ 
  ██╔═██╗ ██║   ██║██╔══██╗██║   ██║██║     ██║   ██║██║  ██║██╔══╝   ██╔██╗ 
  ██║  ██╗╚██████╔╝██║  ██║╚██████╔╝╚██████╗╚██████╔╝██████╔╝███████╗██╔╝ ██╗
  ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝ ╚═════╝  ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝
```

## Install

```bash
chmod +x install.sh && ./install.sh
```

Atau manual:
```bash
npm install
npm install -g .
```

## Jalankan

```bash
kurocodex
```

## Fitur

| Kategori       | Fitur                                                |
|----------------|------------------------------------------------------|
| 🔐 Security    | AES-256-GCM encryption, auto-generate secret key    |
| 🤖 AI          | DeepSeek, Claude, Gemini, Copilot                   |
| 🌐 Web         | Scrape (links, images, email, phone), BFS Crawl     |
| 📁 File/Exec   | Read file, execute command (dengan konfirmasi)       |
| 🌍 Network     | Whois, DNS lookup, Port scan                        |
| 🔍 Dorking     | Google dork generator (sqli, xss, lfi, admin, cfg)  |
| 💾 Session     | Save/load chat history                              |

## Commands

```
/provider <name>       Ganti AI provider
/setkey <prov> <key>   Simpan API key (AES-256 encrypted)
/status                Status provider & keys
/clear                 Hapus history

/scrape <url>          Scrape website → JSON
/crawl <url>           BFS crawl → sitemap JSON
/read <file>           Baca file lokal
/exec <cmd>            Jalankan shell command

/whois <domain>        Whois lookup
/dns <domain>          DNS lookup
/port <host> [range]   Port scan
/search <type>         Google dork (sqli/xss/lfi/admin/config)

/save <name>           Simpan session
/load <name>           Load session
exit                   Keluar
```

## Security

- Semua config & API key dienkripsi dengan **AES-256-GCM**
- Config tersimpan di `~/.kurocodex/config.enc`
- Secret key di `~/.kurocodex/.secret` (mode 600, owner-only)
- Folder `~/.kurocodex` mode **700**

## Requirements

- Node.js ≥ 18
- `whois` (untuk /whois): `apt install whois`
