import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  contestBody,
  contestKind,
  voteBody,
  type ContestBody,
  type VoteBody,
} from '@2tamago/core/contracts';
import type { ContestKind } from '@2tamago/core';
import { CurrentSession, type Session } from '../auth/session.js';
import { ContestsService } from './contests.service.js';

@Controller('contests')
export class ContestsController {
  constructor(private readonly contests: ContestsService) {}

  @Get()
  overview(@CurrentSession() session: Session) {
    return this.contests.overview(session.playerId);
  }

  @Post('enter')
  @HttpCode(200)
  enter(@CurrentSession() session: Session, @Body({ schema: contestBody }) body: ContestBody) {
    return this.contests.enter(session.playerId, body.kind);
  }

  @Post('vote')
  @HttpCode(200)
  vote(@CurrentSession() session: Session, @Body({ schema: voteBody }) body: VoteBody) {
    return this.contests.vote(session.playerId, body.playerId);
  }

  @Post(':kind/claim')
  @HttpCode(200)
  claim(
    @CurrentSession() session: Session,
    @Param('kind', { schema: contestKind }) kind: ContestKind,
  ) {
    return this.contests.claim(session.playerId, kind);
  }
}
