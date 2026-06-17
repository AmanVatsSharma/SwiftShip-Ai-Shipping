<?php
/**
 * SS-027d — Swiftship\Sdk\Client
 *
 * Thin, hand-authored wrapper around the auto-generated
 * `OpenAPI\Client\Api\*` classes produced by the OpenAPI Generator
 * `php` template. The generator emits one class per tsoa controller
 * (OrdersApi, ShipmentsApi, TrackingApi, RateShopApi, WebhooksApi,
 * CarriersApi, ShippingRatesApi, ReturnsApi). We instantiate them all
 * here with a shared `OpenAPI\Client\Configuration` so callers get a
 * single entry point and a single place to set the API key + base URL.
 *
 * The auto-generated classes live under the `OpenAPI\Client\` PSR-4
 * prefix (mapped to `lib/` in composer.json). The generator writes
 * them when `npx @openapitools/openapi-generator-cli generate -g php`
 * is run by `scripts/build-sdks.mjs --only=php`.
 *
 * Design notes:
 *   - Namespace is `Swiftship\Sdk\` (NOT `SwiftShip\Sdk\`) to match
 *     the canonical composer package name `swiftship/sdk-php` (case
 *     is significant in PHP namespace identifiers).
 *   - The constructor signature is `(string $apiKey, string $baseUrl = self::DEFAULT_BASE_URL)`
 *     so the SS-027d acceptance command
 *     `php -r 'new Swiftship\Sdk\Client("test")'` works (baseUrl
 *     defaults to the live production endpoint).
 *   - The Configuration object is the SDK's own `Configuration` so the
 *     same bearer token + base URL are applied to every generated
 *     `Api\*` class — callers never have to set them per call.
 *   - This wrapper is the only file in `src/` we hand-author. The
 *     generator writes everything else (into `lib/`).
 */

namespace Swiftship\Sdk;

use OpenAPI\Client\Configuration;
use OpenAPI\Client\Api\OrdersApi;
use OpenAPI\Client\Api\ShipmentsApi;
use OpenAPI\Client\Api\TrackingApi;
use OpenAPI\Client\Api\RateShopApi;
use OpenAPI\Client\Api\WebhooksApi;
use OpenAPI\Client\Api\CarriersApi;
use OpenAPI\Client\Api\ShippingRatesApi;
use OpenAPI\Client\Api\ReturnsApi;

class Client
{
    /**
     * Default base URL for the SwiftShip public REST API.
     * Override per-client via the second constructor argument.
     */
    public const DEFAULT_BASE_URL = 'https://api.swiftship.ai/v1';

    /**
     * Shared configuration. Every `OpenAPI\Client\Api\*` instance
     * reads its `host` and `accessToken` from here.
     *
     * @var Configuration
     */
    private Configuration $config;

    /**
     * Cached API instances so repeated access does not rebuild them.
     *
     * @var array<string, object>
     */
    private array $apiCache = [];

    public function __construct(
        private string $apiKey,
        private string $baseUrl = self::DEFAULT_BASE_URL,
    ) {
        $this->config = Configuration::getDefaultConfiguration()
            ->setHost(rtrim($this->baseUrl, '/'))
            ->setAccessToken($this->apiKey);
    }

    public function getApiKey(): string
    {
        return $this->apiKey;
    }

    public function getBaseUrl(): string
    {
        return $this->baseUrl;
    }

    public function getConfiguration(): Configuration
    {
        return $this->config;
    }

    /**
     * Lazy-instantiate a generated API class. The generator produces
     * one class per tsoa controller; the canonical names are
     * `OpenAPI\Client\Api\{ControllerName}Api`.
     *
     * @template T of object
     * @param class-string<T> $fqcn
     * @return T
     */
    private function api(string $fqcn): object
    {
        if (!isset($this->apiCache[$fqcn])) {
            $this->apiCache[$fqcn] = new $fqcn(
                $this->config,
            );
        }
        return $this->apiCache[$fqcn];
    }

    public function orders(): OrdersApi
    {
        /** @var OrdersApi */
        return $this->api(OrdersApi::class);
    }

    public function shipments(): ShipmentsApi
    {
        /** @var ShipmentsApi */
        return $this->api(ShipmentsApi::class);
    }

    public function tracking(): TrackingApi
    {
        /** @var TrackingApi */
        return $this->api(TrackingApi::class);
    }

    public function rateShop(): RateShopApi
    {
        /** @var RateShopApi */
        return $this->api(RateShopApi::class);
    }

    public function webhooks(): WebhooksApi
    {
        /** @var WebhooksApi */
        return $this->api(WebhooksApi::class);
    }

    public function carriers(): CarriersApi
    {
        /** @var CarriersApi */
        return $this->api(CarriersApi::class);
    }

    public function shippingRates(): ShippingRatesApi
    {
        /** @var ShippingRatesApi */
        return $this->api(ShippingRatesApi::class);
    }

    public function returns(): ReturnsApi
    {
        /** @var ReturnsApi */
        return $this->api(ReturnsApi::class);
    }
}
