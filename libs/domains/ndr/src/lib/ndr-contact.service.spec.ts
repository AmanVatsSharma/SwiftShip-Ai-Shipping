// platform-typeorm is replaced at runtime by test/stubs/platform-typeorm-stub.ts
// (the real barrel transitively pulls datasource.ts and crashes jest).
import { BadRequestException } from '@nestjs/common';
import { NdrCaseStatus, ShipmentStatus } from '@swiftship/platform-typeorm';
import { NdrContactService } from './ndr-contact.service';
import { NdrService } from './ndr.service';
import { NdrStateMachine } from './ndr-state-machine.service';
import { WatiService } from '@swiftship/domains-notifications';
import { ExotelService } from '@swiftship/domains-notifications';

/**
 * SS-018 — NdrContactService unit tests.
 *
 * Exercises the contact-orchestration logic: WA-first → call-fallback
 * → both-fail, plus the customer-reply → state-machine transitions.
 */
describe('NdrContactService', () => {
  let service: NdrContactService;
  let ndrService: {
    getNdr: jest.Mock;
    transitionNdr: jest.Mock;
    initiateRto: jest.Mock;
  };
  let wati: { sendNdrAttemptFailed: jest.Mock };
  let exotel: { placeIvrCall: jest.Mock };

  const TENANT_ID = 7;

  const makeShipment = (overrides: Partial<any> = {}): any => ({
    id: 101,
    trackingNumber: 'AWB-101',
    status: ShipmentStatus.IN_TRANSIT,
    ...overrides,
  });

  const makeNdr = (overrides: Partial<any> = {}): any => ({
    id: 1,
    shipmentId: 101,
    tenantId: TENANT_ID,
    status: NdrCaseStatus.PENDING,
    awbNumber: 'AWB-101',
    customerPhone: '+91-90000-00001',
    customerName: 'Cust',
    attemptCount: 0,
    metadata: {},
    ...overrides,
  });

  beforeEach(() => {
    ndrService = {
      getNdr: jest.fn(),
      transitionNdr: jest.fn(async (id, to) =>
        makeNdr({ id, status: to }),
      ),
      initiateRto: jest.fn(async (id) =>
        makeNdr({ id, status: NdrCaseStatus.RTO_INITIATED }),
      ),
    };
    wati = { sendNdrAttemptFailed: jest.fn() };
    exotel = { placeIvrCall: jest.fn() };
    service = new NdrContactService(
      ndrService as unknown as NdrService,
      wati as unknown as WatiService,
      exotel as unknown as ExotelService,
    );
  });

  // ----------------------------------------------------------------
  // contactCustomer
  // ----------------------------------------------------------------

  it('contactCustomer tries WhatsApp first; on success transitions to WHATSAPP_SENT', async () => {
    ndrService.getNdr.mockResolvedValue(makeNdr());
    wati.sendNdrAttemptFailed.mockResolvedValue('wamid.WA-OK');

    const r = await service.contactCustomer(
      1,
      makeShipment(),
      'Cust',
      'O-1',
    );

    expect(wati.sendNdrAttemptFailed).toHaveBeenCalledWith('+91-90000-00001', {
      orderId: 'O-1',
      awbNumber: 'AWB-101',
      attemptCount: 0,
      customerName: 'Cust',
    });
    expect(exotel.placeIvrCall).not.toHaveBeenCalled();
    expect(ndrService.transitionNdr).toHaveBeenCalledWith(
      1,
      NdrCaseStatus.WHATSAPP_SENT,
      expect.stringContaining('wamid.WA-OK'),
    );
    expect(r).toEqual({ channel: 'whatsapp', messageId: 'wamid.WA-OK' });
  });

  it('contactCustomer falls back to call on WhatsApp failure; transitions to CALL_ATTEMPTED', async () => {
    ndrService.getNdr.mockResolvedValue(makeNdr());
    wati.sendNdrAttemptFailed.mockRejectedValue(new Error('WA down'));
    exotel.placeIvrCall.mockResolvedValue('CA-OK');

    const r = await service.contactCustomer(
      1,
      makeShipment(),
      'Cust',
      'O-1',
    );

    expect(wati.sendNdrAttemptFailed).toHaveBeenCalled();
    expect(exotel.placeIvrCall).toHaveBeenCalledWith('+91-90000-00001', {
      orderId: 'O-1',
      customerName: 'Cust',
      webhookUrl: expect.any(String),
    });
    expect(ndrService.transitionNdr).toHaveBeenCalledWith(
      1,
      NdrCaseStatus.CALL_ATTEMPTED,
      expect.stringContaining('CA-OK'),
    );
    expect(r).toEqual({ channel: 'call', messageId: 'CA-OK' });
  });

  it('contactCustomer returns "none" if both fail', async () => {
    ndrService.getNdr.mockResolvedValue(makeNdr());
    wati.sendNdrAttemptFailed.mockRejectedValue(new Error('WA down'));
    exotel.placeIvrCall.mockRejectedValue(new Error('Exo down'));

    const r = await service.contactCustomer(
      1,
      makeShipment(),
      'Cust',
      'O-1',
    );

    expect(r).toEqual({ channel: 'none' });
    // No state transition occurred (both attempts failed before any
    // could record success).
    expect(ndrService.transitionNdr).not.toHaveBeenCalled();
  });

  it('contactCustomer returns "none" if no phone number on NDR or shipment', async () => {
    ndrService.getNdr.mockResolvedValue(
      makeNdr({ customerPhone: null }),
    );
    const r = await service.contactCustomer(1, null, 'Cust', 'O-1');
    expect(r).toEqual({ channel: 'none' });
    expect(wati.sendNdrAttemptFailed).not.toHaveBeenCalled();
    expect(exotel.placeIvrCall).not.toHaveBeenCalled();
  });

  // ----------------------------------------------------------------
  // handleCustomerReply
  // ----------------------------------------------------------------

  it('handleCustomerReply with intent=reschedule transitions to RESCHEDULED', async () => {
    await service.handleCustomerReply(1, 'reschedule', { foo: 'bar' });
    expect(ndrService.transitionNdr).toHaveBeenCalledWith(
      1,
      NdrCaseStatus.RESCHEDULED,
      'customer requested reschedule',
      { foo: 'bar' },
    );
    expect(ndrService.initiateRto).not.toHaveBeenCalled();
  });

  it('handleCustomerReply with intent=cancel initiates RTO', async () => {
    await service.handleCustomerReply(1, 'cancel');
    expect(ndrService.initiateRto).toHaveBeenCalledWith(1);
    expect(ndrService.transitionNdr).not.toHaveBeenCalled();
  });

  it('handleCustomerReply with intent=new_address transitions to RESCHEDULED', async () => {
    await service.handleCustomerReply(1, 'new_address', { addr: 'X' });
    expect(ndrService.transitionNdr).toHaveBeenCalledWith(
      1,
      NdrCaseStatus.RESCHEDULED,
      'customer provided new address',
      { addr: 'X' },
    );
    expect(ndrService.initiateRto).not.toHaveBeenCalled();
  });

  it('handleCustomerReply with unknown intent throws BadRequest', async () => {
    await expect(
      service.handleCustomerReply(1, 'unknown' as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
