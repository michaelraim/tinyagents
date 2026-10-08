import { describe, it, expect } from 'vitest';
import { createDemo } from '../src/demo';
import { applyEvent } from '../shared/protocol';
import { officeClock, clockSettingsSchema } from '../shared/clock';

describe('owner local time',()=>{
  it('uses the office zone and observes daylight-saving changes',()=>{
    expect(officeClock('America/New_York',Date.parse('2026-03-08T06:59:00Z')).time).toBe('01:59');
    expect(officeClock('America/New_York',Date.parse('2026-03-08T07:00:00Z')).time).toBe('03:00');
    const at=Date.parse('2026-10-08T10:00:00Z');
    expect(officeClock('Asia/Jerusalem',at).daylight).toBe(1);expect(officeClock('America/Los_Angeles',at).daylight).toBe(0);
    expect(clockSettingsSchema.safeParse({timeZone:'not/a-zone'}).success).toBe(false);
  });
  it('registers a legacy office once without letting another harness move its clock',()=>{
    const demo=createDemo(),event={...demo.events[0],id:'clock-1',timeZone:'Asia/Tokyo'};
    const registered=applyEvent(demo,event);expect(registered.timeZone).toBe('Asia/Tokyo');
    expect(applyEvent(registered,{...event,id:'clock-2',timeZone:'Europe/London'}).timeZone).toBe('Asia/Tokyo');
  });
});
