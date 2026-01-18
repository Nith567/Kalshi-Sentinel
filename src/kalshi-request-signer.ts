/**
 * Kalshi Request Signing Utility
 * Handles RSA-PSS signing with proper timestamp handling
 */

import crypto from 'crypto';
import axios, { AxiosRequestConfig } from 'axios';

export interface SignedHeaders {
  'KALSHI-ACCESS-KEY': string;
  'KALSHI-ACCESS-SIGNATURE': string;
  'KALSHI-ACCESS-TIMESTAMP': string;
  [key: string]: string; // Allow index signature for axios
}

/**
 * Sign a Kalshi API request
 * @param method GET, POST, etc
 * @param apiPath e.g., /trade-api/v2/portfolio/balance
 * @param apiKey Your API Key
 * @param privateKey Your Private Key (PEM format)
 * @param body Optional request body for POST
 * @returns Signed headers ready for request
 */
export function signKalshiRequest(
  method: 'GET' | 'POST' | 'DELETE' | 'PUT',
  apiPath: string,
  apiKey: string,
  privateKey: string,
  body?: Record<string, any> | null
): SignedHeaders {
  // IMPORTANT: Get fresh timestamp RIGHT BEFORE signing
  const timestampMs = Date.now();
  const timestampStr = timestampMs.toString();

  // Build message to sign: timestamp + method + path + (optional body)
  let msgString = timestampStr + method + apiPath;

  // For POST/PUT with body, append body hash
  if (body && (method === 'POST' || method === 'PUT')) {
    const bodyStr = JSON.stringify(body);
    const bodyHash = crypto.createHash('sha256').update(bodyStr).digest('hex');
    msgString = timestampStr + method + apiPath + bodyHash;
  }

  console.log(`🔐 Signing request: ${method} ${apiPath}`);
  console.log(`   Timestamp: ${timestampStr}`);
  console.log(`   Message: ${msgString.substring(0, 50)}...`);

  try {
    // Create RSA-PSS signature
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(msgString);
    sign.end();

    const signature = sign.sign({
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
    });

    const signatureBase64 = signature.toString('base64');

    const headers: SignedHeaders = {
      'KALSHI-ACCESS-KEY': apiKey,
      'KALSHI-ACCESS-SIGNATURE': signatureBase64,
      'KALSHI-ACCESS-TIMESTAMP': timestampStr,
    };

    return headers;
  } catch (error) {
    console.error('❌ Error signing request:', error);
    throw new Error(`Failed to sign Kalshi request: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Make a signed GET request to Kalshi API
 */
export async function makeSignedGetRequest(
  apiPath: string,
  apiKey: string,
  privateKey: string,
  baseUrl: string
) {
  const headers = signKalshiRequest('GET', apiPath, apiKey, privateKey, null);

  try {
    console.log(`📤 GET ${baseUrl}${apiPath}`);
    const response = await axios.get(baseUrl + apiPath, { 
      headers,
      timeout: 15000, // 15 second timeout
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(`❌ API Error: ${error.response?.status} - ${error.message}`);
      if (error.response?.data) {
        console.error('Response data:', error.response.data);
      }
    } else {
      console.error('❌ Request error:', error);
    }
    throw error;
  }
}

/**
 * Make a signed POST request to Kalshi API
 */
export async function makeSignedPostRequest(
  apiPath: string,
  apiKey: string,
  privateKey: string,
  baseUrl: string,
  body: Record<string, any>
) {
  const headers = signKalshiRequest('POST', apiPath, apiKey, privateKey, body);

  try {
    console.log(`📤 POST ${baseUrl}${apiPath}`);
    const response = await axios.post(baseUrl + apiPath, body, {
      headers,
      timeout: 15000,
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(`❌ API Error: ${error.response?.status} - ${error.message}`);
      if (error.response?.data) {
        console.error('Response data:', error.response.data);
      }
    } else {
      console.error('❌ Request error:', error);
    }
    throw error;
  }
}
