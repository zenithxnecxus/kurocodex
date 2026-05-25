import axios from 'axios';

const CHATGPT_API_URL = 'https://theturbochat.com/chat';

export async function chatGPTChat(prompt, history, systemPrompt, temperature) {
  try {
    let conversation = '';

    conversation += `System: ${systemPrompt}\n\n`;

    const lastHistory = history.slice(-10);
    for (const h of lastHistory) {
      conversation += `User: ${h.user}\nAssistant: ${h.assistant}\n`;
    }

    conversation += `User: ${prompt}\nAssistant: `;

    const requestBody = {
      message: conversation,
      model: "gpt-3.5-turbo",
      language: "id"
    };

    const response = await axios.post(CHATGPT_API_URL, requestBody, {
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://theturbochat.com',
        'Referer': 'https://theturbochat.com/',
        'Cookie': '_ga=shssuite; fpestid=shs',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
      },
      timeout: 60000
    });

    let answer = '';

    if (response.data?.choices?.[0]?.message?.content) {
      answer = response.data.choices[0].message.content;
    } else if (response.data?.response) {
      answer = response.data.response;
    } else if (response.data?.message) {
      answer = response.data.message;
    } else if (response.data?.content) {
      answer = response.data.content;
    } else if (typeof response.data === 'string') {
      answer = response.data;
    } else {
      try {
        const parsed = JSON.parse(JSON.stringify(response.data));
        if (parsed.choices?.[0]?.message?.content) {
          answer = parsed.choices[0].message.content;
        } else {
          answer = JSON.stringify(response.data);
        }
      } catch (e) {
        answer = JSON.stringify(response.data);
      }
    }

    if (!answer || answer.length === 0 || answer.includes('{"choices"')) {
      throw new Error('Invalid response format');
    }

    return {
      answer: answer,
      usage: { total_tokens: Math.ceil(answer.length / 4) }
    };

  } catch (error) {
    console.error('ChatGPT API Error:', error.message);

    return {
      answer: `⚠️ ChatGPT Error: ${error.message}\n\nCoba /provider groq atau /provider claude dulu ya!`,
      usage: { total_tokens: 0 }
    };
  }
}
