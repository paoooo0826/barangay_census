import { useState, useEffect, useCallback } from 'react';
import {
  Send,
  AlertCircle,
  Loader2,
  ArrowLeft,
  Save,
  Upload,
  Image as ImageIcon,
  X,
  ShieldCheck,
  CreditCard,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import type { CategoryRow, EducationLevel, EducationStatus } from '../types/database';
import FaceIdentityVerification, { type FaceVerificationResult } from '../components/FaceIdentityVerification';


type Sex = 'Male' | 'Female';

type CivilStatus =
  | 'Single'
  | 'Married'
  | 'Widowed'
  | 'Divorced'
  | 'Separated';

type TenurialStatus =
  | 'House Owner'
  | 'Sharer'
  | 'Caretaker'
  | 'Renter';



interface StoredVerification {
  idType: string;
  frontImagePath: string;
  backImagePath: string;
  capturedFacePath?: string;
  isMatched: boolean;
  matchDistance: number;
  similarityScore?: number;
  livenessPassed?: boolean;
  livenessActions?: string[];
  recommendation?: string;
  idQuality?: Record<string, number>;
  verificationStatus?: 'passed' | 'skipped';
  verificationReason?: string;
  deviceType?: string;
}

interface CensusFormProps {
  onDashboard: () => void;
  onLogout: () => void;
}


interface CensusFormData {
  region: string;
  province: string;
  city_municipality: string;
  barangay: string;

  philsys_number: string;

  last_name: string;
  suffix: string;
  first_name: string;
  middle_name: string;

  birth_date: string;
  birth_place: string;

  sex: 'Male' | 'Female';
  civil_status: CivilStatus | '';

  religion: string;
  residential_address: string;
  citizenship: string;

  profession_occupation: string;
  contact_number: string;
  email_address: string;

  highest_education: EducationLevel | '';
  education_status: EducationStatus | '';
  vocational_course: string;

  tenurial_status: TenurialStatus | '';
  monthly_rent: string;

  categories: number[];

  indigenous_group: string;
  other_description: string;
}



const initialFormData: CensusFormData = {

  region: 'Cordillera Administrative Region (CAR)',
  province: 'Benguet',
  city_municipality: 'Baguio City',
  barangay: 'Old Lucban',

  philsys_number: '',

  last_name: '',
  suffix: '',
  first_name: '',
  middle_name: '',

  birth_date: '',
  birth_place: '',

  sex: 'Male',
civil_status: '', 

  religion: '',
  residential_address: '',
  citizenship: 'Filipino',

  profession_occupation: '',
  contact_number: '',
  email_address: '',

  highest_education: '',
  education_status: '',
  vocational_course: '',

  tenurial_status: '',
  monthly_rent: '',

  categories: [],

  indigenous_group: '',
  other_description: '',
};



const SEX_OPTIONS: Sex[] = [
  'Male',
  'Female',
];


const CIVIL_STATUS_OPTIONS: CivilStatus[] = [
  'Single',
  'Married',
  'Widowed',
  'Divorced',
  'Separated',
];


const EDUCATION_OPTIONS: EducationLevel[] = [
  'No Formal Education',
  'Pre-School',
  'Kindergarten',
  'Elementary',
  'High School',
  'Junior High School',
  'Senior High School',
  'Vocational',
  'College',
  'Post Graduate',
  "Master's Degree",
  'Doctorate',
];


const EDUCATION_STATUS_OPTIONS: EducationStatus[] = [
  'Currently Studying',
  'Completed',
  'Not Currently Studying',
  'No Formal Education',
];


const TENURIAL_STATUS_OPTIONS: TenurialStatus[] = [
  'House Owner',
  'Sharer',
  'Caretaker',
  'Renter',
];

const GOVERNMENT_ID_OPTIONS = [
  'PhilSys ID',
  "Driver's License",
  'Passport',
  'UMID',
  'Postal ID',
  "Voter's ID",
] as const;



const CATEGORY_CONFIG = {

  main: [
    'Senior Citizen',
    'Youth',
    'PWD',
    'FHONA',
  ],

  other: [
    '4Ps Beneficiary',
    'Solo Parent',
    'Child-Headed Family',
    'Indigenous People (IP)',
    'Others',
  ],

};



export default function CensusForm({
  onDashboard,
}: CensusFormProps) {
const [categories, setCategories] =
  useState<CategoryRow[]>([]);

  const { user } = useAuth();


  const [formData, setFormData] =
    useState<CensusFormData>(initialFormData);




  const [loading, setLoading] =
    useState(false);


  const [error, setError] =
    useState<string | null>(null);


  const [trackingNumber, setTrackingNumber] =
    useState<string | null>(null);

  const [residentId, setResidentId] =
    useState<string | null>(null);

  const [loadingExisting, setLoadingExisting] =
    useState(false);

  const [householdPhoto, setHouseholdPhoto] = useState<File | null>(null);
  const [householdPhotoPreview, setHouseholdPhotoPreview] = useState('');
  const [existingHouseholdPhotoPath, setExistingHouseholdPhotoPath] = useState<string | null>(null);

  const [governmentIdType, setGovernmentIdType] = useState('');
  const [otherGovernmentIdType, setOtherGovernmentIdType] = useState('');
  const [governmentIdFront, setGovernmentIdFront] = useState<File | null>(null);
  const [governmentIdBack, setGovernmentIdBack] = useState<File | null>(null);
  const [capturedFaceFile, setCapturedFaceFile] = useState<File | null>(null);
  const [governmentIdFrontPreview, setGovernmentIdFrontPreview] = useState('');
  const [governmentIdBackPreview, setGovernmentIdBackPreview] = useState('');
  const [capturedFacePreview, setCapturedFacePreview] = useState('');
  const [existingVerification, setExistingVerification] = useState<StoredVerification | null>(null);
  const [liveVerificationResult, setLiveVerificationResult] = useState<FaceVerificationResult | null>(null);

  const isEditMode =
    new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('mode') === 'edit';



  useEffect(() => {
    void loadCategories();

    const rawVerification = window.sessionStorage.getItem('pendingResidentVerification');
    if (rawVerification) {
      try {
        const verification = JSON.parse(rawVerification) as StoredVerification;
        setExistingVerification(verification);
        if (GOVERNMENT_ID_OPTIONS.includes(verification.idType as (typeof GOVERNMENT_ID_OPTIONS)[number])) {
          setGovernmentIdType(verification.idType);
          setOtherGovernmentIdType('');
        } else {
          setGovernmentIdType('Other');
          setOtherGovernmentIdType(verification.idType);
        }

        void Promise.all([
          supabase.storage.from('resident-verification').createSignedUrl(verification.frontImagePath, 60 * 60),
          supabase.storage.from('resident-verification').createSignedUrl(verification.backImagePath, 60 * 60),
          verification.capturedFacePath
            ? supabase.storage.from('resident-verification').createSignedUrl(verification.capturedFacePath, 60 * 60)
            : Promise.resolve({ data: null, error: null }),
        ]).then(([front, back, face]) => {
          setGovernmentIdFrontPreview(front.data?.signedUrl ?? '');
          setGovernmentIdBackPreview(back.data?.signedUrl ?? '');
          setCapturedFacePreview(face.data?.signedUrl ?? '');
        });
      } catch {
        window.sessionStorage.removeItem('pendingResidentVerification');
      }
    }
  }, []);

  const loadExistingResident = useCallback(async () => {
    if (!isEditMode || !user) return;

    setLoadingExisting(true);
    setError(null);

    try {
      const { data: resident, error: residentError } = await supabase
        .from('residents')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (residentError) throw residentError;
      if (!resident) {
        setError('No existing census record was found for this account.');
        return;
      }

      const { data: categoryRows, error: categoryError } = await supabase
        .from('resident_categories')
        .select('category_id, indigenous_group, other_description')
        .eq('resident_id', resident.id);

      if (categoryError) throw categoryError;

      const [{ data: governmentId }, { data: faceVerification }] = await Promise.all([
        supabase
          .from('government_ids')
          .select('id_type, front_image_url, back_image_url')
          .eq('resident_id', resident.id)
          .maybeSingle(),
        supabase
          .from('face_verifications')
          .select('captured_face_url, is_matched, match_distance, similarity_score, liveness_passed, liveness_actions, verification_recommendation, id_quality, verification_status, verification_reason, device_type')
          .eq('resident_id', resident.id)
          .maybeSingle(),
      ]);

      if (governmentId) {
        const savedIdType = governmentId.id_type ?? '';
        if (GOVERNMENT_ID_OPTIONS.includes(savedIdType as (typeof GOVERNMENT_ID_OPTIONS)[number])) {
          setGovernmentIdType(savedIdType);
          setOtherGovernmentIdType('');
        } else if (savedIdType) {
          setGovernmentIdType('Other');
          setOtherGovernmentIdType(savedIdType);
        } else {
          setGovernmentIdType('');
          setOtherGovernmentIdType('');
        }
        const paths = [governmentId.front_image_url, governmentId.back_image_url, faceVerification?.captured_face_url];
        const signed = await Promise.all(paths.map(async (path) => {
          if (!path) return '';
          const { data } = await supabase.storage.from('resident-verification').createSignedUrl(path, 60 * 60);
          return data?.signedUrl ?? '';
        }));
        setGovernmentIdFrontPreview(signed[0]);
        setGovernmentIdBackPreview(signed[1]);
        setCapturedFacePreview(signed[2]);
        if (governmentId.front_image_url && governmentId.back_image_url && faceVerification) {
          setExistingVerification({
            idType: savedIdType,
            frontImagePath: governmentId.front_image_url,
            backImagePath: governmentId.back_image_url,
            capturedFacePath: faceVerification.captured_face_url ?? undefined,
            isMatched: Boolean(faceVerification.is_matched),
            matchDistance: Number(faceVerification.match_distance ?? 0),
            similarityScore: Number(faceVerification.similarity_score ?? 0),
            livenessPassed: Boolean(faceVerification.liveness_passed),
            livenessActions: Array.isArray(faceVerification.liveness_actions) ? faceVerification.liveness_actions : [],
            recommendation: faceVerification.verification_recommendation ?? 'manual_review',
            idQuality: faceVerification.id_quality ?? {},
            verificationStatus: faceVerification.verification_status ?? (faceVerification.liveness_passed ? 'passed' : 'skipped'),
            verificationReason: faceVerification.verification_reason ?? undefined,
            deviceType: faceVerification.device_type ?? undefined,
          });
        }
      }

      setResidentId(resident.id);
      setTrackingNumber(resident.tracking_number ?? null);
      setExistingHouseholdPhotoPath(resident.household_photo_url ?? null);

      if (resident.household_photo_url) {
        const { data: signedPhoto } = await supabase.storage
          .from('household-images')
          .createSignedUrl(resident.household_photo_url, 60 * 60);
        setHouseholdPhotoPreview(signedPhoto?.signedUrl ?? '');
      }
      setFormData({
        region: resident.region ?? initialFormData.region,
        province: resident.province ?? initialFormData.province,
        city_municipality: resident.city_municipality ?? initialFormData.city_municipality,
        barangay: resident.barangay ?? initialFormData.barangay,
        philsys_number: resident.philsys_number ?? '',
        last_name: resident.last_name ?? '',
        suffix: resident.suffix ?? '',
        first_name: resident.first_name ?? '',
        middle_name: resident.middle_name ?? '',
        birth_date: resident.birth_date ?? '',
        birth_place: resident.birth_place ?? '',
        sex: resident.sex ?? 'Male',
        civil_status: (resident.civil_status as CivilStatus) ?? '',
        religion: resident.religion ?? '',
        residential_address: resident.residential_address ?? '',
        citizenship: resident.citizenship ?? 'Filipino',
        profession_occupation: resident.profession_occupation ?? '',
        contact_number: resident.contact_number ?? '',
        email_address: resident.email_address ?? user.email ?? '',
        highest_education: (resident.highest_education as EducationLevel) ?? '',
        education_status: (resident.education_status as EducationStatus) ?? '',
        vocational_course: resident.vocational_course ?? '',
        tenurial_status: (resident.tenurial_status as TenurialStatus) ?? '',
        monthly_rent: resident.monthly_rent == null ? '' : String(resident.monthly_rent),
        categories: (categoryRows ?? []).map((row: any) => row.category_id),
        indigenous_group: (categoryRows ?? []).find((row: any) => row.indigenous_group)?.indigenous_group ?? '',
        other_description: (categoryRows ?? []).find((row: any) => row.other_description)?.other_description ?? '',
      });
    } catch (caughtError) {
      console.error(caughtError);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Unable to load your census information.',
      );
    } finally {
      setLoadingExisting(false);
    }
  }, [isEditMode, user]);

  useEffect(() => {
    void loadExistingResident();
  }, [loadExistingResident]);



  const loadCategories = async () => {

    const { data, error } =
      await supabase
        .from('categories')
        .select('*')
        .order('id');


    if (!error && data) {

      setCategories(data);

    }

  };



  const calculateAge = (
    birthDate:string
  ):number | null => {


    if(!birthDate)
      return null;


    const today = new Date();

    const birth =
      new Date(birthDate);


    let age =
      today.getFullYear()
      -
      birth.getFullYear();


    const month =
      today.getMonth()
      -
      birth.getMonth();


    if(
      month < 0 ||
      (
        month === 0 &&
        today.getDate()
        <
        birth.getDate()
      )
    ){

      age--;

    }


    return age;

  };



  const age =
    calculateAge(
      formData.birth_date
    );



  const updateField = (
    field:keyof CensusFormData,
    value:string | number[]
  ) => {


    setFormData(prev => ({

      ...prev,

      [field]:value,

    }));

  };

  const updateEducationLevel = (value: EducationLevel | '') => {
    setFormData((previous) => ({
      ...previous,
      highest_education: value,
      education_status:
        value === 'No Formal Education'
          ? 'No Formal Education'
          : previous.education_status === 'No Formal Education'
            ? ''
            : previous.education_status,
    }));
  };

  const updateEducationStatus = (value: EducationStatus | '') => {
    setFormData((previous) => ({
      ...previous,
      education_status: value,
      highest_education:
        value === 'No Formal Education'
          ? 'No Formal Education'
          : previous.highest_education === 'No Formal Education'
            ? ''
            : previous.highest_education,
    }));
  };



  const toggleCategory = (
    categoryName:string
  ) => {


    const category =
      categories.find(
        item =>
          item.name === categoryName
      );


    if(!category)
      return;



    setFormData(prev=>{


      const exists =
        prev.categories.includes(
          category.id
        );


      return {

        ...prev,

        categories:
          exists

          ?

          prev.categories.filter(
            id =>
              id !== category.id
          )

          :

          [
            ...prev.categories,
            category.id
          ]

      };

    });

  };



  const isCategorySelected = (
    name:string
  )=>{


    const category =
      categories.find(
        item =>
          item.name === name
      );


    return category
      ?
      formData.categories.includes(
        category.id
      )
      :
      false;

  };

  const updateVerificationImage = (
    file: File | undefined,
    kind: 'front' | 'back' | 'face',
  ) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file.');
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setError('Each verification image must be smaller than 8 MB.');
      return;
    }

    setError(null);
    const preview = URL.createObjectURL(file);

    if (kind === 'front') {
      if (governmentIdFrontPreview.startsWith('blob:')) URL.revokeObjectURL(governmentIdFrontPreview);
      setGovernmentIdFront(file);
      setGovernmentIdFrontPreview(preview);
    } else if (kind === 'back') {
      if (governmentIdBackPreview.startsWith('blob:')) URL.revokeObjectURL(governmentIdBackPreview);
      setGovernmentIdBack(file);
      setGovernmentIdBackPreview(preview);
    } else {
      if (capturedFacePreview.startsWith('blob:')) URL.revokeObjectURL(capturedFacePreview);
      setCapturedFaceFile(file);
      setCapturedFacePreview(preview);
    }
  };

  const handleHouseholdPhotoChange = (file?: File) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image for the house or household.');
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setError('The household photo must be smaller than 8 MB.');
      return;
    }

    if (householdPhotoPreview?.startsWith('blob:')) {
      URL.revokeObjectURL(householdPhotoPreview);
    }

    setError(null);
    setHouseholdPhoto(file);
    setHouseholdPhotoPreview(URL.createObjectURL(file));
  };

  const removeHouseholdPhoto = () => {
    if (householdPhotoPreview?.startsWith('blob:')) {
      URL.revokeObjectURL(householdPhotoPreview);
    }
    setHouseholdPhoto(null);
    setHouseholdPhotoPreview('');
    setExistingHouseholdPhotoPath(null);
  };


  const isValidEmail = (value: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

  const isValidName = (value: string) =>
    /^[A-Za-zÀ-ÖØ-öø-ÿÑñ .'-]{2,}$/.test(value.trim());

  const validateForm = ()=>{


    const required:
      (keyof CensusFormData)[] = [

      'last_name',
      'first_name',
      'birth_date',
      'birth_place',
      'sex',
      'civil_status',
      'residential_address',
      'highest_education',
      'education_status',
      'tenurial_status',

    ];



    for(
      const field of required
    ){

      if(!formData[field]){

        setError(
          'Please complete all required fields.'
        );

        return false;

      }

    }

    if (
      (formData.highest_education === 'No Formal Education') !==
      (formData.education_status === 'No Formal Education')
    ) {
      setError('Education level and education status are inconsistent. Please review both fields.');
      return false;
    }



    if (!governmentIdType) {
      setError('Please select the government ID type.');
      return false;
    }

    if (governmentIdType === 'Other' && !otherGovernmentIdType.trim()) {
      setError('Please specify the other government ID type.');
      return false;
    }

    if (!governmentIdFront && !existingVerification?.frontImagePath) {
      setError('Please upload the front image of your government ID.');
      return false;
    }

    if (!governmentIdBack && !existingVerification?.backImagePath) {
      setError('Please upload the back image of your government ID.');
      return false;
    }

    const requiresFreshLiveVerification = !existingVerification?.verificationStatus || Boolean(governmentIdFront);
    if (requiresFreshLiveVerification && !liveVerificationResult) {
      setError('Please complete the live camera identity verification after validating the ID front.');
      return false;
    }

    const verificationStatus = liveVerificationResult?.verificationStatus ?? existingVerification?.verificationStatus;
    if (!capturedFaceFile && !existingVerification?.capturedFacePath && verificationStatus !== 'skipped') {
      setError('Please complete the live camera identity verification or use the no-webcam exception.');
      return false;
    }

    if (!isEditMode && !householdPhoto && !existingHouseholdPhotoPath) {
      setError('Please upload a picture of your house or household.');
      return false;
    }

    if(
      formData.tenurial_status === 'Renter'
      &&
      !formData.monthly_rent
    ){

      setError(
        'Please enter monthly rent.'
      );

      return false;

    }



    if(
      isCategorySelected(
        'Indigenous People (IP)'
      )
      &&
      !formData.indigenous_group
    ){

      setError(
        'Please specify indigenous group.'
      );

      return false;

    }



    if(
      isCategorySelected('Others')
      &&
      !formData.other_description
    ){

      setError(
        'Please specify category.'
      );

      return false;

    }

    if (!isValidName(formData.first_name)) {
      setError('First name must contain at least 2 valid letters.');
      return false;
    }

    if (!isValidName(formData.last_name)) {
      setError('Last name must contain at least 2 valid letters.');
      return false;
    }

    if (formData.middle_name.trim() && !isValidName(formData.middle_name)) {
      setError('Middle name must contain at least 2 valid letters.');
      return false;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selectedBirthDate = new Date(`${formData.birth_date}T00:00:00`);
    if (Number.isNaN(selectedBirthDate.getTime()) || selectedBirthDate > today) {
      setError('Birth date cannot be in the future.');
      return false;
    }

    const phone = formData.contact_number.trim();
    if (phone && !/^\d{10,13}$/.test(phone)) {
      setError('Contact number must contain 10 to 13 digits only.');
      return false;
    }

    const email = formData.email_address.trim();
    if (email && !isValidEmail(email)) {
      setError('Please enter a valid email address.');
      return false;
    }

    if (formData.residential_address.trim().length > 200) {
      setError('Residential address must not exceed 200 characters.');
      return false;
    }

    if (formData.philsys_number.trim().length > 50) {
      setError('PhilSys number is too long.');
      return false;
    }

    return true;

  };



  const handleSubmit = async () => {
    setError(null);

    if (!validateForm()) return;

    if (!user) {
      setError('Your login session has expired. Please sign in again.');
      return;
    }

    setLoading(true);

    try {
      const { data: duplicateResult, error: duplicateError } = await supabase.rpc(
        'check_resident_duplicate',
        {
          candidate_philsys: formData.philsys_number.trim(),
          candidate_first_name: formData.first_name.trim(),
          candidate_middle_name: formData.middle_name.trim(),
          candidate_last_name: formData.last_name.trim(),
          candidate_birth_date: formData.birth_date,
        },
      );

      if (duplicateError) throw duplicateError;

      const duplicateCheck = duplicateResult as {
        duplicate?: boolean;
        reason?: 'philsys' | 'identity' | null;
      } | null;

      if (duplicateCheck?.duplicate) {
        setError('User is already registered.');
        return;
      }
    } catch (validationError) {
      const message = validationError instanceof Error
        ? validationError.message
        : 'Unable to validate duplicate resident information.';
      setError(message);
      return;
    } finally {
      setLoading(false);
    }

    const pendingVerificationRaw = window.sessionStorage.getItem(
      'pendingResidentVerification',
    );
    let pendingVerification: StoredVerification | null = null;

    if (pendingVerificationRaw) {
      try {
        pendingVerification = JSON.parse(pendingVerificationRaw) as StoredVerification;
      } catch {
        window.sessionStorage.removeItem('pendingResidentVerification');
      }
    }

    if (!pendingVerification && existingVerification) {
      pendingVerification = existingVerification;
    }

    setLoading(true);

    try {
      const effectiveGovernmentIdType =
        governmentIdType === 'Other'
          ? otherGovernmentIdType.trim()
          : governmentIdType;

      let verification = pendingVerification;

      if (governmentIdFront || governmentIdBack || capturedFaceFile) {
        const timestamp = Date.now();
        const uploadImage = async (file: File, label: string) => {
          const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
          const path = `${user.id}/${timestamp}-${label}.${extension}`;
          const { error: uploadError } = await supabase.storage
            .from('resident-verification')
            .upload(path, file, {
              cacheControl: '3600',
              upsert: true,
              contentType: file.type,
            });
          if (uploadError) throw uploadError;
          return path;
        };

        const frontImagePath = governmentIdFront
          ? await uploadImage(governmentIdFront, 'id-front')
          : verification?.frontImagePath;
        const backImagePath = governmentIdBack
          ? await uploadImage(governmentIdBack, 'id-back')
          : verification?.backImagePath;
        const capturedFacePath = capturedFaceFile
          ? await uploadImage(capturedFaceFile, 'captured-face')
          : verification?.capturedFacePath;

        if (!frontImagePath || !backImagePath) {
          throw new Error('Government ID front and back images are required.');
        }

        verification = {
          idType: effectiveGovernmentIdType,
          frontImagePath,
          backImagePath,
          capturedFacePath,
          isMatched: verification?.isMatched ?? false,
          matchDistance: liveVerificationResult?.matchDistance ?? verification?.matchDistance ?? 0,
          similarityScore: liveVerificationResult?.similarityScore ?? verification?.similarityScore,
          livenessPassed: liveVerificationResult?.livenessPassed ?? verification?.livenessPassed ?? false,
          livenessActions: liveVerificationResult?.livenessActions ?? verification?.livenessActions,
          recommendation: liveVerificationResult?.recommendation ?? verification?.recommendation,
          idQuality: liveVerificationResult?.idQuality ?? verification?.idQuality,
          verificationStatus: liveVerificationResult?.verificationStatus ?? verification?.verificationStatus ?? 'passed',
          verificationReason: liveVerificationResult?.verificationReason ?? verification?.verificationReason,
          deviceType: liveVerificationResult?.deviceType ?? verification?.deviceType,
        };
      } else if (verification) {
        verification = { ...verification, idType: effectiveGovernmentIdType || verification.idType };
      }

      let householdPhotoPath = existingHouseholdPhotoPath;

      if (householdPhoto) {
        const extension = householdPhoto.name.split('.').pop()?.toLowerCase() || 'jpg';
        householdPhotoPath = `${user.id}/${Date.now()}-household.${extension}`;

        const { error: photoUploadError } = await supabase.storage
          .from('household-images')
          .upload(householdPhotoPath, householdPhoto, {
            cacheControl: '3600',
            upsert: true,
            contentType: householdPhoto.type,
          });

        if (photoUploadError) throw photoUploadError;
      }

      const residentValues = {
        user_id: user.id,
        region: formData.region,
        province: formData.province,
        city_municipality: formData.city_municipality,
        barangay: formData.barangay,
        philsys_number: formData.philsys_number || null,
        last_name: formData.last_name.trim(),
        first_name: formData.first_name.trim(),
        middle_name: formData.middle_name.trim() || null,
        suffix: formData.suffix.trim() || null,
        birth_date: formData.birth_date,
        birth_place: formData.birth_place.trim(),
        sex: formData.sex as Sex,
        civil_status: formData.civil_status as CivilStatus,
        religion: formData.religion.trim() || null,
        residential_address: formData.residential_address.trim(),
        citizenship: formData.citizenship.trim(),
        profession_occupation: formData.profession_occupation.trim() || null,
        contact_number: formData.contact_number.trim() || null,
        email_address: formData.email_address.trim() || user.email || null,
        highest_education: formData.highest_education || null,
        education_status: formData.education_status || null,
        vocational_course: formData.vocational_course.trim() || null,
        tenurial_status: formData.tenurial_status as TenurialStatus,
        monthly_rent: formData.monthly_rent ? Number(formData.monthly_rent) : null,
        household_photo_url: householdPhotoPath,
        status: 'pending_review',
      };

      // Always check by Auth user ID before saving. This prevents duplicate rows
      // when an earlier submission saved the resident but a later related-table
      // operation failed.
      const { data: existingResident, error: existingResidentError } = await supabase
        .from('residents')
        .select('id, tracking_number')
        .eq('user_id', user.id)
        .maybeSingle();

      if (existingResidentError) throw existingResidentError;

      let savedResident: any;
      const residentRecordId = residentId ?? existingResident?.id ?? null;

      if (residentRecordId) {
        const { data, error: updateError } = await supabase
          .from('residents')
          .update(residentValues)
          .eq('id', residentRecordId)
          .eq('user_id', user.id)
          .select()
          .single();

        if (updateError) throw updateError;
        savedResident = data;
        setResidentId(data.id);

        const { error: deleteCategoryError } = await supabase
          .from('resident_categories')
          .delete()
          .eq('resident_id', data.id);

        if (deleteCategoryError) throw deleteCategoryError;
      } else {
        const { data, error: insertError } = await supabase
          .from('residents')
          .insert(residentValues)
          .select()
          .single();

        if (insertError) throw insertError;
        savedResident = data;
        setResidentId(data.id);
      }

      if (formData.categories.length > 0) {
        const categoryRows = formData.categories.map((categoryId) => {
          const categoryName = categories.find((item) => item.id === categoryId)?.name;

          return {
            resident_id: savedResident.id,
            category_id: categoryId,
            indigenous_group:
              categoryName === 'Indigenous People (IP)' || categoryName === 'Indigenous People'
                ? formData.indigenous_group.trim() || null
                : null,
            other_description:
              categoryName === 'Others'
                ? formData.other_description.trim() || null
                : null,
          };
        });

        const { error: categoryInsertError } = await supabase
          .from('resident_categories')
          .insert(categoryRows);

        if (categoryInsertError) throw categoryInsertError;
      }

      if (verification) {
        const { data: existingGovernmentId, error: governmentIdLookupError } = await supabase
          .from('government_ids')
          .select('id')
          .eq('resident_id', savedResident.id)
          .maybeSingle();

        if (governmentIdLookupError) throw governmentIdLookupError;

        const governmentIdValues = {
          resident_id: savedResident.id,
          id_type: verification.idType,
          front_image_url: verification.frontImagePath,
          back_image_url: verification.backImagePath,
        };

        if (existingGovernmentId) {
          const { error: governmentIdUpdateError } = await supabase
            .from('government_ids')
            .update(governmentIdValues)
            .eq('id', existingGovernmentId.id);
          if (governmentIdUpdateError) throw governmentIdUpdateError;
        } else {
          const { error: governmentIdInsertError } = await supabase
            .from('government_ids')
            .insert(governmentIdValues);
          if (governmentIdInsertError) throw governmentIdInsertError;
        }

        const { data: existingFaceVerification, error: faceLookupError } = await supabase
          .from('face_verifications')
          .select('id')
          .eq('resident_id', savedResident.id)
          .maybeSingle();

        if (faceLookupError) throw faceLookupError;

        const faceVerificationValues = {
          resident_id: savedResident.id,
          captured_face_url: verification.capturedFacePath ?? null,
          is_matched: verification.isMatched,
          match_distance: verification.matchDistance,
          similarity_score: verification.similarityScore ?? null,
          liveness_passed: verification.livenessPassed ?? false,
          liveness_actions: verification.livenessActions ?? [],
          verification_recommendation: verification.recommendation ?? 'manual_review',
          id_quality: verification.idQuality ?? {},
          verification_status: verification.verificationStatus ?? (verification.livenessPassed ? 'passed' : 'skipped'),
          verification_reason: verification.verificationReason ?? null,
          device_type: verification.deviceType ?? null,
        };

        if (existingFaceVerification) {
          const { error: faceUpdateError } = await supabase
            .from('face_verifications')
            .update(faceVerificationValues)
            .eq('id', existingFaceVerification.id);
          if (faceUpdateError) throw faceUpdateError;
        } else {
          const { error: faceInsertError } = await supabase
            .from('face_verifications')
            .insert(faceVerificationValues);
          if (faceInsertError) throw faceInsertError;
        }

        window.sessionStorage.removeItem('pendingResidentVerification');
      }

      const savedTrackingNumber = savedResident.tracking_number ?? trackingNumber;
      setTrackingNumber(savedTrackingNumber);

      window.sessionStorage.setItem(
        'residentDashboardNotice',
        isEditMode
          ? 'Your census information was updated successfully and returned for review.'
          : 'Your census information was submitted successfully.',
      );

      onDashboard();
    } catch (caughtError) {
      console.error('Census submission failed:', caughtError);

      const rawMessage = caughtError instanceof Error
        ? caughtError.message
        : typeof caughtError === 'object' && caughtError && 'message' in caughtError
          ? String((caughtError as { message?: unknown }).message ?? '')
          : '';

      let friendlyMessage = rawMessage || (isEditMode
        ? 'Failed to update census information.'
        : 'Failed to submit census form.');

      if (/captured_face_url/i.test(rawMessage) && /null|not-null|violates/i.test(rawMessage)) {
        friendlyMessage = 'The database still requires a captured face image. Run submit-census-database-fix.sql in the Supabase SQL Editor, then submit again.';
      } else if (/verification_status|verification_reason|device_type|liveness_/i.test(rawMessage) && /column|schema cache/i.test(rawMessage)) {
        friendlyMessage = 'The verification database columns are missing. Run submit-census-database-fix.sql in the Supabase SQL Editor, refresh the page, and submit again.';
      } else if (/row-level security|permission denied|policy/i.test(rawMessage)) {
        friendlyMessage = 'Supabase blocked the submission because the required security policies are missing. Run census-submit-rls-fix.sql in the Supabase SQL Editor.';
      } else if (/bucket|storage/i.test(rawMessage) && /not found|does not exist/i.test(rawMessage)) {
        friendlyMessage = 'A required Supabase Storage bucket is missing. Run the included storage setup SQL files in the Supabase SQL Editor.';
      } else if (/duplicate key/i.test(rawMessage) && /philsys/i.test(rawMessage)) {
        friendlyMessage = 'User is already registered.';
      }

      setError(friendlyMessage);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setLoading(false);
    }
  };

  if (loadingExisting) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-blue-600" />
          <p className="mt-3 text-sm text-slate-600">Loading your census information...</p>
        </div>
      </div>
    );
  }

  return (

    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 text-slate-900">


      <header className="border-b border-slate-200 bg-white/90 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-5 sm:px-6">
          <button
            type="button"
            onClick={onDashboard}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
            title="Back to dashboard"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">
              Barangay Old Lucban
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
              {isEditMode ? 'Update Census Information' : 'Individual Records of Barangay Inhabitant'}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {isEditMode
                ? 'Review your existing details and save the necessary corrections.'
                : 'Complete all required information before submitting your census record.'}
            </p>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-8 sm:px-6">



        {
          error && (

          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">

            <div className="flex gap-2 items-center text-red-600">

              <AlertCircle className="w-5 h-5"/>

              {error}

            </div>

          </div>

          )
        }



        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-8 sm:p-8">


{/* LOCATION */}

<section className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5 sm:p-6">

<h2 className="mb-6 text-xl font-bold text-slate-900">
1. Location Information
</h2>


<div className="grid gap-6 md:grid-cols-2">


{[
["Region","region"],
["Province","province"],
["City / Municipality","city_municipality"],
["Barangay","barangay"]

].map(([label,key])=>(

<div key={key} className="space-y-2">

<label className="label">
{label}
</label>

<input
className="input"
value={
formData[key as keyof CensusFormData] as string
}
readOnly
/>

</div>

))}


</div>

</section>





{/* PERSONAL */}

<section className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5 sm:p-6">

<h2 className="mb-6 text-xl font-bold text-slate-900">
2. Personal Information
</h2>


<div className="grid gap-6 md:grid-cols-2">


{[
["Last Name","last_name"],
["First Name","first_name"],
["Middle Name","middle_name"],
["Birth Place","birth_place"],
["Religion","religion"],
["Profession / Occupation","profession_occupation"],
["Contact Number","contact_number"],
["Email Address","email_address"]

].map(([label,key])=>(


<div key={key} className="space-y-2">

<label className="label">
{label}
</label>


<input

className="input"

value={
formData[key as keyof CensusFormData] as string
}

onChange={(e) => {
  const nextValue = key === 'contact_number'
    ? e.target.value.replace(/\D/g, '').slice(0, 13)
    : e.target.value;
  updateField(key as keyof CensusFormData, nextValue);
}}

maxLength={
  key === 'email_address' ? 254 :
  key === 'contact_number' ? 13 :
  key === 'last_name' || key === 'first_name' || key === 'middle_name' ? 100 :
  undefined
}
inputMode={key === 'contact_number' ? 'numeric' : undefined}
type={key === 'email_address' ? 'email' : 'text'}

/>


</div>


))}



<div className="space-y-2">

<label className="label">
Birth Date *
</label>


<input

type="date"

max={new Date().toISOString().split('T')[0]}

className="input"

value={formData.birth_date}

onChange={
e=>
updateField(
'birth_date',
e.target.value
)
}

/>

</div>



<div className="space-y-2">

<label className="label">
Age
</label>


<input

className="input"

readOnly

value={
age
?
`${age} years old`
:
''
}

/>

</div>




<div className="space-y-2">

<label className="label">
Sex *
</label>


<select

className="input"

value={formData.sex}

onChange={
e=>
updateField(
'sex',
e.target.value as Sex
)
}

>


<option value="">
Select
</option>


{
SEX_OPTIONS.map(x=>(

<option key={x}>
{x}
</option>

))
}


</select>

</div>




<div className="space-y-2">

<label className="label">
Civil Status *
</label>


<select

className="input"

value={formData.civil_status}

onChange={
e=>
updateField(
'civil_status',
e.target.value as CivilStatus
)
}

>


<option value="">
Select
</option>


{
CIVIL_STATUS_OPTIONS.map(x=>(

<option key={x}>
{x}
</option>

))
}


</select>


</div>





<div className="space-y-2 md:col-span-2">

<label className="label">
Residential Address *
</label>


<textarea

className="input"

value={
formData.residential_address
}

onChange={
e=>
updateField(
'residential_address',
e.target.value
)
}

/>


</div>



</div>


</section>





{/* EDUCATION */}

<section className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5 sm:p-6">

<h2 className="mb-6 text-xl font-bold text-slate-900">
3. Education
</h2>


<div className="grid gap-6 md:grid-cols-2">


<div className="space-y-2">

<label className="label">
Highest Education <span className="text-red-500">*</span>
</label>


<select

className="input"

value={formData.highest_education}

onChange={
e=>
updateEducationLevel(e.target.value as EducationLevel | '')
}

>

<option value="">
Select highest education
</option>


{
EDUCATION_OPTIONS.map(x=>(

<option key={x}>
{x}
</option>

))
}


</select>


</div>



<div className="space-y-2">

<label className="label">
Education Status <span className="text-red-500">*</span>
</label>


<select

className="input"

value={formData.education_status}

onChange={
e=>
updateEducationStatus(e.target.value as EducationStatus | '')
}

>

<option value="">
Select education status
</option>


{
EDUCATION_STATUS_OPTIONS.map(x=>(

<option key={x}>
{x}
</option>

))
}


</select>


</div>


</div>


</section>






{/* TENURE */}

<section className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5 sm:p-6">


<h2 className="mb-6 text-xl font-bold text-slate-900">
4. Tenurial Status
</h2>


<div className="grid gap-4 md:grid-cols-2">


{
TENURIAL_STATUS_OPTIONS.map(status=>(

<label
key={status}
className="flex cursor-pointer items-center rounded-xl border border-slate-200 bg-white p-4 transition hover:border-blue-300 hover:bg-blue-50/60"
>


<input

type="radio"

name="tenure"

checked={
formData.tenurial_status===status
}

onChange={
()=>setFormData((current) => ({
  ...current,
  tenurial_status: status,
  monthly_rent: status === 'Renter' ? current.monthly_rent : '',
}))
}

/>


<span className="ml-2">
{status}
</span>


</label>


))
}


</div>

{formData.tenurial_status === 'Renter' && (
  <div className="mt-6 max-w-md rounded-2xl border border-blue-200 bg-blue-50/70 p-5">
    <label htmlFor="monthly-rent" className="label">
      Monthly Rent (PHP) *
    </label>
    <div className="relative mt-2">
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-semibold text-slate-500">
        ₱
      </span>
      <input
        id="monthly-rent"
        type="number"
        min="1"
        step="0.01"
        inputMode="decimal"
        value={formData.monthly_rent}
        onChange={(event) => updateField('monthly_rent', event.target.value)}
        className="input pl-9"
        placeholder="Example: 5000"
        required
      />
    </div>
    <p className="mt-2 text-xs text-slate-500">
      Enter the household's current monthly rental payment.
    </p>
  </div>
)}


</section>






{/* IDENTITY VERIFICATION */}
<section className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5 sm:p-6">
  <div className="mb-6 flex items-start gap-3">
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
      <ShieldCheck size={23} />
    </div>
    <div>
      <h2 className="text-xl font-bold text-slate-900">5. Identity Verification</h2>
      <p className="mt-1 text-sm text-slate-500">Upload clear images of the selected government ID and the face photo captured during verification.</p>
    </div>
  </div>

  <div className="mb-6 max-w-md space-y-2">
    <label className="label">Government ID Type *</label>
    <select
      className="input"
      value={governmentIdType}
      onChange={(event) => {
        const value = event.target.value;
        setGovernmentIdType(value);
        if (value !== 'Other') setOtherGovernmentIdType('');
      }}
    >
      <option value="">Select government ID</option>
      {GOVERNMENT_ID_OPTIONS.map((idType) => (
        <option key={idType} value={idType}>{idType}</option>
      ))}
      <option value="Other">Other</option>
    </select>

    {governmentIdType === 'Other' && (
      <div className="pt-2">
        <label className="label">Specify Other ID *</label>
        <input
          type="text"
          className="input"
          value={otherGovernmentIdType}
          maxLength={100}
          placeholder="Enter the name of the ID"
          onChange={(event) => setOtherGovernmentIdType(event.target.value)}
        />
      </div>
    )}
  </div>

  <div className="grid gap-5 md:grid-cols-2">
    {[
      { key: 'front', title: 'Government ID Front', preview: governmentIdFrontPreview, icon: CreditCard },
      { key: 'back', title: 'Government ID Back', preview: governmentIdBackPreview, icon: CreditCard },
    ].map((item) => {
      const Icon = item.icon;
      return (
        <div key={item.key} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 font-semibold text-slate-800">
            <Icon size={18} className="text-blue-600" />
            {item.title} *
          </div>
          <div className="p-4">
            {item.preview ? (
              <img src={item.preview} alt={item.title} className="h-44 w-full rounded-xl border border-slate-200 object-cover" />
            ) : (
              <div className="flex h-44 items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 text-center text-sm text-slate-500">
                No image selected
              </div>
            )}
            <label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-100">
              <Upload size={18} />
              {item.preview ? 'Replace image' : 'Upload image'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(event) => updateVerificationImage(event.target.files?.[0], item.key as 'front' | 'back')}
              />
            </label>
          </div>
        </div>
      );
    })}
  </div>

  <div className="mt-5">
    <FaceIdentityVerification
      idFrontFile={governmentIdFront}
      idFrontPreview={governmentIdFrontPreview}
      disabled={loading}
      onReset={() => {
        setLiveVerificationResult(null);
        setCapturedFaceFile(null);
        if (capturedFacePreview.startsWith('blob:')) URL.revokeObjectURL(capturedFacePreview);
        setCapturedFacePreview('');
      }}
      onVerified={(result) => {
        setLiveVerificationResult(result);
        setCapturedFaceFile(result.file);
        if (capturedFacePreview.startsWith('blob:')) URL.revokeObjectURL(capturedFacePreview);
        setCapturedFacePreview(result.file ? URL.createObjectURL(result.file) : '');
        setExistingVerification((current) => current ? {
          ...current,
          isMatched: result.matched,
          matchDistance: result.matchDistance,
          similarityScore: result.similarityScore,
          livenessPassed: result.livenessPassed,
          livenessActions: result.livenessActions,
          recommendation: result.recommendation,
          idQuality: result.idQuality,
          verificationStatus: result.verificationStatus,
          verificationReason: result.verificationReason,
          deviceType: result.deviceType,
        } : current);
      }}
    />
  </div>

  {liveVerificationResult?.verificationStatus === 'skipped' && <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"><p className="font-bold">Manual identity verification required</p><p className="mt-1">{liveVerificationResult.verificationReason}</p></div>}
  {capturedFacePreview && <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white p-3"><p className="mb-2 text-sm font-semibold text-slate-700">Captured live face</p><img src={capturedFacePreview} alt="Captured live applicant face" className="h-56 w-full rounded-xl object-cover" /></div>}
  <p className="mt-4 text-xs text-slate-500">ID images: JPG, PNG, or WebP, maximum 8 MB. The applicant face must be captured using the live camera and pass randomized liveness actions.</p>
</section>

{/* HOUSEHOLD PHOTO */}
<section className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5 sm:p-6">
  <div className="mb-5">
<h2 className="text-xl font-bold text-slate-900">6. House / Household Photo</h2>
    <p className="mt-1 text-sm text-slate-500">
      Upload a clear picture of the resident's house or household. Maximum file size: 8 MB.
    </p>
  </div>

  {householdPhotoPreview ? (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <img
        src={householdPhotoPreview}
        alt="House or household preview"
        className="h-72 w-full object-cover"
      />
      <button
        type="button"
        onClick={removeHouseholdPhoto}
        className="absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/95 text-red-600 shadow-lg transition hover:bg-red-50"
        title="Remove household photo"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  ) : (
    <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-white px-6 py-12 text-center transition hover:border-blue-400 hover:bg-blue-50/40">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
        <ImageIcon className="h-7 w-7" />
      </div>
      <p className="mt-4 font-semibold text-slate-800">Upload house or household picture</p>
      <p className="mt-1 text-sm text-slate-500">PNG, JPG, JPEG, or WEBP</p>
      <span className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white">
        <Upload className="h-4 w-4" />
        Select Image
      </span>
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(event) => handleHouseholdPhotoChange(event.target.files?.[0])}
      />
    </label>
  )}
</section>


{/* CATEGORY */}

<section className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5 sm:p-6">


<h2 className="mb-6 text-xl font-bold text-slate-900">
7. Category
</h2>


<div className="grid gap-4 md:grid-cols-3">


{
[
...CATEGORY_CONFIG.main,
...CATEGORY_CONFIG.other

].map(cat=>(


<label
key={cat}
className="flex items-center rounded-xl border border-slate-200 bg-white p-4 transition hover:border-blue-300 hover:bg-blue-50/60"
>


<input

type="checkbox"

checked={
isCategorySelected(cat)
}

onChange={
()=>toggleCategory(cat)
}

/>


<span className="ml-2">
{cat}
</span>


</label>


))

}


</div>



</section>






<button

type="button"

onClick={handleSubmit}

disabled={loading || loadingExisting}

className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-4 font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"

>


{

loading

?

<Loader2 className="animate-spin"/>

:

<>

{isEditMode ? <Save className="w-5 h-5" /> : <Send className="w-5 h-5" />}

{isEditMode ? 'Save Census Updates' : 'Submit Census Form'}

</>

}


</button>




</div>


</div>


</div>


);

}
