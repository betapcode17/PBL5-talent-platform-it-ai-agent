/**
 * Helper to clean and format chat history to strictly comply with Google Gemini API rules:
 * 1. History must start with a 'user' turn.
 * 2. Roles must strictly alternate: 'user' -> 'model' -> 'user' -> 'model'...
 * 3. Consecutive messages of the same role are merged.
 * 4. History must end with a 'model' turn so that the subsequent chat.sendMessage() is 'user'.
 */
export function sanitizeGeminiHistory(rawHistory = []) {
  if (!Array.isArray(rawHistory) || rawHistory.length === 0) {
    return [];
  }

  const items = [];

  for (const msg of rawHistory) {
    const role = msg.role === 'assistant' ? 'model' : 'user';
    const text = (msg.content || '').trim();
    if (!text) continue;

    if (items.length === 0) {
      if (role === 'model') {
        // Prepend user message so conversation starts with user turn
        items.push({
          role: 'user',
          parts: [{ text: 'Bắt đầu cuộc trò chuyện' }],
        });
      }
      items.push({
        role,
        parts: [{ text }],
      });
    } else {
      const last = items[items.length - 1];
      if (last.role === role) {
        // Merge consecutive messages of identical role
        last.parts[0].text += '\n\n' + text;
      } else {
        items.push({
          role,
          parts: [{ text }],
        });
      }
    }
  }

  // If the last message in history is 'user', pop it because sendMessage() will provide the next user message
  if (items.length > 0 && items[items.length - 1].role === 'user') {
    items.pop();
  }

  return items;
}

export default {
  sanitizeGeminiHistory,
};
