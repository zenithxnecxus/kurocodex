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
