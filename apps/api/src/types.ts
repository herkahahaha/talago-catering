import type { Database, GuestSessionContext, StaffSessionContext } from '@catering/core';

export interface AppEnv {
  Variables: {
    requestId: string;
    db: Database;
    guestSession?: GuestSessionContext;
    staffSession?: StaffSessionContext;
  };
}
