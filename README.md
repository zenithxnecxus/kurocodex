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


/save <name>           Simpan session
/load <name>           Load session
exit                   Keluar
```


## Requirements

- Node.js ≥ 18

