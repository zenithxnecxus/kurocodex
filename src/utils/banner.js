import chalk from 'chalk';
import { loadConfig } from './crypto.js';

export function printBanner() {
  const config  = loadConfig();
  const provider = config.default_provider || 'deepseek';

  console.clear();
  console.log(chalk.cyan(`
  ██╗  ██╗██╗   ██╗██████╗  ██████╗  ██████╗ ██████╗ ██████╗ ███████╗██╗  ██╗
  ██║ ██╔╝██║   ██║██╔══██╗██╔═══██╗██╔════╝██╔═══██╗██╔══██╗██╔════╝╚██╗██╔╝
  █████╔╝ ██║   ██║██████╔╝██║   ██║██║     ██║   ██║██║  ██║█████╗   ╚███╔╝ 
  ██╔═██╗ ██║   ██║██╔══██╗██║   ██║██║     ██║   ██║██║  ██║██╔══╝   ██╔██╗ 
  ██║  ██╗╚██████╔╝██║  ██║╚██████╔╝╚██████╗╚██████╔╝██████╔╝███████╗██╔╝ ██╗
  ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝ ╚═════╝  ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝`));

  console.log(chalk.gray('  ──────────────────────────────────────────────────────────────────────────────'));
  console.log(chalk.white('  KuroCodex AI Agent') + chalk.gray(' · by zyvora · v1.0'));
  console.log('');
  console.log(
    '  ' + chalk.dim('◆') + '  ' +
    chalk.yellow('deepseek') + chalk.dim(' / ') +
    chalk.magenta('claude') + chalk.dim(' / ') +
    chalk.blue('gemini') + chalk.dim(' / ') +
    chalk.cyan('copilot') +
    chalk.dim('  ·  tools on')
  );
  console.log('  ' + chalk.dim('/help  /provider  /status  /run  /debug  /feature  /clear'));
  console.log('');
  console.log('  ' + chalk.cyan('🤖') + chalk.dim(' Active provider: ') + chalk.cyan(provider));
  console.log(chalk.gray('  ──────────────────────────────────────────────────────────────────────────────'));
  console.log('');
}

export function printLine() {
  console.log(chalk.gray('  ──────────────────────────────────────────────────────────────────────────────'));
}
