/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * API Configuration
 *
 * In development (vite dev):
 * - Uses empty string to leverage Vite's proxy to localhost:8787
 * - Requires running `wrangler dev` on port 8787
 *
 * In production (built):
 * - Uses VITE_API_BASE_URL to point to deployed Workers API
 * - Example: https://gemini-os-workers.your-subdomain.workers.dev
 */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

/**
 * Helper to construct full API URLs
 */
export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}
