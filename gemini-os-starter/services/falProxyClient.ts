/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Secure FAL client that routes through backend proxy
 * Replaces direct fal.ai SDK usage to protect API keys
 */

import { getApiBaseUrl } from './apiConfig';

export interface FalProxyRequest {
  endpoint: string;
  input: Record<string, any>;
  logs?: boolean;
}

export interface FalProxyResponse {
  success: boolean;
  data?: any;
  error?: string;
  message?: string;
}

/**
 * Call FAL API through secure backend proxy
 */
export async function falProxySubscribe(
  endpoint: string,
  options: { input: Record<string, any>; logs?: boolean }
): Promise<any> {
  const apiUrl = `${getApiBaseUrl()}/api/fal-proxy`;

  console.log(`[FalProxy] Calling ${endpoint} via backend proxy...`);

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        endpoint,
        input: options.input,
        logs: options.logs || false,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    const result: FalProxyResponse = await response.json();

    if (!result.success) {
      throw new Error(result.message || 'FAL proxy request failed');
    }

    console.log(`[FalProxy] ${endpoint} completed successfully`);
    return { data: result.data };
  } catch (error: any) {
    console.error(`[FalProxy] ${endpoint} failed:`, error);
    throw new Error(`FAL proxy error: ${error.message}`);
  }
}

/**
 * Helper: Generate music via proxy
 */
export async function generateMusicViaProxy(
  endpoint: string,
  prompt: string,
  duration: number
): Promise<any> {
  return falProxySubscribe(endpoint, {
    input: { prompt, duration },
    logs: true,
  });
}

/**
 * Helper: Generate image via proxy
 */
export async function generateImageViaProxy(
  endpoint: string,
  prompt: string,
  imageSize?: { width: number; height: number },
  referenceImage?: string | Blob,
  additionalParams?: Record<string, any>
): Promise<any> {
  const input: Record<string, any> = {
    prompt,
    ...additionalParams,
  };

  if (imageSize) {
    input.image_size = imageSize;
  }

  if (referenceImage) {
    // Handle Blob or URL
    if (referenceImage instanceof Blob) {
      // Convert Blob to base64 for transmission
      const base64 = await blobToBase64(referenceImage);
      input.image_url = base64;
    } else {
      input.image_url = referenceImage;
    }
  }

  return falProxySubscribe(endpoint, { input, logs: true });
}

/**
 * Convert Blob to base64 data URL
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
