export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Sex = 'Male' | 'Female';

export type CivilStatus =
  | 'Single'
  | 'Married'
  | 'Widowed'
  | 'Separated'
  | 'Divorced'
  | 'Live-in';

export type EducationLevel =
  | 'No Formal Education'
  | 'Pre-School'
  | 'Kindergarten'
  | 'Elementary'
  | 'High School'
  | 'Junior High School'
  | 'Senior High School'
  | 'Vocational'
  | 'College'
  | 'Post Graduate'
  | "Master's Degree"
  | 'Doctorate';

export type EducationStatus =
  | 'Currently Studying'
  | 'Completed'
  | 'Not Currently Studying'
  | 'No Formal Education';

export type TenurialStatus =
  | 'House Owner'
  | 'Sharer'
  | 'Caretaker'
  | 'Renter'
  | 'Owned'
  | 'Rented'
  | 'Rent Free'
  | 'Living with Relatives'
  | 'Informal Settler'
  | 'Others';

export type Category =
  | 'None'
  | 'Senior Citizen'
  | 'PWD'
  | 'Solo Parent'
  | '4Ps Beneficiary'
  | 'Indigenous People'
  | 'Youth'
  | 'OFW'
  | 'Pregnant Woman';

export type ResidentStatus =
  | 'pending_review'
  | 'verified'
  | 'returned'
  | 'rejected';

export interface CategoryRow {
  id: number;
  name: Category | string;
}

export interface Resident {
  id: string;
  user_id?: string;
  tracking_number: string;
  region?: string;
  province: string;
  city_municipality: string;
  barangay: string;
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  suffix?: string | null;
  birth_date: string;
  birth_place: string;
  sex: Sex;
  civil_status: CivilStatus | string;
  religion?: string | null;
  citizenship: string;
  philsys_number?: string | null;
  residential_address: string;
  contact_number?: string | null;
  email_address?: string | null;
  profession_occupation?: string | null;
  highest_education?: string | null;
  education_status?: string | null;
  vocational_course?: string | null;
  tenurial_status?: string | null;
  monthly_rent?: number | null;
  household_photo_url?: string | null;
  status: ResidentStatus;
  submitted_at: string;
}

export interface GovernmentId {
  id: string;
  resident_id: string;
  id_type: string;
  id_number?: string | null;
  front_image_url?: string | null;
  back_image_url?: string | null;
}

export interface FaceVerification {
  id: string;
  resident_id: string;
  captured_face_url?: string | null;
  is_matched: boolean;
  match_distance?: number | null;
  similarity_score?: number | null;
  liveness_passed?: boolean | null;
  liveness_actions?: string[] | null;
  verification_recommendation?: 'match' | 'manual_review' | 'retry' | string | null;
  id_quality?: { brightness?: number; blurVariance?: number; faceAreaRatio?: number; detectedFaces?: number } | null;
  verification_status?: 'passed' | 'skipped' | null;
  verification_reason?: string | null;
  device_type?: string | null;
}

export interface Remark {
  id: string;
  resident_id: string;
  admin_id: string;
  remark_text: string;
  status_change: string;
  created_at: string;
}

export type AnnouncementPriority = 'info' | 'important' | 'urgent';

export type AnnouncementAudience =
  | 'all'
  | 'pending_review'
  | 'verified'
  | 'returned'
  | 'rejected';

export interface Announcement {
  id: string;
  title: string;
  message: string;
  priority: AnnouncementPriority;
  audience: AnnouncementAudience;
  is_published: boolean;
  published_at: string;
  expires_at?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminProfile {
  id?: string;
  user_id: string;
  full_name?: string | null;
  role?: string | null;
  is_active?: boolean | null;
  created_at?: string;
}

type AnyTable = {
  Row: any;
  Insert: any;
  Update: any;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      residents: AnyTable;
      categories: AnyTable;
      resident_categories: AnyTable;
      government_ids: AnyTable;
      face_verifications: AnyTable;
      remarks: AnyTable;
      notifications: AnyTable;
      audit_logs: AnyTable;
      admin_profiles: AnyTable;
      announcements: AnyTable;
    };
    Views: Record<string, never>;
    Functions: {
      check_registration_email: {
        Args: { candidate_email: string };
        Returns: Json;
      };
      check_resident_duplicate: {
        Args: {
          candidate_philsys: string;
          candidate_first_name: string;
          candidate_middle_name: string;
          candidate_last_name: string;
          candidate_birth_date: string;
        };
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
