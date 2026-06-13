import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): { name: string; status: string; uptime: number } {
    return {
      name: 'SwiftShip AI',
      status: 'ok',
      uptime: process.uptime(),
    };
  }
}
