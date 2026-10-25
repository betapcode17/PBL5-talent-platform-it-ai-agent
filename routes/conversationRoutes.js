import express from 'express';
import conversationStore from '../services/conversationStore.js';

const router = express.Router();

// List conversations
router.get('/conversation', async (req, res) => {
  try {
    const { kind, limit } = req.query;
    const list = await conversationStore.getConversations(
      parseInt(limit || '50', 10),
      kind || null
    );
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create new conversation
router.post('/conversation', async (req, res) => {
  try {
    const { kind } = req.query;
    const conv = await conversationStore.createConversation(
      'Cuộc trò chuyện mới',
      kind || 'job_chat'
    );
    res.json(conv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get messages for a conversation
router.get('/conversation/:id/message', async (req, res) => {
  try {
    const convId = req.params.id;
    const conv = await conversationStore.getConversation(convId);
    if (!conv) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    const messages = await conversationStore.getMessages(convId);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a conversation
router.delete('/conversation/:id', async (req, res) => {
  try {
    const convId = req.params.id;
    const deleted = await conversationStore.deleteConversation(convId);
    if (!deleted) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    res.json({ success: true, message: 'Conversation deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Rename a conversation
router.post('/conversation/rename', async (req, res) => {
  try {
    const { conversationId, newTitle } = req.body;
    if (!conversationId || !newTitle) {
      return res.status(400).json({ error: 'conversationId and newTitle are required' });
    }
    const updated = await conversationStore.renameConversation(conversationId, newTitle);
    if (!updated) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    res.json({
      success: true,
      conversationId,
      newTitle,
      updatedAt: updated.updateAt,
      message: 'Đã đổi tên đoạn chat thành công',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
