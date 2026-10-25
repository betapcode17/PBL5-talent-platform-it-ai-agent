import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import config from '../config/env.js';

// Schemas for MongoDB
const messageSchema = new mongoose.Schema(
  {
    _id: { type: String, default: uuidv4 },
    conversationId: { type: String, required: true, index: true },
    role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
    content: { type: String, required: true },
    messageType: { type: String, default: 'chat' },
    detectedIntent: { type: String, default: null },
    sources: { type: Array, default: [] },
    jobResults: { type: Array, default: [] },
    jobResultsTotal: { type: Number, default: 0 },
    jobResultsSummary: { type: String, default: null },
    cvAnalysis: { type: Object, default: null },
    cvJdMatch: { type: Object, default: null },
    toolCalls: { type: Array, default: [] },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

const conversationSchema = new mongoose.Schema(
  {
    _id: { type: String, default: uuidv4 },
    title: { type: String, default: 'Cuộc trò chuyện mới' },
    conversationType: { type: String, default: 'job_chat' },
    lastMessage: { type: String, default: null },
    seekerId: { type: Number, default: null },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updateAt' } }
);

let MessageModel = null;
let ConversationModel = null;
let isConnected = false;

// In-Memory Fallback Store if MongoDB is unavailable
const memoryConversations = new Map();
const memoryMessages = new Map();

export async function initDb() {
  if (isConnected) return true;
  if (!config.mongodbUri) {
    console.warn('[ConversationStore] No MONGODB_URI configured. Using In-Memory Store.');
    return false;
  }

  try {
    await mongoose.connect(config.mongodbUri, {
      dbName: config.mongodbDatabase,
      serverSelectionTimeoutMS: 5000,
    });
    MessageModel = mongoose.model('AiChatMessage', messageSchema);
    ConversationModel = mongoose.model('AiConversation', conversationSchema);
    isConnected = true;
    console.log('[ConversationStore] Connected to MongoDB Atlas successfully.');
    return true;
  } catch (err) {
    console.warn('[ConversationStore] MongoDB connection failed, falling back to In-Memory Store:', err.message);
    isConnected = false;
    return false;
  }
}

export async function createConversation(title = 'Cuộc trò chuyện mới', conversationType = 'job_chat', seekerId = null) {
  const id = uuidv4();
  const now = new Date();

  if (isConnected && ConversationModel) {
    try {
      const doc = await ConversationModel.create({
        _id: id,
        title: title || 'Cuộc trò chuyện mới',
        conversationType,
        seekerId,
      });
      return {
        id: doc._id,
        title: doc.title,
        conversationType: doc.conversationType,
        lastMessage: doc.lastMessage,
        createdAt: doc.createdAt,
        updateAt: doc.updateAt,
      };
    } catch (e) {
      console.warn('[ConversationStore] MongoDB createConversation error:', e.message);
    }
  }

  const conv = {
    id,
    title: title || 'Cuộc trò chuyện mới',
    conversationType,
    lastMessage: null,
    seekerId,
    createdAt: now,
    updateAt: now,
  };
  memoryConversations.set(id, conv);
  return conv;
}

export async function getConversations(limit = 50, conversationType = null) {
  if (isConnected && ConversationModel) {
    try {
      const query = conversationType ? { conversationType } : {};
      const docs = await ConversationModel.find(query).sort({ updateAt: -1 }).limit(limit).lean();
      return docs.map((d) => ({
        id: d._id,
        title: d.title,
        conversationType: d.conversationType,
        lastMessage: d.lastMessage,
        createdAt: d.createdAt,
        updateAt: d.updateAt,
      }));
    } catch (e) {
      console.warn('[ConversationStore] MongoDB getConversations error:', e.message);
    }
  }

  const list = Array.from(memoryConversations.values());
  const filtered = conversationType ? list.filter((c) => c.conversationType === conversationType) : list;
  return filtered.sort((a, b) => new Date(b.updateAt) - new Date(a.updateAt)).slice(0, limit);
}

export async function getConversation(convId) {
  if (!convId) return null;
  if (isConnected && ConversationModel) {
    try {
      const doc = await ConversationModel.findById(convId).lean();
      if (doc) {
        return {
          id: doc._id,
          title: doc.title,
          conversationType: doc.conversationType,
          lastMessage: doc.lastMessage,
          createdAt: doc.createdAt,
          updateAt: doc.updateAt,
        };
      }
    } catch (e) {
      console.warn('[ConversationStore] MongoDB getConversation error:', e.message);
    }
  }
  return memoryConversations.get(convId) || null;
}

export async function deleteConversation(convId) {
  if (!convId) return false;
  if (isConnected && ConversationModel && MessageModel) {
    try {
      await MessageModel.deleteMany({ conversationId: convId });
      const res = await ConversationModel.deleteOne({ _id: convId });
      return res.deletedCount > 0;
    } catch (e) {
      console.warn('[ConversationStore] MongoDB deleteConversation error:', e.message);
    }
  }

  memoryMessages.delete(convId);
  return memoryConversations.delete(convId);
}

export async function renameConversation(convId, newTitle) {
  const title = (newTitle || '').trim();
  const now = new Date();

  if (isConnected && ConversationModel) {
    try {
      const doc = await ConversationModel.findByIdAndUpdate(
        convId,
        { title, updateAt: now },
        { new: true }
      ).lean();
      if (doc) {
        return {
          id: doc._id,
          title: doc.title,
          conversationType: doc.conversationType,
          lastMessage: doc.lastMessage,
          createdAt: doc.createdAt,
          updateAt: doc.updateAt,
        };
      }
    } catch (e) {
      console.warn('[ConversationStore] MongoDB renameConversation error:', e.message);
    }
  }

  const conv = memoryConversations.get(convId);
  if (conv) {
    conv.title = title;
    conv.updateAt = now;
    return conv;
  }
  return null;
}

export async function addMessage({
  conversationId,
  role,
  content,
  messageType = 'chat',
  detectedIntent = null,
  sources = [],
  jobResults = [],
  jobResultsTotal = 0,
  jobResultsSummary = null,
  cvAnalysis = null,
  cvJdMatch = null,
  toolCalls = [],
  updateTitle = null,
}) {
  const id = uuidv4();
  const now = new Date();

  const msgPayload = {
    id,
    conversationId,
    role,
    content,
    messageType,
    detectedIntent,
    sources,
    jobResults,
    jobResultsTotal,
    jobResultsSummary,
    cvAnalysis,
    cvJdMatch,
    toolCalls,
    createdAt: now,
  };

  if (isConnected && MessageModel && ConversationModel) {
    try {
      await MessageModel.create({
        _id: id,
        ...msgPayload,
      });

      const updateFields = { lastMessage: content, updateAt: now };
      if (updateTitle) updateFields.title = updateTitle;
      await ConversationModel.findByIdAndUpdate(conversationId, updateFields);

      return msgPayload;
    } catch (e) {
      console.warn('[ConversationStore] MongoDB addMessage error:', e.message);
    }
  }

  // Fallback in memory
  if (!memoryMessages.has(conversationId)) {
    memoryMessages.set(conversationId, []);
  }
  memoryMessages.get(conversationId).push(msgPayload);

  const conv = memoryConversations.get(conversationId);
  if (conv) {
    conv.lastMessage = content;
    conv.updateAt = now;
    if (updateTitle) conv.title = updateTitle;
  }

  return msgPayload;
}

export async function getMessages(conversationId) {
  if (!conversationId) return [];

  if (isConnected && MessageModel) {
    try {
      const docs = await MessageModel.find({ conversationId }).sort({ createdAt: 1 }).lean();
      return docs.map((d) => ({
        id: d._id,
        conversationId: d.conversationId,
        role: d.role,
        content: d.content,
        messageType: d.messageType,
        detectedIntent: d.detectedIntent,
        sources: d.sources,
        jobResults: d.jobResults,
        jobResultsTotal: d.jobResultsTotal,
        jobResultsSummary: d.jobResultsSummary,
        cvAnalysis: d.cvAnalysis,
        cvJdMatch: d.cvJdMatch,
        toolCalls: d.toolCalls,
        createdAt: d.createdAt,
      }));
    } catch (e) {
      console.warn('[ConversationStore] MongoDB getMessages error:', e.message);
    }
  }

  return memoryMessages.get(conversationId) || [];
}

export async function getRecentHistory(conversationId, maxTurns = 6) {
  const messages = await getMessages(conversationId);
  if (!messages || !messages.length) return [];
  const recent = messages.slice(-maxTurns * 2);
  return recent.map((m) => ({
    role: m.role,
    content: m.content,
  }));
}

export default {
  initDb,
  createConversation,
  getConversations,
  getConversation,
  deleteConversation,
  renameConversation,
  addMessage,
  getMessages,
  getRecentHistory,
};
