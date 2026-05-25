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
import { chatGPTChat }  from './services/chatgpt.js';

import { createSpinner } from './utils/spinner.js';
import { showHelp }                            from './commands/help.js';
import { cmdProvider, cmdSetKey, cmdStatus }   from './commands/provider.js';
import { cmdRead, cmdExec }                    from './commands/read.js';
import { cmdRun }                              from './commands/runner.js';
import { cmdDebug, cmdFeature, cmdGit }        from './commands/ai_tools.js';

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
    case 'chatgpt':  result = await chatGPTChat(prompt, chatHistory, '', 0.7); break;
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

// Entry point priority for multi-file projects
const ENTRY_PRIORITY = [
  'index.js','index.ts','index.jsx','index.tsx',
  'main.js','main.ts','main.py','app.js','app.ts',
  'server.js','server.ts','index.html',
];

// Langs that likely spawn a web server
const WEB_LANGS = new Set(['js','ts','jsx','tsx','py','rb','php','go','rs']);

function pickEntryFile(tmpFiles, blocks) {
  // Prefer file whose name matches ENTRY_PRIORITY
  for (const entry of ENTRY_PRIORITY) {
    const idx = tmpFiles.findIndex(f => path.basename(f).startsWith(entry.split('.')[0]));
    if (idx !== -1) return { file: tmpFiles[idx], lang: blocks[idx].lang };
  }
  // Fallback: first runnable (non-css/html-only) file
  for (let i = 0; i < blocks.length; i++) {
    if (!['css'].includes(blocks[i].ext)) return { file: tmpFiles[i], lang: blocks[i].lang };
  }
  return { file: tmpFiles[0], lang: blocks[0].lang };
}

async function checkCodeWithAI(code, lang) {
  const checkPrompt = `Cek kode ${lang} ini untuk syntax error atau runtime error yang jelas. Jika ada error, balas HANYA dengan kode yang sudah diperbaiki dalam satu code block. Jika tidak ada error, balas hanya: OK\n\n\`\`\`${lang}\n${code}\`\`\``;
  const spinner = createSpinner('Checking code ...');
  spinner.start();
  const result = await callAI(checkPrompt);
  spinner.stop();
  return result.answer || '';
}

function extractFirstCode(text) {
  const m = /```[a-zA-Z0-9_+-]*\n([\s\S]*?)```/.exec(text);
  return m ? m[1] : null;
}


// ─── React project detection & injection ─────────────────────────────────────

import { execSync } from 'child_process';

function findReactProject(startDir) {
  // Walk up from cwd looking for a React project (has package.json with react dep)
  let dir = startDir || process.cwd();
  for (let i = 0; i < 5; i++) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps['react'] && fs.existsSync(path.join(dir, 'src'))) {
        return dir;
      }
    } catch {}
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function injectIntoReact(reactDir, blocks) {
  const written = [];
  for (const { ext, code } of blocks) {
    let dest;
    const isJSFamily = ['js','ts','jsx','tsx'].includes(ext);
    const hasReactDOM = code.includes('ReactDOM') || code.includes('createRoot');
    const looksReact  = /import React|from ['"]react['"]|useState|useEffect|return\s*\([\s\S]{0,200}?</.test(code);

    if (hasReactDOM) {
      // index file
      dest = path.join(reactDir, 'src', 'index.' + (ext === 'tsx' ? 'tsx' : 'js'));
    } else if (isJSFamily) {
      // App component — always overwrite App.js (CRA default)
      const existsJSX = fs.existsSync(path.join(reactDir, 'src', 'App.jsx'));
      const existsTSX = fs.existsSync(path.join(reactDir, 'src', 'App.tsx'));
      if (existsJSX) dest = path.join(reactDir, 'src', 'App.jsx');
      else if (existsTSX) dest = path.join(reactDir, 'src', 'App.tsx');
      else dest = path.join(reactDir, 'src', 'App.js');
    } else if (ext === 'css') {
      dest = path.join(reactDir, 'src', 'App.css');
    } else {
      continue;
    }
    fs.writeFileSync(dest, code, 'utf8');
    written.push(dest);
    log.success(`Injected → ${chalk.cyan(path.relative(reactDir, dest))}`);
  }
  return written;
}

async function autoRunCode(text) {
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

  // ── Double-check each code block (max 2 rounds) ───────────────────────────
  const checkedBlocks = [];
  for (const block of blocks) {
    let { lang, ext, code } = block;
    for (let round = 1; round <= 2; round++) {
      const reply = await checkCodeWithAI(code, lang);
      if (reply.trim().startsWith('OK')) break; // no error
      const fixed = extractFirstCode(reply);
      if (!fixed) break;
      log.warn(`  Round ${round}: error ditemukan, kode diperbaiki otomatis`);
      code = fixed;
      if (round === 2) log.dim('  Sudah 2x check, lanjut dengan kode terbaik.');
    }
    checkedBlocks.push({ lang, ext, code });
  }

  // ── HTML: PRIORITAS UTAMA — langsung tulis & buka, skip semua server ────────
  const htmlBlock = checkedBlocks.find(b => b.ext === 'html');
  if (htmlBlock) {
    const htmlFile = path.join(tmpdir(), `kuro_auto_${Date.now()}.html`);
    let htmlCode = htmlBlock.code;

    // Embed semua CSS block ke dalam <style>
    const cssBlocks = checkedBlocks.filter(b => b.ext === 'css');
    for (const css of cssBlocks) {
      if (!htmlCode.includes(css.code.slice(0, 30))) {
        if (htmlCode.includes('</head>')) {
          htmlCode = htmlCode.replace('</head>', `<style>
${css.code}
</style>
</head>`);
        } else {
          htmlCode = `<style>
${css.code}
</style>
` + htmlCode;
        }
      }
    }

    // Embed semua JS block ke dalam <script>
    const jsBlocks = checkedBlocks.filter(b => ['js','ts'].includes(b.ext));
    for (const js of jsBlocks) {
      if (!htmlCode.includes(js.code.slice(0, 30))) {
        if (htmlCode.includes('</body>')) {
          htmlCode = htmlCode.replace('</body>', `<script>
${js.code}
</script>
</body>`);
        } else {
          htmlCode += `
<script>
${js.code}
</script>`;
        }
      }
    }

    fs.writeFileSync(htmlFile, htmlCode);
    log.success(`HTML: ${chalk.cyan(htmlFile)}`);

    try {
      const { spawn } = await import('child_process');
      const isTermux = !!process.env.TERMUX_VERSION || fs.existsSync('/data/data/com.termux');
      const opener   = isTermux ? 'termux-open' : (process.platform === 'darwin' ? 'open' : 'xdg-open');
      spawn(opener, [htmlFile], { detached: true, stdio: 'ignore' }).unref();
      log.dim('Membuka di browser...');
    } catch (e) {
      log.dim(`Buka manual: ${htmlFile}`);
    }
    return; // ← STOP, jangan lanjut ke React/server logic
  }

  // ── Detect React project ─────────────────────────────────────────────────
  // Only look for React project if NO html blocks (html already handled above)
  function isReactCode(code) {
    return /import React|from ['"]react['"]|useState|useEffect|JSX|<[A-Z][a-zA-Z]+|return\s*\([\s\S]*?</.test(code);
  }
  const hasJSX = checkedBlocks.some(b =>
    ['jsx','tsx'].includes(b.ext) ||
    (['js','ts'].includes(b.ext) && isReactCode(b.code))
  );
  const reactDir = hasJSX ? findReactProject(process.cwd()) : null;

  if (reactDir) {
    // ── Inject into existing React project ───────────────────────────────
    log.dim(`React project terdeteksi: ${chalk.cyan(reactDir)}`);
    injectIntoReact(reactDir, checkedBlocks);

    // Zip the src folder
    try {
      const zipName = `kuro_react_${Date.now()}.zip`;
      const zipPath = path.join(tmpdir(), zipName);
      const { default: archiver } = await import('archiver');
      await new Promise((resolve, reject) => {
        const output  = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        output.on('close', resolve);
        archive.on('error', reject);
        archive.pipe(output);
        archive.directory(path.join(reactDir, 'src'), 'src');
        archive.finalize();
      });
      const sizeMB = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(2);
      log.success(`ZIP src: ${chalk.cyan(zipPath)} (${sizeMB} MB)`);
    } catch (e) {
      log.warn(`Auto-zip gagal: ${e.message}`);
    }

    // Run dev server if not already running
    log.dim('Starting React dev server ...');
    await cmdRun(reactDir);
    return;
  }

  // ── Write to tmp files ────────────────────────────────────────────────────
  const tmpFiles = [];
  for (let i = 0; i < checkedBlocks.length; i++) {
    const { ext, code } = checkedBlocks[i];
    const tmpFile = path.join(tmpdir(), `kuro_auto_${Date.now()}_${i}.${ext}`);
    fs.writeFileSync(tmpFile, code);
    tmpFiles.push(tmpFile);
  }

  const isMultiFile = tmpFiles.length > 1;

  // ── Zip if multi-file ─────────────────────────────────────────────────────
  if (isMultiFile) {
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
      log.success(`ZIP: ${chalk.cyan(zipPath)} (${sizeMB} MB)`);
    } catch (e) {
      log.warn(`Auto-zip gagal: ${e.message}`);
    }
  }

  // ── Run only entry point for multi-file, all for single ──────────────────
  if (isMultiFile) {
    const { file, lang } = pickEntryFile(tmpFiles, checkedBlocks);
    log.dim(`Multi-file project — run entry point: ${chalk.cyan(`[${lang}]`)}`);
    try {
      await cmdRun(file);
    } catch (e) {
      log.error(`Gagal run: ${e.message}`);
    }
  } else {
    const { lang } = checkedBlocks[0];
    log.dim(`Run ${chalk.cyan(`[${lang}]`)} ...`);
    try {
      await cmdRun(tmpFiles[0]);
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
      case 'git':     await cmdGit(args);    break;
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

  const { chatGPTChat } = await import('./services/chatgpt.js');
  const all     = { deepseek: deepseekChat, gemini: geminiChat, claude: claudeChat, copilot: copilotChat, chatgpt: chatGPTChat };
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
