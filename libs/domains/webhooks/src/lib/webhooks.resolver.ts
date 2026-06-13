import { Args, Int, Mutation, Resolver } from '@nestjs/graphql';
import { WebhooksService } from './webhooks.service';

@Resolver()
export class WebhooksResolver {
  constructor(private readonly webhooks: WebhooksService) {}

  @Mutation(() => String, { description: 'Subscribe to an event webhook' })
  async subscribeWebhook(
    @Args('userId', { type: () => Int }) userId: number,
    @Args('event') event: string,
    @Args('targetUrl') targetUrl: string,
    @Args('secret', { nullable: true }) secret?: string,
  ) {
    const s = await this.webhooks.subscribe(userId, event, targetUrl, secret);
    return JSON.stringify(s);
  }
}
