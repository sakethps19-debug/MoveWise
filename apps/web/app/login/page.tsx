import { LoginForm } from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>;
}) {
  const { reset } = await searchParams;
  return (
    <main className="mw-auth-shell">
      <LoginForm justReset={reset === "success"} />
    </main>
  );
}
