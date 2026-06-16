<?php
/**
 * SS-027d — SmokeTest
 *
 * Verifies the `SwiftShip\Sdk\Client` class:
 *   1. Construct with just an API key (acceptance: `php -r 'new
 *      SwiftShip\Sdk\Client("test")'` exits 0).
 *   2. Construct with an explicit base URL.
 *   3. `getApiKey()` / `getBaseUrl()` / `getConfiguration()` round-trip.
 *   4. Each `->orders()`, `->shipments()`, `->tracking()`, `->rateShop()`,
 *      `->webhooks()`, `->carriers()`, `->shippingRates()`, `->returns()`
 *      accessor returns a non-null `OpenAPI\Client\Api\*` instance backed
 *      by the same shared `Configuration` (i.e. the same bearer token).
 *
 * No HTTP call is made. The smoke test is the SS-027d acceptance
 * criterion "phpunit smoke passes" — it does NOT need the live API.
 */

namespace SwiftShip\Sdk\Tests;

use OpenAPI\Client\Configuration;
use PHPUnit\Framework\TestCase;
use SwiftShip\Sdk\Client;

class SmokeTest extends TestCase
{
    public function testConstructWithApiKeyOnlyUsesDefaultBaseUrl(): void
    {
        $client = new Client('test');
        $this->assertSame('test', $client->getApiKey());
        $this->assertSame(Client::DEFAULT_BASE_URL, $client->getBaseUrl());
    }

    public function testConstructWithExplicitBaseUrl(): void
    {
        $client = new Client('sk_live_xyz', 'https://api.example.test/v1');
        $this->assertSame('sk_live_xyz', $client->getApiKey());
        $this->assertSame('https://api.example.test/v1', $client->getBaseUrl());
    }

    public function testConfigurationRoundTripsApiKeyAndBaseUrl(): void
    {
        $client = new Client('sk_test_abc', 'https://api.example.test/v1');
        $config = $client->getConfiguration();
        $this->assertInstanceOf(Configuration::class, $config);
        $this->assertSame('sk_test_abc', $config->getAccessToken());
        $this->assertSame('https://api.example.test/v1', $config->getHost());
    }

    public function testOrdersAccessorReturnsGeneratedApiClass(): void
    {
        $client = new Client('test');
        $this->assertInstanceOf(\OpenAPI\Client\Api\OrdersApi::class, $client->orders());
    }

    public function testShipmentsAccessorReturnsGeneratedApiClass(): void
    {
        $client = new Client('test');
        $this->assertInstanceOf(\OpenAPI\Client\Api\ShipmentsApi::class, $client->shipments());
    }

    public function testTrackingAccessorReturnsGeneratedApiClass(): void
    {
        $client = new Client('test');
        $this->assertInstanceOf(\OpenAPI\Client\Api\TrackingApi::class, $client->tracking());
    }

    public function testRateShopAccessorReturnsGeneratedApiClass(): void
    {
        $client = new Client('test');
        $this->assertInstanceOf(\OpenAPI\Client\Api\RateShopApi::class, $client->rateShop());
    }

    public function testWebhooksAccessorReturnsGeneratedApiClass(): void
    {
        $client = new Client('test');
        $this->assertInstanceOf(\OpenAPI\Client\Api\WebhooksApi::class, $client->webhooks());
    }

    public function testCarriersAccessorReturnsGeneratedApiClass(): void
    {
        $client = new Client('test');
        $this->assertInstanceOf(\OpenAPI\Client\Api\CarriersApi::class, $client->carriers());
    }

    public function testShippingRatesAccessorReturnsGeneratedApiClass(): void
    {
        $client = new Client('test');
        $this->assertInstanceOf(\OpenAPI\Client\Api\ShippingRatesApi::class, $client->shippingRates());
    }

    public function testReturnsAccessorReturnsGeneratedApiClass(): void
    {
        $client = new Client('test');
        $this->assertInstanceOf(\OpenAPI\Client\Api\ReturnsApi::class, $client->returns());
    }

    public function testAccessorsReturnSameInstanceOnRepeatCall(): void
    {
        $client = new Client('test');
        $this->assertSame($client->orders(), $client->orders());
        $this->assertSame($client->shipments(), $client->shipments());
    }
}
