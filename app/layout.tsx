import "./globals.css";
import { getOptionalAuth, logout } from "@/lib/auth";

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
                <h1>Stars Football Academy</h1>
              </div>
              <nav>
                <a href="/dashboard">Dashboard</a>
                <a href="/players">Players</a>
                <a href="/attendance">Attendance</a>
                <a href="/bank">Bank</a>
                {auth.role === "admin" && <a href="/messages">Messages</a>}
                {auth.role === "admin" && <a href="/accounts">Accounts</a>}
                {auth.role === "admin" && <a href="/settings">Settings</a>}
                <span className="who">{auth.username} ({auth.role})</span>
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
