import axios from 'axios';
import FormData from 'form-data';
import { v4 as uuidv4 } from 'uuid';

const UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
];
const randUA  = () => UAS[Math.floor(Math.random() * UAS.length)];
const randVer = () => 130 + Math.floor(Math.random() * 5);

async function _call(history) {
  const form = new FormData();
  form.append('chat_style',             'claudeai_0');
  form.append('chatHistory',            JSON.stringify(history));
  form.append('model',                  'standard');
  form.append('session_uuid',           uuidv4());
  form.append('sensitivity_request_id', uuidv4());
  form.append('hacker_is_stinky',       'very_stinky');
  form.append('enabled_tools',          JSON.stringify(['image_generator', 'image_editor']));

  const v = randVer();
  const { data } = await axios.post(
    'https://api.deepai.org/hacking_is_a_serious_crime',
    form,
    {
      headers: {
        ...form.getHeaders(),
        'api-key':            'tryit-61180926040-f45718959fea9f0a04999506c579a399',
        'user-agent':         randUA(),
        'origin':             'https://deepai.org',
        'referer':            'https://deepai.org/',
        'accept':             '*/*',
        'accept-language':    'id-ID,id;q=0.9,en;q=0.8',
        'sec-ch-ua':          `"Chromium";v="${v}", "Not:A-Brand";v="24"`,
        'sec-ch-ua-mobile':   '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-site':     'same-site',
        'sec-fetch-mode':     'cors',
        'sec-fetch-dest':     'empty',
      },
      timeout:        30_000,
      validateStatus: () => true,
    }
  );

  if (!data) throw new Error('Tidak ada respons dari server');

  let reply = '';
  if (typeof data === 'string')  reply = data;
  else if (data.output)          reply = data.output;
  else if (data.response)        reply = data.response;
  else if (data.error)           throw new Error(`DeepAI: ${data.error}`);
  else                           reply = JSON.stringify(data);

  const trimmed = reply.trim();
  if (!trimmed) throw new Error('Respons kosong dari DeepAI');
  return trimmed;
}

export async function claudeChat(prompt, history = []) {
  const msgs = [
    ...history.slice(-20).flatMap(h => [
      { role: 'user',      content: h.user },
      { role: 'assistant', content: h.assistant },
    ]),
    { role: 'user', content: prompt },
  ];

  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      const reply = await _call(msgs);
      return { answer: reply, model: 'claude-via-deepai' };
    } catch (e) {
      lastErr = e;
      await new Promise(r => setTimeout(r, 1500 + Math.random() * 2000));
    }
  }
  throw new Error(`Claude gagal (3x retry): ${lastErr.message}`);
}
