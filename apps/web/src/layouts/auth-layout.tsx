import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Wordmark } from '@/components/wordmark';

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-8">
          <Wordmark />
        </div>
        <div className="rounded-2xl border border-[#e6e8ec] bg-white p-6">
          {children}
        </div>
        <p className="mt-6 text-center text-sm">
          <Link to="/" className="text-teal">
            ScholarFlow
          </Link>
        </p>
      </div>
    </div>
  );
}
