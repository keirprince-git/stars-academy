import "./globals.css";
import { getOptionalAuth, logout } from "@/lib/auth";
import NavLink from "./components/NavLink";

export const metadata = { title: "Stars Academy" };

async function LogoutButton() {
  async function handleLogout() {
    "use server";
    await logout();
    const { redirect } = await import("next/navigation");
    redirect("/login");
  }
  return (
    <form action={handleLogout}>
      <button type="submit">Sign out</button>
    </form>
  );
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const auth = await getOptionalAuth();

  return (
    <html lang="en">
      <body>
        <div className="shell">
          {auth && (
            <header className="topbar">
              <div className="brand">
                <img src="/Logo.JPG" alt="Stars Academy" />
                <h1>Stars Academy</h1>
              </div>
              <nav>
                <NavLink href="/dashboard"  label="Dashboard"  />
                <NavLink href="/players"    label="Players"    />
                <NavLink href="/attendance" label="Attendance" />
                {auth.role === "admin" && <NavLink href="/bank"     label="Bank"     />}
                {auth.role === "admin" && <NavLink href="/messages" label="Messages" />}
                {auth.role === "admin" && <NavLink href="/accounts" label="Accounts" />}
                {auth.role === "admin" && <NavLink href="/settings" label="Settings" />}
                <a href="/account" className="who" title="Account settings">{auth.username}</a>
                <LogoutButton />
              </nav>
            </header>
          )}
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
