import { useState, useEffect, useCallback } from "react";
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
} from "lucide-react";

import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import type {
  CategoryRow,
  EducationLevel,
  EducationStatus,
} from "../types/database";
import FaceIdentityVerification, {
  type FaceVerificationResult,
} from "../components/FaceIdentityVerification";
import IdCameraCapture from "../components/IdCameraCapture";
import { categoryLabel, EDUCATION_STATUS_OPTIONS } from "../lib/displayLabels";
import BoardingFormFields from "../components/BoardingFormFields";
import {
  EMPTY_BOARDING_FIELDS,
  validateBoarding,
  type BoardingFormData,
} from "../lib/boarding";

type Sex = "Male" | "Female";
type CivilStatus = "Single" | "Married" | "Widowed" | "Divorced" | "Separated";
type TenurialStatus =
  "House Owner" | "Sharer" | "Caretaker" | "Renter" | "Landlord/Landlady";

interface StoredVerification {
  userId?: string;
  idType: string;
  frontImagePath: string;
  backImagePath: string;
  capturedFacePath?: string | null;
  isMatched: boolean;
  matchDistance: number;
  similarityScore?: number;
  livenessPassed?: boolean;
  livenessActions?: string[];
  recommendation?: string;
  idQuality?: Record<string, number>;
  verificationStatus?: "passed" | "skipped";
  verificationReason?: string;
  deviceType?: string;
}

interface CensusFormProps {
  onDashboard: () => void;
  onLogout: () => void;
}
interface CensusFormData extends BoardingFormData {
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
  sex: "Male" | "Female";
  civil_status: CivilStatus | "";
  religion: string;
  residential_address: string;
  citizenship: string;
  profession_occupation: string;
  contact_number: string;
  email_address: string;
  highest_education: EducationLevel | "";
  education_status: EducationStatus | "";
  vocational_course: string;
  residence_start_date: string;
  residence_classification: "" | "temporary" | "resident";
  tenurial_status: TenurialStatus | "";
  monthly_rent: string;
  categories: number[];
  indigenous_group: string;
  other_description: string;
}
type CensusValidationField =
  | keyof CensusFormData
  | "governmentIdType"
  | "otherGovernmentIdType"
  | "governmentIdFront"
  | "governmentIdBack"
  | "liveVerification"
  | "householdPhoto";
type CensusFieldErrors = Partial<Record<CensusValidationField, string>>;

const initialFormData: CensusFormData = {
  ...EMPTY_BOARDING_FIELDS,
  boarding_status: "neither",
  region: "Cordillera Administrative Region (CAR)",
  province: "Benguet",
  city_municipality: "Baguio City",
  barangay: "Old Lucban",
  philsys_number: "",
  last_name: "",
  suffix: "",
  first_name: "",
  middle_name: "",
  birth_date: "",
  birth_place: "",
  sex: "Male",
  civil_status: "",
  religion: "",
  residential_address: "",
  citizenship: "Filipino",
  profession_occupation: "",
  contact_number: "",
  email_address: "",
  highest_education: "",
  education_status: "",
  vocational_course: "",
  residence_start_date: "",
  residence_classification: "",
  tenurial_status: "",
  monthly_rent: "",
  categories: [],
  indigenous_group: "",
  other_description: "",
};
const REQUIRED_CENSUS_FIELDS: (keyof CensusFormData)[] = [
  "last_name",
  "first_name",
  "birth_date",
  "birth_place",
  "sex",
  "civil_status",
  "residential_address",
  "highest_education",
  "education_status",
  "tenurial_status",
  "residence_start_date",
  "residence_classification",
];
const SEX_OPTIONS: Sex[] = ["Male", "Female"];
const CIVIL_STATUS_OPTIONS: CivilStatus[] = [
  "Single",
  "Married",
  "Widowed",
  "Divorced",
  "Separated",
];
const EDUCATION_OPTIONS: EducationLevel[] = [
  "No Formal Education",
  "Pre-School",
  "Kindergarten",
  "Elementary",
  "High School",
  "Junior High School",
  "Senior High School",
  "Vocational",
  "College",
  "Post Graduate",
  "Master's Degree",
  "Doctorate",
];
const TENURIAL_STATUS_OPTIONS: TenurialStatus[] = [
  "Landlord/Landlady",
  "House Owner",
  "Sharer",
  "Caretaker",
  "Renter",
];
const GOVERNMENT_ID_OPTIONS = [
  "PhilSys ID",
  "Driver's License",
  "Passport",
  "UMID",
  "Postal ID",
  "Voter's ID",
] as const;
const CATEGORY_CONFIG = {
  main: ["Senior Citizen", "Youth", "PWD", "FHONA"],
  other: [
    "4Ps Beneficiary",
    "Solo Parent",
    "Child-Headed Family",
    "Indigenous People",
    "Others",
  ],
};

export default function CensusForm({ onDashboard }: CensusFormProps) {
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const { user } = useAuth();
  const userId = user?.id;
  const accountEmail = user?.email;
  const [residenceLocked, setResidenceLocked] = useState(false);
  const [formData, setFormData] = useState<CensusFormData>(initialFormData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<CensusFieldErrors>({});
  const [trackingNumber, setTrackingNumber] = useState<string | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [householdPhoto, setHouseholdPhoto] = useState<File | null>(null);
  const [householdPhotoPreview, setHouseholdPhotoPreview] = useState("");
  const [existingHouseholdPhotoPath, setExistingHouseholdPhotoPath] = useState<
    string | null
  >(null);
  const [governmentIdType, setGovernmentIdType] = useState("");
  const [otherGovernmentIdType, setOtherGovernmentIdType] = useState("");
  const [governmentIdFront, setGovernmentIdFront] = useState<File | null>(null);
  const [governmentIdBack, setGovernmentIdBack] = useState<File | null>(null);
  const [capturedFaceFile, setCapturedFaceFile] = useState<File | null>(null);
  const [governmentIdFrontPreview, setGovernmentIdFrontPreview] = useState("");
  const [governmentIdBackPreview, setGovernmentIdBackPreview] = useState("");
  const [capturedFacePreview, setCapturedFacePreview] = useState("");
  const [existingVerification, setExistingVerification] =
    useState<StoredVerification | null>(null);
  const [liveVerificationResult, setLiveVerificationResult] =
    useState<FaceVerificationResult | null>(null);
  const isEditMode =
    new URLSearchParams(window.location.hash.split("?")[1] ?? "").get(
      "mode",
    ) === "edit";

  useEffect(() => {
    void loadCategories();
    if (!userId) return;
    if (!isEditMode)
      setFormData((current) => ({
        ...current,
        email_address: accountEmail ?? "",
      }));
    const verificationKey = `pendingResidentVerification:${userId}`;
    const rawVerification = window.sessionStorage.getItem(verificationKey);
    if (rawVerification) {
      try {
        const verification = JSON.parse(rawVerification) as StoredVerification;
        if (verification.userId && verification.userId !== userId)
          throw new Error("Verification belongs to another account.");
        setExistingVerification(verification);
        if (
          GOVERNMENT_ID_OPTIONS.includes(
            verification.idType as (typeof GOVERNMENT_ID_OPTIONS)[number],
          )
        ) {
          setGovernmentIdType(verification.idType);
          setOtherGovernmentIdType("");
        } else {
          setGovernmentIdType("Other");
          setOtherGovernmentIdType(verification.idType);
        }
        void Promise.all([
          supabase.storage
            .from("resident-verification")
            .createSignedUrl(verification.frontImagePath, 3600),
          supabase.storage
            .from("resident-verification")
            .createSignedUrl(verification.backImagePath, 3600),
          verification.capturedFacePath
            ? supabase.storage
                .from("resident-verification")
                .createSignedUrl(verification.capturedFacePath, 3600)
            : Promise.resolve({ data: null, error: null }),
        ]).then(([front, back, face]) => {
          setGovernmentIdFrontPreview(front.data?.signedUrl ?? "");
          setGovernmentIdBackPreview(back.data?.signedUrl ?? "");
          setCapturedFacePreview(face.data?.signedUrl ?? "");
        });
      } catch {
        window.sessionStorage.removeItem(verificationKey);
      }
    }
  }, [isEditMode, userId, accountEmail]);

  const loadExistingResident = useCallback(async () => {
    if (!isEditMode || !userId) return;
    setLoadingExisting(true);
    setError(null);
    try {
      const { data: resident, error: residentError } = await supabase
        .from("residents")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      if (residentError) throw residentError;
      if (!resident) {
        setError("No existing census record was found for this account.");
        return;
      }
      const { data: categoryRows, error: categoryError } = await supabase
        .from("resident_categories")
        .select("category_id, indigenous_group, other_description")
        .eq("resident_id", resident.id);
      if (categoryError) throw categoryError;
      const [{ data: governmentId }, { data: faceVerification }] =
        await Promise.all([
          supabase
            .from("government_ids")
            .select("id_type, front_image_url, back_image_url")
            .eq("resident_id", resident.id)
            .maybeSingle(),
          supabase
            .from("face_verifications")
            .select(
              "captured_face_url, is_matched, match_distance, similarity_score, liveness_passed, liveness_actions, verification_recommendation, id_quality, verification_status, verification_reason, device_type",
            )
            .eq("resident_id", resident.id)
            .maybeSingle(),
        ]);
      if (governmentId) {
        const savedIdType = governmentId.id_type ?? "";
        if (
          GOVERNMENT_ID_OPTIONS.includes(
            savedIdType as (typeof GOVERNMENT_ID_OPTIONS)[number],
          )
        ) {
          setGovernmentIdType(savedIdType);
          setOtherGovernmentIdType("");
        } else if (savedIdType) {
          setGovernmentIdType("Other");
          setOtherGovernmentIdType(savedIdType);
        } else {
          setGovernmentIdType("");
          setOtherGovernmentIdType("");
        }
        const paths = [
          governmentId.front_image_url,
          governmentId.back_image_url,
          faceVerification?.captured_face_url,
        ];
        const signed = await Promise.all(
          paths.map(async (path) => {
            if (!path) return "";
            const { data } = await supabase.storage
              .from("resident-verification")
              .createSignedUrl(path, 3600);
            return data?.signedUrl ?? "";
          }),
        );
        setGovernmentIdFrontPreview(signed[0]);
        setGovernmentIdBackPreview(signed[1]);
        setCapturedFacePreview(signed[2]);
        if (
          governmentId.front_image_url &&
          governmentId.back_image_url &&
          faceVerification
        )
          setExistingVerification({
            userId: userId,
            idType: savedIdType,
            frontImagePath: governmentId.front_image_url,
            backImagePath: governmentId.back_image_url,
            capturedFacePath: faceVerification.captured_face_url ?? null,
            isMatched: Boolean(faceVerification.is_matched),
            matchDistance: Number(faceVerification.match_distance ?? 0),
            similarityScore: Number(faceVerification.similarity_score ?? 0),
            livenessPassed: Boolean(faceVerification.liveness_passed),
            livenessActions: Array.isArray(faceVerification.liveness_actions)
              ? faceVerification.liveness_actions
              : [],
            recommendation:
              faceVerification.verification_recommendation ?? "manual_review",
            idQuality: faceVerification.id_quality ?? {},
            verificationStatus:
              faceVerification.verification_status ??
              (faceVerification.liveness_passed ? "passed" : "skipped"),
            verificationReason:
              faceVerification.verification_reason ?? undefined,
            deviceType: faceVerification.device_type ?? undefined,
          });
      }
      setTrackingNumber(resident.tracking_number ?? null);
      setExistingHouseholdPhotoPath(resident.household_photo_url ?? null);
      if (resident.household_photo_url) {
        const { data: signedPhoto } = await supabase.storage
          .from("household-images")
          .createSignedUrl(resident.household_photo_url, 3600);
        setHouseholdPhotoPreview(signedPhoto?.signedUrl ?? "");
      }
      const { data: residencePeriod, error: residenceError } = await supabase
        .from("residency_periods")
        .select("start_date, initial_classification")
        .eq("resident_id", resident.id)
        .is("end_date", null)
        .maybeSingle();
      if (residenceError) throw residenceError;
      setResidenceLocked(Boolean(residencePeriod));
      setFormData({
        boarding_status: resident.boarding_status ?? "neither",
        boarding_house_name: resident.boarding_house_name ?? "",
        boarding_house_address: resident.boarding_house_address ?? "",
        boarding_landlord_name: resident.boarding_landlord_name ?? "",
        boarding_start_date: resident.boarding_start_date ?? "",
        boarding_tenant_count:
          resident.boarding_tenant_count == null
            ? ""
            : String(resident.boarding_tenant_count),
        boarding_contact: resident.boarding_contact ?? "",
        residence_start_date: residencePeriod?.start_date ?? "",
        residence_classification: residencePeriod?.initial_classification ?? "",
        region: resident.region ?? initialFormData.region,
        province: resident.province ?? initialFormData.province,
        city_municipality:
          resident.city_municipality ?? initialFormData.city_municipality,
        barangay: resident.barangay ?? initialFormData.barangay,
        philsys_number: resident.philsys_number ?? "",
        last_name: resident.last_name ?? "",
        suffix: resident.suffix ?? "",
        first_name: resident.first_name ?? "",
        middle_name: resident.middle_name ?? "",
        birth_date: resident.birth_date ?? "",
        birth_place: resident.birth_place ?? "",
        sex: resident.sex ?? "Male",
        civil_status: (resident.civil_status as CivilStatus) ?? "",
        religion: resident.religion ?? "",
        residential_address: resident.residential_address ?? "",
        citizenship: resident.citizenship ?? "Filipino",
        profession_occupation: resident.profession_occupation ?? "",
        contact_number: resident.contact_number ?? "",
        email_address: accountEmail ?? "",
        highest_education: (resident.highest_education as EducationLevel) ?? "",
        education_status: (resident.education_status as EducationStatus) ?? "",
        vocational_course: resident.vocational_course ?? "",
        tenurial_status: (resident.tenurial_status as TenurialStatus) ?? "",
        monthly_rent:
          resident.monthly_rent == null ? "" : String(resident.monthly_rent),
        categories: (categoryRows ?? []).map((row: any) => row.category_id),
        indigenous_group:
          (categoryRows ?? []).find((row: any) => row.indigenous_group)
            ?.indigenous_group ?? "",
        other_description:
          (categoryRows ?? []).find((row: any) => row.other_description)
            ?.other_description ?? "",
      });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to load your census information.",
      );
    } finally {
      setLoadingExisting(false);
    }
  }, [isEditMode, userId, accountEmail]);
  useEffect(() => {
    void loadExistingResident();
  }, [loadExistingResident]);

  async function loadCategories() {
    const { data, error: loadError } = await supabase
      .from("categories")
      .select("*")
      .order("id");
    if (!loadError && data) setCategories(data);
  }
  function calculateAge(birthDate: string) {
    if (!birthDate) return null;
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const month = today.getMonth() - birth.getMonth();
    if (month < 0 || (month === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  }
  const age = calculateAge(formData.birth_date);
  function updateField(field: keyof CensusFormData, value: string | number[]) {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }
  function clearFieldError(field: CensusValidationField) {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }
  const fieldInputClass = (field: CensusValidationField, extra = "") =>
    `input ${extra} ${fieldErrors[field] ? "border-red-500 bg-red-50 focus:border-red-500 focus:ring-red-100" : ""}`;
  function updateEducationLevel(value: EducationLevel | "") {
    setFormData((previous) => ({
      ...previous,
      highest_education: value,
      education_status:
        value === "No Formal Education"
          ? "No Formal Education"
          : previous.education_status === "No Formal Education"
            ? ""
            : previous.education_status,
    }));
    clearFieldError("highest_education");
    if (value === "No Formal Education") clearFieldError("education_status");
  }
  function updateEducationStatus(value: EducationStatus | "") {
    setFormData((previous) => ({
      ...previous,
      education_status: value,
      highest_education:
        value === "No Formal Education"
          ? "No Formal Education"
          : previous.highest_education === "No Formal Education"
            ? ""
            : previous.highest_education,
    }));
    clearFieldError("education_status");
    if (value === "No Formal Education") clearFieldError("highest_education");
  }
  function toggleCategory(categoryName: string) {
    const category = categories.find((item) => item.name === categoryName);
    if (!category) return;
    setFormData((prev) => ({
      ...prev,
      categories: prev.categories.includes(category.id)
        ? prev.categories.filter((id) => id !== category.id)
        : [...prev.categories, category.id],
    }));
    if (categoryName === "Indigenous People")
      clearFieldError("indigenous_group");
    if (categoryName === "Others") clearFieldError("other_description");
  }
  function isCategorySelected(name: string) {
    const category = categories.find((item) => item.name === name);
    return category ? formData.categories.includes(category.id) : false;
  }
  function updateVerificationImage(
    file: File | undefined,
    kind: "front" | "back" | "face",
  ) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please select a valid image file.");
      return;
    }
    if (file.size === 0) {
      setError("The selected image is empty. Choose or capture it again.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("Each verification image must be smaller than 8 MB.");
      return;
    }
    setError(null);
    const preview = URL.createObjectURL(file);
    if (kind === "front") {
      if (governmentIdFrontPreview.startsWith("blob:"))
        URL.revokeObjectURL(governmentIdFrontPreview);
      setGovernmentIdFront(file);
      setGovernmentIdFrontPreview(preview);
      clearFieldError("governmentIdFront");
      clearFieldError("liveVerification");
    } else if (kind === "back") {
      if (governmentIdBackPreview.startsWith("blob:"))
        URL.revokeObjectURL(governmentIdBackPreview);
      setGovernmentIdBack(file);
      setGovernmentIdBackPreview(preview);
      clearFieldError("governmentIdBack");
    } else {
      if (capturedFacePreview.startsWith("blob:"))
        URL.revokeObjectURL(capturedFacePreview);
      setCapturedFaceFile(file);
      setCapturedFacePreview(preview);
    }
  }
  function handleHouseholdPhotoChange(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please select a valid image for the house or household.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("The household photo must be smaller than 8 MB.");
      return;
    }
    if (householdPhotoPreview.startsWith("blob:"))
      URL.revokeObjectURL(householdPhotoPreview);
    setError(null);
    setHouseholdPhoto(file);
    setHouseholdPhotoPreview(URL.createObjectURL(file));
    clearFieldError("householdPhoto");
  }
  function removeHouseholdPhoto() {
    if (isEditMode && existingHouseholdPhotoPath) return;
    if (householdPhotoPreview.startsWith("blob:"))
      URL.revokeObjectURL(householdPhotoPreview);
    setHouseholdPhoto(null);
    setHouseholdPhotoPreview("");
  }
  const isValidEmail = (value: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  const isValidName = (value: string) =>
    /^[A-Za-zÀ-ÖØ-öø-ÿÑñ .'-]{2,}$/.test(value.trim());
  function validateForm() {
    const nextErrors: CensusFieldErrors = {};
    REQUIRED_CENSUS_FIELDS.forEach((field) => {
      const value = formData[field];
      if (typeof value === "string" ? !value.trim() : !value)
        nextErrors[field] = "This field is required.";
    });
    if (
      formData.highest_education &&
      formData.education_status &&
      (formData.highest_education === "No Formal Education") !==
        (formData.education_status === "No Formal Education")
    ) {
      nextErrors.highest_education = "Education level and status do not match.";
      nextErrors.education_status = "Education level and status do not match.";
    }
    if (!governmentIdType)
      nextErrors.governmentIdType = "Government ID type is required.";
    if (governmentIdType === "Other" && !otherGovernmentIdType.trim())
      nextErrors.otherGovernmentIdType = "Specify the government ID type.";
    if (!governmentIdFront && !existingVerification?.frontImagePath)
      nextErrors.governmentIdFront = "Government ID front is required.";
    if (!governmentIdBack && !existingVerification?.backImagePath)
      nextErrors.governmentIdBack = "Government ID back is required.";
    const requiresFreshLiveVerification =
      !existingVerification?.verificationStatus ||
      Boolean(
        governmentIdFront ||
        governmentIdBack ||
        capturedFaceFile ||
        liveVerificationResult,
      );
    if (
      requiresFreshLiveVerification &&
      (!liveVerificationResult?.livenessPassed ||
        !liveVerificationResult.file ||
        liveVerificationResult.file.size === 0)
    )
      nextErrors.liveVerification =
        "Complete a successful live camera verification.";
    if (
      !isEditMode &&
      !requiresFreshLiveVerification &&
      (!existingVerification?.capturedFacePath ||
        !existingVerification.livenessPassed)
    )
      nextErrors.liveVerification =
        "Complete a successful live camera verification.";
    if (!isEditMode && !householdPhoto && !existingHouseholdPhotoPath)
      nextErrors.householdPhoto = "House or household photo is required.";
    if (
      formData.residence_start_date &&
      (formData.residence_start_date >
        new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Manila",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date()) ||
        formData.residence_start_date < formData.birth_date)
    )
      nextErrors.residence_start_date =
        "Residence start must be between your birth date and today.";
    if (
      formData.tenurial_status === "Renter" &&
      formData.boarding_status !== "boarder" &&
      (!formData.monthly_rent ||
        !Number.isFinite(Number(formData.monthly_rent)) ||
        Number(formData.monthly_rent) <= 0)
    )
      nextErrors.monthly_rent = "Enter a monthly rent greater than zero.";
    Object.assign(
      nextErrors,
      validateBoarding(
        formData,
        formData.birth_date,
        new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Manila",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date()),
      ),
    );
    if (
      isCategorySelected("Indigenous People") &&
      !formData.indigenous_group.trim()
    )
      nextErrors.indigenous_group = "Indigenous group is required.";
    if (isCategorySelected("Others") && !formData.other_description.trim())
      nextErrors.other_description =
        "Describe the other resident classification.";
    if (formData.first_name && !isValidName(formData.first_name))
      nextErrors.first_name = "Enter at least 2 valid letters.";
    if (formData.last_name && !isValidName(formData.last_name))
      nextErrors.last_name = "Enter at least 2 valid letters.";
    if (formData.middle_name.trim() && !isValidName(formData.middle_name))
      nextErrors.middle_name = "Enter at least 2 valid letters.";
    if (formData.birth_date) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const selected = new Date(`${formData.birth_date}T00:00:00`);
      if (Number.isNaN(selected.getTime()) || selected > today)
        nextErrors.birth_date = "Birth date cannot be in the future.";
    }
    const phone = formData.contact_number.trim();
    if (phone && !/^\d{10,13}$/.test(phone))
      nextErrors.contact_number = "Enter 10 to 13 digits.";
    const email = formData.email_address.trim();
    if (!email || !isValidEmail(email))
      nextErrors.email_address =
        "Your account email is unavailable or invalid. Sign out and sign in again.";
    if (formData.residential_address.trim().length > 200)
      nextErrors.residential_address = "Use no more than 200 characters.";
    setFieldErrors(nextErrors);
    const invalid = Object.keys(nextErrors) as CensusValidationField[];
    if (invalid.length) {
      setError(
        "Please correct the fields highlighted in red before submitting.",
      );
      setTimeout(() => {
        const first = document.querySelector<HTMLElement>(
          `[data-field="${invalid[0]}"]`,
        );
        first?.scrollIntoView({ behavior: "smooth", block: "center" });
        first?.focus({ preventScroll: true });
      }, 0);
      return false;
    }
    return true;
  }

  async function handleSubmit() {
    setError(null);
    if (!validateForm()) return;
    if (!userId) {
      setError("Your login session has expired. Please sign in again.");
      return;
    }

    setLoading(true);
    try {
      const { data: duplicateResult, error: duplicateError } =
        await supabase.rpc("check_resident_duplicate", {
          candidate_philsys: formData.philsys_number.trim(),
          candidate_first_name: formData.first_name.trim(),
          candidate_middle_name: formData.middle_name.trim(),
          candidate_last_name: formData.last_name.trim(),
          candidate_birth_date: formData.birth_date,
        });
      if (duplicateError) throw duplicateError;
      const duplicateCheck = duplicateResult as { duplicate?: boolean } | null;
      if (duplicateCheck?.duplicate) {
        setError("User is already registered.");
        return;
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to validate duplicate resident information.",
      );
      return;
    } finally {
      setLoading(false);
    }

    const verificationKey = `pendingResidentVerification:${userId}`;
    let pendingVerification: StoredVerification | null = null;
    const pendingVerificationRaw = sessionStorage.getItem(verificationKey);
    if (pendingVerificationRaw) {
      try {
        const parsed = JSON.parse(pendingVerificationRaw) as StoredVerification;
        if (parsed.userId && parsed.userId !== userId)
          throw new Error("Verification belongs to another account.");
        pendingVerification = parsed;
      } catch {
        sessionStorage.removeItem(verificationKey);
      }
    }
    if (!pendingVerification && existingVerification)
      pendingVerification = existingVerification;

    setLoading(true);
    const newUploads: Array<{ bucket: string; path: string }> = [];
    const replacedUploads: Array<{ bucket: string; path: string }> = [];
    try {
      const effectiveGovernmentIdType =
        governmentIdType === "Other"
          ? otherGovernmentIdType.trim()
          : governmentIdType;
      let verification = pendingVerification;

      const uploadImage = async (bucket: string, file: File, label: string) => {
        const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `${userId}/${crypto.randomUUID()}-${label}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(path, file, {
            cacheControl: "3600",
            upsert: false,
            contentType: file.type,
          });
        if (uploadError) throw uploadError;
        newUploads.push({ bucket, path });
        return path;
      };

      if (governmentIdFront || governmentIdBack || capturedFaceFile) {
        const frontImagePath = governmentIdFront
          ? await uploadImage(
              "resident-verification",
              governmentIdFront,
              "id-front",
            )
          : verification?.frontImagePath;
        const backImagePath = governmentIdBack
          ? await uploadImage(
              "resident-verification",
              governmentIdBack,
              "id-back",
            )
          : verification?.backImagePath;
        const capturedFacePath = capturedFaceFile
          ? await uploadImage(
              "resident-verification",
              capturedFaceFile,
              "captured-face",
            )
          : (verification?.capturedFacePath ?? null);
        if (!frontImagePath || !backImagePath)
          throw new Error("Government ID front and back images are required.");

        if (governmentIdFront && verification?.frontImagePath)
          replacedUploads.push({
            bucket: "resident-verification",
            path: verification.frontImagePath,
          });
        if (governmentIdBack && verification?.backImagePath)
          replacedUploads.push({
            bucket: "resident-verification",
            path: verification.backImagePath,
          });
        if (capturedFaceFile && verification?.capturedFacePath)
          replacedUploads.push({
            bucket: "resident-verification",
            path: verification.capturedFacePath,
          });

        verification = {
          ...verification,
          userId: userId,
          idType: effectiveGovernmentIdType,
          frontImagePath,
          backImagePath,
          capturedFacePath,
          isMatched:
            liveVerificationResult?.matched ?? verification?.isMatched ?? false,
          matchDistance:
            liveVerificationResult?.matchDistance ??
            verification?.matchDistance ??
            0,
          similarityScore:
            liveVerificationResult?.similarityScore ??
            verification?.similarityScore,
          livenessPassed:
            liveVerificationResult?.livenessPassed ??
            verification?.livenessPassed ??
            false,
          livenessActions:
            liveVerificationResult?.livenessActions ??
            verification?.livenessActions,
          recommendation:
            liveVerificationResult?.recommendation ??
            verification?.recommendation,
          idQuality:
            liveVerificationResult?.idQuality ?? verification?.idQuality,
          verificationStatus:
            liveVerificationResult?.verificationStatus ??
            verification?.verificationStatus ??
            "skipped",
          verificationReason:
            liveVerificationResult?.verificationReason ??
            verification?.verificationReason,
          deviceType:
            liveVerificationResult?.deviceType ?? verification?.deviceType,
        };
      } else if (verification) {
        verification = {
          ...verification,
          userId: userId,
          idType: effectiveGovernmentIdType || verification.idType,
        };
      }

      let householdPhotoPath = existingHouseholdPhotoPath;
      if (householdPhoto) {
        householdPhotoPath = await uploadImage(
          "household-images",
          householdPhoto,
          "household",
        );
        if (existingHouseholdPhotoPath)
          replacedUploads.push({
            bucket: "household-images",
            path: existingHouseholdPhotoPath,
          });
      }

      const residentValues = {
        boarding_status: formData.boarding_status,
        boarding_house_name:
          formData.boarding_status !== "neither"
            ? formData.boarding_house_name.trim()
            : null,
        boarding_house_address:
          formData.boarding_status !== "neither"
            ? formData.boarding_house_address.trim()
            : null,
        boarding_landlord_name:
          formData.boarding_status === "boarder"
            ? formData.boarding_landlord_name.trim()
            : null,
        boarding_start_date:
          formData.boarding_status === "boarder"
            ? formData.boarding_start_date
            : null,
        boarding_tenant_count:
          formData.boarding_status === "landlord"
            ? Number(formData.boarding_tenant_count)
            : null,
        boarding_contact:
          formData.boarding_status === "landlord"
            ? formData.boarding_contact.trim() || null
            : null,
        region: formData.region,
        province: formData.province,
        city_municipality: formData.city_municipality,
        barangay: formData.barangay,
        philsys_number: formData.philsys_number.trim() || null,
        last_name: formData.last_name.trim(),
        first_name: formData.first_name.trim(),
        middle_name: formData.middle_name.trim() || null,
        suffix: formData.suffix.trim() || null,
        birth_date: formData.birth_date,
        birth_place: formData.birth_place.trim(),
        sex: formData.sex,
        civil_status: formData.civil_status,
        religion: formData.religion.trim() || null,
        residential_address: formData.residential_address.trim(),
        citizenship: formData.citizenship.trim(),
        profession_occupation: formData.profession_occupation.trim() || null,
        contact_number: formData.contact_number.trim() || null,
        email_address: accountEmail?.toLowerCase() ?? null,
        highest_education: formData.highest_education || null,
        education_status: formData.education_status || null,
        vocational_course: formData.vocational_course.trim() || null,
        residence_start_date: formData.residence_start_date,
        residence_classification: formData.residence_classification,
        tenurial_status: formData.tenurial_status,
        monthly_rent:
          (formData.tenurial_status === "Renter" ||
            formData.boarding_status === "boarder") &&
          formData.monthly_rent.trim()
            ? Number(formData.monthly_rent)
            : null,
        household_photo_url: householdPhotoPath,
      };

      const categoryRows = formData.categories.map((categoryId) => {
        const categoryName = categories.find(
          (item) => item.id === categoryId,
        )?.name;
        return {
          category_id: categoryId,
          indigenous_group:
            categoryName === "Indigenous People"
              ? formData.indigenous_group.trim() || null
              : null,
          other_description:
            categoryName === "Others"
              ? formData.other_description.trim() || null
              : null,
        };
      });

      const governmentChanged =
        !isEditMode ||
        Boolean(governmentIdFront || governmentIdBack) ||
        effectiveGovernmentIdType !== existingVerification?.idType;
      const faceChanged =
        !isEditMode || Boolean(capturedFaceFile || liveVerificationResult);
      const governmentIdValues =
        verification && governmentChanged
          ? {
              id_type: verification.idType,
              front_image_url: verification.frontImagePath,
              back_image_url: verification.backImagePath,
            }
          : null;
      const faceVerificationValues =
        verification && faceChanged
          ? {
              captured_face_url: verification.capturedFacePath ?? null,
              is_matched: verification.isMatched,
              match_distance: verification.matchDistance,
              similarity_score: verification.similarityScore ?? null,
              liveness_passed: verification.livenessPassed ?? false,
              liveness_actions: verification.livenessActions ?? [],
              verification_recommendation:
                verification.recommendation ?? "manual_review",
              id_quality: verification.idQuality ?? {},
              verification_status: verification.verificationStatus ?? "skipped",
              verification_reason: verification.verificationReason ?? null,
              device_type: verification.deviceType ?? null,
            }
          : null;

      const { data: savedResident, error: saveError } = await supabase.rpc(
        "save_resident_census",
        {
          p_resident: residentValues,
          p_categories: categoryRows,
          p_government_id: governmentIdValues,
          p_face_verification: faceVerificationValues,
        },
      );
      if (saveError) throw saveError;
      const saved = savedResident as {
        id?: string;
        tracking_number?: string;
      } | null;
      if (!saved?.id)
        throw new Error("The census record was not returned after saving.");

      setTrackingNumber(saved.tracking_number ?? trackingNumber);
      sessionStorage.removeItem(verificationKey);
      sessionStorage.removeItem("pendingResidentVerification");
      sessionStorage.setItem(
        "residentDashboardNotice",
        isEditMode
          ? "Your census information was updated successfully."
          : "Your census information was submitted successfully.",
      );

      for (const upload of replacedUploads) {
        await supabase.storage.from(upload.bucket).remove([upload.path]);
      }
      onDashboard();
    } catch (caughtError) {
      for (const upload of newUploads) {
        await supabase.storage.from(upload.bucket).remove([upload.path]);
      }
      const rawMessage =
        caughtError instanceof Error
          ? caughtError.message
          : typeof caughtError === "object" &&
              caughtError &&
              "message" in caughtError
            ? String((caughtError as { message?: unknown }).message ?? "")
            : "";
      let friendlyMessage =
        rawMessage ||
        (isEditMode
          ? "Failed to update census information."
          : "Failed to submit census form.");
      if (/duplicate|already registered/i.test(rawMessage))
        friendlyMessage = "User is already registered.";
      else if (/row-level security|permission denied|policy/i.test(rawMessage))
        friendlyMessage =
          "Supabase blocked the submission. Apply the included integrity migration, then try again.";
      else if (/function.*save_resident_census|schema cache/i.test(rawMessage))
        friendlyMessage =
          "Run the included integrity migration in Supabase before submitting this updated form.";
      setError(friendlyMessage);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setLoading(false);
    }
  }

  if (loadingExisting)
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-white to-pine-50">
        <div className="text-center">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-pine-600" />
          <p className="mt-3 text-sm text-slate-600">
            Loading your census information...
          </p>
        </div>
      </div>
    );
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white/90 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-5 sm:px-6">
          <button
            type="button"
            onClick={onDashboard}
            className="icon-button shrink-0 border border-slate-200 bg-white text-slate-600"
            title="Back to dashboard"
            aria-label="Back to dashboard"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <button
              type="button"
              onClick={onDashboard}
              aria-label="Barangay Old Lucban — Home"
              title="Go to Home"
              className="min-h-11 rounded-lg text-left text-sm font-semibold uppercase tracking-[0.18em] text-pine-600 underline-offset-4 hover:underline"
            >
              Barangay Old Lucban
            </button>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
              {isEditMode
                ? "Update Census Information"
                : "Individual Records of Barangay Inhabitant"}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {isEditMode
                ? "Review your existing details and save the necessary corrections."
                : "Complete all required information before submitting your census record."}
            </p>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
            <div className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              {error}
            </div>
          </div>
        )}
        <nav
          aria-label="Census form sections"
          className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-700">
              Jump to a section
            </p>
            <p className="text-xs text-slate-500">
              Required fields are marked <span className="text-red-600">*</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              ["location", "Location"],
              ["personal", "Personal information"],
              ["education", "Education"],
              ["housing", "Housing"],
              ["identity", "ID verification"],
              ["household", "Household photo"],
              ["classification", "Resident classification"],
            ].map(([id, label], number) => (
              <button
                key={id}
                type="button"
                className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700 transition hover:border-pine-300 hover:bg-pine-50"
                onClick={() => {
                  const section = document.getElementById(`census-${id}`);
                  section?.scrollIntoView({
                    behavior: window.matchMedia(
                      "(prefers-reduced-motion: reduce)",
                    ).matches
                      ? "auto"
                      : "smooth",
                    block: "start",
                  });
                  section
                    ?.querySelector<HTMLElement>("h2")
                    ?.focus({ preventScroll: true });
                }}
              >
                <span className="mr-1.5 text-earth-600">{number + 1}.</span>
                {label}
              </button>
            ))}
          </div>
        </nav>
        <div className="space-y-6 rounded-3xl border border-slate-200 bg-white p-3 shadow-sm sm:p-8">
          <section
            id="census-location"
            className="form-section rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:p-6"
          >
            <h2 tabIndex={-1} className="mb-6 text-xl font-bold">
              1. Location Information
            </h2>
            <div className="grid gap-6 md:grid-cols-2">
              {[
                ["Region", "region"],
                ["Province", "province"],
                ["City / Municipality", "city_municipality"],
                ["Barangay", "barangay"],
              ].map(([label, key]) => (
                <div key={key} className="space-y-2">
                  <label htmlFor={`census-${key}`} className="label">
                    {label}
                  </label>
                  <input
                    id={`census-${key}`}
                    data-field={key}
                    className={fieldInputClass(key as keyof CensusFormData)}
                    value={formData[key as keyof CensusFormData] as string}
                    readOnly
                  />
                </div>
              ))}
            </div>
          </section>

          <section
            id="census-personal"
            className="form-section rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:p-6"
          >
            <h2 tabIndex={-1} className="mb-6 text-xl font-bold">
              2. Personal Information
            </h2>
            <div className="grid gap-6 md:grid-cols-2">
              {[
                ["Last Name", "last_name"],
                ["First Name", "first_name"],
                ["Middle Name (Optional)", "middle_name"],
                ["Suffix (Optional)", "suffix"],
                ["Birth Place", "birth_place"],
                ["Religion", "religion"],
                ["Profession / Occupation", "profession_occupation"],
                ["Contact Number", "contact_number"],
                ["Email Address", "email_address"],
              ].map(([label, key]) => (
                <div key={key} className="space-y-2">
                  <label htmlFor={`census-${key}`} className="label">
                    {label}
                    {(REQUIRED_CENSUS_FIELDS.includes(
                      key as keyof CensusFormData,
                    ) ||
                      key === "email_address") && (
                      <span className="text-red-600"> *</span>
                    )}
                  </label>
                  <input
                    id={`census-${key}`}
                    data-field={key}
                    className={fieldInputClass(key as keyof CensusFormData)}
                    aria-invalid={Boolean(
                      fieldErrors[key as keyof CensusFormData],
                    )}
                    value={formData[key as keyof CensusFormData] as string}
                    onChange={(e) =>
                      updateField(
                        key as keyof CensusFormData,
                        key === "contact_number"
                          ? e.target.value.replace(/\D/g, "").slice(0, 13)
                          : e.target.value,
                      )
                    }
                    maxLength={
                      key === "email_address"
                        ? 254
                        : key === "contact_number"
                          ? 13
                          : key === "suffix"
                            ? 20
                            : 100
                    }
                    inputMode={key === "contact_number" ? "numeric" : undefined}
                    type={key === "email_address" ? "email" : "text"}
                    readOnly={key === "email_address"}
                    title={
                      key === "email_address"
                        ? "This email is linked to your signed-in account."
                        : undefined
                    }
                  />
                  {fieldErrors[key as keyof CensusFormData] && (
                    <p className="text-xs font-semibold text-red-600">
                      {fieldErrors[key as keyof CensusFormData]}
                    </p>
                  )}
                </div>
              ))}
              <div className="space-y-2">
                <label htmlFor="census-birth_date" className="label">
                  Birth Date <span className="text-red-600">*</span>
                </label>
                <input
                  id="census-birth_date"
                  type="date"
                  max={new Date().toISOString().split("T")[0]}
                  data-field="birth_date"
                  className={fieldInputClass("birth_date")}
                  value={formData.birth_date}
                  onChange={(e) => updateField("birth_date", e.target.value)}
                />
                {fieldErrors.birth_date && (
                  <p className="text-xs font-semibold text-red-600">
                    {fieldErrors.birth_date}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <label htmlFor="census-age" className="label">
                  Age
                </label>
                <input
                  id="census-age"
                  className="input"
                  readOnly
                  value={age ? `${age} years old` : ""}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="census-sex" className="label">
                  Sex <span className="text-red-600">*</span>
                </label>
                <select
                  id="census-sex"
                  data-field="sex"
                  className={fieldInputClass("sex")}
                  value={formData.sex}
                  onChange={(e) => updateField("sex", e.target.value as Sex)}
                >
                  {SEX_OPTIONS.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label htmlFor="census-civil_status" className="label">
                  Civil Status <span className="text-red-600">*</span>
                </label>
                <select
                  id="census-civil_status"
                  data-field="civil_status"
                  className={fieldInputClass("civil_status")}
                  value={formData.civil_status}
                  onChange={(e) =>
                    updateField("civil_status", e.target.value as CivilStatus)
                  }
                >
                  <option value="">Select</option>
                  {CIVIL_STATUS_OPTIONS.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <label htmlFor="census-residential_address" className="label">
                  Residential Address <span className="text-red-600">*</span>
                </label>
                <textarea
                  id="census-residential_address"
                  data-field="residential_address"
                  className={fieldInputClass("residential_address")}
                  value={formData.residential_address}
                  onChange={(e) =>
                    updateField("residential_address", e.target.value)
                  }
                />
                {fieldErrors.residential_address && (
                  <p className="text-xs font-semibold text-red-600">
                    {fieldErrors.residential_address}
                  </p>
                )}
              </div>
            </div>
          </section>

          <section
            id="census-education"
            className="form-section rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:p-6"
          >
            <h2 tabIndex={-1} className="mb-6 text-xl font-bold">
              3. Education
            </h2>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="census-highest_education" className="label">
                  Highest Education <span className="text-red-500">*</span>
                </label>
                <select
                  id="census-highest_education"
                  data-field="highest_education"
                  className={fieldInputClass("highest_education")}
                  value={formData.highest_education}
                  onChange={(e) =>
                    updateEducationLevel(e.target.value as EducationLevel | "")
                  }
                >
                  <option value="">Select highest education</option>
                  {EDUCATION_OPTIONS.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
                {fieldErrors.highest_education && (
                  <p className="text-xs font-semibold text-red-600">
                    {fieldErrors.highest_education}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <label htmlFor="census-education_status" className="label">
                  Education Status <span className="text-red-500">*</span>
                </label>
                <select
                  id="census-education_status"
                  data-field="education_status"
                  className={fieldInputClass("education_status")}
                  value={formData.education_status}
                  onChange={(e) =>
                    updateEducationStatus(
                      e.target.value as EducationStatus | "",
                    )
                  }
                >
                  <option value="">Select education status</option>
                  {EDUCATION_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {fieldErrors.education_status && (
                  <p className="text-xs font-semibold text-red-600">
                    {fieldErrors.education_status}
                  </p>
                )}
              </div>
            </div>
          </section>

          <section
            id="census-housing"
            className="form-section rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:p-6"
          >
            <h2 tabIndex={-1} className="mb-6 text-xl font-bold">
              4. Tenurial Status <span className="text-red-600">*</span>
            </h2>
            <div className="mb-6 grid gap-4 sm:grid-cols-2">
              <label className="label">
                Residence start date <span className="text-red-600">*</span>
                <input
                  type="date"
                  required
                  disabled={residenceLocked}
                  max={new Intl.DateTimeFormat("en-CA", {
                    timeZone: "Asia/Manila",
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                  }).format(new Date())}
                  value={formData.residence_start_date}
                  data-field="residence_start_date"
                  className={`input mt-2 ${fieldErrors.residence_start_date ? "border-red-500 bg-red-50" : ""}`}
                  onChange={(e) => {
                    setFormData((p) => ({
                      ...p,
                      residence_start_date: e.target.value,
                    }));
                    clearFieldError("residence_start_date");
                  }}
                />
                {fieldErrors.residence_start_date && (
                  <span className="text-xs text-red-600">
                    {fieldErrors.residence_start_date}
                  </span>
                )}
              </label>
              <label className="label">
                Classification when residence started{" "}
                <span className="text-red-600">*</span>
                <select
                  required
                  disabled={residenceLocked}
                  data-field="residence_classification"
                  className={`input mt-2 ${fieldErrors.residence_classification ? "border-red-500 bg-red-50" : ""}`}
                  value={formData.residence_classification}
                  onChange={(e) => {
                    setFormData((p) => ({
                      ...p,
                      residence_classification: e.target.value as
                        "temporary" | "resident",
                    }));
                    clearFieldError("residence_classification");
                  }}
                >
                  <option value="">Select classification</option>
                  <option value="temporary">Temporary resident</option>
                  <option value="resident">Resident</option>
                </select>
                {fieldErrors.residence_classification && (
                  <span className="text-xs text-red-600">
                    {fieldErrors.residence_classification}
                  </span>
                )}
              </label>
              <p className="text-sm text-slate-500 sm:col-span-2">
                Temporary residents become residents after six calendar months
                of continuous residence. The recorded start date and original
                classification are preserved. Boarding-house occupancy is
                tracked separately.
              </p>
            </div>
            <div
              data-field="tenurial_status"
              role="radiogroup"
              aria-label="Tenurial status"
              aria-required="true"
              aria-invalid={Boolean(fieldErrors.tenurial_status)}
              className={`grid gap-4 rounded-2xl md:grid-cols-2 ${fieldErrors.tenurial_status ? "border border-red-500 bg-red-50 p-3" : ""}`}
            >
              {TENURIAL_STATUS_OPTIONS.map((status) => (
                <label
                  key={status}
                  className="flex cursor-pointer items-center rounded-xl border border-slate-200 bg-white p-4 hover:border-pine-300"
                >
                  <input
                    type="radio"
                    name="tenure"
                    checked={formData.tenurial_status === status}
                    onChange={() => {
                      setFormData((current) => ({
                        ...current,
                        tenurial_status: status,
                        monthly_rent:
                          status === "Renter" ||
                          current.boarding_status === "boarder"
                            ? current.monthly_rent
                            : "",
                      }));
                      clearFieldError("tenurial_status");
                      if (
                        status !== "Renter" &&
                        formData.boarding_status !== "boarder"
                      )
                        clearFieldError("monthly_rent");
                    }}
                  />
                  <span className="ml-2">{status}</span>
                </label>
              ))}
            </div>
            {fieldErrors.tenurial_status && (
              <p className="mt-2 text-xs font-semibold text-red-600">
                {fieldErrors.tenurial_status}
              </p>
            )}
            {formData.tenurial_status === "Renter" &&
              formData.boarding_status !== "boarder" && (
                <div className="mt-6 max-w-md rounded-2xl border border-pine-200 bg-pine-50/70 p-5">
                  <label htmlFor="census-monthly_rent" className="label">
                    Monthly Rent (PHP) <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="census-monthly_rent"
                    type="number"
                    min="1"
                    step="0.01"
                    value={formData.monthly_rent}
                    onChange={(e) =>
                      updateField("monthly_rent", e.target.value)
                    }
                    data-field="monthly_rent"
                    className={fieldInputClass("monthly_rent")}
                    placeholder="Example: 5000"
                  />
                  {fieldErrors.monthly_rent && (
                    <p className="mt-2 text-xs font-semibold text-red-600">
                      {fieldErrors.monthly_rent}
                    </p>
                  )}
                </div>
              )}
            <BoardingFormFields
              data={formData}
              errors={fieldErrors}
              onChange={updateField}
              onStatusChange={(status) => {
                setFormData((previous) => ({
                  ...previous,
                  ...EMPTY_BOARDING_FIELDS,
                  boarding_status: status,
                  monthly_rent:
                    previous.boarding_status === "boarder"
                      ? ""
                      : previous.monthly_rent,
                }));
                for (const field of [
                  "boarding_status",
                  ...Object.keys(EMPTY_BOARDING_FIELDS),
                  "monthly_rent",
                ] as CensusValidationField[])
                  clearFieldError(field);
              }}
            />
          </section>

          <section
            id="census-identity"
            className="form-section rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:p-6"
          >
            <div className="mb-6 flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-pine-100 text-pine-700">
                <ShieldCheck size={23} />
              </div>
              <div>
                <h2 tabIndex={-1} className="text-xl font-bold">
                  5. Identity Verification
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Upload or automatically capture clear images of your
                  government ID, then complete live face verification.
                </p>
              </div>
            </div>
            <div className="mb-6 max-w-md space-y-2">
              <label htmlFor="census-governmentIdType" className="label">
                Government ID Type <span className="text-red-600">*</span>
              </label>
              <select
                id="census-governmentIdType"
                data-field="governmentIdType"
                className={fieldInputClass("governmentIdType")}
                value={governmentIdType}
                onChange={(e) => {
                  setGovernmentIdType(e.target.value);
                  clearFieldError("governmentIdType");
                  if (e.target.value !== "Other") setOtherGovernmentIdType("");
                }}
              >
                <option value="">Select government ID</option>
                {GOVERNMENT_ID_OPTIONS.map((idType) => (
                  <option key={idType}>{idType}</option>
                ))}
                <option value="Other">Other</option>
              </select>
              {governmentIdType === "Other" && (
                <div className="pt-2">
                  <label
                    htmlFor="census-otherGovernmentIdType"
                    className="label"
                  >
                    Specify Other ID <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="census-otherGovernmentIdType"
                    data-field="otherGovernmentIdType"
                    className={fieldInputClass("otherGovernmentIdType")}
                    value={otherGovernmentIdType}
                    onChange={(e) => {
                      setOtherGovernmentIdType(e.target.value);
                      clearFieldError("otherGovernmentIdType");
                    }}
                  />
                </div>
              )}
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              {[
                {
                  key: "front",
                  title: "Government ID Front",
                  preview: governmentIdFrontPreview,
                },
                {
                  key: "back",
                  title: "Government ID Back",
                  preview: governmentIdBackPreview,
                },
              ].map((item) => {
                const validationField =
                  item.key === "front"
                    ? "governmentIdFront"
                    : "governmentIdBack";
                return (
                  <div
                    key={item.key}
                    data-field={validationField}
                    className={`overflow-hidden rounded-2xl border bg-white ${fieldErrors[validationField] ? "border-red-500" : "border-slate-200"}`}
                  >
                    <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 font-semibold">
                      <CreditCard size={18} className="text-pine-600" />
                      {item.title} <span className="text-red-600">*</span>
                    </div>
                    <div className="p-4">
                      {item.preview ? (
                        <img
                          src={item.preview}
                          alt={item.title}
                          className="h-44 w-full rounded-xl border border-slate-200 object-cover"
                        />
                      ) : (
                        <div className="flex h-44 items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
                          No image selected
                        </div>
                      )}
                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-pine-200 bg-pine-50 px-4 py-2.5 text-sm font-semibold text-pine-700">
                          <Upload size={18} />
                          {item.preview ? "Replace file" : "Upload file"}
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="hidden"
                            onChange={(e) =>
                              updateVerificationImage(
                                e.target.files?.[0],
                                item.key as "front" | "back",
                              )
                            }
                          />
                        </label>
                        <IdCameraCapture
                          side={item.key as "front" | "back"}
                          disabled={loading}
                          onCapture={(file) =>
                            updateVerificationImage(
                              file,
                              item.key as "front" | "back",
                            )
                          }
                        />
                      </div>
                      {fieldErrors[validationField] && (
                        <p className="mt-2 text-xs font-semibold text-red-600">
                          {fieldErrors[validationField]}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div
              data-field="liveVerification"
              className={`mt-5 rounded-2xl ${fieldErrors.liveVerification ? "border border-red-500 bg-red-50 p-3" : ""}`}
            >
              <FaceIdentityVerification
                idFrontFile={governmentIdFront}
                idFrontPreview={governmentIdFrontPreview}
                disabled={loading}
                autoStart={Boolean(
                  governmentIdFront && governmentIdBackPreview,
                )}
                onReset={() => {
                  setLiveVerificationResult(null);
                  setCapturedFaceFile(null);
                  if (capturedFacePreview.startsWith("blob:"))
                    URL.revokeObjectURL(capturedFacePreview);
                  setCapturedFacePreview("");
                  clearFieldError("liveVerification");
                }}
                onVerified={(result) => {
                  setLiveVerificationResult(result);
                  setCapturedFaceFile(result.file);
                  if (capturedFacePreview.startsWith("blob:"))
                    URL.revokeObjectURL(capturedFacePreview);
                  setCapturedFacePreview(
                    result.file ? URL.createObjectURL(result.file) : "",
                  );
                  clearFieldError("liveVerification");
                  setExistingVerification((current) =>
                    current
                      ? {
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
                        }
                      : current,
                  );
                }}
              />
              {fieldErrors.liveVerification && (
                <p className="mt-2 text-xs font-semibold text-red-600">
                  {fieldErrors.liveVerification}
                </p>
              )}
            </div>
            {capturedFacePreview && (
              <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white p-3">
                <p className="mb-2 text-sm font-semibold">Captured live face</p>
                <img
                  src={capturedFacePreview}
                  alt="Captured live applicant face"
                  className="h-56 w-full rounded-xl object-cover"
                />
              </div>
            )}
          </section>

          <section
            id="census-household"
            className="form-section rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:p-6"
          >
            <h2 tabIndex={-1} className="text-xl font-bold">
              6. House / Household Photo <span className="text-red-600">*</span>
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Upload a clear picture of the resident's house or household.
              Maximum file size: 8 MB.
            </p>
            {householdPhotoPreview ? (
              <div className="relative mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <img
                  src={householdPhotoPreview}
                  alt="House or household preview"
                  className="h-72 w-full object-cover"
                />
                {(!isEditMode || !existingHouseholdPhotoPath) && (
                  <button
                    type="button"
                    onClick={removeHouseholdPhoto}
                    className="absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/95 text-red-600 shadow-lg"
                  >
                    <X className="h-5 w-5" />
                  </button>
                )}
                <label className="absolute bottom-3 left-3 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-white/95 px-4 py-2.5 text-sm font-semibold text-pine-700 shadow-lg">
                  <Upload className="h-4 w-4" />
                  Replace image
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) =>
                      handleHouseholdPhotoChange(e.target.files?.[0])
                    }
                  />
                </label>
              </div>
            ) : (
              <label
                data-field="householdPhoto"
                className={`mt-5 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center ${fieldErrors.householdPhoto ? "border-red-500 bg-red-50" : "border-slate-300 bg-white"}`}
              >
                <ImageIcon className="h-9 w-9 text-pine-700" />
                <p className="mt-4 font-semibold">
                  Upload house or household picture
                </p>
                <span className="mt-4 inline-flex items-center gap-2 rounded-xl bg-pine-600 px-4 py-2.5 text-sm font-semibold text-white">
                  <Upload className="h-4 w-4" />
                  Select Image
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) =>
                    handleHouseholdPhotoChange(e.target.files?.[0])
                  }
                />
              </label>
            )}
          </section>

          <section
            id="census-classification"
            className="form-section rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:p-6"
          >
            <h2 tabIndex={-1} className="mb-6 text-xl font-bold">
              7. Resident Classification
            </h2>
            <div className="grid gap-4 md:grid-cols-3">
              {[...CATEGORY_CONFIG.main, ...CATEGORY_CONFIG.other].map(
                (cat) => (
                  <label
                    key={cat}
                    className="flex items-center rounded-xl border border-slate-200 bg-white p-4"
                  >
                    <input
                      type="checkbox"
                      checked={isCategorySelected(cat)}
                      onChange={() => toggleCategory(cat)}
                    />
                    <span className="ml-2">{categoryLabel(cat)}</span>
                  </label>
                ),
              )}
            </div>
            {(isCategorySelected("Indigenous People") ||
              isCategorySelected("Others")) && (
              <div className="mt-6 grid gap-5 md:grid-cols-2">
                {isCategorySelected("Indigenous People") && (
                  <div className="space-y-2">
                    <label htmlFor="census-indigenous_group" className="label">
                      Indigenous Group <span className="text-red-600">*</span>
                    </label>
                    <input
                      id="census-indigenous_group"
                      data-field="indigenous_group"
                      className={fieldInputClass("indigenous_group")}
                      value={formData.indigenous_group}
                      onChange={(e) =>
                        updateField("indigenous_group", e.target.value)
                      }
                    />
                  </div>
                )}
                {isCategorySelected("Others") && (
                  <div className="space-y-2">
                    <label htmlFor="census-other_description" className="label">
                      Other Resident Classification Description{" "}
                      <span className="text-red-600">*</span>
                    </label>
                    <input
                      id="census-other_description"
                      data-field="other_description"
                      className={fieldInputClass("other_description")}
                      value={formData.other_description}
                      onChange={(e) =>
                        updateField("other_description", e.target.value)
                      }
                    />
                  </div>
                )}
              </div>
            )}
          </section>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || loadingExisting}
            className="btn-primary w-full py-4"
          >
            {loading ? (
              <Loader2 className="animate-spin" />
            ) : (
              <>
                {isEditMode ? (
                  <Save className="h-5 w-5" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
                {isEditMode ? "Save Census Updates" : "Submit Census Form"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
