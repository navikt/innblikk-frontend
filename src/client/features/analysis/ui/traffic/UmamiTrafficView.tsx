import React from 'react'
import type { UmamiJourneyViewProps } from '../../model/types.ts'
import { useUmamiTraffic } from '../../hooks/useUmamiTraffic.ts'

const UmamiJourneyView: React.FC<UmamiJourneyViewProps> = ({
  nodes,
  links,
  isFullscreen = false,
  metricLabel = 'besøkende',
}) => {
  const { stepsData, selectedNodeId, connectedNodeIds, paths, contentRef, nodeRefs, toggleNode } = useUmamiTraffic(
    nodes,
    links,
    isFullscreen,
  )

  if (!stepsData.length) {
    return <div className="p-4 text-gray-500">Ingen data å vise.</div>
  }

  return (
    <div className={`bg-[var(--ax-bg-default)] w-full p-6 ${isFullscreen ? 'overflow-auto' : 'overflow-x-auto'}`}>
      <div className="relative min-w-max" ref={contentRef}>
        {/* SVG Overlay */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
          {paths.map((path, i) => (
            <path key={i} d={path.d} stroke="#0067c5" strokeWidth="2" fill="none" opacity={path.opacity} />
          ))}
        </svg>

        <div className="flex gap-8 relative z-20">
          {stepsData.map((stepData) => (
            <div key={stepData.step} className="flex-shrink-0 w-60 flex flex-col gap-4">
              {/* Step Header */}
              <div className="flex flex-col items-center mb-2">
                <div className="text-[var(--ax-text-default)] mb-1">
                  {stepData.step === 1 && <span className="text-sm font-medium uppercase tracking-wider">Fra</span>}
                  {stepData.step === 2 && <span className="text-sm font-medium uppercase tracking-wider">Til</span>}
                  {stepData.step === 3 && <span className="text-sm font-medium uppercase tracking-wider">Neste</span>}
                </div>
                <div className="text-sm font-semibold text-[var(--ax-text-default)]">
                  {stepData.totalValue.toLocaleString('nb-NO')} {metricLabel}
                </div>
              </div>

              {/* Step Items */}
              <div className="flex flex-col gap-2">
                {stepData.items.map((item) => {
                  const isSelected = selectedNodeId === item.nodeId
                  const isConnected = connectedNodeIds.has(item.nodeId)
                  const isDimmed = selectedNodeId !== null && !isConnected

                  return (
                    <div
                      key={item.nodeId}
                      ref={(el) => {
                        if (el) nodeRefs.current.set(item.nodeId, el)
                        else nodeRefs.current.delete(item.nodeId)
                      }}
                      onClick={() => toggleNode(item.nodeId)}
                      className={`
                                                relative overflow-hidden rounded-md border transition-all duration-200 cursor-pointer
                                                ${isSelected ? 'ring-2 ring-blue-600 border-blue-600 shadow-md' : 'border-transparent hover:border-gray-400 shadow-sm'}
                                                ${isDimmed ? 'opacity-30 grayscale' : 'opacity-100'}
                                                text-white
                                            `}
                      style={{
                        minHeight: '40px',
                        backgroundColor: 'rgb(19, 17, 54)',
                      }}
                    >
                      {/* Content */}
                      <div className="relative z-10 p-2.5 flex justify-between items-center gap-2">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <span className="text-gray-400 flex-shrink-0 text-xs">📄</span>
                          <span className="font-medium text-xs truncate" title={item.name}>
                            {item.name}
                          </span>
                        </div>
                        <span className="text-xs font-mono font-bold whitespace-nowrap">
                          {item.value.toLocaleString('nb-NO')}
                        </span>
                      </div>

                      {/* Percentage Bar */}
                      <div className="absolute bottom-0 left-0 right-0 h-2 bg-[var(--ax-bg-default)]/30">
                        <div
                          className="h-full bg-orange-400 transition-all duration-500 ease-out"
                          style={{ width: `${item.percentage}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default UmamiJourneyView
