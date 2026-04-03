'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { FormField } from '@/components/ui/FormField'
import { useToast } from '@/components/ui/Toast'
import { POOL_INFO } from '../mockData'

export default function JoinDemoPage() {
  const router = useRouter()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(false)
  const [agreed, setAgreed] = useState(true) // Pre-checked for easy demo

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    setTimeout(() => {
      showToast(`Welcome to ${POOL_INFO.name}!`, 'success')
      setTimeout(() => {
        router.push('/pools/66b67286-e36e-40fd-8893-2a1fde0d018b')
      }, 1200)
    }, 600)
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12"
      style={{ background: POOL_INFO.primaryGradient }}
    >
      {/* Decorative circles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute -top-24 -left-24 w-80 h-80 bg-white/[0.02] rounded-full" />
        <div className="absolute top-1/3 -right-20 w-64 h-64 bg-white/[0.02] rounded-full" />
        <div className="absolute -bottom-16 left-1/4 w-48 h-48 bg-white/[0.02] rounded-full" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Back link */}
        <Link
          href="/play/demo"
          className="inline-flex items-center gap-1.5 text-sm text-white/40 hover:text-white/70 transition-colors mb-6"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Back to {POOL_INFO.barName}
        </Link>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div
            className="px-6 py-8 text-center text-white relative overflow-hidden"
            style={{ background: POOL_INFO.primaryGradient }}
          >
            <div className="absolute -top-10 -left-10 w-32 h-32 rounded-full bg-white/[0.04]" />
            <div className="absolute -bottom-8 -right-8 w-24 h-24 rounded-full bg-white/[0.04]" />
            <div className="relative z-10">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/10 text-4xl mb-4">
                {POOL_INFO.logoEmoji}
              </div>
              <h1 className="text-xl font-bold">Join {POOL_INFO.name}</h1>
              <p className="text-sm mt-2" style={{ color: POOL_INFO.accentColorLight }}>
                {POOL_INFO.memberCount} players already competing
              </p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="px-6 py-6 space-y-4">
            <FormField label="Full Name">
              <Input
                type="text"
                placeholder="e.g., John Smith"
                autoComplete="off"
              />
            </FormField>

            <FormField label="Username">
              <Input
                type="text"
                placeholder="e.g., DarkNStormy"
                autoComplete="off"
              />
            </FormField>

            <FormField label="Email">
              <Input
                type="email"
                placeholder="you@example.com"
                autoComplete="off"
              />
            </FormField>

            <FormField label="Password">
              <Input
                type="password"
                placeholder="••••••••"
                autoComplete="off"
              />
            </FormField>

            {/* Terms checkbox */}
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-neutral-300 text-teal-600 focus:ring-teal-500"
              />
              <span className="text-sm text-neutral-500">
                I agree to the{' '}
                <span className="font-medium text-neutral-700 underline decoration-neutral-300">terms of service</span>
                {' '}and{' '}
                <span className="font-medium text-neutral-700 underline decoration-neutral-300">privacy policy</span>
              </span>
            </label>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl text-white font-bold text-base transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: POOL_INFO.accentColor }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Creating Account...
                </span>
              ) : (
                'Create Account & Join Pool'
              )}
            </button>

            {/* Sign in link (visual only) */}
            <p className="text-center text-sm text-neutral-400 pt-1">
              Already have a Sport Pool account?{' '}
              <span className="font-semibold cursor-pointer transition-colors" style={{ color: POOL_INFO.accentColor }}>
                Sign in
              </span>
            </p>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-white/25 mt-6">
          Powered by <span className="font-semibold text-white/40">Sport Pool</span> &middot; sportpool.io
        </p>
      </div>
    </div>
  )
}
