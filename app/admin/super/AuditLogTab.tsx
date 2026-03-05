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
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-white mb-6">Audit Log</h2>
        <div className="bg-surface rounded-lg shadow dark:shadow-none dark:border dark:border-border-default p-8 text-center text-neutral-600 dark:text-neutral-400">
          No audit entries yet. Actions like match resets will be logged here.
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-white">Audit Log</h2>
        <span className="px-3 py-1 bg-neutral-100 text-neutral-700 rounded-full font-medium text-sm">
          {auditLogs.length} Entries
        </span>
      </div>

      {/* Audit — mobile cards */}
      <div className="sm:hidden space-y-3">
        {auditLogs.map((log) => {
          const home = log.matches?.home_team?.country_name || 'Unknown'
          const away = log.matches?.away_team?.country_name || 'Unknown'
          const resetDate = new Date(log.reset_at)
          return (
            <div key={log.log_id} className="bg-surface rounded-lg shadow dark:shadow-none dark:border dark:border-border-default p-4">
              {/* Top row: action badge + time */}
              <div className="flex items-center gap-2 mb-2">
                <Badge variant={log.action_type === 'reset' ? 'yellow' : 'blue'}>
                  {log.action_type || 'unknown'}
                </Badge>
                <span className="text-xs text-neutral-500 dark:text-neutral-400 ml-auto">
                  {resetDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}{' '}
                  {resetDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </span>
              </div>
              {/* Match info */}
              <div className="text-sm mb-2">
                {log.matches ? (
                  <span>
                    <span className="font-medium text-neutral-900 dark:text-white">#{log.matches.match_number}</span>
                    <span className="text-neutral-600 dark:text-neutral-400 ml-2">{home} vs {away}</span>
                  </span>
                ) : (
                  <span className="text-neutral-500">Unknown match</span>
                )}
              </div>
              {/* Previous score + performed by */}
              <div className="flex items-center gap-4 text-xs text-neutral-500 dark:text-neutral-400">
                <span>
                  Prev:{' '}
                  {log.previous_home_score !== null ? (
                    <>
                      <span className="font-mono font-bold text-neutral-700 dark:text-neutral-300">{log.previous_home_score}-{log.previous_away_score}</span>
                      {log.previous_home_pso !== null && (
                        <span className="ml-1">(PSO: {log.previous_home_pso}-{log.previous_away_pso})</span>
                      )}
                    </>
                  ) : 'N/A'}
                </span>
                <span>By: {log.users?.username || 'Unknown'}</span>
              </div>
              {/* Reason */}
              {log.reason && (
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-2 truncate">
                  {log.reason}
                </p>
              )}
            </div>
          )
        })}
      </div>

      {/* Audit — desktop table */}
      <div className="hidden sm:block bg-surface rounded-lg shadow dark:shadow-none dark:border dark:border-border-default overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-neutral-50 dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-neutral-700 dark:text-neutral-300 uppercase">
                  Time
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-neutral-700 dark:text-neutral-300 uppercase">
                  Action
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-neutral-700 dark:text-neutral-300 uppercase">
                  Match
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-neutral-700 dark:text-neutral-300 uppercase">
                  Previous Score
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-neutral-700 dark:text-neutral-300 uppercase">
                  Performed By
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-neutral-700 dark:text-neutral-300 uppercase">
                  Reason
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
              {auditLogs.map((log) => {
                const home =
                  log.matches?.home_team?.country_name || 'Unknown'
                const away =
                  log.matches?.away_team?.country_name || 'Unknown'
                const resetDate = new Date(log.reset_at)

                return (
                  <tr key={log.log_id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800">
                    <td className="px-4 py-3 text-sm text-neutral-600 dark:text-neutral-400 whitespace-nowrap">
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
                          <span className="font-medium text-neutral-900 dark:text-white">
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
                    <td className="px-4 py-3 text-sm text-neutral-600 dark:text-neutral-400">
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
                    <td className="px-4 py-3 text-sm text-neutral-600 dark:text-neutral-400">
                      {log.users?.username || 'Unknown'}
                    </td>
                    <td className="px-4 py-3 text-sm text-neutral-600 dark:text-neutral-400 max-w-xs truncate">
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
