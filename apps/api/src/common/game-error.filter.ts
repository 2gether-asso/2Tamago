import { Catch, HttpStatus, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { GameError } from '@2tamago/core';
import type { ApiErrorBody } from '@2tamago/core/contracts';
import type { Response } from 'express';

/** Rule violations from the game engine become `409 Conflict` with a code. */
@Catch(GameError)
export class GameErrorFilter implements ExceptionFilter {
  catch(error: GameError, host: ArgumentsHost): void {
    const body: ApiErrorBody = {
      statusCode: HttpStatus.CONFLICT,
      message: error.message,
      code: error.code,
    };
    host.switchToHttp().getResponse<Response>().status(HttpStatus.CONFLICT).json(body);
  }
}
