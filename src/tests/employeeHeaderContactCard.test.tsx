import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EmployeeContactCard } from '@/components/review/EmployeeContactCard';

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

const employee = {
  id: 'e1',
  full_name: 'Tanaaz',
  email: 'tanaaz@example.com',
  designation: 'Executive',
  avatar_url: null,
  department_id: 'd1',
  employee_code: '100811',
  mobile_number: '9876543210',
};

async function open(ui: React.ReactElement) {
  render(ui);
  fireEvent.click(screen.getByRole('button', { name: /Tanaaz/i }));
}

describe('ADR-361 employee header contact card', () => {
  it('shows email and mobile', async () => {
    await open(
      <EmployeeContactCard employee={employee} departmentName="HR">
        <button type="button">Tanaaz</button>
      </EmployeeContactCard>,
    );
    expect(await screen.findByText('tanaaz@example.com')).toBeTruthy();
    expect(screen.getByText('9876543210')).toBeTruthy();
  });

  it('hides the Edit action when no onEdit is supplied (non-admin)', async () => {
    await open(
      <EmployeeContactCard employee={employee}>
        <button type="button">Tanaaz</button>
      </EmployeeContactCard>,
    );
    await screen.findByText('tanaaz@example.com');
    expect(screen.queryByRole('button', { name: /^Edit$/ })).toBeNull();
  });

  it('fires onEdit for admins', async () => {
    const onEdit = vi.fn();
    await open(
      <EmployeeContactCard employee={employee} onEdit={onEdit}>
        <button type="button">Tanaaz</button>
      </EmployeeContactCard>,
    );
    fireEvent.click(await screen.findByRole('button', { name: /^Edit$/ }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('hides View KPIs when no handler is supplied', async () => {
    await open(
      <EmployeeContactCard employee={employee}>
        <button type="button">Tanaaz</button>
      </EmployeeContactCard>,
    );
    await screen.findByText('tanaaz@example.com');
    expect(screen.queryByRole('button', { name: /View KPIs/i })).toBeNull();
  });
});
