import { ConfigService } from '@nestjs/config';
import { ExotelService } from './exotel.service';

/**
 * SS-018 — ExotelService unit tests.
 *
 * Mocks global.fetch to assert the request URL, Basic auth header,
 * form-urlencoded body, and Call SID returned by Exotel.
 */
describe('ExotelService', () => {
  let service: ExotelService;
  let fetchMock: jest.Mock;

  const makeConfig = (env: Record<string, string>): ConfigService =>
    ({ get: jest.fn((key: string) => env[key]) } as unknown as ConfigService);

  beforeEach(() => {
    fetchMock = jest.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = fetchMock;
  });

  // ------------------------------------------------------------------
  // placeIvrCall
  // ------------------------------------------------------------------

  it('placeIvrCall uses Basic auth with accountSid:authToken', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ Call: { Sid: 'CA123' } }),
    });
    service = new ExotelService(
      makeConfig({
        EXOTEL_ACCOUNT_SID: 'AC' + '1'.repeat(32),
        EXOTEL_AUTH_TOKEN: 'secret',
        EXOTEL_CALLER_NUMBER: '+910000000000',
        EXOTEL_EXOPHONE: '08047xxxxxx',
      }),
    );

    const sid = await service.placeIvrCall('+919000000001', {
      orderId: 'O-1',
      customerName: 'Cust',
      webhookUrl: 'https://api.example.com/ndr/voice-webhook',
    });

    expect(sid).toBe('CA123');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      `https://api.exotel.com/v1/Accounts/${'AC' + '1'.repeat(32)}/Calls/connect`,
    );
    expect(init.method).toBe('POST');
    const expectedAuth = Buffer.from(
      `${'AC' + '1'.repeat(32)}:secret`,
    ).toString('base64');
    expect(init.headers.Authorization).toBe(`Basic ${expectedAuth}`);
    expect(init.headers['Content-Type']).toBe(
      'application/x-www-form-urlencoded',
    );
  });

  it('placeIvrCall includes From/To/CallerId/Url/StatusCallback/CustomField in body', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ Call: { Sid: 'CA-x' } }),
    });
    service = new ExotelService(
      makeConfig({
        EXOTEL_ACCOUNT_SID: 'AC' + '1'.repeat(32),
        EXOTEL_AUTH_TOKEN: 't',
        EXOTEL_CALLER_NUMBER: '+91111',
        EXOTEL_EXOPHONE: '08047',
      }),
    );

    await service.placeIvrCall('+91222', {
      orderId: 'O-99',
      customerName: 'Cust',
      webhookUrl: 'https://api.example.com/ndr/voice-webhook',
    });

    const init = fetchMock.mock.calls[0][1];
    const params = new URLSearchParams(init.body);
    expect(params.get('From')).toBe('+91222');
    expect(params.get('To')).toBe('+91111');
    expect(params.get('CallerId')).toBe('08047');
    expect(params.get('Url')).toBe(
      'https://api.example.com/ndr/voice-webhook',
    );
    expect(params.get('StatusCallback')).toBe(
      'https://api.example.com/ndr/voice-webhook/status',
    );
    expect(params.get('CustomField')).toBe('order_id=O-99');
  });

  it('placeIvrCall returns the Call SID', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ Call: { Sid: 'CA-xyz' } }),
    });
    service = new ExotelService(
      makeConfig({
        EXOTEL_ACCOUNT_SID: 'A',
        EXOTEL_AUTH_TOKEN: 'B',
        EXOTEL_CALLER_NUMBER: 'C',
        EXOTEL_EXOPHONE: 'D',
      }),
    );
    const sid = await service.placeIvrCall('+91000', {
      orderId: 'O',
      customerName: 'C',
      webhookUrl: 'https://x',
    });
    expect(sid).toBe('CA-xyz');
  });

  it('placeIvrCall returns "" when Call.Sid is missing', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ Call: {} }),
    });
    service = new ExotelService(
      makeConfig({
        EXOTEL_ACCOUNT_SID: 'A',
        EXOTEL_AUTH_TOKEN: 'B',
        EXOTEL_CALLER_NUMBER: 'C',
        EXOTEL_EXOPHONE: 'D',
      }),
    );
    const sid = await service.placeIvrCall('+91000', {
      orderId: 'O',
      customerName: 'C',
      webhookUrl: 'https://x',
    });
    expect(sid).toBe('');
  });

  it('placeIvrCall throws on non-2xx', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'boom',
    });
    service = new ExotelService(
      makeConfig({
        EXOTEL_ACCOUNT_SID: 'A',
        EXOTEL_AUTH_TOKEN: 'B',
        EXOTEL_CALLER_NUMBER: 'C',
        EXOTEL_EXOPHONE: 'D',
      }),
    );
    await expect(
      service.placeIvrCall('+91000', {
        orderId: 'O',
        customerName: 'C',
        webhookUrl: 'https://x',
      }),
    ).rejects.toThrow(/500/);
  });

  // ------------------------------------------------------------------
  // Skip when no credentials
  // ------------------------------------------------------------------

  it('skips and returns "" when EXOTEL_ACCOUNT_SID is empty', async () => {
    service = new ExotelService(makeConfig({}));
    const sid = await service.placeIvrCall('+91000', {
      orderId: 'O',
      customerName: 'C',
      webhookUrl: 'https://x',
    });
    expect(sid).toBe('');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips and returns "" when EXOTEL_AUTH_TOKEN is empty', async () => {
    service = new ExotelService(makeConfig({ EXOTEL_ACCOUNT_SID: 'A' }));
    const sid = await service.placeIvrCall('+91000', {
      orderId: 'O',
      customerName: 'C',
      webhookUrl: 'https://x',
    });
    expect(sid).toBe('');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
