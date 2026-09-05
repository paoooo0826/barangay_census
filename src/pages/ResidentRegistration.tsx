import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Camera,
  CheckCircle2,
  FileImage,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import * as faceapi from 'face-api.js';

import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import IdCameraCapture from '../components/IdCameraCapture';

interface RegistrationProps {
  email: string;
  onDashboard: () => void;
  onBack: () => void;
}

interface StoredVerification {
  idType: string;
  frontImagePath: string;
  backImagePath: string;
  capturedFacePath: string;
  isMatched: boolean;
  matchDistance: number;
}

type RegistrationField = 'idType' | 'frontImage' | 'backImage';

const STORAGE_BUCKET = 'resident-verification';
const MODEL_URL =
  'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';
const MATCH_THRESHOLD = 0.55;

export default function ResidentRegistration({
  onDashboard,
  onBack,
}: RegistrationProps) {
  const { user } = useAuth();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fullscreenRequestedRef = useRef(false);

  const [step, setStep] = useState(1);
  const [idType, setIdType] = useState('');
  const [frontImage, setFrontImage] = useState<File | null>(null);
  const [backImage, setBackImage] = useState<File | null>(null);
  const [frontPreview, setFrontPreview] = useState('');
  const [backPreview, setBackPreview] = useState('');
  const [facePreview, setFacePreview] = useState('');
  const [capturedFace, setCapturedFace] = useState<Blob | null>(null);
  const [matchDistance, setMatchDistance] = useState<number | null>(null);
  const [modelsReady, setModelsReady] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [verificationPassed, setVerificationPassed] = useState(false);
  const [duplicateChecked, setDuplicateChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<RegistrationField, string>>
  >({});

  const clearFieldError = (field: RegistrationField) => {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  useEffect(() => {
    return () => {
      stopCamera();
      exitBrowserFullscreen();
      if (frontPreview) URL.revokeObjectURL(frontPreview);
      if (backPreview) URL.revokeObjectURL(backPreview);
      if (facePreview) URL.revokeObjectURL(facePreview);
    };
  }, [frontPreview, backPreview, facePreview]);

  useEffect(() => {
    if (step !== 2) {
      stopCamera();
      return;
    }

    void prepareFaceVerification();
  }, [step]);

  useEffect(() => {
    if (!cameraReady) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [cameraReady]);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraReady(false);
  };

  const enterBrowserFullscreen = async () => {
    if (document.fullscreenElement || !document.documentElement.requestFullscreen) return;
    try {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      fullscreenRequestedRef.current = true;
    } catch {
      fullscreenRequestedRef.current = false;
    }
  };

  const exitBrowserFullscreen = () => {
    if (!fullscreenRequestedRef.current) return;
    fullscreenRequestedRef.current = false;
    if (document.fullscreenElement && document.exitFullscreen) {
      void document.exitFullscreen().catch(() => undefined);
    }
  };

  const loadModels = async () => {
    if (modelsReady) return;

    setStatusText('Loading face verification models...');
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    setModelsReady(true);
  };

  const startCamera = async () => {
    stopCamera();

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera access is not supported by this browser.');
    }

    setStatusText('Requesting camera permission...');
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 720 },
        height: { ideal: 720 },
      },
      audio: false,
    });

    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }
    setCameraReady(true);
    setStatusText('Position your face inside the camera frame.');
  };

  const prepareFaceVerification = async () => {
    setError('');
    setLoading(true);

    try {
      await loadModels();
      await startCamera();
    } catch (caughtError) {
      exitBrowserFullscreen();
      console.error(caughtError);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Unable to start face verification.',
      );
    } finally {
      setLoading(false);
    }
  };

  const updateImageFile = (
    file: File | undefined,
    side: 'front' | 'back',
  ) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file.');
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setError('Each image must be smaller than 8 MB.');
      return;
    }

    setError('');
    const preview = URL.createObjectURL(file);

    if (side === 'front') {
      if (frontPreview) URL.revokeObjectURL(frontPreview);
      setFrontImage(file);
      setFrontPreview(preview);
      setVerificationPassed(false);
      setCapturedFace(null);
      setMatchDistance(null);
      clearFieldError('frontImage');
    } else {
      if (backPreview) URL.revokeObjectURL(backPreview);
      setBackImage(file);
      setBackPreview(preview);
      clearFieldError('backImage');
    }
  };

  const captureAndVerifyFace = async () => {
    if (!frontImage) {
      setError('Upload the front of your government ID first.');
      return;
    }

    if (!videoRef.current || !canvasRef.current || !cameraReady) {
      setError('The camera is not ready yet.');
      return;
    }

    setError('');
    setLoading(true);
    setVerificationPassed(false);
    setStatusText('Capturing and comparing faces...');

    try {
      await loadModels();

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const width = video.videoWidth || 640;
      const height = video.videoHeight || 480;
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext('2d');
      if (!context) throw new Error('Unable to capture the camera image.');

      context.drawImage(video, 0, 0, width, height);
      const faceBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('Capture failed.'))),
          'image/jpeg',
          0.9,
        );
      });

      const idElement = await faceapi.bufferToImage(frontImage);
      const faceElement = await faceapi.bufferToImage(faceBlob);
      const detectorOptions = new faceapi.TinyFaceDetectorOptions({
        inputSize: 416,
        scoreThreshold: 0.5,
      });

      const idFaces = await faceapi
        .detectAllFaces(idElement, detectorOptions)
        .withFaceLandmarks()
        .withFaceDescriptors();
      const capturedFaces = await faceapi
        .detectAllFaces(faceElement, detectorOptions)
        .withFaceLandmarks()
        .withFaceDescriptors();

      if (idFaces.length !== 1) {
        throw new Error(
          idFaces.length === 0
            ? 'No clear face was detected on the front of the ID.'
            : 'Multiple faces were detected on the ID image. Upload a clearer ID photo.',
        );
      }

      if (capturedFaces.length !== 1) {
        throw new Error(
          capturedFaces.length === 0
            ? 'No face was detected by the camera. Face the camera and try again.'
            : 'Multiple faces were detected. Only the applicant should be visible.',
        );
      }

      const distance = faceapi.euclideanDistance(
        idFaces[0].descriptor,
        capturedFaces[0].descriptor,
      );
      const matched = distance <= MATCH_THRESHOLD;

      if (facePreview) URL.revokeObjectURL(facePreview);
      setCapturedFace(faceBlob);
      setFacePreview(URL.createObjectURL(faceBlob));
      setMatchDistance(distance);
      setVerificationPassed(matched);

      if (!matched) {
        throw new Error(
          'The captured face does not closely match the ID photo. Improve the lighting and try again.',
        );
      }

      setStatusText('Face verification passed.');
      stopCamera();
      exitBrowserFullscreen();
    } catch (caughtError) {
      console.error(caughtError);
      setVerificationPassed(false);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Face verification failed.',
      );
    } finally {
      setLoading(false);
    }
  };

  const uploadVerificationFile = async (
    file: File | Blob,
    path: string,
    contentType: string,
  ) => {
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, file, {
        contentType,
        upsert: true,
      });

    if (uploadError) throw uploadError;
    return path;
  };

  const performDuplicateCheckAndUpload = async () => {
    if (!user) {
      setError('Your login session has expired. Please sign in again.');
      return;
    }

    if (!frontImage || !backImage || !capturedFace || !verificationPassed) {
      setError('Complete the ID and face verification before continuing.');
      return;
    }

    setError('');
    setLoading(true);
    setStatusText('Checking for an existing census record...');

    try {
      const { data: existingResident, error: duplicateError } = await supabase
        .from('residents')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (duplicateError) throw duplicateError;
      if (existingResident) {
        throw new Error(
          'A census record already exists for this account. Use Update Census from the resident dashboard.',
        );
      }

      setStatusText('Uploading verification images securely...');
      const uniqueFolder = `${user.id}/${Date.now()}`;
      const frontExtension = frontImage.name.split('.').pop() || 'jpg';
      const backExtension = backImage.name.split('.').pop() || 'jpg';

      const [frontImagePath, backImagePath, capturedFacePath] = await Promise.all([
        uploadVerificationFile(
          frontImage,
          `${uniqueFolder}/id-front.${frontExtension}`,
          frontImage.type || 'image/jpeg',
        ),
        uploadVerificationFile(
          backImage,
          `${uniqueFolder}/id-back.${backExtension}`,
          backImage.type || 'image/jpeg',
        ),
        uploadVerificationFile(
          capturedFace,
          `${uniqueFolder}/captured-face.jpg`,
          'image/jpeg',
        ),
      ]);

      const verification: StoredVerification = {
        idType,
        frontImagePath,
        backImagePath,
        capturedFacePath,
        isMatched: true,
        matchDistance: matchDistance ?? 0,
      };

      window.sessionStorage.setItem(
        'pendingResidentVerification',
        JSON.stringify(verification),
      );
      setDuplicateChecked(true);
      setStatusText('No duplicate record was found. Verification files are ready.');
    } catch (caughtError) {
      console.error(caughtError);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Unable to complete the duplicate record check.',
      );
    } finally {
      setLoading(false);
    }
  };

  const nextStep = () => {
    setError('');

    if (step === 1) {
      const missingFields: Partial<Record<RegistrationField, string>> = {};
      if (!idType) missingFields.idType = 'Government ID type is required.';
      if (!frontImage) missingFields.frontImage = 'Upload the front of your government ID.';
      if (!backImage) missingFields.backImage = 'Upload the back of your government ID.';

      if (Object.keys(missingFields).length > 0) {
        setFieldErrors(missingFields);
        setError('Please complete the required fields highlighted below.');
        return;
      }
      setFieldErrors({});
      void enterBrowserFullscreen();
      setStep(2);
      return;
    }

    if (step === 2) {
      if (!verificationPassed) {
        setError('Complete face verification before continuing.');
        return;
      }
      setStep(3);
    }
  };

  const goBack = () => {
    setError('');
    if (step === 2) exitBrowserFullscreen();
    if (step === 1) onBack();
    else setStep((current) => current - 1);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 p-4 sm:p-6">
      <div className="mx-auto w-full max-w-3xl py-4 sm:py-8">
        <button
          type="button"
          onClick={goBack}
          className="mb-6 inline-flex items-center gap-2 rounded-xl px-2 py-2 text-sm font-medium text-slate-600 transition hover:bg-white hover:text-blue-700"
        >
          <ArrowLeft size={19} />
          Back
        </button>

        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60">
          <div className="border-b border-slate-200 bg-gradient-to-r from-blue-700 to-blue-600 px-6 py-7 text-white sm:px-9">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-blue-100">Identity verification</p>
                <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Resident Registration</h1>
                <p className="mt-2 max-w-xl text-sm text-blue-100">
                  Verify your government ID and face before completing the census form.
                </p>
              </div>
              <ShieldCheck className="hidden h-12 w-12 text-blue-100 sm:block" />
            </div>
          </div>

          <div className="px-6 py-7 sm:px-9 sm:py-9">
            <div className="mb-8 grid grid-cols-4 gap-2">
              {[1, 2, 3, 4].map((number) => (
                <div key={number} className="text-center">
                  <div
                    className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${
                      number <= step
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    {number < step ? <CheckCircle2 size={18} /> : number}
                  </div>
                  <div
                    className={`mx-auto mt-2 h-1 rounded-full ${
                      number <= step ? 'bg-blue-600' : 'bg-slate-100'
                    }`}
                  />
                </div>
              ))}
            </div>

            {error && (
              <div className="mb-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {step === 1 && (
              <section>
                <h2 className="text-xl font-bold text-slate-900">Government ID</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Upload clear images. The front must show the ID holder's face.
                </p>

                <div className="mt-6">
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Government ID type <span className="text-red-600" aria-hidden="true">*</span>
                  </label>
                  <select
                    value={idType}
                    onChange={(event) => {
                      setIdType(event.target.value);
                      clearFieldError('idType');
                    }}
                    className={`h-12 w-full rounded-xl border bg-white px-4 text-slate-900 outline-none transition ${
                      fieldErrors.idType
                        ? 'border-red-500 bg-red-50 focus:border-red-500 focus:ring-4 focus:ring-red-100'
                        : 'border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-100'
                    }`}
                    aria-invalid={Boolean(fieldErrors.idType)}
                  >
                    <option value="">Select ID type</option>
                    <option value="PhilSys ID">PhilSys ID</option>
                    <option value="Driver's License">Driver's License</option>
                    <option value="Passport">Passport</option>
                    <option value="UMID">UMID</option>
                    <option value="Postal ID">Postal ID</option>
                    <option value="Voter's ID">Voter's ID</option>
                  </select>
                  {fieldErrors.idType && (
                    <p className="mt-1.5 text-xs font-semibold text-red-600">{fieldErrors.idType}</p>
                  )}
                </div>

                <div className="mt-6 grid gap-5 md:grid-cols-2">
                  {(['front', 'back'] as const).map((side) => {
                    const preview = side === 'front' ? frontPreview : backPreview;
                    const file = side === 'front' ? frontImage : backImage;
                    return (
                      <div
                        key={side}
                        className={`overflow-hidden rounded-2xl border-2 border-dashed p-4 text-center transition ${
                          fieldErrors[side === 'front' ? 'frontImage' : 'backImage']
                            ? 'border-red-500 bg-red-50'
                            : 'border-slate-300 bg-slate-50'
                        }`}
                      >
                        {preview ? (
                          <img
                            src={preview}
                            alt={`${side} of government ID`}
                            className="h-48 w-full rounded-xl bg-white object-contain"
                          />
                        ) : (
                          <div className="flex h-48 flex-col items-center justify-center rounded-xl bg-white">
                            <div className="rounded-2xl bg-white p-4 text-blue-600 shadow-sm">
                              <FileImage size={34} />
                            </div>
                            <p className="mt-4 font-semibold text-slate-800">
                              ID {side} <span className="text-red-600" aria-hidden="true">*</span>
                            </p>
                            <p className="mt-1 text-xs text-slate-500">Upload a file or take a live photo</p>
                          </div>
                        )}

                        {file && (
                          <p className="mt-2 truncate text-xs font-medium text-slate-600">{file.name}</p>
                        )}

                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-100">
                            <Upload size={18} />
                            {preview ? 'Replace file' : 'Upload file'}
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              onChange={(event) => updateImageFile(event.target.files?.[0], side)}
                              className="hidden"
                            />
                          </label>
                          <IdCameraCapture
                            side={side}
                            disabled={loading}
                            onCapture={(capturedFile) => updateImageFile(capturedFile, side)}
                          />
                        </div>

                        {fieldErrors[side === 'front' ? 'frontImage' : 'backImage'] && !preview && (
                          <p className="mt-3 text-xs font-semibold text-red-600">
                            {fieldErrors[side === 'front' ? 'frontImage' : 'backImage']}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {step === 2 && (
              <section>
                <h2 className="text-xl font-bold text-slate-900">Face Verification</h2>
                <p className="mt-1 text-sm text-slate-500">
                  The camera image is compared with the face detected on your ID.
                </p>

                <div className="mt-6 grid gap-5 md:grid-cols-2">
                  <div className={cameraReady ? 'fixed inset-0 z-[200] flex flex-col bg-slate-950 p-3 sm:p-5' : 'overflow-hidden rounded-2xl border border-slate-200 bg-slate-950'}>
                    {cameraReady && (
                      <div className="mb-3 flex items-start justify-between gap-3 text-white">
                        <div>
                          <p className="text-sm font-bold sm:text-base">Full-screen face verification</p>
                          <p className="mt-1 text-xs text-slate-300 sm:text-sm">{statusText}</p>
                          {error && <p className="mt-1 text-xs font-semibold text-red-300 sm:text-sm">{error}</p>}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            stopCamera();
                            exitBrowserFullscreen();
                          }}
                          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm font-bold text-white transition hover:bg-white/20"
                          aria-label="Exit full-screen camera"
                        >
                          <X size={18} />
                          <span className="hidden sm:inline">Exit camera</span>
                        </button>
                      </div>
                    )}
                    <div className={cameraReady ? 'relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/20 bg-black' : 'relative aspect-square'}>
                      <video
                        ref={videoRef}
                        muted
                        playsInline
                        className={cameraReady ? 'h-full w-full scale-x-[-1] object-contain' : 'h-full w-full scale-x-[-1] object-cover'}
                      />
                      {!cameraReady && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300">
                          {loading ? (
                            <Loader2 className="animate-spin" size={42} />
                          ) : (
                            <Camera size={48} />
                          )}
                          <p className="mt-3 px-4 text-center text-sm">{statusText}</p>
                        </div>
                      )}
                      <div className="pointer-events-none absolute inset-[12%] rounded-[45%] border-2 border-dashed border-white/70" />
                    </div>
                    {cameraReady && (
                      <button
                        type="button"
                        onClick={() => void captureAndVerifyFace()}
                        disabled={loading}
                        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 sm:mx-auto sm:w-auto sm:min-w-64"
                      >
                        {loading ? <Loader2 className="animate-spin" size={19} /> : <Camera size={19} />}
                        Capture and verify
                      </button>
                    )}
                  </div>

                  <div className="flex min-h-64 flex-col rounded-2xl border border-slate-200 bg-slate-50 p-5">
                    <p className="text-sm font-semibold text-slate-700">Captured result</p>
                    {facePreview ? (
                      <img
                        src={facePreview}
                        alt="Captured applicant face"
                        className="mt-3 aspect-square w-full rounded-xl object-cover"
                      />
                    ) : (
                      <div className="mt-3 flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-slate-400">
                        <Camera size={42} />
                      </div>
                    )}

                    {matchDistance !== null && (
                      <div
                        className={`mt-3 rounded-xl px-3 py-2 text-sm font-semibold ${
                          verificationPassed
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {verificationPassed ? 'Face matched' : 'Face did not match'} · score{' '}
                        {(1 - Math.min(matchDistance, 1)).toLocaleString(undefined, {
                          style: 'percent',
                          maximumFractionDigits: 1,
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <canvas ref={canvasRef} className="hidden" />

                <div className="mt-5 flex flex-wrap gap-3">
                  {!cameraReady && !loading && (
                    <button
                      type="button"
                      onClick={() => void prepareFaceVerification()}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      <RefreshCw size={18} />
                      Restart camera
                    </button>
                  )}
                </div>
              </section>
            )}

            {step === 3 && (
              <section className="py-4 text-center">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-blue-100 text-blue-700">
                  {duplicateChecked ? (
                    <CheckCircle2 size={42} />
                  ) : loading ? (
                    <Loader2 className="animate-spin" size={42} />
                  ) : (
                    <ShieldCheck size={42} />
                  )}
                </div>
                <h2 className="mt-5 text-xl font-bold text-slate-900">Duplicate Record Check</h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
                  We check whether this authenticated account already has a census record, then securely upload the verification images.
                </p>

                <button
                  type="button"
                  onClick={() => void performDuplicateCheckAndUpload()}
                  disabled={loading || duplicateChecked}
                  className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? <Loader2 className="animate-spin" size={19} /> : <Upload size={19} />}
                  {duplicateChecked ? 'Verification ready' : 'Check records and upload'}
                </button>

                {statusText && (
                  <p className="mt-4 text-sm font-medium text-slate-600">{statusText}</p>
                )}
              </section>
            )}

            {step === 4 && (
              <section className="py-6 text-center">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-100 text-emerald-700">
                  <CheckCircle2 size={46} />
                </div>
                <h2 className="mt-5 text-2xl font-bold text-slate-900">Verification Complete</h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
                  Your ID and face verification are ready. Continue to complete your census information.
                </p>
                <button
                  type="button"
                  onClick={onDashboard}
                  className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-700"
                >
                  Continue to census form
                  <ArrowRight size={19} />
                </button>
              </section>
            )}

            {step < 4 && (
              <div className="mt-9 flex items-center justify-between border-t border-slate-200 pt-6">
                <button
                  type="button"
                  onClick={goBack}
                  className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Back
                </button>

                {step < 3 && (
                  <button
                    type="button"
                    onClick={nextStep}
                    disabled={loading}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
                  >
                    Next
                    <ArrowRight size={19} />
                  </button>
                )}

                {step === 3 && duplicateChecked && (
                  <button
                    type="button"
                    onClick={() => setStep(4)}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 font-semibold text-white transition hover:bg-blue-700"
                  >
                    Proceed
                    <ArrowRight size={19} />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
