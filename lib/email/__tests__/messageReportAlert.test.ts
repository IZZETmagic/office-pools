import { describe, it, expect } from 'vitest'

import { messageReportAlertTemplate } from '../templates'

const base = {
  poolName: 'Office Pool',
  reporterName: 'Sam (@sam)',
  reportedName: 'Alex (@alex)',
  reason: 'Offensive',
  details: null,
  contentSnapshot: 'hello',
  typeSnapshot: 'text',
  openReportCount: 2,
  reportsUrl: 'https://sportpool.io/admin/super?tab=reports',
}

describe('messageReportAlertTemplate', () => {
  it('escapes member-written text — a reported message is not markup', () => {
    const { html } = messageReportAlertTemplate({
      ...base,
      contentSnapshot: '<img src=x onerror=alert(1)> & "quotes"',
      details: '<script>bad()</script>',
      poolName: '<b>Pool</b>',
    })
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('<script>bad()')
    expect(html).not.toContain('<b>Pool</b>')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt; &amp; &quot;quotes&quot;')
  })

  it('names the pool and reason in the subject and links to the Reports tab', () => {
    const { subject, html } = messageReportAlertTemplate(base)
    expect(subject).toBe('Banter report: Offensive in Office Pool')
    expect(html).toContain('https://sportpool.io/admin/super?tab=reports')
  })

  it('says when the reported message was a GIF or a photo', () => {
    expect(messageReportAlertTemplate({ ...base, typeSnapshot: 'gif' }).html).toContain('(a GIF)')
    expect(messageReportAlertTemplate({ ...base, typeSnapshot: 'photo' }).html).toContain('(a photo)')
  })
})
