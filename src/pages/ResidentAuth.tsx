import { useState } from "react";
import { ArrowLeft, Mail, Lock, User, Loader2, KeyRound } from "lucide-react";
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
  const [isForgotPassword, setIsForgotPassword] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [registrationReady, setRegistrationReady] = useState(false);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setRegistrationReady(false);

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError("Enter the email address connected to your resident account.");
      return;
    }

    setLoading(true);

    try {
      const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}?password-reset=1`;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        normalizedEmail,
        { redirectTo },
      );

      if (resetError) throw resetError;

      setSuccess(
        "If an account uses that email, a password-reset link has been sent. Check your inbox and spam folder.",
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to send the reset email. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };


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
          "Successfully registered! Check your email to confirm your account, then sign in.",
        );
        setIsLogin(true);
        setPassword("");
        setConfirmPassword("");
        return;
      }

      setSuccess("Successfully registered! You may now continue with ID verification.");
      setRegistrationReady(true);
      setPassword("");
      setConfirmPassword("");
      return;
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

              {isForgotPassword
              ? "Reset Password"
              : isLogin 
              ? "Resident Login"
              : "Create Account"}

            </h1>


            <p className="text-gray-500 mt-2">

              {isForgotPassword
              ? "Enter your account email and we'll send you a secure reset link"
              : isLogin
              ? "Sign in to track your census application"
              : "Create an account to start registration"}

            </p>


          </div>




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

              {registrationReady && (
                <button
                  type="button"
                  onClick={onRegisterClick}
                  className="mt-3 w-full rounded-lg bg-green-700 px-4 py-2 font-semibold text-white transition hover:bg-green-800"
                >
                  Continue to ID Verification
                </button>
              )}

            </div>

          )}






          <form 
            onSubmit={isForgotPassword ? handleForgotPassword : handleSubmit}
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





            {!isForgotPassword && <div>

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


            </div>}




            {!isForgotPassword && !isLogin && (

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

                isForgotPassword
                ? "Send Reset Link"
                : isLogin 
                ? "Sign In"
                : "Create Account"

              )}


            </button>


          </form>

          {isLogin && !isForgotPassword && (
            <button
              type="button"
              onClick={() => {
                setIsForgotPassword(true);
                setError("");
                setSuccess("");
                setRegistrationReady(false);
                setPassword("");
              }}
              className="mt-4 flex w-full items-center justify-center gap-2 text-sm font-semibold text-blue-600 transition hover:text-blue-800"
            >
              <KeyRound size={16} />
              Forgot password?
            </button>
          )}

          {isForgotPassword && (
            <button
              type="button"
              onClick={() => {
                setIsForgotPassword(false);
                setError("");
                setSuccess("");
                setRegistrationReady(false);
              }}
              className="mt-4 flex w-full items-center justify-center gap-2 text-sm font-semibold text-slate-600 transition hover:text-blue-700"
            >
              <ArrowLeft size={16} />
              Back to resident login
            </button>
          )}






          {!isForgotPassword && <div className="mt-6 text-center">


            <p className="text-gray-500">


              {isLogin
              ?"Don't have an account?"
              :"Already have an account?"}


              <button

                onClick={()=>{

                  setIsLogin(!isLogin);
                  setIsForgotPassword(false);
                  setError("");
                  setSuccess("");
                  setRegistrationReady(false);

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


          </div>}



        </div>


      </div>


    </div>

  );

}
