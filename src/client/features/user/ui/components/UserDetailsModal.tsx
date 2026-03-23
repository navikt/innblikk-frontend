import { Modal, Heading, BodyShort, Loader } from '@navikt/ds-react'
import { Monitor, Clock } from 'lucide-react'
import type { UserProfile, ActivityItem } from '../../model'
import { formatDateTime, formatTime } from '../../utils'
import { getDeviceIcon } from './DeviceIcon'

interface UserDetailsModalProps {
  isOpen: boolean
  onClose: () => void
  selectedSession: UserProfile | null
  activityData: ActivityItem[]
  activityLoading: boolean
  selectedActivityUrl: string | null
  onActivityUrlClick: (url: string) => void
}

export default function UserDetailsModal({
  isOpen,
  onClose,
  selectedSession,
  activityData,
  activityLoading,
  selectedActivityUrl,
  onActivityUrlClick,
}: UserDetailsModalProps) {
  if (!selectedSession) return null

  return (
    <Modal open={isOpen} onClose={onClose} width="medium" aria-labelledby="user-details-title">
      <Modal.Header>
        <Heading size="medium" id="user-details-title">
          Brukerdetaljer
        </Heading>
      </Modal.Header>
      <Modal.Body>
        <div className="space-y-6">
          {/* User Info Section */}
          <div className="grid grid-cols-2 gap-4 p-4 bg-[var(--ax-bg-neutral-soft)] rounded-lg">
            <div>
              <BodyShort size="small" className="text-[var(--ax-text-subtle)]">
                Bruker ID
              </BodyShort>
              <BodyShort weight="semibold">
                {selectedSession.userId || '(mangler cookie-id)'}
                {selectedSession.idType === 'cookie' ? ' 🍪' : ''}
              </BodyShort>
            </div>

            {selectedSession.distinctId && (
              <div>
                <BodyShort size="small" className="text-[var(--ax-text-subtle)]">
                  Distinct ID
                </BodyShort>
                <BodyShort weight="semibold">{selectedSession.distinctId}</BodyShort>
              </div>
            )}

            <div>
              <BodyShort size="small" className="text-[var(--ax-text-subtle)]">
                Første sett
              </BodyShort>
              <BodyShort weight="semibold">{formatDateTime(selectedSession.firstSeen)}</BodyShort>
            </div>

            <div>
              <BodyShort size="small" className="text-[var(--ax-text-subtle)]">
                Sist sett
              </BodyShort>
              <BodyShort weight="semibold">{formatDateTime(selectedSession.lastSeen)}</BodyShort>
            </div>

            {selectedSession.device && (
              <div>
                <BodyShort size="small" className="text-[var(--ax-text-subtle)]">
                  Enhet
                </BodyShort>
                <div className="flex items-center gap-2">
                  {getDeviceIcon(selectedSession.device, 18)}
                  <BodyShort weight="semibold">{selectedSession.device}</BodyShort>
                </div>
              </div>
            )}

            {selectedSession.browser && (
              <div>
                <BodyShort size="small" className="text-[var(--ax-text-subtle)]">
                  Nettleser
                </BodyShort>
                <BodyShort weight="semibold">{selectedSession.browser}</BodyShort>
              </div>
            )}

            {selectedSession.os && (
              <div>
                <BodyShort size="small" className="text-[var(--ax-text-subtle)]">
                  OS
                </BodyShort>
                <BodyShort weight="semibold">{selectedSession.os}</BodyShort>
              </div>
            )}

            {selectedSession.country && (
              <div>
                <BodyShort size="small" className="text-[var(--ax-text-subtle)]">
                  Land
                </BodyShort>
                <BodyShort weight="semibold">{selectedSession.country}</BodyShort>
              </div>
            )}
          </div>

          {/* Activity Section */}
          <div>
            <Heading size="small" spacing>
              Aktivitet
            </Heading>
            {activityLoading ? (
              <div className="flex justify-center p-4">
                <Loader size="medium" />
              </div>
            ) : (
              <div className="relative border-l border-[var(--ax-border-neutral-subtle)] ml-3 space-y-8">
                {activityData.map((item, idx) => (
                  <div key={idx} className="relative pl-8">
                    <span className="absolute -left-[41px] w-20 h-20 flex items-center justify-center rounded-full bg-[var(--ax-bg-accent-soft)] border-4 border-[var(--ax-bg-default)] ring-[var(--ax-bg-default)]">
                      <Monitor size={18} className="text-[var(--ax-text-accent)]" />
                    </span>

                    <div className="flex flex-col gap-1">
                      <BodyShort size="small" className="text-[var(--ax-text-subtle)]">
                        <Clock size={14} className="inline mr-1" />
                        {formatTime(item.createdAt)}
                      </BodyShort>

                      <BodyShort weight="semibold" className="text-[var(--ax-text-default)]">
                        {item.type === 'pageview' ? 'Sidevisning' : item.name || item.type}
                      </BodyShort>

                      {item.url && (
                        <code
                          className="text-sm bg-[var(--ax-bg-neutral-soft)] px-2 py-1 rounded cursor-pointer hover:bg-[var(--ax-bg-neutral-moderate)]"
                          onClick={() => {
                            onActivityUrlClick(item.url || '')
                          }}
                          style={{
                            color:
                              selectedActivityUrl === item.url ? 'var(--ax-text-accent)' : 'var(--ax-text-default)',
                          }}
                        >
                          {item.url}
                        </code>
                      )}

                      {item.title && (
                        <BodyShort size="small" className="text-[var(--ax-text-subtle)]">
                          {item.title}
                        </BodyShort>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal.Body>
    </Modal>
  )
}
