<?php
/**
 * SS-027d — TrackingSmokeTest
 *
 * End-to-end-ish smoke test for the generated `TrackingApi::trackByAwb`
 * endpoint. We do NOT hit the live API. Instead:
 *
 *   1. Construct a Guzzle `Client` whose handler stack contains a
 *      `MockHandler` that returns the canned `TrackingResponse` JSON
 *      that the openapi-generator `php` template expects.
 *   2. Pass that Guzzle client (plus a `Configuration`) straight to
 *      `TrackingApi` — the generated constructors take
 *      `(?ClientInterface $client, ?Configuration $config, ...)`.
 *   3. Call `trackByAwb($awb)` and assert the deserialised model has
 *      the expected `awb`, `currentStatus`, and `events[0].status`.
 *
 * This proves the auto-generated `TrackingApi`, the auto-generated
 * `TrackingResponse` / `TrackingEvent` models, and the hand-authored
 * `Swiftship\Sdk\Client` all deserialise a real-shaped tracking
 * payload — the same round-trip they would do against the live
 * `GET /v1/tracking/{awb}` endpoint.
 *
 * Requires `guzzlehttp/guzzle` (required by the SDK) and the
 * generated `OpenAPI\Client\` classes (written into `lib/` by
 * `node scripts/build-sdks.mjs --only=php`).
 */

namespace Swiftship\Sdk\Tests;

use GuzzleHttp\Client as GuzzleClient;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Psr7\Response;
use OpenAPI\Client\Api\TrackingApi;
use OpenAPI\Client\Configuration;
use PHPUnit\Framework\TestCase;
use Swiftship\Sdk\Client;

class TrackingSmokeTest extends TestCase
{
    /**
     * Build a `TrackingApi` whose Guzzle layer is replaced by a
     * `MockHandler` returning the canned JSON body.
     */
    private function buildTrackingApiWithMock(MockHandler $mock): TrackingApi
    {
        $handlerStack = HandlerStack::create($mock);
        $guzzle = new GuzzleClient([
            'handler' => $handlerStack,
            'base_uri' => Client::DEFAULT_BASE_URL,
        ]);

        // Sharing a Configuration with our hand-rolled wrapper is
        // fine — the bearer token is the same in both cases.
        $config = (new Configuration())
            ->setHost(Client::DEFAULT_BASE_URL)
            ->setAccessToken('sk_test_fake');

        return new TrackingApi($guzzle, $config);
    }

    /**
     * Canned `TrackingResponse` payload, matching the OpenAPI schema
     * at `apps/api-public/src/generated/openapi.json` (TrackingResponse
     * with required `awb` + `events[]`, optional `currentStatus`).
     */
    private const CANNED_AWB = 'AWB123456789';

    private function cannedTrackingJson(): string
    {
        return json_encode([
            'awb' => self::CANNED_AWB,
            'currentStatus' => 'IN_TRANSIT',
            'events' => [
                [
                    'status' => 'PICKED_UP',
                    'location' => 'Bengaluru hub',
                    'timestamp' => '2026-06-15T10:30:00Z',
                    'description' => 'Shipment picked up from seller',
                ],
                [
                    'status' => 'IN_TRANSIT',
                    'location' => 'Bengaluru hub',
                    'timestamp' => '2026-06-15T14:00:00Z',
                    'description' => 'Departed origin facility',
                ],
            ],
        ], JSON_THROW_ON_ERROR);
    }

    public function testTrackByAwbReturnsDeserialisedTrackingResponse(): void
    {
        $mock = new MockHandler([
            new Response(200, ['Content-Type' => 'application/json'], $this->cannedTrackingJson()),
        ]);

        $api = $this->buildTrackingApiWithMock($mock);

        $response = $api->trackByAwb(self::CANNED_AWB);

        // Top-level shape.
        $this->assertNotNull($response);
        $this->assertSame(self::CANNED_AWB, $response->getAwb());
        $this->assertSame('IN_TRANSIT', $response->getCurrentStatus());

        // Events: we expect exactly the two events in the canned body.
        $events = $response->getEvents();
        $this->assertNotNull($events);
        $this->assertCount(2, $events);
        $this->assertSame('PICKED_UP', $events[0]->getStatus());
        $this->assertSame('Bengaluru hub', $events[0]->getLocation());
        // `timestamp` is typed date-time in the spec, so the generated
        // model deserialises it into a \DateTime.
        $timestamp = $events[0]->getTimestamp();
        $this->assertInstanceOf(\DateTime::class, $timestamp);
        $this->assertSame('2026-06-15T10:30:00', $timestamp->format('Y-m-d\TH:i:s'));
    }

    public function testTrackingApiGoesThroughHandRolledClientWrapper(): void
    {
        // Same idea, but the TrackingApi comes out of the
        // hand-rolled `Swiftship\Sdk\Client` wrapper instead of
        // being constructed directly. Proves the wrapper's
        // `->tracking()` accessor returns a usable TrackingApi
        // backed by the same shared Configuration.
        $mock = new MockHandler([
            new Response(200, ['Content-Type' => 'application/json'], $this->cannedTrackingJson()),
        ]);

        // We have to swap the Guzzle layer AFTER constructing the
        // wrapper, since the wrapper constructs TrackingApi itself.
        // Reflection is the cleanest way to do that without modifying
        // the public surface of Swiftship\Sdk\Client. The generated
        // Api classes keep the Guzzle client in a protected `$client`
        // property.
        $client = new Client('sk_test_fake');
        $trackingApi = $client->tracking();

        $reflect = new \ReflectionClass($trackingApi);
        $prop = $reflect->getProperty('client');
        $prop->setAccessible(true);

        $handlerStack = HandlerStack::create($mock);
        $guzzle = new GuzzleClient([
            'handler' => $handlerStack,
            'base_uri' => Client::DEFAULT_BASE_URL,
        ]);
        $prop->setValue($trackingApi, $guzzle);

        $response = $trackingApi->trackByAwb(self::CANNED_AWB);

        $this->assertSame(self::CANNED_AWB, $response->getAwb());
        $this->assertSame('IN_TRANSIT', $response->getCurrentStatus());
        $this->assertCount(2, $response->getEvents());
    }
}
