import path from 'path';
import os from 'os';

export function expandPath(p) {
  if (!p) return p;
  // Expand ~ and ~/...
  if (p === '~' || p.startsWith('~/') || p.startsWith('~\\')) {
    p = os.homedir() + p.slice(1);
  }
  p = p.replace(/\$\{([^}]+)\}/g, (_, v) => process.env[v] ?? '');
  p = p.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, v) => process.env[v] ?? '');
  return p;
}
import chalk from 'chalk';

const ts = () => chalk.gray(new Date().toLocaleTimeString('id-ID', { hour12: false }));

export const log = {
  info:    (...a) => console.log(`  ${chalk.cyan('ℹ')} ${ts()} ${a.join(' ')}`),
  success: (...a) => console.log(`  ${chalk.green('✔')} ${ts()} ${a.join(' ')}`),
  warn:    (...a) => console.log(`  ${chalk.yellow('⚠')} ${ts()} ${chalk.yellow(a.join(' '))}`),
  error:   (...a) => console.log(`  ${chalk.red('✖')} ${ts()} ${chalk.red(a.join(' '))}`),
  ai:      (...a) => console.log(`  ${chalk.magenta('◈')} ${a.join(' ')}`),
  dim:     (...a) => console.log(`  ${chalk.dim(a.join(' '))}`),
  raw:     (...a) => console.log(`  ${a.join(' ')}`),
};
