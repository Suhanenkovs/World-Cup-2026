import { createClient } from "@/lib/supabase/server";
import JoinForm from "./JoinForm";

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ auth_error?: string }>;
}) {
  const { auth_error } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="text-center space-y-3">
          <p className="text-red-400 font-medium">Invite link verification failed.</p>
          {auth_error ? (
            <p className="text-yellow-400 text-xs font-mono bg-gray-900 rounded px-3 py-2 inline-block">
              {auth_error}
            </p>
          ) : null}
          <p className="text-gray-400 text-sm">
            The link may have expired or already been used.<br />
            Ask an admin to send a new invite.
          </p>
          <a href="/login" className="text-emerald-400 text-sm underline">Go to login</a>
        </div>
      </div>
    );
  }

  return <JoinForm />;
}
