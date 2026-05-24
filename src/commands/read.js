import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import readline from 'readline';
import { loadConfig, setConfigValue } from '../utils/crypto.js';
import { log, expandPath } from '../utils/logger.js';
import chalk from 'chalk';

async function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(`  ${chalk.yellow('?')} ${question} ${chalk.dim('[y/N]')} `, ans => {
      rl.close();
      resolve(ans.trim().toLowerCase() === 'y');
    });
  });
}

// ─── Read File ──────────────────────────────────────────────────────────────

export async function cmdRead(filePath) {
  if (!filePath) { log.error('Usage: /read <path>'); return; }

  const config = loadConfig();

  if (!config.allow_file_read) {
    log.warn('File read tidak diaktifkan!');
    const ok = await confirm('Aktifkan file read untuk session ini?');
    if (!ok) { log.dim('Dibatalkan.'); return; }
    setConfigValue('allow_file_read', true);
  }

  const abs = path.resolve(expandPath(filePath));

  // Basic path safety
  const dangerous = ['/etc/shadow', '/etc/passwd', '/proc', '/sys'];
  if (dangerous.some(d => abs.startsWith(d))) {
    log.error('Path berbahaya — akses ditolak.');
    return;
  }

  if (!fs.existsSync(abs)) { log.error(`File tidak ditemukan: ${abs}`); return; }

  const stat = fs.statSync(abs);
  if (stat.size > 5 * 1024 * 1024) { log.error('File terlalu besar (max 5MB)'); return; }

  const ok = await confirm(`Baca file ${chalk.cyan(abs)} (${(stat.size / 1024).toFixed(1)} KB)?`);
  if (!ok) { log.dim('Dibatalkan.'); return; }

  try {
    const content = fs.readFileSync(abs, 'utf-8');
    console.log('');
    console.log(chalk.cyan(`  ┌─ ${path.basename(abs)} `).padEnd(80, '─') + chalk.cyan('┐'));
    content.split('\n').forEach((line, i) => {
      console.log(`  ${chalk.dim(String(i + 1).padStart(4))}  ${line}`);
    });
    console.log(chalk.cyan('  └' + '─'.repeat(78) + '┘'));
    console.log('');
  } catch (e) {
    log.error(`Gagal baca: ${e.message}`);
  }
}

// ─── Exec Command ───────────────────────────────────────────────────────────

export async function cmdExec(command) {
  if (!command) { log.error('Usage: /exec <command>'); return; }

  const config = loadConfig();

  if (!config.allow_command_exec) {
    log.warn('Command execution tidak diaktifkan!');
    const ok = await confirm('Aktifkan command exec untuk session ini?');
    if (!ok) { log.dim('Dibatalkan.'); return; }
    setConfigValue('allow_command_exec', true);
  }

  const ok = await confirm(`Jalankan: ${chalk.cyan(command)}?`);
  if (!ok) { log.dim('Dibatalkan.'); return; }

  console.log('');
  log.info(`Running: ${chalk.cyan(command)}`);
  console.log(chalk.gray('  ' + '─'.repeat(60)));

  const child = spawn('sh', ['-c', command], { stdio: ['inherit', 'pipe', 'pipe'] });

  child.stdout.on('data', d => process.stdout.write(chalk.white('  ' + d.toString())));
  child.stderr.on('data', d => process.stderr.write(chalk.red('  ' + d.toString())));

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('Timeout 30s')); }, 30000);
    child.on('close', code => {
      clearTimeout(timer);
      console.log(chalk.gray('  ' + '─'.repeat(60)));
      log.info(`Exit code: ${code === 0 ? chalk.green(code) : chalk.red(code)}`);
      console.log('');
      resolve();
    });
    child.on('error', reject);
  }).catch(e => log.error(e.message));
}
