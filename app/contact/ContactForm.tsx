'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/Input'
import { FormField } from '@/components/ui/FormField'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import {
  CONTACT_CATEGORIES,
  findContactCategory,
  isValidPoolCode,
  normalizePoolCode,
  POOL_CODE_MAX,
} from '@/lib/contact/categories'

export function ContactForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [poolCode, setPoolCode] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const category = findContactCategory(categoryId)
  const poolCodeRequired = category?.requiresPoolCode ?? false
  const normalizedPoolCode = normalizePoolCode(poolCode)

  // Only an error once they've typed something wrong — an empty required field is
  // flagged on submit, not while they are still working down the form.
  const poolCodeInvalid = normalizedPoolCode.length > 0 && !isValidPoolCode(normalizedPoolCode)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    // Client-side validation
    if (!name.trim() || !email.trim() || !subject.trim() || !message.trim()) {
      setError('Please fill in all fields.')
      return
    }

    if (!category) {
      setError('Please choose what your message is about.')
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address.')
      return
    }

    if (poolCodeRequired && !normalizedPoolCode) {
      setError(`A pool code is required for "${category.label}" so we can find the right pool.`)
      return
    }

    if (normalizedPoolCode && !isValidPoolCode(normalizedPoolCode)) {
      setError("That pool code doesn't look right. It's usually 6 letters and numbers, like BDA26X.")
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          category: category.id,
          // Always send the normalised code when there is one, even for categories
          // that don't demand it — a volunteered code is still worth having.
          poolCode: normalizedPoolCode,
          subject: subject.trim(),
          message: message.trim(),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.')
        return
      }

      setSuccess(true)
    } catch {
      setError('Failed to send message. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="max-w-xl mx-auto">
        <Alert variant="success" className="mb-0">
          <div className="text-center py-4">
            <div className="text-3xl mb-3">✉️</div>
            <h3 className="text-lg font-semibold mb-2">Message Sent!</h3>
            <p className="text-sm">
              Thanks for reaching out. We&apos;ll get back to you as soon as possible.
            </p>
          </div>
        </Alert>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-xl mx-auto space-y-5">
      {error && <Alert variant="error">{error}</Alert>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <FormField label="Name">
          <Input
            type="text"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
          />
        </FormField>

        <FormField label="Email">
          <Input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={200}
          />
        </FormField>
      </div>

      <FormField label="What's this about?">
        <Select
          fullWidth
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          <option value="">Choose a category…</option>
          {CONTACT_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </Select>
      </FormField>

      {/* Always visible, so the field never appears under the cursor mid-form and
          so a code can be volunteered on any category. Only its requiredness moves. */}
      <FormField
        label={poolCodeRequired ? 'Pool code (required)' : 'Pool code (optional)'}
        helperText={
          poolCodeInvalid
            ? undefined
            : poolCodeRequired
              ? "We need this to find the pool you're asking about — it's on the pool's page and in its invite link."
              : 'Include it if your question is about one specific pool.'
        }
        error={poolCodeInvalid ? "That doesn't look like a pool code — check the pool's page or invite link." : undefined}
      >
        <Input
          type="text"
          placeholder="e.g. BDA26X"
          value={poolCode}
          onChange={(e) => setPoolCode(e.target.value.toUpperCase())}
          error={poolCodeInvalid}
          maxLength={POOL_CODE_MAX + 4}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          className="font-mono tracking-wider"
        />
      </FormField>

      <FormField label="Subject">
        <Input
          type="text"
          placeholder="What is this about?"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={300}
        />
      </FormField>

      <FormField label="Message">
        <textarea
          placeholder="Tell us more..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={6}
          maxLength={5000}
          className="w-full px-4 py-2 border border-neutral-300 rounded-xl bg-surface focus:ring-2 focus:ring-primary-500 focus:border-transparent text-neutral-900 resize-vertical"
        />
      </FormField>

      <Button type="submit" fullWidth loading={loading} loadingText="Sending...">
        Send Message
      </Button>
    </form>
  )
}
