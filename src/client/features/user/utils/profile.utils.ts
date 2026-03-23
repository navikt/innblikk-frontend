import type { UserProfile } from '../model'

export function downloadUsersCSV(users: UserProfile[]): void {
  if (!users || users.length === 0) return

  const headers = [
    'User ID',
    'ID Type',
    'Session IDs',
    'Distinct ID',
    'Country',
    'Browser',
    'Device',
    'OS',
    'First Seen',
    'Last Seen',
    'Primary Session ID',
  ]

  const csvRows = [
    headers.join(','),
    ...users.map((user) =>
      [
        user.userId || '',
        user.idType || '',
        user.sessionIds?.join(';') || '',
        user.distinctId || '',
        user.country || '',
        user.browser || '',
        user.device || '',
        user.os || '',
        user.firstSeen,
        user.lastSeen,
        user.primarySessionId || '',
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(','),
    ),
  ]

  const csvContent = csvRows.join('\n')
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  link.setAttribute('href', url)
  link.setAttribute('download', `brukerprofiler-${new Date().toISOString().split('T')[0]}.csv`)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString('no-NO', {
    timeZone: 'Europe/Oslo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatTime(dateString: string): string {
  return new Date(dateString).toLocaleTimeString('no-NO', {
    timeZone: 'Europe/Oslo',
    hour: '2-digit',
    minute: '2-digit',
  })
}
