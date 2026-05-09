import { redirect } from "next/navigation";
import { login, getOptionalAuth } from "@/lib/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const auth = await getOptionalAuth();
  if (auth) redirect("/dashboard");

  const params = await searchParams;

  async function handleLogin(formData: FormData) {
    "use server";
    const username = formData.get("username") as string;
    const password = formData.get("password") as string;
    const error = await login(username, password);
    if (error) {
      redirect(`/login?error=${encodeURIComponent(error)}`);
    }
    redirect("/dashboard");
  }

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <h1>Stars Academy</h1>
        {params.error && <p className="error-msg">{params.error}</p>}
        <form action={handleLogin}>
          <div className="form-group mb-1">
            <label htmlFor="username">Username</label>
            <input id="username" name="username" type="text" required autoFocus />
          </div>
          <div className="form-group mb-1">
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" required />
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: "100%", marginTop: "0.5rem" }}>
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
