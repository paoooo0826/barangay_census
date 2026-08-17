import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  Contact,
  Eye,
  FileCheck,
  GraduationCap,
  Home,
  ImageOff,
  Loader2,
  Mail,
  MapPin,
  Maximize2,
  MessageSquare,
  Phone,
  ShieldCheck,
  User,
  X,
  XCircle,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import ResidentQrCard from '../components/ResidentQrCard';

import type {
  FaceVerification,
  GovernmentId,
  Remark,
  Resident,
} from '../types/database';

interface AdminReviewProps {
  residentId: string;
  onBack: () => void;
  onDecisionComplete: () => void;
}

interface ResidentData {
  resident: Resident;
  governmentId: GovernmentId | null;
  faceVerification: FaceVerification | null;
  remarks: Remark[];
}

type ReviewAction = 'approve' | 'return' | 'reject';

type ResidentStatus =
  | 'pending_review'
  | 'verified'
  | 'returned'
  | 'rejected';

interface StatusConfig {
  label: string;
  badgeClass: string;
  dotClass: string;
  panelClass: string;
}

interface PreviewImage {
  url: string;
  title: string;
}

const VERIFICATION_BUCKET = 'resident-verification';
const HOUSEHOLD_IMAGES_BUCKET = 'household-images';

const STATUS_CONFIG: Record<ResidentStatus, StatusConfig> = {
  pending_review: {
    label: 'Pending Review',
    badgeClass: 'bg-amber-50 text-amber-700 ring-amber-200',
    dotClass: 'bg-amber-500',
    panelClass: 'border-amber-200 bg-amber-50',
  },
  verified: {
    label: 'Verified',
    badgeClass: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    dotClass: 'bg-emerald-500',
    panelClass: 'border-emerald-200 bg-emerald-50',
  },
  returned: {
    label: 'Returned',
    badgeClass: 'bg-orange-50 text-orange-700 ring-orange-200',
    dotClass: 'bg-orange-500',
    panelClass: 'border-orange-200 bg-orange-50',
  },
  rejected: {
    label: 'Rejected',
    badgeClass: 'bg-red-50 text-red-700 ring-red-200',
    dotClass: 'bg-red-500',
    panelClass: 'border-red-200 bg-red-50',
  },
};

const ACTION_CONFIG: Record<
  ReviewAction,
  {
    title: string;
    description: string;
    confirmLabel: string;
    confirmClass: string;
    icon: typeof CheckCircle2;
  }
> = {
  approve: {
    title: 'Approve census record',
    description:
      'This resident record will be marked as verified and approved.',
    confirmLabel: 'Approve Record',
    confirmClass: 'bg-emerald-600 hover:bg-emerald-700',
    icon: CheckCircle2,
  },
  return: {
    title: 'Return for correction',
    description:
      'The resident will be asked to update and resubmit their census information.',
    confirmLabel: 'Return Record',
    confirmClass: 'bg-amber-500 hover:bg-amber-600',
    icon: AlertCircle,
  },
  reject: {
    title: 'Reject census record',
    description:
      'This resident record will be rejected. Please provide a clear reason.',
    confirmLabel: 'Reject Record',
    confirmClass: 'bg-red-600 hover:bg-red-700',
    icon: XCircle,
  },
};

async function createVerificationImageUrl(pathOrUrl?: string | null) {
  if (!pathOrUrl) {
    return null;
  }

  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }

  const { data, error } = await supabase.storage
    .from(VERIFICATION_BUCKET)
    .createSignedUrl(pathOrUrl, 60 * 60);

  if (error) {
    console.error('Unable to create verification image URL:', error);
    return null;
  }

  return data.signedUrl;
}

async function createHouseholdImageUrl(pathOrUrl?: string | null) {
  if (!pathOrUrl) {
    return null;
  }

  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }

  const { data, error } = await supabase.storage
    .from(HOUSEHOLD_IMAGES_BUCKET)
    .createSignedUrl(pathOrUrl, 60 * 60);

  if (error) {
    console.error('Unable to create household image URL:', error);
    return null;
  }

  return data.signedUrl;
}

const formatLabel = (value?: string | null) => {
  if (!value) {
    return 'Not provided';
  }

  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const formatCurrency = (value?: number | null) => {
  if (value == null || !Number.isFinite(Number(value))) {
    return 'Not provided';
  }

  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(Number(value));
};

export default function AdminReview({
  residentId,
  onBack,
  onDecisionComplete,
}: AdminReviewProps) {
  const { user, adminProfile } = useAuth();

  const [data, setData] = useState<ResidentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showRemarksModal, setShowRemarksModal] = useState(false);
  const [selectedAction, setSelectedAction] =
    useState<ReviewAction | null>(null);
  const [remarkText, setRemarkText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<PreviewImage | null>(null);

  useEffect(() => {
    void fetchResidentData();
  }, [residentId]);

  const fetchResidentData = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: resident, error: residentError } = await supabase
        .from('residents')
        .select('*')
        .eq('id', residentId)
        .single();

      if (residentError) {
        throw residentError;
      }

      const [idResult, faceResult, remarksResult] = await Promise.all([
        supabase
          .from('government_ids')
          .select('*')
          .eq('resident_id', residentId)
          .maybeSingle(),

        supabase
          .from('face_verifications')
          .select('*')
          .eq('resident_id', residentId)
          .maybeSingle(),

        supabase
          .from('remarks')
          .select('*')
          .eq('resident_id', residentId)
          .order('created_at', {
            ascending: false,
          }),
      ]);

      if (idResult.error) {
        throw idResult.error;
      }

      if (faceResult.error) {
        throw faceResult.error;
      }

      if (remarksResult.error) {
        throw remarksResult.error;
      }

      const governmentId = idResult.data
        ? {
            ...idResult.data,
            front_image_url: await createVerificationImageUrl(
              idResult.data.front_image_url,
            ),
            back_image_url: await createVerificationImageUrl(
              idResult.data.back_image_url,
            ),
          }
        : null;

      const faceVerification = faceResult.data
        ? {
            ...faceResult.data,
            captured_face_url: await createVerificationImageUrl(
              faceResult.data.captured_face_url,
            ),
          }
        : null;

      const residentWithHouseholdPhoto = {
        ...resident,
        household_photo_url: await createHouseholdImageUrl(
          resident.household_photo_url,
        ),
      };

      setData({
        resident: residentWithHouseholdPhoto as Resident,
        governmentId: governmentId as GovernmentId | null,
        faceVerification: faceVerification as FaceVerification | null,
        remarks: (remarksResult.data ?? []) as Remark[],
      });
    } catch (fetchError) {
      console.error('Error loading resident:', fetchError);
      setError('Failed to load resident information.');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const calculateAge = (birthDate: string) => {
    const today = new Date();
    const birth = new Date(birthDate);

    let age = today.getFullYear() - birth.getFullYear();

    const monthDifference = today.getMonth() - birth.getMonth();

    if (
      monthDifference < 0 ||
      (monthDifference === 0 && today.getDate() < birth.getDate())
    ) {
      age -= 1;
    }

    return age;
  };

  const formatDate = (date?: string | null) => {
    if (!date) {
      return 'Not provided';
    }

    return new Date(date).toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const openActionModal = (action: ReviewAction) => {
    setSelectedAction(action);
    setRemarkText('');
    setError(null);
    setShowRemarksModal(true);
  };

  const closeActionModal = () => {
    if (actionLoading) {
      return;
    }

    setShowRemarksModal(false);
    setSelectedAction(null);
    setRemarkText('');
    setError(null);
  };

  const handleAction = async () => {
    if (!selectedAction || !data || !adminProfile) {
      return;
    }

    if (selectedAction !== 'approve' && !remarkText.trim()) {
      setError('Please provide remarks before continuing.');
      return;
    }

    setActionLoading(true);
    setError(null);

    try {
      const newStatus: ResidentStatus =
        selectedAction === 'approve'
          ? 'verified'
          : selectedAction === 'return'
            ? 'returned'
            : 'rejected';

      const { error: residentUpdateError } = await supabase
        .from('residents')
        .update({
          status: newStatus,
          verified_at:
            selectedAction === 'approve' ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', residentId);

      if (residentUpdateError) {
        throw residentUpdateError;
      }

      if (remarkText.trim()) {
        const { error: remarkError } = await supabase.from('remarks').insert({
          resident_id: residentId,
          admin_id: adminProfile.id,
          remark_text: remarkText.trim(),
          status_change: newStatus,
        });

        if (remarkError) {
          throw remarkError;
        }
      }

      const notificationTitle =
        selectedAction === 'approve'
          ? 'Census Approved'
          : selectedAction === 'return'
            ? 'Census Returned for Correction'
            : 'Census Rejected';

      const notificationMessage =
        remarkText.trim() ||
        (selectedAction === 'approve'
          ? 'Your census submission has been verified and approved.'
          : selectedAction === 'return'
            ? 'Your census submission has been returned for correction.'
            : 'Your census submission has been rejected.');

      const { error: notificationError } = await supabase
        .from('notifications')
        .insert({
          resident_id: residentId,
          title: notificationTitle,
          message: notificationMessage,
        });

      if (notificationError) {
        throw notificationError;
      }

      const { error: auditError } = await supabase
        .from('audit_logs')
        .insert({
          user_id: user?.id ?? null,
          action: selectedAction,
          entity_type: 'resident',
          entity_id: residentId,
          details: {
            status: newStatus,
            remark: remarkText.trim(),
          },
        });

      if (auditError) {
        throw auditError;
      }

      setShowRemarksModal(false);
      setRemarkText('');
      setSelectedAction(null);

      onDecisionComplete();
    } catch (actionError) {
      console.error('Action error:', actionError);
      setError('Failed to update the resident status. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const residentName = useMemo(() => {
    if (!data) {
      return '';
    }

    return [
      data.resident.first_name,
      data.resident.middle_name,
      data.resident.last_name,
      data.resident.suffix,
    ]
      .filter(Boolean)
      .join(' ');
  }, [data]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 px-4">
        <div className="w-full max-w-sm rounded-3xl border border-white/70 bg-white/90 p-8 text-center shadow-xl shadow-slate-200/60 backdrop-blur">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-100">
            <Loader2 className="h-8 w-8 animate-spin text-blue-700" />
          </div>

          <h2 className="text-xl font-bold text-slate-900">
            Loading resident record
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-500">
            Retrieving census details and verification files.
          </p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 px-4">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-red-100 text-red-600">
            <AlertCircle className="h-8 w-8" />
          </div>

          <h2 className="mt-5 text-2xl font-bold text-slate-900">
            Resident not found
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-500">
            The requested resident record could not be loaded.
          </p>

          {error && (
            <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={onBack}
            className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 text-sm font-semibold text-white transition hover:bg-blue-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const resident = data.resident;
  const age = calculateAge(resident.birth_date);

  const status =
    STATUS_CONFIG[resident.status as ResidentStatus] ??
    STATUS_CONFIG.pending_review;

  const selectedActionConfig = selectedAction
    ? ACTION_CONFIG[selectedAction]
    : null;

  const verificationImages = [
    {
      title: 'Government ID Front',
      description: 'Front image of the submitted identification card',
      url: data.governmentId?.front_image_url ?? null,
    },
    {
      title: 'Government ID Back',
      description: 'Back image of the submitted identification card',
      url: data.governmentId?.back_image_url ?? null,
    },
    {
      title: 'Captured Face',
      description: 'Face image captured during resident registration',
      url: data.faceVerification?.captured_face_url ?? null,
    },
    {
      title: 'Household Photo',
      description: 'Photo of the resident’s house or household',
      url: resident.household_photo_url ?? null,
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/60 to-indigo-50">
      <header className="sticky top-0 z-30 border-b border-blue-100 bg-white/90 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back to Dashboard</span>
            <span className="sm:hidden">Back</span>
          </button>

          <span
            className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-bold ring-1 ring-inset ${status.badgeClass}`}
          >
            <span className={`h-2 w-2 rounded-full ${status.dotClass}`} />
            {status.label}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700 shadow-sm">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />

            <div>
              <p className="font-semibold">Unable to complete action</p>
              <p className="mt-1 text-sm">{error}</p>
            </div>
          </div>
        )}

        <section className="mb-8 overflow-hidden rounded-3xl border border-blue-100 bg-white shadow-sm">
          <div className="bg-gradient-to-r from-blue-700 via-blue-700 to-indigo-700 px-6 py-7 text-white sm:px-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-xl font-bold ring-1 ring-white/20 backdrop-blur">
                  {resident.first_name?.charAt(0).toUpperCase()}
                  {resident.last_name?.charAt(0).toUpperCase()}
                </div>

                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-100">
                    Resident census review
                  </p>

                  <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
                    {residentName}
                  </h1>

                  <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-blue-100">
                    <span className="inline-flex items-center gap-2">
                      <FileCheck className="h-4 w-4" />
                      {resident.tracking_number}
                    </span>

                    <span className="inline-flex items-center gap-2">
                      <CalendarDays className="h-4 w-4" />
                      Submitted {formatDate(resident.submitted_at)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:flex">
                <div className="rounded-2xl bg-white/10 px-5 py-4 ring-1 ring-white/15 backdrop-blur">
                  <p className="text-xs font-medium text-blue-100">Age</p>
                  <p className="mt-1 text-xl font-bold">{age}</p>
                </div>

                <div className="rounded-2xl bg-white/10 px-5 py-4 ring-1 ring-white/15 backdrop-blur">
                  <p className="text-xs font-medium text-blue-100">Sex</p>
                  <p className="mt-1 text-xl font-bold">
                    {formatLabel(resident.sex)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className={`border-t p-5 sm:p-6 ${status.panelClass}`}>
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />

              <div>
                <p className="font-semibold">Current record status</p>
                <p className="mt-1 text-sm opacity-80">
                  This census submission is currently marked as{' '}
                  <span className="font-semibold">{status.label}</span>.
                </p>
              </div>
            </div>
          </div>
        </section>

        <div className="mb-8">
          <ResidentQrCard resident={resident} compact />
        </div>

        <section className="mb-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-blue-700">
                Identity verification
              </p>

              <h2 className="mt-1 text-xl font-bold text-slate-900">
                Submitted verification images
              </h2>

              <p className="mt-2 text-sm text-slate-500">
                Review the government ID, captured face, and submitted household
                photo.
              </p>
            </div>

            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
              <FileCheck className="h-5 w-5" />
            </div>
          </div>

          <div className="mb-5 rounded-2xl border border-blue-200 bg-blue-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-blue-700">Submitted ID Type</p>
            <p className="mt-1 text-base font-semibold text-slate-900">
              {data.governmentId?.id_type || 'Not provided'}
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {verificationImages.map((image) => (
              <article
                key={image.title}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"
              >
                <div className="border-b border-slate-200 bg-white px-4 py-4">
                  <h3 className="font-semibold text-slate-900">
                    {image.title}
                  </h3>

                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    {image.description}
                  </p>
                </div>

                {image.url ? (
                  <button
                    type="button"
                    onClick={() =>
                      setPreviewImage({
                        url: image.url as string,
                        title: image.title,
                      })
                    }
                    className="group relative block h-64 w-full overflow-hidden bg-slate-100"
                  >
                    <img
                      src={image.url}
                      alt={image.title}
                      className="h-full w-full object-contain p-3 transition duration-300 group-hover:scale-[1.02]"
                    />

                    <div className="absolute inset-0 flex items-center justify-center bg-slate-950/0 transition group-hover:bg-slate-950/30">
                      <span className="inline-flex scale-90 items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-800 opacity-0 shadow-lg transition group-hover:scale-100 group-hover:opacity-100">
                        <Maximize2 className="h-4 w-4" />
                        View Image
                      </span>
                    </div>
                  </button>
                ) : (
                  <div className="flex h-64 flex-col items-center justify-center px-6 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-200 text-slate-500">
                      <ImageOff className="h-6 w-6" />
                    </div>

                    <p className="mt-4 font-semibold text-slate-700">
                      No image available
                    </p>

                    <p className="mt-1 text-sm text-slate-500">
                      This verification image was not submitted.
                    </p>
                  </div>
                )}
              </article>
            ))}
          </div>


          {data.faceVerification && (
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-indigo-100 p-2 text-indigo-700"><ShieldCheck size={20} /></div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Automated identity screening</h2>
                  <p className="text-sm text-slate-500">Decision support only. The administrator makes the final approval decision.</p>
                </div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Face result</p><p className="mt-1 font-bold text-slate-900">{data.faceVerification.is_matched ? 'Matched' : 'Not matched'}</p></div>
                <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Distance</p><p className="mt-1 font-bold text-slate-900">{data.faceVerification.match_distance == null ? 'Not recorded' : Number(data.faceVerification.match_distance).toFixed(3)}</p></div>
                <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Similarity indicator</p><p className="mt-1 font-bold text-slate-900">{data.faceVerification.similarity_score == null ? 'Not recorded' : `${Number(data.faceVerification.similarity_score).toFixed(1)}%`}</p></div>
                <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Liveness</p><p className="mt-1 font-bold text-slate-900">{data.faceVerification.liveness_passed ? 'Passed' : 'Not passed'}</p></div>
              </div>
              <div className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
                <p className="text-sm font-semibold text-indigo-900">Recommendation: {formatLabel(data.faceVerification.verification_recommendation)}</p>
                <p className="mt-1 text-xs text-indigo-700">Liveness actions: {(data.faceVerification.liveness_actions ?? []).map(formatLabel).join(', ') || 'Not recorded'}</p>
              </div>
            </section>
          )}

          {data.faceVerification && (
            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Face verification result
                  </p>

                  <p className="mt-2 text-sm font-semibold text-slate-800">
                    {formatLabel(
                      (
                        data.faceVerification as FaceVerification & {
                          verification_status?: string | null;
                        }
                      ).verification_status,
                    )}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Match score
                  </p>

                  <p className="mt-2 text-sm font-semibold text-slate-800">
                    {(
                      data.faceVerification as FaceVerification & {
                        match_score?: number | null;
                      }
                    ).match_score != null
                      ? `${Math.round(
                          Number(
                            (
                              data.faceVerification as FaceVerification & {
                                match_score?: number | null;
                              }
                            ).match_score,
                          ) * 100,
                        )}%`
                      : 'Not available'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="mb-8 grid gap-6 lg:grid-cols-2">
          <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
                <User className="h-5 w-5" />
              </div>

              <div>
                <p className="text-sm font-semibold text-blue-700">
                  Resident details
                </p>
                <h2 className="text-lg font-bold text-slate-900">
                  Personal Information
                </h2>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <InfoItem
                label="First Name"
                value={resident.first_name}
                icon={Contact}
              />

              <InfoItem
                label="Middle Name"
                value={resident.middle_name || 'Not provided'}
                icon={Contact}
              />

              <InfoItem
                label="Last Name"
                value={resident.last_name}
                icon={Contact}
              />

              <InfoItem
                label="Suffix"
                value={resident.suffix || 'Not provided'}
                icon={Contact}
              />

              <InfoItem
                label="Birth Date"
                value={formatDate(resident.birth_date)}
                icon={CalendarDays}
              />

              <InfoItem label="Age" value={`${age} years old`} icon={User} />

              <InfoItem
                label="Birth Place"
                value={resident.birth_place || 'Not provided'}
                icon={MapPin}
              />

              <InfoItem
                label="Sex"
                value={formatLabel(resident.sex)}
                icon={User}
              />

              <InfoItem
                label="Civil Status"
                value={formatLabel(resident.civil_status)}
                icon={User}
              />

              <InfoItem
                label="Religion"
                value={resident.religion || 'Not provided'}
                icon={User}
              />

              <InfoItem
                label="Citizenship"
                value={resident.citizenship || 'Not provided'}
                icon={ShieldCheck}
              />

              <InfoItem
                label="PhilSys Number"
                value={resident.philsys_number || 'Not provided'}
                icon={FileCheck}
              />
            </div>
          </article>

          <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                <Phone className="h-5 w-5" />
              </div>

              <div>
                <p className="text-sm font-semibold text-emerald-700">
                  Communication
                </p>
                <h2 className="text-lg font-bold text-slate-900">
                  Contact and Address
                </h2>
              </div>
            </div>

            <div className="space-y-4">
              <InfoItem
                label="Residential Address"
                value={resident.residential_address}
                icon={Home}
                fullWidth
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <InfoItem
                  label="Contact Number"
                  value={resident.contact_number || 'Not provided'}
                  icon={Phone}
                />

                <InfoItem
                  label="Email Address"
                  value={resident.email_address || 'Not provided'}
                  icon={Mail}
                />

                <InfoItem
                  label="Region"
                  value={resident.region || 'Not provided'}
                  icon={MapPin}
                />

                <InfoItem
                  label="Province"
                  value={resident.province || 'Not provided'}
                  icon={MapPin}
                />

                <InfoItem
                  label="City / Municipality"
                  value={resident.city_municipality || 'Not provided'}
                  icon={MapPin}
                />

                <InfoItem
                  label="Barangay"
                  value={resident.barangay || 'Not provided'}
                  icon={MapPin}
                />
              </div>
            </div>
          </article>
        </section>

        <section className="mb-8 grid gap-6 lg:grid-cols-2">
          <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
                <GraduationCap className="h-5 w-5" />
              </div>

              <div>
                <p className="text-sm font-semibold text-violet-700">
                  Education record
                </p>
                <h2 className="text-lg font-bold text-slate-900">
                  Education Information
                </h2>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <InfoItem
                label="Highest Education"
                value={formatLabel(resident.highest_education)}
                icon={GraduationCap}
              />

              <InfoItem
                label="Education Status"
                value={formatLabel(resident.education_status)}
                icon={GraduationCap}
              />

              <InfoItem
                label="Vocational Course"
                value={resident.vocational_course || 'Not applicable'}
                icon={GraduationCap}
                fullWidth
              />
            </div>
          </article>

          <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-100 text-orange-700">
                <BriefcaseBusiness className="h-5 w-5" />
              </div>

              <div>
                <p className="text-sm font-semibold text-orange-700">
                  Household details
                </p>
                <h2 className="text-lg font-bold text-slate-900">
                  Occupation and Tenure
                </h2>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <InfoItem
                label="Occupation"
                value={resident.profession_occupation || 'Not provided'}
                icon={BriefcaseBusiness}
                fullWidth
              />

              <InfoItem
                label="Tenurial Status"
                value={formatLabel(resident.tenurial_status)}
                icon={Home}
              />

              <InfoItem
                label="Monthly Rent"
                value={formatCurrency(resident.monthly_rent)}
                icon={Home}
              />
            </div>
          </article>
        </section>

        {data.remarks.length > 0 && (
          <section className="mb-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="mb-6 flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-blue-700">
                  Review history
                </p>

                <h2 className="mt-1 text-xl font-bold text-slate-900">
                  Previous Remarks
                </h2>

                <p className="mt-2 text-sm text-slate-500">
                  Administrator messages previously added to this record.
                </p>
              </div>

              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
                <MessageSquare className="h-5 w-5" />
              </div>
            </div>

            <div className="space-y-4">
              {data.remarks.map((remark) => (
                <article
                  key={remark.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-5"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <span className="inline-flex w-fit rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-700 ring-1 ring-slate-200">
                      {formatLabel(remark.status_change)}
                    </span>

                    <span className="text-xs text-slate-500">
                      {formatDate(remark.created_at)}
                    </span>
                  </div>

                  <p className="mt-4 text-sm leading-6 text-slate-700">
                    {remark.remark_text}
                  </p>
                </article>
              ))}
            </div>
          </section>
        )}

        {resident.status === 'pending_review' ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-semibold text-blue-700">
                  Administrator decision
                </p>

                <h2 className="mt-1 text-xl font-bold text-slate-900">
                  Complete the census review
                </h2>

                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                  Approve the record when the submitted information is valid,
                  return it when corrections are needed, or reject it when the
                  submission cannot be accepted.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[510px]">
                <button
                  type="button"
                  onClick={() => openActionModal('approve')}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
                >
                  <CheckCircle2 className="h-5 w-5" />
                  Approve
                </button>

                <button
                  type="button"
                  onClick={() => openActionModal('return')}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-600"
                >
                  <AlertCircle className="h-5 w-5" />
                  Return
                </button>

                <button
                  type="button"
                  onClick={() => openActionModal('reject')}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-red-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700"
                >
                  <XCircle className="h-5 w-5" />
                  Reject
                </button>
              </div>
            </div>
          </section>
        ) : (
          <section
            className={`rounded-3xl border p-6 shadow-sm sm:p-8 ${status.panelClass}`}
          >
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/70">
                <ShieldCheck className="h-6 w-6" />
              </div>

              <div>
                <h2 className="text-lg font-bold">Review already completed</h2>

                <p className="mt-2 text-sm leading-6 opacity-80">
                  This record is currently marked as {status.label}. No further
                  review actions are available.
                </p>
              </div>
            </div>
          </section>
        )}
      </main>

      {showRemarksModal && selectedActionConfig && selectedAction && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeActionModal();
            }
          }}
        >
          <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-white/20 bg-white shadow-2xl">
            <div className="border-b border-slate-100 px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                      selectedAction === 'approve'
                        ? 'bg-emerald-100 text-emerald-700'
                        : selectedAction === 'return'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-red-100 text-red-700'
                    }`}
                  >
                    <selectedActionConfig.icon className="h-5 w-5" />
                  </div>

                  <div>
                    <h2 className="text-xl font-bold text-slate-900">
                      {selectedActionConfig.title}
                    </h2>

                    <p className="mt-1 text-sm leading-6 text-slate-500">
                      {selectedActionConfig.description}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={closeActionModal}
                  disabled={actionLoading}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="p-6">
              {error && (
                <div className="mb-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                  <p>{error}</p>
                </div>
              )}

              <label
                htmlFor="review-remarks"
                className="text-sm font-semibold text-slate-800"
              >
                Remarks
                {selectedAction !== 'approve' && (
                  <span className="ml-1 text-red-500">*</span>
                )}
              </label>

              <p className="mt-1 text-xs leading-5 text-slate-500">
                {selectedAction === 'approve'
                  ? 'Remarks are optional for approved records.'
                  : 'Explain what the resident needs to correct or why the submission is rejected.'}
              </p>

              <textarea
                id="review-remarks"
                value={remarkText}
                onChange={(event) => setRemarkText(event.target.value)}
                placeholder={
                  selectedAction === 'approve'
                    ? 'Optional approval message'
                    : 'Enter clear remarks for the resident'
                }
                className="mt-3 min-h-[150px] w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
              />

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={closeActionModal}
                  disabled={actionLoading}
                  className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleAction}
                  disabled={actionLoading}
                  className={`inline-flex h-12 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${selectedActionConfig.confirmClass}`}
                >
                  {actionLoading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <selectedActionConfig.icon className="h-5 w-5" />
                      {selectedActionConfig.confirmLabel}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {previewImage && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setPreviewImage(null);
            }
          }}
        >
          <div className="flex max-h-[95vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 text-white">
              <div className="flex items-center gap-3">
                <Eye className="h-5 w-5 text-blue-300" />
                <h2 className="font-semibold">{previewImage.title}</h2>
              </div>

              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-300 transition hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4 sm:p-6">
              <img
                src={previewImage.url}
                alt={previewImage.title}
                className="max-h-[80vh] max-w-full rounded-2xl object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface InfoItemProps {
  label: string;
  value: string | number;
  icon: typeof User;
  fullWidth?: boolean;
}

function InfoItem({
  label,
  value,
  icon: Icon,
  fullWidth = false,
}: InfoItemProps) {
  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-slate-50 p-4 ${
        fullWidth ? 'sm:col-span-2' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-200">
          <Icon className="h-4 w-4" />
        </div>

        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
            {label}
          </p>

          <p className="mt-1 break-words text-sm font-semibold leading-6 text-slate-800">
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}
