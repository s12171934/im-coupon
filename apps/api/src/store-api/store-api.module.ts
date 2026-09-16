import { Controller, Get, Inject, Module, Query } from '@nestjs/common';
import { StoreApiService } from './store-api.service';

@Controller('store-api')
class StoreApiController {
  constructor(@Inject(StoreApiService) private readonly service: StoreApiService) {}

  @Get('stores')
  search(@Query() query: Record<string, unknown>) {
    return this.service.search(query);
  }
}

@Module({ controllers: [StoreApiController], providers: [StoreApiService] })
export class StoreApiModule {}
