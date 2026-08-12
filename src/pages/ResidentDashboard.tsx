import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Edit3,
  Eye,
  FileText,
  Home,
  ImageOff,
  Maximize2,
  Megaphone,
  X,
  Loader2,
  LogOut,
  RefreshCw,
  User,
  XCircle,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import ResidentQrCard from '../components/ResidentQrCard';
import type {
  Announcement,
  AnnouncementPriority,
  FaceVerification,
  GovernmentId,
  Remark,
  Resident,
  ResidentStatus,
} from '../types/database';


interface ResidentImages {
  governmentId: GovernmentId | null;
  faceVerification: FaceVerification | null;
  householdPhotoUrl: string | null;
}

interface PreviewImage {
  title: string;
  url: string;
}

const VERIFICATION_BUCKET = 'resident-verification';
const HOUSEHOLD_IMAGES_BUCKET = 'household-images';

async function createSignedImageUrl(
  bucket: string,
  pathOrUrl?: string | null,
): Promise<string | null> {
  if (!pathOrUrl) return null;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(pathOrUrl, 60 * 60);

  if (error) {
    console.error(`Unable to create signed URL for ${bucket}:`, error);
    return null;
  }

  return data.signedUrl;
}

interface ResidentDashboardProps {
  onLogout: () => void;
  onEdit: () => void;
}

const STATUS_CONFIG: Record<
  ResidentStatus,
  {
    label: string;
    description: string;
    icon: typeof Clock;
    iconClass: string;
    backgroundClass: string;
    badgeClass: string;
  }
> = {
  pending_review: {
    label: 'Pending Review',
    description:
      'Your census information is being reviewed by the Barangay Administrator.',
    icon: Clock,
    iconClass: 'text-amber-600',
    backgroundClass: 'bg-amber-100',
    badgeClass: 'bg-amber-100 text-amber-700',
  },
  verified: {
    label: 'Verified',
    description: 'Your census information has been approved.',
    icon: CheckCircle2,
    iconClass: 'text-emerald-600',
    backgroundClass: 'bg-emerald-100',
    badgeClass: 'bg-emerald-100 text-emerald-700',
  },
  returned: {
    label: 'Returned for Correction',
    description:
      'The administrator returned your record. Review the remarks and update your census information.',
    icon: AlertCircle,
    iconClass: 'text-orange-600',
    backgroundClass: 'bg-orange-100',
    badgeClass: 'bg-orange-100 text-orange-700',
  },
  rejected: {
    label: 'Rejected',
    description:
      'Your census submission was rejected. Contact the Barangay office for assistance.',
    icon: XCircle,
    iconClass: 'text-red-600',
    backgroundClass: 'bg-red-100',
    badgeClass: 'bg-red-100 text-red-700',
  },
};

function formatDate(value?: string | null): string {
  if (!value) return 'Not available';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

function formatDateTime(value: string): string {
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

const ANNOUNCEMENT_STYLES: Record<AnnouncementPriority, string> = {
  info: 'border-blue-200 bg-blue-50 text-blue-900',
  important: 'border-amber-200 bg-amber-50 text-amber-900',
  urgent: 'border-red-200 bg-red-50 text-red-900',
};

function displayValue(value?: string | null): string {
  return value?.trim() || 'Not submitted';
}

export default function ResidentDashboard({
  onLogout,
  onEdit,
}: ResidentDashboardProps) {
  const { user } = useAuth();
  const [resident, setResident] = useState<Resident | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [remarks, setRemarks] = useState<Remark[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [images, setImages] = useState<ResidentImages>({
    governmentId: null,
    faceVerification: null,
    householdPhotoUrl: null,
  });
  const [previewImage, setPreviewImage] = useState<PreviewImage | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadResident = useCallback(async (showRefresh = false) => {
    if (!user) {
      setResident(null);
      setLoading(false);
      return;
    }

    if (showRefresh) setRefreshing(true);
    else setLoading(true);

    setError(null);

    try {
      const { data, error: residentError } = await supabase
        .from('residents')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (residentError) throw residentError;

      setResident((data as Resident | null) ?? null);
      setCategories([]);
      setRemarks([]);
      setAnnouncements([]);
      setImages({
        governmentId: null,
        faceVerification: null,
        householdPhotoUrl: null,
      });

      if (data?.id) {
        const [categoryResult, idResult, faceResult, remarksResult] = await Promise.all([
          supabase
            .from('resident_categories')
            .select('category_id, categories(name)')
            .eq('resident_id', data.id),
          supabase
            .from('government_ids')
            .select('*')
            .eq('resident_id', data.id)
            .maybeSingle(),
          supabase
            .from('face_verifications')
            .select('*')
            .eq('resident_id', data.id)
            .maybeSingle(),
          supabase
            .from('remarks')
            .select('*')
            .eq('resident_id', data.id)
            .order('created_at', { ascending: false }),
        ]);

        if (remarksResult.error) {
          console.error('Unable to load remarks:', remarksResult.error);
        } else {
          setRemarks((remarksResult.data ?? []) as Remark[]);
        }

        if (!categoryResult.error && categoryResult.data) {
          const names = categoryResult.data
            .map((row: any) => row.categories?.name)
            .filter((name: unknown): name is string => typeof name === 'string');
          setCategories(names);
        }

        const governmentId = idResult.data
          ? {
              ...idResult.data,
              front_image_url: await createSignedImageUrl(
                VERIFICATION_BUCKET,
                idResult.data.front_image_url,
              ),
              back_image_url: await createSignedImageUrl(
                VERIFICATION_BUCKET,
                idResult.data.back_image_url,
              ),
            }
          : null;

        const faceVerification = faceResult.data
          ? {
              ...faceResult.data,
              captured_face_url: await createSignedImageUrl(
                VERIFICATION_BUCKET,
                faceResult.data.captured_face_url,
              ),
            }
          : null;

        const householdPhotoUrl = await createSignedImageUrl(
          HOUSEHOLD_IMAGES_BUCKET,
          data.household_photo_url,
        );

        setImages({
          governmentId: governmentId as GovernmentId | null,
          faceVerification: faceVerification as FaceVerification | null,
          householdPhotoUrl,
        });
      }

      const { data: announcementData, error: announcementError } = await supabase
        .from('announcements')
        .select('*')
        .eq('is_published', true)
        .order('published_at', { ascending: false });

      if (announcementError) {
        console.error('Unable to load announcements:', announcementError);
      } else {
        const priorityOrder: Record<AnnouncementPriority, number> = {
          urgent: 0,
          important: 1,
          info: 2,
        };
        const activeAnnouncements = ((announcementData ?? []) as Announcement[])
          .filter((announcement) =>
            !announcement.expires_at || new Date(announcement.expires_at).getTime() > Date.now(),
          )
          .sort((first, second) =>
            priorityOrder[first.priority] - priorityOrder[second.priority] ||
            new Date(second.published_at).getTime() - new Date(first.published_at).getTime(),
          );
        setAnnouncements(activeAnnouncements);
      }
    } catch (caughtError) {
      console.error(caughtError);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Unable to load your census record.',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    const savedNotice = window.sessionStorage.getItem('residentDashboardNotice');

    if (savedNotice) {
      setNotice(savedNotice);
      window.sessionStorage.removeItem('residentDashboardNotice');
    }
  }, []);

  useEffect(() => {
    void loadResident();
  }, [loadResident]);

  const status = resident?.status ?? 'pending_review';
  const currentStatus = STATUS_CONFIG[status];
  const StatusIcon = currentStatus.icon;

  const fullName = useMemo(() => {
    if (!resident) return 'Resident';
    return [
      resident.first_name,
      resident.middle_name,
      resident.last_name,
      resident.suffix,
    ]
      .filter(Boolean)
      .join(' ');
  }, [resident]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-blue-600" />
          <p className="mt-3 text-sm text-slate-600">Loading resident dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white/90 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">
              Barangay Old Lucban
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">
              Resident Dashboard
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              View your census record and application status.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadResident(true)}
              disabled={refreshing}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-60"
              title="Refresh record"
            >
              <RefreshCw className={refreshing ? 'animate-spin' : ''} size={18} />
            </button>

            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"
            >
              <LogOut size={18} />
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        {notice && (
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold">Census record saved</p>
              <p className="mt-1">{notice}</p>
            </div>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="rounded-lg p-1 text-emerald-700 transition hover:bg-emerald-100"
              aria-label="Dismiss notification"
            >
              <XCircle size={18} />
            </button>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">Unable to load your record</p>
              <p className="mt-1">{error}</p>
            </div>
          </div>
        )}

        {announcements.length > 0 && (
          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-6 py-5 sm:px-8">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                  <Megaphone size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold">Barangay Announcements</h2>
                  <p className="text-sm text-slate-500">Official notices from the Barangay Administrator</p>
                </div>
              </div>
            </div>

            <div className="space-y-4 p-5 sm:p-6">
              {announcements.map((announcement) => (
                <article
                  key={announcement.id}
                  className={`rounded-2xl border p-5 ${ANNOUNCEMENT_STYLES[announcement.priority]}`}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.16em]">
                        {announcement.priority === 'info' ? 'Information' : announcement.priority}
                      </p>
                      <h3 className="mt-1 text-lg font-bold text-slate-900">{announcement.title}</h3>
                    </div>
                    <time className="shrink-0 text-xs font-medium text-slate-500">
                      {formatDateTime(announcement.published_at)}
                    </time>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                    {announcement.message}
                  </p>
                  {announcement.expires_at && (
                    <p className="mt-3 text-xs font-medium text-slate-500">
                      Available until {formatDateTime(announcement.expires_at)}
                    </p>
                  )}
                </article>
              ))}
            </div>
          </section>
        )}

        {!resident ? (
          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-8 text-white sm:px-8">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-100">
                Census Registration
              </p>
              <h2 className="mt-2 text-3xl font-bold">Complete your census record</h2>
              <p className="mt-3 max-w-2xl text-blue-100">
                No census submission is connected to this account yet. Complete the form to create your resident record.
              </p>
            </div>
            <div className="p-6 sm:p-8">
              <button
                type="button"
                onClick={onEdit}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-blue-700"
              >
                <Edit3 size={18} />
                Complete Census Form
              </button>
            </div>
          </section>
        ) : (
          <>
            <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
                <div className="flex items-start gap-4">
                  <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${currentStatus.backgroundClass}`}>
                    <StatusIcon className={currentStatus.iconClass} size={28} />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="text-sm font-medium text-slate-500">Application Status</p>
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${currentStatus.badgeClass}`}>
                        {currentStatus.label}
                      </span>
                    </div>
                    <h2 className="mt-2 text-2xl font-bold tracking-tight">{fullName}</h2>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                      {currentStatus.description}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onEdit}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-blue-700"
                >
                  <Edit3 size={18} />
                  Update Census
                </button>
              </div>

              <div className="grid border-t border-slate-100 bg-slate-50/70 sm:grid-cols-2">
                <div className="px-6 py-5 sm:px-8">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Tracking Number</p>
                  <p className="mt-1 text-lg font-bold text-blue-700">
                    {displayValue(resident.tracking_number)}
                  </p>
                </div>
                <div className="border-t border-slate-200 px-6 py-5 sm:border-l sm:border-t-0 sm:px-8">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Date Submitted</p>
                  <p className="mt-1 text-lg font-semibold text-slate-800">
                    {formatDate(resident.submitted_at)}
                  </p>
                </div>
              </div>
            </section>

            <ResidentQrCard resident={resident} />

            {remarks.length > 0 && (
              <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-6 py-5 sm:px-8">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                      <FileText size={20} />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold">Administrator Remarks</h2>
                      <p className="text-sm text-slate-500">Messages from the review of your census record</p>
                    </div>
                  </div>
                </div>

                <div className="divide-y divide-slate-100">
                  {remarks.map((remark, index) => {
                    const remarkStatus = remark.status_change as ResidentStatus;
                    const remarkConfig = STATUS_CONFIG[remarkStatus] ?? STATUS_CONFIG.pending_review;
                    const RemarkIcon = remarkConfig.icon;

                    return (
                      <article key={remark.id} className="px-6 py-5 sm:px-8">
                        <div className="flex items-start gap-4">
                          <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${remarkConfig.backgroundClass}`}>
                            <RemarkIcon className={remarkConfig.iconClass} size={20} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-bold text-slate-900">
                                  {index === 0 ? 'Latest decision' : 'Previous decision'}
                                </p>
                                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${remarkConfig.badgeClass}`}>
                                  {remarkConfig.label}
                                </span>
                              </div>
                              <time className="text-xs font-medium text-slate-500">
                                {formatDate(remark.created_at)}
                              </time>
                            </div>
                            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                              {remark.remark_text}
                            </p>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
                  <Home size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold">Submitted Photos</h2>
                  <p className="text-sm text-slate-500">
                    Your household and identity-verification images
                  </p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <DashboardImageCard
                  title="Household Photo"
                  description="Photo of your house or household"
                  url={images.householdPhotoUrl}
                  onPreview={(url) => setPreviewImage({ title: 'Household Photo', url })}
                />
                <DashboardImageCard
                  title="Government ID Front"
                  description={images.governmentId?.id_type || 'Front side of submitted ID'}
                  url={images.governmentId?.front_image_url ?? null}
                  onPreview={(url) => setPreviewImage({ title: 'Government ID Front', url })}
                />
                <DashboardImageCard
                  title="Government ID Back"
                  description="Back side of submitted ID"
                  url={images.governmentId?.back_image_url ?? null}
                  onPreview={(url) => setPreviewImage({ title: 'Government ID Back', url })}
                />
                <DashboardImageCard
                  title="Captured Face"
                  description="Photo used for facial verification"
                  url={images.faceVerification?.captured_face_url ?? null}
                  onPreview={(url) => setPreviewImage({ title: 'Captured Face', url })}
                />
              </div>
            </section>

            <div className="grid gap-6 lg:grid-cols-2">
              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                <div className="mb-6 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                    <User size={20} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold">Personal Information</h2>
                    <p className="text-sm text-slate-500">Your submitted resident details</p>
                  </div>
                </div>

                <dl className="space-y-4 text-sm">
                  <InfoRow label="Full Name" value={fullName} />
                  <InfoRow label="Birth Date" value={formatDate(resident.birth_date)} />
                  <InfoRow label="Sex" value={resident.sex} />
                  <InfoRow label="Civil Status" value={displayValue(resident.civil_status)} />
                  <InfoRow label="Address" value={`${resident.residential_address}, ${resident.barangay}, ${resident.city_municipality}, ${resident.province}`} />
                  <InfoRow label="Contact Number" value={displayValue(resident.contact_number)} />
                </dl>
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                <div className="mb-6 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
                    <FileText size={20} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold">Census Information</h2>
                    <p className="text-sm text-slate-500">Education, occupation, and classification</p>
                  </div>
                </div>

                <dl className="space-y-4 text-sm">
                  <InfoRow label="Occupation" value={displayValue(resident.profession_occupation)} />
                  <InfoRow label="Highest Education" value={displayValue(resident.highest_education)} />
                  <InfoRow label="Education Status" value={displayValue(resident.education_status)} />
                  <InfoRow label="Tenurial Status" value={displayValue(resident.tenurial_status)} />
                  <InfoRow label="Categories" value={categories.length ? categories.join(', ') : 'None'} />
                </dl>
              </section>
            </div>
          </>
        )}
      </main>

      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={`${previewImage.title} preview`}
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="relative w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">Image Preview</p>
                <h2 className="text-lg font-bold text-slate-900">{previewImage.title}</h2>
              </div>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="rounded-xl border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-100"
                aria-label="Close image preview"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex max-h-[78vh] items-center justify-center bg-slate-100 p-4 sm:p-6">
              <img
                src={previewImage.url}
                alt={previewImage.title}
                className="max-h-[70vh] max-w-full rounded-2xl object-contain"
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function DashboardImageCard({
  title,
  description,
  url,
  onPreview,
}: {
  title: string;
  description: string;
  url: string | null;
  onPreview: (url: string) => void;
}) {
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
      <div className="relative aspect-[4/3] bg-slate-100">
        {url ? (
          <>
            <img src={url} alt={title} className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => onPreview(url)}
              className="absolute inset-0 flex items-center justify-center bg-slate-950/0 text-white opacity-0 transition hover:bg-slate-950/45 hover:opacity-100 focus:bg-slate-950/45 focus:opacity-100"
              aria-label={`Preview ${title}`}
            >
              <span className="inline-flex items-center gap-2 rounded-xl bg-white/95 px-3 py-2 text-sm font-semibold text-slate-800 shadow-lg">
                <Eye size={17} />
                View
              </span>
            </button>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-slate-400">
            <ImageOff size={30} />
            <span className="text-sm font-medium">No image available</span>
          </div>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-bold text-slate-900">{title}</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
          </div>
          {url && (
            <button
              type="button"
              onClick={() => onPreview(url)}
              className="shrink-0 rounded-lg border border-slate-200 bg-white p-2 text-slate-600 transition hover:border-blue-200 hover:text-blue-700"
              aria-label={`Open ${title}`}
            >
              <Maximize2 size={16} />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-b border-slate-100 pb-4 last:border-b-0 last:pb-0 sm:grid-cols-[140px_1fr] sm:gap-4">
      <dt className="font-medium text-slate-500">{label}</dt>
      <dd className="font-semibold text-slate-800 sm:text-right">{value}</dd>
    </div>
  );
}
