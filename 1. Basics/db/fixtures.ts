/** Fictional seed data shared by db/seed.ts and the tests. Everything here is fake. */
export const DEMO_PASSWORD = 'Passw0rd!demo';
// bcrypt(DEMO_PASSWORD, cost 10) - precomputed so seeding is fast.
export const DEMO_PASSWORD_HASH = '$2a$10$gQzN4lw9k8HJUxlf/Mfb6.jrzEe64JRO7TAGfV0TCM3WFzXerwKUq';

export const TEAMS = {
  alpha: { id: '00000000-0000-4000-8000-0000000000a1', name: 'Alpha Platform' },
  bravo: { id: '00000000-0000-4000-8000-0000000000b1', name: 'Bravo Payments' },
  delta: { id: '00000000-0000-4000-8000-0000000000d1', name: 'Delta Data' },
} as const;

export const USERS = {
  admin: { id: '00000000-0000-4000-8000-00000000f001', email: 'admin@ims.test', name: 'Ada Admin', role: 'admin', teamId: null },
  alice: { id: '00000000-0000-4000-8000-00000000f002', email: 'alice@alpha.test', name: 'Alice Alpha', role: 'responder', teamId: TEAMS.alpha.id },
  victor: { id: '00000000-0000-4000-8000-00000000f003', email: 'victor@alpha.test', name: 'Victor Viewer', role: 'viewer', teamId: TEAMS.alpha.id },
  bob: { id: '00000000-0000-4000-8000-00000000f004', email: 'bob@bravo.test', name: 'Bob Bravo', role: 'responder', teamId: TEAMS.bravo.id },
  nora: { id: '00000000-0000-4000-8000-00000000f005', email: 'nora@unassigned.test', name: 'Nora Newhire', role: 'responder', teamId: null },
  dana: { id: '00000000-0000-4000-8000-00000000f006', email: 'dana@delta.test', name: 'Dana Delta', role: 'responder', teamId: TEAMS.delta.id },
} as const;

export const INCIDENTS = {
  alpha1: { id: '00000000-0000-4000-8000-0000000a0001', teamId: TEAMS.alpha.id, title: 'API latency spike on /search', severity: 'sev2', status: 'open', by: USERS.alice.id },
  alpha2: { id: '00000000-0000-4000-8000-0000000a0002', teamId: TEAMS.alpha.id, title: 'Cache eviction storm', severity: 'sev3', status: 'acknowledged', by: USERS.alice.id },
  alpha3: { id: '00000000-0000-4000-8000-0000000a0003', teamId: TEAMS.alpha.id, title: 'Stale feature flags in staging', severity: 'sev4', status: 'resolved', by: USERS.alice.id },
  bravo1: { id: '00000000-0000-4000-8000-0000000b0001', teamId: TEAMS.bravo.id, title: 'Payment webhook retries failing', severity: 'sev1', status: 'open', by: USERS.bob.id },
  bravo2: { id: '00000000-0000-4000-8000-0000000b0002', teamId: TEAMS.bravo.id, title: 'Ledger reconciliation drift', severity: 'sev3', status: 'mitigated', by: USERS.bob.id },
  delta1: { id: '00000000-0000-4000-8000-0000000d0001', teamId: TEAMS.delta.id, title: 'Nightly ETL job stuck', severity: 'sev3', status: 'open', by: USERS.dana.id },
} as const;

export const NOTES = [
  { incidentId: INCIDENTS.bravo1.id, authorId: USERS.bob.id, body: 'Webhook endpoint for FAKE-CUSTOMER-7731 is returning 502. Do not share outside Bravo.' },
  { incidentId: INCIDENTS.bravo1.id, authorId: USERS.bob.id, body: 'Rotated the (fictional) signing secret; monitoring retries.' },
  { incidentId: INCIDENTS.alpha1.id, authorId: USERS.alice.id, body: 'p95 latency doubled after the 14:05 deploy. Rolling back.' },
] as const;
