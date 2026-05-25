import fs from 'fs';
import path from 'path';
import { execSync, spawn } from 'child_process';
import { log, expandPath } from '../utils/logger.js';
import chalk from 'chalk';
import archiver from 'archiver';
import os from 'os';

// ─── Language → Runner map ───────────────────────────────────────────────────

const LANG_MAP = {
  '.js':    { runner: 'node',           args: f => [f] },
  '.mjs':   { runner: 'node',           args: f => [f] },
  '.cjs':   { runner: 'node',           args: f => [f] },
  '.ts':    { runner: 'npx',            args: f => ['ts-node', f] },
  '.tsx':   { runner: 'npx',            args: f => ['ts-node', f] },
  '.jsx':   { runner: 'node',           args: f => ['--input-type=module', f] },
  '.py':    { runner: 'python3',        args: f => [f] },
  '.py2':   { runner: 'python2',        args: f => [f] },
  '.go':    { runner: 'go',             args: f => ['run', f] },
  '.rs':    { runner: null,             compile: f => `rustc ${f} -o /tmp/kuro_rs_out && /tmp/kuro_rs_out`, shell: true },
  '.rb':    { runner: 'ruby',           args: f => [f] },
  '.php':   { runner: 'php',            args: f => [f] },
  '.java':  { runner: null,             compile: f => {
    const cls = path.basename(f, '.java');
    const dir = path.dirname(f);
    return `javac ${f} && java -cp ${dir} ${cls}`;
  }, shell: true },
  '.c':     { runner: null,             compile: f => `gcc ${f} -o /tmp/kuro_c_out && /tmp/kuro_c_out`, shell: true },
  '.cpp':   { runner: null,             compile: f => `g++ ${f} -o /tmp/kuro_cpp_out && /tmp/kuro_cpp_out`, shell: true },
  '.cc':    { runner: null,             compile: f => `g++ ${f} -o /tmp/kuro_cc_out && /tmp/kuro_cc_out`, shell: true },
  '.sh':    { runner: 'bash',           args: f => [f] },
  '.zsh':   { runner: 'zsh',            args: f => [f] },
  '.fish':  { runner: 'fish',           args: f => [f] },
  '.pl':    { runner: 'perl',           args: f => [f] },
  '.lua':   { runner: 'lua',            args: f => [f] },
  '.ex':    { runner: 'elixir',         args: f => [f] },
  '.exs':   { runner: 'elixir',         args: f => [f] },
  '.kts':   { runner: 'kotlinc',        args: f => ['-script', f] },
  '.swift': { runner: 'swift',          args: f => [f] },
  '.dart':  { runner: 'dart',           args: f => ['run', f] },
  '.r':     { runner: 'Rscript',        args: f => [f] },
  '.R':     { runner: 'Rscript',        args: f => [f] },
  '.hs':    { runner: 'runghc',         args: f => [f] },
  '.scala': { runner: 'scala',          args: f => [f] },
  '.groovy':{ runner: 'groovy',         args: f => [f] },
  '.ps1':   { runner: 'pwsh',           args: f => ['-File', f] },
  '.bat':   { runner: 'cmd.exe',        args: f => ['/c', f] },
};



const PROJECT_RUNNERS = [
  { check: d => fs.existsSync(path.join(d, 'package.json')),
    run: d => {
      const pkg = JSON.parse(fs.readFileSync(path.join(d, 'package.json'), 'utf8'));
      const script = pkg.scripts?.start ? 'npm start' :
                     pkg.scripts?.dev   ? 'npm run dev' :
                     pkg.main           ? `node ${pkg.main}` : 'node index.js';
      return { cmd: script, shell: true };
    }, label: 'Node.js' },
  // Python
  { check: d => fs.existsSync(path.join(d, 'main.py')) || fs.existsSync(path.join(d, 'app.py')),
    run: d => {
      const entry = fs.existsSync(path.join(d, 'main.py')) ? 'main.py' : 'app.py';
      return { cmd: `python3 ${entry}`, shell: true };
    }, label: 'Python' },
  // Go
  { check: d => fs.existsSync(path.join(d, 'go.mod')),
    run: d => ({ cmd: 'go run .', shell: true }), label: 'Go' },
  // Rust
  { check: d => fs.existsSync(path.join(d, 'Cargo.toml')),
    run: d => ({ cmd: 'cargo run', shell: true }), label: 'Rust' },
  // PHP
  { check: d => fs.existsSync(path.join(d, 'index.php')),
    run: d => ({ cmd: 'php index.php', shell: true }), label: 'PHP' },
  // Ruby
  { check: d => fs.existsSync(path.join(d, 'Gemfile')),
    run: d => {
      const entry = fs.existsSync(path.join(d, 'main.rb')) ? 'main.rb' :
                    fs.existsSync(path.join(d, 'app.rb'))  ? 'app.rb'  : 'index.rb';
      return { cmd: `ruby ${entry}`, shell: true };
    }, label: 'Ruby' },
  // Java
  { check: d => fs.existsSync(path.join(d, 'pom.xml')),
    run: d => ({ cmd: 'mvn -q package exec:java 2>/dev/null || mvn exec:java', shell: true }), label: 'Java/Maven' },
  // Makefile
  { check: d => fs.existsSync(path.join(d, 'Makefile')),
    run: d => ({ cmd: 'make', shell: true }), label: 'Make' },
  // Docker
  { check: d => fs.existsSync(path.join(d, 'docker-compose.yml')),
    run: d => ({ cmd: 'docker compose up', shell: true }), label: 'Docker Compose' },
];


const WEB_SCRIPTS = ['dev', 'start', 'serve', 'preview'];

function detectWebProject(dir) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    const scripts = pkg.scripts || {};
    return WEB_SCRIPTS.some(s => scripts[s]);
  } catch {}
  return false;
}

function watchForPort(child) {
  let announced = false;
  const portRe  = /(?:localhost|127\.0\.0\.1):(\d+)|(?:port|PORT)[:\s]+(\d+)|(?:listening|running|started)[^\d]*(\d{4,5})/i;

  function tryAnnounce(text) {
    if (announced) return;
    const m = portRe.exec(text);
    if (m) {
      const port = m[1] || m[2] || m[3];
      if (port) {
        announced = true;
        console.log('');
        console.log(`  ${chalk.green('◆')} ${chalk.bold.cyan('http://localhost:' + port)}  ${chalk.dim('← auto-detected')}`);
        console.log('');
      }
    }
  }

  child.stdout?.on('data', d => tryAnnounce(d.toString()));
  child.stderr?.on('data', d => tryAnnounce(d.toString()));
}

// ─── Auto zip if many files ──────────────────────────────────────────────────

const ZIP_THRESHOLD = 5; // zip if folder has > this many files

async function zipFolder(folderPath) {
  const folderName = path.basename(folderPath);
  const zipName    = `${folderName}_${Date.now()}.zip`;
  const zipPath    = path.join(os.tmpdir(), zipName);

  return new Promise((resolve, reject) => {
    const output  = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolve(zipPath));
    archive.on('error', reject);

    archive.pipe(output);
    archive.directory(folderPath, folderName);
    archive.finalize();
  });
}

function countFiles(dir, ignore = ['node_modules', '.git', '__pycache__', 'vendor', 'target']) {
  let count = 0;
  try {
    for (const entry of fs.readdirSync(dir)) {
      if (ignore.includes(entry)) continue;
      const full = path.join(dir, entry);
      if (fs.statSync(full).isDirectory()) {
        count += countFiles(full, ignore);
      } else {
        count++;
      }
    }
  } catch {}
  return count;
}

// ─── Run single file ─────────────────────────────────────────────────────────

async function runFile(filePath) {
  const ext  = path.extname(filePath).toLowerCase();
  const lang = LANG_MAP[ext] || LANG_MAP[path.extname(filePath)];

  if (!lang) {
    log.error(`Ekstensi tidak dikenal: ${ext}`);
    log.dim('Didukung: ' + Object.keys(LANG_MAP).join(' '));
    return;
  }

  const isTmp = filePath.includes('kuro_auto_');
  if (!isTmp) log.info(`Menjalankan ${chalk.cyan(path.basename(filePath))} (${ext}) ...`);
  console.log(chalk.gray('  ' + '─'.repeat(60)));

  if (lang.shell) {
    const cmd = lang.compile(filePath);
    await runShell(cmd);
  } else {
    await runProcess(lang.runner, lang.args(filePath));
  }
}

// ─── Run folder / project ─────────────────────────────────────────────────────

async function runFolder(folderPath) {
  log.info(`Deteksi project di ${chalk.cyan(folderPath)} ...`);

  // Count files (excluding common large dirs)
  const fileCount = countFiles(folderPath);
  log.dim(`  Total file: ${fileCount}`);

  // Check if zip is needed
  if (fileCount > ZIP_THRESHOLD) {
    log.info(`Folder punya ${fileCount} file (>${ZIP_THRESHOLD}) → membuat ZIP ...`);
    try {
      const zipPath = await zipFolder(folderPath);
      const sizeMB  = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(2);
      log.success(`ZIP dibuat: ${chalk.cyan(zipPath)} (${sizeMB} MB)`);
    } catch (e) {
      log.warn(`Gagal zip: ${e.message}`);
    }
  }

  // Find runner
  for (const proj of PROJECT_RUNNERS) {
    if (proj.check(folderPath)) {
      log.success(`Terdeteksi: ${chalk.yellow(proj.label)}`);
      const { cmd } = proj.run(folderPath);
      log.info(`Command: ${chalk.cyan(cmd)}`);
      console.log(chalk.gray('  ' + '─'.repeat(60)));

      const origDir = process.cwd();
      process.chdir(folderPath);
      await runShell(cmd);
      process.chdir(origDir);
      return;
    }
  }

  log.warn('Tidak bisa deteksi jenis project secara otomatis.');
  log.dim('Coba /exec <command> manual, atau pastikan ada package.json / main.py / go.mod / Cargo.toml / Makefile dll.');
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function runProcess(runner, args) {
  return new Promise((resolve) => {
    const child = spawn(runner, args, { stdio: ['inherit', 'pipe', 'pipe'] });

    watchForPort(child);
    child.stdout.on('data', d => process.stdout.write(chalk.white('  ' + d.toString())));
    child.stderr.on('data', d => process.stderr.write(chalk.red('  ' + d.toString())));

    child.on('close', code => {
      console.log(chalk.gray('  ' + '─'.repeat(60)));
      if (code === 0) log.success(`Selesai (exit ${code})`);
      else            log.error(`Exit code: ${code}`);
      console.log('');
      resolve();
    });
    child.on('error', e => {
      log.error(`Gagal jalankan '${runner}': ${e.message}`);
      log.dim(`Pastikan ${runner} terinstall`);
      resolve();
    });
  });
}

async function runShell(cmd) {
  return new Promise((resolve) => {
    const child = spawn('sh', ['-c', cmd], { stdio: ['inherit', 'pipe', 'pipe'] });

    watchForPort(child);
    child.stdout.on('data', d => process.stdout.write(chalk.white('  ' + d.toString())));
    child.stderr.on('data', d => process.stderr.write(chalk.yellow('  ' + d.toString())));

    child.on('close', code => {
      console.log(chalk.gray('  ' + '─'.repeat(60)));
      if (code === 0) log.success(`Selesai (exit ${code})`);
      else            log.error(`Exit code: ${code}`);
      console.log('');
      resolve();
    });
    child.on('error', e => {
      log.error(`Shell error: ${e.message}`);
      resolve();
    });
  });
}

// ─── Exported command ─────────────────────────────────────────────────────────

export async function cmdRun(targetPath) {
  if (!targetPath) {
    log.error('Usage: /run <file|folder>');
    log.dim('Contoh: /run app.py   /run ./myproject   /run index.js');
    return;
  }

  const abs = path.resolve(expandPath(targetPath));

  if (!fs.existsSync(abs)) {
    log.error(`Tidak ditemukan: ${abs}`);
    return;
  }

  const stat = fs.statSync(abs);

  if (stat.isDirectory()) {
    await runFolder(abs);
  } else {
    await runFile(abs);
  }
}
