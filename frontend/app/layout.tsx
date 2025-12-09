// frontend/app/layout.tsx
import "./globals.css";           // 🔹 <-- only change: use the existing file
import type { ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "On-call Scheduler",
  icons: {
    icon: "/favicon.ico", // this points to frontend/public/favicon.ico
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <title>On-call Scheduler</title>
      </head>
      <body>
        <div className="app-shell">
          {/* Top navigation bar */}
          <header className="top-nav">
            <div className="top-nav-inner">
              {/* Brand area */}
              <div className="brand">
                <span>On-call Scheduler</span>
                <span className="brand-badge">internal</span>
              </div>

              {/* Main nav links */}
              <nav className="nav-links">
                <Link href="/" className="nav-link">
                  Dashboard
                </Link>
                <Link href="/schedules/generate" className="nav-link">
                  Generate Schedule
                </Link>
                <Link href="/schedules/calendar" className="nav-link">
                  Calendar
                </Link>
                <Link href="/people" className="nav-link">
                  People
                </Link>
                <Link href="/teams" className="nav-link">
                  Teams
                </Link>
                <Link href="/pto" className="nav-link">
                  PTO Admin
                </Link>
              </nav>
            </div>
          </header>

          {/* Main page content */}
          <main className="main-content">{children}</main>
        </div>
      </body>
    </html>
  );
}
