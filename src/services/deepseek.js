import axios from 'axios';
import crypto from 'node:crypto';

const BASE = 'https://notegpt.io';
const ua   = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36';

function uuid()       { return crypto.randomUUID(); }
function rand(n = 10) { return Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join(''); }
function sboxGuid()   { const n = Math.floor(Date.now() / 1000); return Buffer.from(`${n}|762|${rand(9)}`).toString('base64'); }

function makeCookie() {
  const n = Math.floor(Date.now() / 1000);
  return [
    `_ga_PFX3BRW5RQ=GS2.1.s${n}$o1$g0$t${n}$j60$l0$h${rand(9)}`,
    `_ga=GA1.2.${rand(9)}.${n}`,
    `_gid=GA1.2.${rand(9)}.${n}`,
    `_gat_gtag_UA_252982427_14=1`,
    `sbox-guid=${encodeURIComponent(sboxGuid())}`,
    `anonymous_user_id=${uuid()}`,
  ].join('; ');
}

function toHistory(history) {
  return history.slice(-5).flatMap(h => [
    { role: 'user',      content: h.user },
    { role: 'assistant', content: h.assistant },
  ]);
}

function parseSSE(raw) {
  let answer = '', reasoning = '';
  for (const line of raw.split(/\r?\n/)) {
    const clean = line.trim();
    if (!clean.startsWith('data:')) continue;
    const text = clean.replace(/^data:\s*/, '').trim();
    if (!text || text === '[DONE]') continue;
    try {
      const j = JSON.parse(text);
      if (j.reasoning) reasoning += j.reasoning;
      if (j.text)      answer    += j.text;
      if (j.done)      break;
    } catch {}
  }
  return { answer, reasoning };
}

async function _request(payload, referer) {
  const res = await axios.post(`${BASE}/api/v2/chat/stream`, JSON.stringify(payload), {
    timeout:        60000,
    responseType:   'stream',
    validateStatus: () => true,
    headers: {
      'sec-ch-ua-platform': '"Android"',
      'User-Agent':         ua,
      'sec-ch-ua':          '"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
      'Content-Type':       'application/json',
      'sec-ch-ua-mobile':   '?1',
      'Accept':             '*/*',
      'Origin':             BASE,
      'sec-fetch-site':     'same-origin',
      'sec-fetch-mode':     'cors',
      'sec-fetch-dest':     'empty',
      'Referer':            `${BASE}/${referer}`,
      'Accept-Encoding':    'gzip, deflate, br, zstd',
      'Accept-Language':    'id-ID,id;q=0.9',
      'Cookie':             makeCookie(),
      'priority':           'u=1, i',
    },
  });

  let rawBody = '';
  res.data.setEncoding('utf8');
  res.data.on('data', chunk => { rawBody += chunk; });

  return new Promise((resolve, reject) => {
    res.data.on('end', () => resolve({ status: res.status, raw: rawBody }));
    res.data.on('error', reject);
  });
}

export async function deepseekChat(prompt, history = []) {
  const attempts = [
    { model: 'deepseek-v4-flash', chat_mode: 'deep_think', referer: 'chat-deepseek' },
    { model: 'deepseek-v4-flash', chat_mode: 'standard',   referer: 'chat-deepseek' },
    { model: 'deepseek-v3',       chat_mode: 'standard',   referer: 'ai-chat' },
    { model: 'deepseek-chat',     chat_mode: 'standard',   referer: 'ai-chat' },
  ];

  let lastErr = '';
  for (const { model, chat_mode, referer } of attempts) {
    const payload = {
      message:          prompt,
      language:         'auto',
      model,
      tone:             'default',
      length:           'moderate',
      conversation_id:  uuid(),
      image_urls:       [],
      history_messages: toHistory(history),
      chat_mode,
    };
    try {
      const { status, raw } = await _request(payload, referer);
      if (status !== 200) { lastErr = `HTTP ${status}: ${raw.slice(0,80)}`; continue; }
      const { answer, reasoning } = parseSSE(raw);
      if (answer || reasoning) return { answer: answer || reasoning, reasoning, model: `${model}/${chat_mode}` };
      lastErr = `empty response (raw: ${raw.slice(0,80)})`;
    } catch (e) { lastErr = e.message; }
  }

  throw new Error(`DeepSeek gagal: ${lastErr}`);
}
