import Image from "next/image";
import type { ReactNode } from "react";
import DashboardTabs from "./DashboardTabs";

export default function DashboardShell({
  toolbar,
  children,
}: {
  toolbar: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen w-full max-w-none flex-col gap-8 px-3 py-6 sm:px-5 lg:px-8 2xl:px-10">
      <a
        href="#dashboard-content"
        className="sr-only z-[100] rounded-lg bg-slate-950 px-4 py-2 text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to dashboard content
      </a>

      <header className="mb-0 flex flex-col items-center justify-center gap-4 xl:flex-row xl:gap-8">
        <div className="flex shrink-0 gap-4">
          <Image
            src="/img/umpsa.png"
            alt="Logo UMPSA"
            width={6000}
            height={1115}
            priority
            className="h-20 w-auto object-contain sm:h-24 xl:h-20"
          />
        </div>
        <div className="text-center xl:text-left">
          <h1 className="text-3xl font-bold xl:max-w-4xl">
            iSENS-COOP: Smart Sensing System for Poultry House Monitoring
          </h1>
        </div>
      </header>

      <hr className="my-4 border-gray-300" />
      {toolbar}
      <DashboardTabs />

      <main id="dashboard-content" className="flex flex-col gap-8">
        {children}
      </main>

      <footer className="mt-10 border-t py-6 text-center text-sm text-gray-600">
        <p className="mb-2">© 2026 UMPSA • MOHE • IMaP. All rights reserved.</p>
        <p className="mb-4">Contact: kamarul@umpsa.edu.my</p>
        <p className="text-xs leading-relaxed">
          Disclaimer: The data and visualizations provided by iSENS-COOP are for
          research and monitoring purposes only. Accuracy and reliability of
          predictions may vary. Users are responsible for interpreting and
          using the information appropriately.
        </p>
      </footer>
    </div>
  );
}
