import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  root() {
    return this.appService.getHello();
  }

  @Get('ping')
  ping() {
    return { pong: true, at: new Date().toISOString() };
  }
}
