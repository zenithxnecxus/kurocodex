import chalk from 'chalk';
import { loadConfig, setConfigValue, setApiKey, getApiKey } from '../utils/crypto.js';
import { log } from '../utils/logger.js';

const PROVIDERS = ['deepseek', 'claude', 'gemini', 'copilot'];

export function cmdProvider(name) {
  if (!name) {
    const config = loadConfig();
    log.info('Provider aktif:', chalk.cyan(config.default_provider));
    log.dim('Tersedia: ' + PROVIDERS.join(' / '));
    return;
  }
  if (!PROVIDERS.includes(name)) {
    log.error(`Provider tidak dikenal: ${name}`);
    log.dim('Pilihan: ' + PROVIDERS.join(' / '));
    return;
  }
  setConfigValue('default_provider', name);
  log.success(`Provider diubah ke ${chalk.cyan(name)}`);
}

export function cmdSetKey(provider, key) {
  if (!provider || !key) {
    log.error('Usage: /setkey <provider> <api-key>');
    return;
  }
  if (!PROVIDERS.includes(provider)) {
    log.error(`Provider tidak dikenal: ${provider}`);
    return;
  }
  setApiKey(provider, key);
  log.success(`API key untuk ${chalk.cyan(provider)} disimpan (AES-256 encrypted)`);
}

export function cmdStatus() {
  const config = loadConfig();
  console.log('');
  console.log(chalk.cyan('  ┌─ Status ───────────────────────────────┐'));
  console.log(`  │  Provider aktif : ${chalk.cyan(config.default_provider || '-')}`);
  console.log(`  │  File read      : ${config.allow_file_read   ? chalk.green('✔ enabled') : chalk.red('✖ disabled')}`);
  console.log(`  │  Exec command   : ${config.allow_command_exec? chalk.green('✔ enabled') : chalk.red('✖ disabled')}`);
  console.log('  │');
  console.log('  │  API Keys:');
  for (const p of PROVIDERS) {
    const k = getApiKey(p);
    const status = k ? chalk.green('✔ set') : chalk.dim('– not set');
    console.log(`  │    ${p.padEnd(12)} ${status}`);
  }
  console.log(chalk.cyan('  └────────────────────────────────────────┘'));
  console.log('');
}
