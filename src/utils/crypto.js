import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { homedir } from 'os';

const CONFIG_DIR  = path.join(homedir(), '.kurocodex');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.enc');
const SECRET_FILE = path.join(CONFIG_DIR, '.secret');

function ensureDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

function getOrCreateSecret() {
  ensureDir();
  if (fs.existsSync(SECRET_FILE)) {
    return fs.readFileSync(SECRET_FILE, 'utf-8').trim();
  }
  const secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(SECRET_FILE, secret, { mode: 0o600 });
  return secret;
}

export function encrypt(text) {
  const secret = getOrCreateSecret();
  const key    = Buffer.from(secret, 'hex');
  const iv     = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted  = cipher.update(text, 'utf8', 'hex');
  encrypted     += cipher.final('hex');
  const authTag  = cipher.getAuthTag();

  return JSON.stringify({
    iv:   iv.toString('hex'),
    tag:  authTag.toString('hex'),
    data: encrypted,
  });
}

export function decrypt(encryptedData) {
  const secret         = getOrCreateSecret();
  const key            = Buffer.from(secret, 'hex');
  const { iv, tag, data } = JSON.parse(encryptedData);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));

  let decrypted  = decipher.update(data, 'hex', 'utf8');
  decrypted     += decipher.final('utf8');
  return decrypted;
}

export function saveConfig(config) {
  ensureDir();
  const encrypted = encrypt(JSON.stringify(config));
  fs.writeFileSync(CONFIG_FILE, encrypted, { mode: 0o600 });
}

export function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    const defaultConfig = {
      default_provider:  'deepseek',
      allow_file_read:   false,
      allow_command_exec: false,
      crawl_max_pages:   50,
      scrape_timeout:    15000,
      api_keys:          {},
    };
    saveConfig(defaultConfig);
    return defaultConfig;
  }
  try {
    const encrypted = fs.readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(decrypt(encrypted));
  } catch {
    return { default_provider: 'deepseek', allow_file_read: false, allow_command_exec: false, crawl_max_pages: 50, scrape_timeout: 15000, api_keys: {} };
  }
}

export function setApiKey(provider, key) {
  const config = loadConfig();
  if (!config.api_keys) config.api_keys = {};
  config.api_keys[provider] = key;
  saveConfig(config);
}

export function getApiKey(provider) {
  const config = loadConfig();
  return config.api_keys?.[provider] || '';
}

export function setConfigValue(key, value) {
  const config = loadConfig();
  config[key] = value;
  saveConfig(config);
}

export { CONFIG_DIR, CONFIG_FILE };
