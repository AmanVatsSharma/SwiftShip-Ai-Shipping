import { BadRequestException } from '@nestjs/common';
import { WeightBreakService } from './weight-break.service';

describe('WeightBreakService', () => {
  let service: WeightBreakService;

  beforeEach(() => {
    service = new WeightBreakService();
  });

  it('rounds 450g up to the next 500g slab', () => {
    const result = service.roundUpToSlab(450, 500);
    expect(result).toEqual(500);
  });

  it('returns the weight as-is when it is already on a 500g boundary', () => {
    const result = service.roundUpToSlab(500, 500);
    expect(result).toEqual(500);
  });

  it('rounds 501g up to the next 500g slab (i.e. 1000g)', () => {
    const result = service.roundUpToSlab(501, 500);
    const expected = 1000;
    expect(result).toEqual(expected);
  });

  it('rounds 1001g up to 1500g (Delhivery slab)', () => {
    const result = service.roundUpToSlab(1001, 500);
    const expected = 1500;
    expect(result).toEqual(expected);
  });

  it('handles 50g India Post slabs (450g on boundary, 451g rounds up)', () => {
    expect(service.roundUpToSlab(450, 50)).toEqual(450);
    expect(service.roundUpToSlab(451, 50)).toEqual(500);
  });

  it('handles 1kg DHL slabs (999g rounds up, 1000g on boundary, 1001g rounds up)', () => {
    const r1 = service.roundUpToSlab(999, 1000);
    expect(r1).toEqual(1000);
    expect(service.roundUpToSlab(1000, 1000)).toEqual(1000);
    const r3 = service.roundUpToSlab(1001, 1000);
    expect(r3).toEqual(2000);
  });

  it('handles 250g slabs (DHL Express surface)', () => {
    expect(service.roundUpToSlab(1, 250)).toEqual(250);
    expect(service.roundUpToSlab(250, 250)).toEqual(250);
    expect(service.roundUpToSlab(251, 250)).toEqual(500);
  });

  it('throws BadRequestException when slabSizeGrams is zero', () => {
    expect(() => service.roundUpToSlab(450, 0)).toThrow(BadRequestException);
  });

  it('throws BadRequestException when slabSizeGrams is negative', () => {
    expect(() => service.roundUpToSlab(450, -500)).toThrow(BadRequestException);
  });

  it('treats 0g weight as the first slab (defensive default)', () => {
    const result = service.roundUpToSlab(0, 500);
    expect(result).toEqual(500);
  });
});
