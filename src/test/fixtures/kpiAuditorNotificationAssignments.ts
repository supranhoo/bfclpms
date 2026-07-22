export const kpiAuditorNotificationFixture = {
  kpiId: '11111111-1111-4111-8111-111111111111',
  employeeId: '22222222-2222-4222-8222-222222222222',
  kpiAssignedAuditorId: '33333333-3333-4333-8333-333333333333',
  employeeAssignedAuditorId: '44444444-4444-4444-8444-444444444444',
  unrelatedAuditorId: '55555555-5555-4555-8555-555555555555',
} as const;

export function resolveAssignedAuditors(input: {
  kpiLevel: Array<{ kpiId: string; auditorId: string }>;
  employeeLevel: Array<{ employeeId: string; auditorId: string }>;
  activeLoginIds: ReadonlySet<string>;
}) {
  const recipients = new Set<string>();
  for (const row of input.kpiLevel) {
    if (row.kpiId === kpiAuditorNotificationFixture.kpiId && input.activeLoginIds.has(row.auditorId)) {
      recipients.add(row.auditorId);
    }
  }
  for (const row of input.employeeLevel) {
    if (row.employeeId === kpiAuditorNotificationFixture.employeeId && input.activeLoginIds.has(row.auditorId)) {
      recipients.add(row.auditorId);
    }
  }
  return [...recipients].sort();
}