import { useId, useState } from 'react';
import { validateOverride } from '../engine/checks';
import type { Finding, Override } from '../engine/types';

export function OverrideForm(props: {
  finding: Finding;
  sliceId: string;
  onSave: (o: Override) => void;
  onCancel: () => void;
}) {
  const { finding, sliceId, onSave, onCancel } = props;
  const [reviewer, setReviewer] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateOverride(finding, reviewer, reason);
    setError(err);
    if (err) return;
    onSave({ findingId: finding.id, sliceId, reviewer: reviewer.trim(), reason: reason.trim(), at: new Date().toISOString() });
  };

  return (
    <form className="override-form" onSubmit={submit} noValidate aria-label={`Record sign-off for ${finding.title}`}>
      <p className="override-note">
        Signing off accepts this risk for this revision only. Your name and reason go into the decision memo.
      </p>
      <label htmlFor={`${id}-r`}>Reviewer name</label>
      <input id={`${id}-r`} value={reviewer} onChange={(e) => setReviewer(e.target.value)} autoComplete="name" />
      <label htmlFor={`${id}-why`}>Reason (at least 20 characters)</label>
      <textarea
        id={`${id}-why`}
        rows={3}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        aria-describedby={`${id}-count`}
      />
      <span id={`${id}-count`} className="hint">
        {reason.trim().length} / 20 characters
      </span>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="row-actions">
        <button type="submit" className="btn btn-primary btn-sm">
          Record sign-off
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
