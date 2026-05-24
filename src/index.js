import readline from 'readline';
import chalk from 'chalk';
import fs from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { homedir } from 'os';

import { printBanner } from './utils/banner.js';
import { log } from './utils/logger.js';
import { loadConfig, setConfigValue } from './utils/crypto.js';

import { deepseekChat } from './services/deepseek.js';
import { geminiChat }   from './services/gemini.js';
import { claudeChat }   from './services/claude.js';
import { copilotChat }  from './services/copilot.js';

import { createSpinner } from './utils/spinner.js';
import { showHelp }                            from './commands/help.js';
import { cmdProvider, cmdSetKey, cmdStatus }   from './commands/provider.js';
import { cmdRead, cmdExec }                    from './commands/read.js';
import { cmdRun }                              from './commands/runner.js';
import { cmdDebug, cmdFeature }                from './commands/ai_tools.js';

// ─── Session storage ─────────────────────────────────────────────────────────

const SESSION_DIR = path.join(homedir(), '.kurocodex', 'sessions');
let chatHistory   = [];

function saveSession(name) {
  if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true, mode: 0o700 });
  const file = path.join(SESSION_DIR, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(chatHistory, null, 2), { mode: 0o600 });
  log.success(`Session disimpan: ${chalk.cyan(name)}`);
}

function loadSession(name) {
  const file = path.join(SESSION_DIR, `${name}.json`);
  if (!fs.existsSync(file)) { log.error(`Session tidak ditemukan: ${name}`); return; }
  chatHistory = JSON.parse(fs.readFileSync(file, 'utf-8'));
  log.success(`Session dimuat: ${chalk.cyan(name)} (${chatHistory.length} turn)`);
}

// ─── AI dispatcher ───────────────────────────────────────────────────────────

async function callAI(prompt) {
  const config   = loadConfig();
  const provider = config.default_provider || 'deepseek';

  let result;
  switch (provider) {
    case 'deepseek': result = await deepseekChat(prompt, chatHistory); break;
    case 'gemini':   result = await geminiChat(prompt, chatHistory);   break;
    case 'claude':   result = await claudeChat(prompt, chatHistory);   break;
    case 'copilot':  result = await copilotChat(prompt);               break;
    default:         throw new Error(`Unknown provider: ${provider}`);
  }

  chatHistory.push({ user: prompt, assistant: result.answer });
  if (chatHistory.length > 50) chatHistory = chatHistory.slice(-50);

  return result;
}

// ─── Auto-continue check ─────────────────────────────────────────────────────

function isCutOff(text) {
  const trimmed = text.trim();
  if (!trimmed) return false;

  const lastChar = trimmed[trimmed.length - 1];
  const lastLine = trimmed.split('\n').pop().trim();

  // Open code block
  const codeBlocks = (trimmed.match(/```/g) || []).length;
  if (codeBlocks % 2 !== 0) return true;

  // Hanging syntax
  if (lastLine.endsWith(',') || lastLine.endsWith('(') || lastLine.endsWith('{')) return true;

  // Trailing "..."
  if (trimmed.endsWith('...') || trimmed.toLowerCase().endsWith('bersambung') ||
      trimmed.toLowerCase().endsWith('lanjut') || trimmed.toLowerCase().endsWith('(continues)')) return true;

  return false;
}

// ─── AI chat with auto-continue ──────────────────────────────────────────────

async function aiChatWithAutoContinue(prompt) {
  const MAX_CONTINUES = 5;
  let fullText    = '';
  let continueCount = 0;

  // Initial call
  const spinner = createSpinner('Thinking ...');
  spinner.start();
  const result = await callAI(prompt);
  spinner.stop();
  fullText += result.answer || '';
  printAIResponse(result);
  await autoRunCode(result.answer || '');

  // Auto-continue loop
  while (continueCount < MAX_CONTINUES && isCutOff(fullText)) {
    continueCount++;
    log.dim(`\n  ↻ Respons belum selesai, melanjutkan (${continueCount}/${MAX_CONTINUES}) ...`);

    const contPrompt = 'Lanjutkan dari tempat kamu berhenti. Jangan ulangi yang sudah ada.';
    const spinner2 = createSpinner('Continuing ...');
    spinner2.start();
    const contResult = await callAI(contPrompt);
    spinner2.stop();
    const cont       = contResult.answer || '';

    if (!cont.trim()) break;
    fullText += '\n' + cont;
    printAIResponse(contResult, true);
  }

  console.log('');
}


// ─── Auto-run code blocks from AI response ───────────────────────────────────


const EXT_MAP = {
  javascript: 'js', js: 'js', typescript: 'ts', ts: 'ts',
  jsx: 'jsx', tsx: 'tsx',
  python: 'py', py: 'py',
  bash: 'sh', sh: 'sh', shell: 'sh',
  ruby: 'rb', rb: 'rb',
  go: 'go', rust: 'rs', java: 'java',
  php: 'php', lua: 'lua', perl: 'pl',
  html: 'html', css: 'css',
};

async function autoRunCode(text) {
  // Extract all fenced code blocks with a language tag
  const RE = /```([a-zA-Z0-9_+-]+)\n([\s\S]*?)```/g;
  let m;
  const blocks = [];
  while ((m = RE.exec(text)) !== null) {
    const lang = m[1].toLowerCase();
    const code = m[2];
    const ext  = EXT_MAP[lang];
    if (ext) blocks.push({ lang, ext, code });
  }
  if (blocks.length === 0) return;

  console.log('');

  // Write all blocks to temp files first
  const tmpFiles = [];
  for (let i = 0; i < blocks.length; i++) {
    const { ext, code } = blocks[i];
    const tmpFile = path.join(tmpdir(), `kuro_auto_${Date.now()}_${i}.${ext}`);
    fs.writeFileSync(tmpFile, code);
    tmpFiles.push(tmpFile);
  }

  // If more than 1 file, auto-zip them too
  if (tmpFiles.length > 1) {
    try {
      const zipName = `kuro_output_${Date.now()}.zip`;
      const zipPath = path.join(tmpdir(), zipName);
      const { default: archiver } = await import('archiver');
      await new Promise((resolve, reject) => {
        const output  = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        output.on('close', resolve);
        archive.on('error', reject);
        archive.pipe(output);
        for (const f of tmpFiles) archive.file(f, { name: path.basename(f) });
        archive.finalize();
      });
      const sizeMB = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(2);
      log.success(`ZIP dibuat: ${chalk.cyan(zipPath)} (${sizeMB} MB)`);
    } catch (e) {
      log.warn(`Auto-zip gagal: ${e.message}`);
    }
  }

  // Run each file
  log.dim(`Ditemukan ${blocks.length} code block — auto-run...`);
  for (let i = 0; i < blocks.length; i++) {
    const { lang } = blocks[i];
    const tmpFile  = tmpFiles[i];
    log.info(`Menjalankan ${chalk.cyan(`[${lang}]`)} → ${chalk.dim(tmpFile)}`);
    try {
      await cmdRun(tmpFile);
    } catch (e) {
      log.error(`Gagal run: ${e.message}`);
    }
  }
}

function printAIResponse(result, isContinuation = false) {
  const text = result.answer || result.reasoning || '';
  if (!text) return;

  if (!isContinuation) console.log('');
  const lines = text.split('\n');
  for (const line of lines) {
    console.log('  ' + chalk.white(line));
  }

  if (result.reasoning && result.answer && !isContinuation) {
    console.log('');
    log.dim('[thinking hidden — use /clear to reset]');
  }
  if (result.citations?.length && !isContinuation) {
    console.log('');
    result.citations.slice(0, 3).forEach((c, i) => {
      log.dim(`[${i + 1}] ${c.title} — ${c.url}`);
    });
  }
}

// ─── Command parser ──────────────────────────────────────────────────────────

async function handleCommand(input) {
  const trimmed = input.trim();
  if (!trimmed) return;

  // exit
  if (['exit', 'quit', 'bye'].includes(trimmed.toLowerCase())) {
    log.info(chalk.cyan('Sampai jumpa! 👋'));
    process.exit(0);
  }

  if (trimmed.startsWith('/')) {
    const [cmd, ...rest] = trimmed.slice(1).split(' ');
    const args = rest.join(' ');

    switch (cmd.toLowerCase()) {
      case 'help':    showHelp(); break;
      case 'provider': cmdProvider(args); break;
      case 'setkey': {
        const [prov, key] = rest;
        cmdSetKey(prov, key);
        break;
      }
      case 'status': cmdStatus(); break;
      case 'clear':
        chatHistory = [];
        console.clear();
        printBanner();
        log.success('History dihapus.');
        break;
      case 'read':    await cmdRead(args);   break;
      case 'exec':    await cmdExec(args);   break;
      case 'run':     await cmdRun(args);    break;
      case 'debug':   await cmdDebug(args);  break;
      case 'feature': await cmdFeature(trimmed.slice('/feature '.length)); break;
      case 'test':    await cmdTest(args);   break;
      case 'ml':
        console.log('  ' + chalk.dim('Ketik /ml dulu di prompt utama untuk masuk multiline mode.'));
        break;
      case 'save':    saveSession(args || 'default'); break;
      case 'load':    loadSession(args || 'default'); break;
      default:
        log.warn(`Perintah tidak dikenal: /${cmd}  — ketik /help`);
    }
    return;
  }

  // AI chat with auto-continue
  try {
    const config   = loadConfig();
    const provider = config.default_provider || 'deepseek';
    console.log(`\n  ${chalk.magenta('◈')} ${chalk.dim('[' + provider + ']')}`);
    await aiChatWithAutoContinue(trimmed);
  } catch (e) {
    log.error(`AI error: ${e.message}`);
  }
}

// ─── REPL ────────────────────────────────────────────────────────────────────

export async function startREPL() {
  printBanner();

  const PROMPT = chalk.dim('  ~/kurocodex ') + chalk.cyan('❯ ') + ' ';

  // ── Raw stdin: auto-detect paste vs single Enter ──────────────────────────
  process.stdin.setRawMode(true);
  process.stdin.setEncoding('utf8');

  let lineBuffer  = '';   // chars typed so far
  let pasteChunks = [];   // lines collected during a paste burst
  let pasteTimer  = null; // fires after paste burst ends
  let busy        = false;

  const PASTE_FLUSH_MS = 80; // gap after last chunk before we fire

  function showPrompt() {
    process.stdout.write('\r' + PROMPT);
  }

  function clearLine() {
    process.stdout.write('\r\x1b[2K');
  }

  async function dispatch(input) {
    const text = input.trim();
    if (!text) { showPrompt(); return; }
    busy = true;
    clearLine();
    await handleCommand(text);
    busy = false;
    showPrompt();
  }

  function flushPaste() {
    pasteTimer = null;
    // Add whatever is still in lineBuffer as the last line
    if (lineBuffer) {
      pasteChunks.push(lineBuffer);
      lineBuffer = '';
    }
    const full = pasteChunks.join('\n');
    pasteChunks = [];
    dispatch(full);
  }

  showPrompt();

  process.stdin.on('data', chunk => {
    // Ctrl+C / Ctrl+D
    if (chunk === '\u0003') { console.log(''); log.info(chalk.cyan('Sampai jumpa! 👋')); process.exit(0); }
    if (chunk === '\u0004') { console.log(''); process.exit(0); }

    // Backspace
    if (chunk === '\u007f' || chunk === '\b') {
      if (lineBuffer.length > 0) {
        lineBuffer = lineBuffer.slice(0, -1);
        process.stdout.write('\b \b');
      }
      return;
    }

    // If chunk contains newlines it's almost certainly a paste
    const hasNewline = chunk.includes('\n') || chunk.includes('\r');
    const lines = chunk.split(/\r?\n/);

    if (lines.length > 1 || (pasteTimer && hasNewline)) {
      // Paste burst: collect all lines
      if (pasteTimer) clearTimeout(pasteTimer);

      // First segment appends to whatever was in lineBuffer
      lines[0] = lineBuffer + lines[0];
      lineBuffer = '';

      // All but last are complete lines; last may be partial
      const complete = lines.slice(0, -1);
      const tail     = lines[lines.length - 1];

      pasteChunks.push(...complete);
      lineBuffer = tail;

      // Echo nicely
      clearLine();
      process.stdout.write(chalk.dim('  [paste] ') + chalk.cyan(String(pasteChunks.length + (tail ? 1 : 0)) + ' baris...'));

      pasteTimer = setTimeout(flushPaste, PASTE_FLUSH_MS);
      return;
    }

    // Single char / Enter
    if (chunk === '\r' || chunk === '\n') {
      process.stdout.write('\n');
      const line = lineBuffer;
      lineBuffer  = '';
      dispatch(line);
      return;
    }

    // Printable char — echo it
    lineBuffer += chunk;
    process.stdout.write(chunk);
  });
}

// ─── /test command ────────────────────────────────────────────────────────────
async function cmdTest(providerArg) {
  const { deepseekChat } = await import('./services/deepseek.js');
  const { geminiChat }   = await import('./services/gemini.js');
  const { claudeChat }   = await import('./services/claude.js');
  const { copilotChat }  = await import('./services/copilot.js');

  const all     = { deepseek: deepseekChat, gemini: geminiChat, claude: claudeChat, copilot: copilotChat };
  const targets = providerArg && all[providerArg] ? { [providerArg]: all[providerArg] } : all;

  console.log('');
  for (const [name, fn] of Object.entries(targets)) {
    process.stdout.write(`  ${chalk.dim('◈')} Testing ${chalk.cyan(name.padEnd(10))} ... `);
    try {
      const t      = Date.now();
      const result = await fn('Reply with exactly: ok');
      console.log(chalk.green('✔ OK') + chalk.dim(` ${Date.now()-t}ms [${result.model}]`));
      console.log(`    ${chalk.dim(result.answer.slice(0, 100))}`);
    } catch (e) {
      console.log(chalk.red('✖ GAGAL'));
      console.log(`    ${chalk.red(e.message)}`);
    }
  }
  console.log('');
}
