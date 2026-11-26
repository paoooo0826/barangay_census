import { useId, useState } from "react";
import { createPortal } from "react-dom";
import { CircleHelp, X } from "lucide-react";
import { useDialogFocus } from "../hooks/useDialogFocus";

function GuideInstructions() {
  return (
    <div className="space-y-6 text-sm leading-6 text-slate-700">
      <section>
        <h3 className="text-base font-bold text-pine-900">Create an account and open the census form</h3>
        <ol className="mt-2 list-decimal space-y-2 pl-5">
          <li>
            Open <strong>Resident Portal</strong>. On <strong>Resident Login</strong>,
            select <strong>Register</strong>. Enter your email, create a password,
            confirm it, and select <strong>Create Account</strong>.
          </li>
          <li>
            Open the latest confirmation link in your email. Check spam if you
            do not see it. On <strong>Resident Login</strong>, enter the same
            email and choose <strong>Resend verification email</strong> if you
            need a new link. Once confirmed, choose <strong>Sign In</strong> if
            prompted. When shown the <strong>Terms and Conditions</strong>,
            read them, check the agreement box, and choose <strong>Confirm and Continue</strong>.
          </li>
          <li>
            Select your <strong>Government ID type</strong>. For both
            {" "}<strong>ID front</strong> and <strong>ID back</strong>, use
            {" "}<strong>Upload image</strong> or <strong>Take live photo</strong>.
            Keep the full ID in view and its text readable. Confirm the photo
            or save the crop when prompted. If the next step
            does not open automatically, select <strong>Continue to live verification</strong>.
          </li>
          <li>
            Allow camera access and follow the prompts one at a time. Review
            the selfie and choose <strong>Confirm Photo</strong>, or use
            {" "}<strong>Retake</strong> to try again. When you see
            {" "}<strong>Identity files saved</strong>, choose
            {" "}<strong>Continue to census form</strong>.
          </li>
        </ol>
        <p className="mt-3">
          If you already have a census record, go to <strong>Home</strong> and
          select <strong>Update Census</strong> to edit it. If no record has
          been submitted and you are on the dashboard, choose
          {" "}<strong>Continue Registration</strong>.
        </p>
      </section>

      <section>
        <h3 className="text-base font-bold text-pine-900">Fill out the census form</h3>
        <p className="mt-2">
          Use <strong>Jump to a section</strong> near the top of the form to
          move directly to a section. Complete the fields marked with an
          asterisk (*).
        </p>
        <ol className="mt-2 list-decimal space-y-2 pl-5">
          <li>
            <strong>Location Information:</strong> Check the Region, Province,
            City / Municipality, and Barangay. These fields are read-only.
            Enter your street or home address under
            {" "}<strong>Residential Address</strong> in the next section.
          </li>
          <li>
            <strong>Personal Information:</strong> Enter your name, birth
            details, sex, civil status, address, and the other details requested.
            Middle name and suffix are optional. Your birth date sets your age,
            and your email comes from your account.
          </li>
          <li>
            <strong>Education:</strong> Select your <strong>Highest Education</strong>
            {" "}and matching <strong>Education Status</strong>. If you have no
            formal education, choose <strong>No Formal Education</strong>.
          </li>
          <li>
            <strong>Housing (Tenurial Status):</strong> Enter when you started
            living in the barangay and your classification at that time. Select
            the tenurial status that applies to you, then choose
            your <strong>Boarding Status</strong>. A renter who is not a boarder
            must enter <strong>Monthly Rent (PHP)</strong>. A <strong>Boarder</strong>
            {" "}enters the house name, address, landlord or landlady name, and
            date they started staying; boarding rent is optional.
            {" "}<strong>Landlord/Landlady</strong> enters the house name, address,
            and number of boarders or tenants; contact information is optional.
            If neither applies, choose <strong>Not a Boarder or Landlord/Landlady</strong>.
          </li>
          <li>
            <strong>Identity Verification:</strong> Check the
            {" "}<strong>Government ID Front</strong> and <strong>Government ID Back</strong>
            {" "}saved during registration. If a photo is missing or needs to be
            replaced, use <strong>Upload file</strong> or <strong>Take live photo</strong>.
            Complete live verification again if you replace an ID photo or the
            form asks for a fresh capture.
          </li>
          <li>
            <strong>House / Household Photo:</strong> Choose <strong>Select Image</strong>
            {" "}and add a clear photo of your house or household, up to 8 MB.
            Adjust the crop and choose <strong>Crop / Save</strong>. Use
            {" "}<strong>Replace image</strong> to change the photo.
          </li>
          <li>
            <strong>Resident Classification:</strong> Check any categories that
            apply. If you choose <strong>Indigenous People</strong>, enter your
            {" "}<strong>Indigenous Group</strong>. If you choose <strong>Others</strong>,
            fill in <strong>Other Resident Classification Description</strong>.
          </li>
        </ol>
      </section>

      <section>
        <h3 className="text-base font-bold text-pine-900">Save, submit, and track your census</h3>
        <ul className="mt-2 list-disc space-y-2 pl-5">
          <li>
            The form saves your entries automatically. You can also choose
            {" "}<strong>Save draft</strong> and wait for <strong>Draft saved</strong>
            {" "}before leaving. Sign in with the same account and reopen the
            form to resume. If asked to finish identity verification first, do
            that to return to the form. Reattach any photos that were selected
            but not uploaded; the draft saves the form fields, not those files.
          </li>
          <li>
            Choose <strong>Submit Census Form</strong> for a new record or
            {" "}<strong>Save Census Updates</strong> for an existing record.
            Correct any fields highlighted in red, then try again.
          </li>
          <li>
            After submission, the dashboard shows your <strong>Tracking Number</strong>.
            Select the number or its copy icon to copy it. On <strong>Home</strong>,
            check <strong>Application Status</strong>: <strong>Pending Review</strong>
            {" "}means the barangay is still checking it, and <strong>Approved</strong>
            {" "}means your record is active. For <strong>Needs Update</strong> or
            {" "}<strong>Rejected</strong>, read any <strong>Administrator Remarks</strong>
            {" "}on Home and use <strong>Update Census</strong> to make corrections.
          </li>
        </ul>
      </section>

      <section>
        <h3 className="text-base font-bold text-pine-900">Find your way around the Resident Portal</h3>
        <p className="mt-2">
          Use the tabs under the dashboard header. On a phone, tap the
          {" "}<strong>Open navigation</strong> menu (☰) and choose a section.
        </p>
        <ul className="mt-2 list-disc space-y-2 pl-5">
          <li><strong>Home:</strong> Read barangay announcements, check your census status, or open <strong>Record Summary</strong>.</li>
          <li><strong>Profile:</strong> See your account and census details.</li>
          <li><strong>Appointments:</strong> Review your requests and previous visits, or select <strong>Book New</strong> to request a service.</li>
          <li><strong>Feedback:</strong> Send comments, suggestions, or concerns through <strong>Submit Feedback</strong>.</li>
          <li><strong>Incident Reports:</strong> Use <strong>Submit Report</strong> for a non-emergency incident. You can view your own reports and follow up from a report's details.</li>
          <li>
            <strong>Boarding:</strong> Boarders can open <strong>My Boarding House</strong>.
            Landlord or landlady accounts can open <strong>Boarding House Management</strong>.
            If <strong>Messages</strong> appears on a landlord or landlady account,
            use it to contact the barangay office.
          </li>
        </ul>
      </section>
    </div>
  );
}

export default function ResidentGuide() {
  const [open, setOpen] = useState(false);
  const headingId = useId();
  const close = () => setOpen(false);
  const dialog = useDialogFocus<HTMLDivElement>(open, close, null);

  return (
    <>
      <button
        type="button"
        aria-label="Help: How to use BRIMS"
        aria-haspopup="dialog"
        title="How to use BRIMS"
        className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-pine-200 bg-white px-2.5 text-sm font-semibold text-pine-800 hover:bg-pine-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-pine-600"
        onClick={(event) => {
          event.currentTarget.focus({ preventScroll: true });
          setOpen(true);
        }}
      >
        <CircleHelp size={17} aria-hidden="true" />
        Help
      </button>
      {open && createPortal(
        <div
          className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-950/60 p-3 sm:p-6"
          onClick={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div
            ref={dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby={headingId}
            tabIndex={-1}
            className="flex max-h-[90dvh] w-full min-w-0 max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          >
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-6">
              <h2 id={headingId} className="text-lg font-bold text-pine-900">
                How to use BRIMS
              </h2>
              <button type="button" className="icon-button" aria-label="Close guide" onClick={close}>
                <X size={20} aria-hidden="true" />
              </button>
            </header>
            <div
              role="region"
              aria-label="BRIMS guide instructions"
              tabIndex={0}
              className="min-h-0 overflow-y-auto overscroll-contain px-4 py-4 focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-pine-600 sm:px-6"
            >
              <GuideInstructions />
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
