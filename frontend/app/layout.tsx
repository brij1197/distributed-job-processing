import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Job Queue Dashboard",
  description: "Distributed Job Processing System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-gray-100 min-h-screen">
        <nav className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
          <div className="text-lg font-semibold tracking-tight">Job Queue</div>
          <div className="flex gap-4 text-sm">
            <a
              href="/"
              className="text-grey-400 hover:text-white transition-colors"
            >
              Dashboard
            </a>
            <a
              href="/submit"
              className="text-grey-400 hover:text-white transition-colors"
            >
              Submit Job
            </a>
          </div>
        </nav>
        <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
