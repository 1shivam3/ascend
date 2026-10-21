'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  MessageSquare,
  Bug,
  Lightbulb,
  Star,
  Send,
  CheckCircle2,
  Sparkles,
  Smartphone,
  ShieldCheck,
  Loader2,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { useToast } from '@/components/ui/Toast';
import { useAppNavigation } from '@/lib/navigation';
import { useTranslation } from '@/lib/i18n';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCategory?: 'bug' | 'feature' | 'review';
}

type FeedbackCategory = 'bug' | 'feature' | 'review';

export default function FeedbackModal({
  isOpen,
  onClose,
  initialCategory = 'review',
}: FeedbackModalProps) {
  const profile = useStore((state) => state.profile);
  const { t } = useTranslation();
  const toast = useToast();
  const { registerBackHandler } = useAppNavigation();

  const [category, setCategory] = useState<FeedbackCategory>(initialCategory);
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedRefId, setSubmittedRefId] = useState<string | null>(null);

  // Sync category if prop changes
  useEffect(() => {
    if (initialCategory) setCategory(initialCategory);
  }, [initialCategory]);

  // Back button registration
  useEffect(() => {
    if (!isOpen) return;
    return registerBackHandler(() => {
      onClose();
      return true;
    }, 120);
  }, [isOpen, registerBackHandler, onClose]);

  if (!isOpen) return null;

  const getSystemDiagnostics = () => {
    if (typeof window === 'undefined') return {};
    const ua = navigator.userAgent || '';
    let os = 'Unknown OS';
    if (/android/i.test(ua)) os = 'Android';
    else if (/iPad|iPhone|iPod/.test(ua)) os = 'iOS';
    else if (/windows/i.test(ua)) os = 'Windows';
    else if (/macintosh|mac os x/i.test(ua)) os = 'macOS';
    else if (/linux/i.test(ua)) os = 'Linux';

    let browser = 'Unknown Browser';
    if (/chrome|crios/i.test(ua) && !/edge|edg/i.test(ua)) browser = 'Chrome';
    else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari';
    else if (/firefox|fxios/i.test(ua)) browser = 'Firefox';
    else if (/edg/i.test(ua)) browser = 'Edge';

    return {
      os,
      browser,
      screen: `${window.innerWidth}x${window.innerHeight} (${window.screen.width}x${window.screen.height})`,
      deviceType: /mobile|tablet|android|iphone/i.test(ua) ? 'Mobile Device' : 'Desktop / Laptop',
      appVersion: '2.0.0 (AOS)',
      url: window.location.pathname,
      timestamp: new Date().toISOString(),
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      toast.error(t('fb.missingMsg'), t('fb.missingTitle'));
      return;
    }

    setIsSubmitting(true);
    try {
      const diagnostics = includeDiagnostics ? getSystemDiagnostics() : undefined;

      const payload = {
        category,
        rating: category === 'review' || rating > 0 ? rating : undefined,
        title: title.trim() || undefined,
        message: message.trim(),
        userEmail: contactEmail.trim() || undefined,
        userName: profile?.name || t('fb.athlete'),
        diagnostics,
      };

      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSubmittedRefId(data.referenceId || `fb_${Date.now()}`);
        toast.success(
          category === 'bug'
            ? t('fb.bugSent')
            : category === 'feature'
            ? t('fb.featureSent')
            : t('fb.reviewSent'),
          t('fb.receivedTitle')
        );
      } else {
        toast.error(data.message || t('fb.submitFailMsg'), t('fb.submitFailTitle'));
      }
    } catch {
      toast.error(t('fb.networkMsg'), t('fb.networkTitle'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetAndClose = () => {
    setSubmittedRefId(null);
    setTitle('');
    setMessage('');
    setContactEmail('');
    onClose();
  };

  const categoryPlaceholders = {
    bug: t('fb.phBug'),
    feature: t('fb.phFeature'),
    review: t('fb.phReview'),
  };

  return (
    <div className="modal-overlay" onClick={handleResetAndClose}>
      <div
        className="modal-content max-w-md w-full p-0 overflow-hidden bg-bg-card border border-border shadow-2xl rounded-2xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-border/70 flex items-center justify-between bg-bg-elevated/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-accent/15 border border-accent/30 text-accent flex items-center justify-center shrink-0">
              <MessageSquare className="w-4 h-4 stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-text-primary tracking-tight">
                {t('fb.title')}
              </h2>
              <p className="text-2xs text-text-muted">
                {t('fb.subtitle')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleResetAndClose}
            className="w-10 h-10 min-h-[44px] min-w-[44px] rounded-lg flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors cursor-pointer"
            aria-label={t('fb.closeAria')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Success Screen */}
        {submittedRefId ? (
          <div className="p-6 text-center space-y-4">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center animate-bounce-subtle">
              <CheckCircle2 className="w-7 h-7 stroke-[2.5]" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-text-primary">
                {t('fb.thankYou', { name: profile?.name || t('fb.athlete') })}
              </h3>
              <p className="text-xs text-text-secondary max-w-xs mx-auto leading-relaxed">
                {t('fb.delivered')}
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-bg-elevated border border-border text-2xs font-mono text-text-muted">
              {t('fb.reference')} <span className="text-accent">{submittedRefId}</span>
            </div>
            <button
              type="button"
              onClick={handleResetAndClose}
              className="btn-primary w-full py-2.5 text-xs font-bold"
            >
              {t('common.done')}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4 max-h-[80vh] overflow-y-auto">
            {/* Category Selector */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-text-muted">
                {t('fb.sharing')}
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setCategory('review')}
                  className={`p-2.5 rounded-xl border text-center transition-all ${
                    category === 'review'
                      ? 'bg-accent/15 border-accent text-accent font-bold shadow-sm'
                      : 'bg-bg-elevated/50 border-border text-text-secondary hover:text-text-primary'
                  }`}
                >
                  <Star className="w-4 h-4 mx-auto mb-1 stroke-[2]" />
                  <span className="text-xs block">{t('fb.review')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCategory('bug')}
                  className={`p-2.5 rounded-xl border text-center transition-all ${
                    category === 'bug'
                      ? 'bg-red-500/15 border-red-500 text-red-400 font-bold shadow-sm'
                      : 'bg-bg-elevated/50 border-border text-text-secondary hover:text-text-primary'
                  }`}
                >
                  <Bug className="w-4 h-4 mx-auto mb-1 stroke-[2]" />
                  <span className="text-xs block">{t('fb.bug')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCategory('feature')}
                  className={`p-2.5 rounded-xl border text-center transition-all ${
                    category === 'feature'
                      ? 'bg-amber-500/15 border-amber-500 text-amber-400 font-bold shadow-sm'
                      : 'bg-bg-elevated/50 border-border text-text-secondary hover:text-text-primary'
                  }`}
                >
                  <Lightbulb className="w-4 h-4 mx-auto mb-1 stroke-[2]" />
                  <span className="text-xs block">{t('fb.feature')}</span>
                </button>
              </div>
            </div>

            {/* Star Rating (Show for Review or optional for others) */}
            <div className="p-3 rounded-xl bg-bg-elevated/40 border border-border flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-text-primary block">
                  {category === 'review' ? t('fb.yourRating') : t('fb.expRating')}
                </span>
                <span className="text-2xs text-text-muted">
                  {rating === 5
                    ? t('fb.stars5')
                    : rating === 4
                    ? t('fb.stars4')
                    : rating === 3
                    ? t('fb.stars3')
                    : rating === 2
                    ? t('fb.stars2')
                    : t('fb.stars1')}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    className="p-1 hover:scale-110 active:scale-95 transition-transform"
                  >
                    <Star
                      className={`w-5 h-5 transition-colors ${
                        (hoverRating || rating) >= star
                          ? 'text-accent fill-accent'
                          : 'text-text-muted stroke-[1.5]'
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Title / Summary */}
            <div className="space-y-1">
              <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-text-muted">
                {t('fb.titleLabel')}
              </label>
              <input
                type="text"
                placeholder={
                  category === 'bug'
                    ? t('fb.titleBug')
                    : category === 'feature'
                    ? t('fb.titleFeature')
                    : t('fb.titleReview')
                }
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={150}
                className="w-full bg-bg-elevated border border-border rounded-xl px-3 py-2 text-xs text-text-primary outline-none focus:border-accent transition-colors"
              />
            </div>

            {/* Message / Description */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-text-muted">
                  {t('fb.description')} <span className="text-accent">*</span>
                </label>
                <span className="text-2xs font-mono text-text-muted">
                  {message.length}/2000
                </span>
              </div>
              <textarea
                rows={4}
                required
                placeholder={categoryPlaceholders[category]}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={2000}
                className="w-full bg-bg-elevated border border-border rounded-xl p-3 text-xs text-text-primary outline-none focus:border-accent transition-colors leading-relaxed resize-none"
              />
            </div>

            {/* Contact Email (Optional) */}
            <div className="space-y-1">
              <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-text-muted">
                {t('fb.emailLabel')}
              </label>
              <input
                type="email"
                placeholder="athlete@example.com"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                maxLength={100}
                className="w-full bg-bg-elevated border border-border rounded-xl px-3 py-2 text-xs text-text-primary outline-none focus:border-accent transition-colors"
              />
            </div>

            {/* Diagnostics Auto-attachment Checkbox */}
            <div className="p-2.5 rounded-xl bg-bg-elevated/40 border border-border flex items-start gap-2.5 text-2xs text-text-muted">
              <input
                type="checkbox"
                id="includeDiagnostics"
                checked={includeDiagnostics}
                onChange={(e) => setIncludeDiagnostics(e.target.checked)}
                className="mt-0.5 rounded border-border accent-accent cursor-pointer"
              />
              <label htmlFor="includeDiagnostics" className="cursor-pointer leading-tight select-none">
                <span className="text-text-secondary font-medium block">
                  {t('fb.diagTitle')}
                </span>
                {t('fb.diagBody')}
              </label>
            </div>

            {/* Actions */}
            <div className="pt-2 flex gap-2.5">
              <button
                type="button"
                onClick={handleResetAndClose}
                className="btn-ghost flex-1 py-2.5 text-xs font-semibold"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !message.trim()}
                className="btn-primary flex-1 py-2.5 text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-40"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>{t('fb.sending')}</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>{t('fb.submit')}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
