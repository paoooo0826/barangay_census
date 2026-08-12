import { useState } from "react";
import { ArrowLeft, Mail, Lock, User, Loader2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

interface ResidentAuthProps {
  onBack: () => void;
  onLoginSuccess: (destination: 'dashboard' | 'census') => void;
  onRegisterClick: () => void;
}

export default function ResidentAuth({
  onBack,
  onLoginSuccess,
  onRegisterClick,
}: ResidentAuthProps) {

  const { signIn, signUp } = useAuth();
  const [isLogin, setIsLogin] = useState(true);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      setError("Email and password are required");
      return;
    }

    if (!isLogin && password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (!isLogin && password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);

    try {
      if (isLogin) {
        const { error: authError } = await signIn(normalizedEmail, password);

        if (authError) {
          setError(authError.message);
          return;
        }

        const { data: authData } = await supabase.auth.getUser();
        const signedInUser = authData.user;

        if (!signedInUser) {
          setError("Unable to verify the signed-in account.");
          return;
        }

        const { data: existingResident, error: residentError } = await supabase
          .from("residents")
          .select("id")
          .eq("user_id", signedInUser.id)
          .maybeSingle();

        if (residentError) {
          setError(residentError.message);
          return;
        }

        onLoginSuccess(existingResident ? "dashboard" : "census");
        return;
      }

      const result = await signUp(normalizedEmail, password);

      if (result.error) {
        setError(result.error.message);
        return;
      }

      if (result.needsEmailConfirmation) {
        setSuccess(
          "Account created. Check your email to confirm your account, then sign in.",
        );
        setIsLogin(true);
        setPassword("");
        setConfirmPassword("");
        return;
      }

      setSuccess("Account created successfully. Continue with ID verification.");
      onRegisterClick();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };


  return (

    <div className="
      min-h-screen 
      bg-gradient-to-br 
      from-gray-50 
      to-blue-50
      flex 
      items-center 
      justify-center 
      p-4
    ">


      <div className="w-full max-w-md">


        <button
          onClick={onBack}
          className="
          flex items-center gap-2
          text-gray-600
          hover:text-blue-600
          mb-8
          "
        >

          <ArrowLeft size={20}/>
          Back

        </button>



        <div className="
          bg-white
          rounded-2xl
          shadow-xl
          p-8
        ">


          {/* Header */}

          <div className="text-center mb-8">


            <div className="
              inline-flex
              items-center
              justify-center
              w-16
              h-16
              rounded-2xl
              bg-blue-100
              mb-4
            ">

              <User 
                className="text-blue-600"
                size={32}
              />

            </div>


            <h1 className="
              text-2xl
              font-bold
              text-gray-900
            ">

              {isLogin 
              ? "Resident Login"
              : "Create Account"}

            </h1>


            <p className="text-gray-500 mt-2">

              {isLogin
              ? "Sign in to track your census application"
              : "Create an account to start registration"}

            </p>


          </div>




          {/* Messages */}

          {error && (

            <div className="
              bg-red-100
              text-red-700
              p-3
              rounded-lg
              mb-5
              text-sm
            ">

              {error}

            </div>

          )}



          {success && (

            <div className="
              bg-green-100
              text-green-700
              p-3
              rounded-lg
              mb-5
              text-sm
            ">

              {success}

            </div>

          )}






          <form 
            onSubmit={handleSubmit}
            className="space-y-5"
          >


            <div>

              <label className="block mb-1 text-sm font-medium">
                Email Address
              </label>


              <div className="relative">


                <Mail 
                  className="
                  absolute
                  left-3
                  top-3
                  text-gray-400
                  "
                  size={20}
                />


                <input

                  type="email"

                  value={email}

                  onChange={(e)=>
                    setEmail(e.target.value)
                  }

                  placeholder="your@email.com"

                  className="
                  w-full
                  border
                  rounded-xl
                  py-3
                  pl-10
                  px-4
                  focus:ring-2
                  focus:ring-blue-500
                  outline-none
                  "

                />


              </div>

            </div>





            <div>

              <label className="block mb-1 text-sm font-medium">
                Password
              </label>


              <div className="relative">

                <Lock
                  className="
                  absolute
                  left-3
                  top-3
                  text-gray-400
                  "
                  size={20}
                />


                <input

                  type="password"

                  value={password}

                  onChange={(e)=>
                    setPassword(e.target.value)
                  }


                  placeholder="Password"


                  className="
                  w-full
                  border
                  rounded-xl
                  py-3
                  pl-10
                  px-4
                  focus:ring-2
                  focus:ring-blue-500
                  outline-none
                  "

                />


              </div>


            </div>




            {!isLogin && (

              <input

                type="password"

                value={confirmPassword}

                onChange={(e)=>
                  setConfirmPassword(e.target.value)
                }


                placeholder="Confirm Password"


                className="
                w-full
                border
                rounded-xl
                py-3
                px-4
                "

              />

            )}






            <button

              disabled={loading}

              className="
              w-full
              bg-blue-600
              text-white
              py-3
              rounded-xl
              font-semibold
              hover:bg-blue-700
              transition
              flex
              justify-center
              "

            >

              {loading ? (

                <Loader2 
                  className="animate-spin"
                />

              ) : (

                isLogin 
                ? "Sign In"
                : "Create Account"

              )}


            </button>


          </form>






          <div className="mt-6 text-center">


            <p className="text-gray-500">


              {isLogin
              ?"Don't have an account?"
              :"Already have an account?"}


              <button

                onClick={()=>{

                  setIsLogin(!isLogin);
                  setError("");
                  setSuccess("");

                }}

                className="
                ml-2
                text-blue-600
                font-semibold
                "

              >

                {isLogin
                ?"Register"
                :"Login"}

              </button>


            </p>


          </div>



        </div>


      </div>


    </div>

  );

}
