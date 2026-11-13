import { type ReactNode } from 'react';
import { CheckCircle, XCircle, AlertCircle, Info } from 'lucide-react';

type AlertType = 'success' | 'error' | 'warning' | 'info';

export function Alert({ type, message }: { type: AlertType; message: string }) {
  const config = {
    success: { icon: CheckCircle, bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800', iconColor: 'text-green-500' },
    error: { icon: XCircle, bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', iconColor: 'text-red-500' },
    warning: { icon: AlertCircle, bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800', iconColor: 'text-amber-500' },
    info: { icon: Info, bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800', iconColor: 'text-blue-500' },
  };
  const { icon: Icon, bg, border, text, iconColor } = config[type];

  return (
    <div className={`flex items-start gap-2.5 rounded-lg ${bg} border ${border} px-4 py-3`}>
      <Icon size={18} className={`${iconColor} flex-shrink-0 mt-0.5`} />
      <p className={`text-sm ${text} font-medium`}>{message}</p>
    </div>
  );
}

export function StatCard({ icon, label, value, color }: { icon: ReactNode; label: string; value: string | number; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500 font-medium">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
        </div>
        <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${color}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}
