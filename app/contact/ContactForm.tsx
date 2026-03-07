'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/Input'
import { FormField } from '@/components/ui/FormField'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'

export function ContactForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    // Client-side validation
    if (!name.trim() || !email.trim() || !subject.trim() || !message.trim()) {
      setError('Please fill in all fields.')
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address.')
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
