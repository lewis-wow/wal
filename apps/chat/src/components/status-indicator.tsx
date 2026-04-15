import { useAppSelector } from '../lib/chat-store'

export function StatusIndicator() {
  const status = useAppSelector(state => state.chat.connectionStatus)

  const colors = {
    disconnected: 'bg-destructive',
    connecting: 'bg-yellow-500 animate-pulse',
    connected: 'bg-green-500'
  }

  return (
    <div className="flex items-center space-x-2 px-3 py-1 rounded-full bg-secondary/50">
      <div className={`w-2 h-2 rounded-full ${colors[status]}`} />
      <span className="text-sm font-medium capitalize">{status}</span>
    </div>
  )
}
