'use client';

/**
 * ASCEND Account & Data Deletion Web Portal
 * Compliance: Google Play Store Data Safety | GDPR Article 17 Right to Erasure | CCPA Compliant
 * Policy: when requested, athlete accounts and cloud data are erased from
 * ASCEND's systems immediately; third-party AI provider logs may persist
 * for up to 30 days under the providers' own policies.
 */

import { DeleteAccountView } from '@/components/DeleteAccountView';
import LegalLangSync from '@/components/LegalLangSync';

export default function DeleteAccountPage() {
  return (
    <>
      <LegalLangSync />
      <DeleteAccountView />
    </>
  );
}
