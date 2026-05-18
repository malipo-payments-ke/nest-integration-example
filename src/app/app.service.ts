import {
  Injectable,
  Logger,
  InternalServerErrorException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';

export interface STKPushPayload {
  amount: number;
  phone: string;
  description: string;
  channel?: 'mpesa' | 'airtel';
}

@Injectable()
export class AppService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AppService.name);
  private readonly apiKey = process.env.MALIPO_API_KEY;
  private readonly apiSecret = process.env.MALIPO_API_SECRET;
  private readonly apiUrl =
    process.env.MALIPO_API_URL || 'http://localhost:3000';
  private readonly webhookUrl = process.env.MALIPO_WEBHOOK_URL;

  // Stored in memory after successful registration handshake
  private webhookSecret = process.env.MALIPO_WEBHOOK_SECRET || '';

  constructor(private readonly httpService: HttpService) {
    if (!this.apiKey || !this.apiSecret) {
      this.logger.warn(
        '⚠️ MALIPO_API_KEY or MALIPO_API_SECRET is not configured in the environment!',
      );
    } else {
      this.logger.log('✅ Malipo credentials loaded successfully');
    }
  }

  async onApplicationBootstrap() {
    // Automatically register webhook if MALIPO_WEBHOOK_URL is configured
    if (this.webhookUrl) {
      this.logger.log(
        `🔄 Detecting Webhook URL configured: ${this.webhookUrl}`,
      );
      // Wait slightly for the NestJS server to be fully up and listening to ports
      setTimeout(async () => {
        try {
          await this.registerWebhook();
        } catch (err: any) {
          this.logger.error(
            `❌ Failed to auto-register webhook: ${err.message}`,
          );
        }
      }, 3000);
    }
  }

  getData(): { message: string } {
    return { message: 'Malipo Test API Gateway is Active 🚀' };
  }

  /**
   * Securely registers the webhook URL on the Malipo Gateway
   */
  async registerWebhook(): Promise<Record<string, unknown>> {
    if (!this.webhookUrl) {
      throw new Error('MALIPO_WEBHOOK_URL is not set.');
    }
    if (!this.apiKey || !this.apiSecret) {
      throw new Error(
        'API Key or Secret missing. Cannot perform secure registration handshake.',
      );
    }

    const payload = { url: this.webhookUrl };
    const bodyStr = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const payloadToSign = `${timestamp}.${bodyStr}`;

    const signature = crypto
      .createHmac('sha256', this.apiSecret)
      .update(payloadToSign)
      .digest('hex');

    const targetUrl = `${this.apiUrl}/v1/apps/register`;
    this.logger.log(
      `Sending secure webhook registration request to: ${targetUrl}`,
    );

    try {
      const response = await firstValueFrom(
        this.httpService.post(targetUrl, payload, {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': this.apiKey,
            'X-Timestamp': timestamp,
            'X-API-Signature': signature,
          },
        }),
      );

      const { webhook_secret } = response.data as { webhook_secret?: string };
      if (webhook_secret) {
        this.webhookSecret = webhook_secret;
        this.logger.log(
          `✅ Webhook registered successfully! Secret captured & persisted in-memory.`,
        );
      }
      return response.data as Record<string, unknown>;
    } catch (error: any) {
      this.logger.error(
        `Webhook registration handshake failed: ${
          error.response?.data?.message ||
          error.response?.data?.detail ||
          error.message
        }`,
      );
      throw error;
    }
  }

  /**
   * Verifies the authenticity of webhook requests from Malipo Gateway
   */
  verifyWebhookSignature(body: any, signature: string): boolean {
    if (!this.webhookSecret) {
      this.logger.warn(
        '⚠️ Webhook secret is not set yet. Skipping signature validation (unsafe).',
      );
      return true; // Fallback during testing/handshake phase
    }

    try {
      const payloadStr = JSON.stringify(body);
      const computedSignature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(payloadStr)
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(computedSignature, 'hex'),
        Buffer.from(signature, 'hex'),
      );
    } catch (e: any) {
      this.logger.error(`Error during signature verification: ${e.message}`);
      return false;
    }
  }

  async initiateSTKPush(payload: STKPushPayload): Promise<Record<string, unknown>> {
    if (!this.apiKey || !this.apiSecret) {
      throw new InternalServerErrorException(
        'Malipo public API credentials are not set. Check your .env file.',
      );
    }

    const { amount, phone, description, channel = 'mpesa' } = payload;
    const requestBody = { amount, phone, description, channel };
    const bodyStr = JSON.stringify(requestBody);

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const payloadToSign = `${timestamp}.${bodyStr}`;

    const signature = crypto
      .createHmac('sha256', this.apiSecret)
      .update(payloadToSign)
      .digest('hex');

    const targetUrl = `${this.apiUrl}/v1/payments/stk-push`;
    this.logger.log(
      `Initiating STK Push call to: ${targetUrl} [Channel: ${channel}]`,
    );

    try {
      const response = await firstValueFrom(
        this.httpService.post(targetUrl, requestBody, {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': this.apiKey,
            'X-Timestamp': timestamp,
            'X-API-Signature': signature,
          },
        }),
      );

      this.logger.log(
        `STK Push initiated successfully: ${JSON.stringify(response.data)}`,
      );
      return response.data as Record<string, unknown>;
    } catch (error: any) {
      this.logger.error(
        `Failed to initiate STK Push: ${error.response?.data?.message || error.message}`,
      );
      throw new InternalServerErrorException(
        error.response?.data || {
          message: 'An error occurred while calling Malipo STK push service',
          error: error.message,
        },
      );
    }
  }

  async generateQRCode(amount: number, description?: string): Promise<Record<string, unknown>> {
    if (!this.apiKey || !this.apiSecret) {
      throw new InternalServerErrorException(
        'Malipo credentials are not configured.',
      );
    }
    const requestBody = { amount, description };
    const bodyStr = JSON.stringify(requestBody);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const payloadToSign = `${timestamp}.${bodyStr}`;

    const signature = crypto
      .createHmac('sha256', this.apiSecret)
      .update(payloadToSign)
      .digest('hex');

    const targetUrl = `${this.apiUrl}/v1/qr/generate`;
    this.logger.log(`Generating Dynamic QR code for amount KES ${amount}...`);

    try {
      const response = await firstValueFrom(
        this.httpService.post(targetUrl, requestBody, {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': this.apiKey,
            'X-Timestamp': timestamp,
            'X-API-Signature': signature,
          },
        }),
      );
      return response.data as Record<string, unknown>;
    } catch (error: any) {
      this.logger.error(
        `Failed to generate QR: ${error.response?.data?.message || error.message}`,
      );
      throw new InternalServerErrorException(
        error.response?.data || { message: error.message },
      );
    }
  }

  async simulateC2B(amount: number, phone: string, billRef: string): Promise<Record<string, unknown>> {
    if (!this.apiKey || !this.apiSecret) {
      throw new InternalServerErrorException(
        'Malipo credentials are not configured.',
      );
    }
    const requestBody = { amount, phone, bill_ref_number: billRef };
    const bodyStr = JSON.stringify(requestBody);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const payloadToSign = `${timestamp}.${bodyStr}`;

    const signature = crypto
      .createHmac('sha256', this.apiSecret)
      .update(payloadToSign)
      .digest('hex');

    const targetUrl = `${this.apiUrl}/v1/payments/simulate-c2b`;
    this.logger.log(
      `Simulating C2B Paybill payment of KES ${amount} for account ${billRef}...`,
    );

    try {
      const response = await firstValueFrom(
        this.httpService.post(targetUrl, requestBody, {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': this.apiKey,
            'X-Timestamp': timestamp,
            'X-API-Signature': signature,
          },
        }),
      );
      return response.data as Record<string, unknown>;
    } catch (error: any) {
      this.logger.error(
        `C2B Simulation failed: ${error.response?.data?.message || error.message}`,
      );
      throw new InternalServerErrorException(
        error.response?.data || { message: error.message },
      );
    }
  }

  async withdrawFunds(amount: number, phone: string, reason?: string): Promise<Record<string, unknown>> {
    if (!this.apiKey || !this.apiSecret) {
      throw new InternalServerErrorException(
        'Malipo credentials are not configured.',
      );
    }
    const requestBody = { amount, phone, reason };
    const bodyStr = JSON.stringify(requestBody);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const payloadToSign = `${timestamp}.${bodyStr}`;

    const signature = crypto
      .createHmac('sha256', this.apiSecret)
      .update(payloadToSign)
      .digest('hex');

    const targetUrl = `${this.apiUrl}/v1/payments/withdraw`;
    this.logger.log(
      `Initiating B2C fund withdrawal of KES ${amount} to number ${phone}...`,
    );

    try {
      const response = await firstValueFrom(
        this.httpService.post(targetUrl, requestBody, {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': this.apiKey,
            'X-Timestamp': timestamp,
            'X-API-Signature': signature,
          },
        }),
      );
      return response.data as Record<string, unknown>;
    } catch (error: any) {
      this.logger.error(
        `Withdrawal failed: ${error.response?.data?.message || error.message}`,
      );
      throw new InternalServerErrorException(
        error.response?.data || { message: error.message },
      );
    }
  }
}
