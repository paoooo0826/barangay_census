import { useState, useEffect } from 'react';
import { Shield, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

interface AdminSetupProps {
  onNavigate: (path: string) => void;
}

export default function AdminSetup({ onNavigate }: AdminSetupProps) {
  const { signUp } = useAuth();

  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [adminExists, setAdminExists] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);


  useEffect(() => {
    checkIfAdminExists();
  }, []);


  const checkIfAdminExists = async () => {

    try {

      const { count, error } = await supabase
        .from('admin_profiles')
        .select('*',{count:'exact',head:true});


      if(error){
        console.error(error);
        return;
      }


      setAdminExists((count ?? 0) > 0);


    } catch(err){

      console.error(err);

    } finally {

      setCheckingAdmin(false);

    }

  };



  const handleCreateAdmin = async (
    e:React.FormEvent
  )=>{

    e.preventDefault();

    setError(null);



    if(!email || !password || !fullName){

      setError(
        "All fields are required"
      );

      return;

    }



    if(password !== confirmPassword){

      setError(
        "Passwords do not match"
      );

      return;

    }



    if(password.length < 6){

      setError(
        "Password must be at least 6 characters"
      );

      return;

    }



    setLoading(true);



    try{


      const {count}=await supabase
      .from('admin_profiles')
      .select('*',{count:'exact',head:true});



      if((count ?? 0)>0){

        setError(
          "Admin account already exists"
        );

        setLoading(false);

        return;

      }



      const {data,error:signupError}=await signUp(
        email,
        password
      );



      if(signupError){

        setError(signupError.message);

        setLoading(false);

        return;

      }



      const userId =
        data?.user?.id;



      if(!userId){

        setError(
          "Account created but user ID was not found"
        );

        setLoading(false);

        return;

      }
            const {error:profileError}=await supabase
        .from('admin_profiles')
        .insert({

          user_id:userId,

          full_name:fullName,

          position:
          'Barangay Administrator',

          is_active:true,

        });



      if(profileError){

        console.error(profileError);

        setError(
          "Failed to create admin profile. Check database permissions."
        );

        setLoading(false);

        return;

      }



      setSuccess(true);



      setTimeout(()=>{

        onNavigate('/admin/dashboard');

      },2000);



    }catch(err){

      console.error(err);

      setError(
        "Unexpected error occurred"
      );


    }finally{

      setLoading(false);

    }


  };





  if(checkingAdmin){

    return(

      <div className="
      min-h-screen 
      bg-gradient-to-br 
      from-gray-50 
      to-amber-50
      flex 
      items-center 
      justify-center
      ">

        <div className="text-center">

          <Loader2 
          className="
          w-10 
          h-10 
          animate-spin 
          mx-auto 
          mb-4 
          text-accent
          "
          />

          <p className="text-gray-600">
            Checking system status...
          </p>

        </div>

      </div>

    );

  }





  if(adminExists){

    return(

      <div className="
      min-h-screen
      bg-gradient-to-br
      from-gray-50
      to-amber-50
      flex
      items-center
      justify-center
      p-4
      ">


        <div className="
        card 
        p-8 
        max-w-md 
        w-full 
        text-center
        ">


          <CheckCircle2
          className="
          w-16
          h-16
          mx-auto
          mb-4
          text-green-600
          "
          />


          <h2 className="
          text-xl
          font-semibold
          mb-2
          ">
            System Ready
          </h2>


          <p className="
          text-gray-600
          mb-6
          ">
            An admin account already exists.
          </p>


          <button

          onClick={() => onNavigate('/admin')}

          className="
          btn
          btn-primary
          ">

            Go To Admin Login

          </button>


        </div>


      </div>

    );

  }





  if(success){

    return(

      <div className="
      min-h-screen
      bg-green-50
      flex
      items-center
      justify-center
      p-4
      ">

        <div className="
        card
        p-8
        max-w-md
        text-center
        ">


          <CheckCircle2
          className="
          w-16
          h-16
          mx-auto
          mb-4
          text-green-600
          "
          />


          <h2 className="
          text-xl
          font-bold
          mb-3
          ">
            Admin Account Created
          </h2>


          <p>
            Redirecting to dashboard...
          </p>


          <Loader2
          className="
          animate-spin
          mx-auto
          mt-4
          "
          />


        </div>

      </div>

    );

  }





  return(

    <div className="
    min-h-screen
    bg-gradient-to-br
    from-gray-50
    to-amber-50
    flex
    items-center
    justify-center
    p-4
    ">


      <div className="
      card
      p-8
      max-w-md
      w-full
      ">


        <div className="text-center mb-8">


          <div className="
          inline-flex
          items-center
          justify-center
          w-16
          h-16
          rounded-2xl
          bg-amber-100
          mb-4
          ">


            <Shield
            className="
            w-8
            h-8
            text-amber-600
            "
            />


          </div>



          <h1 className="
          text-2xl
          font-bold
          ">
            Initial Admin Setup
          </h1>


          <p className="
          text-gray-600
          mt-2
          ">
            Create the first administrator account.
          </p>


        </div>





        {error && (

          <div className="
          mb-5
          p-4
          bg-red-50
          border
          rounded-lg
          ">


            <p className="
            text-red-600
            flex
            gap-2
            items-center
            text-sm
            ">

              <AlertCircle
              className="w-5 h-5"
              />

              {error}

            </p>


          </div>

        )}






        <form
        onSubmit={handleCreateAdmin}
        className="space-y-5"
        >


          <div>

            <label className="label">
              Full Name
            </label>

            <input

            className="input"

            value={fullName}

            onChange={
              e=>setFullName(e.target.value)
            }

            placeholder="Barangay Administrator"

            />

          </div>





          <div>

            <label className="label">
              Email
            </label>

            <input

            type="email"

            className="input"

            value={email}

            onChange={
              e=>setEmail(e.target.value)
            }

            placeholder="admin@email.com"

            />

          </div>





          <div>

            <label className="label">
              Password
            </label>


            <input

            type="password"

            className="input"

            value={password}

            onChange={
              e=>setPassword(e.target.value)
            }

            />

          </div>





          <div>

            <label className="label">
              Confirm Password
            </label>


            <input

            type="password"

            className="input"

            value={confirmPassword}

            onChange={
              e=>setConfirmPassword(e.target.value)
            }

            />

          </div>





          <button

          disabled={loading}

          className="
          btn
          btn-accent
          w-full
          py-3
          "

          >

            {

            loading ?

            <Loader2
            className="
            animate-spin
            "
            />

            :

            "Create Admin Account"

            }


          </button>



        </form>





        <button

        onClick={() => onNavigate('/')}

        className="
        mt-6
        text-sm
        text-gray-500
        "

        >

          Back to Home

        </button>




      </div>


    </div>

  );


}
