import { GoogleGenerativeAI } from '@google/generative-ai';
import config from './env.js';

let genAIInstance = null;

export function getGenAI() {
  if (!genAIInstance) {
    if (!config.geminiApiKey) {
      console.warn('[Gemini] Warning: GEMINI_API_KEY is not set in environment!');
    }
    genAIInstance = new GoogleGenerativeAI(config.geminiApiKey);
  }
  return genAIInstance;
}

export function getGenerativeModel(modelName = config.geminiModel, options = {}) {
  const genAI = getGenAI();
  return genAI.getGenerativeModel({
    model: modelName,
    ...options,
  });
}

export default {
  getGenAI,
  getGenerativeModel,
};
