import { useState } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, Camera, CheckCircle2, FileImage, Loader2, ShieldCheck, Upload, X } from 'lucide-react';

import FaceIdentityVerification, { type FaceVerificationResult } from '../components/FaceIdentityVerification';
import IdCameraCapture from '../components/IdCameraCapture';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

interface RegistrationProps { email: string; onDashboard: () => void; onBack: () => void; }
type RegistrationField = 'idType' | 'frontImage' | 'backImage';

interface StoredVerification {
  userId: string;
  idType: string;
  frontImagePath: string;
  backImagePath: string;
  capturedFacePath: string | null;
  isMatched: boolean;
  matchDistance: number;
  similarityScore: number;
  livenessPassed: boolean;
  livenessActions: FaceVerificationResult['livenessActions'];
  recommendation: FaceVerificationResult['recommendation'];
  verificationStatus: FaceVerificationResult['verificationStatus'];
  verificationReason?: string;
  deviceType: FaceVerificationResult['deviceType'];
  idQuality: FaceVerificationResult['idQuality'];
}

const STORAGE_BUCKET = 'resident-verification';
const ID_TYPES = ['PhilSys ID', "Driver's License", 'Passport', 'UMID', 'Postal ID', "Voter's ID"];

function fileExtension(file: File) {
  const fromName = file.name.split('.').pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  return file.type === 'image/png' ? 'png' : 'jpg';
}

function validateImage(file: File) {
  if (!file.type.startsWith('image/')) throw new Error('Select a valid image file.');
  if (file.size > 8 * 1024 * 1024) throw new Error('Each image must be 8 MB or smaller.');
}

export default function ResidentRegistration({ onDashboard, onBack }: RegistrationProps) {
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [idType, setIdType] = useState('');
  const [frontImage, setFrontImage] = useState<File | null>(null);
  const [backImage, setBackImage] = useState<File | null>(null);
  const [frontPreview, setFrontPreview] = useState('');
  const [backPreview, setBackPreview] = useState('');
  const [verification, setVerification] = useState<FaceVerificationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<RegistrationField, string>>>({});

  function replaceImage(file: File, currentPreview: string, setFile: (value: File | null) => void, setPreview: (value: string) => void, field: RegistrationField) {
    try {
      validateImage(file);
      if (currentPreview.startsWith('blob:')) URL.revokeObjectURL(currentPreview);
      setFile(file);
      setPreview(URL.createObjectURL(file));
      setVerification(null);
      setFieldErrors((current) => ({ ...current, [field]: undefined }));
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to use that image.');
    }
  }

  function removeImage(currentPreview: string, setFile: (value: File | null) => void, setPreview: (value: string) => void) {
    if (currentPreview.startsWith('blob:')) URL.revokeObjectURL(currentPreview);
    setFile(null);
    setPreview('');
    setVerification(null);
  }

  function goToVerification() {
    const nextErrors: Partial<Record<RegistrationField, string>> = {};
    if (!idType) nextErrors.idType = 'Select an ID type.';
    if (!frontImage) nextErrors.frontImage = 'Provide the front of the ID.';
    if (!backImage) nextErrors.backImage = 'Provide the back of the ID.';
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setError('Complete all required ID fields before continuing.');
      return;
    }
    setError('');
    setStep(2);
  }

  async function uploadFile(file: File, path: string, uploadedPaths: string[]) {
    const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, {
      contentType: file.type || 'image/jpeg',
      upsert: false,
    });
    if (uploadError) throw uploadError;
    uploadedPaths.push(path);
    return path;
  }

  async function saveVerification() {
    if (!user || !frontImage || !backImage || !verification) {
      setError('Complete the ID and live verification first.');
      return;
    }
    if (verification.verificationStatus === 'passed' && !verification.livenessPassed) {
      setError('The live verification result is incomplete. Restart verification.');
      return;
    }
    setLoading(true);
    setError('');
    const uploadedPaths: string[] = [];
    try {
      const { data: existing, error: lookupError } = await supabase.from('residents').select('id').eq('user_id', user.id).maybeSingle();
      if (lookupError) throw lookupError;
      if (existing) throw new Error('This account already has a resident census record. Open your dashboard instead.');

      const folder = `${user.id}/${crypto.randomUUID()}`;
      const frontImagePath = await uploadFile(frontImage, `${folder}/id-front.${fileExtension(frontImage)}`, uploadedPaths);
      const backImagePath = await uploadFile(backImage, `${folder}/id-back.${fileExtension(backImage)}`, uploadedPaths);
      const capturedFacePath = verification.file ? await uploadFile(verification.file, `${folder}/captured-face.jpg`, uploadedPaths) : null;

      const stored: StoredVerification = {
        userId: user.id,
        idType,
        frontImagePath,
        backImagePath,
        capturedFacePath,
        isMatched: verification.matched,
        matchDistance: verification.matchDistance,
        similarityScore: verification.similarityScore,
        livenessPassed: verification.livenessPassed,
        livenessActions: verification.livenessActions,
        recommendation: verification.recommendation,
        verificationStatus: verification.verificationStatus,
        verificationReason: verification.verificationReason,
        deviceType: verification.deviceType,
        idQuality: verification.idQuality,
      };
      sessionStorage.removeItem('pendingResidentVerification');
      sessionStorage.setItem(`pendingResidentVerification:${user.id}`, JSON.stringify(stored));
      setComplete(true);
      setStep(3);
    } catch (caught) {
      if (uploadedPaths.length > 0) await supabase.storage.from(STORAGE_BUCKET).remove(uploadedPaths);
      setError(caught instanceof Error ? caught.message : 'Unable to save the verification files.');
    } finally {
      setLoading(false);
    }
  }

  function imageField(title: string, field: 'frontImage' | 'backImage', image: File | null, preview: string, setImage: (value: File | null) => void, setPreview: (value: string) => void) {
    return (
      <div className={`rounded-2xl border-2 p-4 ${fieldErrors[field] ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-slate-50'}`}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <label className="font-bold text-slate-800">{title} <span className="text-red-600">*</span></label>
          {image && <button type="button" onClick={() => removeImage(preview, setImage, setPreview)} className="rounded-lg p-1 text-slate-500 hover:bg-white hover:text-red-600" aria-label={`Remove ${title}`}><X size={18} /></button>}
        </div>
        {preview ? <img src={preview} alt={`${title} preview`} className="h-52 w-full rounded-xl bg-white object-contain" /> : <div className="flex h-36 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-slate-400"><FileImage size={38} /></div>}
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
            <Upload size={17} />Upload image
            <input type="file" accept="image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) replaceImage(file, preview, setImage, setPreview, field); event.currentTarget.value = ''; }} />
          </label>
          <IdCameraCapture side={field === 'frontImage' ? 'front' : 'back'} onCapture={(file) => replaceImage(file, preview, setImage, setPreview, field)} />
        </div>
        {fieldErrors[field] && <p className="mt-2 text-sm font-medium text-red-700">{fieldErrors[field]}</p>}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <button type="button" onClick={step === 1 ? onBack : () => setStep((current) => Math.max(1, current - 1))} className="mb-5 inline-flex items-center gap-2 font-semibold text-slate-600 hover:text-slate-900"><ArrowLeft size={19} />Back</button>
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
          <div className="bg-gradient-to-r from-blue-800 to-blue-600 px-6 py-7 text-white sm:px-8">
            <div className="flex items-center gap-3"><div className="rounded-xl bg-white/15 p-3"><ShieldCheck size={28} /></div><div><h1 className="text-2xl font-bold">Resident identity verification</h1><p className="mt-1 text-sm text-blue-100">Securely verify your government ID and live identity before the census form.</p></div></div>
            <div className="mt-6 grid grid-cols-3 gap-2 text-center text-xs font-bold sm:text-sm">{['Government ID', 'Live verification', 'Complete'].map((label, index) => <div key={label} className={`rounded-xl px-2 py-2 ${step >= index + 1 ? 'bg-white text-blue-800' : 'bg-white/10 text-blue-100'}`}>{index + 1}. {label}</div>)}</div>
          </div>
          <div className="p-6 sm:p-8">
            {error && <div className="mb-5 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><AlertCircle className="shrink-0" size={19} />{error}</div>}
            {step === 1 && <div className="space-y-5">
              <div><label className="mb-2 block font-bold text-slate-800">Government ID type <span className="text-red-600">*</span></label><select value={idType} onChange={(event) => { setIdType(event.target.value); setFieldErrors((current) => ({ ...current, idType: undefined })); }} className={`w-full rounded-xl border px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 ${fieldErrors.idType ? 'border-red-500 bg-red-50' : 'border-slate-300'}`}><option value="">Select ID type</option>{ID_TYPES.map((item) => <option key={item}>{item}</option>)}</select>{fieldErrors.idType && <p className="mt-1 text-sm text-red-700">{fieldErrors.idType}</p>}</div>
              <div className="grid gap-5 md:grid-cols-2">{imageField('ID front', 'frontImage', frontImage, frontPreview, setFrontImage, setFrontPreview)}{imageField('ID back', 'backImage', backImage, backPreview, setBackImage, setBackPreview)}</div>
              <button type="button" onClick={goToVerification} className="ml-auto flex items-center gap-2 rounded-xl bg-blue-700 px-5 py-3 font-bold text-white hover:bg-blue-800">Continue to live verification<ArrowRight size={18} /></button>
            </div>}
            {step === 2 && <div className="space-y-5">
              <FaceIdentityVerification idFrontFile={frontImage} idFrontPreview={frontPreview} onVerified={setVerification} onReset={() => setVerification(null)} />
              <button type="button" disabled={!verification || loading} onClick={() => void saveVerification()} className="ml-auto flex items-center gap-2 rounded-xl bg-blue-700 px-5 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{loading ? <Loader2 className="animate-spin" size={18} /> : <Camera size={18} />}Save verification and continue</button>
            </div>}
            {step === 3 && complete && <div className="py-8 text-center"><CheckCircle2 className="mx-auto text-emerald-600" size={64} /><h2 className="mt-4 text-2xl font-bold text-slate-900">Identity files saved</h2><p className="mx-auto mt-2 max-w-lg text-slate-600">Continue to the census form. Your final identity and census information will still be available for administrator checking.</p><button type="button" onClick={onDashboard} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 font-bold text-white hover:bg-emerald-700">Continue to census form<ArrowRight size={18} /></button></div>}
          </div>
        </div>
      </div>
    </div>
  );
}
