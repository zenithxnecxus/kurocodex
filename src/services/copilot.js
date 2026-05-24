import WebSocket from 'ws';
import axios from 'axios';

const MODELS = {
  default:        'chat',
  'think-deeper': 'reasoning',
  'gpt-5':        'smart',
};

const HEADERS = {
  origin:       'https://copilot.microsoft.com',
  'user-agent': 'Mozilla/5.0 (Linux; Android 15; SM-F958 Build/AP3A.240905.015) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.86 Mobile Safari/537.36',
};

export async function copilotChat(prompt, model = 'default') {
  const mode = MODELS[model] || 'chat';

  // Step 1: create conversation
  let conversationId;
  try {
    const { data } = await axios.post(
      'https://copilot.microsoft.com/c/api/conversations',
      null,
      { headers: HEADERS, timeout: 10000 }
    );
    conversationId = data.id;
  } catch (e) {
    throw new Error(`Copilot: gagal buat conversation — ${e.message}`);
  }

  // Step 2: WebSocket chat
  return new Promise((resolve, reject) => {
    const wsUrl = 'wss://copilot.microsoft.com/c/api/chat?api-version=2&features=-,ncedge,edgepagecontext&setflight=-,ncedge,edgepagecontext&ncedge=1';

    let ws;
    try {
      ws = new WebSocket(wsUrl, { headers: HEADERS });
    } catch (e) {
      return reject(new Error(`Copilot: WebSocket error — ${e.message}`));
    }

    const response = { text: '', citations: [] };
    const timer    = setTimeout(() => {
      ws.terminate();
      reject(new Error('Copilot: timeout 60s'));
    }, 60000);

    ws.on('open', () => {
      ws.send(JSON.stringify({
        event: 'setOptions',
        supportedFeatures: ['partial-generated-images'],
        supportedCards: ['weather', 'local', 'image', 'sports', 'video', 'ads', 'safetyHelpline', 'quiz', 'finance', 'recipe'],
        ads: { supportedTypes: ['text', 'product', 'multimedia'] },
      }));
      ws.send(JSON.stringify({
        event:          'send',
        mode,
        conversationId,
        content:        [{ type: 'text', text: prompt }],
        context:        {},
      }));
    });

    ws.on('message', chunk => {
      try {
        const parsed = JSON.parse(chunk.toString());
        switch (parsed.event) {
          case 'appendText':
            response.text += parsed.text || '';
            break;
          case 'citation':
            response.citations.push({ title: parsed.title, url: parsed.url });
            break;
          case 'done':
            clearTimeout(timer);
            if (!response.text) return reject(new Error('Copilot: respons kosong'));
            resolve({ answer: response.text, citations: response.citations, model: `copilot-${mode}` });
            ws.close();
            break;
          case 'error':
            clearTimeout(timer);
            reject(new Error(`Copilot: ${parsed.message || JSON.stringify(parsed)}`));
            ws.close();
            break;
        }
      } catch { /* skip malformed frames */ }
    });

    ws.on('error', e => { clearTimeout(timer); reject(new Error(`Copilot WS: ${e.message}`)); });
  });
}
