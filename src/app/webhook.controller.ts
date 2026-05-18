import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { AppService } from './app.service';

@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(private readonly appService: AppService) {}

  @Post('malipo')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Body() body: any,
    @Headers('x-webhook-signature') signature: string,
    @Headers('x-webhook-event') eventType: string
  ) {
    const event = body.event || eventType;
    this.logger.log(`📥 Received Webhook Event: "${event}"`);

    // 1. Handle FastAPI accessibility test (test.ping)
    if (event === 'test.ping') {
      this.logger.log('👋 Received test.ping verification. Satisfying accessibility test with 200 OK.');
      return {
        status: 'success',
        message: 'Webhook listener is active and accessible!',
      };
    }

    // 2. Validate webhook signature for transactional events
    if (!signature) {
      this.logger.warn('❌ Rejecting webhook request: Missing X-Webhook-Signature header.');
      throw new UnauthorizedException('Missing signature header');
    }

    const isValid = this.appService.verifyWebhookSignature(body, signature);
    if (!isValid) {
      this.logger.error('❌ Webhook signature verification failed! Untrusted payload rejected.');
      throw new UnauthorizedException('Invalid webhook signature');
    }

    // 3. Process webhook event
    this.logger.log('✅ Webhook signature verified successfully.');
    this.logger.log(`📦 Webhook payload:\n${JSON.stringify(body, null, 2)}`);

    const data = body.data;

    switch (event) {
      case 'payment.success':
        this.logger.log(
          `💰 Payment of ${data.amount} KES received successfully! [M-Pesa Ref: ${
            data.mpesa_ref || 'N/A'
          }, Checkout Ref: ${data.checkout_reference}]`
        );
        break;
      case 'payment.cancelled':
        this.logger.warn(
          `⚠️ Payment cancelled by customer. [Checkout Ref: ${data.checkout_reference}, Reason: ${
            data.reason || 'Declined'
          }]`
        );
        break;
      case 'payment.failed':
        this.logger.error(
          `❌ Payment failed. [Checkout Ref: ${data.checkout_reference}, Reason: ${
            data.reason || 'Failed'
          }]`
        );
        break;
      default:
        this.logger.log(`ℹ️ Unhandled webhook event type: ${event}`);
    }

    return {
      status: 'processed',
      event: event,
    };
  }
}
