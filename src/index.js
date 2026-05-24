import readline from 'readline';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { homedir } from 'os';

import { printBanner } from './utils/banner.js';
import { log } from './utils/logger.js';
import { loadConfig, setConfigValue } from './utils/crypto.js';

import { deepseekChat } from './services/deepseek.js';
import { geminiChat }   from './services/gemini.js';
import { claudeChat }   from './services/claude.js';
import { copilotChat }  from './services/copilot.js';

import { showHelp }                            from './commands/help.js';
import { cmdProvider, cmdSetKey, cmdStatus }   from './commands/provider.js';
import { cmdRead, cmdExec }                    from './commands/read.js';
import { cmdWhois, cmdDns, cmdPort, cmdSearch } from './commands/network.js';
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
  const result = await callAI(prompt);
  fullText += result.answer || '';
  printAIResponse(result);

  // Auto-continue loop
  while (continueCount < MAX_CONTINUES && isCutOff(fullText)) {
    continueCount++;
    log.dim(`\n  ↻ Respons belum selesai, melanjutkan (${continueCount}/${MAX_CONTINUES}) ...`);

    const contPrompt = 'Lanjutkan dari tempat kamu berhenti. Jangan ulangi yang sudah ada.';
    const contResult = await callAI(contPrompt);
    const cont       = contResult.answer || '';

    if (!cont.trim()) break;
    fullText += '\n' + cont;
    printAIResponse(contResult, true);
  }

  console.log('');
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
      case 'whois':   await cmdWhois(args);  break;
      case 'dns':     await cmdDns(args);    break;
      case 'port': {
        const [host, range] = rest;
        await cmdPort(host, range);
        break;
      }
      case 'search':  cmdSearch(args); break;
      case 'run':     await cmdRun(args);    break;
      case 'debug':   await cmdDebug(args);  break;
      case 'feature': await cmdFeature(trimmed.slice('/feature '.length)); break;
      case 'test':    await cmdTest(args);   break;
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
    process.stdout.write(`\n  ${chalk.magenta('◈')} ${chalk.dim(`[${provider}]`)} `);
    await aiChatWithAutoContinue(trimmed);
  } catch (e) {
    log.error(`AI error: ${e.message}`);
  }
}

// ─── REPL ────────────────────────────────────────────────────────────────────

export async function startREPL() {
  printBanner();

  const rl = readline.createInterface({
    input:  process.stdin,
    output: process.stdout,
    prompt: chalk.dim('  ~/kurocodex ') + chalk.cyan('❯ '),
    historySize: 100,
  });

  rl.prompt();

  rl.on('line', async line => {
    rl.pause();
    await handleCommand(line);
    rl.resume();
    rl.prompt();
  });

  rl.on('close', () => {
    log.info(chalk.cyan('Sampai jumpa! 👋'));
    process.exit(0);
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
