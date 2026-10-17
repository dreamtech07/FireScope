/**
 * FireScope — Collapsible Navigation Sidebar
 */

import React from 'react';
import {
  LayoutDashboard,
  Map,
  Table,
  ListOrdered,
  GitCompare,
  CheckCircle2,
  Settings,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  BarChart3,
  Layers,
} from 'lucide-react';

export type NavTab = 
  | 'overview'
  | 'fire_map'
  | 'observations'
  | 'priority_queue'
  | 'satellite_comparison'
  | 'contextual_evidence'
  | 'historical_analysis'
  | 'evaluation'
  | 'settings';

interface SidebarProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  queueCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  collapsed,
  onToggleCollapse,
  queueCount,
}) => {
  const navItems = [
    { id: 'overview' as NavTab, label: 'Overview', icon: LayoutDashboard },
    { id: 'fire_map' as NavTab, label: 'Fire Map', icon: Map },
    { id: 'observations' as NavTab, label: 'Observations', icon: Table },
    { id: 'priority_queue' as NavTab, label: 'Priority Queue', icon: ListOrdered, badge: queueCount },
    { id: 'satellite_comparison' as NavTab, label: 'Satellite Comparison', icon: GitCompare },
    { id: 'contextual_evidence' as NavTab, label: 'Contextual Evidence', icon: Layers },
    { id: 'historical_analysis' as NavTab, label: 'Historical Analysis', icon: BarChart3 },
    { id: 'evaluation' as NavTab, label: 'Evaluation', icon: CheckCircle2 },
    { id: 'settings' as NavTab, label: 'Settings', icon: Settings },
  ];

  return (
    <aside
      className={`bg-neutral-950 border-r border-neutral-800 transition-all duration-200 flex flex-col justify-between select-none shrink-0 ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      <div>
        {/* Navigation list */}
        <div className="py-3 px-2 space-y-1">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium transition-colors text-left relative ${
                  isActive
                    ? 'bg-neutral-900 text-amber-400 border border-neutral-800'
                    : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/50'
                }`}
                title={collapsed ? item.label : undefined}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-amber-500' : 'text-neutral-400'}`} />
                {!collapsed && (
                  <span className="truncate flex-1">{item.label}</span>
                )}
                {!collapsed && item.badge !== undefined && item.badge > 0 && (
                  <span className="text-[10px] font-mono tabular-nums text-amber-500 font-semibold px-1.5 py-0.2 bg-amber-500/10 rounded border border-amber-500/20">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Sidebar Footer & Collapse Toggle */}
      <div className="p-3 border-t border-neutral-900 space-y-2">
        {!collapsed && (
          <div className="px-2 py-2 text-[11px] text-neutral-400 space-y-1">
            <div className="flex items-center gap-1.5 text-neutral-400">
              <ShieldCheck className="w-3.5 h-3.5 text-neutral-400" />
              <span>Analyst Triage Engine</span>
            </div>
            <p className="text-[10px] text-neutral-400 leading-tight">
              FireScope v1.0.0
              <br />NASA FIRMS / VIIRS & MODIS
            </p>
          </div>
        )}

        <button
          onClick={onToggleCollapse}
          className="w-full flex items-center justify-center p-1.5 rounded-md text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900 transition-colors"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : (
            <div className="flex items-center gap-2 text-xs">
              <ChevronLeft className="w-4 h-4" />
              <span>Collapse</span>
            </div>
          )}
        </button>
      </div>
    </aside>
  );
};
