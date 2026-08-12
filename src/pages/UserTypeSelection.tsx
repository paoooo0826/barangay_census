import { Users, ShieldCheck } from "lucide-react";

interface UserTypeSelectionProps {
  onResident: () => void;
  onAdmin: () => void;
}

export default function UserTypeSelection({
  onResident,
  onAdmin,
}: UserTypeSelectionProps) {

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">

      <div className="bg-white shadow-xl rounded-xl p-10 w-full max-w-md">

        <h1 className="text-3xl font-bold text-center mb-3">
          Barangay Census System
        </h1>

        <p className="text-gray-500 text-center mb-8">
          Select your account type
        </p>


        <button
          onClick={onResident}
          className="w-full flex items-center gap-4 p-5 mb-4 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
        >
          <Users size={32}/>

          <div className="text-left">
            <h2 className="font-bold text-lg">
              Resident
            </h2>

            <p className="text-sm">
              Register or login as resident
            </p>
          </div>

        </button>



        <button
          onClick={onAdmin}
          className="w-full flex items-center gap-4 p-5 rounded-lg bg-green-600 text-white hover:bg-green-700"
        >

          <ShieldCheck size={32}/>

          <div className="text-left">
            <h2 className="font-bold text-lg">
              Administrator
            </h2>

            <p className="text-sm">
              Barangay admin access
            </p>
          </div>

        </button>


      </div>

    </div>
  );
}
