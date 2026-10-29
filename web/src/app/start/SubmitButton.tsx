"use client";

import { useFormStatus } from "react-dom";

export default function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="btn-red rounded-sm px-6 py-3 font-semibold disabled:cursor-wait disabled:opacity-80"
    >
      {pending ? "Pulling records…" : "Get my report"}
    </button>
  );
}
