import chalk from 'chalk';

export function showHelp() {
  console.log('');
  console.log(chalk.cyan('  ┌─ KUROCODEX · Command Reference ───────────────────────────────────────────┐'));
  const rows = [
    ['AI & Config',                                                  ''],
    ['/provider <name>',   'Ganti provider: deepseek / claude / gemini / copilot'],
    ['/setkey <prov> <k>', 'Simpan API key (enkripsi AES-256)'],
    ['/status',            'Cek status provider & API key'],
    ['/clear',             'Hapus history chat'],
    ['',                   ''],
    ['File & System',                                                 ''],
    ['/read <path>',       'Baca file lokal (konfirmasi + izin)'],
    ['/exec <cmd>',        'Jalankan command shell (konfirmasi + izin)'],
    ['/debug <path>',      'Debug & analisis file/folder dengan AI'],
    ['/feature <path>',    'Tambahkan fitur baru ke file/folder dengan AI'],
    ['',                   ''],
    ['Network',                                                       ''],
    ['/whois <domain>',    'Whois lookup'],
    ['/dns <domain>',      'DNS lookup (A, AAAA, MX, TXT, NS)'],
    ['/port <host>',       'Port scan 1-1000'],
    ['',                   ''],
    ['Localhost / Runner',                                            ''],
    ['/run <file>',        'Jalankan file (js/py/ts/go/rs/rb/php/java/c/cpp/sh...)'],
    ['/run <folder>',      'Jalankan project folder, auto zip jika banyak file'],
    ['',                   ''],
    ['Dorking',                                                       ''],
    ['/search <type>',     'Google dork: sqli / xss / lfi / admin / config'],
    ['',                   ''],
    ['Session',                                                       ''],
    ['/save <name>',       'Simpan session chat'],
    ['/load <name>',       'Load session chat'],
    ['exit / quit',        'Keluar dari KUROCODEX'],
  ];

  for (const [cmd, desc] of rows) {
    if (!cmd && !desc) { console.log('  │'); continue; }
    if (!desc) {
      console.log('  │  ' + chalk.yellow.bold(`── ${cmd}`));
      continue;
    }
    console.log('  │  ' + chalk.green(cmd.padEnd(22)) + chalk.dim(desc));
  }
  console.log(chalk.cyan('  └─────────────────────────────────────────────────────────────────────────────┘'));
  console.log('');
}
