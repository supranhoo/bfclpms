import { supabase } from '@/integrations/supabase/client';

export interface KraNotificationItem {
  kra_name: string;
  kpi_name: string;
  target_value: number | string | null;
  weightage: number | null;
  uom: string | null;
}

/**
 * Send consolidated KRA assignment notifications (in-app + email)
 * to the employee and their reporting manager.
 * 
 * Fires ONE notification per recipient regardless of how many KRAs were assigned.
 */
export async function sendKraAssignmentNotifications(
  employeeId: string,
  kras: KraNotificationItem[],
  reviewPeriod: string,
  reviewYear: number
): Promise<void> {
  if (kras.length === 0) return;

  try {
    // Fetch employee profile + reporting manager
    const { data: employee } = await supabase
      .from('profiles')
      .select('id, full_name, email, reporting_manager_id')
      .eq('id', employeeId)
      .single();

    if (!employee) return;

    const employeeName = employee.full_name || 'Employee';
    const kraCount = kras.length;
    const totalWeightage = kras.reduce((sum, k) => sum + (k.weightage || 0), 0);

    // Build in-app notification message
    const notifMessage = `${kraCount} KRA(s) have been assigned to you for ${reviewPeriod} ${reviewYear}. Total weightage: ${totalWeightage}%.`;
    const managerMessage = `${kraCount} KRA(s) have been assigned to ${employeeName} for ${reviewPeriod} ${reviewYear}. Total weightage: ${totalWeightage}%.`;

    // Build KRA list for email
    const kraList = kras.map(k => ({
      kra_name: k.kra_name,
      kpi_name: k.kpi_name,
      target_value: k.target_value != null ? String(k.target_value) : '-',
      weightage: k.weightage != null ? `${k.weightage}%` : '-',
      uom: k.uom || '-',
    }));

    // Insert in-app notification for employee
    const notifications: Array<{
      user_id: string;
      title: string;
      message: string;
      type: string;
    }> = [
      {
        user_id: employeeId,
        title: '📋 New KRA Assignment',
        message: notifMessage,
        type: 'kra_batch_assigned',
      },
    ];

    // Send email to employee (fire-and-forget)
    const emailPromises: Promise<any>[] = [];
    if (employee.email) {
      emailPromises.push(
        supabase.functions.invoke('send-email-notification', {
          body: {
            event_type: 'kra_batch_assigned',
            recipient_email: employee.email,
            recipient_name: employeeName,
            employee_name: employeeName,
            review_period: reviewPeriod,
            review_year: reviewYear,
            kra_count: kraCount,
            kra_list: kraList,
            total_weightage: `${totalWeightage}%`,
          },
        })
      );
    }

    // Fetch manager if exists
    if (employee.reporting_manager_id) {
      const { data: manager } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('id', employee.reporting_manager_id)
        .single();

      if (manager) {
        notifications.push({
          user_id: manager.id,
          title: '📋 KRA Assignment Notification',
          message: managerMessage,
          type: 'kra_batch_assigned',
        });

        if (manager.email) {
          emailPromises.push(
            supabase.functions.invoke('send-email-notification', {
              body: {
                event_type: 'kra_batch_assigned',
                recipient_email: manager.email,
                recipient_name: manager.full_name || 'Manager',
                employee_name: employeeName,
                review_period: reviewPeriod,
                review_year: reviewYear,
                kra_count: kraCount,
                kra_list: kraList,
                total_weightage: `${totalWeightage}%`,
              },
            })
          );
        }
      }
    }

    // Insert all in-app notifications
    await supabase.from('notifications').insert(notifications);

    // Send emails (fire-and-forget, don't block the UI)
    Promise.allSettled(emailPromises).catch(err => {
      console.error('KRA assignment email error:', err);
    });
  } catch (error) {
    console.error('Failed to send KRA assignment notifications:', error);
    // Don't throw — notification failure shouldn't block the assignment flow
  }
}
