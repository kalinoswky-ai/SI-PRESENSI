export type EmployeeRole = "employee" | "admin";

export interface Employee {
  id: string;
  nip: string;
  full_name: string;
  position: string | null;
  email: string;
  role: EmployeeRole;
  face_descriptor: number[] | null;
  photo_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Office {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
  work_start: string; // "07:00"
  work_end: string; // "14:30"
  friday_hybrid: boolean;
  updated_at: string;
}

export type AttendanceType = "in" | "out";
export type AttendanceStatus = "valid" | "rejected";

export interface AttendanceRecord {
  id: string;
  employee_id: string;
  type: AttendanceType;
  server_time: string;
  latitude: number;
  longitude: number;
  distance_meters: number;
  within_geofence: boolean;
  face_match: boolean;
  face_distance: number | null;
  selfie_url: string | null;
  status: AttendanceStatus;
  reject_reason: string | null;
  is_late: boolean;
  created_at: string;
  employees?: Pick<Employee, "full_name" | "nip" | "position">;
}
