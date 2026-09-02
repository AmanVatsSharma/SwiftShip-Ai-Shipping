import { Injectable } from '@nestjs/common';
import { EcommercePlatform } from '../interfaces/ecommerce-platform.interface';
import { ShopifyIntegrationService } from '../../platforms/shopify/services/shopify-integration.service';

/**
 * Enum of supported eCommerce platforms
 */
export enum PlatformType {
  SHOPIFY = 'shopify',
  WOOCOMMERCE = 'woocommerce',
  MAGENTO = 'magento',
  BIGCOMMERCE = 'bigcommerce',
}

/**
 * Factory for creating eCommerce platform integration services
 *
 * This factory allows the application to dynamically select the appropriate
 * integration service based on the platform type at runtime.
 */
@Injectable()
export class EcommercePlatformFactory {
  constructor(
    private readonly shopifyService: ShopifyIntegrationService,
    // Inject other platform services when implemented
    // private readonly wooCommerceService: WooCommerceIntegrationService,
    // private readonly magentoService: MagentoIntegrationService,
  ) {}

  /**
   * Get the appropriate platform integration service based on platform type
   * @param platform The eCommerce platform type
   * @returns The platform integration service
   * @throws Error if the platform is not supported
   */
  getPlatformService(platform: PlatformType): EcommercePlatform {
    switch (platform) {
      case PlatformType.SHOPIFY:
        return this.shopifyService;

      /* Uncomment as other platforms are implemented
      case PlatformType.WOOCOMMERCE:
        return this.wooCommerceService;

      case PlatformType.MAGENTO:
        return this.magentoService;
      */

      default:
        throw new Error(`Unsupported eCommerce platform: ${platform}`);
    }
  }

  /**
   * Check if a platform type is supported
   * @param platform The platform type to check
   * @returns True if the platform is supported, false otherwise
   */
  isPlatformSupported(platform: string): boolean {
    return Object.values(PlatformType).includes(platform as PlatformType);
  }
}
