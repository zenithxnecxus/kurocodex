import chalk from 'chalk';

const BAR_WIDTH  = 20;
const BLOCK_W    = 2;
const SPEED      = 60;   

export function createSpinner(label = 'Loading') {
  let pos      = 0;
  let dir      = 1;
  let interval = null;
  let stopped  = false;

  function frame() {
    if (stopped) return;
    const before = ' '.repeat(pos);
    const block  = chalk.blue('▐▌');
    const after  = ' '.repeat(BAR_WIDTH - pos - BLOCK_W);
    const bar    = chalk.dim('[') + before + block + after + chalk.dim(']');
    process.stdout.write(`\r  ${bar}  ${chalk.dim(label)}`);
    pos += dir;
    if (pos >= BAR_WIDTH - BLOCK_W) dir = -1;
    if (pos <= 0)                   dir =  1;
  }

  return {
    start() {
      stopped  = false;
      pos      = 0;
      dir      = 1;
      interval = setInterval(frame, SPEED);
      return this;
    },
    stop(successMsg = '') {
      stopped = true;
      clearInterval(interval);
      process.stdout.write('\r' + ' '.repeat(BAR_WIDTH + 30) + '\r');
      if (successMsg) console.log('  ' + successMsg);
      return this;
    },
    updateLabel(newLabel) {
      label = newLabel;
      return this;
    },
  };
}
