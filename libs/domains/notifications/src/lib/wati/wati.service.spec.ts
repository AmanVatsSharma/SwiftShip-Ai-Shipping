import { ConfigService } from '@nestjs/config';
import { WatiService } from './wati.service';

/**
 * SS-018 — WatiService unit tests.
 *
 * Mocks global.fetch so we can assert the request URL, auth header,
 * body shape, and the message ID returned by the WATI API.
 */
describe('WatiService', () => {
  let service: WatiService;
  let fetchMock: jest.Mock;

  const makeConfig = (env: Record<string, string>): ConfigService =>
    ({ get: jest.fn((key: string) => env[key]) } as unknown as ConfigService);

  beforeEach(() => {
    fetchMock = jest.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = fetchMock;
  });

  // ------------------------------------------------------------------
  // sendTemplate
  // ------------------------------------------------------------------

  it('sendTemplate calls WATI API with correct URL, auth and body', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'wamid.ABC123' }),
    });
    service = new WatiService(
      makeConfig({
        WATI_API_URL: 'https://app.wati.io/api/v1',
        WATI_API_KEY: 'test-key',
      }),
    );

    const id = await service.sendTemplate(
      '+919000000001',
      'ndr_attempt_failed',
      { order_id: '42', customer_name: 'Cust' },
    );

    expect(id).toBe('wamid.ABC123');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://app.wati.io/api/v1/sendTemplateMessage?whatsappNumber=%2B919000000001',
    );
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer test-key');
    expect(init.headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(init.body);
    expect(body.template_name).toBe('ndr_attempt_failed');
    expect(body.parameters).toEqual([
      { name: 'order_id', value: '42' },
      { name: 'customer_name', value: 'Cust' },
    ]);
  });

  it('sendTemplate returns the message ID (uses "id" field)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'msg-id-1' }),
    });
    service = new WatiService(
      makeConfig({ WATI_API_KEY: 'k' }),
    );
    const id = await service.sendTemplate('+91000', 't', {});
    expect(id).toBe('msg-id-1');
  });

  it('sendTemplate falls back to "messageId" when "id" is absent', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ messageId: 'msg-id-2' }),
    });
    service = new WatiService(
      makeConfig({ WATI_API_KEY: 'k' }),
    );
    const id = await service.sendTemplate('+91000', 't', {});
    expect(id).toBe('msg-id-2');
  });

  it('sendTemplate returns "" when both id and messageId are missing', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    service = new WatiService(
      makeConfig({ WATI_API_KEY: 'k' }),
    );
    const id = await service.sendTemplate('+91000', 't', {});
    expect(id).toBe('');
  });

  it('sendTemplate throws on non-2xx', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'unauthorized',
    });
    service = new WatiService(
      makeConfig({ WATI_API_KEY: 'k' }),
    );
    await expect(service.sendTemplate('+91000', 't', {})).rejects.toThrow(
      /401/,
    );
  });

  // ------------------------------------------------------------------
  // Skip when no API key
  // ------------------------------------------------------------------

  it('sendTemplate skips and returns "" when WATI_API_KEY is empty', async () => {
    service = new WatiService(makeConfig({ WATI_API_KEY: '' }));
    const id = await service.sendTemplate('+91000', 'ndr_attempt_failed', {});
    expect(id).toBe('');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sendTemplate skips and returns "" when WATI_API_KEY is unset', async () => {
    service = new WatiService(makeConfig({}));
    const id = await service.sendTemplate('+91000', 't', {});
    expect(id).toBe('');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // ------------------------------------------------------------------
  // NDR-specific templates
  // ------------------------------------------------------------------

  it('sendNdrAttemptFailed uses the ndr_attempt_failed template with all params', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'x' }),
    });
    service = new WatiService(
      makeConfig({ WATI_API_KEY: 'k' }),
    );
    const id = await service.sendNdrAttemptFailed('+91', {
      orderId: 'O-1',
      awbNumber: 'A-1',
      attemptCount: 2,
      customerName: 'Cust',
    });
    expect(id).toBe('x');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.template_name).toBe('ndr_attempt_failed');
    const params: Record<string, string> = Object.fromEntries(
      body.parameters.map((p: { name: string; value: string }) => [
        p.name,
        p.value,
      ]),
    );
    expect(params.customer_name).toBe('Cust');
    expect(params.order_id).toBe('O-1');
    expect(params.awb_number).toBe('A-1');
    expect(params.attempt_count).toBe('2');
  });

  it('sendNdrRescheduleConfirm uses the ndr_reschedule_confirm template', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'y' }),
    });
    service = new WatiService(
      makeConfig({ WATI_API_KEY: 'k' }),
    );
    await service.sendNdrRescheduleConfirm('+91', {
      orderId: 'O-1',
      rescheduleDate: '2026-06-20',
      customerName: 'Cust',
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.template_name).toBe('ndr_reschedule_confirm');
    const params: Record<string, string> = Object.fromEntries(
      body.parameters.map((p: { name: string; value: string }) => [
        p.name,
        p.value,
      ]),
    );
    expect(params.reschedule_date).toBe('2026-06-20');
  });
});
