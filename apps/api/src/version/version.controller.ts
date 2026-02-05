import { Controller, Get } from '@nestjs/common';

@Controller()
export class VersionController {
  @Get('/version')
  version() {
    return {
      sha: process.env.GIT_SHA ?? 'unknown',
      ref: process.env.GIT_REF ?? 'unknown',
      buildDate: process.env.BUILD_DATE ?? 'unknown',
    };
  }
}
