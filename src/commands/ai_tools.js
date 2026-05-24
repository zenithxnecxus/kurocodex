import fs from 'fs';
import path from 'path';
import { log } from '../utils/logger.js';
import { loadConfig } from '../utils/crypto.js';
import chalk from 'chalk';

// ─── Read file/folder contents ───────────────────────────────────────────────

const IGNORE_DIRS = new Set(['node_modules', '.git', '__pycache__', 'vendor', 'target', 'dist', 'build', '.next']);
const MAX_FILE_SIZE = 100 * 1024; // 100KB per file
const MAX_FILES = 20;

function readTarget(targetPath) {
  const abs  = path.resolve(targetPath);
  const stat = fs.statSync(abs);

  if (!stat.isDirectory()) {
    // Single file
    const content = fs.readFileSync(abs, 'utf-8');
    return `=== FILE: ${path.basename(abs)} ===\n${content}`;
  }

  // Folder: collect files
  const files = [];

  function walk(dir) {
    if (files.length >= MAX_FILES) return;
    for (const entry of fs.readdirSync(dir)) {
      if (IGNORE_DIRS.has(entry)) continue;
      const full = path.join(dir, entry);
      const s    = fs.statSync(full);
      if (s.isDirectory()) {
        walk(full);
      } else if (s.size <= MAX_FILE_SIZE) {
        try {
          const content = fs.readFileSync(full, 'utf-8');
          const rel     = path.relative(abs, full);
          files.push(`=== FILE: ${rel} ===\n${content}`);
          if (files.length >= MAX_FILES) return;
        } catch {}
      }
    }
  }

  walk(abs);
  return files.join('\n\n');
}

// ─── AI call dengan auto-continue ────────────────────────────────────────────

async function callAIWithAutoContinue(systemPrompt, userPrompt, chatFn) {
  const CONTINUE_SIGNALS = [
    '...', 'bersambung', 'to be continued', 'lanjut', '(lanjut)', '(continues)',
    'continued below', 'next part', 'bagian selanjutnya',
  ];

  const MAX_CONTINUES = 5;
  let fullResponse = '';
  let history = [];
  let continueCount = 0;

  const firstPrompt = `${systemPrompt}\n\n${userPrompt}`;

  process.stdout.write(`\n  ${chalk.magenta('◈')} ${chalk.dim('[AI]')} `);
  console.log('');

  // Initial call
  let result = await chatFn(firstPrompt, history);
  fullResponse += result.answer || '';
  history.push({ user: firstPrompt, assistant: result.answer || '' });

  // Stream-print
  printResponse(result.answer || '');

  // Auto-continue loop
  while (continueCount < MAX_CONTINUES) {
    const lastChunk = fullResponse.slice(-200).toLowerCase().trim();

    // Check if response seems cut off
    const seemsCutOff = CONTINUE_SIGNALS.some(s => lastChunk.endsWith(s)) ||
                        lastChunk.endsWith('...') ||
                        isCutOff(fullResponse);

    if (!seemsCutOff) break;

    continueCount++;
    log.dim(`\n  ↻ Respons belum selesai, melanjutkan (${continueCount}/${MAX_CONTINUES}) ...`);

    const continuePrompt = 'Lanjutkan dari tempat kamu berhenti, jangan ulangi yang sudah ada.';
    result = await chatFn(continuePrompt, history);

    const cont = result.answer || '';
    if (!cont.trim()) break;

    fullResponse += '\n' + cont;
    history.push({ user: continuePrompt, assistant: cont });
    printResponse(cont);
  }

  console.log('');
  return fullResponse;
}

function isCutOff(text) {
  const trimmed = text.trim();
  if (!trimmed) return false;

  // Signs the response was cut mid-sentence or mid-codeblock
  const lastChar = trimmed[trimmed.length - 1];
  const lastLine = trimmed.split('\n').pop().trim();

  // Code block opened but not closed
  const codeBlocks = (trimmed.match(/```/g) || []).length;
  if (codeBlocks % 2 !== 0) return true;

  // Last line ends with hanging syntax
  if (lastLine.endsWith(',') || lastLine.endsWith('(') || lastLine.endsWith('{')) return true;

  // Last sentence ends mid-word (no punctuation)
  if (lastChar && !'。.!?，,。！？\n`}'.includes(lastChar)) {
    // Check if the last word looks incomplete (very short word at end of long text)
    const words = trimmed.split(/\s+/);
    const lastWord = words[words.length - 1];
    if (lastWord.length <= 2 && trimmed.length > 200) return true;
  }

  return false;
}

function printResponse(text) {
  const lines = (text || '').split('\n');
  for (const line of lines) {
    console.log('  ' + chalk.white(line));
  }
}

// ─── Get AI chat function ─────────────────────────────────────────────────────

async function getAIChatFn() {
  const config   = loadConfig();
  const provider = config.default_provider || 'deepseek';

  const { deepseekChat } = await import('../services/deepseek.js');
  const { geminiChat }   = await import('../services/gemini.js');
  const { claudeChat }   = await import('../services/claude.js');
  const { copilotChat }  = await import('../services/copilot.js');

  const map = { deepseek: deepseekChat, gemini: geminiChat, claude: claudeChat, copilot: copilotChat };
  return map[provider] || deepseekChat;
}

// ─── /debug command ──────────────────────────────────────────────────────────

export async function cmdDebug(targetPath) {
  if (!targetPath) {
    log.error('Usage: /debug <file|folder>');
    log.dim('Contoh: /debug app.py   /debug ./src');
    return;
  }

  const abs = path.resolve(targetPath);

  if (!fs.existsSync(abs)) {
    log.error(`Tidak ditemukan: ${abs}`);
    return;
  }

  log.info(`Debug: ${chalk.cyan(abs)}`);
  log.dim('Membaca file dan menganalisis dengan AI ...');

  let codeContent;
  try {
    codeContent = readTarget(abs);
  } catch (e) {
    log.error(`Gagal baca: ${e.message}`);
    return;
  }

  const systemPrompt = `Kamu adalah expert programmer dan debugger. Tugasmu menganalisis kode secara menyeluruh.
Analisis meliputi:
1. Bug dan error yang ada atau potensi error
2. Memory leaks atau performa buruk
3. Security vulnerabilities
4. Logic errors
5. Code smell dan anti-patterns
6. Saran perbaikan konkret dengan contoh kode

Selalu jawab lengkap dan detail. Jangan potong jawaban. Gunakan bahasa Indonesia yang jelas.`;

  const userPrompt = `Debug dan analisis kode berikut:\n\n${codeContent}`;

  try {
    const chatFn = await getAIChatFn();
    await callAIWithAutoContinue(systemPrompt, userPrompt, chatFn);
  } catch (e) {
    log.error(`AI error: ${e.message}`);
  }
}

// ─── /feature command ─────────────────────────────────────────────────────────

export async function cmdFeature(args) {
  const parts      = args.trim().split(/\s+/);
  const targetPath = parts[0];
  const featureReq = parts.slice(1).join(' ');

  if (!targetPath) {
    log.error('Usage: /feature <file|folder> [deskripsi fitur]');
    log.dim('Contoh: /feature app.js tambahkan rate limiting');
    log.dim('        /feature ./src tambahkan authentication JWT');
    return;
  }

  const abs = path.resolve(targetPath);

  if (!fs.existsSync(abs)) {
    log.error(`Tidak ditemukan: ${abs}`);
    return;
  }

  log.info(`Feature: ${chalk.cyan(abs)}`);
  if (featureReq) log.dim(`Fitur diminta: ${chalk.yellow(featureReq)}`);
  log.dim('Membaca kode dan menyiapkan AI ...');

  let codeContent;
  try {
    codeContent = readTarget(abs);
  } catch (e) {
    log.error(`Gagal baca: ${e.message}`);
    return;
  }

  const systemPrompt = `Kamu adalah expert software engineer. Tugasmu menambahkan fitur baru ke kode yang ada.
Kamu harus:
1. Pahami struktur kode yang ada
2. Tambahkan fitur yang diminta secara elegan dan terintegrasi
3. Tulis kode lengkap yang bisa langsung dipakai
4. Jelaskan apa yang diubah dan cara menggunakannya
5. Jangan hapus fitur yang sudah ada
6. Ikuti style dan pattern yang sudah ada di kode

Selalu jawab lengkap dengan kode penuh. Jangan potong jawaban. Gunakan bahasa Indonesia.`;

  const featureDesc = featureReq || 'Analisis kode dan sarankan fitur-fitur yang bisa ditambahkan, lalu implementasikan yang paling berguna.';
  const userPrompt  = `Kode yang ada:\n\n${codeContent}\n\n---\nPermintaan fitur: ${featureDesc}\n\nTulis implementasi lengkap dengan penjelasan.`;

  try {
    const chatFn = await getAIChatFn();
    await callAIWithAutoContinue(systemPrompt, userPrompt, chatFn);
  } catch (e) {
    log.error(`AI error: ${e.message}`);
  }
}
