import { ResetPasswordForm } from "./ResetPasswordForm";

export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main className="mw-auth-shell">
      <ResetPasswordForm token={token} />
    </main>
  );
}
