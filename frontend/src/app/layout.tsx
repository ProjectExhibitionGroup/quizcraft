import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "QuizCraft",
  description: "Turn any PDF into an interactive Masterclass — powered by Llama 3.2 Vision & Groq",
  icons: { icon: "/favicon.png" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-bg-dark text-slate-200 antialiased min-h-screen relative overflow-x-hidden">
        {/* Animated Background */}
        <div className="fixed inset-0 bg-grid opacity-30 pointer-events-none z-0" />
        <div className="fixed top-20 left-[10%] w-96 h-96 bg-primary/20 rounded-full blur-[120px] animate-float pointer-events-none z-0" />
        <div className="fixed bottom-20 right-[10%] w-[500px] h-[500px] bg-accent-emerald/15 rounded-full blur-[150px] animate-float-delayed pointer-events-none z-0" />
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-blue-600/10 rounded-full blur-[180px] pointer-events-none z-0" />

        <div className="relative z-10">
          {children}
        </div>
      </body>
    </html>
  );
}
