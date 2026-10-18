'use client';

import React, { useEffect } from 'react';
import SettingsView from '@/components/SettingsView';
import { useAppNavigation } from '@/lib/navigation';

/**
 * SettingsModal wraps SettingsView for modal presentation.
 * Play Store & In-App Compliance requirements surfaced:
 * - Account & Privacy settings section
 * - Export my data (JSON backup)
 * - Notification preferences
 * - Delete my account danger action with typed "DELETE" confirmation
 */
interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { registerBackHandler } = useAppNavigation();

  useEffect(() => {
    if (!isOpen) return;
    return registerBackHandler(() => {
      onClose();
      return true;
    }, 40);
  }, [isOpen, onClose, registerBackHandler]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-bg-primary">
      <SettingsView onBack={onClose} isModal />
    </div>
  );
}
