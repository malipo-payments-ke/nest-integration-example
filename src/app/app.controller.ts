import { Controller, Get, Post, Body } from '@nestjs/common';
import { AppService } from './app.service';
import type { STKPushPayload } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getData() {
    return this.appService.getData();
  }

  @Post('payments/stk-push')
  async initiateSTKPush(@Body() payload: STKPushPayload) {
    return await this.appService.initiateSTKPush(payload);
  }

  @Post('qr/generate')
  async generateQRCode(
    @Body() payload: { amount: number; description?: string },
  ) {
    return await this.appService.generateQRCode(
      payload.amount,
      payload.description,
    );
  }

  @Post('payments/simulate-c2b')
  async simulateC2B(
    @Body() payload: { amount: number; phone: string; bill_ref_number: string },
  ) {
    return await this.appService.simulateC2B(
      payload.amount,
      payload.phone,
      payload.bill_ref_number,
    );
  }

  @Post('payments/withdraw')
  async withdrawFunds(
    @Body() payload: { amount: number; phone: string; reason?: string },
  ) {
    return await this.appService.withdrawFunds(
      payload.amount,
      payload.phone,
      payload.reason,
    );
  }
}
