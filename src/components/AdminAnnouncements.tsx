import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  BellRing,
  CheckCircle2,
  Loader2,
  Megaphone,
  Send,
  Trash2,
} from 'lucide-react';

import { supabase } from '../lib/supabase';
import type {
  Announcement,
  AnnouncementAudience,
  AnnouncementPriority,
} from '../types/database';

interface AdminAnnouncementsProps {
  adminProfileId?: string;
}

const AUDIENCE_LABELS: Record<AnnouncementAudience, string> = {
  all: 'All residents',
  pending_review: 'Pending review residents',
  verified: 'Verified residents',
  returned: 'Residents with returned records',
  rejected: 'Residents with rejected records',
};

const PRIORITY_LABELS: Record<AnnouncementPriority, string> = {
  info: 'Information',
  important: 'Important',
  urgent: 'Urgent',
};

const PRIORITY_STYLES: Record<AnnouncementPriority, string> = {
  info: 'border-blue-200 bg-blue-50 text-blue-800',
  important: 'border-amber-200 bg-amber-50 text-amber-800',
  urgent: 'border-red-200 bg-red-50 text-red-800',
};

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export default function AdminAnnouncements({
  adminProfileId,
}: AdminAnnouncementsProps) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState<AnnouncementPriority>('info');
  const [audience, setAudience] = useState<AnnouncementAudience>('all');
  const [expiresAt, setExpiresAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [renderTime] = useState(() => Date.now());

  const loadAnnouncements = useCallback(async () => {
    setLoading(true);

    const { data, error: loadError } = await supabase
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false });

    if (loadError) {
      console.error('Unable to load announcements:', loadError);
      setError(
        loadError.code === '42P01'
          ? 'Run new-features-migration.sql in Supabase before using announcements.'
          : 'Unable to load announcements. Check the database policy and try again.',
      );
    } else {
      setAnnouncements((data ?? []) as Announcement[]);
      setError(null);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void loadAnnouncements();
  }, [loadAnnouncements]);

  async function handlePublish(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (title.trim().length < 3) {
      setError('The announcement title must contain at least 3 characters.');
      return;
    }

    if (message.trim().length < 5) {
      setError('The announcement message must contain at least 5 characters.');
      return;
    }

    setSaving(true);

    const { data, error: publishError } = await supabase
      .from('announcements')
      .insert({
        title: title.trim(),
        message: message.trim(),
        priority,
        audience,
        is_published: true,
        published_at: new Date().toISOString(),
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        created_by: adminProfileId ?? null,
      })
      .select()
      .single();

    if (publishError) {
      console.error('Unable to publish announcement:', publishError);
      setError('The announcement could not be published. Check your administrator access and try again.');
    } else {
      setAnnouncements((current) => [data as Announcement, ...current]);
      setTitle('');
      setMessage('');
      setPriority('info');
      setAudience('all');
      setExpiresAt('');
      setSuccess('Announcement published to the selected residents.');
    }

    setSaving(false);
  }

  async function togglePublished(announcement: Announcement) {
    setError(null);
    setSuccess(null);
    const nextPublished = !announcement.is_published;

    const { data, error: updateError } = await supabase
      .from('announcements')
      .update({
        is_published: nextPublished,
        published_at: nextPublished ? new Date().toISOString() : announcement.published_at,
        updated_at: new Date().toISOString(),
      })
      .eq('id', announcement.id)
      .select()
      .single();

    if (updateError) {
      setError('The announcement status could not be changed.');
      return;
    }

    setAnnouncements((current) =>
      current.map((item) => (item.id === announcement.id ? (data as Announcement) : item)),
    );
    setSuccess(nextPublished ? 'Announcement published again.' : 'Announcement hidden from residents.');
  }

  async function deleteAnnouncement(announcement: Announcement) {
    if (!window.confirm(`Delete the announcement “${announcement.title}”?`)) return;

    setError(null);
    setSuccess(null);
    const { error: deleteError } = await supabase
      .from('announcements')
      .delete()
      .eq('id', announcement.id);

    if (deleteError) {
      setError('The announcement could not be deleted.');
      return;
    }

    setAnnouncements((current) => current.filter((item) => item.id !== announcement.id));
    setSuccess('Announcement deleted.');
  }

  return (
    <section className="mb-8 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-gradient-to-r from-blue-700 to-indigo-700 p-6 text-white">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15">
            <Megaphone className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-100">
              Resident communication
            </p>
            <h2 className="mt-1 text-2xl font-bold">Announcements</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-blue-100">
              Publish notices to every resident or target them by census review status.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-0 xl:grid-cols-[0.9fr_1.1fr]">
        <form onSubmit={handlePublish} className="border-b border-slate-200 p-6 xl:border-b-0 xl:border-r">
          <h3 className="font-bold text-slate-900">Create announcement</h3>

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          <div className="mt-5 space-y-4">
            <div>
              <label htmlFor="announcement-title" className="mb-2 block text-sm font-semibold text-slate-700">
                Title
              </label>
              <input
                id="announcement-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={120}
                className="input"
                placeholder="Example: Barangay assembly schedule"
                required
              />
            </div>

            <div>
              <label htmlFor="announcement-message" className="mb-2 block text-sm font-semibold text-slate-700">
                Message
              </label>
              <textarea
                id="announcement-message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                maxLength={2000}
                rows={5}
                className="input min-h-32 resize-y"
                placeholder="Write the complete notice for residents..."
                required
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="announcement-priority" className="mb-2 block text-sm font-semibold text-slate-700">
                  Priority
                </label>
                <select
                  id="announcement-priority"
                  value={priority}
                  onChange={(event) => setPriority(event.target.value as AnnouncementPriority)}
                  className="input"
                >
                  {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="announcement-audience" className="mb-2 block text-sm font-semibold text-slate-700">
                  Audience
                </label>
                <select
                  id="announcement-audience"
                  value={audience}
                  onChange={(event) => setAudience(event.target.value as AnnouncementAudience)}
                  className="input"
                >
                  {Object.entries(AUDIENCE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="announcement-expiry" className="mb-2 block text-sm font-semibold text-slate-700">
                Expiration <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <input
                id="announcement-expiry"
                type="datetime-local"
                value={expiresAt}
                min={new Date().toISOString().slice(0, 16)}
                onChange={(event) => setExpiresAt(event.target.value)}
                className="input"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            {saving ? 'Publishing...' : 'Publish announcement'}
          </button>
        </form>

        <div className="p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-slate-900">Announcement history</h3>
              <p className="mt-1 text-sm text-slate-500">Published, hidden, and expired notices</p>
            </div>
            <BellRing className="h-5 w-5 text-blue-700" />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-500">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading announcements...
            </div>
          ) : announcements.length === 0 ? (
            <div className="mt-5 rounded-2xl border-2 border-dashed border-slate-200 px-5 py-12 text-center text-sm text-slate-500">
              No announcements have been created yet.
            </div>
          ) : (
            <div className="mt-5 max-h-[620px] space-y-4 overflow-y-auto pr-1">
              {announcements.map((announcement) => {
                const expired = Boolean(
                  announcement.expires_at && new Date(announcement.expires_at).getTime() <= renderTime,
                );

                return (
                  <article key={announcement.id} className={`rounded-2xl border p-4 ${PRIORITY_STYLES[announcement.priority]}`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wider">
                          <span>{PRIORITY_LABELS[announcement.priority]}</span>
                          <span>•</span>
                          <span>{AUDIENCE_LABELS[announcement.audience]}</span>
                        </div>
                        <h4 className="mt-2 text-base font-bold text-slate-900">{announcement.title}</h4>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${announcement.is_published && !expired ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                        {expired ? 'Expired' : announcement.is_published ? 'Published' : 'Hidden'}
                      </span>
                    </div>

                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{announcement.message}</p>
                    <p className="mt-3 text-xs text-slate-500">
                      Published {formatDateTime(announcement.published_at)}
                      {announcement.expires_at ? ` · Expires ${formatDateTime(announcement.expires_at)}` : ''}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void togglePublished(announcement)}
                        className="rounded-lg border border-current/20 bg-white/70 px-3 py-2 text-xs font-bold transition hover:bg-white"
                      >
                        {announcement.is_published ? 'Hide from residents' : 'Publish again'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteAnnouncement(announcement)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white/70 px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
