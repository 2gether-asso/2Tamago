import { Controller, Get } from '@nestjs/common';
import type { ClientConfig } from '@2tamago/core/contracts';
import { Public } from '../auth/session.js';
import { AppConfig } from './app-config.js';

@Public()
@Controller('config')
export class ClientConfigController {
  constructor(private readonly config: AppConfig) {}

  /** What the web app cannot know at build time: it is served as static files. */
  @Get()
  get(): ClientConfig {
    return {
      sentryDsn: this.config.sentryWebDsn ?? null,
      feedbackEnabled: this.config.sentryDsn !== undefined,
      pushPublicKey: this.config.push?.publicKey ?? null,
    };
  }
}
