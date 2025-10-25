/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Secure Gemini client that routes through backend proxy
 * Replaces direct Gemini API SDK usage to protect API keys
 */

import { getApiBaseUrl } from './apiConfig';

export interface GeminiProxyRequest {
  model: string;
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface GeminiProxyResponse {
  success: boolean;
  data?: {
    text: string;
    raw: any;
  };
  error?: string;
  message?: string;
}

/**
 * Call Gemini API through secure backend proxy
 */
export async function geminiProxyGenerate(
  model: string,
  prompt: string,
  options?: {
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
  }
): Promise<string> {
  const apiUrl = `${getApiBaseUrl()}/api/gemini-proxy`;

  console.log(`[GeminiProxy] Calling ${model} via backend proxy...`);

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        prompt,
        systemPrompt: options?.systemPrompt,
        temperature: options?.temperature,
        maxTokens: options?.maxTokens,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    const result: GeminiProxyResponse = await response.json();

    if (!result.success || !result.data) {
      throw new Error(result.message || 'Gemini proxy request failed');
    }

    console.log(`[GeminiProxy] ${model} completed successfully`);
    return result.data.text;
  } catch (error: any) {
    console.error(`[GeminiProxy] ${model} failed:`, error);
    throw new Error(`Gemini proxy error: ${error.message}`);
  }
}

/**
 * Model constants for consistent usage
 */
export const GEMINI_MODELS = {
  FLASH_LITE: 'gemini-2.5-flash-lite',
  FLASH: 'gemini-2.5-flash',
  PRO: 'gemini-2.5-pro',
  FLASH_EXP: 'gemini-2.0-flash-exp',
} as const;
