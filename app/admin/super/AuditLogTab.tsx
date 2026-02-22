'use client'

import type { AuditLogData } from './page'
import { Badge } from '@/components/ui/Badge'

type AuditLogTabProps = {
  auditLogs: AuditLogData[]
}

export function AuditLogTab({ auditLogs }: AuditLogTabProps) {
  if (auditLogs.length === 0) {
    return (
      <div>
        <h2 className="text-2xl font-bold text-neutral-900 mb-6">Audit Log</h2>
        <div className="bg-white rounded-lg shadow p-8 text-center text-neutral-600">
          No audit entries yet. Actions like match resets will be logged here.
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-neutral-900">Audit Log</h2>
        <span className="px-3 py-1 bg-neutral-100 text-neutral-700 rounded-full font-medium text-sm">
          {auditLogs.length} Entries
        </span>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-neutral-50 border-b border-neutral-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-neutral-700 uppercase">
                  Time
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-neutral-700 uppercase">
                  Action
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-neutral-700 uppercase">
                  Match
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-neutral-700 uppercase">
                  Previous Score
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-neutral-700 uppercase">
                  Performed By
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-neutral-700 uppercase">
                  Reason
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {auditLogs.map((log) => {
                const home =
                  log.matches?.home_team?.country_name || 'Unknown'
                const away =
                  log.matches?.away_team?.country_name || 'Unknown'
                const resetDate = new Date(log.reset_at)

                return (
                  <tr key={log.log_id} className="hover:bg-neutral-50">
                    <td className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">
                      {resetDate.toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                      <br />
                      <span className="text-xs text-neutral-500">
                        {resetDate.toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          log.action_type === 'reset' ? 'yellow' : 'blue'
                        }
                      >
                        {log.action_type || 'unknown'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {log.matches ? (
                        <>
                          <span className="font-medium text-neutral-900">
                            #{log.matches.match_number}
                          </span>
                          <span className="text-neutral-600 ml-2">
                            {home} vs {away}
                          </span>
                        </>
                      ) : (
                        <span className="text-neutral-500">Unknown match</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-neutral-600">
                      {log.previous_home_score !== null ? (
                        <>
                          <span className="font-mono font-bold">
                            {log.previous_home_score}-{log.previous_away_score}
                          </span>
                          {log.previous_home_pso !== null && (
                            <span className="text-xs text-neutral-500 ml-1">
                              (PSO: {log.previous_home_pso}-
                              {log.previous_away_pso})
                            </span>
                          )}
                          {log.previous_status && (
                            <span className="text-xs text-neutral-500 block">
                              was: {log.previous_status}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-neutral-500">N/A</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-neutral-600">
                      {log.users?.username || 'Unknown'}
                    </td>
                    <td className="px-4 py-3 text-sm text-neutral-600 max-w-xs truncate">
                      {log.reason || '-'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
