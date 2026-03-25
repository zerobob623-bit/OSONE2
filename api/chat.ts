import axios from 'axios';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
}

  const { messages, systemInstruction } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Messages array is required' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OpenAI API Key not configured' });
  }

  try {
    const formattedMessages = [
{ 
        role: 'system', 
                  content: systemInstruction || 'You are a helpful assistant.' 
          },
                ...messages.map((msg) => ({
                  role: msg.role === 'user' ? 'user' : 'assistant',
                  content: msg.content
          }))
              ];

    const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
      {
              model: 'gpt-4o-mini',
              messages: formattedMessages,
              temperature: 0.7,
              max_tokens: 1024
      },
      {
              headers: {
                Authorization: `Bearer ${apiKey}`,
                            'Content-Type': 'application/json'
                  }
}
    );

    res.status(200).json({ 
            text: response.data.choices[0].message.content 
      });
  } catch (error) {
    console.error('Error calling OpenAI API:', error.response?.data || error.message);
    res.status(500).json({ 
            error: 'Failed to generate response from OpenAI' 
      });
  }
}
