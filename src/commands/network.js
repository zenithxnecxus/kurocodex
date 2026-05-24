import { execSync, exec } from 'child_process';
import dns from 'dns/promises';
import net from 'net';
import { log } from '../utils/logger.js';
import chalk from 'chalk';

// ─── Whois ──────────────────────────────────────────────────────────────────

export async function cmdWhois(domain) {
  if (!domain) { log.error('Usage: /whois <domain>'); return; }
  log.info(`Whois: ${chalk.cyan(domain)}`);
  try {
    const out = execSync(`whois ${domain} 2>/dev/null`, { timeout: 10000 }).toString();
    const lines = out.split('\n')
      .filter(l => /registrar|registrant|creation|expir|name server|status|dnssec/i.test(l))
      .slice(0, 20);
    console.log('');
    lines.forEach(l => log.raw(chalk.dim('  ') + chalk.white(l.trim())));
    if (!lines.length) log.dim('Tidak ada info whois relevan.');
    console.log('');
  } catch (e) {
    log.error(`Whois gagal: ${e.message}`);
    log.dim('Pastikan "whois" terinstall (apt install whois)');
  }
}

// ─── DNS ────────────────────────────────────────────────────────────────────

export async function cmdDns(domain) {
  if (!domain) { log.error('Usage: /dns <domain>'); return; }
  log.info(`DNS lookup: ${chalk.cyan(domain)}`);
  console.log('');

  const types = ['A', 'AAAA', 'MX', 'TXT', 'NS', 'CNAME'];
  for (const type of types) {
    try {
      let records;
      switch (type) {
        case 'A':     records = (await dns.resolve4(domain)).map(r => ({ address: r })); break;
        case 'AAAA':  records = (await dns.resolve6(domain)).map(r => ({ address: r })); break;
        case 'MX':    records = await dns.resolveMx(domain); break;
        case 'TXT':   records = (await dns.resolveTxt(domain)).map(r => ({ text: r.join('') })); break;
        case 'NS':    records = (await dns.resolveNs(domain)).map(r => ({ ns: r })); break;
        case 'CNAME': records = (await dns.resolveCname(domain)).map(r => ({ cname: r })); break;
      }
      if (records.length) {
        console.log(`  ${chalk.green(type.padEnd(6))} ${records.map(r => Object.values(r).join(' ')).join(', ')}`);
      }
    } catch {}
  }
  console.log('');
}

// ─── Port Scan ──────────────────────────────────────────────────────────────

export async function cmdPort(host, rangeStr = '1-1000') {
  if (!host) { log.error('Usage: /port <host> [range, default 1-1000]'); return; }

  const [startPort, endPort] = (rangeStr.includes('-') ? rangeStr : `1-${rangeStr}`)
    .split('-').map(Number);

  log.info(`Port scan ${chalk.cyan(host)} ports ${startPort}-${endPort} ...`);

  const CONCURRENT = 100;
  const TIMEOUT    = 500;
  const open       = [];

  async function checkPort(port) {
    return new Promise(resolve => {
      const sock = new net.Socket();
      sock.setTimeout(TIMEOUT);
      sock.on('connect', () => { open.push(port); sock.destroy(); resolve(); });
      sock.on('timeout', ()  => { sock.destroy(); resolve(); });
      sock.on('error',   ()  => { sock.destroy(); resolve(); });
      sock.connect(port, host);
    });
  }

  for (let p = startPort; p <= endPort; p += CONCURRENT) {
    const batch = [];
    for (let i = p; i < Math.min(p + CONCURRENT, endPort + 1); i++) batch.push(checkPort(i));
    await Promise.all(batch);
    process.stdout.write(`\r  ${chalk.dim('◈')} Scanning... port ${Math.min(p + CONCURRENT - 1, endPort)}/${endPort}   `);
  }

  console.log('');
  if (!open.length) {
    log.warn('Tidak ada port terbuka yang ditemukan.');
  } else {
    log.success(`Port terbuka: ${chalk.green(open.join(', '))}`);
  }
  console.log('');
}

// ─── Google Dork ────────────────────────────────────────────────────────────

const DORK_TEMPLATES = {
  sqli:   [
    'site:{t} inurl:id= OR inurl:cat= OR inurl:page=',
    'site:{t} "You have an error in your SQL syntax"',
    'site:{t} inurl:index.php?id=',
  ],
  xss:    [
    'site:{t} inurl:search= OR inurl:q= OR inurl:query=',
    'site:{t} inurl:comment= OR inurl:name= OR inurl:message=',
  ],
  lfi:    [
    'site:{t} inurl:include= OR inurl:file= OR inurl:page=',
    'site:{t} inurl:dir= OR inurl:path=',
  ],
  admin:  [
    'site:{t} inurl:admin OR inurl:administrator OR inurl:wp-admin',
    'site:{t} intitle:"Admin Panel" OR intitle:"Control Panel"',
    'site:{t} inurl:login OR inurl:signin',
  ],
  config: [
    'site:{t} ext:env OR ext:cfg OR ext:conf',
    'site:{t} ext:xml OR ext:json inurl:config',
    'site:{t} filetype:sql OR filetype:db',
    'site:{t} inurl:.git OR inurl:.env',
  ],
};

export function cmdSearch(typeAndTarget) {
  if (!typeAndTarget) {
    log.error('Usage: /search <type> [target]');
    log.dim('Types: sqli / xss / lfi / admin / config');
    return;
  }

  const [type, target = 'example.com'] = typeAndTarget.split(' ');
  const templates = DORK_TEMPLATES[type];

  if (!templates) {
    log.error(`Tipe tidak dikenal: ${type}`);
    log.dim('Pilihan: ' + Object.keys(DORK_TEMPLATES).join(' / '));
    return;
  }

  console.log('');
  log.info(`Dork: ${chalk.yellow(type)} → target: ${chalk.cyan(target)}`);
  console.log('');
  templates.forEach((tpl, i) => {
    const dork    = tpl.replace(/{t}/g, target);
    const encoded = encodeURIComponent(dork);
    console.log(`  ${chalk.dim(`${i + 1}.`)} ${chalk.white(dork)}`);
    console.log(`     ${chalk.blue(`https://www.google.com/search?q=${encoded}`)}`);
    console.log('');
  });
}
