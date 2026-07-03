import { AppSettings } from '../types';
import { createGeminiProvider } from './gemini';
import { mockProvider } from './mock';
import { createOpenAiProvider } from './openai';
import { LlmProvider } from './provider';

export function getProvider(settings: AppSettings): LlmProvider {
  switch (settings.provider) {
    case 'gemini':
      return createGeminiProvider(settings.geminiKey);
    case 'openai':
      return createOpenAiProvider(settings.openaiKey);
    default:
      return mockProvider;
  }
}

export type { LlmProvider, GenerateResult } from './provider';
