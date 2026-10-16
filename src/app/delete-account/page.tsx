'use client';

/**
 * ASCEND Account & Data Deletion Web Portal
 * Compliance: Google Play Store Data Safety | GDPR Article 17 Right to Erasure | CCPA Compliant
 * Policy: 0 days retention.
 * When requested, athlete accounts and cloud data are Permanently purged immediately.
 */

import { DeleteAccountView } from '@/components/DeleteAccountView';

export default function DeleteAccountPage() {
  return <DeleteAccountView />;
}
