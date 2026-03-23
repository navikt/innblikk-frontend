import { Monitor, Smartphone, Laptop, Tablet } from 'lucide-react'

interface DeviceIconProps {
  device?: string
  size?: number
}

export function getDeviceIcon(device?: string, size: number = 16) {
  switch (device?.toLowerCase()) {
    case 'mobile':
      return <Smartphone size={size} />
    case 'tablet':
      return <Tablet size={size} />
    case 'desktop':
      return <Laptop size={size} />
    default:
      return <Monitor size={size} />
  }
}

export default function DeviceIcon({ device, size = 16 }: DeviceIconProps) {
  return getDeviceIcon(device, size)
}
