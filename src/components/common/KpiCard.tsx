/**
 * FireScope — KPI Metric Card Component
 * Strictly complies with Scientific & SaaS Typographic & Tabular Guidelines
 */

import React from 'react';
import { LucideIcon } from 'lucide-react';

interface KpiCardProps {
  label: string;
  value: string | number;
  unit?: string;
  subtext?: string;
  icon?: LucideIcon;
  variant?: 'default' | 'accent' | 'warning';
}

export const KpiCard: React.FC<KpiCardProps> = ({
  label,
  value,
  unit,
  subtext,
  icon: Icon,
  variant = 'default',
}) => {
  const accentStyles = {
    default: 'text-neutral-100',
    accent: 'text-amber-400',
    warning: 'text-rose-400',
  }[variant];

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 flex flex-col justify-between">
      <div className="flex items-center justify-between text-neutral-400 text-xs font-medium">
        <span className="truncate">{label}</span>
        {Icon && <Icon className="w-4 h-4 text-neutral-400 shrink-0" />}
      </div>

      <div className="mt-3 flex items-baseline gap-1.5">
        <span className={`text-2xl font-bold font-mono tabular-nums tracking-tight ${accentStyles}`}>
          {value}
        </span>
        {unit && (
          <span className="text-xs uppercase font-mono text-neutral-400 font-medium">
            {unit}
          </span>
        )}
      </div>

      {subtext && (
        <div className="mt-2 text-[11px] text-neutral-400 truncate">
          {subtext}
        </div>
      )}
    </div>
  );
};
