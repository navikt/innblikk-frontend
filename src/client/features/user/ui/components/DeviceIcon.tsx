import { LaptopIcon, MobileIcon, MonitorIcon, TabletIcon } from '@navikt/aksel-icons'

interface DeviceIconProps {
  device?: string
  size?: number
}

export function getDeviceIcon(device?: string, size: number = 16) {
  const fontSize = `${(size / 16).toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}rem`
  switch (device?.toLowerCase()) {
    case 'mobile':
      return <MobileIcon fontSize={fontSize} />
    case 'tablet':
      return <TabletIcon fontSize={fontSize} />
    case 'desktop':
      return <LaptopIcon fontSize={fontSize} />
    default:
      return <MonitorIcon fontSize={fontSize} />
  }
}

export default function DeviceIcon({ device, size = 16 }: DeviceIconProps) {
  return getDeviceIcon(device, size)
}
