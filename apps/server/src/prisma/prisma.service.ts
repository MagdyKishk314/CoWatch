import {
  Injectable,
  Logger,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import { PrismaClient } from '@cowatch/database';

/**
 * NestJS-injectable wrapper around the generated Prisma client. Lives in the
 * app (not `@cowatch/database`) so the data package stays framework-agnostic.
 * Connection failure at boot is logged but non-fatal, so the process can still
 * serve health checks while a database comes up.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('Prisma connected.');
    } catch (err) {
      this.logger.warn(
        `Prisma could not connect at startup: ${(err as Error).message}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
